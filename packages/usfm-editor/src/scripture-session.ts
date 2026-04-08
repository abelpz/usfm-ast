/**
 * Orchestrates {@link DocumentStore}, windowed ProseMirror, alignment data, undo, and optional sync.
 */

import { parseUsxToUsjDocument, usjDocumentToUsx } from '@usfm-tools/adapters';
import {
  DefaultSyncEngine,
  DocumentStore,
  HeadlessCollabSession,
  OperationJournal,
  RealtimeSyncEngine,
  collectVerseTextsFromContent,
  reconcileAlignments,
  rebuildAlignedUsj,
  stripAlignments,
  transformOpLists,
  type Operation,
  type PersistenceAdapter,
  type RealtimeTransport,
  type SyncEngine,
  type UsjDocument,
} from '@usfm-tools/editor-core';
import type { AlignmentGroup, AlignmentMap, EditableUSJ } from '@usfm-tools/types';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';

import { createUSFMPlugins } from './editor';
import { resolveUSFMChrome, type USFMEditorChrome } from './chrome';
import { usfmSchema } from './schema';
import { createAwarenessPlugin } from './plugins/awareness';
import { readonlyChapterGuardPlugin } from './plugins/readonly-guard';
import { chapterNumberFromPmChapter } from './chapter-position-map';
import {
  chapterSubsetToPm,
  classifyPreChapterNodes,
  expandChaptersWithContext,
  partitionContent,
} from './usj-to-pm';
import {
  pmDocumentToUsj,
  pmChapterToUsjNodes,
  preChapterPmSectionsToUsjNodes,
} from './pm-to-usj';
import type { Plugin } from 'prosemirror-state';
import type { ScripturePlugin } from './scripture-plugin';
import type { Transaction } from 'prosemirror-state';

export type { SectionId } from './scripture-plugin';

function chapterFromVerseSid(sid: string): number | undefined {
  const m = sid.trim().match(/(\d+):(\d+)\s*$/);
  if (!m) return undefined;
  return parseInt(m[1]!, 10);
}

export interface ScriptureSessionOptions {
  maxVisibleChapters?: number;
  contextChapters?: number;
  chrome?: USFMEditorChrome;
  persistence?: PersistenceAdapter;
  syncEngine?: SyncEngine;
  plugins?: ScripturePlugin[];
  /** Extra ProseMirror plugins (e.g. {@link markerPaletteKeymap}) inserted after defaults. */
  extraProseMirrorPlugins?: Plugin[];
  userId?: string;
  /** Reuse a {@link HeadlessCollabSession} (store + journal + sync). */
  headlessSession?: HeadlessCollabSession;
  /** Real-time collaboration: creates a headless session with this transport unless {@link headlessSession} is set. */
  realtime?: { transport: RealtimeTransport; roomId?: string };
}

export class ScriptureSession {
  readonly store: DocumentStore;
  readonly contentView: EditorView;
  /** Max editable chapters in the window (from options). */
  readonly maxVisibleChapters: number;
  private alignments: AlignmentMap = {};
  private visibleChapters: number[] = [1];
  private showIntroduction = false;
  private contextChapters = 1;
  private readonly journal: OperationJournal;
  readonly sync: SyncEngine;
  private readonly headless: HeadlessCollabSession | null;
  private readonly pluginList: ScripturePlugin[];
  private readonly opts: ScriptureSessionOptions;
  private changeListeners: Array<() => void> = [];
  private sectionListeners: Array<(s: import('./scripture-plugin').SectionId[]) => void> = [];
  private alignmentListeners: Array<(verseRef: string) => void> = [];
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    place: ConstructorParameters<typeof EditorView>[0],
    options: ScriptureSessionOptions = {}
  ) {
    this.opts = options;
    this.maxVisibleChapters = options.maxVisibleChapters ?? 50;
    this.contextChapters = options.contextChapters ?? 1;
    this.pluginList = options.plugins ?? [];

    if (options.headlessSession) {
      this.headless = options.headlessSession;
      this.store = this.headless.store;
      this.journal = this.headless.journal;
      this.sync = options.syncEngine ?? this.headless.sync;
    } else if (options.realtime) {
      this.headless = new HeadlessCollabSession({
        userId: options.userId ?? 'local',
        persistence: options.persistence,
        realtimeTransport: options.realtime.transport,
        roomId: options.realtime.roomId,
      });
      this.store = this.headless.store;
      this.journal = this.headless.journal;
      this.sync = options.syncEngine ?? this.headless.sync;
      void this.headless.connect(options.realtime.roomId);
    } else {
      this.headless = null;
      this.store = new DocumentStore({ silentConsole: true });
      this.journal = new OperationJournal(options.persistence, options.userId ?? 'local');
      this.sync = options.syncEngine ?? new DefaultSyncEngine();
    }

    const chrome = resolveUSFMChrome(options.chrome);
    const awarenessExtra: Plugin[] = [];
    if (this.headless && (options.realtime || options.headlessSession)) {
      const rtSync = options.syncEngine ?? this.headless.sync;
      if (rtSync instanceof RealtimeSyncEngine) {
        awarenessExtra.push(
          createAwarenessPlugin({
            onLocalPresence: (p) => {
              rtSync.updateLocalPresence(undefined, {
                chapter: p.chapter,
                from: p.from,
                to: p.to,
              });
            },
          })
        );
      }
    }

    const plugins = [
      ...createUSFMPlugins(usfmSchema, { chrome }),
      readonlyChapterGuardPlugin(),
      ...awarenessExtra,
      ...(options.extraProseMirrorPlugins ?? []),
    ];

    const state = EditorState.create({
      doc: chapterSubsetToPm(this.store, this.subsetOptions()),
      schema: usfmSchema,
      plugins,
    });

    this.contentView = new EditorView(place, {
      state,
      dispatchTransaction: (tr) => {
        this.dispatchTransaction(tr);
      },
    });

    for (const p of this.pluginList) {
      p.onLoad?.(this);
    }
    void this.journal.loadFromDisk();
    this.loadAlignmentsFromDocument();
  }

  private subsetOptions() {
    const max = this.maxVisibleChapters;
    const vis = this.visibleChapters.slice(0, max);
    return {
      visibleChapters: vis.length ? vis : [1],
      showIntroduction: this.showIntroduction,
      contextChapters: this.contextChapters,
    };
  }

  private dispatchTransaction(tr: Transaction): void {
    const oldState = this.contentView.state;
    const newState = oldState.apply(tr);
    if (tr.docChanged) {
      this.syncStoreFromPm(newState);
      this.schedulePersist();
    }
    this.contentView.updateState(newState);
    for (const p of this.pluginList) {
      p.onTransaction?.(this, tr);
    }
    if (tr.docChanged) {
      for (const l of this.changeListeners) l();
    }
  }

  private syncStoreFromPm(state: EditorState): void {
    const oldTexts = collectVerseTextsFromContent(
      this.store.getFullUSJ().content as unknown[]
    );

    const pm = state.doc;
    const pre = preChapterPmSectionsToUsjNodes(pm);
    if (pre.length > 0) {
      const full = this.store.getFullUSJ();
      const { header: storeHeader } = partitionContent(full.content);
      const storeC = classifyPreChapterNodes(storeHeader);
      const pmC = classifyPreChapterNodes(pre);
      const introOut = this.showIntroduction ? pmC.introduction : storeC.introduction;
      const ch0nodes = [...pmC.identification, ...pmC.bookTitles, ...introOut];
      this.store.replaceChapterNodes(0, ch0nodes);
    }

    pm.forEach((node) => {
      if (node.type.name === 'chapter' && !node.attrs.readonly) {
        const n = chapterNumberFromPmChapter(node);
        this.store.replaceChapterNodes(n, pmChapterToUsjNodes(node));
      }
    });

    const newTexts = collectVerseTextsFromContent(
      this.store.getFullUSJ().content as unknown[]
    );
    const allSids = new Set([...Object.keys(oldTexts), ...Object.keys(newTexts)]);
    let reconciled = false;
    for (const sid of allSids) {
      const o = oldTexts[sid] ?? '';
      const n = newTexts[sid] ?? '';
      if (o === n) continue;
      const groups = this.alignments[sid];
      if (!groups?.length) continue;
      const next = reconcileAlignments(o, n, groups);
      if (JSON.stringify(next) !== JSON.stringify(groups)) {
        this.alignments = { ...this.alignments, [sid]: next };
        reconciled = true;
        const g0 = next[0];
        if (g0) {
          this.journal.append(0, 'alignment', [
            { type: 'updateGroup', verseRef: sid, groupIndex: 0, group: g0 },
          ]);
        }
      }
    }
    if (reconciled) {
      this.pushAlignmentsToStore();
      for (const l of this.alignmentListeners) {
        for (const sid of allSids) {
          if ((oldTexts[sid] ?? '') !== (newTexts[sid] ?? '')) l(sid);
        }
      }
    }
  }

  /** Replace alignment map from the current document (e.g. after `loadUSFM`). */
  private loadAlignmentsFromDocument(): void {
    const { alignments } = stripAlignments(this.store.getFullUSJ() as UsjDocument);
    this.alignments = { ...alignments };
  }

  private pushAlignmentsToStore(): void {
    const max = this.store.getChapterCount();
    for (let ch = 1; ch <= max; ch++) {
      const map: AlignmentMap = {};
      for (const [sid, groups] of Object.entries(this.alignments)) {
        const c = chapterFromVerseSid(sid);
        if (c === ch) map[sid] = groups;
      }
      if (Object.keys(map).length > 0) {
        this.store.updateAlignments(ch, map);
      }
    }
  }

  private schedulePersist(): void {
    const p = this.opts.persistence;
    if (!p?.ready) return;
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = null;
      void this.flushSessionToPersistence();
    }, 2000);
  }

  private async flushSessionToPersistence(): Promise<void> {
    const p = this.opts.persistence;
    if (!p?.ready) return;
    try {
      await p.save('session/usj.json', JSON.stringify(this.store.getFullUSJ()));
      await p.save(
        'session/meta.json',
        JSON.stringify({
          visibleChapters: this.visibleChapters,
          showIntroduction: this.showIntroduction,
          contextChapters: this.contextChapters,
        })
      );
    } catch {
      /* ignore */
    }
  }


  /**
   * Rebuild the ProseMirror document from the store and current window options.
   *
   * Uses `EditorState.create`, which re-initializes plugins and **clears undo/redo**
   * (ProseMirror history is plugin state). Callers such as {@link setVisibleChapters}
   * therefore reset the stack; users who need to undo a structural edit should do so
   * before changing the chapter window. (A full-doc replace with `addToHistory: false`
   * is not used here: history still records mapping-only updates for such a replace,
   * which can break inverting older steps.)
   */
  rebuildEditorDoc(): void {
    const doc = chapterSubsetToPm(this.store, this.subsetOptions());
    const state = EditorState.create({
      doc,
      schema: usfmSchema,
      plugins: this.contentView.state.plugins,
    });
    this.contentView.updateState(state);
  }

  loadUSFM(usfm: string): void {
    this.store.loadUSFM(usfm);
    const n = this.store.getChapterCount();
    this.visibleChapters = n > 0 ? [1] : [1];
    this.rebuildEditorDoc();
    this.loadAlignmentsFromDocument();
  }

  loadUSJ(usj: UsjDocument): void {
    this.store.loadUSJ(usj);
    const n = this.store.getChapterCount();
    this.visibleChapters = n > 0 ? [1] : [1];
    this.rebuildEditorDoc();
    this.loadAlignmentsFromDocument();
  }

  /** Parse USX XML to USJ and load into the document store. */
  loadUSX(usxXml: string): void {
    const usj = parseUsxToUsjDocument(usxXml) as UsjDocument;
    this.loadUSJ(usj);
  }

  /** Serialize the full book as USX (via USFM round-trip). */
  toUSX(): string {
    return usjDocumentToUsx(this.store.getFullUSJ());
  }

  /**
   * Apply remote content operations with chapter-scoped OT against optional local pending ops.
   * Updates the {@link DocumentStore}; rebuilds the ProseMirror doc when the chapter is in the
   * current window (including context chapters).
   */
  applyRemoteContentOperations(
    chapter: number,
    remoteOps: Operation[],
    localPending: Operation[] = []
  ): { clientPrime: Operation[] } {
    const { clientPrime, serverPrime } = transformOpLists(localPending, remoteOps);
    this.store.applyOperations(serverPrime);
    const roles = this.getExpandedChapterRoles();
    const inWindow = chapter === 0 || roles.some((r) => r.chapter === chapter);
    if (inWindow) {
      this.rebuildEditorDoc();
    }
    this.loadAlignmentsFromDocument();
    for (const l of this.changeListeners) l();
    return { clientPrime };
  }

  getAlignments(): AlignmentMap {
    return { ...this.alignments };
  }

  getAlignmentsForVerse(verseRef: string): AlignmentGroup[] {
    return this.alignments[verseRef] ?? [];
  }

  /** Alignment groups keyed by verse `sid` for one chapter number. */
  getAlignmentsForChapter(chapter: number): Record<string, AlignmentGroup[]> {
    const out: Record<string, AlignmentGroup[]> = {};
    for (const [sid, groups] of Object.entries(this.alignments)) {
      if (chapterFromVerseSid(sid) === chapter) out[sid] = groups;
    }
    return out;
  }

  updateAlignment(verseRef: string, groups: AlignmentGroup[]): void {
    if (groups.length === 0) {
      const next = { ...this.alignments };
      delete next[verseRef];
      this.alignments = next;
    } else {
      this.alignments = { ...this.alignments, [verseRef]: groups };
    }
    const g0 = groups[0];
    if (g0) {
      this.journal.append(0, 'alignment', [
        { type: 'updateGroup', verseRef, groupIndex: 0, group: g0 },
      ]);
    }
    const ch = chapterFromVerseSid(verseRef);
    if (ch !== undefined) {
      const map: AlignmentMap = {};
      for (const [sid, g] of Object.entries(this.alignments)) {
        if (chapterFromVerseSid(sid) === ch) map[sid] = g;
      }
      this.store.updateAlignments(ch, map);
    }
    for (const l of this.alignmentListeners) l(verseRef);
  }

  getVisibleSections(): import('./scripture-plugin').SectionId[] {
    const out: import('./scripture-plugin').SectionId[] = [];
    if (this.showIntroduction) out.push({ type: 'introduction' });
    for (const c of this.visibleChapters) {
      out.push({ type: 'chapter', chapter: c });
    }
    return out;
  }

  setVisibleChapters(chapters: number[]): void {
    const prev = this.getVisibleSections();
    const max = this.store.getChapterCount();
    this.visibleChapters = chapters.filter((c) => c >= 1 && c <= max);
    if (this.visibleChapters.length === 0 && max >= 1) this.visibleChapters = [1];
    this.rebuildEditorDoc();
    const next = this.getVisibleSections();
    for (const p of this.pluginList) {
      p.onSectionChange?.(this, prev, next);
    }
    for (const l of this.sectionListeners) l(next);
  }

  setIntroductionVisible(visible: boolean): void {
    const prev = this.getVisibleSections();
    this.showIntroduction = visible;
    this.rebuildEditorDoc();
    for (const p of this.pluginList) {
      p.onSectionChange?.(this, prev, this.getVisibleSections());
    }
  }

  isIntroductionVisible(): boolean {
    return this.showIntroduction;
  }

  getChapterCount(): number {
    return this.store.getChapterCount();
  }

  /** User-selected editable chapter numbers (not including auto context). */
  getVisibleChapterNumbers(): number[] {
    return [...this.visibleChapters];
  }

  /** Context radius before/after the selection (see {@link ChapterSubsetToPmOptions.contextChapters}). */
  getContextChapterRadius(): number {
    return this.contextChapters;
  }

  /** All chapters currently mounted in the ProseMirror doc, with read-only flags for context. */
  getExpandedChapterRoles(): { chapter: number; readonly: boolean }[] {
    const maxChapter = this.store.getChapterCount();
    let selected = [...this.visibleChapters]
      .filter((c) => c >= 1 && c <= maxChapter)
      .slice(0, this.maxVisibleChapters);
    if (selected.length === 0 && maxChapter >= 1) selected = [1];
    return expandChaptersWithContext(selected, this.contextChapters, maxChapter);
  }

  toUSFM(chapter?: number): string {
    return this.store.toUSFM(chapter);
  }

  toUSJ(chapter?: number): UsjDocument {
    if (chapter === undefined) {
      return this.store.getFullUSJ();
    }
    const slice = this.store.getChapter(chapter);
    if (!slice) {
      return { type: 'USJ', version: this.store.getVersion(), content: [] };
    }
    return {
      type: 'USJ',
      version: this.store.getVersion(),
      content: slice.nodes as UsjDocument['content'],
    };
  }

  toUSJWithAlignments(): UsjDocument {
    const usj = pmDocumentToUsj(this.contentView.state.doc);
    const editable: EditableUSJ = {
      type: 'EditableUSJ',
      version: usj.version,
      content: usj.content as EditableUSJ['content'],
    };
    return rebuildAlignedUsj(editable, this.alignments);
  }

  async runSync(): Promise<import('@usfm-tools/editor-core').SyncResult> {
    const result = await this.sync.sync();
    for (const p of this.pluginList) {
      p.onSync?.(this, result);
    }
    return result;
  }

  onChange(fn: () => void): () => void {
    this.changeListeners.push(fn);
    return () => {
      const i = this.changeListeners.indexOf(fn);
      if (i >= 0) this.changeListeners.splice(i, 1);
    };
  }

  onVisibleSectionsChange(
    fn: (sections: import('./scripture-plugin').SectionId[]) => void
  ): () => void {
    this.sectionListeners.push(fn);
    return () => {
      const i = this.sectionListeners.indexOf(fn);
      if (i >= 0) this.sectionListeners.splice(i, 1);
    };
  }

  onAlignmentChange(fn: (verseRef: string) => void): () => void {
    this.alignmentListeners.push(fn);
    return () => {
      const i = this.alignmentListeners.indexOf(fn);
      if (i >= 0) this.alignmentListeners.splice(i, 1);
    };
  }

  destroy(): void {
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    void this.flushSessionToPersistence();
    for (const p of this.pluginList) {
      p.destroy?.();
    }
    this.headless?.destroy();
    this.contentView.destroy();
  }
}

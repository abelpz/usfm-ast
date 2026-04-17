/**
 * Orchestrates {@link DocumentStore}, windowed ProseMirror, alignment data, undo, and optional sync.
 */

import {
  convertUSJDocumentToUSFM,
  parseUsxToUsjDocument,
  usjDocumentToUsx,
} from '@usfm-tools/adapters';
import {
  alignmentDocumentSourceKey,
  alignmentWordSurfacesEqual,
  checkSourceCompatibility,
  matchSourceToExistingAlignments,
  createAlignmentDocument,
  DefaultSyncEngine,
  DocumentStore,
  HeadlessCollabSession,
  OperationJournal,
  parseAlignmentJson,
  splitUsjByChapter,
  parseAlignmentSource,
  parseDocumentIdentityFromUsj,
  RealtimeSyncEngine,
  collectVerseTextsFromContent,
  reconcileAlignments,
  rebuildAlignedUsj,
  setAlignmentSource,
  stripAlignments,
  tokenizeOriginalDocument,
  tokenizeTranslationDocument,
  transformOpLists,
  withAlignmentVerses,
  type ChapterConflict,
  type JournalRemoteTransport,
  type JournalStore,
  type MergeStrategy,
  type Operation,
  type OriginalWordToken,
  type PersistenceAdapter,
  type RealtimeTransport,
  type SourceCompatibility,
  type SyncEngine,
  type UsjDocument,
  type WordToken,
} from '@usfm-tools/editor-core';
import type {
  AlignmentDocument,
  AlignmentGroup,
  AlignmentMap,
  EditableUSJ,
} from '@usfm-tools/types';
import { EditorState, type Plugin, type Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { keymap } from 'prosemirror-keymap';
import type { Node as PMNode } from 'prosemirror-model';

import { resolveChapterLabelAction } from './chapter-label-policy';
import { nextChapterNumberForSelection } from './chapter-number';
import { insertNextChapter } from './commands';
import {
  createUSFMPlugins,
  usfmChromeDomAttributes,
  type ChapterLabelCommitContext,
} from './editor';
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
  type EditorContentPage,
} from './usj-to-pm';
import {
  pmDocumentToUsj,
  pmChapterToUsjNodes,
  preChapterPmSectionsToUsjNodes,
} from './pm-to-usj';
import type { ScripturePlugin } from './scripture-plugin';
import { USFMParser } from '@usfm-tools/parser';
import { DefaultMarkerRegistry, type MarkerRegistry } from './marker-registry';

export type { SectionId } from './scripture-plugin';

/** Options for {@link ScriptureSession.toUSFM} when choosing which alignment layer to embed. */
export type ToUsfmAlignmentOptions = {
  /**
   * Which loaded alignment document to embed (`\\zaln-s` / `\\w`).
   * - Omitted: use the {@link ScriptureSession.getActiveAlignmentDocumentKey active} document.
   * - `null`: plain gateway USFM (no alignment milestones).
   */
  embedAlignmentSourceKey?: string | null;
  /**
   * When true, `\\rem alignment-source:` is written from the document last passed to
   * {@link loadAlignmentSource} (`\\id` line) instead of the active alignment document’s stored
   * source party. Use after re-aligning against a different reference than the original file.
   *
   * If that reference’s identity does not match the translation’s previous alignment source
   * (`\\rem` vs loaded `\\id`), exported milestones are limited to verses edited after the
   * reference was loaded; other verses are exported without alignment markup.
   */
  embedAlignmentProvenanceFromLoadedSource?: boolean;
};

/**
 * A ghost chapter is considered empty (and safe to delete) when it contains no verse
 * nodes.  Scripture content always requires at least one `\\v` marker; without one the
 * chapter was never meaningfully edited by the user.
 */
function ghostChapterIsEmpty(nodes: unknown[]): boolean {
  function hasVerse(n: unknown): boolean {
    const obj = n as { type?: string; content?: unknown[] };
    if (obj.type === 'verse') return true;
    if (Array.isArray(obj.content)) return obj.content.some(hasVerse);
    return false;
  }
  return !nodes.some(hasVerse);
}

function chapterFromVerseSid(sid: string): number | undefined {
  const m = sid.trim().match(/(\d+):(\d+)\s*$/);
  if (!m) return undefined;
  return parseInt(m[1]!, 10);
}

/** Normalize verse `sid` for dictionary lookup (translation vs alignment source key mismatch). */
function normalizeVerseSidKey(sid: string): string {
  return sid.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
}

/**
 * Find a key in the alignment source map that matches `sid` (exact, else case/space-insensitive).
 */
function resolveAlignmentSourceSid(
  map: Record<string, OriginalWordToken[]>,
  sid: string,
): string | null {
  if (Object.prototype.hasOwnProperty.call(map, sid)) return sid;
  const want = normalizeVerseSidKey(sid);
  for (const k of Object.keys(map)) {
    if (normalizeVerseSidKey(k) === want) return k;
  }
  // Same chapter:verse but different book prefix (e.g. "TIT 1:1" vs "el-x-koine/ugnt TIT 1:1")
  const mWant = sid.trim().match(/(\d+):(\d+)\s*$/);
  if (mWant) {
    const ch = mWant[1]!;
    const vs = mWant[2]!;
    const candidates = Object.keys(map).filter((k) => {
      const m = k.trim().match(/(\d+):(\d+)\s*$/);
      return m && m[1] === ch && m[2] === vs;
    });
    if (candidates.length === 1) return candidates[0]!;
  }
  return null;
}

export interface ScriptureSessionOptions {
  maxVisibleChapters?: number;
  contextChapters?: number;
  /**
   * When true, the editor shows one "page" at a time: book identification, introduction, or a
   * single chapter (see {@link ScriptureSession.setContentPage}). Default false for backward compatibility.
   */
  paginatedEditor?: boolean;
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
  /** Passed to {@link HeadlessCollabSession} when {@link realtime} creates it (ignored if {@link headlessSession} is set). */
  journalStore?: JournalStore;
  remoteTransport?: JournalRemoteTransport;
  mergeStrategy?: MergeStrategy;
  onConflict?: (conflict: ChapterConflict) => 'accept-local' | 'accept-remote' | 'manual';
  markerRegistry?: MarkerRegistry;
  /**
   * Override default chapter-label blur behavior (empty label merge, relocate on valid number).
   * Use {@link DocumentStore.mergeChapterIntoPrevious}, {@link DocumentStore.relocateChapterNumber},
   * {@link ScriptureSession.rebuildEditorDoc}, {@link ScriptureSession.setContentPage},
   * {@link ScriptureSession.refreshAlignmentsFromStore} as needed.
   */
  onChapterLabelCommit?: (ctx: ChapterLabelCommitContext, session: ScriptureSession) => void;
}

export class ScriptureSession {
  private static readonly EMBEDDED_ALIGNMENT_KEY = '__embedded__';

  readonly store: DocumentStore;
  readonly contentView: EditorView;
  /** Max editable chapters in the window (from options). */
  readonly maxVisibleChapters: number;
  /** One page at a time (identification / introduction / chapter). */
  readonly paginatedEditor: boolean;
  /** Marker palette and structure helpers. */
  readonly markers: MarkerRegistry;
  /** One document per source identity; {@link EMBEDDED_ALIGNMENT_KEY} holds alignments from loaded USFM. */
  private alignmentDocs = new Map<string, AlignmentDocument>();
  /** Edits apply to this key; `null` means {@link EMBEDDED_ALIGNMENT_KEY}. */
  private activeAlignmentKey: string | null = null;
  private visibleChapters: number[] = [1];
  private showIntroduction = false;
  private contextChapters = 1;
  /** Current "page" when {@link paginatedEditor} is true. */
  private contentPage: EditorContentPage = { kind: 'chapter', chapter: 1 };
  private readonly journal: OperationJournal;
  readonly sync: SyncEngine;
  private readonly headless: HeadlessCollabSession | null;
  private readonly pluginList: ScripturePlugin[];
  private readonly opts: ScriptureSessionOptions;
  private changeListeners: Array<() => void> = [];
  private sectionListeners: Array<(s: import('./scripture-plugin').SectionId[]) => void> = [];
  private alignmentListeners: Array<(verseRef: string) => void> = [];
  /** Load/switch alignment document layers (not per-verse edits). */
  private alignmentDocumentListeners: Array<() => void> = [];
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Chapter numbers that were created temporarily for reference navigation and
   * should be deleted if the user navigates away without adding content.
   */
  private ghostChapters: Set<number> = new Set();

  private alignmentSourceTokens: Record<string, OriginalWordToken[]> = {};
  private alignmentSourceCompatibility: SourceCompatibility | null = null;
  private alignmentSourceActive = false;
  /** Last USJ passed to {@link loadAlignmentSource} (for export `\\rem` override). */
  private alignmentSourceUsj: UsjDocument | null = null;
  /**
   * Verse `sid`s (normalized) that received an alignment edit while a reference source was loaded.
   * Used when exporting with {@link ToUsfmAlignmentOptions.embedAlignmentProvenanceFromLoadedSource}
   * after switching to a different alignment document than the file had: only these verses keep milestones.
   */
  private verseSidsAlignedWithLoadedSource = new Set<string>();

  constructor(
    place: ConstructorParameters<typeof EditorView>[0],
    options: ScriptureSessionOptions = {}
  ) {
    this.opts = options;
    this.maxVisibleChapters = options.maxVisibleChapters ?? 50;
    this.contextChapters = options.contextChapters ?? 1;
    this.paginatedEditor = options.paginatedEditor ?? false;
    this.pluginList = options.plugins ?? [];
    this.markers = options.markerRegistry ?? new DefaultMarkerRegistry();

    if (options.headlessSession) {
      this.headless = options.headlessSession;
      this.store = this.headless.store;
      this.journal = this.headless.journal;
      this.sync = options.syncEngine ?? this.headless.sync;
    } else if (options.realtime) {
      this.headless = new HeadlessCollabSession({
        userId: options.userId ?? 'local',
        persistence: options.persistence,
        journalStore: options.journalStore,
        remoteTransport: options.remoteTransport,
        mergeStrategy: options.mergeStrategy,
        onConflict: options.onConflict,
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

    /** Runs before {@link createUSFMPlugins} keymaps so Mod-Shift-c respects store collision rules. */
    const paginatedChapterKeymap: Plugin | null = this.paginatedEditor
      ? keymap({
          'Mod-Shift-c': (st, dispatch) => this.handleInsertNextChapterKeymap(st, dispatch),
        })
      : null;

    const plugins = [
      ...(paginatedChapterKeymap ? [paginatedChapterKeymap] : []),
      ...createUSFMPlugins(usfmSchema, {
        chrome,
        chapterLabelHooks: {
          onCommit: (ctx) => {
            const custom = this.opts.onChapterLabelCommit;
            if (custom) {
              custom(ctx, this);
            } else {
              this.defaultChapterLabelCommit(ctx);
            }
          },
        },
      }),
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
      attributes: usfmChromeDomAttributes(options.chrome),
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

  /**
   * Sets `lang` and `dir` on the ProseMirror root for correct RTL/LTR block layout
   * (verse markers, paragraph alignment).
   */
  applyLanguage(opts: { lang?: string; dir: 'ltr' | 'rtl' }): void {
    const root = this.contentView.dom as HTMLElement;
    if (opts.lang) root.setAttribute('lang', opts.lang);
    else root.removeAttribute('lang');
    root.setAttribute('dir', opts.dir);
  }

  private subsetOptions() {
    if (this.paginatedEditor) {
      return {
        visibleChapters:
          this.contentPage.kind === 'chapter' ? [this.contentPage.chapter] : [],
        showIntroduction: false,
        contextChapters: this.contentPage.kind === 'chapter' ? this.contextChapters : 0,
        contentPage: this.contentPage,
      };
    }
    const max = this.maxVisibleChapters;
    const vis = this.visibleChapters.slice(0, max);
    return {
      visibleChapters: vis.length ? vis : [1],
      showIntroduction: this.showIntroduction,
      contextChapters: this.contextChapters,
    };
  }

  private getActiveVerses(): AlignmentMap {
    const key = this.activeAlignmentKey ?? ScriptureSession.EMBEDDED_ALIGNMENT_KEY;
    const doc = this.alignmentDocs.get(key);
    return doc ? { ...doc.verses } : {};
  }

  private seedEmbeddedAlignmentDocument(verses: AlignmentMap): void {
    const transId =
      parseDocumentIdentityFromUsj(this.store.getFullUSJ() as UsjDocument) ?? 'UNK';
    const srcRef = parseAlignmentSource(this.store.getFullUSJ() as UsjDocument);
    const source = srcRef ? { id: srcRef.identifier, version: srcRef.version } : { id: 'embedded' };
    this.alignmentDocs.set(
      ScriptureSession.EMBEDDED_ALIGNMENT_KEY,
      createAlignmentDocument({ id: transId }, source, verses)
    );
    if (this.activeAlignmentKey === null) {
      this.activeAlignmentKey = ScriptureSession.EMBEDDED_ALIGNMENT_KEY;
    }
  }

  private mergeIntoEmbeddedVerses(alignments: AlignmentMap): void {
    if (Object.keys(alignments).length === 0) return;
    const embKey = ScriptureSession.EMBEDDED_ALIGNMENT_KEY;
    const emb = this.alignmentDocs.get(embKey);
    if (emb) {
      this.alignmentDocs.set(embKey, withAlignmentVerses(emb, { ...emb.verses, ...alignments }));
    } else {
      this.seedEmbeddedAlignmentDocument(alignments);
    }
  }

  private replaceActiveVerses(updater: (current: AlignmentMap) => AlignmentMap): void {
    const key = this.activeAlignmentKey ?? ScriptureSession.EMBEDDED_ALIGNMENT_KEY;
    if (!this.alignmentDocs.has(key)) {
      this.seedEmbeddedAlignmentDocument({});
    }
    const doc = this.alignmentDocs.get(key)!;
    this.alignmentDocs.set(key, withAlignmentVerses(doc, updater({ ...doc.verses })));
  }

  /**
   * When exporting with provenance from the loaded reference, drop milestones for verses that still
   * carry embedded alignments from a different source unless the user edited that verse after
   * {@link loadAlignmentSource}. Triggered only when {@link checkSourceCompatibility} reports
   * {@link SourceCompatibility.compatible} false (translation `\\rem` / identity does not match the
   * loaded document’s `\\id`), not for same-source partial word-level drift.
   */
  private shouldFilterExportMapToVersesAlignedWithLoadedSource(
    options?: ToUsfmAlignmentOptions
  ): boolean {
    if (!options?.embedAlignmentProvenanceFromLoadedSource || !this.alignmentSourceUsj) return false;
    const compat = this.alignmentSourceCompatibility;
    if (!compat) return false;
    return !compat.compatible;
  }

  private alignmentMapForExport(options?: ToUsfmAlignmentOptions): AlignmentMap {
    if (options?.embedAlignmentSourceKey === null) return {};
    const key =
      options?.embedAlignmentSourceKey ??
      this.activeAlignmentKey ??
      ScriptureSession.EMBEDDED_ALIGNMENT_KEY;
    const doc = this.alignmentDocs.get(key);
    let map = doc ? { ...doc.verses } : {};
    if (this.shouldFilterExportMapToVersesAlignedWithLoadedSource(options)) {
      const next: AlignmentMap = {};
      for (const [sid, groups] of Object.entries(map)) {
        if (this.verseSidsAlignedWithLoadedSource.has(normalizeVerseSidKey(sid))) {
          next[sid] = groups;
        }
      }
      map = next;
    }
    return map;
  }

  private applyAlignmentProvenance(
    rebuilt: { type: 'USJ'; version: string; content: unknown[] },
    map: AlignmentMap,
    options?: ToUsfmAlignmentOptions
  ): { type: 'USJ'; version: string; content: unknown[] } {
    const hasAlignments = Object.keys(map).length > 0;

    if (options?.embedAlignmentProvenanceFromLoadedSource && this.alignmentSourceUsj) {
      const idLine = parseDocumentIdentityFromUsj(this.alignmentSourceUsj);
      if (idLine) {
        rebuilt = setAlignmentSource(rebuilt as UsjDocument, {
          identifier: idLine,
        }) as { type: 'USJ'; version: string; content: unknown[] };
      }
      return rebuilt;
    }

    if (!hasAlignments) return rebuilt;

    const key =
      options?.embedAlignmentSourceKey ??
      this.activeAlignmentKey ??
      ScriptureSession.EMBEDDED_ALIGNMENT_KEY;
    const doc = this.alignmentDocs.get(key);
    if (!doc) return rebuilt;
    const rawVer = doc.source.version;
    const version =
      rawVer === undefined || rawVer === ''
        ? undefined
        : String(rawVer).replace(/^v/i, '');
    return setAlignmentSource(rebuilt as UsjDocument, {
      identifier: doc.source.id,
      version,
    }) as { type: 'USJ'; version: string; content: unknown[] };
  }

  private dispatchTransaction(tr: Transaction): void {
    const oldState = this.contentView.state;
    const newState = oldState.apply(tr);
    let insertedChapter: number | null = null;
    if (tr.docChanged && this.paginatedEditor) {
      const before = this.writableChapterNumbersFromPm(oldState.doc);
      const after = this.writableChapterNumbersFromPm(newState.doc);
      for (const n of after) {
        if (!before.has(n)) insertedChapter = n;
      }
    }
    if (tr.docChanged) {
      this.syncStoreFromPm(newState);
      this.schedulePersist();
    }

    if (insertedChapter !== null) {
      this.setContentPage({ kind: 'chapter', chapter: insertedChapter });
      for (const p of this.pluginList) {
        p.onTransaction?.(this, tr);
      }
      return;
    }

    this.contentView.updateState(newState);
    for (const p of this.pluginList) {
      p.onTransaction?.(this, tr);
    }
    if (tr.docChanged) {
      for (const l of this.changeListeners) l();
    }
  }

  private writableChapterNumbersFromPm(doc: PMNode): Set<number> {
    const s = new Set<number>();
    doc.forEach((node) => {
      if (node.type.name === 'chapter' && !node.attrs.readonly) {
        s.add(chapterNumberFromPmChapter(node));
      }
    });
    return s;
  }

  /**
   * Whether {@link insertNextChapter} may run: the next chapter number implied by the current
   * ProseMirror slice must not already exist in the full {@link store} (paginated views only show
   * one chapter, so `next = max(pm)+1` can collide with an existing chapter N+1).
   */
  canInsertNextChapter(): boolean {
    return this.canInsertNextChapterFromState(this.contentView.state);
  }

  /**
   * Insert the next chapter from the current selection when {@link canInsertNextChapter} is true.
   * Use from toolbar / palette instead of calling {@link insertNextChapter} directly so the
   * full-book collision rule is enforced in paginated mode.
   */
  tryInsertNextChapter(): boolean {
    if (!this.canInsertNextChapter()) return false;
    return insertNextChapter()(this.contentView.state, this.contentView.dispatch);
  }

  /** @internal Keymap handler: consume the binding when blocked so a lower keymap cannot insert. */
  private handleInsertNextChapterKeymap(
    st: EditorState,
    dispatch?: (tr: Transaction) => void
  ): boolean {
    if (!this.canInsertNextChapterFromState(st)) return true;
    if (!dispatch) return false;
    return insertNextChapter()(st, dispatch);
  }

  private canInsertNextChapterFromState(state: EditorState): boolean {
    const nextNum = parseInt(nextChapterNumberForSelection(state), 10);
    if (!Number.isFinite(nextNum) || nextNum < 1) return false;
    return this.store.getChapter(nextNum) === undefined;
  }

  private syncStoreFromPm(state: EditorState): void {
    const pm = state.doc;

    // Collect the chapter numbers being written (writable chapters only).
    const editedChapters: number[] = [];
    pm.forEach((node) => {
      if (node.type.name === 'chapter' && !node.attrs.readonly) {
        editedChapters.push(chapterNumberFromPmChapter(node));
      }
    });

    // Skip full-book deep-clone when no alignment data is active — reconciliation is a no-op.
    const needsAlignmentReconcile = this.isAlignmentSourceLoaded() && editedChapters.length > 0;

    // Snapshot old verse texts scoped to just the edited chapters (no full-book clone needed).
    let oldTexts: Record<string, string> = {};
    if (needsAlignmentReconcile) {
      const slices = this.store.getChapterSlicesRef();
      for (const ch of editedChapters) {
        const slice = slices.find((s) => s.chapter === ch);
        if (slice) {
          Object.assign(oldTexts, collectVerseTextsFromContent(slice.nodes));
        }
      }
    }

    const pre = preChapterPmSectionsToUsjNodes(pm);
    if (pre.length > 0) {
      const full = this.store.getFullUSJ();
      const { header: storeHeader } = partitionContent(full.content);
      const storeC = classifyPreChapterNodes(storeHeader);
      const pmC = classifyPreChapterNodes(pre);
      let ch0nodes: unknown[];
      if (this.paginatedEditor) {
        if (this.contentPage.kind === 'identification') {
          ch0nodes = [...pmC.identification, ...pmC.bookTitles, ...storeC.introduction];
        } else if (this.contentPage.kind === 'introduction') {
          ch0nodes = [...storeC.identification, ...storeC.bookTitles, ...pmC.introduction];
        } else {
          ch0nodes = [...storeC.identification, ...storeC.bookTitles, ...storeC.introduction];
        }
      } else {
        const introOut = this.showIntroduction ? pmC.introduction : storeC.introduction;
        ch0nodes = [...pmC.identification, ...pmC.bookTitles, ...introOut];
      }
      this.store.replaceChapterNodes(0, ch0nodes);
    }

    pm.forEach((node) => {
      if (node.type.name === 'chapter' && !node.attrs.readonly) {
        const n = chapterNumberFromPmChapter(node);
        this.store.upsertChapterNodes(n, pmChapterToUsjNodes(node));
      }
    });

    if (needsAlignmentReconcile) {
      // Snapshot new verse texts from only the edited chapters (still no full-book clone).
      let newTexts: Record<string, string> = {};
      const slicesAfter = this.store.getChapterSlicesRef();
      for (const ch of editedChapters) {
        const slice = slicesAfter.find((s) => s.chapter === ch);
        if (slice) {
          Object.assign(newTexts, collectVerseTextsFromContent(slice.nodes));
        }
      }
      this.reconcileAlignmentsForVerseTextDiff(oldTexts, newTexts);
    }
  }

  private reconcileAlignmentsForVerseTextDiff(
    oldTexts: Record<string, string>,
    newTexts: Record<string, string>
  ): void {
    const allSids = new Set([...Object.keys(oldTexts), ...Object.keys(newTexts)]);
    let reconciled = false;
    for (const sid of allSids) {
      const o = oldTexts[sid] ?? '';
      const n = newTexts[sid] ?? '';
      if (o === n) continue;
      const groups = this.getActiveVerses()[sid];
      if (!groups?.length) continue;
      const next = reconcileAlignments(o, n, groups);
      if (JSON.stringify(next) !== JSON.stringify(groups)) {
        this.replaceActiveVerses((m) => ({ ...m, [sid]: next }));
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

  /**
   * If the store still contains `zaln` / `\\w` alignment markup (e.g. after a remote merge), extract
   * groups into {@link alignments}. When the document is already stripped, keep the current map.
   */
  private loadAlignmentsFromDocument(): void {
    const { alignments } = stripAlignments(this.store.getFullUSJ() as UsjDocument);
    this.mergeIntoEmbeddedVerses(alignments);
  }

  /** Strip alignment milestones from the in-memory USJ so the store matches the editable editor. */
  private normalizeStoreToEditableUsj(): void {
    const full = this.store.getFullUSJ() as UsjDocument;
    const { editable, alignments } = stripAlignments(full);
    this.mergeIntoEmbeddedVerses(alignments);
    this.store.loadUSJ({
      type: 'USJ',
      version: editable.version,
      content: editable.content as UsjDocument['content'],
    });
  }

  private pushAlignmentsToStore(): void {
    const chaptersPresent = [
      ...new Set(
        splitUsjByChapter(this.store.getFullUSJ() as UsjDocument)
          .map((s) => s.chapter)
          .filter((c) => c > 0)
      ),
    ].sort((a, b) => a - b);
    for (const ch of chaptersPresent) {
      const map: AlignmentMap = {};
      for (const [sid, groups] of Object.entries(this.getActiveVerses())) {
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
   *
   * Always notifies {@link onChange} listeners: the visible slice can change (e.g. paginated page)
   * without a ProseMirror transaction, and UIs such as a live USFM mirror serialize from
   * {@link contentView}.
   */
  rebuildEditorDoc(): void {
    const doc = chapterSubsetToPm(this.store, this.subsetOptions());
    const state = EditorState.create({
      doc,
      schema: usfmSchema,
      plugins: this.contentView.state.plugins,
    });
    this.contentView.updateState(state);
    for (const l of this.changeListeners) l();
  }

  /**
   * Re-extract alignment groups from the current store USJ (call after structural edits).
   */
  refreshAlignmentsFromStore(): void {
    this.loadAlignmentsFromDocument();
  }

  /**
   * Default chapter-label blur policy: relocate on a valid unused number, merge when the label is
   * cleared, otherwise revert from the store. Apps can replace this via {@link ScriptureSessionOptions.onChapterLabelCommit}.
   */
  private defaultChapterLabelCommit(ctx: ChapterLabelCommitContext): void {
    const { view, labelPos, draftRaw, oldChapter: oldNum } = ctx;
    if (view !== this.contentView) return;
    const doc = view.state.doc;
    const label = doc.nodeAt(labelPos);
    if (!label || label.type.name !== 'chapter_label') return;
    const $ = doc.resolve(labelPos + 1);
    let chapterNode: PMNode | null = null;
    for (let d = $.depth; d > 0; d--) {
      const n = $.node(d);
      if (n.type.name === 'chapter') {
        chapterNode = n;
        break;
      }
    }
    if (!chapterNode) {
      this.rebuildEditorDoc();
      return;
    }

    const wasChapterPage =
      this.paginatedEditor && this.contentPage.kind === 'chapter' ? this.contentPage.chapter : null;

    const action = resolveChapterLabelAction(
      {
        draftRaw,
        oldChapter: oldNum,
        readonly: Boolean(chapterNode.attrs.readonly),
      },
      this.store
    );

    switch (action.type) {
      case 'noop':
      case 'revert':
        this.rebuildEditorDoc();
        return;
      case 'merge':
        if (!this.store.mergeChapterIntoPrevious(action.oldChapter)) {
          this.rebuildEditorDoc();
          return;
        }
        this.refreshAlignmentsFromStore();
        if (this.paginatedEditor && wasChapterPage === action.oldChapter) {
          if (action.oldChapter <= 1) {
            this.setContentPage({ kind: 'introduction' });
          } else {
            this.setContentPage({ kind: 'chapter', chapter: action.oldChapter - 1 });
          }
        } else {
          this.rebuildEditorDoc();
        }
        return;
      case 'relocate':
        if (!this.store.relocateChapterNumber(action.oldChapter, action.newChapter)) {
          this.rebuildEditorDoc();
          return;
        }
        this.refreshAlignmentsFromStore();
        if (this.paginatedEditor && wasChapterPage === action.oldChapter) {
          this.setContentPage({ kind: 'chapter', chapter: action.newChapter });
        } else {
          this.rebuildEditorDoc();
        }
        return;
    }
  }

  loadUSFM(usfm: string): void {
    this.clearAlignmentSource();
    this.store.loadUSFM(usfm);
    const { editable, alignments } = stripAlignments(this.store.getFullUSJ() as UsjDocument);
    this.store.loadUSJ({
      type: 'USJ',
      version: editable.version,
      content: editable.content as UsjDocument['content'],
    });
    this.alignmentDocs.clear();
    this.activeAlignmentKey = ScriptureSession.EMBEDDED_ALIGNMENT_KEY;
    const transId =
      parseDocumentIdentityFromUsj(this.store.getFullUSJ() as UsjDocument) ?? 'UNK';
    const srcRef = parseAlignmentSource(this.store.getFullUSJ() as UsjDocument);
    const source = srcRef ? { id: srcRef.identifier, version: srcRef.version } : { id: 'embedded' };
    this.alignmentDocs.set(
      ScriptureSession.EMBEDDED_ALIGNMENT_KEY,
      createAlignmentDocument({ id: transId }, source, alignments)
    );
    this.verseSidsAlignedWithLoadedSource.clear();
    const n = this.store.getChapterCount();
    const first = this.store.getFirstChapterNumber();
    this.visibleChapters = n > 0 ? [first] : [1];
    if (this.paginatedEditor) {
      this.contentPage = { kind: 'chapter', chapter: first };
    }
    this.rebuildEditorDoc();
  }

  /**
   * Apply USFM typed in the live source pane when {@link paginatedEditor} is on: the textarea only
   * holds the current page, so this merges that parse into the full book. Otherwise behaves like
   * {@link loadUSFM} (whole-document replace).
   */
  applyLiveUsfmFromVisibleWindow(usfm: string): void {
    if (!this.paginatedEditor) {
      this.loadUSFM(usfm);
      return;
    }
    const parser = new USFMParser({ silentConsole: true });
    const toDoc = (text: string): UsjDocument => {
      parser.parse(text);
      const raw = parser.toJSON() as UsjDocument;
      const { editable } = stripAlignments(raw);
      return {
        type: 'USJ',
        version: editable.version,
        content: editable.content as UsjDocument['content'],
      };
    };
    let parsed = toDoc(usfm);
    if (this.contentPage.kind === 'chapter') {
      const part = partitionContent(parsed.content as unknown[]);
      if (part.chapters.length === 0) {
        parsed = toDoc(`\\c ${this.contentPage.chapter}\n${usfm}`);
      }
    }

    // Determine the chapter number affected so we can scope the verse-text diff.
    const editedChapterNum =
      this.contentPage.kind === 'chapter' ? this.contentPage.chapter : null;
    const needsAlignmentReconcile = this.isAlignmentSourceLoaded() && editedChapterNum !== null;

    // Snapshot old verse texts for just this chapter before the merge (no full-book clone).
    let oldTexts: Record<string, string> = {};
    if (needsAlignmentReconcile) {
      const slice = this.store.getChapterSlicesRef().find((s) => s.chapter === editedChapterNum);
      if (slice) oldTexts = collectVerseTextsFromContent(slice.nodes);
    }

    this.mergeParsedVisibleUsfmIntoStore(parsed);
    this.normalizeStoreToEditableUsj();

    if (needsAlignmentReconcile) {
      // Snapshot new verse texts for the same chapter after the merge.
      const sliceAfter = this.store.getChapterSlicesRef().find((s) => s.chapter === editedChapterNum);
      const newTexts = sliceAfter ? collectVerseTextsFromContent(sliceAfter.nodes) : {};
      this.reconcileAlignmentsForVerseTextDiff(oldTexts, newTexts);
    }

    this.rebuildEditorDoc();
  }

  /** Merge a USJ parse of the visible paginated slice into {@link store} (identification / intro / one chapter). */
  private mergeParsedVisibleUsfmIntoStore(parsed: UsjDocument): void {
    const full = this.store.getFullUSJ() as UsjDocument;
    const { editable: fullEd } = stripAlignments(full);
    const storePart = partitionContent(fullEd.content as unknown[]);
    const parsedPart = partitionContent(parsed.content as unknown[]);
    const storeC = classifyPreChapterNodes(storePart.header);
    const parsedC = classifyPreChapterNodes(parsedPart.header);

    if (this.contentPage.kind === 'identification') {
      const ch0 = [...parsedC.identification, ...parsedC.bookTitles, ...storeC.introduction];
      this.store.replaceChapterNodes(0, ch0);
      return;
    }
    if (this.contentPage.kind === 'introduction') {
      const ch0 = [...storeC.identification, ...storeC.bookTitles, ...parsedC.introduction];
      this.store.replaceChapterNodes(0, ch0);
      return;
    }

    const chNum = this.contentPage.chapter;
    if (parsedPart.chapters.length === 0) return;

    let pair = parsedPart.chapters.find(
      (c) => parseInt(String(c.chapter.number ?? '1'), 10) === chNum
    );
    if (!pair && parsedPart.chapters.length === 1) {
      const only = parsedPart.chapters[0]!;
      pair = {
        chapter: { ...only.chapter, number: chNum },
        body: only.body,
      };
    }
    if (!pair) return;

    const nodes: unknown[] = [pair.chapter, ...pair.body];
    this.store.replaceChapterNodes(chNum, nodes);
  }

  loadUSJ(usj: UsjDocument): void {
    this.clearAlignmentSource();
    this.store.loadUSJ(usj);
    const { editable, alignments } = stripAlignments(this.store.getFullUSJ() as UsjDocument);
    this.store.loadUSJ({
      type: 'USJ',
      version: editable.version,
      content: editable.content as UsjDocument['content'],
    });
    this.alignmentDocs.clear();
    this.activeAlignmentKey = ScriptureSession.EMBEDDED_ALIGNMENT_KEY;
    const transId =
      parseDocumentIdentityFromUsj(this.store.getFullUSJ() as UsjDocument) ?? 'UNK';
    const srcRef = parseAlignmentSource(this.store.getFullUSJ() as UsjDocument);
    const source = srcRef ? { id: srcRef.identifier, version: srcRef.version } : { id: 'embedded' };
    this.alignmentDocs.set(
      ScriptureSession.EMBEDDED_ALIGNMENT_KEY,
      createAlignmentDocument({ id: transId }, source, alignments)
    );
    this.verseSidsAlignedWithLoadedSource.clear();
    const n = this.store.getChapterCount();
    const first = this.store.getFirstChapterNumber();
    this.contentPage = { kind: 'chapter', chapter: first };
    this.visibleChapters = n > 0 ? [first] : [1];
    this.rebuildEditorDoc();
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
    this.normalizeStoreToEditableUsj();
    const roles = this.getExpandedChapterRoles();
    const inWindow = chapter === 0 || roles.some((r) => r.chapter === chapter);
    if (inWindow) {
      this.rebuildEditorDoc();
    } else {
      for (const l of this.changeListeners) l();
    }
    return { clientPrime };
  }

  getAlignments(): AlignmentMap {
    return this.getActiveVerses();
  }

  getAlignmentsForVerse(verseRef: string): AlignmentGroup[] {
    return this.getActiveVerses()[verseRef] ?? [];
  }

  /** Alignment groups keyed by verse `sid` for one chapter number. */
  getAlignmentsForChapter(chapter: number): Record<string, AlignmentGroup[]> {
    const out: Record<string, AlignmentGroup[]> = {};
    for (const [sid, groups] of Object.entries(this.getActiveVerses())) {
      if (chapterFromVerseSid(sid) === chapter) out[sid] = groups;
    }
    return out;
  }

  updateAlignment(verseRef: string, groups: AlignmentGroup[]): void {
    if (this.alignmentSourceActive && this.alignmentSourceUsj) {
      this.verseSidsAlignedWithLoadedSource.add(normalizeVerseSidKey(verseRef));
    }
    this.replaceActiveVerses((m) => {
      const next = { ...m };
      if (groups.length === 0) delete next[verseRef];
      else next[verseRef] = groups;
      return next;
    });
    const g0 = groups[0];
    if (g0) {
      this.journal.append(0, 'alignment', [
        { type: 'updateGroup', verseRef, groupIndex: 0, group: g0 },
      ]);
    }
    const ch = chapterFromVerseSid(verseRef);
    if (ch !== undefined) {
      const map: AlignmentMap = {};
      for (const [sid, g] of Object.entries(this.getActiveVerses())) {
        if (chapterFromVerseSid(sid) === ch) map[sid] = g;
      }
      this.store.updateAlignments(ch, map);
    }
    for (const l of this.alignmentListeners) l(verseRef);
  }

  /** Register an external alignment document (e.g. loaded from `.alignment.json`). */
  loadAlignmentDocument(doc: AlignmentDocument): void {
    const key = alignmentDocumentSourceKey(doc);
    this.alignmentDocs.set(key, {
      ...doc,
      updated: new Date().toISOString(),
    });
    for (const l of this.alignmentDocumentListeners) l();
  }

  /** Parse JSON and {@link loadAlignmentDocument}. */
  loadAlignmentDocumentFromJson(json: string): void {
    this.loadAlignmentDocument(parseAlignmentJson(json));
  }

  /**
   * The alignment source identifier that the translation's `\rem alignment-source:` records.
   * Returns `null` when the embedded layer has no meaningful provenance (e.g. never aligned).
   *
   * Used by the alignment picker to highlight the "best match" reference slot.
   */
  getExpectedAlignmentKey(): string | null {
    const embDoc = this.alignmentDocs.get(ScriptureSession.EMBEDDED_ALIGNMENT_KEY);
    if (!embDoc) return null;
    const key = alignmentDocumentSourceKey(embDoc);
    // The embedded layer's default 'embedded' id means no meaningful provenance.
    if (key === 'embedded') return null;
    return key;
  }

  /**
   * Create a brand-new empty alignment layer against a source USJ document.
   * The layer's `source.id` is derived from the document's `\id` line.
   * The new layer is registered in {@link alignmentDocs} and immediately made active.
   *
   * @returns the alignment document key for the new layer.
   */
  createLayerForSource(sourceUsj: UsjDocument): string {
    const sourceId = parseDocumentIdentityFromUsj(sourceUsj) ?? 'unknown';
    const translationId =
      parseDocumentIdentityFromUsj(this.store.getFullUSJ() as UsjDocument) ?? 'UNK';
    const now = new Date().toISOString();
    const doc: AlignmentDocument = createAlignmentDocument(
      { id: translationId },
      { id: sourceId },
      {},
    );
    const key = alignmentDocumentSourceKey(doc);
    this.alignmentDocs.set(key, { ...doc, created: now, updated: now });
    this.activeAlignmentKey = key;
    for (const l of this.alignmentDocumentListeners) l();
    return key;
  }

  /** Switch which alignment layer receives edits and is used as the default export source. */
  setActiveAlignmentDocumentKey(key: string): boolean {
    if (!this.alignmentDocs.has(key)) return false;
    this.activeAlignmentKey = key;
    for (const l of this.alignmentDocumentListeners) l();
    return true;
  }

  /** Keys suitable for {@link setActiveAlignmentDocumentKey} and {@link ToUsfmAlignmentOptions.embedAlignmentSourceKey}. */
  getAlignmentDocumentKeys(): string[] {
    return [...this.alignmentDocs.keys()];
  }

  getAlignmentDocuments(): AlignmentDocument[] {
    return [...this.alignmentDocs.values()];
  }

  getActiveAlignmentDocument(): AlignmentDocument | null {
    const key = this.activeAlignmentKey ?? ScriptureSession.EMBEDDED_ALIGNMENT_KEY;
    return this.alignmentDocs.get(key) ?? null;
  }

  /** Resolved key used for {@link getActiveAlignmentDocument} (never null once a document is loaded). */
  getActiveAlignmentDocumentKey(): string {
    return this.activeAlignmentKey ?? ScriptureSession.EMBEDDED_ALIGNMENT_KEY;
  }

  loadAlignmentSource(
    sourceUsj: UsjDocument,
    options: { stripSource?: boolean } = {}
  ): SourceCompatibility {
    this.verseSidsAlignedWithLoadedSource.clear();
    const stripSource = options.stripSource !== false;
    const translationUsj = this.store.getFullUSJ();
    const compat = checkSourceCompatibility(translationUsj, sourceUsj);
    this.alignmentSourceTokens = tokenizeOriginalDocument(sourceUsj, {
      stripFirst: stripSource,
    });
    compat.wordMatch = matchSourceToExistingAlignments(
      this.alignmentSourceTokens,
      this.getActiveVerses(),
    );
    this.alignmentSourceCompatibility = compat;
    this.alignmentSourceUsj = sourceUsj;
    this.alignmentSourceActive = true;
    for (const l of this.changeListeners) l();
    return compat;
  }

  /**
   * True when embedded alignments include at least one source word and no alignment source is loaded yet.
   * Used by the alignment overlay to auto-load the reference column when it can be verified against existing groups.
   */
  canAutoDetectAlignmentSource(): boolean {
    if (this.isAlignmentSourceLoaded()) return false;
    for (const groups of Object.values(this.getActiveVerses())) {
      for (const g of groups) {
        if (g.sources.length > 0) return true;
      }
    }
    return false;
  }

  clearAlignmentSource(): void {
    this.alignmentSourceTokens = {};
    this.alignmentSourceCompatibility = null;
    this.alignmentSourceActive = false;
    this.alignmentSourceUsj = null;
    this.verseSidsAlignedWithLoadedSource.clear();
  }

  /** USJ last loaded as alignment source, or null. Used for export provenance override. */
  getAlignmentSourceUsj(): UsjDocument | null {
    return this.alignmentSourceUsj;
  }

  isAlignmentSourceLoaded(): boolean {
    return this.alignmentSourceActive;
  }

  getAlignmentSourceCompatibility(): SourceCompatibility | null {
    return this.alignmentSourceCompatibility;
  }

  getTranslationTokens(sid: string): WordToken[] {
    const map = tokenizeTranslationDocument(this.store.getFullUSJ());
    return map[sid] ?? [];
  }

  /**
   * Reference (original-language) word tokens for a verse from the loaded alignment source.
   * Resolves verse `sid` against the source map with case/spacing-tolerant matching so keys
   * align with {@link getTranslationTokens} even when the two USJ documents differ slightly.
   */
  getReferenceTokens(sid: string): OriginalWordToken[] {
    const resolved = resolveAlignmentSourceSid(this.alignmentSourceTokens, sid);
    if (resolved === null) return [];
    return this.alignmentSourceTokens[resolved] ?? [];
  }

  /** Verse `sid` keys present after tokenizing the loaded alignment source (for diagnostics). */
  getAlignmentSourceVerseSids(): string[] {
    return Object.keys(this.alignmentSourceTokens).sort();
  }

  createAlignmentGroupFromTokenIndices(
    verseRef: string,
    refIndices: number[],
    transIndices: number[]
  ): void {
    const refTok = this.getReferenceTokens(verseRef);
    const trTok = this.getTranslationTokens(verseRef);
    const trSorted = [...transIndices].sort((a, b) => a - b);
    const refSorted = [...refIndices].sort((a, b) => a - b);

    let sources = refSorted.map((i) => {
      const t = refTok[i];
      if (!t) {
        return {
          strong: '',
          lemma: '',
          content: '',
          occurrence: 1,
          occurrences: 1,
        };
      }
      return {
        strong: t.strong,
        lemma: t.lemma,
        morph: t.morph,
        content: t.surface,
        occurrence: t.occurrence,
        occurrences: t.occurrences,
      };
    });

    if (sources.length === 0 && trSorted.length > 0) {
      sources = trSorted.map((i) => {
        const t = trTok[i];
        if (!t) {
          return { strong: '', lemma: '', content: '', occurrence: 1, occurrences: 1 };
        }
        return {
          strong: '',
          lemma: '',
          content: t.surface,
          occurrence: t.occurrence,
          occurrences: t.occurrences,
        };
      });
    }

    const targets = trSorted.map((i) => {
      const t = trTok[i];
      if (!t) {
        return { word: '', occurrence: 1, occurrences: 1 };
      }
      return {
        word: t.surface,
        occurrence: t.occurrence,
        occurrences: t.occurrences,
      };
    });
    const group: AlignmentGroup = { sources, targets };
    const prev = this.getAlignmentsForVerse(verseRef);
    this.updateAlignment(verseRef, [...prev, group]);
  }

  removeAlignmentGroup(verseRef: string, groupIndex: number): void {
    const prev = this.getAlignmentsForVerse(verseRef);
    if (groupIndex < 0 || groupIndex >= prev.length) return;
    const next = prev.filter((_, i) => i !== groupIndex);
    this.updateAlignment(verseRef, next);
  }

  mergeAlignmentGroups(verseRef: string, groupIndices: number[]): void {
    const prev = this.getAlignmentsForVerse(verseRef);
    const sorted = [...new Set(groupIndices)].filter((i) => i >= 0 && i < prev.length).sort((a, b) => a - b);
    if (sorted.length < 2) return;
    const merged: AlignmentGroup = { sources: [], targets: [] };
    for (const i of sorted) {
      const g = prev[i]!;
      merged.sources.push(...g.sources);
      merged.targets.push(...g.targets);
    }
    const first = sorted[0]!;
    const next: AlignmentGroup[] = [];
    for (let i = 0; i < prev.length; ) {
      if (sorted.includes(i)) {
        if (i === first) next.push(merged);
        i++;
        while (i < prev.length && sorted.includes(i)) i++;
      } else {
        next.push(prev[i]!);
        i++;
      }
    }
    this.updateAlignment(verseRef, next);
  }

  splitAlignmentGroup(verseRef: string, groupIndex: number): void {
    const prev = this.getAlignmentsForVerse(verseRef);
    const g = prev[groupIndex];
    if (!g) return;
    if (g.sources.length <= 1 && g.targets.length <= 1) return;
    const injected: AlignmentGroup[] = [];
    if (g.sources.length === 1) {
      for (const t of g.targets) {
        injected.push({ sources: [...g.sources], targets: [t] });
      }
    } else if (g.targets.length === 1) {
      for (const s of g.sources) {
        injected.push({ sources: [s], targets: [...g.targets] });
      }
    } else {
      const n = Math.min(g.sources.length, g.targets.length);
      for (let i = 0; i < n; i++) {
        injected.push({ sources: [g.sources[i]!], targets: [g.targets[i]!] });
      }
    }
    const without = prev.filter((_, i) => i !== groupIndex);
    without.splice(groupIndex, 0, ...injected);
    this.updateAlignment(verseRef, without);
  }

  getAlignmentProgress(scope?: { verseSid?: string }): {
    alignedWordCount: number;
    totalWordCount: number;
    percent: number;
  } {
    const transMap = tokenizeTranslationDocument(this.store.getFullUSJ());
    const sids = scope?.verseSid ? [scope.verseSid] : Object.keys(transMap);
    let totalWordCount = 0;
    let alignedWordCount = 0;
    for (const sid of sids) {
      const words = transMap[sid] ?? [];
      totalWordCount += words.length;
      const groups = this.getAlignmentsForVerse(sid);
      const covered = new Set<number>();
      for (const g of groups) {
        for (const tw of g.targets) {
          for (let i = 0; i < words.length; i++) {
            const w = words[i]!;
            if (covered.has(i)) continue;
            if (alignmentWordSurfacesEqual(w.surface, tw.word) && w.occurrence === tw.occurrence) {
              covered.add(i);
              break;
            }
          }
        }
      }
      alignedWordCount += covered.size;
    }
    const percent =
      totalWordCount > 0 ? Math.min(100, Math.round((alignedWordCount / totalWordCount) * 100)) : 0;
    return { alignedWordCount, totalWordCount, percent };
  }

  getVisibleSections(): import('./scripture-plugin').SectionId[] {
    if (this.paginatedEditor) {
      if (this.contentPage.kind === 'identification') return [{ type: 'identification' }];
      if (this.contentPage.kind === 'introduction') return [{ type: 'introduction' }];
      return [{ type: 'chapter', chapter: this.contentPage.chapter }];
    }
    const out: import('./scripture-plugin').SectionId[] = [];
    if (this.showIntroduction) out.push({ type: 'introduction' });
    for (const c of this.visibleChapters) {
      out.push({ type: 'chapter', chapter: c });
    }
    return out;
  }

  /** True when the session uses single-page identification / introduction / chapter navigation. */
  isPaginatedEditor(): boolean {
    return this.paginatedEditor;
  }

  getContentPage(): EditorContentPage {
    return this.contentPage;
  }

  /**
   * Ordered pages for this book: identification (+ titles), introduction, then each chapter.
   * In {@link paginatedEditor} mode the introduction page is always listed so translators can add
   * `\\ip` / `\\is` content even when the loaded USFM has none.
   */
  getNavigableContentPages(): EditorContentPage[] {
    const raw = this.store.getFullUSJ() as UsjDocument;
    const { editable } = stripAlignments(raw);
    const content = Array.isArray(editable.content) ? editable.content : [];
    const { header, chapters } = partitionContent(content);
    const { identification, bookTitles, introduction } = classifyPreChapterNodes(header);
    const pages: EditorContentPage[] = [];
    if (identification.length > 0 || bookTitles.length > 0) {
      pages.push({ kind: 'identification' });
    }
    if (this.paginatedEditor) {
      pages.push({ kind: 'introduction' });
    } else if (introduction.length > 0) {
      pages.push({ kind: 'introduction' });
    }
    for (const c of chapters) {
      const num = parseInt(String(c.chapter.number ?? '1'), 10);
      if (Number.isFinite(num) && num > 0) {
        pages.push({ kind: 'chapter', chapter: num });
      }
    }
    if (this.paginatedEditor) {
      if (!pages.some((p) => p.kind === 'chapter')) {
        pages.push({ kind: 'chapter', chapter: 1 });
      }
    } else if (pages.length === 0) {
      pages.push({ kind: 'chapter', chapter: 1 });
    }
    return pages;
  }

  setContentPage(page: EditorContentPage): void {
    const prev = this.getVisibleSections();
    const max = this.store.getMaxChapterNumber();
    if (page.kind === 'chapter') {
      const ch = page.chapter >= 1 && page.chapter <= max ? page.chapter : max >= 1 ? max : 1;
      this.contentPage = { kind: 'chapter', chapter: ch };
      this.visibleChapters = [ch];
    } else {
      this.contentPage = page;
      this.visibleChapters = [];
    }
    this.rebuildEditorDoc();
    const next = this.getVisibleSections();
    for (const p of this.pluginList) {
      p.onSectionChange?.(this, prev, next);
    }
    for (const l of this.sectionListeners) l(next);
  }

  /** Move to the next page in {@link getNavigableContentPages}; returns false if already at the end. */
  goToNextContentPage(): boolean {
    const pages = this.getNavigableContentPages();
    const i = pages.findIndex((p) => this.contentPageEquals(p, this.contentPage));
    if (i < 0 || i >= pages.length - 1) return false;
    this.setContentPage(pages[i + 1]!);
    return true;
  }

  /** Move to the previous page; returns false if already at the start. */
  goToPreviousContentPage(): boolean {
    const pages = this.getNavigableContentPages();
    const i = pages.findIndex((p) => this.contentPageEquals(p, this.contentPage));
    if (i <= 0) return false;
    this.setContentPage(pages[i - 1]!);
    return true;
  }

  private contentPageEquals(a: EditorContentPage, b: EditorContentPage): boolean {
    if (a.kind !== b.kind) return false;
    if (a.kind === 'chapter' && b.kind === 'chapter') return a.chapter === b.chapter;
    return true;
  }

  setVisibleChapters(chapters: number[]): void {
    if (this.paginatedEditor) {
      const max = this.store.getMaxChapterNumber();
      const picked = chapters.filter((c) => c >= 1 && c <= max);
      const ch = picked.length ? picked[0]! : max >= 1 ? this.store.getFirstChapterNumber() : 1;
      this.setContentPage({ kind: 'chapter', chapter: ch });
      return;
    }
    const prev = this.getVisibleSections();
    const max = this.store.getMaxChapterNumber();
    this.visibleChapters = chapters.filter((c) => c >= 1 && c <= max);
    if (this.visibleChapters.length === 0 && max >= 1) {
      this.visibleChapters = [this.store.getFirstChapterNumber()];
    }
    this.rebuildEditorDoc();
    const next = this.getVisibleSections();
    for (const p of this.pluginList) {
      p.onSectionChange?.(this, prev, next);
    }
    for (const l of this.sectionListeners) l(next);
  }

  /**
   * Navigate to `ch`, creating a temporary (ghost) chapter in the translation document when
   * the chapter does not yet exist.  The ghost chapter is automatically removed when:
   * - the user navigates away without adding any verse content, or
   * - the session is destroyed.
   *
   * Use this instead of {@link setContentPage} / {@link setVisibleChapters} when the
   * destination chapter may originate from a reference text rather than the document
   * being translated.
   */
  navigateToChapter(ch: number): void {
    if (!Number.isFinite(ch) || ch < 1) return;
    const isGhost = !this.store.getChapter(ch);
    if (isGhost) {
      this.createGhostChapter(ch);
    }
    if (this.paginatedEditor) {
      this.setContentPage({ kind: 'chapter', chapter: ch });
    } else {
      this.setVisibleChapters([ch]);
    }
    if (isGhost) {
      this.registerGhostCleanup(ch);
    }
  }

  // ── Ghost-chapter lifecycle ───────────────────────────────────────────────

  private createGhostChapter(ch: number): void {
    this.ghostChapters.add(ch);
    const usj = this.store.getFullUSJ() as import('@usfm-tools/editor-core').UsjDocument;
    const bookCode =
      (
        usj.content.find(
          (n) => (n as { type?: string }).type === 'book'
        ) as { code?: string } | undefined
      )?.code ?? 'UNK';
    const nodes: unknown[] = [
      { type: 'chapter', marker: 'c', number: String(ch), sid: `${bookCode} ${ch}` },
      { type: 'para', marker: 'p', content: [] },
    ];
    this.store.upsertChapterNodes(ch, nodes);
  }

  private registerGhostCleanup(ch: number): void {
    const unsub = this.onVisibleSectionsChange(() => {
      const onChapter =
        this.paginatedEditor
          ? this.contentPage.kind === 'chapter' && this.contentPage.chapter === ch
          : this.visibleChapters.includes(ch);
      if (onChapter) return;
      unsub();
      this.cleanupGhostChapter(ch);
    });
  }

  private cleanupGhostChapter(ch: number): void {
    if (!this.ghostChapters.has(ch)) return;
    const slice = this.store.getChapter(ch);
    if (!slice) {
      this.ghostChapters.delete(ch);
      return;
    }
    if (ghostChapterIsEmpty(slice.nodes)) {
      this.store.deleteChapterSlice(ch);
      this.ghostChapters.delete(ch);
      // Notify subscribers so the navigation re-renders without the ghost chapter.
      for (const l of this.changeListeners) l();
      const sections = this.getVisibleSections();
      for (const l of this.sectionListeners) l(sections);
    } else {
      // User added content — promote the ghost to a permanent chapter.
      this.ghostChapters.delete(ch);
    }
  }

  setIntroductionVisible(visible: boolean): void {
    if (this.paginatedEditor) {
      if (visible) {
        this.setContentPage({ kind: 'introduction' });
      } else {
        this.setContentPage({
          kind: 'chapter',
          chapter: this.contentPage.kind === 'chapter' ? this.contentPage.chapter : 1,
        });
      }
      return;
    }
    const prev = this.getVisibleSections();
    this.showIntroduction = visible;
    this.rebuildEditorDoc();
    for (const p of this.pluginList) {
      p.onSectionChange?.(this, prev, this.getVisibleSections());
    }
  }

  isIntroductionVisible(): boolean {
    if (this.paginatedEditor) return this.contentPage.kind === 'introduction';
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
    const maxChapter = this.store.getMaxChapterNumber();
    let selected = [...this.visibleChapters]
      .filter((c) => c >= 1 && c <= maxChapter)
      .slice(0, this.maxVisibleChapters);
    if (selected.length === 0 && maxChapter >= 1) selected = [this.store.getFirstChapterNumber()];
    return expandChaptersWithContext(selected, this.contextChapters, maxChapter);
  }

  toUSFM(chapter?: number, alignmentOptions?: ToUsfmAlignmentOptions): string {
    const map = this.alignmentMapForExport(alignmentOptions);
    if (chapter !== undefined) {
      const slice = this.store.getChapter(chapter);
      if (!slice || slice.nodes.length === 0) return '';
      const { editable } = stripAlignments({
        type: 'USJ',
        version: this.store.getVersion(),
        content: slice.nodes,
      } as UsjDocument);
      const chAlign: AlignmentMap = {};
      for (const [sid, groups] of Object.entries(map)) {
        if (chapterFromVerseSid(sid) === chapter) chAlign[sid] = groups;
      }
      let rebuilt = rebuildAlignedUsj(editable, chAlign);
      rebuilt = this.applyAlignmentProvenance(rebuilt, chAlign, alignmentOptions);
      return convertUSJDocumentToUSFM(rebuilt);
    }
    const full = this.store.getFullUSJ() as UsjDocument;
    const { editable } = stripAlignments(full);
    let rebuilt = rebuildAlignedUsj(editable, map);
    rebuilt = this.applyAlignmentProvenance(rebuilt, map, alignmentOptions);
    return convertUSJDocumentToUSFM(rebuilt);
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
    return rebuildAlignedUsj(editable, this.getActiveVerses());
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

  /** When alignment documents are loaded or the active layer changes. */
  onAlignmentDocumentsChange(fn: () => void): () => void {
    this.alignmentDocumentListeners.push(fn);
    return () => {
      const i = this.alignmentDocumentListeners.indexOf(fn);
      if (i >= 0) this.alignmentDocumentListeners.splice(i, 1);
    };
  }

  /**
   * Connect headless collaboration after load (e.g. DCS + realtime). No-op if there is no headless session.
   */
  connectHeadlessCollaboration(roomId?: string): Promise<void> {
    return this.headless?.connect(roomId) ?? Promise.resolve();
  }

  /** Current vector clock snapshot — written to `.sync/<BOOK>.json` on debounced save. */
  getJournalVectorClock(): Record<string, number> {
    return this.journal.getVectorClock();
  }

  /** Stable journal identity (base-snapshot id or empty string) for sidecar tracking. */
  getJournalBaseSnapshotId(): string {
    return this.journal.getBaseSnapshotId() ?? '';
  }

  /**
   * Count of in-memory journal entries.  Capture before an async operation as a
   * watermark; pass the result to {@link replayJournalEntriesAfter} once the
   * async operation completes so edits made during the window are re-applied.
   */
  journalEntryWatermark(): number {
    return this.journal.entryCount;
  }

  /**
   * Re-apply journal entries appended after `watermark` onto the current document
   * state.  Call this after {@link loadUSFM} so that edits made during a sync
   * window (between when sync started and when the merged USFM was loaded) are
   * not silently lost.
   *
   * Entries are applied via `DocumentStore.applyOperations`; failures are swallowed
   * (the entries stay in the journal for the next sync to integrate).
   */
  replayJournalEntriesAfter(watermark: number): void {
    const entries = this.journal.getEntriesAfter(watermark);
    if (entries.length === 0) return;
    try {
      const ops = entries.flatMap((e) => e.operations);
      this.store.applyOperations(ops);
      this.rebuildEditorDoc();
    } catch {
      // Best-effort replay; stale ops will be carried by the journal
      // and reconciled on the next successful push.
    }
  }

  /** Reload persisted journal entries (e.g. after project sync wrote merged `journal/<BOOK>.jsonl`). */
  async reloadJournalFromDisk(): Promise<void> {
    await this.journal.loadFromDisk();
  }

  /**
   * Fold the operation journal after a successful remote push when the log grows large
   * (see {@link OperationJournal.maybeCompactAfterPush}).
   */
  async maybeCompactJournalAfterPush(): Promise<void> {
    await this.journal.maybeCompactAfterPush(this.store);
  }

  destroy(): void {
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    void this.flushSessionToPersistence();
    // Remove any remaining ghost chapters so they are not persisted.
    for (const ch of this.ghostChapters) {
      const slice = this.store.getChapter(ch);
      if (slice && ghostChapterIsEmpty(slice.nodes)) {
        this.store.deleteChapterSlice(ch);
      }
    }
    this.ghostChapters.clear();
    for (const p of this.pluginList) {
      p.destroy?.();
    }
    this.headless?.destroy();
    this.contentView.destroy();
  }
}

/**
 * A read-only Scripture view used for side-by-side translation reference.
 *
 * The ProseMirror editor is rendered with `editable: false` so the user
 * can select and copy text, but cannot modify it. The chapter window can be
 * synchronised with a target {@link ScriptureSession} so both panels scroll
 * through the book together.
 */

import { parseUsxToUsjDocument } from '@usfm-tools/editor-adapters';
import {
  DocumentStore,
  stripAlignments,
  type SourceTextProvider,
  type UsjDocument,
} from '@usfm-tools/editor-core';
import type { AlignmentMap, HelpEntry } from '@usfm-tools/types';
import { EditorState } from 'prosemirror-state';
import { DecorationSet, EditorView } from 'prosemirror-view';

import { createUSFMPlugins, usfmChromeDomAttributes } from './editor';
import { resolveUSFMChrome, type USFMEditorChrome } from './chrome';
import {
  buildHelpsDecorationSet,
  createHelpsDecorationPlugin,
  META_SET_HELPS_DECOS,
  type HelpsTokenClickHandler,
} from './helps-decoration';
import { usfmSchema } from './schema';
import {
  chapterSubsetToPm,
  chapterSubsetToPmFromCached,
  classifyPreChapterNodes,
  partitionContent,
  type ChapterSubsetToPmOptions,
  type EditorContentPage,
  type SourceSessionCachedContent,
} from './usj-to-pm';

export interface SourceTextSessionOptions {
  /**
   * Chrome preset or config for the read-only view.
   * Defaults to `'minimal'` (clean, no glyphs, no USFM-bar decorations).
   */
  chrome?: USFMEditorChrome;
  /**
   * Number of auto-context chapters shown before/after the selected window
   * (dimmed, read-only — same as the target editor).  Default: 1.
   */
  contextChapters?: number;
}

/**
 * Minimal surface read from {@link import('./scripture-session').ScriptureSession}
 * to mirror the main editor window (paginated pages or legacy multi-chapter layout).
 */
export type ScriptureEditorWindowTarget = {
  isPaginatedEditor(): boolean;
  getContentPage(): EditorContentPage;
  getVisibleChapterNumbers(): number[];
  getContextChapterRadius(): number;
  isIntroductionVisible(): boolean;
};

export type { HelpsTokenClickHandler } from './helps-decoration';

/**
 * Wraps a non-editable ProseMirror view for displaying a source/reference text.
 * Accepts content from any {@link SourceTextProvider} or directly via
 * `loadUSFM` / `loadUSJ` / `loadUSX`.
 */
export class SourceTextSession {
  readonly store: DocumentStore;
  readonly contentView: EditorView;

  private subsetOptions: ChapterSubsetToPmOptions;
  private contextChapters: number;
  private provider: SourceTextProvider | null = null;
  private loaded = false;
  private readonly loadListeners: Array<() => void> = [];
  private lastHelpsTwl: HelpEntry[] = [];
  private lastHelpsTn: HelpEntry[] = [];
  private onHelpsTokenClick: HelpsTokenClickHandler | null = null;
  /** Set before {@link EditorView.destroy}; avoids dispatch/update after teardown (matchesNode on null). */
  private destroyed = false;
  /**
   * Memoizes the last `buildHelpsDecorationSet` result so that switching back
   * to a tab whose TWL/TN arrays and doc size are unchanged is a no-op (no
   * ProseMirror transaction, no DOM update).
   */
  private lastDecoCache: {
    twl: HelpEntry[];
    tn: HelpEntry[];
    docSize: number;
    decoSet: DecorationSet;
  } | null = null;
  /**
   * When `true`, `syncSubsetFromTarget` is deferred: the target window is
   * stored in `pendingSync` and applied the next time `setDeferSync(false)` is
   * called. This lets hidden (inactive-tab) source sessions skip per-chapter
   * ProseMirror rebuilds until the user actually switches to their tab.
   */
  private deferSync = false;
  private pendingSync: ScriptureEditorWindowTarget | null = null;
  /**
   * Pre-computed partition of the source text USJ, built once after loading.
   * Replaces the expensive `getFullUSJ()` deep-clone + `stripAlignments()` walk
   * inside `rebuildDoc()` for every chapter switch.
   */
  private cachedContent: SourceSessionCachedContent | null = null;
  /**
   * Alignment data per chapter, derived from the loaded USJ using a single
   * `getChapterSlicesRef()` scan. Eliminates repeated `splitUsjByChapter` calls
   * inside `buildHelpsDecorationSet`.
   */
  private cachedAlignments: Map<number, AlignmentMap> | null = null;
  /** Handle for a pending rAF-deferred `_dispatchHelpsDecorations` call. */
  private pendingDecoRaf = 0;

  constructor(
    place: ConstructorParameters<typeof EditorView>[0],
    options: SourceTextSessionOptions = {}
  ) {
    this.contextChapters = options.contextChapters ?? 1;
    this.subsetOptions = {
      visibleChapters: [1],
      showIntroduction: false,
      contextChapters: this.contextChapters,
    };

    this.store = new DocumentStore({ silentConsole: true });

    const chrome = resolveUSFMChrome(options.chrome ?? { preset: 'minimal' });
    const helpsPlugin = createHelpsDecorationPlugin(
      () => this.store,
      () => ({ twl: this.lastHelpsTwl, tn: this.lastHelpsTn }),
      () => this.onHelpsTokenClick,
    );
    const plugins = createUSFMPlugins(usfmSchema, { chrome, omitHistory: true, extra: [helpsPlugin] });

    this.contentView = new EditorView(place, {
      state: EditorState.create({
        doc: chapterSubsetToPm(this.store, this.subsetOptions),
        schema: usfmSchema,
        plugins,
      }),
      attributes: usfmChromeDomAttributes(options.chrome ?? { preset: 'minimal' }),
      editable: () => false,
    });
  }

  // ── Load methods ─────────────────────────────────────────────────────────

  /** Load the source text from an extensible {@link SourceTextProvider}. */
  async load(provider: SourceTextProvider): Promise<void> {
    this.provider = provider;
    const usj = await provider.load();
    if (this.destroyed) return;
    this._applyUsj(usj);
    for (const l of this.loadListeners) l();
  }

  /** Load directly from a USFM string (no provider object required). */
  loadUSFM(usfm: string): void {
    this.store.loadUSFM(usfm);
    this._finishLoad();
    for (const l of this.loadListeners) l();
  }

  /** Load directly from a USJ document. */
  loadUSJ(usj: UsjDocument): void {
    this._applyUsj(usj);
    for (const l of this.loadListeners) l();
  }

  /** Load directly from a USX XML string. */
  loadUSX(usxXml: string): void {
    const usj = parseUsxToUsjDocument(usxXml) as UsjDocument;
    this._applyUsj(usj);
    for (const l of this.loadListeners) l();
  }

  // ── Window control ────────────────────────────────────────────────────────

  /**
   * Synchronise the visible chapter window (legacy layout without `contentPage`).
   * Prefer {@link syncSubsetFromTarget} when pairing with a {@link ScriptureSession}.
   */
  setVisibleChapters(chapters: number[], contextRadius?: number): void {
    if (contextRadius !== undefined) this.contextChapters = contextRadius;
    this.subsetOptions = {
      visibleChapters: [...chapters],
      showIntroduction: false,
      contextChapters: this.contextChapters,
    };
    this.rebuildDoc();
  }

  /**
   * Match the main editor’s visible window: paginated identification / introduction /
   * chapter pages, or the legacy introduction + multi-chapter view.
   *
   * When deferred (hidden tab), the target is stored and applied lazily on
   * the next call to {@link setDeferSync}`(false)`.
   */
  syncSubsetFromTarget(target: ScriptureEditorWindowTarget): void {
    if (this.deferSync) {
      this.pendingSync = target;
      return;
    }
    this._applySyncFromTarget(target);
  }

  /**
   * Enable or disable deferred synchronisation for this session.
   *
   * - `setDeferSync(true)` — mark this session as hidden; future
   *   `syncSubsetFromTarget` calls will be stored but not applied.
   * - `setDeferSync(false)` — mark this session as visible; flushes any
   *   pending sync immediately so the view is up to date before the tab
   *   becomes visible.
   */
  setDeferSync(defer: boolean): void {
    this.deferSync = defer;
    if (!defer && this.pendingSync) {
      const target = this.pendingSync;
      this.pendingSync = null;
      this._applySyncFromTarget(target);
    }
  }

  private _applySyncFromTarget(target: ScriptureEditorWindowTarget): void {
    if (target.isPaginatedEditor()) {
      const page = target.getContentPage();
      this.contextChapters = target.getContextChapterRadius();
      this.subsetOptions = {
        visibleChapters: page.kind === 'chapter' ? [page.chapter] : [],
        showIntroduction: false,
        contextChapters: page.kind === 'chapter' ? this.contextChapters : 0,
        contentPage: page,
      };
      this.rebuildDoc();
      return;
    }
    this.contextChapters = target.getContextChapterRadius();
    const vis = target.getVisibleChapterNumbers();
    const next: ChapterSubsetToPmOptions = {
      visibleChapters: vis.length ? [...vis] : [1],
      showIntroduction: target.isIntroductionVisible(),
      contextChapters: this.contextChapters,
    };
    this.subsetOptions = next;
    this.rebuildDoc();
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  getChapterCount(): number {
    return this.store.getChapterCount();
  }

  /**
   * Largest `\\c` chapter number present in the reference text.
   * Use this to determine the navigation range when the reference has more chapters
   * than the file being translated.
   */
  getMaxChapterNumber(): number {
    return this.store.getMaxChapterNumber();
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  getProvider(): SourceTextProvider | null {
    return this.provider;
  }

  /**
   * Highlight TWL/TN matches in the reference text using inline decorations.
   * Pass empty arrays to clear.
   */
  setHelpsAnnotations(twl: HelpEntry[], tn: HelpEntry[]): void {
    this.lastHelpsTwl = twl;
    this.lastHelpsTn = tn;
    this._dispatchHelpsDecorations();
  }

  /** Remove all help highlights. */
  clearHelpsAnnotations(): void {
    this.lastHelpsTwl = [];
    this.lastHelpsTn = [];
    this.lastDecoCache = null;
    this._dispatchHelpsDecorations();
  }

  /** Fired when the user clicks an underlined span (decoration with `data-help-ids`). */
  setOnHelpsTokenClick(handler: HelpsTokenClickHandler | null): void {
    this.onHelpsTokenClick = handler;
  }

  /** Subscribe to load events. Returns an unsubscribe function. */
  onLoad(fn: () => void): () => void {
    this.loadListeners.push(fn);
    return () => {
      const i = this.loadListeners.indexOf(fn);
      if (i >= 0) this.loadListeners.splice(i, 1);
    };
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.pendingDecoRaf);
    this.pendingDecoRaf = 0;
    this.contentView.destroy();
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

  // ── Private ───────────────────────────────────────────────────────────────

  private _buildCache(): void {
    // Deep-clone + strip once so rebuildDoc only does chapter windowing on each switch.
    const raw = this.store.getFullUSJ() as UsjDocument;
    const { editable } = stripAlignments(raw);
    const content = Array.isArray(editable.content) ? editable.content : [];
    const { header, chapters } = partitionContent(content);
    const { identification, bookTitles, introduction } = classifyPreChapterNodes(header);
    this.cachedContent = {
      identification,
      bookTitles,
      introduction,
      chapters,
      maxChapter: this.store.getMaxChapterNumber(),
    };

    // Build per-chapter alignment map with a single getChapterSlicesRef() pass
    // (no deep clone; nodes are shared by reference — do NOT mutate them).
    const slices = this.store.getChapterSlicesRef();
    const alignMap = new Map<number, AlignmentMap>();
    for (const slice of slices) {
      if (slice.chapter <= 0) continue;
      const sliceDoc = { type: 'USJ' as const, version: '3.1', content: slice.nodes };
      const { alignments } = stripAlignments(sliceDoc as UsjDocument);
      alignMap.set(slice.chapter, alignments);
    }
    this.cachedAlignments = alignMap;
  }

  private _applyUsj(usj: UsjDocument): void {
    this.store.loadUSJ(usj);
    this._finishLoad();
  }

  private _finishLoad(): void {
    this.loaded = true;
    this._buildCache();
    this.rebuildDoc();
  }

  private rebuildDoc(): void {
    if (this.destroyed) return;
    const cached = this.cachedContent;
    const max = cached ? cached.maxChapter : this.store.getMaxChapterNumber();
    const base: ChapterSubsetToPmOptions = { ...this.subsetOptions };
    let opts: ChapterSubsetToPmOptions;

    if (base.contentPage) {
      if (base.contentPage.kind === 'chapter') {
        const ch = base.contentPage.chapter;
        const hi = Math.max(max, 1);
        const clamped = ch >= 1 && ch <= hi ? ch : hi >= 1 ? hi : 1;
        opts = {
          ...base,
          contentPage: { kind: 'chapter', chapter: clamped },
          visibleChapters: [clamped],
        };
      } else {
        opts = { ...base };
      }
    } else {
      const vis = (base.visibleChapters ?? []).filter((c) => c >= 1 && c <= Math.max(max, 1));
      opts = {
        ...base,
        visibleChapters: vis.length ? vis : [1],
      };
    }

    // Use the pre-computed cached partition when available (avoids full-book
    // deep clone + stripAlignments on every chapter switch).
    const doc = cached
      ? chapterSubsetToPmFromCached(cached, opts)
      : chapterSubsetToPm(this.store, opts);
    const state = EditorState.create({
      doc,
      schema: usfmSchema,
      plugins: this.contentView.state.plugins,
    });
    this.contentView.updateState(state);

    // Defer decoration dispatch so the chapter text is painted first.
    // Any previous pending rAF is cancelled to avoid stale dispatches.
    cancelAnimationFrame(this.pendingDecoRaf);
    this.pendingDecoRaf = requestAnimationFrame(() => {
      this.pendingDecoRaf = 0;
      if (!this.destroyed) this._dispatchHelpsDecorations();
    });
  }

  private _dispatchHelpsDecorations(): void {
    if (!this.loaded || this.destroyed) return;
    const { state } = this.contentView;
    const docSize = state.doc.nodeSize;
    const twl = this.lastHelpsTwl;
    const tn = this.lastHelpsTn;
    // Skip the rebuild entirely when inputs are identical to the last dispatch.
    // Array reference equality is sufficient: React memoisation (useMemo / stable
    // state) means the arrays only change when the user picks a new language or
    // the book changes, not on every caret move or tab switch.
    if (
      this.lastDecoCache !== null &&
      this.lastDecoCache.twl === twl &&
      this.lastDecoCache.tn === tn &&
      this.lastDecoCache.docSize === docSize
    ) {
      return;
    }
    const deco = buildHelpsDecorationSet(state.doc, this.store, twl, tn, this.cachedAlignments ?? undefined);
    this.lastDecoCache = { twl, tn, docSize, decoSet: deco };
    this.contentView.dispatch(state.tr.setMeta(META_SET_HELPS_DECOS, deco));
  }
}

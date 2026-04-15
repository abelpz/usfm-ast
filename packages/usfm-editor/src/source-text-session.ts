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
  type SourceTextProvider,
  type UsjDocument,
} from '@usfm-tools/editor-core';
import type { HelpEntry } from '@usfm-tools/types';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';

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
  type ChapterSubsetToPmOptions,
  type EditorContentPage,
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
   */
  syncSubsetFromTarget(target: ScriptureEditorWindowTarget): void {
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
    this.contentView.destroy();
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _applyUsj(usj: UsjDocument): void {
    this.store.loadUSJ(usj);
    this._finishLoad();
  }

  private _finishLoad(): void {
    this.loaded = true;
    this.rebuildDoc();
  }

  private rebuildDoc(): void {
    const max = this.store.getMaxChapterNumber();
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

    const doc = chapterSubsetToPm(this.store, opts);
    const state = EditorState.create({
      doc,
      schema: usfmSchema,
      plugins: this.contentView.state.plugins,
    });
    this.contentView.updateState(state);
    this._dispatchHelpsDecorations();
  }

  private _dispatchHelpsDecorations(): void {
    if (!this.loaded) return;
    const { state } = this.contentView;
    const deco = buildHelpsDecorationSet(state.doc, this.store, this.lastHelpsTwl, this.lastHelpsTn);
    this.contentView.dispatch(state.tr.setMeta(META_SET_HELPS_DECOS, deco));
  }
}

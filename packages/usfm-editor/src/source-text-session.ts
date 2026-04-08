/**
 * A read-only Scripture view used for side-by-side translation reference.
 *
 * The ProseMirror editor is rendered with `editable: false` so the user
 * can select and copy text, but cannot modify it. The chapter window can be
 * synchronised with a target {@link ScriptureSession} so both panels scroll
 * through the book together.
 */

import { parseUsxToUsjDocument } from '@usfm-tools/adapters';
import {
  DocumentStore,
  type SourceTextProvider,
  type UsjDocument,
} from '@usfm-tools/editor-core';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';

import { createUSFMPlugins } from './editor';
import { resolveUSFMChrome, type USFMEditorChrome } from './chrome';
import { usfmSchema } from './schema';
import { chapterSubsetToPm } from './usj-to-pm';

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
 * Wraps a non-editable ProseMirror view for displaying a source/reference text.
 * Accepts content from any {@link SourceTextProvider} or directly via
 * `loadUSFM` / `loadUSJ` / `loadUSX`.
 */
export class SourceTextSession {
  readonly store: DocumentStore;
  readonly contentView: EditorView;

  private visibleChapters: number[] = [1];
  private contextChapters: number;
  private provider: SourceTextProvider | null = null;
  private loaded = false;
  private readonly loadListeners: Array<() => void> = [];

  constructor(
    place: ConstructorParameters<typeof EditorView>[0],
    options: SourceTextSessionOptions = {}
  ) {
    this.contextChapters = options.contextChapters ?? 1;
    this.store = new DocumentStore({ silentConsole: true });

    const chrome = resolveUSFMChrome(options.chrome ?? { preset: 'minimal' });
    const plugins = createUSFMPlugins(usfmSchema, { chrome, omitHistory: true });

    this.contentView = new EditorView(place, {
      state: EditorState.create({
        doc: chapterSubsetToPm(this.store, {
          visibleChapters: [1],
          showIntroduction: false,
          contextChapters: 1,
        }),
        schema: usfmSchema,
        plugins,
      }),
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
   * Synchronise the visible chapter window.
   * Typically called automatically when the paired target session changes its
   * window (via `onVisibleSectionsChange`).
   */
  setVisibleChapters(chapters: number[], contextRadius?: number): void {
    if (contextRadius !== undefined) this.contextChapters = contextRadius;
    this.visibleChapters = chapters;
    this.rebuildDoc();
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  getChapterCount(): number {
    return this.store.getChapterCount();
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  getProvider(): SourceTextProvider | null {
    return this.provider;
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
    const n = this.store.getChapterCount();
    const first = this.visibleChapters[0] ?? 1;
    if (first > n) this.visibleChapters = [1];
    this.rebuildDoc();
  }

  private rebuildDoc(): void {
    const max = this.store.getChapterCount();
    const vis = this.visibleChapters.filter((c) => c >= 1 && c <= Math.max(max, 1));
    const doc = chapterSubsetToPm(this.store, {
      visibleChapters: vis.length ? vis : [1],
      showIntroduction: false,
      contextChapters: this.contextChapters,
    });
    const state = EditorState.create({
      doc,
      schema: usfmSchema,
      plugins: this.contentView.state.plugins,
    });
    this.contentView.updateState(state);
  }
}

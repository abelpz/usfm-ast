/**
 * Factory helpers: `EditorState`, `EditorView`, default plugins.
 */

import type { UsjDocument } from '@usfm-tools/types';
import { EditorState, Plugin } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import type { USFMEditorChrome, ResolvedUSFMChrome } from './chrome';
import { resolveUSFMChrome } from './chrome';
import { pmDocumentToUsj } from './pm-to-usj';
import { usfmSchema } from './schema';
import { createBookNodeView } from './plugins/book-nodeview';
import { bookIntroductionCollapsePlugin } from './plugins/book-introduction-collapse';
import { createBookIntroductionNodeView } from './plugins/book-introduction-nodeview';
import { createBookTitlesNodeView } from './plugins/book-titles-nodeview';
import { createChapterNodeView, createChapterLabelNodeView } from './plugins/chapter-nodeview';
import { createHeaderNodeView } from './plugins/header-nodeview';
import { usfmHistory } from './plugins/history';
import { usfmInputRules } from './plugins/input-rules';
import { usfmKeymap } from './plugins/keymap';
import { structureGuardPlugin } from './plugins/structure-guard';
import { verseNavKeymap } from './plugins/verse-nav-keymap';
import { createVerseNodeView } from './plugins/verse-nodeview';
import { usjDocumentToPm } from './usj-to-pm';

export interface USFMEditorOptions {
  /** Override schema (defaults to {@link usfmSchema}). */
  schema?: typeof usfmSchema;
  /** Extra ProseMirror plugins appended after defaults. */
  plugins?: Plugin[];
  /** USJ version string for serialization. */
  version?: string;
  /**
   * Visual chrome: header label, marker glyphs (`\\id`, `\\c`, …), `\\id` layout.
   * Use `preset: 'minimal'` for content-focused UI; override any field.
   */
  chrome?: USFMEditorChrome;
}

/** Options for {@link createUSFMEditorView} (ProseMirror props except `state`, plus `chrome`). */
export interface USFMEditorViewOptions
  extends Omit<ConstructorParameters<typeof EditorView>[1], 'state' | 'attributes'> {
  /** Same chrome object passed to {@link createUSFMEditorState} so `data-*` matches node views. */
  chrome?: USFMEditorChrome;
  attributes?: ConstructorParameters<typeof EditorView>[1]['attributes'];
}

function createNodeViewsPlugin(chrome: ResolvedUSFMChrome): Plugin {
  return new Plugin({
    props: {
      nodeViews: {
        verse: createVerseNodeView(),
        chapter: createChapterNodeView(chrome),
        chapter_label: createChapterLabelNodeView(),
        header: createHeaderNodeView(chrome),
        book_titles: createBookTitlesNodeView(chrome),
        book_introduction: createBookIntroductionNodeView(chrome),
        book: createBookNodeView(chrome),
      },
    },
  });
}

/**
 * Default plugins: history, input rules, keymap, verse/header/book node views (from chrome).
 */
export function createUSFMPlugins(
  schema: typeof usfmSchema = usfmSchema,
  options?: { extra?: Plugin[]; chrome?: ResolvedUSFMChrome; omitHistory?: boolean }
): Plugin[] {
  const chrome = options?.chrome ?? resolveUSFMChrome();
  const base = [
    structureGuardPlugin(),
    bookIntroductionCollapsePlugin(),
    ...(options?.omitHistory ? [] : [usfmHistory()]),
    usfmInputRules(schema),
    verseNavKeymap(),
    usfmKeymap(),
    createNodeViewsPlugin(chrome),
  ];
  return options?.extra ? base.concat(options.extra) : base;
}

/**
 * Create an `EditorState` from USJ.
 */
export function createUSFMEditorState(usj: UsjDocument, options?: USFMEditorOptions): EditorState {
  const schema = options?.schema ?? usfmSchema;
  const chrome = resolveUSFMChrome(options?.chrome);
  const doc = usjDocumentToPm(usj, schema);
  const plugins = createUSFMPlugins(schema, { extra: options?.plugins, chrome });
  return EditorState.create({ doc, schema, plugins });
}

/**
 * Serialize the current document to USJ.
 */
export function serializeToUSJ(state: EditorState, version = '3.1'): UsjDocument {
  return pmDocumentToUsj(state.doc, version);
}

function mergeViewAttributes(
  chrome: ResolvedUSFMChrome,
  user?: USFMEditorViewOptions['attributes']
): ConstructorParameters<typeof EditorView>[1]['attributes'] {
  const base: Record<string, string> = {
    class: 'ProseMirror',
    'data-usfm-chrome': chrome.preset,
    'data-usfm-glyphs': chrome.markers.showGlyph ? 'true' : 'false',
    'data-usfm-theme': chrome.theme,
  };
  if (!user) return base;
  if (typeof user === 'function') {
    return (props) => {
      const u = user(props) as Record<string, string>;
      return {
        ...base,
        ...u,
        class: [base.class, u.class].filter(Boolean).join(' ').trim(),
      };
    };
  }
  const u = user as Record<string, string>;
  return {
    ...base,
    ...u,
    class: [base.class, u.class].filter(Boolean).join(' ').trim(),
  };
}

/**
 * Mount a ProseMirror `EditorView` (browser). Verse/header/book use configurable node views.
 */
export function createUSFMEditorView(
  place: ConstructorParameters<typeof EditorView>[0],
  state: EditorState,
  options?: USFMEditorViewOptions
): EditorView {
  const { chrome: chromeOpt, attributes, ...rest } = options ?? {};
  const chrome = resolveUSFMChrome(chromeOpt);
  return new EditorView(place, {
    ...rest,
    state,
    attributes: mergeViewAttributes(chrome, attributes),
  });
}

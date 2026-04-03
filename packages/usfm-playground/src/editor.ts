import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { jsonLanguage } from '@codemirror/lang-json';
import { xmlLanguage } from '@codemirror/lang-xml';
import { LanguageSupport, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { EditorState, Extension } from '@codemirror/state';
import {
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
  drawSelection,
  dropCursor,
} from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import { usfmLanguage } from './usfm-lang';

export type EditorLang = 'usfm' | 'json' | 'xml';

function langSupport(lang: EditorLang): LanguageSupport {
  if (lang === 'json') return new LanguageSupport(jsonLanguage);
  if (lang === 'xml') return new LanguageSupport(xmlLanguage);
  return new LanguageSupport(usfmLanguage);
}

const baseTheme = EditorView.theme(
  {
    '&': { height: '100%' },
    '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: '13px' },
    '.cm-content': { padding: '10px 0' },
    '.cm-gutters': { padding: '10px 4px' },
  },
  { dark: true }
);

function extensionsFor(lang: EditorLang, readOnly: boolean): Extension[] {
  const ex: Extension[] = [
    langSupport(lang),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    lineNumbers(),
    highlightActiveLine(),
    drawSelection(),
    dropCursor(),
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    oneDark,
    baseTheme,
    EditorState.tabSize.of(2),
    EditorView.lineWrapping,
  ];
  if (readOnly) {
    ex.push(EditorState.readOnly.of(true));
    ex.push(EditorView.editable.of(false));
  }
  return ex;
}

export function createEditor(
  parent: HTMLElement,
  doc: string,
  lang: EditorLang,
  readOnly: boolean,
  extra?: Extension[]
): EditorView {
  return new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [...extensionsFor(lang, readOnly), ...(extra ?? [])],
    }),
  });
}

export function setDoc(view: EditorView, text: string): void {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text },
  });
}

export function setLanguage(
  view: EditorView,
  lang: EditorLang,
  readOnly: boolean,
  extra?: Extension[]
): void {
  view.setState(
    EditorState.create({
      doc: view.state.doc.toString(),
      extensions: [...extensionsFor(lang, readOnly), ...(extra ?? [])],
    })
  );
}

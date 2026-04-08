import { convertUSJDocumentToUSFM } from '@usfm-tools/adapters';
import type { UsjDocument } from '@usfm-tools/types';
import { USFMParser } from '@usfm-tools/parser';
import type { Plugin } from 'prosemirror-state';
import type { USFMEditorOptions } from '@usfm-tools/editor';
import {
  changeParagraphMarker,
  createUSFMEditorState,
  createUSFMEditorView,
  insertParagraph,
  insertVerse,
  serializeToUSJ,
  toggleCharMarker,
} from '@usfm-tools/editor';

export function mountContentEditor(
  mount: HTMLElement,
  initialUsfm: string,
  options?: { extraPlugins?: Plugin[]; editor?: USFMEditorOptions }
): {
  view: ReturnType<typeof createUSFMEditorView>;
  getUsj: () => UsjDocument;
  loadUsfm: (usfm: string) => boolean;
  destroy: () => void;
} {
  const ed = options?.editor;
  const mergedPlugins = [...(ed?.plugins ?? []), ...(options?.extraPlugins ?? [])];
  const editorOpts: USFMEditorOptions = {
    ...ed,
    ...(mergedPlugins.length > 0 ? { plugins: mergedPlugins } : {}),
  };

  const parser = new USFMParser();
  parser.parse(initialUsfm);
  const usj = parser.toJSON() as UsjDocument;
  const state = createUSFMEditorState(usj, editorOpts);
  const view = createUSFMEditorView(mount, state, { chrome: editorOpts.chrome });

  return {
    view,
    getUsj: () => serializeToUSJ(view.state),
    /** Replace the document from USFM. Returns `false` if parsing or building the editor state fails. */
    loadUsfm: (usfm: string): boolean => {
      try {
        const p = new USFMParser();
        p.parse(usfm);
        const next = createUSFMEditorState(p.toJSON() as UsjDocument, editorOpts);
        view.updateState(next);
        return true;
      } catch {
        return false;
      }
    },
    destroy: () => view.destroy(),
  };
}

export function usjToUsfm(usj: UsjDocument): string {
  return convertUSJDocumentToUSFM(usj);
}

export { insertVerse, insertParagraph, changeParagraphMarker, toggleCharMarker };

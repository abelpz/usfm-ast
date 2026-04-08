/**
 * Keeps `book_introduction` collapsed when empty and the selection is outside;
 * expands when there is content or when the caret moves into a collapsed intro.
 */

import type { EditorState } from 'prosemirror-state';
import { Plugin } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';

function introBodyEmpty(node: PMNode): boolean {
  if (node.type.name !== 'book_introduction') return true;
  let empty = true;
  node.content.forEach((ch) => {
    if (ch.type.name === 'paragraph' || ch.type.name === 'book') {
      if (ch.content.size > 0 || ch.textContent.trim() !== '') empty = false;
    } else {
      empty = false;
    }
  });
  return empty;
}

function selectionInBookIntroduction(state: EditorState): boolean {
  const { from, to } = state.selection;
  for (const pos of [from, to]) {
    const $p = state.doc.resolve(pos);
    for (let d = $p.depth; d > 0; d--) {
      if ($p.node(d).type.name === 'book_introduction') return true;
    }
  }
  return false;
}

export function bookIntroductionCollapsePlugin(): Plugin {
  return new Plugin({
    appendTransaction(_trs, _oldState, newState) {
      let tr = newState.tr;
      let changed = false;
      const inIntro = selectionInBookIntroduction(newState);

      newState.doc.descendants((node, pos) => {
        if (node.type.name !== 'book_introduction') return true;
        const empty = introBodyEmpty(node);

        if (!empty && node.attrs.collapsed) {
          tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, collapsed: false });
          changed = true;
          return false;
        }
        if (empty && !node.attrs.collapsed && !inIntro) {
          tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, collapsed: true });
          changed = true;
          return false;
        }
        if (empty && node.attrs.collapsed && inIntro) {
          tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, collapsed: false });
          changed = true;
          return false;
        }
        return false;
      });

      return changed ? tr : null;
    },
  });
}

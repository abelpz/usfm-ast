import { keymap } from 'prosemirror-keymap';
import type { Command } from 'prosemirror-state';
import { NodeSelection, TextSelection } from 'prosemirror-state';

/** Select the inline `verse` atom when the caret sits immediately before (ArrowRight) or after (ArrowLeft) it. */
function selectAdjacentVerse(direction: 'before' | 'after'): Command {
  return (state, dispatch) => {
    const sel = state.selection;
    if (!(sel instanceof TextSelection) || !sel.empty) return false;
    const $from = sel.$from;
    if (direction === 'before') {
      const next = $from.nodeAfter;
      if (next?.type.name !== 'verse') return false;
      if (dispatch) dispatch(state.tr.setSelection(NodeSelection.create(state.doc, $from.pos)));
      return true;
    }
    const prev = $from.nodeBefore;
    if (prev?.type.name !== 'verse') return false;
    const versePos = $from.pos - prev.nodeSize;
    if (dispatch) dispatch(state.tr.setSelection(NodeSelection.create(state.doc, versePos)));
    return true;
  };
}

/**
 * Arrow keys onto a `verse` atom as {@link NodeSelection} so the verse {@link NodeView} can focus the number editor.
 * Place this plugin **before** the main USFM keymap so it runs first; return `false` when not at a verse boundary.
 */
export function verseNavKeymap() {
  return keymap({
    ArrowRight: selectAdjacentVerse('before'),
    ArrowLeft: selectAdjacentVerse('after'),
  });
}

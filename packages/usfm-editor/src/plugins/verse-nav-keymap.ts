import { keymap } from 'prosemirror-keymap';
import type { Command } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
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
 * From the first body block of a `chapter`, ArrowUp moves into the `chapter_label` and focuses
 * the detached label field when the session uses commit-mode chapter labels.
 */
function arrowUpIntoChapterLabel(): Command {
  return (state, dispatch, view?: EditorView) => {
    const sel = state.selection;
    if (!(sel instanceof TextSelection) || !sel.empty) return false;
    const $from = sel.$from;
    if (!$from.parent.isTextblock || $from.parentOffset !== 0) return false;

    let chapterDepth = -1;
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.name === 'chapter') {
        chapterDepth = d;
        break;
      }
    }
    if (chapterDepth < 0) return false;
    if ($from.index(chapterDepth) !== 1) return false;

    const ch = $from.node(chapterDepth);
    const label = ch.firstChild;
    if (!label || label.type.name !== 'chapter_label' || ch.childCount < 2) return false;

    const chapterPos = $from.before(chapterDepth);
    const labelCaretPos = chapterPos + 2 + label.content.size;

    if (dispatch) {
      dispatch(state.tr.setSelection(TextSelection.create(state.doc, labelCaretPos)));
      if (view) {
        requestAnimationFrame(() => {
          const pos = view.state.selection.from;
          const spec = view.domAtPos(pos);
          let n: globalThis.Node | null = spec.node;
          if (n.nodeType === 3) n = n.parentNode;
          const el = (n as HTMLElement | null)?.closest?.('.usfm-chapter') ?? null;
          const inner = el?.querySelector?.('.usfm-chapter-label-inner') as HTMLElement | null;
          inner?.focus();
        });
      }
    }
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
    ArrowUp: arrowUpIntoChapterLabel(),
  });
}

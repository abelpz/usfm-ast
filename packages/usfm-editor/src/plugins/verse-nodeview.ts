import type { Node as PMNode } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import type { EditorView, NodeView } from 'prosemirror-view';

/**
 * DOM `NodeView` for `verse` atoms: clickable / keyboard-focusable pill with a contenteditable verse number.
 */
export function createVerseNodeView(): (
  node: PMNode,
  view: EditorView,
  getPos: () => number | undefined
) => NodeView {
  return (initialNode, view, getPos) => {
    let node = initialNode;

    const dom = document.createElement('span');
    dom.className = 'usfm-verse';
    dom.setAttribute('data-verse', String(node.attrs.number ?? ''));

    const num = document.createElement('span');
    num.className = 'usfm-verse-num';
    num.contentEditable = 'true';
    num.spellcheck = false;
    num.setAttribute('role', 'textbox');
    num.setAttribute('aria-label', 'Verse number');
    num.textContent = String(node.attrs.number ?? '');

    dom.appendChild(num);

    const syncNumberToDoc = () => {
      const pos = getPos();
      if (pos === undefined) return;
      const curNode = view.state.doc.nodeAt(pos);
      if (!curNode || curNode.type.name !== 'verse') return;
      const next = (num.textContent ?? '').trim() || '1';
      const cur = String(curNode.attrs.number ?? '');
      if (next === cur) return;
      view.dispatch(
        view.state.tr.setNodeMarkup(pos, undefined, {
          ...curNode.attrs,
          number: next,
        })
      );
    };

    num.addEventListener('blur', () => {
      syncNumberToDoc();
    });

    num.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        num.blur();
        view.focus();
        return;
      }
      if (e.key === 'ArrowRight') {
        const s = window.getSelection();
        if (!s || !s.isCollapsed || s.focusNode !== num) return;
        const len = num.textContent?.length ?? 0;
        if (s.focusOffset < len) return;
        e.preventDefault();
        num.blur();
        const pos = getPos();
        if (pos === undefined) return;
        const after = pos + node.nodeSize;
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, after)));
        view.focus();
        return;
      }
      if (e.key === 'ArrowLeft') {
        const s = window.getSelection();
        if (!s || !s.isCollapsed || s.focusNode !== num) return;
        if (s.focusOffset > 0) return;
        e.preventDefault();
        num.blur();
        const pos = getPos();
        if (pos === undefined) return;
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
        view.focus();
      }
    });

    return {
      dom,
      update(updated) {
        if (updated.type.name !== 'verse') return false;
        node = updated;
        const n = String(updated.attrs.number ?? '');
        dom.setAttribute('data-verse', n);
        if (document.activeElement === num) return true;
        if (num.textContent !== n) num.textContent = n;
        return true;
      },
      selectNode() {
        dom.classList.add('ProseMirror-selectednode');
        num.focus();
        const range = document.createRange();
        range.selectNodeContents(num);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      },
      deselectNode() {
        dom.classList.remove('ProseMirror-selectednode');
        if (document.activeElement === num) num.blur();
      },
      stopEvent(e) {
        if (!num.contains(e.target as Node)) return false;
        // Let mousedown/click through so ProseMirror can select the atom; block keys/input so the
        // contenteditable keeps typing without PM stealing keystrokes.
        if (e.type === 'mousedown' || e.type === 'click' || e.type === 'dblclick') return false;
        return true;
      },
    };
  };
}

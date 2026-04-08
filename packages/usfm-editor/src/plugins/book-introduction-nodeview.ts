import { TextSelection } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import type { EditorView, NodeView } from 'prosemirror-view';
import type { ResolvedUSFMChrome } from '../chrome';

function introBodyEmpty(node: PMNode): boolean {
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

/**
 * Book introduction (`\ip`, `\is#`, …): optional section before chapter content.
 * Collapsed UI shows only an expand control when empty.
 */
export function createBookIntroductionNodeView(
  chrome: ResolvedUSFMChrome
): (node: PMNode, view: EditorView, getPos: () => number | undefined) => NodeView {
  return (node, view, getPos) => {
    const dom = document.createElement('section');
    dom.className = 'usfm-book-introduction';

    const expandBtn = document.createElement('button');
    expandBtn.type = 'button';
    expandBtn.className = 'usfm-book-introduction-expand';
    expandBtn.setAttribute('aria-expanded', 'false');
    expandBtn.textContent = 'Book introduction';
    expandBtn.hidden = true;

    const bi = chrome.bookIntroduction;
    let titleEl: HTMLElement | null = null;
    if (bi.title === 'text') {
      titleEl = document.createElement('div');
      titleEl.className = 'usfm-book-introduction-title';
      titleEl.textContent = bi.titleText;
      dom.appendChild(titleEl);
    } else if (bi.title === 'icon') {
      titleEl = document.createElement('div');
      titleEl.className = 'usfm-book-introduction-title usfm-book-introduction-title--icon';
      titleEl.setAttribute('aria-label', bi.titleText);
      dom.appendChild(titleEl);
    }

    dom.appendChild(expandBtn);

    const inner = document.createElement('div');
    inner.className = 'usfm-book-introduction-inner';
    dom.appendChild(inner);

    function sync(node: PMNode) {
      const collapsed = node.attrs.collapsed !== false;
      const empty = introBodyEmpty(node);
      const showCollapsed = collapsed && empty;
      dom.classList.toggle('usfm-book-introduction--collapsed', showCollapsed);
      dom.setAttribute('data-collapsed', showCollapsed ? 'true' : 'false');
      expandBtn.hidden = !showCollapsed;
      expandBtn.setAttribute('aria-expanded', showCollapsed ? 'false' : 'true');
      inner.style.display = showCollapsed ? 'none' : '';
      if (titleEl) {
        titleEl.style.display = showCollapsed ? 'none' : '';
      }
    }
    sync(node);

    expandBtn.addEventListener('mousedown', (e) => e.preventDefault());
    expandBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const pos = getPos();
      if (pos === undefined) return;
      const cur = view.state.doc.nodeAt(pos);
      if (!cur) return;
      const tr = view.state.tr.setNodeMarkup(pos, undefined, { ...cur.attrs, collapsed: false });
      view.dispatch(tr);
      requestAnimationFrame(() => {
        const st = view.state;
        const n = st.doc.nodeAt(pos);
        if (!n?.firstChild) return;
        const innerPos = pos + 1;
        const $p = st.doc.resolve(innerPos);
        const start = $p.start($p.depth) + 1;
        view.dispatch(st.tr.setSelection(TextSelection.create(st.doc, start)).scrollIntoView());
        view.focus();
      });
    });

    return {
      dom,
      contentDOM: inner,
      update(updated) {
        if (updated.type.name !== 'book_introduction') return false;
        sync(updated);
        return true;
      },
    };
  };
}

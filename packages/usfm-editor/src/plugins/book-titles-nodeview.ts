import type { Node as PMNode } from 'prosemirror-model';
import type { EditorView, NodeView } from 'prosemirror-view';
import type { ResolvedUSFMChrome } from '../chrome';

/**
 * Book main / intro titles (`\\mt#`, `\\imt#`, …): separate region from identification.
 */
export function createBookTitlesNodeView(
  chrome: ResolvedUSFMChrome
): (node: PMNode, view: EditorView, getPos: () => number | undefined) => NodeView {
  return () => {
    const dom = document.createElement('aside');
    dom.className = 'usfm-book-titles';

    const bt = chrome.bookTitles;
    if (bt.title === 'text') {
      const title = document.createElement('div');
      title.className = 'usfm-book-titles-title';
      title.textContent = bt.titleText;
      dom.appendChild(title);
    } else if (bt.title === 'icon') {
      const title = document.createElement('div');
      title.className = 'usfm-book-titles-title usfm-book-titles-title--icon';
      title.setAttribute('aria-label', bt.titleText);
      dom.appendChild(title);
    }

    const inner = document.createElement('div');
    inner.className = 'usfm-book-titles-inner';
    dom.appendChild(inner);

    return {
      dom,
      contentDOM: inner,
      update(updated) {
        return updated.type.name === 'book_titles';
      },
    };
  };
}

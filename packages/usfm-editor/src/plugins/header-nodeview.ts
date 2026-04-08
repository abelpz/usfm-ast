import type { Node as PMNode } from 'prosemirror-model';
import type { EditorView, NodeView } from 'prosemirror-view';
import type { ResolvedUSFMChrome } from '../chrome';

/**
 * Renders the book `header` region: optional title row + block content (from chrome config).
 */
export function createHeaderNodeView(
  chrome: ResolvedUSFMChrome
): (node: PMNode, view: EditorView, getPos: () => number | undefined) => NodeView {
  return () => {
    const dom = document.createElement('aside');
    dom.className = 'usfm-header';

    if (chrome.header.title === 'text') {
      const title = document.createElement('div');
      title.className = 'usfm-header-title';
      title.textContent = chrome.header.titleText;
      dom.appendChild(title);
    } else if (chrome.header.title === 'icon') {
      const title = document.createElement('div');
      title.className = 'usfm-header-title usfm-header-title--icon';
      title.setAttribute('aria-label', chrome.header.titleText);
      dom.appendChild(title);
    }

    const inner = document.createElement('div');
    inner.className = 'usfm-header-inner';
    dom.appendChild(inner);

    return {
      dom,
      contentDOM: inner,
      update(updated) {
        return updated.type.name === 'header';
      },
    };
  };
}

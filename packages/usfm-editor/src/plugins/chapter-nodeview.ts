import type { Node as PMNode } from 'prosemirror-model';
import type { EditorView, NodeView } from 'prosemirror-view';
import type { ResolvedUSFMChrome } from '../chrome';

/**
 * `chapter` (`\\c`) NodeView: a plain `<section>` wrapper.
 * The chapter label (editable number) is a child `chapter_label` node managed by PM.
 */
export function createChapterNodeView(
  _chrome: ResolvedUSFMChrome
): (node: PMNode, view: EditorView, getPos: () => number | undefined) => NodeView {
  return () => {
    const dom = document.createElement('section');
    dom.className = 'usfm-chapter';

    return {
      dom,
      contentDOM: dom,

      update(updated) {
        return updated.type.name === 'chapter';
      },
    };
  };
}

/**
 * `chapter_label` NodeView: the editable chapter number.
 *
 * The primary restore-if-empty behaviour is handled by `structureGuardPlugin`'s
 * `appendTransaction`, which fires on every PM transaction (including selection
 * changes when the user clicks/tabs away). The blur handler here is a secondary
 * safety net that also keeps `lastGoodValue` up to date for the NodeView's own use.
 *
 * Enter / Escape move focus back to the editor body.
 */
export function createChapterLabelNodeView(): (
  node: PMNode,
  view: EditorView,
  getPos: () => number | undefined
) => NodeView {
  return (initialNode, view, getPos) => {
    let lastGoodValue = initialNode.textContent || '1';

    const dom = document.createElement('div');
    dom.className = 'usfm-chapter-label';

    const inner = document.createElement('span');
    inner.className = 'usfm-chapter-label-inner';
    dom.appendChild(inner);

    // Secondary restore: fires when focus leaves the contentDOM span.
    // The appendTransaction guard is the primary mechanism; this catches edge
    // cases where the selection hasn't moved but focus left the label.
    inner.addEventListener('blur', () => {
      // Read from the live DOM — PM's DOMObserver may not have flushed yet.
      const domText = inner.textContent?.trim() ?? '';
      if (domText) {
        lastGoodValue = domText;
        return;
      }
      // Use a microtask so we don't dispatch inside a DOM event that PM may
      // already be processing.
      Promise.resolve().then(() => {
        const pos2 = getPos();
        if (pos2 === undefined) return;
        // After the microtask, PM should have processed all pending mutations.
        if (inner.textContent?.trim()) return;
        const n = view.state.doc.nodeAt(pos2);
        if (!n || n.type.name !== 'chapter_label') return;
        const from = pos2 + 1;
        const to = from + n.content.size;
        view.dispatch(
          view.state.tr.replaceWith(from, to, view.state.schema.text(lastGoodValue))
        );
      });
    });

    inner.addEventListener('keydown', (e) => {
      // Before any navigation key moves focus away, synchronously restore an
      // empty label. This runs before PM (or the browser) processes the key.
      const isNavigation =
        e.key === 'ArrowDown' || e.key === 'ArrowUp' ||
        e.key === 'Tab' || e.key === 'Enter' || e.key === 'Escape';
      if (isNavigation) {
        // Check the live DOM — PM state may lag behind after a Backspace since
        // the DOMObserver processes mutations asynchronously.
        const domEmpty = !inner.textContent?.trim();
        if (domEmpty) {
          const pos = getPos();
          if (pos !== undefined) {
            const n = view.state.doc.nodeAt(pos);
            if (n && n.type.name === 'chapter_label') {
              const from = pos + 1;
              // n.content.size may be 0 (already flushed) or 1 (still stale);
              // replaceWith handles both correctly.
              const to = from + n.content.size;
              view.dispatch(
                view.state.tr.replaceWith(from, to, view.state.schema.text(lastGoodValue))
              );
            }
          }
        }
      }
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        inner.blur();
        view.focus();
      }
    });

    return {
      dom,
      contentDOM: inner,

      update(updated) {
        if (updated.type.name !== 'chapter_label') return false;
        const text = updated.textContent;
        if (text) lastGoodValue = text;
        return true;
      },
    };
  };
}

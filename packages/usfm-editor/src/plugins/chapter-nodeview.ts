import type { Node as PMNode } from 'prosemirror-model';
import type { EditorView, NodeView } from 'prosemirror-view';
import { chapterNumberFromPmChapter } from '../chapter-position-map';
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

/** Context for {@link ChapterLabelHooks.onCommit} (fires when the label field loses focus). */
export type ChapterLabelCommitContext = {
  view: EditorView;
  /** Document position of the `chapter_label` node. */
  labelPos: number;
  /** Raw text from the label DOM (not yet normalized to digits-only). */
  draftRaw: string;
  /** Chapter number from the ProseMirror doc (unchanged while the detached label was edited). */
  oldChapter: number;
};

function oldChapterFromLabelPos(doc: PMNode, labelPos: number): number {
  const label = doc.nodeAt(labelPos);
  if (!label || label.type.name !== 'chapter_label') return 1;
  const $ = doc.resolve(labelPos + 1);
  for (let d = $.depth; d > 0; d--) {
    const n = $.node(d);
    if (n.type.name === 'chapter') return chapterNumberFromPmChapter(n);
  }
  return 1;
}

export type ChapterLabelHooks = {
  /**
   * When set, the label is edited in a detached DOM field (mutations ignored by PM) until blur,
   * then this runs so the host can validate, update USJ in the store, and rebuild the editor.
   */
  onCommit?: (ctx: ChapterLabelCommitContext) => void;
};

function syncReadonlyEditable(inner: HTMLElement, view: EditorView, getPos: () => number | undefined) {
  const pos = getPos();
  if (pos === undefined) {
    inner.contentEditable = 'true';
    return;
  }
  const $ = view.state.doc.resolve(pos);
  if ($.parent.type.name === 'chapter' && $.parent.attrs.readonly) {
    inner.contentEditable = 'false';
  } else {
    inner.contentEditable = 'true';
  }
}

/**
 * `chapter_label` NodeView: the editable chapter number.
 *
 * **Default (no hooks):** uses `contentDOM` so PM stays in sync on each keystroke; empty label
 * is restored via `structureGuardPlugin` and a blur safety net.
 *
 * **With {@link ChapterLabelHooks.onCommit}:** edits stay in the DOM until blur; PM is not
 * updated while the inner field is focused (`ignoreMutation`), then `onCommit` applies store-level
 * changes (rename / merge) and the host rebuilds the document.
 */
export function createChapterLabelNodeView(
  hooks?: ChapterLabelHooks
): (node: PMNode, view: EditorView, getPos: () => number | undefined) => NodeView {
  return (initialNode, view, getPos) => {
    let lastGoodValue = initialNode.textContent || '1';

    const dom = document.createElement('div');
    dom.className = 'usfm-chapter-label';

    const inner = document.createElement('span');
    inner.className = 'usfm-chapter-label-inner';
    dom.appendChild(inner);

    const commitMode = Boolean(hooks?.onCommit);
    let labelEditing = false;

    const syncInnerFromNode = (node: PMNode) => {
      const t = node.textContent || '';
      inner.textContent = t;
      if (t.trim()) lastGoodValue = t;
    };

    if (commitMode) {
      syncInnerFromNode(initialNode);
      syncReadonlyEditable(inner, view, getPos);
    }

    const onBlur = () => {
      if (commitMode) {
        const pos = getPos();
        if (pos !== undefined) {
          const draftRaw = inner.textContent ?? '';
          const oldChapter = oldChapterFromLabelPos(view.state.doc, pos);
          // Keep `labelEditing` true until commit finishes so `ignoreMutation` still blocks
          // ProseMirror from syncing the detached DOM into the doc before `relocateChapterNumber`
          // runs (otherwise `syncStoreFromPm` would upsert chapter 3 while chapter 1 stays stale).
          try {
            hooks?.onCommit?.({ view, labelPos: pos, draftRaw, oldChapter });
          } finally {
            labelEditing = false;
          }
        } else {
          labelEditing = false;
        }
        return;
      }
      const domText = inner.textContent?.trim() ?? '';
      if (domText) {
        lastGoodValue = domText;
        return;
      }
      Promise.resolve().then(() => {
        const pos2 = getPos();
        if (pos2 === undefined) return;
        if (inner.textContent?.trim()) return;
        const n = view.state.doc.nodeAt(pos2);
        if (!n || n.type.name !== 'chapter_label') return;
        const from = pos2 + 1;
        const to = from + n.content.size;
        view.dispatch(
          view.state.tr.replaceWith(from, to, view.state.schema.text(lastGoodValue))
        );
      });
    };

    const onFocus = () => {
      if (commitMode) {
        labelEditing = true;
      }
    };

    const onKeydown = (e: KeyboardEvent) => {
      if (commitMode) {
        if (e.key === 'Backspace' || e.key === 'Delete') {
          e.stopPropagation();
        }
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          inner.blur();
          view.focus();
        }
        return;
      }
      const isNavigation =
        e.key === 'ArrowDown' ||
        e.key === 'ArrowUp' ||
        e.key === 'Tab' ||
        e.key === 'Enter' ||
        e.key === 'Escape';
      if (isNavigation) {
        const domEmpty = !inner.textContent?.trim();
        if (domEmpty) {
          const pos = getPos();
          if (pos !== undefined) {
            const n = view.state.doc.nodeAt(pos);
            if (n && n.type.name === 'chapter_label') {
              const from = pos + 1;
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
    };

    inner.addEventListener('blur', onBlur);
    inner.addEventListener('focus', onFocus);
    inner.addEventListener('keydown', onKeydown);

    const destroy = () => {
      inner.removeEventListener('blur', onBlur);
      inner.removeEventListener('focus', onFocus);
      inner.removeEventListener('keydown', onKeydown);
    };

    if (commitMode) {
      return {
        dom,
        destroy,
        ignoreMutation() {
          return labelEditing;
        },
        update(updated) {
          if (updated.type.name !== 'chapter_label') return false;
          const text = updated.textContent;
          if (text) lastGoodValue = text;
          syncReadonlyEditable(inner, view, getPos);
          if (!labelEditing) {
            syncInnerFromNode(updated);
          }
          return true;
        },
      };
    }

    return {
      dom,
      contentDOM: inner,
      destroy,
      update(updated) {
        if (updated.type.name !== 'chapter_label') return false;
        const text = updated.textContent;
        if (text) lastGoodValue = text;
        return true;
      },
    };
  };
}

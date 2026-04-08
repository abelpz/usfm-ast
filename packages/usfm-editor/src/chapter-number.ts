import type { EditorState } from 'prosemirror-state';

function chapterNumberFromNode(node: import('prosemirror-model').Node): number {
  let num = 0;
  node.forEach((child) => {
    if (child.type.name === 'chapter_label') {
      const n = parseInt(child.textContent.trim(), 10);
      if (Number.isFinite(n) && n > 0) num = n;
    }
  });
  return num;
}

/**
 * Suggested chapter number for inserting a new `\\c` section: **one more than the highest
 * existing chapter number** in the document (scanning all `chapter` nodes), or **`1`** if none.
 */
export function nextChapterNumberForSelection(state: EditorState): string {
  let max = 0;
  state.doc.descendants((node) => {
    if (node.type.name === 'chapter') {
      const n = chapterNumberFromNode(node);
      if (n > max) max = n;
    }
  });
  return String(max + 1);
}

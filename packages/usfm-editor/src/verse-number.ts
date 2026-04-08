import type { ResolvedPos } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';

/** Parse a verse `number` attribute to a non-negative integer, or null if not usable. */
export function parseVerseNumberAttr(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function findChapterDepth($pos: ResolvedPos): number | null {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.name === 'chapter') return d;
  }
  return null;
}

/**
 * Suggested verse number for inserting at the current selection: **last verse before the
 * caret in the same chapter, plus one**; or **`1`** at the start of a chapter (no prior verse
 * in that chapter) or when the caret is in the book header (outside any `chapter` node).
 */
export function nextVerseNumberForSelection(state: EditorState): string {
  const $from = state.selection.$from;
  const d = findChapterDepth($from);
  if (d === null) return '1';

  const chStart = $from.start(d);
  const chEnd = $from.end(d);
  const scanTo = Math.min($from.pos, chEnd);

  let last: number | null = null;
  state.doc.nodesBetween(chStart, scanTo, (node) => {
    if (node.type.name === 'verse') {
      const n = parseVerseNumberAttr(node.attrs.number);
      if (n !== null) last = n;
    }
  });

  if (last === null) return '1';
  return String(last + 1);
}

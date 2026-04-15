import { parseVerseNumberAttr, type ScriptureSession } from '@usfm-tools/editor';

/**
 * Chapter from the paginated content page and verse inferred from the last `\\v` before the caret.
 */
export function getPrimaryVerseContext(session: ScriptureSession): { chapter: number; verse: number } | null {
  const page = session.getContentPage();
  if (page.kind !== 'chapter') return null;
  const chapter = page.chapter;
  const state = session.contentView.state;
  const $from = state.selection.$from;
  let chapterDepth: number | null = null;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'chapter') {
      chapterDepth = d;
      break;
    }
  }
  if (chapterDepth === null) return { chapter, verse: 1 };
  const chStart = $from.start(chapterDepth);
  const chEnd = $from.end(chapterDepth);
  const scanTo = Math.min($from.pos, chEnd);
  let lastVerse: number | null = null;
  state.doc.nodesBetween(chStart, scanTo + 1, (node, pos) => {
    if (node.type.name !== 'verse') return;
    const n = parseVerseNumberAttr(node.attrs.number);
    if (n === null) return;
    if (pos + node.nodeSize <= $from.pos + 1) lastVerse = n;
  });
  return { chapter, verse: lastVerse ?? 1 };
}

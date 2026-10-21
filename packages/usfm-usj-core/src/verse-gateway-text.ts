/**
 * Flatten each verse `sid` → plain gateway string (for tokenization and alignment reconciliation).
 */

import { appendGatewayText } from './gateway-text-spacing';
import { eachVerseStretch, isVerseTextSpan, listVerseKeys } from './verse-reach';

/**
 * The text of the pieces of one paragraph: its strings, and what its character styles hold. What a note says is
 * not the verse: read with it, a verse was shown to people with the words of its footnote in the middle of it, and
 * a word the note repeated was numbered as one more of the verse, which whoever writes the alignment does not count.
 */
function flattenInlineToText(nodes: unknown[]): string {
  let s = '';
  let left = false;
  for (const n of nodes) {
    if (typeof n !== 'string' && !isVerseTextSpan(n)) {
      left = true;
      continue;
    }
    let piece = typeof n === 'string' ? n : flattenInlineToText(n.content);
    // The space before what was left out and the one after it are one space.
    if (left && /\s$/u.test(s)) piece = piece.replace(/^\s+/u, '');
    left = false;
    if (piece) s = s.length === 0 ? piece : appendGatewayText(s, piece);
  }
  return s;
}

/**
 * Map each verse `sid` in the document to flattened gateway text. What a chapter has written before its first
 * verse (the title of a psalm) is under verse 0 of the chapter (`PSA 3:0`), only when there is something.
 */
export function collectVerseTextsFromContent(content: unknown[]): Record<string, string> {
  const texts = new Map<string, string>();
  eachVerseStretch(content, (pieces, sid) => {
    const text = flattenInlineToText(pieces);
    const before = texts.get(sid);
    if (!before || !text) return void texts.set(sid, before || text);
    // A stretch is a paragraph of its own, and a new paragraph is white space whatever it is written next to.
    texts.set(sid, /\s$/u.test(before) || /^\s/u.test(text) ? `${before}${text}` : `${before} ${text}`);
  });
  const out: Record<string, string> = {};
  for (const { sid, front } of listVerseKeys(content)) {
    const text = texts.get(sid) ?? '';
    if (front && !text.trim()) continue;
    out[sid] = text;
  }
  return out;
}

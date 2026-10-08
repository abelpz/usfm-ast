/**
 * What the text of a verse is. One answer for whoever reads a verse, numbers its words, reads its alignment or
 * writes it back; each of them had its own, and where they differed a word was numbered one way by who read it
 * and another by who wrote it.
 *
 * - A verse goes from its `\v` to the next one, on however many paragraphs it is written, and no further than
 *   its chapter: the last verse of a chapter was read with the label of the next one («…tierra firme. Capítulo 3»).
 * - What is said about the text is not the text: a title, a heading, a reference, a label, an introduction. A verse
 *   goes on after a heading written in the middle of it, and the words of the heading are not words of the verse.
 * - What is written after the `\c` and before its first `\v` (the title of a psalm, `\d`) is the front of the
 *   chapter, read and written as verse 0 of it (`PSA 3:0`), as other tools name it. unfoldingWord's texts number
 *   the words of such a title on their own; read as part of the last verse of the psalm before, they were numbered
 *   with it and their alignment could not be written back. A `\d` written after a `\v` is text of that verse, as
 *   those same texts number it.
 * - A character style (`\nd`, `\qs`) holds words of the verse. A note does not, nor the caption of a figure.
 */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Nodes that are part of the line they are in; anything else with content is a container of lines. */
const INLINE_TYPES = new Set(['char', 'note', 'ms', 'figure', 'ref', 'verse', 'optbreak', 'unmatched']);

/**
 * Paragraph marks whose text is said about the book, not part of it: what a book says of itself, introductions,
 * titles and headings (the letter of an acrostic among them), references, the labels of a chapter. A mark that is
 * not known is taken for text, as all of them were.
 */
const NOT_SCRIPTURE =
  /^(?:usfm|ide|sts|rem|restore|periph|h\d?|toca?\d?|i[a-z]*\d*|mte?\d?|ms\d?|mr|s\d?|sr|r|sp|sd\d?|qa|lit|cl|cd|cp)$/;

/** Nodes whose content is beside the text, whatever marks they hold. */
const ASIDE_TYPES = new Set(['book', 'note', 'figure', 'ref', 'sidebar', 'periph']);

/** The cursor of a walk: the verse being read, or the front of a chapter; empty where nothing is text of a verse. */
export type VerseCursor = { verseRef: string };

/** Whether what `node` holds is text of the verse it is in. */
export function holdsVerseText(node: Record<string, unknown>): boolean {
  if (ASIDE_TYPES.has(String(node.type))) return false;
  if (node.type === 'char') return node.marker !== 'fig';
  return node.type !== 'para' || !NOT_SCRIPTURE.test(String(node.marker ?? ''));
}

/** A character style with words of the verse in it. */
export function isVerseTextSpan(node: unknown): node is Record<string, unknown> & { content: unknown[] } {
  return isRecord(node) && node.type === 'char' && Array.isArray(node.content) && holdsVerseText(node);
}

/** The key of what is written in a chapter before its first verse: verse 0 of it (`PSA 3:0`). */
export function chapterFrontSid(chapter: Record<string, unknown>): string {
  return typeof chapter.sid === 'string' && chapter.sid ? `${chapter.sid}:0` : '';
}

/**
 * Moves the cursor past a mark that begins something: a chapter (its front) or a verse. A verse that does not say
 * which one it is still ends the one before it. Returns whether `node` was such a mark.
 */
export function passVerseMark(node: unknown, ctx: VerseCursor): boolean {
  if (!isRecord(node)) return false;
  if (node.type === 'chapter') ctx.verseRef = chapterFrontSid(node);
  else if (node.type === 'verse') ctx.verseRef = typeof node.sid === 'string' ? node.sid : '';
  else return false;
  return true;
}

/**
 * `read` over what `node` holds, with the cursor it is to be read with: the same one where it holds text of the
 * verse, one of its own where it does not, so that nothing in it is taken for words of a verse. A `\v` found in
 * there still begins its verse for what follows.
 */
export function readHeld<T>(node: Record<string, unknown> & { content: unknown[] }, ctx: VerseCursor, read: (content: unknown[], ctx: VerseCursor) => T): T {
  if (holdsVerseText(node)) return read(node.content, ctx);
  const aside: VerseCursor = { verseRef: '' };
  const result = read(node.content, aside);
  if (aside.verseRef) ctx.verseRef = aside.verseRef;
  return result;
}

function isContainer(node: unknown): node is Record<string, unknown> & { content: unknown[] } {
  return isRecord(node) && Array.isArray(node.content) && !INLINE_TYPES.has(String(node.type));
}

/**
 * The document with each stretch of a verse handed to `stretch`, and what it returns in its place: what follows a
 * `\v` in its paragraph, and what the paragraphs after it hold before the next `\v`. The pieces of a stretch are
 * the strings and the inline nodes of one paragraph, in order; `sid` is the verse, or the front of a chapter.
 */
export function walkVerseStretches(
  nodes: unknown[],
  ctx: VerseCursor,
  stretch: (pieces: unknown[], sid: string) => unknown[],
): unknown[] {
  const out: unknown[] = [];
  let buf: unknown[] = [];
  const flush = () => {
    if (buf.length) out.push(...(ctx.verseRef ? stretch(buf, ctx.verseRef) : buf));
    buf = [];
  };
  for (const item of nodes) {
    if (isRecord(item) && (item.type === 'chapter' || item.type === 'verse')) {
      flush();
      passVerseMark(item, ctx);
      // A verse that holds its own text (the editable shape of some callers) is a stretch of itself.
      out.push(Array.isArray(item.content) ? { ...item, content: walkVerseStretches(item.content as unknown[], ctx, stretch) } : { ...item });
    } else if (isContainer(item)) {
      flush();
      out.push({ ...item, content: readHeld(item, ctx, (content, at) => walkVerseStretches(content, at, stretch)) });
    } else {
      buf.push(item);
    }
  }
  flush();
  return out;
}

/** Every stretch of every verse of the document, in order, to be read. */
export function eachVerseStretch(nodes: unknown[], visit: (pieces: unknown[], sid: string) => void): void {
  walkVerseStretches(nodes, { verseRef: '' }, (pieces, sid) => {
    visit(pieces, sid);
    return pieces;
  });
}

/** The keys of the document in the order they are written: its verses, and the front of each chapter. */
export function listVerseKeys(nodes: unknown[]): { sid: string; front: boolean }[] {
  const out: { sid: string; front: boolean }[] = [];
  const walk = (arr: unknown[]) => {
    for (const node of arr) {
      if (!isRecord(node)) continue;
      if (node.type === 'chapter' && chapterFrontSid(node)) out.push({ sid: chapterFrontSid(node), front: true });
      if (node.type === 'verse' && typeof node.sid === 'string') out.push({ sid: node.sid, front: false });
      if (Array.isArray(node.content)) walk(node.content as unknown[]);
    }
  };
  walk(nodes);
  return out;
}

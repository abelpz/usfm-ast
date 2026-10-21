/**
 * The inline USJ nodes of a verse (by `sid`), on however many paragraphs it is written. What a verse reaches is
 * said in one place ({@link walkVerseStretches}), the same for who reads it here and for who writes its alignment.
 */

import { eachVerseStretch } from './verse-reach';

/**
 * Inline nodes for a verse, spanning across paragraph boundaries. `targetSid` may be the front of a chapter
 * (`PSA 3:0`).
 */
export function findVerseInlineNodes(rootContent: unknown[], targetSid: string): unknown[] {
  const out: unknown[] = [];
  eachVerseStretch(rootContent, (pieces, sid) => {
    if (sid === targetSid) out.push(...pieces);
  });
  return out;
}

/** The inline nodes of every verse of the document, read once: a book asked verse by verse is walked each time. */
export function collectVerseInlineNodes(rootContent: unknown[]): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  eachVerseStretch(rootContent, (pieces, sid) => {
    (out[sid] ??= []).push(...pieces);
  });
  return out;
}

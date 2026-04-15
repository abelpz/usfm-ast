/**
 * Scripture refs (`USFMRef`) ↔ verse `sid` strings (e.g. `TIT 3:1`) and verse-scoped lookups.
 */

import type { USFMRef } from './types';

/** Build `BOOK C:V` sid when `ref` identifies a single verse. */
export function usfmRefToVerseSid(bookCode: string, ref: USFMRef): string | undefined {
  if ('verse' in ref && typeof ref.chapter === 'number' && typeof ref.verse === 'number') {
    return `${bookCode.trim().toUpperCase()} ${ref.chapter}:${ref.verse}`;
  }
  return undefined;
}

/**
 * Inline nodes for a verse, spanning across paragraph boundaries.
 *
 * A USFM verse often spans more than one paragraph marker (e.g. a `\p` that
 * contains the `\v` milestone followed by `\q` / `\q2` / `\nb` poetry lines
 * that carry the rest of the verse's text).  This function collects the entire
 * verse — from the verse milestone to the next verse milestone — even when the
 * text continues into subsequent sibling paragraphs.
 */
export function findVerseInlineNodes(rootContent: unknown[], targetSid: string): unknown[] {
  return findVerseInlineContent(rootContent, targetSid) ?? [];
}

function isVerseNode(x: unknown): boolean {
  return (
    x != null &&
    typeof x === 'object' &&
    (x as Record<string, unknown>).type === 'verse'
  );
}

function findVerseInlineContent(nodes: unknown[], targetSid: string): unknown[] | undefined {
  for (let ni = 0; ni < nodes.length; ni++) {
    const n = nodes[ni];
    if (!n || typeof n !== 'object') continue;
    const o = n as Record<string, unknown>;
    if (!Array.isArray(o.content)) continue;

    const arr = o.content as unknown[];

    // --- Search for the target verse sid within this paragraph's content ---
    let verseIdx = -1;
    for (let i = 0; i < arr.length; i++) {
      const item = arr[i];
      if (
        item &&
        typeof item === 'object' &&
        (item as Record<string, unknown>).type === 'verse' &&
        (item as Record<string, unknown>).sid === targetSid
      ) {
        verseIdx = i;
        break;
      }
    }

    if (verseIdx >= 0) {
      // Collect everything in this paragraph after the target verse marker,
      // stopping at the next verse marker (if any).
      const out: unknown[] = [];
      let hitNextVerse = false;
      for (let j = verseIdx + 1; j < arr.length; j++) {
        const x = arr[j];
        if (isVerseNode(x)) { hitNextVerse = true; break; }
        out.push(x);
      }

      // If the next verse wasn't found within this paragraph, the verse
      // continues into subsequent sibling paragraphs.  Collect them.
      if (!hitNextVerse) {
        outer: for (let nj = ni + 1; nj < nodes.length; nj++) {
          const sib = nodes[nj];
          if (!sib || typeof sib !== 'object') continue;
          const sibContent = (sib as Record<string, unknown>).content;
          if (!Array.isArray(sibContent)) continue;
          for (const x of sibContent as unknown[]) {
            if (isVerseNode(x)) break outer;
            out.push(x);
          }
        }
      }

      return out;
    }

    // Verse not found in this paragraph — search recursively in its content
    // (handles nested section containers, intro paragraphs, etc.).
    const deep = findVerseInlineContent(arr, targetSid);
    if (deep !== undefined) return deep;
  }
  return undefined;
}

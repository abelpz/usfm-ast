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
 * Inline nodes after a verse milestone until the next verse in the same content array
 * (strings, char spans, notes, etc.).
 */
export function findVerseInlineNodes(rootContent: unknown[], targetSid: string): unknown[] {
  return findVerseInlineContent(rootContent, targetSid) ?? [];
}

function findVerseInlineContent(nodes: unknown[], targetSid: string): unknown[] | undefined {
  for (const n of nodes) {
    if (!n || typeof n !== 'object') continue;
    const o = n as Record<string, unknown>;
    if (Array.isArray(o.content)) {
      const arr = o.content as unknown[];
      for (let i = 0; i < arr.length; i++) {
        const item = arr[i];
        if (
          item &&
          typeof item === 'object' &&
          (item as Record<string, unknown>).type === 'verse' &&
          (item as Record<string, unknown>).sid === targetSid
        ) {
          const out: unknown[] = [];
          for (let j = i + 1; j < arr.length; j++) {
            const x = arr[j];
            if (x && typeof x === 'object' && (x as Record<string, unknown>).type === 'verse') {
              break;
            }
            out.push(x);
          }
          return out;
        }
      }
      for (const item of arr) {
        if (item && typeof item === 'object') {
          const deep = findVerseInlineContent([item], targetSid);
          if (deep) return deep;
        }
      }
    }
  }
  return undefined;
}

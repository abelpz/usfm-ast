/**
 * Scripture refs (`USFMRef`) ↔ verse `sid` strings (e.g. `TIT 3:1`) and verse-scoped lookups.
 */

import type { USFMRef } from './types';

export { findVerseInlineNodes } from '@usfm-tools/usj-core';

/** Build `BOOK C:V` sid when `ref` identifies a single verse. */
export function usfmRefToVerseSid(bookCode: string, ref: USFMRef): string | undefined {
  if ('verse' in ref && typeof ref.chapter === 'number' && typeof ref.verse === 'number') {
    return `${bookCode.trim().toUpperCase()} ${ref.chapter}:${ref.verse}`;
  }
  return undefined;
}

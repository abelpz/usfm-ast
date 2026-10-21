/**
 * Extracts a serialisable {@link StoreSnapshot} from a loaded {@link DocumentStore}.
 *
 * **Main-thread only** — imports from `@usfm-tools/editor-adapters` (DocumentStore access).
 * The snapshot is then safe to transfer to the Web Worker.
 */

import type { DocumentStore } from '@usfm-tools/editor-core';
import type { HelpEntry } from '@usfm-tools/types';
import { versePlainTextFromStore } from '@usfm-tools/editor-adapters';

import type { StoreSnapshot } from './helps-compute';

/**
 * Build a plain-data snapshot for one chapter from a loaded DocumentStore.
 * Only extracts verse texts for verses that actually appear in the help entries,
 * keeping the serialised payload small.
 */
export function extractStoreSnapshot(
  store: DocumentStore,
  chapter: number,
  twl: HelpEntry[],
  tn: HelpEntry[],
): StoreSnapshot {
  // Collect unique verse numbers referenced by the entries for this chapter.
  const verseNums = new Set<number>();
  for (const e of [...twl, ...tn]) {
    if (e.ref.chapter !== chapter) continue;
    if (e.ref.segment === 'bookIntro') continue;
    /* Chapter intro rows often use verse 0; include that slice when present in helps. */
    if (e.ref.segment === 'chapterIntro') verseNums.add(e.ref.verse);
    else if (e.ref.verse > 0) verseNums.add(e.ref.verse);
  }

  const verseTexts: Record<number, string> = {};
  for (const v of verseNums) {
    verseTexts[v] = versePlainTextFromStore(store, chapter, v);
  }

  return {
    bookCode: store.getBookCode(),
    verseTexts,
    alignments: store.getAlignments(chapter),
  };
}

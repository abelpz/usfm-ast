/**
 * Match `AlignedWord` entries from {@link stripAlignments} to {@link GatewayWordToken} indices.
 */

import type { AlignedWord } from '@usfm-tools/types';
import { alignmentWordSurfacesEqual } from './gateway-word-split';
import type { GatewayWordToken } from './gateway-word-tokens';

/** First gateway token index matching this aligned word (verse order). */
export function transIndexForAlignedWord(
  verseTokens: GatewayWordToken[],
  aw: AlignedWord,
): number | null {
  for (let i = 0; i < verseTokens.length; i++) {
    const w = verseTokens[i]!;
    if (alignmentWordSurfacesEqual(w.surface, aw.word) && w.occurrence === aw.occurrence) return i;
  }
  return null;
}

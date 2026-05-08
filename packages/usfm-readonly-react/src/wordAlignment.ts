/**
 * Resolve embedded USFM alignments to per-word metadata (shared rules with `@usfm-tools/usj-core` gateway tokens).
 */

import type { AlignedWord, AlignmentMap, OriginalWord } from '@usfm-tools/types';
import type { GatewayWordToken } from '@usfm-tools/usj-core';
import { transIndexForAlignedWord } from '@usfm-tools/usj-core';
import type { RenderSegment } from './segments.js';
import { splitWordsAndGaps } from './wordTokens.js';

/** One gateway word linked to original-language milestones (`AlignmentGroup.sources`). */
export type WordTokenAlignment = {
  verseSid: string;
  /** Index in {@link tokenizeGatewayUsj} order for this verse (0-based). */
  gatewayTokenIndex: number;
  alignmentGroupIndex: number;
  originalWords: OriginalWord[];
  alignedGatewayWord: AlignedWord;
};

export function verseSidFromParts(bookCode: string, chapter: number, verseNum: string): string {
  return `${bookCode.trim().toUpperCase()} ${chapter}:${verseNum.trim()}`;
}

/**
 * Find alignment group + originals for a gateway token index in a verse.
 */
export function resolveWordTokenAlignment(
  verseSid: string,
  gatewayIndex: number,
  alignments: AlignmentMap | null | undefined,
  verseTokens: GatewayWordToken[] | undefined,
): WordTokenAlignment | null {
  if (!alignments || !verseTokens?.length) return null;
  const groups = alignments[verseSid];
  if (!groups?.length) return null;
  if (gatewayIndex < 0 || gatewayIndex >= verseTokens.length) return null;
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi]!;
    for (const tw of g.targets) {
      if (transIndexForAlignedWord(verseTokens, tw) === gatewayIndex) {
        return {
          verseSid,
          gatewayTokenIndex: gatewayIndex,
          alignmentGroupIndex: gi,
          originalWords: [...g.sources],
          alignedGatewayWord: tw,
        };
      }
    }
  }
  return null;
}

/**
 * Map each rendered word piece key (`segmentKey(gi,si,seg)-i`) to a 0-based gateway token index
 * for that verse, in the same document order as {@link tokenizeGatewayUsj}.
 */
export function buildPieceKeyToGatewayIndex(
  groups: { inline: RenderSegment[] }[],
  segmentKey: (gi: number, si: number, seg: RenderSegment) => string,
  gatewayByVerse: Record<string, GatewayWordToken[]>,
  bookCode: string,
  chapter: number,
): Map<string, number> {
  const out = new Map<string, number>();
  const verseCursor = { verse: '' };
  const nextIdx = new Map<string, number>();

  for (let gi = 0; gi < groups.length; gi++) {
    const inline = groups[gi]!.inline;
    for (let si = 0; si < inline.length; si++) {
      const seg = inline[si]!;
      const sk = segmentKey(gi, si, seg);

      if (seg.kind === 'verse') {
        verseCursor.verse = (seg.verseNum ?? '').trim();
        continue;
      }
      if (seg.kind === 'footnote') continue;
      if (
        seg.kind === 'text' ||
        seg.kind === 'intro-heading' ||
        seg.kind === 'heading-text' ||
        seg.kind === 'word'
      ) {
        const vRaw = (seg.enclosingVerse || verseCursor.verse || '').trim();
        const parts = splitWordsAndGaps(seg.text ?? '');
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i]!;
          if (p.kind === 'word' && vRaw) {
            const sid = verseSidFromParts(bookCode, chapter, vRaw);
            const arr = gatewayByVerse[sid];
            const cur = nextIdx.get(sid) ?? 0;
            if (arr && cur < arr.length) {
              out.set(`${sk}-${i}`, cur);
              nextIdx.set(sid, cur + 1);
            }
          }
        }
      }
    }
  }
  return out;
}

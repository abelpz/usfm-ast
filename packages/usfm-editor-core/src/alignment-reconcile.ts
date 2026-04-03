/**
 * Reconcile alignment targets after gateway text edits using word-level LCS.
 */

import type { AlignmentGroup, AlignedWord } from '@usfm-tools/types';
import { lcsWordAlignment, tokenizeWords } from './word-diff';

function occurrenceAt(words: string[], index: number): { occurrence: number; occurrences: number } {
  const w = words[index];
  const occurrences = words.filter((x) => x === w).length;
  const occurrence = words.slice(0, index + 1).filter((x) => x === w).length;
  return { occurrence, occurrences };
}

/**
 * Re-run alignment groups after verse text changes. Drops targets whose words were removed or
 * modified; keeps targets on LCS-stable words and renumbers occurrences in the new verse.
 */
export function reconcileAlignments(
  oldVerseText: string,
  newVerseText: string,
  groups: AlignmentGroup[]
): AlignmentGroup[] {
  const ow = tokenizeWords(oldVerseText);
  const nw = tokenizeWords(newVerseText);
  const { oldKept, pairing } = lcsWordAlignment(ow, nw);

  if (ow.length === 0) {
    return groups.map((g) => ({
      sources: g.sources.map((s) => ({ ...s })),
      targets: [] as AlignedWord[],
    }));
  }

  const out: AlignmentGroup[] = groups.map((g) => ({
    sources: g.sources.map((s) => ({ ...s })),
    targets: [] as AlignedWord[],
  }));

  /** Map each target to the next unused old word index matching its surface form (partial alignment). */
  let searchStart = 0;
  for (let gi = 0; gi < groups.length; gi++) {
    for (let ti = 0; ti < groups[gi].targets.length; ti++) {
      const w = groups[gi].targets[ti].word;
      let oi = -1;
      for (let j = searchStart; j < ow.length; j++) {
        if (ow[j] === w) {
          oi = j;
          break;
        }
      }
      if (oi < 0) {
        continue;
      }
      searchStart = oi + 1;
      if (!oldKept.has(oi)) continue;
      const ni = pairing.get(oi);
      if (ni === undefined) continue;
      const src = groups[gi].targets[ti];
      const occ = occurrenceAt(nw, ni);
      out[gi].targets.push({
        ...src,
        word: nw[ni],
        occurrence: occ.occurrence,
        occurrences: occ.occurrences,
      });
    }
  }

  return out.filter((g) => g.targets.length > 0);
}

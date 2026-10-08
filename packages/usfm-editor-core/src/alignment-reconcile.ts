/**
 * Reconcile alignment targets after gateway text edits using word-level LCS.
 */

import type { AlignmentGroup, AlignedWord } from '@usfm-tools/types';
import {
  alignmentWordSurfacesEqual,
  lcsWordAlignment,
  normalizeWordForAlignmentMatch,
  tokenizeWords,
} from './word-diff';

/** Numbered as the tokens of a verse are (`occurrenceStats`): by the word, without its attached punctuation. */
function occurrenceAt(words: string[], index: number): { occurrence: number; occurrences: number } {
  const wordOf = (surface: string) => normalizeWordForAlignmentMatch(surface) || surface;
  const w = wordOf(words[index] ?? '');
  let occurrence = 0;
  let occurrences = 0;
  words.forEach((surface, i) => {
    if (wordOf(surface) !== w) return;
    occurrences++;
    if (i <= index) occurrence++;
  });
  return { occurrence, occurrences };
}

/**
 * Which word of the verse each target of each group was, before the edit. A target says it itself: it is the
 * `occurrence`-th of the words of the verse that are its word.
 *
 * They were looked for one after another along the verse, each from where the last one was found, as if groups
 * came in the order of the gateway text. They come in the order of the source: «desde … angustia», and then «mi»,
 * which stands between those two. The search for «mi» began after «angustia», found the «mi» at the end of the
 * verse, and nothing that stood before that one was found again: changing one word of a verse took the alignment
 * of most of it. A target whose number is not that of any word of the verse (written by another tool, or left
 * from an older text) takes the first word like it that no other target has.
 */
function oldIndexOfTargets(groups: AlignmentGroup[], words: string[]): Map<AlignedWord, number> {
  const found = new Map<AlignedWord, number>();
  const taken = new Set<number>();
  const pending: AlignedWord[] = [];
  for (const group of groups) {
    for (const target of group.targets) {
      const wanted = Number(target.occurrence);
      let seen = 0;
      let at = -1;
      if (Number.isInteger(wanted) && wanted > 0) {
        for (let j = 0; j < words.length; j++) {
          if (!alignmentWordSurfacesEqual(words[j]!, target.word)) continue;
          seen++;
          if (seen === wanted) {
            at = j;
            break;
          }
        }
      }
      if (at >= 0 && !taken.has(at)) {
        found.set(target, at);
        taken.add(at);
      } else {
        pending.push(target);
      }
    }
  }
  for (const target of pending) {
    const at = words.findIndex((word, j) => !taken.has(j) && alignmentWordSurfacesEqual(word, target.word));
    if (at < 0) continue;
    found.set(target, at);
    taken.add(at);
  }
  return found;
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
  const owNorm = ow.map((t) => normalizeWordForAlignmentMatch(t));
  const nwNorm = nw.map((t) => normalizeWordForAlignmentMatch(t));
  const { oldKept, pairing } = lcsWordAlignment(owNorm, nwNorm);

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

  const oldIndex = oldIndexOfTargets(groups, ow);
  for (let gi = 0; gi < groups.length; gi++) {
    for (let ti = 0; ti < groups[gi].targets.length; ti++) {
      const oi = oldIndex.get(groups[gi].targets[ti]);
      if (oi === undefined) continue;
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

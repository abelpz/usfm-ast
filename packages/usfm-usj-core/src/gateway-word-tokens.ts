/**
 * Verse-scoped gateway word tokens (surface + occurrence) for alignment with `AlignmentGroup.targets`.
 */

import { collectVerseTextsFromContent } from './verse-gateway-text';
import { normalizeWordForAlignmentMatch, tokenizeWords } from './gateway-word-split';

export type GatewayWordToken = {
  verseSid: string;
  surface: string;
  occurrence: number;
  occurrences: number;
  index: number;
};

/**
 * 1-based occurrence of `words[index]` among the surfaces of `words` that are the same word.
 *
 * Surfaces are compared as alignment compares them ({@link normalizeWordForAlignmentMatch}): without the
 * punctuation attached to them. Counting identical strings made `Jesucristo` and `Jesucristo,` each the first
 * of one, and an aligned word (`Jesucristo`, 1) then stood for both: the second could not be aligned, and trying
 * to moved the first out of its box.
 */
export function occurrenceStats(
  words: string[],
  index: number,
): { occurrence: number; occurrences: number } {
  // A surface that is only punctuation is its own word.
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
 * Tokenize a gateway / translation USJ (typically after {@link stripAlignments}: plain strings in verses).
 * Keys are verse `sid` strings (e.g. `TIT 3:1`).
 */
export function tokenizeGatewayUsj(usj: { content?: unknown[] }): Record<string, GatewayWordToken[]> {
  const content = usj.content ?? [];
  const byVerse = collectVerseTextsFromContent(content as unknown[]);
  const out: Record<string, GatewayWordToken[]> = {};
  for (const [sid, text] of Object.entries(byVerse)) {
    const words = tokenizeWords(text);
    out[sid] = words.map((surface, index) => ({
      verseSid: sid,
      surface,
      ...occurrenceStats(words, index),
      index,
    }));
  }
  return out;
}

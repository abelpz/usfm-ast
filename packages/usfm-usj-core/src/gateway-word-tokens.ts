/**
 * Verse-scoped gateway word tokens (surface + occurrence) for alignment with `AlignmentGroup.targets`.
 */

import { collectVerseTextsFromContent } from './verse-gateway-text';
import { tokenizeWords } from './gateway-word-split';

export type GatewayWordToken = {
  verseSid: string;
  surface: string;
  occurrence: number;
  occurrences: number;
  index: number;
};

/** 1-based occurrence of `words[index]` among identical string surfaces in `words`. */
export function occurrenceStats(
  words: string[],
  index: number,
): { occurrence: number; occurrences: number } {
  const w = words[index];
  const occurrences = words.filter((x) => x === w).length;
  const occurrence = words.slice(0, index + 1).filter((x) => x === w).length;
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

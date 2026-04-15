import type { HelpEntry, TokenAnnotation } from '@usfm-tools/types';

import { normalizeHelpsText } from './verse-text';

export function filterHelpsForVerse(helps: HelpEntry[], chapter: number, verse: number): HelpEntry[] {
  return helps.filter(
    (h) =>
      h.ref.chapter === chapter &&
      h.ref.verse === verse &&
      (h.ref.segment == null || h.ref.segment === 'verse'),
  );
}

export type TokenCharSpan = { tokenIndex: number; startInJoined: number; endInJoined: number };

/** Build normalized join of tokens and per-token inclusive char spans in that joined string. */
export function tokenJoinedSpans(tokens: string[]): { joined: string; spans: TokenCharSpan[] } {
  const normTokens = tokens.map((t) => normalizeHelpsText(t));
  const spans: TokenCharSpan[] = [];
  let offset = 0;
  for (let i = 0; i < normTokens.length; i++) {
    const raw = normTokens[i]!;
    const start = offset;
    const end = offset + raw.length;
    spans.push({ tokenIndex: i, startInJoined: start, endInJoined: end });
    offset = end;
    if (i < normTokens.length - 1) offset += 1;
  }
  const joined = normTokens.join(' ');
  return { joined, spans };
}

/**
 * Find the `occurrence`th (1-based) substring match of `needle` in `haystack`, searching from `fromIndex`.
 * Matches are non-overlapping and greedy from the left within the search window.
 */
export function findNthSubstringIndex(
  haystack: string,
  needle: string,
  occurrence: number,
  fromIndex = 0,
): { start: number; end: number } | null {
  const n = needle.length;
  if (!needle || occurrence < 1) return null;
  let pos = fromIndex;
  let seen = 0;
  while (pos <= haystack.length - n) {
    const idx = haystack.indexOf(needle, pos);
    if (idx < 0) return null;
    seen++;
    if (seen === occurrence) return { start: idx, end: idx + n };
    pos = idx + 1;
  }
  return null;
}

/**
 * Map an inclusive-exclusive range `[start,end)` in `joined` to token indices that overlap the range.
 */
export function tokenIndicesOverlappingRange(spans: TokenCharSpan[], start: number, end: number): number[] {
  const out: number[] = [];
  for (const s of spans) {
    if (s.endInJoined > start && s.startInJoined < end) out.push(s.tokenIndex);
  }
  return dedupeSorted(out);
}

function dedupeSorted(nums: number[]): number[] {
  const r: number[] = [];
  for (const n of nums.sort((a, b) => a - b)) {
    if (r.length === 0 || r[r.length - 1] !== n) r.push(n);
  }
  return r;
}

/**
 * Match a TWL/TN `origWords` / `quote` (+ `occurrence`, `&` segments) against tokenized verse text.
 * Returns token indices that should be highlighted for this help row.
 */
export function matchHelpQuoteToTokenIndices(
  tokens: string[],
  origWordsOrQuote: string,
  occurrence: number,
): number[] {
  const quote = (origWordsOrQuote ?? '').trim();
  if (!quote || tokens.length === 0) return [];
  const { joined, spans } = tokenJoinedSpans(tokens);
  if (!joined) return [];

  const parts = quote
    .split('&')
    .map((p) => normalizeHelpsText(p))
    .filter(Boolean);
  if (parts.length === 0) return [];

  let searchFrom = 0;
  const allTokenIdx = new Set<number>();

  for (let pi = 0; pi < parts.length; pi++) {
    const part = parts[pi]!;
    const occ = pi === 0 ? Math.max(1, occurrence || 1) : 1;
    const hit = findNthSubstringIndex(joined, part, occ, searchFrom);
    if (!hit) return [];
    for (const ti of tokenIndicesOverlappingRange(spans, hit.start, hit.end)) allTokenIdx.add(ti);
    searchFrom = hit.end;
  }

  return [...allTokenIdx].sort((a, b) => a - b);
}

/**
 * Build {@link TokenAnnotation} list for one verse: occurrence-aware `origWords` / `quote`
 * matching (incl. `&` segments), merged by token index.
 */
export function annotateTokensByQuote(tokens: string[], helps: HelpEntry[]): TokenAnnotation[] {
  const byIndex = new Map<number, HelpEntry[]>();
  for (const h of helps) {
    const q = (h.origWords ?? '').trim();
    if (!q) continue;
    const idxs = matchHelpQuoteToTokenIndices(tokens, q, h.occurrence);
    for (const i of idxs) {
      const prev = byIndex.get(i) ?? [];
      prev.push(h);
      byIndex.set(i, prev);
    }
  }
  return [...byIndex.entries()]
    .map(([tokenIndex, entries]) => ({ tokenIndex, entries }))
    .sort((a, b) => a.tokenIndex - b.tokenIndex);
}

import type { DocumentStore } from '@usfm-tools/editor-core';
import { usfmRefToVerseSid } from '@usfm-tools/editor-core';
import type { AlignedWord, AlignmentGroup, AlignmentMap, HelpEntry, TokenAnnotation } from '@usfm-tools/types';

import { annotateTokensByQuote, matchHelpQuoteToTokenIndices } from './quote-matcher';
import { normalizeHelpsText, tokenizeVersePlainText, versePlainTextFromStore } from './verse-text';

/**
 * One source word of the verse's alignment stream. `wordKey` identifies the original-language
 * word: a word that the gateway text splits across several milestones appears several times in
 * the stream with the same `wordKey`. It uses the exact `x-content`, because `x-occurrence`
 * counts exact forms: two Hebrew words that differ only in accents share `contentNorm` and may
 * share an occurrence number, yet are different words.
 */
type FlatSource = { gIdx: number; contentNorm: string; occurrence: number; wordKey: string };

function flattenSources(groups: AlignmentGroup[]): FlatSource[] {
  const out: FlatSource[] = [];
  for (let gIdx = 0; gIdx < groups.length; gIdx++) {
    for (const w of groups[gIdx]!.sources) {
      out.push({
        gIdx,
        contentNorm: normalizeHelpsText(w.content),
        occurrence: w.occurrence,
        wordKey: `${w.content}\x00${w.occurrence}`,
      });
    }
  }
  return out;
}

/** True when this verse has alignment groups with at least one gateway target. */
export function verseHasAlignmentTargets(groups: AlignmentGroup[] | undefined): boolean {
  if (!groups?.length) return false;
  return groups.some((g) => g.targets.length > 0);
}

/**
 * Running occurrence index per normalized surface form (matches gateway `\\w` x-occurrence).
 */
export function buildGatewayTokenOccurrences(tokens: string[]): Array<{ norm: string; occurrence: number }> {
  const counts = new Map<string, number>();
  return tokens.map((t) => {
    const norm = normalizeHelpsText(t);
    const c = (counts.get(norm) ?? 0) + 1;
    counts.set(norm, c);
    return { norm, occurrence: c };
  });
}

/**
 * Greedy left-to-right subsequence match: each TN/TWL word maps to the next equal
 * `flat` token. Handles ULT-style splits where the same Greek `x-content` appears twice
 * in a row (e.g. two `ἐκλεκτῶν` milestones for “of … the chosen”) while the catalog
 * quote only lists the lemma once.
 */
function matchPhraseSubsequenceFrom(
  flat: FlatSource[],
  partWords: string[],
  startFlatIdx: number,
): number[] | null {
  const n = partWords.length;
  if (n === 0) return [];
  let fp = Math.max(0, startFlatIdx);
  const matchedIdx: number[] = [];
  for (let pw = 0; pw < n; pw++) {
    const want = partWords[pw]!;
    while (fp < flat.length && flat[fp]!.contentNorm !== want) fp++;
    if (fp >= flat.length) return null;
    matchedIdx.push(fp);
    fp++;
  }
  return matchedIdx;
}

function multisetNeed(partWords: string[]): Map<string, number> {
  const need = new Map<string, number>();
  for (const w of partWords) need.set(w, (need.get(w) ?? 0) + 1);
  return need;
}

/**
 * When TN catalog Greek follows a different surface order than the verse’s `x-content`
 * stream (UGNT vs ULT ordering), still align by consuming one multiset token per flat
 * token left-to-right, anchored so the first consumed token is `startFlatIdx`.
 */
function matchPhraseMultisetFromStart(
  flat: FlatSource[],
  partWords: string[],
  startFlatIdx: number,
): number[] | null {
  if (partWords.length === 0) return [];
  const need = multisetNeed(partWords);
  const first = flat[startFlatIdx]!.contentNorm;
  if ((need.get(first) ?? 0) === 0) return null;
  need.set(first, need.get(first)! - 1);
  const matchedIdx: number[] = [startFlatIdx];
  let remaining = partWords.length - 1;
  for (let i = startFlatIdx + 1; i < flat.length && remaining > 0; i++) {
    const w = flat[i]!.contentNorm;
    const left = need.get(w) ?? 0;
    if (left > 0) {
      need.set(w, left - 1);
      matchedIdx.push(i);
      remaining--;
    }
  }
  if (remaining > 0) return null;
  return matchedIdx;
}

/** One placement of a quote segment in the alignment stream. */
type PhraseMatch = {
  /** Flat indices of the matched source words, ascending. */
  idxs: number[];
  /** The words follow the quote's own order (otherwise they only match as a multiset). */
  ordered: boolean;
};

const matchStart = (m: PhraseMatch): number => m.idxs[0]!;
const matchSpan = (m: PhraseMatch): number => m.idxs[m.idxs.length - 1]! - m.idxs[0]! + 1;

/**
 * Every tightest placement of a quote segment, by increasing start: the windows of the stream
 * that hold all of `partWords` and contain no smaller such window. Words may be in any order
 * and other words may sit between them, but a looser window around a tighter one (e.g. an
 * earlier article paired with a later noun) is never a candidate.
 */
function enumerateTightMatches(flat: FlatSource[], partWords: string[]): PhraseMatch[] {
  const windows: number[][] = [];
  for (let s = 0; s < flat.length; s++) {
    const m = matchPhraseMultisetFromStart(flat, partWords, s);
    if (!m) continue;
    // A later start never ends earlier, so a window ending on the same word as the previous
    // one lies inside it: the previous one was not the tightest.
    const prev = windows[windows.length - 1];
    if (prev && prev[prev.length - 1] === m[m.length - 1]) windows.pop();
    windows.push(m);
  }
  return windows.map((m) => {
    const inOrder = matchPhraseSubsequenceFrom(flat, partWords, m[0]!);
    return inOrder && inOrder[inOrder.length - 1]! <= m[m.length - 1]!
      ? { idxs: inOrder, ordered: true }
      : { idxs: m, ordered: false };
  });
}

/**
 * Placements of a quote segment that share no source word with each other nor with `takenWords`,
 * by increasing start; `[occurrence - 1]` is the Nth occurrence. Where candidates compete for a
 * word, the tightest wins, then the one in the quote's own order, then the earliest.
 */
function enumerateDistinctMatches(
  flat: FlatSource[],
  partWords: string[],
  takenWords: ReadonlySet<string>,
): PhraseMatch[] {
  const candidates = enumerateTightMatches(flat, partWords).sort(
    (a, b) => matchSpan(a) - matchSpan(b) || Number(b.ordered) - Number(a.ordered) || matchStart(a) - matchStart(b),
  );
  const taken = new Set(takenWords);
  const picked: PhraseMatch[] = [];
  for (const m of candidates) {
    if (m.idxs.some((k) => taken.has(flat[k]!.wordKey))) continue;
    for (const k of m.idxs) taken.add(flat[k]!.wordKey);
    picked.push(m);
  }
  return picked.sort((a, b) => matchStart(a) - matchStart(b));
}

/**
 * Placement of a later `&` segment. TN lists segments in original-language order, so the first
 * placement after the previous segment wins; when the gateway text moved the segment in front
 * of it, the nearest placement before it is used instead.
 */
function matchFollowingSegment(
  flat: FlatSource[],
  partWords: string[],
  prev: PhraseMatch,
  takenWords: ReadonlySet<string>,
): PhraseMatch | undefined {
  const free = enumerateDistinctMatches(flat, partWords, takenWords);
  return free.find((m) => matchStart(m) > matchStart(prev)) ?? free[free.length - 1];
}

function mapTargetToTokenIndex(
  meta: Array<{ norm: string; occurrence: number }>,
  target: AlignedWord,
): number {
  const norm = normalizeHelpsText(target.word);
  const wantOcc = target.occurrence;
  for (let i = 0; i < meta.length; i++) {
    if (meta[i]!.norm === norm && meta[i]!.occurrence === wantOcc) return i;
  }
  return -1;
}

/**
 * Token indices for one help row using alignment (original-language phrase → gateway tokens).
 * Returns empty when the phrase cannot be matched in the verse alignment stream.
 *
 * How a quote is placed in the stream of aligned source words:
 * - A segment matches the tightest window holding all its words; gateway word order and split
 *   milestones may reorder or separate them (see {@link enumerateTightMatches}).
 * - Occurrences share no source word, so a looser window that borrows a word from a tighter
 *   one is not an occurrence of its own, and neither is a second milestone of the same word.
 *   `occurrence` counts them in stream order.
 * - Each later `&` segment is the first placement after the previous segment, or else the
 *   nearest one before it, and never reuses a word of an earlier segment.
 */
export function matchHelpEntryToTokenIndicesByAlignment(
  tokens: string[],
  help: HelpEntry,
  groups: AlignmentGroup[],
): number[] {
  const quote = (help.origWords ?? '').trim();
  if (!quote || tokens.length === 0 || !verseHasAlignmentTargets(groups)) return [];

  const rawParts = quote
    .split('&')
    .map((p) => normalizeHelpsText(p))
    .filter(Boolean);
  if (rawParts.length === 0) return [];

  const flat = flattenSources(groups);
  const meta = buildGatewayTokenOccurrences(tokens);

  // Source words already matched by an earlier segment of the quote.
  const takenWords = new Set<string>();
  let prev: PhraseMatch | undefined;
  const tokenIdx = new Set<number>();

  for (const part of rawParts) {
    // Per-token normalize so commas / punctuation glued to a Greek word in TN/TWL
    // (e.g. "Θεοῦ,") still match alignment `x-content` ("Θεοῦ") after normalizeHelpsText.
    const partWords = part
      .split(/\s+/)
      .map((w) => normalizeHelpsText(w))
      .filter(Boolean);
    if (partWords.length === 0) return [];
    const match: PhraseMatch | undefined = prev
      ? matchFollowingSegment(flat, partWords, prev, takenWords)
      : enumerateDistinctMatches(flat, partWords, takenWords)[Math.max(1, help.occurrence || 1) - 1];
    if (!match) return [];
    for (const k of match.idxs) takenWords.add(flat[k]!.wordKey);
    prev = match;
    const matchedFlatIdxs = match.idxs;

    // Collect the (contentNorm, occurrence) identity of each primary source word.
    // Then find ALL alignment groups that share those same identity pairs — this
    // handles non-contiguous translations where the same Hebrew/Greek word is split
    // across multiple zaln blocks (e.g. "Y" and "oró" both aligned to וַ⁠יִּתְפַּלֵּ֣ל).
    const primaryKeys = new Set<string>();
    for (const k of matchedFlatIdxs) {
      const f = flat[k]!;
      primaryKeys.add(`${f.contentNorm}\x00${f.occurrence}`);
    }
    const touchedGroups = new Set<number>();
    for (const f of flat) {
      if (primaryKeys.has(`${f.contentNorm}\x00${f.occurrence}`)) {
        touchedGroups.add(f.gIdx);
      }
    }
    for (const gIdx of touchedGroups) {
      for (const t of groups[gIdx]!.targets) {
        const ti = mapTargetToTokenIndex(meta, t);
        if (ti >= 0) tokenIdx.add(ti);
      }
    }
  }

  return [...tokenIdx].sort((a, b) => a - b);
}

/**
 * Like {@link annotateTokensByQuote}, but resolves TWL/TN `origWords` (Greek/Hebrew) via
 * chapter `AlignmentMap` for the verse. Falls back to substring / quote matching when the
 * verse has no usable alignment targets.
 */
export function annotateTokensByAlignment(
  tokens: string[],
  helps: HelpEntry[],
  alignmentMap: AlignmentMap | null | undefined,
  verseSid: string,
): TokenAnnotation[] {
  const groups = alignmentMap?.[verseSid];
  if (!verseHasAlignmentTargets(groups)) {
    return annotateTokensByQuote(tokens, helps);
  }

  const byIndex = new Map<number, HelpEntry[]>();
  for (const h of helps) {
    const q = (h.origWords ?? '').trim();
    if (!q) continue;
    let idxs = matchHelpEntryToTokenIndicesByAlignment(tokens, h, groups!);
    if (idxs.length === 0) {
      idxs = matchHelpQuoteToTokenIndices(tokens, q, h.occurrence);
    }
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

/** Result of resolving a gateway-language quote from the loaded source for one help row. */
export type AlignedGatewayQuoteMatch = {
  gatewayText: string | null;
  /** Sorted token indices from the verse used to build {@link AlignedGatewayQuoteMatch.gatewayText}. */
  tokenIndices: number[];
};

/**
 * Token indices when matching the catalog `origWords` / TN Quote directly against the
 * verse’s gateway tokens (substring match). Empty when the quote is original-language
 * script or does not match the verse text.
 */
export function quoteMatchTokenIndicesForHelp(store: DocumentStore, help: HelpEntry): number[] {
  const { chapter, verse } = help.ref;
  const plain = versePlainTextFromStore(store, chapter, verse);
  const tokens = tokenizeVersePlainText(plain);
  if (!tokens.length) return [];
  return matchHelpQuoteToTokenIndices(tokens, help.origWords, help.occurrence);
}

/**
 * Gateway-language words in the source text that align to this help row’s `origWords`,
 * plus the token indices used to build that string (for UI / partial-match diagnostics).
 */
export function alignedGatewayQuoteMatchForHelp(
  store: DocumentStore,
  help: HelpEntry,
): AlignedGatewayQuoteMatch {
  const { chapter, verse } = help.ref;
  const plain = versePlainTextFromStore(store, chapter, verse);
  const tokens = tokenizeVersePlainText(plain);
  if (!tokens.length) return { gatewayText: null, tokenIndices: [] };
  const book = store.getBookCode();
  const verseSid =
    usfmRefToVerseSid(book, { book, chapter, verse }) ?? `${book.trim().toUpperCase()} ${chapter}:${verse}`;
  const alignmentMap = store.getAlignments(chapter);
  const groups = alignmentMap?.[verseSid];
  let idxs: number[] = [];
  if (verseHasAlignmentTargets(groups)) {
    idxs = matchHelpEntryToTokenIndicesByAlignment(tokens, help, groups!);
  }
  if (idxs.length === 0) {
    idxs = matchHelpQuoteToTokenIndices(tokens, help.origWords, help.occurrence);
  }
  if (idxs.length === 0) return { gatewayText: null, tokenIndices: [] };

  const clean = (i: number) =>
    tokens[i]!.replace(/^[^\p{L}\p{N}\p{M}]+|[^\p{L}\p{N}\p{M}]+$/gu, '');

  const parts: string[] = [];
  let groupWords: string[] = [clean(idxs[0]!)];
  for (let k = 1; k < idxs.length; k++) {
    if (idxs[k] === idxs[k - 1]! + 1) {
      groupWords.push(clean(idxs[k]!));
    } else {
      parts.push(groupWords.join(' '));
      groupWords = [clean(idxs[k]!)];
    }
  }
  parts.push(groupWords.join(' '));
  return { gatewayText: parts.join(' \u2026 '), tokenIndices: idxs };
}

/**
 * Gateway-language words in the source text that align to this help row’s `origWords`
 * (when alignment data exists). For display in the helps panel quote block.
 */
export function alignedGatewayQuoteForHelp(store: DocumentStore, help: HelpEntry): string | null {
  return alignedGatewayQuoteMatchForHelp(store, help).gatewayText;
}

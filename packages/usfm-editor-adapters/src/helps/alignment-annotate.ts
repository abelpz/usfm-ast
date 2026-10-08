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
type FlatSource = {
  gIdx: number;
  content: string;
  /** `content` with its accents, as a quote word is compared with it (see {@link exactHelpsForm}). */
  contentExact: string;
  /** `content` without accents, compared when the verse lacks a quote word's exact form. */
  contentNorm: string;
  occurrence: number;
  wordKey: string;
};

/** A source word with the form the words of one quote segment are compared with (see {@link keySegment}). */
type KeyedSource = FlatSource & { matchKey: string };

/** A word of a TN/TWL quote, in the two forms it can be compared by. */
type QuoteWord = { exact: string; norm: string };

const ZERO_WIDTH_CHARS = /\u200B|\u200C|\u200D|\u2060|\uFEFF/g;

/**
 * The exact form of a word: {@link normalizeHelpsText} without the loss of Hebrew accents. Only
 * what does not tell two words apart is removed: zero-width characters, surrounding punctuation
 * and differences of encoding (NFC).
 */
function exactHelpsForm(s: string): string {
  return s
    .replace(ZERO_WIDTH_CHARS, '')
    .normalize('NFC')
    .replace(/^[^\p{L}\p{N}\p{M}]+|[^\p{L}\p{N}\p{M}]+$/gu, '');
}

function flattenSources(groups: AlignmentGroup[]): FlatSource[] {
  const out: FlatSource[] = [];
  for (let gIdx = 0; gIdx < groups.length; gIdx++) {
    for (const w of groups[gIdx]!.sources) {
      out.push({
        gIdx,
        content: w.content,
        contentExact: exactHelpsForm(w.content),
        contentNorm: normalizeHelpsText(w.content),
        occurrence: w.occurrence,
        wordKey: `${w.content}\x00${w.occurrence}`,
      });
    }
  }
  return out;
}

/**
 * The words of one `&` segment of a quote, split where {@link normalizeHelpsText} splits them:
 * at whitespace and at the Hebrew maqef. Each word is normalized on its own, so punctuation
 * glued to a word in TN/TWL (e.g. "Θεοῦ,") does not keep it from matching `x-content` ("Θεοῦ").
 */
function quoteSegmentWords(segment: string): QuoteWord[] {
  return segment
    .replace(ZERO_WIDTH_CHARS, '')
    .split(/[\s\u05BE]+/)
    .map((w) => ({ exact: exactHelpsForm(w), norm: normalizeHelpsText(w) }))
    .filter((w) => w.norm);
}

/**
 * The stream and the words of one quote segment, each reduced to the key it is compared by.
 *
 * A quote word stands for its exact form: TN/TWL `Occurrence` counts exact forms, like
 * `x-occurrence`, and Hebrew words that differ only in accents are different words. So a quote
 * word matches the source words of its exact form. Only when the verse has none — accents drift
 * between versions of the Hebrew text — does it match by normalized form, without accents.
 * Quote words that normalize alike are compared the same way, without accents if any of them
 * lacks its exact form: a source word then matches the quote words of one key only.
 */
function keySegment(flat: FlatSource[], words: QuoteWord[]): { stream: KeyedSource[]; partWords: string[] } {
  const exactForms = new Set(flat.map((f) => f.contentExact));
  const drifted = new Set(words.filter((w) => !exactForms.has(w.exact)).map((w) => w.norm));
  return {
    stream: flat.map((f) => ({ ...f, matchKey: drifted.has(f.contentNorm) ? f.contentNorm : f.contentExact })),
    partWords: words.map((w) => (drifted.has(w.norm) ? w.norm : w.exact)),
  };
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
  flat: KeyedSource[],
  partWords: string[],
  startFlatIdx: number,
): number[] | null {
  const n = partWords.length;
  if (n === 0) return [];
  let fp = Math.max(0, startFlatIdx);
  const matchedIdx: number[] = [];
  for (let pw = 0; pw < n; pw++) {
    const want = partWords[pw]!;
    while (fp < flat.length && flat[fp]!.matchKey !== want) fp++;
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
  flat: KeyedSource[],
  partWords: string[],
  startFlatIdx: number,
): number[] | null {
  if (partWords.length === 0) return [];
  const need = multisetNeed(partWords);
  const first = flat[startFlatIdx]!.matchKey;
  if ((need.get(first) ?? 0) === 0) return null;
  need.set(first, need.get(first)! - 1);
  const matchedIdx: number[] = [startFlatIdx];
  let remaining = partWords.length - 1;
  for (let i = startFlatIdx + 1; i < flat.length && remaining > 0; i++) {
    const w = flat[i]!.matchKey;
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
function enumerateTightMatches(flat: KeyedSource[], partWords: string[]): PhraseMatch[] {
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
 * by increasing start. Where candidates compete for a word, the tightest wins, then the one in
 * the quote's own order, then the earliest.
 */
function enumerateDistinctMatches(
  flat: KeyedSource[],
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
 * The placement of a quote's first segment that a TN/TWL `Occurrence` names. `Occurrence` counts
 * in the original-language verse. The stream follows the gateway text, which may reach a later
 * occurrence first, and it only holds the words aligned so far: an occurrence may be missing.
 * The `x-occurrence` of the segment's first word tells the placements apart:
 *
 * - A single word is numbered by it. Occurrence n of the quote is the source word whose
 *   `x-occurrence` is n; when that word is not aligned the quote resolves to nothing, whichever
 *   other occurrences are.
 * - A phrase is only ordered by it: occurrence 2 of «ὁ λόγος» may start with the third «ὁ».
 *   Its placements are counted in that order. The count is the phrase's number only if every
 *   earlier occurrence of the phrase is aligned, which the stream cannot tell: «ὁ» 2 of 2 next
 *   to «λόγος» 2 of 2 is the second «ὁ λόγος» of one verse and the only one of another, where
 *   the first «ὁ» and the first «λόγος» stand apart.
 *
 * `x-occurrence` only compares words of the same exact form. That is every candidate, unless
 * the first word had to be matched without accents (see {@link keySegment}) and the verse has
 * several forms of it: no form is the quoted one then, and the placements are counted in stream
 * order. An `occurrence` below 1 names no occurrence (TN has -1 for "every occurrence"): the
 * first placement in that order is taken, whatever its number.
 */
function matchOccurrence(flat: KeyedSource[], partWords: string[], occurrence: number): PhraseMatch | undefined {
  const firstWord = partWords[0]!;
  const matches = enumerateDistinctMatches(flat, partWords, new Set()).map((m) => {
    // The source word standing for the segment's first word (the earliest, if it repeats).
    const leads = m.idxs.map((k) => flat[k]!).filter((f) => f.matchKey === firstWord);
    return { m, lead: leads.sort((a, b) => a.occurrence - b.occurrence)[0]! };
  });
  const sameForm = matches.every(({ lead }) => lead.content === matches[0]!.lead.content);
  if (sameForm && partWords.length === 1 && occurrence >= 1) {
    return matches.find(({ lead }) => lead.occurrence === occurrence)?.m;
  }
  if (sameForm) matches.sort((a, b) => a.lead.occurrence - b.lead.occurrence);
  return matches[Math.max(1, occurrence || 1) - 1]?.m;
}

/**
 * Placement of a later `&` segment. TN lists segments in original-language order, so the first
 * placement after the previous segment wins; when the gateway text moved the segment in front
 * of it, the nearest placement before it is used instead.
 */
function matchFollowingSegment(
  flat: KeyedSource[],
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
 * - A quote word matches the source words of its exact form, accents included, and those of
 *   its accent-insensitive form only when the verse has none (see {@link keySegment}).
 * - A segment matches the tightest window holding all its words; gateway word order and split
 *   milestones may reorder or separate them (see {@link enumerateTightMatches}).
 * - Occurrences share no source word, so a looser window that borrows a word from a tighter
 *   one is not an occurrence of its own, and neither is a second milestone of the same word.
 * - `occurrence` names one of them as the original-language verse numbers them: a single word
 *   by its `x-occurrence`, also when earlier occurrences are not aligned; a phrase by its place
 *   among the placements found, which is its number only if every earlier occurrence of the
 *   phrase is aligned (see {@link matchOccurrence}).
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

  const segments = quote
    .split('&')
    .map((part) => quoteSegmentWords(part))
    .filter((words) => words.length > 0);
  if (segments.length === 0) return [];

  const flat = flattenSources(groups);
  const meta = buildGatewayTokenOccurrences(tokens);

  // Source words already matched by an earlier segment of the quote.
  const takenWords = new Set<string>();
  let prev: PhraseMatch | undefined;
  const tokenIdx = new Set<number>();

  for (const words of segments) {
    const { stream, partWords } = keySegment(flat, words);
    const match: PhraseMatch | undefined = prev
      ? matchFollowingSegment(stream, partWords, prev, takenWords)
      : matchOccurrence(stream, partWords, help.occurrence);
    if (!match) return [];
    prev = match;

    // Every alignment group that carries one of the matched source words gives its gateway
    // tokens. The words are told by `wordKey`, not by normalized form: that keeps apart words
    // that differ only in accents, and still gathers a Hebrew/Greek word that is split
    // across multiple zaln blocks (e.g. "Y" and "oró" both aligned to וַ⁠יִּתְפַּלֵּ֣ל).
    const matchedWords = new Set<string>();
    for (const k of match.idxs) {
      matchedWords.add(flat[k]!.wordKey);
      takenWords.add(flat[k]!.wordKey);
    }
    const touchedGroups = new Set<number>();
    for (const f of flat) {
      if (matchedWords.has(f.wordKey)) touchedGroups.add(f.gIdx);
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

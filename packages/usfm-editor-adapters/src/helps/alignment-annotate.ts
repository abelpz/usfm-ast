import type { DocumentStore } from '@usfm-tools/editor-core';
import { usfmRefToVerseSid } from '@usfm-tools/editor-core';
import type { AlignedWord, AlignmentGroup, AlignmentMap, HelpEntry, TokenAnnotation } from '@usfm-tools/types';

import { annotateTokensByQuote, matchHelpQuoteToTokenIndices } from './quote-matcher';
import { normalizeHelpsText, tokenizeVersePlainText, versePlainTextFromStore } from './verse-text';

type FlatSource = { gIdx: number; contentNorm: string; occurrence: number };

function flattenSources(groups: AlignmentGroup[]): FlatSource[] {
  const out: FlatSource[] = [];
  for (let gIdx = 0; gIdx < groups.length; gIdx++) {
    for (const w of groups[gIdx]!.sources) {
      out.push({ gIdx, contentNorm: normalizeHelpsText(w.content), occurrence: w.occurrence });
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

/** All subsequence matches (each hit is the list of flat indices), in order of increasing start index. */
function enumerateSubsequenceMatches(flat: FlatSource[], partWords: string[], minFlatIdx: number): number[][] {
  const hits: number[][] = [];
  const lo = Math.max(0, minFlatIdx);
  for (let s = lo; s < flat.length; s++) {
    const m = matchPhraseSubsequenceFrom(flat, partWords, s);
    if (m) hits.push(m);
  }
  return hits;
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

/** Like {@link enumerateSubsequenceMatches}, but order-agnostic multiset anchored at each start index. */
function enumerateMultisetMatches(flat: FlatSource[], partWords: string[], minFlatIdx: number): number[][] {
  const hits: number[][] = [];
  const lo = Math.max(0, minFlatIdx);
  for (let s = lo; s < flat.length; s++) {
    const m = matchPhraseMultisetFromStart(flat, partWords, s);
    if (m) hits.push(m);
  }
  return hits;
}

function enumeratePhraseMatches(flat: FlatSource[], partWords: string[], minFlatIdx: number): number[][] {
  const ordered = enumerateSubsequenceMatches(flat, partWords, minFlatIdx);
  if (ordered.length > 0) return ordered;
  return enumerateMultisetMatches(flat, partWords, minFlatIdx);
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

  /** When the TN `Quote` uses `&`, each segment is matched independently in verse order (UGNT-style segment order may differ from ULT `x-content` order). */
  const multiSegment = rawParts.length > 1;
  let minFlat = 0;
  const tokenIdx = new Set<number>();

  for (let pi = 0; pi < rawParts.length; pi++) {
    const part = rawParts[pi]!;
    // Per-token normalize so commas / punctuation glued to a Greek word in TN/TWL
    // (e.g. "Θεοῦ,") still match alignment `x-content` ("Θεοῦ") after normalizeHelpsText.
    const partWords = part
      .split(/\s+/)
      .map((w) => normalizeHelpsText(w))
      .filter(Boolean);
    if (partWords.length === 0) return [];
    const occ = pi === 0 ? Math.max(1, help.occurrence || 1) : 1;
    const segmentMinFlat = multiSegment ? 0 : minFlat;
    const hits = enumeratePhraseMatches(flat, partWords, segmentMinFlat);
    if (hits.length < occ) return [];
    const matchedFlatIdxs = hits[occ - 1]!;
    if (!multiSegment) minFlat = Math.max(...matchedFlatIdxs) + 1;

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

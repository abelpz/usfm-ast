/**
 * Pure, DOM-free computation for the Helps panel.
 *
 * Everything here is safe to run in a Web Worker because it has no ProseMirror,
 * no IndexedDB, and no `window`/`document` references.  The types only import
 * from `@usfm-tools/types` which is a plain-data package.
 *
 * The matching logic is inlined (adapted) from `@usfm-tools/editor-adapters`
 * helps/alignment-annotate.ts and helps/quote-matcher.ts so the worker bundle
 * does not pull in ProseMirror or the full adapters entry-point.
 */

import type { AlignedWord, AlignmentGroup, AlignmentMap, HelpEntry } from '@usfm-tools/types';

// ─── Serialisable snapshot of one chapter from DocumentStore ──────────────────

/** Plain-data snapshot extracted from a loaded {@link DocumentStore} by the main thread. */
export type StoreSnapshot = {
  bookCode: string;
  /** Pre-extracted plain text for each verse that appears in the help entries. */
  verseTexts: Record<number, string>;
  /** Alignment data for this chapter (verseSid → AlignmentGroup[]). */
  alignments: AlignmentMap;
};

// ─── Output type ─────────────────────────────────────────────────────────────

/** One help entry together with all display-render decisions pre-computed. */
export type ProcessedHelpEntry = {
  entry: HelpEntry;
  gateway: string | null;
  /** Token indices in the verse text that correspond to this entry's quote. */
  tokenIndices: number[];
  rawOrig: string;
  showOrig: boolean;
  /** True when the quote is in a Semitic / Ancient-Greek script (not gateway language). */
  origIsOL: boolean;
  /** Show a catalog-aligned quote block resolved from the gateway source text. */
  showCatalogQuote: boolean;
  /** Show raw origWords as a quote (no source loaded). */
  showOrigAsQuote: boolean;
  /** True when any kind of quote block should be rendered. */
  showQuoteBlock: boolean;
};

// ─── Inlined pure utilities (no external runtime deps) ────────────────────────

function normalizeHelpsText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0591-\u05AF\u05BD]/g, '')
    .replace(/\u05BE/g, ' ')
    .replace(/\u200B|\u200C|\u200D|\u2060|\uFEFF/g, '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .replace(/^[^\p{L}\p{N}\p{M}]+|[^\p{L}\p{N}\p{M}]+$/gu, '')
    .trim();
}

function tokenizeVersePlainText(plain: string): string[] {
  const t = plain.trim();
  return t ? t.split(/\s+/).filter(Boolean) : [];
}

function verseHasAlignmentTargets(groups: AlignmentGroup[] | undefined): boolean {
  return Boolean(groups?.some((g) => g.targets.length > 0));
}

function buildGatewayTokenOccurrences(
  tokens: string[],
): Array<{ norm: string; occurrence: number }> {
  const counts = new Map<string, number>();
  return tokens.map((t) => {
    const norm = normalizeHelpsText(t);
    const c = (counts.get(norm) ?? 0) + 1;
    counts.set(norm, c);
    return { norm, occurrence: c };
  });
}

// ── Quote matching ────────────────────────────────────────────────────────────

type TokenCharSpan = { tokenIndex: number; startInJoined: number; endInJoined: number };

function tokenJoinedSpans(tokens: string[]): { joined: string; spans: TokenCharSpan[] } {
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
  return { joined: normTokens.join(' '), spans };
}

function findNthSubstringIndex(
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

function tokenIndicesOverlappingRange(spans: TokenCharSpan[], start: number, end: number): number[] {
  const out: number[] = [];
  for (const s of spans) {
    if (s.endInJoined > start && s.startInJoined < end) out.push(s.tokenIndex);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

function matchHelpQuoteToTokenIndices(
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

// ── Alignment-based matching ──────────────────────────────────────────────────

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

function matchPhraseSubsequenceFrom(
  flat: FlatSource[],
  partWords: string[],
  startFlatIdx: number,
): number[] | null {
  if (partWords.length === 0) return [];
  let fp = Math.max(0, startFlatIdx);
  const matchedIdx: number[] = [];
  for (let pw = 0; pw < partWords.length; pw++) {
    const want = partWords[pw]!;
    while (fp < flat.length && flat[fp]!.contentNorm !== want) fp++;
    if (fp >= flat.length) return null;
    matchedIdx.push(fp);
    fp++;
  }
  return matchedIdx;
}

function matchPhraseMultisetFromStart(
  flat: FlatSource[],
  partWords: string[],
  startFlatIdx: number,
): number[] | null {
  if (partWords.length === 0) return [];
  const need = new Map<string, number>();
  for (const w of partWords) need.set(w, (need.get(w) ?? 0) + 1);
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
  return remaining > 0 ? null : matchedIdx;
}

function enumeratePhraseMatches(flat: FlatSource[], partWords: string[], minFlatIdx: number): number[][] {
  const lo = Math.max(0, minFlatIdx);
  const ordered: number[][] = [];
  for (let s = lo; s < flat.length; s++) {
    const m = matchPhraseSubsequenceFrom(flat, partWords, s);
    if (m) ordered.push(m);
  }
  if (ordered.length > 0) return ordered;
  const multiset: number[][] = [];
  for (let s = lo; s < flat.length; s++) {
    const m = matchPhraseMultisetFromStart(flat, partWords, s);
    if (m) multiset.push(m);
  }
  return multiset;
}

function mapTargetToTokenIndex(
  meta: Array<{ norm: string; occurrence: number }>,
  target: AlignedWord,
): number {
  const norm = normalizeHelpsText(target.word);
  for (let i = 0; i < meta.length; i++) {
    if (meta[i]!.norm === norm && meta[i]!.occurrence === target.occurrence) return i;
  }
  return -1;
}

function matchHelpEntryToTokenIndicesByAlignment(
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
  const multiSegment = rawParts.length > 1;
  let minFlat = 0;
  const tokenIdx = new Set<number>();
  for (let pi = 0; pi < rawParts.length; pi++) {
    const part = rawParts[pi]!;
    const partWords = part.split(/\s+/).map((w) => normalizeHelpsText(w)).filter(Boolean);
    if (partWords.length === 0) return [];
    const occ = pi === 0 ? Math.max(1, help.occurrence || 1) : 1;
    const segmentMinFlat = multiSegment ? 0 : minFlat;
    const hits = enumeratePhraseMatches(flat, partWords, segmentMinFlat);
    if (hits.length < occ) return [];
    const matchedFlatIdxs = hits[occ - 1]!;
    if (!multiSegment) minFlat = Math.max(...matchedFlatIdxs) + 1;
    const primaryKeys = new Set<string>();
    for (const k of matchedFlatIdxs) {
      const f = flat[k]!;
      primaryKeys.add(`${f.contentNorm}\x00${f.occurrence}`);
    }
    const touchedGroups = new Set<number>();
    for (const f of flat) {
      if (primaryKeys.has(`${f.contentNorm}\x00${f.occurrence}`)) touchedGroups.add(f.gIdx);
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

function usfmRefToVerseSidLocal(bookCode: string, chapter: number, verse: number): string {
  return `${bookCode.trim().toUpperCase()} ${chapter}:${verse}`;
}

function isOriginalLanguageScript(text: string): boolean {
  return /[\u0590-\u05FF\u0370-\u03FF\u1F00-\u1FFF]/.test(text);
}

// ─── Gateway quote match for one entry (store-free) ──────────────────────────

type GatewayMatchResult = { gatewayText: string | null; tokenIndices: number[] };

function alignedGatewayQuoteMatch(
  verseText: string,
  bookCode: string,
  alignments: AlignmentMap,
  help: HelpEntry,
): GatewayMatchResult {
  const tokens = tokenizeVersePlainText(verseText);
  if (!tokens.length) return { gatewayText: null, tokenIndices: [] };
  const verseSid = usfmRefToVerseSidLocal(bookCode, help.ref.chapter, help.ref.verse);
  const groups = alignments[verseSid];
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

function quoteTokenIndices(
  verseText: string,
  help: HelpEntry,
): number[] {
  const tokens = tokenizeVersePlainText(verseText);
  return matchHelpQuoteToTokenIndices(tokens, help.origWords, help.occurrence);
}

// ─── Main export: filter + sort + match in one pass ──────────────────────────

/**
 * Compute the full processed entry list for a chapter:
 *   1. Filter TN/TWL rows to the given chapter (or book introduction).
 *   2. Sort by verse (intro first, then verse number, then row id).
 *   3. For each row: resolve gateway quote, token indices, and all render flags.
 *
 * Pure function — safe to call on a Web Worker.
 */
export function computeChapterHelps(
  twl: HelpEntry[],
  tn: HelpEntry[],
  chapter: number,
  source: StoreSnapshot | null,
): ProcessedHelpEntry[] {
  // ── 1. Filter ──────────────────────────────────────────────────────────────
  const rows = [...twl, ...tn].filter((e) => {
    if (e.ref.segment === 'bookIntro') return false;
    if (e.ref.chapter !== chapter) return false;
    return e.ref.segment === 'chapterIntro' || e.ref.verse > 0;
  });

  // ── 2. Sort ────────────────────────────────────────────────────────────────
  rows.sort((a, b) => {
    const aIntro = a.ref.segment === 'chapterIntro' ? -1 : a.ref.verse;
    const bIntro = b.ref.segment === 'chapterIntro' ? -1 : b.ref.verse;
    if (aIntro !== bIntro) return aIntro - bIntro;
    return a.id.localeCompare(b.id);
  });

  // ── 3. Process each entry ──────────────────────────────────────────────────
  return rows.map((entry): ProcessedHelpEntry => {
    const rawOrig = (entry.origWords ?? '').trim();
    const showOrig = Boolean(rawOrig);
    const origIsOL = showOrig && isOriginalLanguageScript(rawOrig);

    if (!source) {
      return {
        entry,
        gateway: null,
        tokenIndices: [],
        rawOrig,
        showOrig,
        origIsOL,
        showCatalogQuote: false,
        showOrigAsQuote: showOrig && (!origIsOL),
        showQuoteBlock: showOrig && (!origIsOL),
      };
    }

    const verseText = source.verseTexts[entry.ref.verse] ?? '';
    const { gatewayText, tokenIndices } = alignedGatewayQuoteMatch(
      verseText,
      source.bookCode,
      source.alignments,
      entry,
    );
    const gateway = gatewayText;

    // Quote indices via catalog origWords (for partial-gateway detection)
    const quoteIdx =
      showOrig && !origIsOL ? quoteTokenIndices(verseText, entry) : [];

    const uniqBuilt = new Set(tokenIndices).size;
    const uniqQuote = new Set(quoteIdx).size;
    const partialGateway = Boolean(gateway) && quoteIdx.length > 0 && uniqQuote > uniqBuilt;

    const showCatalogQuote = showOrig && (!gateway || partialGateway);
    const showOrigAsQuote = showOrig && (!origIsOL || !gateway);
    const showQuoteBlock = Boolean(gateway || showCatalogQuote || showOrigAsQuote);

    return {
      entry,
      gateway,
      tokenIndices,
      rawOrig,
      showOrig,
      origIsOL,
      showCatalogQuote,
      showOrigAsQuote,
      showQuoteBlock,
    };
  });
}

/**
 * Same as {@link computeChapterHelps} but for the book introduction screen.
 */
export function computeIntroHelps(twl: HelpEntry[], tn: HelpEntry[]): ProcessedHelpEntry[] {
  const rows = [...twl, ...tn].filter((e) => e.ref.segment === 'bookIntro');
  rows.sort((a, b) => a.id.localeCompare(b.id));
  return rows.map((entry): ProcessedHelpEntry => {
    const rawOrig = (entry.origWords ?? '').trim();
    const showOrig = Boolean(rawOrig);
    const origIsOL = showOrig && isOriginalLanguageScript(rawOrig);
    return {
      entry,
      gateway: null,
      tokenIndices: [],
      rawOrig,
      showOrig,
      origIsOL,
      showCatalogQuote: false,
      showOrigAsQuote: showOrig && !origIsOL,
      showQuoteBlock: showOrig && !origIsOL,
    };
  });
}

/**
 * Alignment provenance: which source text a gateway translation is aligned to (`\rem` + detection).
 */

import type { AlignmentMap, OriginalWord } from '@usfm-tools/types';
import type { UsjDocument } from './document-store';
import type { OriginalWordToken } from './word-identity';
import { alignmentWordSurfacesEqual } from './word-diff';

const REM_PREFIX = 'alignment-source:';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function walkContent(nodes: unknown[], visit: (n: Record<string, unknown>) => void): void {
  for (const n of nodes) {
    if (!isRecord(n)) continue;
    visit(n);
    if (Array.isArray(n.content)) walkContent(n.content as unknown[], visit);
  }
}

function hasZalnMarkers(usj: { content?: unknown[] }): boolean {
  let found = false;
  walkContent((usj.content ?? []) as unknown[], (n) => {
    if (n.type === 'ms' && n.marker === 'zaln-s') found = true;
  });
  return found;
}

export type AlignmentSourceRef = {
  /** Stable id, e.g. `el-x-koine/ugnt` */
  identifier: string;
  /** Optional version string, e.g. `85` */
  version?: string;
};

/**
 * Parse `\\rem alignment-source: <identifier> [v<version>]` from document headers.
 */
export function parseAlignmentSource(usj: { content?: unknown[] }): AlignmentSourceRef | null {
  let best: AlignmentSourceRef | null = null;
  walkContent((usj.content ?? []) as unknown[], (n) => {
    if (n.type !== 'para' || n.marker !== 'rem') return;
    const text = extractRemText(n);
    const trimmed = text.trim();
    if (!trimmed.toLowerCase().startsWith(REM_PREFIX)) return;
    const rest = trimmed.slice(REM_PREFIX.length).trim();
    const parsed = parseSourceRest(rest);
    if (parsed) best = parsed;
  });
  return best;
}

function extractRemText(node: Record<string, unknown>): string {
  const c = node.content;
  if (typeof c === 'string') return c;
  if (!Array.isArray(c)) return '';
  let s = '';
  for (const x of c) {
    if (typeof x === 'string') s += x;
    else if (isRecord(x) && x.type === 'text' && typeof x.content === 'string') s += x.content;
  }
  return s;
}

function parseSourceRest(rest: string): AlignmentSourceRef | null {
  if (!rest) return null;
  const vMatch = rest.match(/\bv(\d+|[\w.-]+)\s*$/i);
  let version: string | undefined;
  let idPart = rest;
  if (vMatch) {
    version = vMatch[1];
    idPart = rest.slice(0, vMatch.index).trim();
  }
  const identifier = idPart.replace(/\s+/g, ' ').trim();
  if (!identifier) return null;
  return { identifier, version };
}

/**
 * Build canonical string for comparison (identifier + optional version).
 */
export function alignmentSourceKey(ref: AlignmentSourceRef): string {
  return ref.version ? `${ref.identifier}@${ref.version}` : ref.identifier;
}

/**
 * Full `\\id` identity string: parser-style USJ uses `type: 'book'`, `code` (first field), plus
 * trailing text in `content`; paragraph-style uses `extractRemText` only.
 */
function extractIdLineFromUsjNode(n: Record<string, unknown>): string {
  if (n.marker !== 'id') return '';
  if (n.type === 'book' && typeof n.code === 'string') {
    const tail = extractRemText(n).trim();
    if (!tail) return n.code.trim();
    return `${n.code.trim()} ${tail}`.replace(/\s+/g, ' ').trim();
  }
  return extractRemText(n);
}

/**
 * Parse `\\id` line first field (book) and rest as a loose identity string for provenance matching.
 */
export function parseDocumentIdentityFromUsj(usj: { content?: unknown[] }): string | null {
  let idLine = '';
  walkContent((usj.content ?? []) as unknown[], (n) => {
    if (idLine) return;
    if ((n.type === 'para' || n.type === 'book') && n.marker === 'id') {
      idLine = extractIdLineFromUsjNode(n);
    }
  });
  if (!idLine.trim()) return null;
  return idLine.trim().replace(/\s+/g, ' ');
}

export type AlignmentState = 'unaligned' | 'aligned' | 'has-markers-no-provenance';

/** Confidence from comparing loaded source tokens to embedded alignment {@link OriginalWord} rows. */
export type SourceMatchConfidence = 'exact' | 'high' | 'partial' | 'none';

export type SourceMatchResult = {
  /** Overall confidence from the fraction of alignment source words that matched tokens */
  confidence: SourceMatchConfidence;
  /** Fraction of alignment source words that matched (0..1) */
  matchRatio: number;
  /** Verses that had at least one {@link OriginalWord} in alignment groups */
  versesCompared: number;
  /** Verses where every alignment source word matched the loaded document */
  versesMatched: number;
  /** Per-verse problems (mismatched words or missing verse key in source) */
  mismatches: Array<{ verseSid: string; reason: string }>;
};

function normalizeVerseSidKey(sid: string): string {
  return sid.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
}

/**
 * Find a key in `sourceTokensByVerse` that corresponds to `verseRef` (exact, normalized, or same chapter:verse suffix).
 */
export function resolveSourceVerseKey(
  sourceTokensByVerse: Record<string, OriginalWordToken[]>,
  verseRef: string,
): string | null {
  if (Object.prototype.hasOwnProperty.call(sourceTokensByVerse, verseRef)) return verseRef;
  const want = normalizeVerseSidKey(verseRef);
  for (const k of Object.keys(sourceTokensByVerse)) {
    if (normalizeVerseSidKey(k) === want) return k;
  }
  const mWant = verseRef.trim().match(/(\d+):(\d+)\s*$/);
  if (mWant) {
    const ch = mWant[1]!;
    const vs = mWant[2]!;
    const candidates = Object.keys(sourceTokensByVerse).filter((k) => {
      const m = k.trim().match(/(\d+):(\d+)\s*$/);
      return m && m[1] === ch && m[2] === vs;
    });
    if (candidates.length === 1) return candidates[0]!;
  }
  return null;
}

function st(s: string): string {
  return s.trim();
}

/**
 * Whether an embedded {@link OriginalWord} matches a token from the loaded original-language document.
 */
export function originalWordMatchesToken(ow: OriginalWord, tok: OriginalWordToken): boolean {
  const owS = st(ow.strong);
  const tkS = st(tok.strong);
  if (owS && tkS && owS.toLowerCase() === tkS.toLowerCase()) return true;

  const owL = st(ow.lemma);
  const tkL = st(tok.lemma);
  if (owL && tkL && owL.toLowerCase() === tkL.toLowerCase() && ow.occurrence === tok.occurrence) {
    return true;
  }

  const owC = st(ow.content);
  const surf = st(tok.surface);
  if (owC && surf && alignmentWordSurfacesEqual(owC, surf) && ow.occurrence === tok.occurrence) {
    return true;
  }

  if (
    !owS &&
    !tkS &&
    owL &&
    tkL &&
    owL.toLowerCase() === tkL.toLowerCase() &&
    alignmentWordSurfacesEqual(owC, surf)
  ) {
    return true;
  }

  return false;
}

/**
 * Compare tokenized alignment-source words to embedded alignment groups' {@link OriginalWord} entries.
 */
export function matchSourceToExistingAlignments(
  sourceTokensByVerse: Record<string, OriginalWordToken[]>,
  alignments: AlignmentMap,
): SourceMatchResult {
  let total = 0;
  let matched = 0;
  const mismatches: Array<{ verseSid: string; reason: string }> = [];
  let versesCompared = 0;
  let versesAllMatched = 0;

  for (const [verseRef, groups] of Object.entries(alignments)) {
    if (groups.length === 0) continue;

    const sourceKey = resolveSourceVerseKey(sourceTokensByVerse, verseRef);
    const tokens = sourceKey ? sourceTokensByVerse[sourceKey] ?? [] : [];

    let verseSourceWords = 0;
    let verseMatched = 0;
    let verseHasAnySource = false;

    for (const g of groups) {
      for (const ow of g.sources) {
        verseHasAnySource = true;
        total++;
        verseSourceWords++;
        const ok = tokens.some((tok) => originalWordMatchesToken(ow, tok));
        if (ok) {
          matched++;
          verseMatched++;
        }
      }
    }

    if (!verseHasAnySource) continue;

    versesCompared++;
    if (!sourceKey) {
      mismatches.push({
        verseSid: verseRef,
        reason: 'No matching verse in the loaded source for this alignment key',
      });
      continue;
    }
    if (verseSourceWords === verseMatched) {
      versesAllMatched++;
    } else {
      mismatches.push({
        verseSid: verseRef,
        reason: `${verseSourceWords - verseMatched} source word(s) did not match the loaded document`,
      });
    }
  }

  if (total === 0) {
    return {
      confidence: 'exact',
      matchRatio: 1,
      versesCompared: 0,
      versesMatched: 0,
      mismatches: [],
    };
  }

  const matchRatio = matched / total;
  let confidence: SourceMatchConfidence;
  if (matchRatio >= 1) confidence = 'exact';
  else if (matchRatio >= 0.9) confidence = 'high';
  else if (matchRatio >= 0.5) confidence = 'partial';
  else confidence = 'none';

  return {
    confidence,
    matchRatio,
    versesCompared,
    versesMatched: versesAllMatched,
    mismatches,
  };
}

export function detectAlignmentState(usj: { content?: unknown[] }): AlignmentState {
  const rem = parseAlignmentSource(usj);
  const zaln = hasZalnMarkers(usj);
  if (rem && zaln) return 'aligned';
  if (zaln && !rem) return 'has-markers-no-provenance';
  if (!zaln && !rem) return 'unaligned';
  if (rem && !zaln) return 'unaligned';
  return 'unaligned';
}

export type SourceCompatibility = {
  compatible: boolean;
  existing: AlignmentSourceRef | null;
  requested: AlignmentSourceRef | null;
  reason?: string;
  /** Word-level match of loaded source tokens vs embedded alignment sources (after {@link loadAlignmentSource}) */
  wordMatch?: SourceMatchResult;
};

/**
 * Compare translation `\\rem alignment-source` to the chosen source document identity.
 * Matching is substring/normalized: requested key should equal existing, or existing identifier
 * contained in source id line (or vice versa) for loose RC-style ids.
 */
export function checkSourceCompatibility(
  translationUsj: { content?: unknown[] },
  sourceUsj: { content?: unknown[] }
): SourceCompatibility {
  const existing = parseAlignmentSource(translationUsj);
  const sourceIdLine = parseDocumentIdentityFromUsj(sourceUsj);
  const requested: AlignmentSourceRef | null = sourceIdLine
    ? { identifier: sourceIdLine }
    : null;

  if (!existing) {
    return {
      compatible: true,
      existing: null,
      requested,
      reason: undefined,
    };
  }

  if (!requested) {
    return {
      compatible: false,
      existing,
      requested: null,
      reason: 'Could not read identity from source document (\\id).',
    };
  }

  const ex = alignmentSourceKey(existing).toLowerCase();
  const req = alignmentSourceKey(requested).toLowerCase();
  if (ex === req) {
    return { compatible: true, existing, requested };
  }
  const exId = existing.identifier.toLowerCase();
  const reqId = requested.identifier.toLowerCase();
  if (exId && (reqId.includes(exId) || exId.includes(reqId))) {
    return { compatible: true, existing, requested };
  }

  return {
    compatible: false,
    existing,
    requested,
    reason: `Translation is aligned to "${existing.identifier}" but the selected source does not match.`,
  };
}

/**
 * Insert or update a `\\rem alignment-source:` paragraph near the start of the document.
 * Mutates and returns the same USJ object shape (content array).
 */
export function setAlignmentSource(
  usj: UsjDocument,
  ref: AlignmentSourceRef
): UsjDocument {
  const content = [...(usj.content ?? [])];
  const line =
    ref.version !== undefined
      ? `${REM_PREFIX} ${ref.identifier} v${ref.version}`
      : `${REM_PREFIX} ${ref.identifier}`;

  let idx = -1;
  for (let i = 0; i < content.length; i++) {
    const n = content[i];
    if (!isRecord(n)) continue;
    if (n.type === 'para' && n.marker === 'rem') {
      const t = extractRemText(n);
      if (t.trim().toLowerCase().startsWith(REM_PREFIX)) {
        idx = i;
        break;
      }
    }
  }

  const remNode = {
    type: 'para',
    marker: 'rem',
    content: [line],
  };

  if (idx >= 0) {
    content[idx] = remNode;
  } else {
    let insertAt = 0;
    for (let i = 0; i < content.length; i++) {
      const n = content[i];
      if (isRecord(n) && (n.type === 'chapter' || n.marker === 'c')) {
        insertAt = i;
        break;
      }
      insertAt = i + 1;
    }
    content.splice(insertAt, 0, remNode);
  }

  return { ...usj, content: content as UsjDocument['content'] };
}

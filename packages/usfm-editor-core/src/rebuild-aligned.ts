/**
 * Merge EditableUSJ plain text + AlignmentMap back into USJ-shaped nodes (zaln / \w).
 *
 * Key rules (see docs/29-alignment-patterns-english-spanish.md):
 *
 * 1. Target position lookup uses the stored `AlignedWord.occurrence` — the 1-based index into all
 *    occurrences of that surface form in the verse (including unaligned words). This correctly
 *    handles repeated surface words and inverted clause order (Sec 6 & 7 of the patterns doc).
 *
 * 2. `\w` x-occurrence / x-occurrences come from the stored `AlignedWord` fields, which the strip
 *    layer reads from the original USFM. They are NOT recomputed from the aligned-only subset.
 *
 * 3. `\zaln-s` markers open at a group's FIRST target position and close at the LAST. This means
 *    non-contiguous groups (Sec 5) stay open while other groups' tokens are emitted between their
 *    targets, producing the correct nested USFM milestone structure.
 *
 * 4. When a raw token has punctuation attached (e.g. "Pablo,"), the word core ("Pablo") is matched
 *    and wrapped in `\w`, and the punctuation suffix is emitted as a plain string after it.
 */

import type {
  AlignmentGroup,
  AlignmentMap,
  AlignedWord,
  EditableUSJ,
  OriginalWord,
} from '@usfm-tools/types';
import { tokenizeWords } from './word-diff';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function msZalnS(o: OriginalWord): Record<string, unknown> {
  const n: Record<string, unknown> = {
    type: 'ms',
    marker: 'zaln-s',
    'x-strong': o.strong,
    'x-lemma': o.lemma,
    'x-content': o.content,
    'x-occurrence': String(o.occurrence),
    'x-occurrences': String(o.occurrences),
  };
  if (o.morph !== undefined) n['x-morph'] = o.morph;
  return n;
}

function msZalnE(): Record<string, unknown> {
  return { type: 'ms', marker: 'zaln-e' };
}

/** Emit a `\w` node using the occurrence data already stored on the AlignedWord. */
function wNode(t: AlignedWord): Record<string, unknown> {
  return {
    type: 'char',
    marker: 'w',
    content: [t.word],
    'x-occurrence': String(t.occurrence),
    'x-occurrences': String(t.occurrences),
  };
}

/** Emit one alignment group in USJ shape (contiguous targets, stacked sources). */
export function emitAlignmentGroup(g: { sources: OriginalWord[]; targets: AlignedWord[] }): unknown[] {
  const out: unknown[] = [];
  for (const s of g.sources) {
    out.push(msZalnS(s));
  }
  for (const t of g.targets) {
    out.push(wNode(t));
  }
  for (let i = g.sources.length - 1; i >= 0; i--) {
    out.push(msZalnE());
  }
  return out;
}

/**
 * Strip non-word characters from the start and end of a whitespace-delimited token so that a raw
 * token like "Pablo," can be matched against an AlignedWord whose word field is "Pablo".
 *
 * Keeps letters (Unicode \p{L}), digits (\p{N}), ASCII apostrophe, and right single quotation
 * mark (U+2019) — the usual components of an actual word.
 */
function normalizeToken(tok: string): string {
  return tok.replace(/^[^\p{L}\p{N}'\u2019]+|[^\p{L}\p{N}'\u2019]+$/gu, '');
}

function wordsFromStrippedFragments(buf: unknown[]): string[] {
  const words: string[] = [];
  for (const x of buf) {
    if (typeof x !== 'string') continue;
    const trimmed = x.trim();
    if (!trimmed) continue;
    words.push(...tokenizeWords(x));
  }
  return words;
}

/** Groups with at least one target. */
function activeAlignmentGroups(groups: AlignmentGroup[]): AlignmentGroup[] {
  return groups.filter((g) => g.targets.length > 0);
}

// ---------------------------------------------------------------------------
// Occurrence-based target position resolution
// ---------------------------------------------------------------------------

interface ResolvedGroup {
  sources: OriginalWord[];
  targets: AlignedWord[];
  /** Position in the full verse raw-token stream for each target (parallel to `targets`). */
  positions: number[];
  /** Raw position of the group's first target (where zaln-s opens). */
  firstPos: number;
  /** Raw position of the group's last target (where zaln-e closes). */
  lastPos: number;
}

/**
 * For every AlignmentGroup, locate each target word in the full verse token stream using the
 * stored `AlignedWord.occurrence` (1-based; counts ALL occurrences including unaligned words).
 *
 * Returns null if any target cannot be resolved (triggers rebuild fallback).
 */
function resolveTargetPositions(
  groups: AlignmentGroup[],
  raw: string[],
): ResolvedGroup[] | null {
  // Build per-normalized-word position list so we can pick the occurrence-th slot.
  const positionsOf = new Map<string, number[]>();
  for (let i = 0; i < raw.length; i++) {
    const norm = normalizeToken(raw[i]!);
    if (!norm) continue;
    if (!positionsOf.has(norm)) positionsOf.set(norm, []);
    positionsOf.get(norm)!.push(i);
  }

  const resolved: ResolvedGroup[] = [];
  for (const g of groups) {
    const positions: number[] = [];
    for (const t of g.targets) {
      const key = normalizeToken(t.word);
      const slots = positionsOf.get(key) ?? [];
      // occurrence is 1-based; slots is sorted ascending by raw position
      const pos = slots[t.occurrence - 1];
      if (pos === undefined) return null; // target missing from verse text
      positions.push(pos);
    }
    if (positions.length === 0) return null;
    resolved.push({
      sources: g.sources,
      targets: g.targets,
      positions,
      firstPos: Math.min(...positions),
      lastPos: Math.max(...positions),
    });
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Verse inline content rebuild
// ---------------------------------------------------------------------------

/**
 * Rebuild inline content for one verse using span-based zaln placement:
 *
 * - Each group's `\zaln-s` markers open at the group's FIRST target position.
 * - Each group's `\zaln-e` markers close at the group's LAST target position.
 * - Groups whose last target is beyond another group's first target stay open across that other
 *   group's tokens (non-contiguous pattern, Sec 5).
 * - When multiple groups open at the same position the outermost (largest span) opens first, so
 *   the innermost closes first — preserving well-nested milestones.
 * - `\w` occurrence data is taken from the stored AlignedWord, which was read from the original
 *   USFM and already counts ALL verse tokens (including unaligned).
 * - If a raw token has punctuation attached (e.g. "Pablo,"), the word core is matched for the
 *   `\w` node and the punctuation suffix is emitted as a plain string immediately after.
 */
function rebuildVerseInlineContent(
  versePieces: unknown[],
  verseRef: string,
  alignments: AlignmentMap,
): unknown[] {
  const groups = activeAlignmentGroups(alignments[verseRef] ?? []);
  if (groups.length === 0) return versePieces;

  const stringParts = versePieces.filter((x): x is string => typeof x === 'string');
  const raw = wordsFromStrippedFragments(stringParts);

  const resolved = resolveTargetPositions(groups, raw);
  if (!resolved) return versePieces;

  // Build targetAt: rawPos → { resolvedGroup, targetIndex }.
  // Two groups may not claim the same raw position (would be a data error).
  const targetAt = new Map<number, { rg: ResolvedGroup; ti: number }>();
  for (const rg of resolved) {
    for (let ti = 0; ti < rg.positions.length; ti++) {
      const pos = rg.positions[ti]!;
      if (targetAt.has(pos)) return versePieces; // collision → bail
      targetAt.set(pos, { rg, ti });
    }
  }

  // Build opensAt / closesAt keyed by raw position.
  const opensAt = new Map<number, ResolvedGroup[]>();
  const closesAt = new Map<number, ResolvedGroup[]>();
  for (const rg of resolved) {
    if (!opensAt.has(rg.firstPos)) opensAt.set(rg.firstPos, []);
    opensAt.get(rg.firstPos)!.push(rg);
    if (!closesAt.has(rg.lastPos)) closesAt.set(rg.lastPos, []);
    closesAt.get(rg.lastPos)!.push(rg);
  }
  // Outermost (largest span) opens first so inner groups are nested inside.
  for (const arr of opensAt.values()) {
    arr.sort((a, b) => b.lastPos - b.firstPos - (a.lastPos - a.firstPos));
  }
  // Innermost (smallest span) closes first (mirror of open order).
  for (const arr of closesAt.values()) {
    arr.sort((a, b) => a.lastPos - a.firstPos - (b.lastPos - b.firstPos));
  }

  const out: unknown[] = [];
  let rawIdx = 0;

  for (const item of versePieces) {
    if (typeof item !== 'string') {
      out.push(item);
      continue;
    }
    if (!item.trim()) {
      // Whitespace-only fragment — preserve as-is (spaces between verses, etc.)
      out.push(item);
      continue;
    }

    // Walk the string with a non-whitespace regex so that spaces and trailing
    // characters (newlines, punctuation between tokens, etc.) are preserved
    // as plain strings in the output rather than stripped by tokenizeWords.
    let pos = 0;
    const tokenRe = /\S+/g;
    let match: RegExpExecArray | null;
    while ((match = tokenRe.exec(item)) !== null) {
      // Preserve any leading whitespace before this token.
      if (match.index > pos) out.push(item.slice(pos, match.index));
      pos = match.index + match[0].length;
      const tok = match[0];

      // 1. Open groups whose first target is at this position (outermost first).
      for (const rg of opensAt.get(rawIdx) ?? []) {
        for (const s of rg.sources) out.push(msZalnS(s));
      }

      // 2. Emit the token — either as a \w node (aligned) or plain string (unaligned).
      const entry = targetAt.get(rawIdx);
      if (entry) {
        const { rg, ti } = entry;
        const norm = normalizeToken(tok);
        // Split attached punctuation so the \w node contains only the word core.
        const wordStart = tok.indexOf(norm);
        const prefix = wordStart > 0 ? tok.slice(0, wordStart) : '';
        const suffix = tok.slice(wordStart + norm.length);
        if (prefix) out.push(prefix);
        // Use stored occurrence / occurrences (relative to full verse, not aligned-only subset).
        out.push(wNode(rg.targets[ti]!));
        if (suffix) out.push(suffix);
      } else {
        out.push(tok);
      }

      // 3. Close groups whose last target was this position (innermost first).
      for (const rg of closesAt.get(rawIdx) ?? []) {
        for (let i = rg.sources.length - 1; i >= 0; i--) {
          out.push(msZalnE());
        }
      }

      rawIdx++;
    }
    // Preserve any trailing whitespace / characters after the last token.
    if (pos < item.length) out.push(item.slice(pos));
  }

  // If we didn't consume every raw token the mapping is inconsistent — return original.
  if (rawIdx !== raw.length) return versePieces;

  return out;
}

// ---------------------------------------------------------------------------
// Tree traversal (unchanged public API)
// ---------------------------------------------------------------------------

function transformSubtree(
  node: unknown,
  ctx: { verseRef: string },
  alignments: AlignmentMap,
): unknown {
  if (!isRecord(node)) return node;
  const o = node as Record<string, unknown>;
  if (o.type === 'verse' && typeof o.sid === 'string') {
    ctx.verseRef = o.sid;
  }
  if (Array.isArray(o.content)) {
    const verseSid =
      o.type === 'verse' && typeof o.sid === 'string' ? o.sid : undefined;
    return {
      ...o,
      content: rebuildArray(o.content as unknown[], ctx, alignments, verseSid),
    };
  }
  return { ...o };
}

/** Re-insert alignment milestones and `\w` (inverse of stripArray). */
export function rebuildArray(
  nodes: unknown[],
  ctx: { verseRef: string },
  alignments: AlignmentMap,
  verseInlineSid?: string,
): unknown[] {
  const out: unknown[] = [];
  let buf: unknown[] = [];
  let pendingVerse = verseInlineSid ?? '';

  const flushBuf = () => {
    if (buf.length === 0 || !pendingVerse) {
      buf = [];
      return;
    }
    out.push(...rebuildVerseInlineContent(buf, pendingVerse, alignments));
    buf = [];
  };

  for (const item of nodes) {
    if (isRecord(item) && item.type === 'verse' && typeof item.sid === 'string') {
      flushBuf();
      pendingVerse = item.sid;
      ctx.verseRef = pendingVerse;
      out.push(transformSubtree(item, ctx, alignments));
      continue;
    }
    if (pendingVerse) {
      buf.push(item);
    } else {
      out.push(transformSubtree(item, ctx, alignments));
    }
  }
  flushBuf();
  return out;
}

export function rebuildAlignedUsj(
  editable: EditableUSJ,
  alignments: AlignmentMap,
): { type: 'USJ'; version: string; content: unknown[] } {
  const ctx = { verseRef: '' };
  const content = rebuildArray(editable.content ?? [], ctx, alignments);
  return {
    type: 'USJ',
    version: editable.version,
    content,
  };
}

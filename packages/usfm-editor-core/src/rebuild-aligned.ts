/**
 * Merge EditableUSJ plain text + AlignmentMap back into USJ-shaped nodes (zaln / \\w).
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

function wNode(t: AlignedWord): Record<string, unknown> {
  return {
    type: 'char',
    marker: 'w',
    content: [t.word],
    'x-occurrence': String(t.occurrence),
    'x-occurrences': String(t.occurrences),
  };
}

function occurrenceAt(words: string[], index: number): { occurrence: number; occurrences: number } {
  const w = words[index];
  const occurrences = words.filter((x) => x === w).length;
  const occurrence = words.slice(0, index + 1).filter((x) => x === w).length;
  return { occurrence, occurrences };
}

/** Emit one alignment group in USJ shape. */
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
 * Gateway words after {@link stripArray}: one or more `\\w` texts per fragment; whitespace-only
 * fragments are glue. Do **not** concatenate fragments (adjacent `\\w` strings may omit a space
 * character in the array, but they are still separate words).
 */
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

/**
 * Alignment targets omit punctuation that appears as separate string siblings (e.g. `", "` after
 * `\\w`). Match `expected` in order as a subsequence of `raw` tokens.
 */
function pickWordsForAlignment(raw: string[], expected: string[]): string[] | null {
  let j = 0;
  const picked: string[] = [];
  for (let i = 0; i < raw.length && j < expected.length; i++) {
    if (raw[i] === expected[j]) {
      picked.push(raw[i]!);
      j++;
    }
  }
  if (j !== expected.length) return null;
  return picked;
}

/** Groups with at least one target (empty groups do not consume expected words). */
function activeAlignmentGroups(groups: AlignmentGroup[]): AlignmentGroup[] {
  return groups.filter((g) => g.targets.length > 0);
}

/**
 * Rebuild inline content for one verse: preserves unaligned words, punctuation-only fragments, and
 * non-string nodes (footnotes, character spans) while re-inserting `zaln` / `\\w` milestones for
 * aligned runs.
 */
function rebuildVerseInlineContent(
  versePieces: unknown[],
  verseRef: string,
  alignments: AlignmentMap
): unknown[] {
  const stringParts = versePieces.filter((x): x is string => typeof x === 'string');
  const raw = wordsFromStrippedFragments(stringParts);
  const groupsAll = alignments[verseRef] ?? [];
  const groups = activeAlignmentGroups(groupsAll);
  const expected = groups.flatMap((g) => g.targets.map((t) => t.word));
  if (expected.length === 0) {
    return versePieces;
  }
  const picked = pickWordsForAlignment(raw, expected);
  if (!picked) {
    return versePieces;
  }

  const out: unknown[] = [];
  let r = 0;
  let expPtr = 0;
  let gi = 0;
  let tInG = 0;
  let baseFlat = 0;

  const emitGroup = (gIdx: number) => {
    const g = groups[gIdx];
    for (const s of g.sources) {
      out.push(msZalnS(s));
    }
    for (let ti = 0; ti < g.targets.length; ti++) {
      const idx = baseFlat + ti;
      const occ = occurrenceAt(picked, idx);
      out.push(
        wNode({
          ...g.targets[ti],
          word: picked[idx],
          occurrence: occ.occurrence,
          occurrences: occ.occurrences,
        })
      );
    }
    for (let i = g.sources.length - 1; i >= 0; i--) {
      out.push(msZalnE());
    }
    baseFlat += g.targets.length;
  };

  for (const item of versePieces) {
    if (typeof item !== 'string') {
      out.push(item);
      continue;
    }
    const frag = item;
    if (!frag.trim()) {
      out.push(frag);
      continue;
    }
    for (const tok of tokenizeWords(frag)) {
      if (r >= raw.length || tok !== raw[r]) {
        return versePieces;
      }
      if (expPtr < expected.length && tok === expected[expPtr]) {
        tInG++;
        expPtr++;
        r++;
        if (gi < groups.length && tInG === groups[gi].targets.length) {
          emitGroup(gi);
          gi++;
          tInG = 0;
        }
      } else {
        out.push(tok);
        r++;
      }
    }
  }

  if (expPtr !== expected.length || gi !== groups.length || tInG !== 0 || r !== raw.length) {
    return versePieces;
  }

  return out;
}

function transformSubtree(
  node: unknown,
  ctx: { verseRef: string },
  alignments: AlignmentMap
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

/**
 * Re-insert alignment milestones and `\\w` (inverse of {@link stripArray}).
 */
export function rebuildArray(
  nodes: unknown[],
  ctx: { verseRef: string },
  alignments: AlignmentMap,
  /** When recursing into a verse node's `content`, pass its `sid` so inline strings rebuild alignments. */
  verseInlineSid?: string
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
  alignments: AlignmentMap
): { type: 'USJ'; version: string; content: unknown[] } {
  const ctx = { verseRef: '' };
  const content = rebuildArray(editable.content ?? [], ctx, alignments);
  return {
    type: 'USJ',
    version: editable.version,
    content,
  };
}

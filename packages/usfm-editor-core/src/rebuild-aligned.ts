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
 * 3. A verse is all of its words, on however many lines it is written: the words of a verse of
 *    poetry are found across its `\q` paragraphs, not only in the one that has its `\v`. What a
 *    verse reaches is said once, for who reads and for who writes (`walkVerseStretches`): not past
 *    its chapter, not the words of a heading, and the title of a psalm as verse 0 of its chapter.
 *
 * 4. A group is written over each unbroken run of its words: `\zaln-s` for each of its original
 *    words, the `\w` of the run, and the `\zaln-e` that close them. A group that another group
 *    interrupts, or that goes on in the next paragraph, is closed and written again with the same
 *    original words where it goes on, as unfoldingWord's tools write it (Sec 5). Groups are never
 *    nested inside one another: read by those tools, a group inside another one is a word aligned
 *    to the original words of both.
 *
 * 5. When a raw token has punctuation attached (e.g. "Pablo,"), the word core ("Pablo") is matched
 *    and wrapped in `\w`. Punctuation after the last word of a run is written after the group, and
 *    punctuation before its first word before it, as other writers do; between two words of a run
 *    it stays between them.
 *
 * 6. The white space that follows a group is not given back by the parser, and whoever reads the
 *    verse puts it back by what comes next (see `readsApartAfterGroup`). Where it would not be put
 *    back («amor —arrecifes» would be read «amor—arrecifes»), that space is written inside the
 *    group, before its `\zaln-e`, where it is kept as it is.
 */

import type {
  AlignmentGroup,
  AlignmentMap,
  AlignedWord,
  EditableUSJ,
  OriginalWord,
} from '@usfm-tools/types';
import { isVerseTextSpan, readsApartAfterGroup, walkVerseStretches } from '@usfm-tools/usj-core';

/** Attributes in the order unfoldingWord's tools write them, so a file they wrote is not all changed lines. */
function msZalnS(o: OriginalWord): Record<string, unknown> {
  const n: Record<string, unknown> = {
    type: 'ms',
    marker: 'zaln-s',
    'x-strong': o.strong,
    'x-lemma': o.lemma,
  };
  if (o.morph !== undefined) n['x-morph'] = o.morph;
  n['x-occurrence'] = String(o.occurrence);
  n['x-occurrences'] = String(o.occurrences);
  n['x-content'] = o.content;
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
  return tok.replace(/^[^\p{L}\p{N}'’]+|[^\p{L}\p{N}'’]+$/gu, '');
}

// ---------------------------------------------------------------------------
// The pieces of a verse
// ---------------------------------------------------------------------------

/**
 * The words of a stretch, in the order they are written: what is between white space in its text, and in the text
 * of its character styles (`\nd`, the `\qs` of a «Selah»). What is inside a note is not counted. The stretches of a
 * verse are the ones `walkVerseStretches` gives, which is how its words are numbered by whoever reads them.
 *
 * The words of a character style were not counted: a word aligned inside one was never found again, and one that
 * the verse repeated outside it was numbered one less than who read the verse numbered it.
 */
function wordsOf(pieces: unknown[]): string[] {
  const words: string[] = [];
  for (const piece of pieces) {
    if (typeof piece === 'string') words.push(...(piece.match(/\S+/g) ?? []));
    else if (isVerseTextSpan(piece)) words.push(...wordsOf(piece.content));
  }
  return words;
}

// ---------------------------------------------------------------------------
// Where each group falls among the words of its verse
// ---------------------------------------------------------------------------

type Owner = { group: AlignmentGroup; target: AlignedWord };

/** The parts of a word that are letters and numbers: what a writer wraps in `\w`. */
const WORD_PART = /[\p{L}\p{N}\p{M}'\u2019]+/gu;

/**
 * Whose a word of the verse is. A word is what stands between white space, and it is one aligned word («Pablo,»)
 * unless its parts were aligned each on its own («self-condemned», «120.000», «day—as»): then each part has its
 * owner. Other writers take those for two words; here they were one word that no aligned word matched, and both
 * groups were lost.
 */
type WordOwners = { whole?: Owner; parts: Map<number, Owner> };

/** A verse while it is written: whose each of its words is, and how many of them were written so far. */
type VersePlan = { owners: Map<number, WordOwners>; written: number };

type Place = { word: number; part?: number };

/**
 * Each target of each group at its place among the words of the verse, by its stored `occurrence` (1-based, among
 * all the words of that surface form, aligned or not). A group with a word the verse no longer has, or with a word
 * another group already took, is left out, and the others are kept: one group that could not be placed took the
 * alignment of its whole verse with it.
 */
function planVerse(groups: AlignmentGroup[], words: string[]): VersePlan {
  const wholes = new Map<string, number[]>();
  const parts = new Map<string, Place[]>();
  const partCount: number[] = [];
  const add = <T>(map: Map<string, T[]>, key: string, value: T) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(value);
  };
  words.forEach((word, index) => {
    add(wholes, normalizeToken(word), index);
    const found = word.match(WORD_PART) ?? [];
    partCount[index] = found.length;
    found.forEach((text, part) => add(parts, normalizeToken(text), { word: index, part }));
  });

  const placeOf = (target: AlignedWord): Place | undefined => {
    const key = normalizeToken(target.word);
    const asWhole = wholes.get(key) ?? [];
    const asPart = parts.get(key) ?? [];
    const k = target.occurrence - 1;
    // Numbered among the parts of words when that is the count it was given.
    const byParts = asPart.length === target.occurrences && asWhole.length !== target.occurrences;
    const place: Place | undefined = !byParts && asWhole[k] !== undefined ? { word: asWhole[k]! } : (asPart[k] ?? (asWhole[k] !== undefined ? { word: asWhole[k]! } : undefined));
    // The only part of a word is the word.
    return place && place.part !== undefined && partCount[place.word] === 1 ? { word: place.word } : place;
  };

  const owners = new Map<number, WordOwners>();
  const taken = (place: Place) => {
    const at = owners.get(place.word);
    if (!at) return false;
    return place.part === undefined ? true : Boolean(at.whole) || at.parts.has(place.part);
  };
  for (const group of groups) {
    if (!group.targets.length || !group.sources.length) continue;
    const places = group.targets.map(placeOf);
    if (places.some((place) => !place || taken(place))) continue;
    // Two of its own words in one place, or the whole of a word and a part of it.
    const clash = places.some((a, i) => places.some((b, j) => i < j && a!.word === b!.word && (a!.part === undefined || b!.part === undefined || a!.part === b!.part)));
    if (clash) continue;
    places.forEach((place, index) => {
      const owner = { group, target: group.targets[index]! };
      const at = owners.get(place!.word) ?? { parts: new Map<number, Owner>() };
      if (place!.part === undefined) at.whole = owner;
      else at.parts.set(place!.part, owner);
      owners.set(place!.word, at);
    });
  }
  return { owners, written: 0 };
}

// ---------------------------------------------------------------------------
// One stretch of a verse, written
// ---------------------------------------------------------------------------

/** `gap`: the white space and punctuation between words. `plain`: a word, or a part of one, that no group has. */
type Unit =
  | { kind: 'word'; owner: Owner }
  | { kind: 'plain'; text: string }
  | { kind: 'gap'; text: string }
  | { kind: 'node'; node: unknown };

function unitsOf(pieces: unknown[], plan: VersePlan): Unit[] {
  const units: Unit[] = [];
  /** One gap between two things that are not gaps, however many pieces it was read in. */
  const gap = (text: string) => {
    const last = units[units.length - 1];
    if (last?.kind === 'gap') last.text += text;
    else units.push({ kind: 'gap', text });
  };
  for (const piece of pieces) {
    if (typeof piece !== 'string') {
      // A character style is written here, in its turn, so its words are counted where `wordsOf` counted them. A
      // group with words on both sides of its edge is closed and written again, as at the edge of a paragraph.
      units.push({ kind: 'node', node: isVerseTextSpan(piece) ? { ...piece, content: emitStretch(piece.content, plan) } : piece });
      continue;
    }
    for (const chunk of piece.match(/\s+|\S+/g) ?? []) {
      if (/^\s/.test(chunk)) {
        gap(chunk);
        continue;
      }
      const owners = plan.owners.get(plan.written++);
      if (owners?.whole) {
        const core = normalizeToken(chunk);
        const at = chunk.indexOf(core);
        if (at > 0) gap(chunk.slice(0, at));
        units.push({ kind: 'word', owner: owners.whole });
        if (at + core.length < chunk.length) gap(chunk.slice(at + core.length));
      } else if (owners?.parts.size) {
        let from = 0;
        let part = 0;
        for (const found of chunk.matchAll(WORD_PART)) {
          if (found.index! > from) gap(chunk.slice(from, found.index));
          const owner = owners.parts.get(part++);
          units.push(owner ? { kind: 'word', owner } : { kind: 'plain', text: found[0] });
          from = found.index! + found[0].length;
        }
        if (from < chunk.length) gap(chunk.slice(from));
      } else if (/[\p{L}\p{N}]/u.test(chunk)) {
        units.push({ kind: 'plain', text: chunk });
      } else {
        // Punctuation standing alone (a dash with a space on each side) is between words, as white space is.
        gap(chunk);
      }
    }
  }
  return units;
}

function emitStretch(pieces: unknown[], plan: VersePlan): unknown[] {
  const units = unitsOf(pieces, plan);
  /** The nearest thing before or after that is not a gap. */
  const beside = (from: number, step: 1 | -1): Unit | undefined => {
    for (let i = from + step; i >= 0 && i < units.length; i += step) {
      if (units[i]!.kind !== 'gap') return units[i];
    }
    return undefined;
  };
  const groupOf = (unit: Unit | undefined) => (unit?.kind === 'word' ? unit.owner.group : undefined);

  const out: unknown[] = [];
  units.forEach((unit, index) => {
    if (unit.kind === 'gap') return void (unit.text && out.push(unit.text));
    if (unit.kind !== 'word') return void out.push(unit.kind === 'node' ? unit.node : unit.text);
    const { group, target } = unit.owner;
    if (groupOf(beside(index, -1)) !== group) {
      for (const source of group.sources) out.push(msZalnS(source));
    }
    out.push(wNode(target));
    const next = beside(index, 1);
    if (groupOf(next) === group) return;
    // The space after this group, when whoever reads the verse would not put it back, stays inside the group.
    const after = units[index + 1];
    const lead = after?.kind === 'gap' ? (/^\s+/.exec(after.text)?.[0] ?? '') : '';
    if (after?.kind === 'gap' && lead) {
      const rest = after.text.slice(lead.length);
      const text = rest + (next?.kind === 'plain' ? next.text : '');
      const putBack =
        next === undefined ||
        (next.kind === 'node'
          ? false
          : text === ''
            ? true
            : readsApartAfterGroup(text, next.kind === 'word' && !/\s$/.test(rest)));
      if (!putBack) {
        out.push(lead);
        after.text = rest;
      }
    }
    for (let i = group.sources.length - 1; i >= 0; i--) out.push(msZalnE());
  });
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Re-insert alignment milestones and `\w` (inverse of stripArray). */
export function rebuildArray(
  nodes: unknown[],
  ctx: { verseRef: string },
  alignments: AlignmentMap,
  verseInlineSid?: string,
): unknown[] {
  const start = verseInlineSid ?? ctx.verseRef;
  // First the words of each verse, wherever they are; then each stretch written with its groups.
  const words = new Map<string, string[]>();
  walkVerseStretches(nodes, { verseRef: start }, (pieces, sid) => {
    if (!words.has(sid)) words.set(sid, []);
    words.get(sid)!.push(...wordsOf(pieces));
    return pieces;
  });
  const plans = new Map<string, VersePlan>();
  for (const [sid, list] of words) {
    const groups = alignments[sid] ?? [];
    if (groups.length) plans.set(sid, planVerse(groups, list));
  }
  ctx.verseRef = start;
  return walkVerseStretches(nodes, ctx, (pieces, sid) => {
    const plan = plans.get(sid);
    return plan ? emitStretch(pieces, plan) : pieces;
  });
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

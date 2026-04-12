/**
 * Derives alignment "boxes" (UI) from reference tokens + {@link AlignmentGroup}[],
 * and pure helpers that produce new group arrays for {@link ScriptureSession.updateAlignment}.
 *
 * User terminology: "source" = translation words; "target" = reference (original) words.
 * Data model: `AlignmentGroup.sources` = original, `.targets` = translation.
 */
import {
  alignmentWordSurfacesEqual,
  normalizeWordForAlignmentMatch,
  originalWordMatchesToken,
  type OriginalWordToken,
  type WordToken,
} from '@usfm-tools/editor-core';
import type { AlignedWord, AlignmentGroup, OriginalWord } from '@usfm-tools/types';
import { useMemo } from 'react';

/** Stable key for translation surface + occurrence (punctuation-normalized). */
function transOccurrenceKey(surface: string, occurrence: number): string {
  return `${normalizeWordForAlignmentMatch(surface)}\0${occurrence}`;
}

export type AlignmentBoxModel = {
  id: string;
  targetTokens: OriginalWordToken[];
  targetTokenIndices: number[];
  /** Translation words aligned into this box (data model: `targets`). */
  alignedSourceWords: AlignedWord[];
  groupIndex: number | null;
};

export function refTokenToOriginalWord(t: OriginalWordToken): OriginalWord {
  return {
    strong: t.strong,
    lemma: t.lemma,
    morph: t.morph,
    content: t.surface,
    occurrence: t.occurrence,
    occurrences: t.occurrences,
  };
}

export function originalWordEquals(a: OriginalWord, b: OriginalWord): boolean {
  return (
    alignmentWordSurfacesEqual(a.content, b.content) &&
    a.strong === b.strong &&
    a.lemma === b.lemma &&
    a.occurrence === b.occurrence &&
    a.occurrences === b.occurrences
  );
}

function refTokenStrictEqualsOriginal(ow: OriginalWord, t: OriginalWordToken): boolean {
  return (
    alignmentWordSurfacesEqual(ow.content, t.surface) &&
    ow.strong === t.strong &&
    ow.lemma === (t.lemma ?? '') &&
    ow.occurrence === t.occurrence &&
    ow.occurrences === t.occurrences
  );
}

/**
 * Map embedded {@link OriginalWord} to a reference token index. Prefer strict equality, then the same
 * loose rules as {@link originalWordMatchesToken} (Strong's / lemma+occurrence / surface) so partially
 * matching UGNT loads still render boxes instead of dropping groups.
 */
function matchRefIndexForSource(ow: OriginalWord, refTok: OriginalWordToken[], used: Set<number>): number | null {
  for (let i = 0; i < refTok.length; i++) {
    if (used.has(i)) continue;
    const t = refTok[i]!;
    if (refTokenStrictEqualsOriginal(ow, t)) return i;
  }
  for (let i = 0; i < refTok.length; i++) {
    if (used.has(i)) continue;
    const t = refTok[i]!;
    if (originalWordMatchesToken(ow, t)) return i;
  }
  return null;
}

/** Build boxes sorted by first reference index in verse order. */
export function deriveAlignmentBoxes(
  refTok: OriginalWordToken[],
  groups: AlignmentGroup[],
  trTok: WordToken[],
): AlignmentBoxModel[] {
  const used = new Set<number>();
  const fromGroups: AlignmentBoxModel[] = [];

  groups.forEach((g, gi) => {
    const indices: number[] = [];
    for (const ow of g.sources) {
      const idx = matchRefIndexForSource(ow, refTok, used);
      if (idx !== null) {
        indices.push(idx);
        used.add(idx);
      }
    }
    const sortedIdx = [...new Set(indices)].sort((a, b) => a - b);
    if (sortedIdx.length === 0) {
      return;
    }
    fromGroups.push({
      id: `g${gi}`,
      groupIndex: gi,
      targetTokenIndices: sortedIdx,
      targetTokens: sortedIdx.map((i) => refTok[i]!),
      alignedSourceWords: sortTargetsByTranslationOrder(trTok, [...g.targets]),
    });
  });

  const singletons: AlignmentBoxModel[] = [];
  for (let i = 0; i < refTok.length; i++) {
    if (!used.has(i)) {
      singletons.push({
        id: `u${i}`,
        groupIndex: null,
        targetTokenIndices: [i],
        targetTokens: [refTok[i]!],
        alignedSourceWords: [],
      });
    }
  }

  return [...fromGroups, ...singletons].sort((a, b) => {
    const ka =
      a.groupIndex !== null
        ? visualOrderKeyForGroup(groups[a.groupIndex]!, refTok)
        : Math.min(...a.targetTokenIndices);
    const kb =
      b.groupIndex !== null
        ? visualOrderKeyForGroup(groups[b.groupIndex]!, refTok)
        : Math.min(...b.targetTokenIndices);
    return ka - kb;
  });
}

function minRefForGroup(g: AlignmentGroup, refTok: OriginalWordToken[]): number {
  let m = Infinity;
  for (const ow of g.sources) {
    const idx = refIndexForOriginalWord(ow, refTok);
    if (idx !== null) m = Math.min(m, idx);
  }
  return Number.isFinite(m) ? m : 0;
}

/** Ref index for a single original word in the verse (strict match first, then {@link originalWordMatchesToken}). */
function refIndexForOriginalWord(ow: OriginalWord, refTok: OriginalWordToken[]): number | null {
  for (let i = 0; i < refTok.length; i++) {
    const t = refTok[i]!;
    if (refTokenStrictEqualsOriginal(ow, t)) return i;
  }
  for (let i = 0; i < refTok.length; i++) {
    const t = refTok[i]!;
    if (originalWordMatchesToken(ow, t)) return i;
  }
  return null;
}

/**
 * Sort key for box / group order: merged groups list the drop-target (anchor) first in
 * `sources`, so we use that word's ref index — not min(sources) — so the merged box stays
 * where the receiver was.
 */
function visualOrderKeyForGroup(g: AlignmentGroup, refTok: OriginalWordToken[]): number {
  if (g.sources.length > 1) {
    const idx = refIndexForOriginalWord(g.sources[0]!, refTok);
    return idx ?? 0;
  }
  return minRefForGroup(g, refTok);
}

export function sortGroupsByRefOrder(groups: AlignmentGroup[], refTok: OriginalWordToken[]): AlignmentGroup[] {
  return [...groups].sort(
    (a, b) => visualOrderKeyForGroup(a, refTok) - visualOrderKeyForGroup(b, refTok),
  );
}

/** First translation token index matching this aligned word (verse order). */
export function transIndexForAlignedWord(trTok: WordToken[], aw: AlignedWord): number | null {
  for (let i = 0; i < trTok.length; i++) {
    const w = trTok[i]!;
    if (alignmentWordSurfacesEqual(w.surface, aw.word) && w.occurrence === aw.occurrence) return i;
  }
  return null;
}

/**
 * Order translation targets by their position in the verse (`trTok`), left to right.
 * Words returned to the word bank therefore match natural bank order; chips in a box follow the same order.
 */
export function sortTargetsByTranslationOrder(trTok: WordToken[], targets: AlignedWord[]): AlignedWord[] {
  if (targets.length <= 1) return targets;
  const annotated = targets.map((t, orig) => ({
    t,
    idx: transIndexForAlignedWord(trTok, t),
    orig,
  }));
  annotated.sort((a, b) => {
    const ia = a.idx ?? Infinity;
    const ib = b.idx ?? Infinity;
    if (ia !== ib) return ia - ib;
    return a.orig - b.orig;
  });
  return annotated.map((x) => x.t);
}

/** Sort alignment groups by reference layout, then translation word order within each group. */
export function finalizeAlignmentGroups(
  refTok: OriginalWordToken[],
  trTok: WordToken[],
  groups: AlignmentGroup[],
): AlignmentGroup[] {
  const sorted = sortGroupsByRefOrder(groups, refTok);
  return sorted.map((g) => ({
    ...g,
    targets: sortTargetsByTranslationOrder(trTok, g.targets),
  }));
}

/**
 * Which translation token indices appear in the alignment grid as linked to the **current**
 * reference tokens. Groups that do not map to any `refTok` (e.g. wrong source loaded) produce no
 * box — their targets are **not** marked aligned here, so the word bank stays draggable.
 */
export function computeAlignedSourceIndices(trTok: WordToken[], boxes: AlignmentBoxModel[]): boolean[] {
  const aligned = new Array(trTok.length).fill(false);
  for (const box of boxes) {
    if (box.groupIndex === null) continue;
    for (const aw of box.alignedSourceWords) {
      const ti = transIndexForAlignedWord(trTok, aw);
      if (ti !== null) aligned[ti] = true;
    }
  }
  return aligned;
}

function dedupeTargets(targets: AlignedWord[]): AlignedWord[] {
  const seen = new Set<string>();
  const out: AlignedWord[] = [];
  for (const t of targets) {
    const k = transOccurrenceKey(t.word, t.occurrence);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(t);
    }
  }
  return out;
}

function alignedWordKey(t: AlignedWord): string {
  return transOccurrenceKey(t.word, t.occurrence);
}

/** Stable key for matching a box across group-array mutations (sorted ref indices). */
function boxRefKey(box: AlignmentBoxModel): string {
  return [...box.targetTokenIndices].sort((a, b) => a - b).join(',');
}

/**
 * Remove aligned translation words from every group except `exceptGroupIndex` (destination).
 * Groups with no targets left are dropped (same idea as {@link removeSourceFromBox}).
 */
function removeAlignedWordsFromOtherGroups(
  groups: AlignmentGroup[],
  words: AlignedWord[],
  exceptGroupIndex: number | null,
): AlignmentGroup[] {
  const keys = new Set(words.map(alignedWordKey));
  const out: AlignmentGroup[] = [];
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi]!;
    if (exceptGroupIndex !== null && gi === exceptGroupIndex) {
      out.push(g);
      continue;
    }
    const targets = g.targets.filter((t) => !keys.has(alignedWordKey(t)));
    if (targets.length === 0) {
      continue;
    }
    out.push({ ...g, targets });
  }
  return out;
}

/**
 * Merge selected boxes into one group at the anchor box's position in visual order.
 */
export function mergeAlignmentBoxes(
  refTok: OriginalWordToken[],
  trTok: WordToken[],
  groups: AlignmentGroup[],
  boxIds: string[],
  anchorBoxId: string,
): AlignmentGroup[] | null {
  const boxes = deriveAlignmentBoxes(refTok, groups, trTok);
  const selected = boxes.filter((b) => boxIds.includes(b.id));
  if (selected.length < 2) return null;
  if (!selected.some((b) => b.id === anchorBoxId)) return null;

  const selectedSet = new Set(boxIds);
  const allTargets: AlignedWord[] = [];
  for (const b of selected) {
    allTargets.push(...b.alignedSourceWords);
  }

  const anchorBox = selected.find((b) => b.id === anchorBoxId)!;
  const others = selected.filter((b) => b.id !== anchorBoxId);
  const anchorRefsSorted = [...anchorBox.targetTokenIndices].sort((a, b) => a - b);
  const otherRefs = new Set<number>();
  for (const b of others) {
    b.targetTokenIndices.forEach((i) => otherRefs.add(i));
  }
  const otherRefsSorted = [...otherRefs].sort((a, b) => a - b);
  const sources = [
    ...anchorRefsSorted.map((i) => refTokenToOriginalWord(refTok[i]!)),
    ...otherRefsSorted.map((i) => refTokenToOriginalWord(refTok[i]!)),
  ];
  const mergedGroup: AlignmentGroup = {
    sources,
    targets: sortTargetsByTranslationOrder(trTok, dedupeTargets(allTargets)),
  };

  const ordered = [...boxes].sort(
    (a, b) => Math.min(...a.targetTokenIndices) - Math.min(...b.targetTokenIndices),
  );
  const result: AlignmentGroup[] = [];
  let mergedPushed = false;
  for (const b of ordered) {
    if (!selectedSet.has(b.id)) {
      if (b.groupIndex !== null) {
        result.push(groups[b.groupIndex]!);
      }
      continue;
    }
    if (!mergedPushed && b.id === anchorBoxId) {
      result.push(mergedGroup);
      mergedPushed = true;
    }
  }
  if (!mergedPushed) {
    result.push(mergedGroup);
  }
  return finalizeAlignmentGroups(refTok, trTok, result);
}

/** Split one group using the same rules as {@link ScriptureSession.splitAlignmentGroup}. */
export function splitAlignmentGroupPure(
  refTok: OriginalWordToken[],
  trTok: WordToken[],
  groups: AlignmentGroup[],
  groupIndex: number,
): AlignmentGroup[] | null {
  const prev = groups;
  const g = prev[groupIndex];
  if (!g) return null;
  if (g.sources.length <= 1 && g.targets.length <= 1) return null;
  const injected: AlignmentGroup[] = [];
  if (g.sources.length === 1) {
    for (const t of g.targets) {
      injected.push({ sources: [...g.sources], targets: [t] });
    }
  } else if (g.targets.length === 1) {
    for (const s of g.sources) {
      injected.push({ sources: [s], targets: [...g.targets] });
    }
  } else {
    const n = Math.min(g.sources.length, g.targets.length);
    for (let i = 0; i < n; i++) {
      injected.push({ sources: [g.sources[i]!], targets: [g.targets[i]!] });
    }
  }
  const without = prev.filter((_, i) => i !== groupIndex);
  without.splice(groupIndex, 0, ...injected);
  return finalizeAlignmentGroups(refTok, trTok, without);
}

/** Remove one reference word from a merged group; that word becomes unaligned (no group). */
export function detachTargetRefFromGroup(
  refTok: OriginalWordToken[],
  trTok: WordToken[],
  groups: AlignmentGroup[],
  groupIndex: number,
  refIndex: number,
): AlignmentGroup[] | null {
  const g = groups[groupIndex];
  if (!g || g.sources.length <= 1) return null;
  const ow = refTokenToOriginalWord(refTok[refIndex]!);
  const si = g.sources.findIndex((s) => originalWordEquals(s, ow));
  if (si < 0) return null;
  const newSources = g.sources.filter((_, i) => i !== si);
  const next = groups.slice();
  if (newSources.length === 0) {
    next.splice(groupIndex, 1);
  } else {
    next[groupIndex] = { ...g, sources: newSources };
  }
  return finalizeAlignmentGroups(refTok, trTok, next);
}

export function addSourcesToBox(
  refTok: OriginalWordToken[],
  trTok: WordToken[],
  groups: AlignmentGroup[],
  boxId: string,
  transIndices: number[],
): AlignmentGroup[] {
  const boxes = deriveAlignmentBoxes(refTok, groups, trTok);
  const box = boxes.find((b) => b.id === boxId);
  if (!box || transIndices.length === 0) return groups;

  const newTargets: AlignedWord[] = transIndices.map((i) => {
    const t = trTok[i]!;
    return { word: t.surface, occurrence: t.occurrence, occurrences: t.occurrences };
  });

  const destRefKey = boxRefKey(box);
  const nextGroups = removeAlignedWordsFromOtherGroups(groups, newTargets, box.groupIndex);

  const boxesAfter = deriveAlignmentBoxes(refTok, nextGroups, trTok);
  const destBox = boxesAfter.find((b) => boxRefKey(b) === destRefKey);
  if (!destBox) {
    return finalizeAlignmentGroups(refTok, trTok, nextGroups);
  }

  if (destBox.groupIndex !== null) {
    const g = nextGroups[destBox.groupIndex]!;
    const merged = sortTargetsByTranslationOrder(trTok, dedupeTargets([...g.targets, ...newTargets]));
    const result = nextGroups.slice();
    result[destBox.groupIndex] = { ...g, targets: merged };
    return finalizeAlignmentGroups(refTok, trTok, result);
  }

  const sources = destBox.targetTokenIndices.map((i) => refTokenToOriginalWord(refTok[i]!));
  const newGroup: AlignmentGroup = {
    sources,
    targets: sortTargetsByTranslationOrder(trTok, dedupeTargets(newTargets)),
  };
  return finalizeAlignmentGroups(refTok, trTok, [...nextGroups, newGroup]);
}

export function removeSourceFromBox(
  refTok: OriginalWordToken[],
  trTok: WordToken[],
  groups: AlignmentGroup[],
  boxId: string,
  transIndex: number,
): AlignmentGroup[] {
  return removeSourcesFromBox(refTok, trTok, groups, boxId, [transIndex]);
}

/** Remove several translation words from one box in a single update (verse order of `transIndices` is irrelevant). */
export function removeSourcesFromBox(
  refTok: OriginalWordToken[],
  trTok: WordToken[],
  groups: AlignmentGroup[],
  boxId: string,
  transIndices: number[],
): AlignmentGroup[] {
  const uniq = [...new Set(transIndices)];
  if (uniq.length === 0) return groups;

  const boxes = deriveAlignmentBoxes(refTok, groups, trTok);
  const box = boxes.find((b) => b.id === boxId);
  if (!box || box.groupIndex === null) return groups;

  const g = groups[box.groupIndex]!;
  const removeKeys = new Set(
    uniq
      .map((i) => {
        const tw = trTok[i];
        return tw ? transOccurrenceKey(tw.surface, tw.occurrence) : null;
      })
      .filter((x): x is string => x != null),
  );
  const nextTargets = g.targets.filter((t) => !removeKeys.has(transOccurrenceKey(t.word, t.occurrence)));
  const next = groups.slice();
  if (nextTargets.length === 0) {
    next.splice(box.groupIndex, 1);
  } else {
    next[box.groupIndex] = { ...g, targets: sortTargetsByTranslationOrder(trTok, nextTargets) };
  }
  return finalizeAlignmentGroups(refTok, trTok, next);
}

/** Translation indices for aligned words in UI order (as shown in the box). */
export function orderedAlignedTransIndices(box: AlignmentBoxModel, trTok: WordToken[]): number[] {
  const out: number[] = [];
  for (const aw of box.alignedSourceWords) {
    let ti: number | null = null;
    for (let i = 0; i < trTok.length; i++) {
      const w = trTok[i]!;
      if (alignmentWordSurfacesEqual(w.surface, aw.word) && w.occurrence === aw.occurrence) {
        ti = i;
        break;
      }
    }
    if (ti !== null) out.push(ti);
  }
  return out;
}

export function unlinkBox(
  refTok: OriginalWordToken[],
  trTok: WordToken[],
  groups: AlignmentGroup[],
  boxId: string,
): AlignmentGroup[] {
  const boxes = deriveAlignmentBoxes(refTok, groups, trTok);
  const box = boxes.find((b) => b.id === boxId);
  if (!box || box.groupIndex === null) return groups;
  const g = groups[box.groupIndex]!;
  const next = groups.slice();
  next[box.groupIndex] = { ...g, targets: [] };
  return finalizeAlignmentGroups(refTok, trTok, next);
}

export function clearVerseAlignment(): AlignmentGroup[] {
  return [];
}

/**
 * Where to insert a temporary “split target” alignment box in grid order (sorted by first
 * reference index), matching where the singleton would appear after {@link detachTargetRefFromGroup}.
 */
export function insertDetachPlaceholderIndex(
  boxes: AlignmentBoxModel[],
  sourceBoxId: string,
  refIndex: number,
): number {
  const src = boxes.find((b) => b.id === sourceBoxId);
  if (!src || src.targetTokenIndices.length === 0) return boxes.length;
  const srcMin = Math.min(...src.targetTokenIndices);

  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i]!;
    const m = Math.min(...b.targetTokenIndices);
    if (m > refIndex) return i;
    if (m === refIndex && b.id === sourceBoxId && refIndex === srcMin) {
      return i;
    }
  }
  return boxes.length;
}

export function useAlignmentBoxModel(
  refTok: OriginalWordToken[],
  trTok: WordToken[],
  groups: AlignmentGroup[],
): {
  boxes: AlignmentBoxModel[];
  sourceAligned: boolean[];
} {
  const boxes = useMemo(() => deriveAlignmentBoxes(refTok, groups, trTok), [refTok, groups, trTok]);
  const sourceAligned = useMemo(
    () => computeAlignedSourceIndices(trTok, boxes),
    [trTok, boxes],
  );
  return { boxes, sourceAligned };
}

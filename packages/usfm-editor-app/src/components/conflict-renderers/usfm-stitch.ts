/**
 * stitchUsfm — reassemble a USFM string from nested Mine/Theirs picks.
 *
 * Override precedence (highest first):
 *   chapter pick > (paragraph structure + verse picks for changed/split) >
 *   paragraph-only verbatim > verse-only mix (ours template)
 *
 * Every emitted subtree is a verbatim slice from one side's original USJ, so
 * alignment markers (\zaln-s, \w) are preserved without modification.
 */

import { convertUSJDocumentToUSFM } from '@usfm-tools/adapters';
import { splitUsjByChapter, type ChapterSlice } from '@usfm-tools/editor-core';
import type { UsjDocument } from '@usfm-tools/editor-core';
import {
  collectParagraphs,
  collectVerses,
  diffParagraphs,
  diffVerses,
  alignmentGroupPickKey,
  mergedAlignmentGroups,
  paraContentNodes,
  type ParaUnit,
  type SidePick,
  type AlignmentGroupPicks,
  type VerseUnit,
} from './usfm-diff-logic';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface Picks {
  /** chapterNum → side */
  chapter: Map<number, 'ours' | 'theirs'>;
  /** paragraphHunkId → side  (id from ParagraphHunk.id) */
  paragraph: Map<string, 'ours' | 'theirs'>;
  /** verseHunkId → side  (id from VerseHunk.id) */
  verse: Map<string, 'ours' | 'theirs'>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function sliceNodes(usj: UsjDocument): ChapterSlice[] {
  return splitUsjByChapter(usj);
}

/**
 * Build a USJ paragraph node that wraps the given content children.
 * We clone the structural attributes from `wrapperNode` (marker, style, etc.)
 * but replace its `content` array with the mixed verse subtrees.
 */
function buildParaNode(wrapperNode: unknown, children: unknown[]): unknown {
  if (!isRecord(wrapperNode)) return wrapperNode;
  return { ...wrapperNode, content: children };
}

/** Emit the chosen side's `originalNodes` for a verse unit. */
function emitVerseNodes(unit: VerseUnit): unknown[] {
  return unit.originalNodes;
}

/** Explicit verse pick, or the paragraph structure default when none. */
function explicitPickOrStructure(
  pick: 'ours' | 'theirs' | undefined,
  structureDefault: SidePick,
): SidePick {
  if (pick === 'theirs' || pick === 'ours') return pick;
  return structureDefault;
}

/**
 * Stitch together the content for a 'changed' paragraph when no paragraph-level
 * pick has been set — recurse into verse hunks (ours is the template wrapper).
 */
function stitchChangedPara(
  oursUnit: ParaUnit,
  theirsUnit: ParaUnit,
  picks: Picks,
  alignmentGroupPicks: AlignmentGroupPicks,
  paraHunkId: string,
): unknown[] {
  return stitchChangedParaWithStructure(
    oursUnit,
    theirsUnit,
    picks,
    alignmentGroupPicks,
    paraHunkId,
    'ours',
    oursUnit,
  );
}

/**
 * Mixed verse content using `templateUnit` for the outer \\p wrapper, with verse
 * text defaulting to `structureDefault` when no per-verse pick exists.
 *
 * TRADE-OFF — multi-paragraph group collapse: see stitchChangedPara note above.
 */
function stitchChangedParaWithStructure(
  oursUnit: ParaUnit,
  theirsUnit: ParaUnit,
  picks: Picks,
  alignmentGroupPicks: AlignmentGroupPicks,
  paraHunkId: string,
  structureDefault: SidePick,
  templateUnit: ParaUnit,
): unknown[] {
  const oVerses = collectVerses(paraContentNodes(oursUnit), paraContentNodes(oursUnit));
  const tVerses = collectVerses(paraContentNodes(theirsUnit), paraContentNodes(theirsUnit));
  const verseHunks = diffVerses(oVerses, tVerses, paraHunkId);

  const mixedVerseNodes: unknown[] = [];
  for (const vh of verseHunks) {
    const chooseSide = (base: SidePick): SidePick => {
      if (vh.kind === 'ours-only' || vh.kind === 'theirs-only') return base;
      const groups = mergedAlignmentGroups(vh.ours.alignment, vh.theirs.alignment);
      if (groups.length === 0) return base;
      const resolved = new Set<SidePick>();
      for (const g of groups) {
        const side = alignmentGroupPicks.get(alignmentGroupPickKey(vh.id, g.id)) ?? base;
        resolved.add(side);
      }
      if (resolved.size !== 1) return base;
      return [...resolved][0];
    };

    if (vh.kind === 'unchanged') {
      const pick = picks.verse.get(vh.id);
      const side = chooseSide(explicitPickOrStructure(pick, structureDefault));
      if (side === 'theirs') {
        mixedVerseNodes.push(...emitVerseNodes(vh.theirs));
      } else {
        mixedVerseNodes.push(...emitVerseNodes(vh.ours));
      }
    } else if (vh.kind === 'ours-only') {
      const eff = explicitPickOrStructure(picks.verse.get(vh.id), structureDefault);
      if (eff === 'theirs') continue;
      mixedVerseNodes.push(...emitVerseNodes(vh.ours));
    } else if (vh.kind === 'theirs-only') {
      const eff = explicitPickOrStructure(picks.verse.get(vh.id), structureDefault);
      if (eff === 'ours') continue;
      mixedVerseNodes.push(...emitVerseNodes(vh.theirs));
    } else {
      const pick = picks.verse.get(vh.id);
      const side = chooseSide(explicitPickOrStructure(pick, structureDefault));
      if (side === 'theirs') {
        mixedVerseNodes.push(...emitVerseNodes(vh.theirs));
      } else {
        mixedVerseNodes.push(...emitVerseNodes(vh.ours));
      }
    }
  }

  const paraNode = templateUnit.originalNodes[0];
  if (templateUnit.markerSequence.length > 1) {
    console.warn(
      `[stitchUsfm] Collapsing verse-group [${templateUnit.markerSequence.join('+')}] ` +
        `into a single \\${templateUnit.marker} wrapper because verse-level picks were used ` +
        `instead of a paragraph-level pick.  Internal paragraph breaks are lost.`,
    );
  }
  if (isRecord(paraNode) && paraNode.type === 'para') {
    return [buildParaNode(paraNode, mixedVerseNodes)];
  }
  return mixedVerseNodes;
}

/** Emit the originalNodes for a paragraph unit as-is. */
function emitParaNodes(unit: ParaUnit): unknown[] {
  return unit.originalNodes;
}

function buildSplitVerseSubstitutionMap(
  oursParas: ParaUnit[],
  theirsParas: ParaUnit[],
  picks: Picks,
  alignmentGroupPicks: AlignmentGroupPicks,
  paraHunkId: string,
  structureDefault: SidePick,
): Map<string, unknown[]> {
  const oAllContent = oursParas.flatMap((p) => paraContentNodes(p));
  const tAllContent = theirsParas.flatMap((p) => paraContentNodes(p));
  const oVerses = collectVerses(oAllContent, oAllContent);
  const tVerses = collectVerses(tAllContent, tAllContent);
  const verseHunks = diffVerses(oVerses, tVerses, paraHunkId);

  const chosenByVerseNum = new Map<string, unknown[]>();
  for (const vh of verseHunks) {
    const chooseSide = (base: SidePick): SidePick => {
      if (vh.kind === 'ours-only' || vh.kind === 'theirs-only') return base;
      const groups = mergedAlignmentGroups(vh.ours.alignment, vh.theirs.alignment);
      if (groups.length === 0) return base;
      const resolved = new Set<SidePick>();
      for (const g of groups) {
        resolved.add(alignmentGroupPicks.get(alignmentGroupPickKey(vh.id, g.id)) ?? base);
      }
      if (resolved.size !== 1) return base;
      return [...resolved][0];
    };

    if (vh.kind === 'unchanged' || vh.kind === 'alignment-only') {
      const pick = picks.verse.get(vh.id);
      const side = chooseSide(explicitPickOrStructure(pick, structureDefault));
      chosenByVerseNum.set(vh.ours.verseNum, side === 'theirs' ? emitVerseNodes(vh.theirs) : emitVerseNodes(vh.ours));
    } else if (vh.kind === 'changed') {
      const pick = picks.verse.get(vh.id);
      const side = chooseSide(explicitPickOrStructure(pick, structureDefault));
      chosenByVerseNum.set(vh.ours.verseNum, side === 'theirs' ? emitVerseNodes(vh.theirs) : emitVerseNodes(vh.ours));
    } else if (vh.kind === 'ours-only') {
      const eff = explicitPickOrStructure(picks.verse.get(vh.id), structureDefault);
      if (eff !== 'theirs') chosenByVerseNum.set(vh.ours.verseNum, emitVerseNodes(vh.ours));
    } else if (vh.kind === 'theirs-only') {
      const eff = explicitPickOrStructure(picks.verse.get(vh.id), structureDefault);
      if (eff !== 'ours') {
        chosenByVerseNum.set(`_extra_${vh.id}`, emitVerseNodes(vh.theirs));
      }
    }
  }
  return chosenByVerseNum;
}

function emitSplitParasFromTemplate(
  templateParas: ParaUnit[],
  chosenByVerseNum: Map<string, unknown[]>,
): unknown[] {
  const theirsExtras: unknown[] = [...chosenByVerseNum.entries()]
    .filter(([k]) => k.startsWith('_extra_'))
    .flatMap(([, nodes]) => nodes);

  const result: unknown[] = [];
  for (let pi = 0; pi < templateParas.length; pi++) {
    const para = templateParas[pi]!;
    const paraVerses = collectVerses(paraContentNodes(para), paraContentNodes(para));
    const mixedContent: unknown[] = [];
    for (const ov of paraVerses) {
      mixedContent.push(...(chosenByVerseNum.get(ov.verseNum) ?? emitVerseNodes(ov)));
    }
    if (pi === templateParas.length - 1) mixedContent.push(...theirsExtras);
    const paraNode = para.originalNodes[0];
    if (isRecord(paraNode) && paraNode.type === 'para') {
      result.push(buildParaNode(paraNode, mixedContent));
    } else {
      result.push(...mixedContent);
    }
  }
  return result;
}

/**
 * Stitch a `'split'` hunk when no paragraph-level pick has been made.
 * Ours is the paragraph template; missing verse picks default to ours.
 */
function stitchSplitParas(
  oursParas: ParaUnit[],
  theirsParas: ParaUnit[],
  picks: Picks,
  alignmentGroupPicks: AlignmentGroupPicks,
  paraHunkId: string,
): unknown[] {
  const map = buildSplitVerseSubstitutionMap(
    oursParas,
    theirsParas,
    picks,
    alignmentGroupPicks,
    paraHunkId,
    'ours',
  );
  return emitSplitParasFromTemplate(oursParas, map);
}

function stitchSplitParasWithStructure(
  oursParas: ParaUnit[],
  theirsParas: ParaUnit[],
  structureSide: SidePick,
  picks: Picks,
  alignmentGroupPicks: AlignmentGroupPicks,
  paraHunkId: string,
): unknown[] {
  const map = buildSplitVerseSubstitutionMap(
    oursParas,
    theirsParas,
    picks,
    alignmentGroupPicks,
    paraHunkId,
    structureSide,
  );
  const template = structureSide === 'theirs' ? theirsParas : oursParas;
  return emitSplitParasFromTemplate(template, map);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Reassemble a USFM string from two sides and a nested pick map.
 *
 * @param oursDoc   Original (alignment-preserving) USJ for "ours".
 * @param theirsDoc Original (alignment-preserving) USJ for "theirs".
 * @param picks     Nested picks from the conflict dialog.
 * @returns         Canonical USFM string.
 */
export function stitchUsfm(opts: {
  oursDoc: UsjDocument;
  theirsDoc: UsjDocument;
  picks: Picks;
  alignmentGroupPicks?: AlignmentGroupPicks;
}): string {
  const { oursDoc, theirsDoc, picks, alignmentGroupPicks = new Map() } = opts;

  const oursSlices = sliceNodes(oursDoc);
  const theirsSlices = sliceNodes(theirsDoc);

  // Build a chapter → slice lookup for each side.
  const oursMap = new Map<number, ChapterSlice>(oursSlices.map((s) => [s.chapter, s]));
  const theirsMap = new Map<number, ChapterSlice>(theirsSlices.map((s) => [s.chapter, s]));

  // All chapters present in either side.
  const allChapters = [...new Set([...oursMap.keys(), ...theirsMap.keys()])].sort((a, b) => a - b);

  const stitchedNodes: unknown[] = [];

  for (const ch of allChapters) {
    const oSlice = oursMap.get(ch);
    const tSlice = theirsMap.get(ch);

    // ── Chapter-level pick ────────────────────────────────────────────────
    const chPick = picks.chapter.get(ch);
    if (chPick === 'theirs' && tSlice) {
      stitchedNodes.push(...tSlice.nodes);
      continue;
    }
    if (chPick === 'ours' && oSlice) {
      stitchedNodes.push(...oSlice.nodes);
      continue;
    }

    // ── No chapter pick — resolve at paragraph level ──────────────────────
    const oNodes = oSlice?.nodes ?? [];
    const tNodes = tSlice?.nodes ?? [];

    // For chapter ≥ 1, the slice begins with the chapter node itself
    // (splitUsjByChapter always prepends it).  Emit it now so that
    // the reconstructed document retains \\c markers between paragraphs.
    if (ch > 0 && oNodes.length > 0 && isRecord(oNodes[0]) && oNodes[0].type === 'chapter') {
      stitchedNodes.push(oNodes[0]);
    }

    // collectParagraphs uses both original and stripped node arrays in lock-step.
    // At stitch time we have only the originals, so we pass them for both params.
    // This means displaySegments will contain alignment markers in their text, but
    // stitchUsfm doesn't use displaySegments — only originalNodes matters.
    const oParas = collectParagraphs(ch, oNodes, oNodes);
    const tParas = collectParagraphs(ch, tNodes, tNodes);
    const paraHunks = diffParagraphs(oParas, tParas);

    // If no para hunks (e.g. intro chapter with only a \\id book node), emit
    // ours verbatim — the book/id node is not a paragraph and is never in a hunk.
    if (paraHunks.length === 0) {
      stitchedNodes.push(...oNodes);
      continue;
    }

    // For chapters that are only in one side (new chapter added), re-use the
    // chapter node that splitUsjByChapter put at the start of the nodes array.
    for (const hunk of paraHunks) {
      if (hunk.kind === 'unchanged') {
        stitchedNodes.push(...emitParaNodes(hunk.ours));
        continue;
      }

      if (hunk.kind === 'ours-only') {
        const pick = picks.paragraph.get(hunk.id);
        if (pick !== 'theirs') stitchedNodes.push(...emitParaNodes(hunk.ours));
        continue;
      }

      if (hunk.kind === 'theirs-only') {
        const pick = picks.paragraph.get(hunk.id);
        if (pick !== 'ours') stitchedNodes.push(...emitParaNodes(hunk.theirs));
        continue;
      }

      if (hunk.kind === 'split') {
        const paraPick = picks.paragraph.get(hunk.id);
        if (paraPick === 'theirs') {
          stitchedNodes.push(
            ...stitchSplitParasWithStructure(
              hunk.oursParas,
              hunk.theirsParas,
              'theirs',
              picks,
              alignmentGroupPicks,
              hunk.id,
            ),
          );
        } else if (paraPick === 'ours') {
          stitchedNodes.push(
            ...stitchSplitParasWithStructure(
              hunk.oursParas,
              hunk.theirsParas,
              'ours',
              picks,
              alignmentGroupPicks,
              hunk.id,
            ),
          );
        } else {
          stitchedNodes.push(...stitchSplitParas(hunk.oursParas, hunk.theirsParas, picks, alignmentGroupPicks, hunk.id));
        }
        continue;
      }

      // 'changed'
      const paraPick = picks.paragraph.get(hunk.id);
      if (paraPick === 'theirs') {
        // Verse-group (\\p + \\q1, …): preserve multi-node structure verbatim.
        if (hunk.theirs.markerSequence.length > 1) {
          stitchedNodes.push(...emitParaNodes(hunk.theirs));
        } else {
          stitchedNodes.push(
            ...stitchChangedParaWithStructure(
              hunk.ours,
              hunk.theirs,
              picks,
              alignmentGroupPicks,
              hunk.id,
              'theirs',
              hunk.theirs,
            ),
          );
        }
      } else if (paraPick === 'ours') {
        if (hunk.ours.markerSequence.length > 1) {
          stitchedNodes.push(...emitParaNodes(hunk.ours));
        } else {
          stitchedNodes.push(
            ...stitchChangedParaWithStructure(
              hunk.ours,
              hunk.theirs,
              picks,
              alignmentGroupPicks,
              hunk.id,
              'ours',
              hunk.ours,
            ),
          );
        }
      } else {
        stitchedNodes.push(...stitchChangedPara(hunk.ours, hunk.theirs, picks, alignmentGroupPicks, hunk.id));
      }
    }
  }

  // Reconstruct a minimal UsjDocument to serialise.
  const merged: UsjDocument = {
    ...(oursDoc as object),
    content: stitchedNodes,
  } as UsjDocument;

  return convertUSJDocumentToUSFM(merged);
}

// ---------------------------------------------------------------------------
// Readiness check (mirrors dialog gating logic, useful for testing)
// ---------------------------------------------------------------------------

export interface HunkRequirements {
  chapter: number;
  paragraphHunks: { id: string; verseHunks: string[] }[];
}

/**
 * Return true when the nested picks satisfy all hunk requirements at some level.
 * Used by SyncConflictDialog to gate "Apply all".
 */
export function isMergedReady(
  requirements: HunkRequirements[],
  picks: Picks,
): boolean {
  for (const chReq of requirements) {
    if (picks.chapter.has(chReq.chapter)) continue; // chapter-level pick → ready

    for (const paraReq of chReq.paragraphHunks) {
      if (paraReq.verseHunks.length > 0) {
        if (!picks.paragraph.has(paraReq.id)) return false;
        for (const vId of paraReq.verseHunks) {
          if (!picks.verse.has(vId)) return false;
        }
        continue;
      }

      if (picks.paragraph.has(paraReq.id)) continue;

      return false;
    }
  }
  return true;
}

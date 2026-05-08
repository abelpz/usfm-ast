/**
 * Pure logic helpers for UsfmChapterDiffView — no React, no JSX.
 * Extracted so they can be unit-tested from packages that don't enable --jsx.
 */

// ---------------------------------------------------------------------------
// Segment types
// ---------------------------------------------------------------------------

export type SegmentKind = 'verse' | 'heading-text' | 'intro-heading' | 'para-break' | 'text' | 'footnote';

export interface RenderSegment {
  kind: SegmentKind;
  text: string;
  /** Original USFM marker name (e.g. 'mt', 'p', 'q1', 'v', 'f'). */
  marker?: string;
  verseNum?: string;
  /** Alignment fingerprint — set only on 'verse' segments built with a fingerprint map. */
  alignmentFingerprint?: string;
}

// ---------------------------------------------------------------------------
// Marker sets
// ---------------------------------------------------------------------------

export const PARAGRAPH_MARKERS = new Set([
  'p', 'q', 'q1', 'q2', 'q3', 'b', 'm', 'pi', 'pi1', 'pi2', 'li', 'li1', 'li2',
  'nb', 'pc', 'qr', 'qc', 'pr', 'cls', 'pmo', 'pm', 'pmc', 'pmr',
]);

export const HEADING_MARKERS = new Set([
  's', 's1', 's2', 's3', 'r', 'ms', 'ms1', 'mr', 'd', 'sp', 'sr',
]);

export const INTRO_HEADING_MARKERS = new Set([
  'mt', 'mt1', 'mt2', 'mt3', 'mt4',
  'mte', 'mte1',
  'imt', 'imt1', 'imt2',
  'is', 'is1', 'is2',
  'iot', 'io', 'io1', 'io2',
  'ip', 'ipi', 'im', 'imi', 'ipq', 'imq', 'ipr',
  'iex',
]);

export const FOOTNOTE_MARKERS = new Set(['f', 'fe', 'x']);
export const SKIP_MARKERS = new Set(['id', 'h', 'toc1', 'toc2', 'toc3', 'ide', 'sts', 'rem', 'usfm']);

/**
 * Body-paragraph markers that may appear AFTER a verse-owning paragraph without
 * starting a new verse.  When such a node immediately follows a verse-owning
 * body paragraph and has no \v node of its own, it is merged into the preceding
 * paragraph as a continuation (verse-group), rather than treated as a separate
 * paragraph hunk.
 *
 * Heading markers (\s*, \mt*, \r, etc.) deliberately omitted — they always
 * start a new independent paragraph unit.
 */
const CONTINUATION_MARKERS = new Set([
  'q', 'q1', 'q2', 'q3', 'q4', 'qr', 'qc', 'qa', 'qm', 'qm1', 'qm2', 'qd',
  'm', 'mi', 'b', 'nb', 'pi', 'pi1', 'pi2', 'pmo', 'pm', 'pmc', 'pmr',
  'cls', 'li', 'li1', 'li2', 'li3', 'pc', 'pr',
]);

// ---------------------------------------------------------------------------
// USJ node type guard
// ---------------------------------------------------------------------------

type UsjNode = {
  type?: string;
  marker?: string;
  content?: unknown[];
  text?: string;
  number?: string | number;
  code?: string;
  sid?: string;
  // alignment x-attrs
  'x-strong'?: string;
  'x-lemma'?: string;
  'x-occurrence'?: string | number;
  'x-occurrences'?: string | number;
  'x-content'?: string;
};

function isUsjNode(v: unknown): v is UsjNode {
  return typeof v === 'object' && v !== null;
}

// ---------------------------------------------------------------------------
// Alignment fingerprinting
// ---------------------------------------------------------------------------

/**
 * Build a stable canonical signature of all alignment data within a list of
 * USJ content nodes (i.e. the nodes under a verse).
 *
 * Format — entries joined with '|':
 *   z:strong=<x-strong>:lemma=<x-lemma>:content=<x-content>:occ=<occ>/<occs>
 *   w:<word-text>:occ=<occ>/<occs>
 */
export function alignmentFingerprintForVerseNodes(nodes: unknown[]): string {
  const parts: string[] = [];
  _walkForFingerprint(nodes, parts);
  return parts.join('|');
}

function _walkForFingerprint(nodes: unknown[], parts: string[]): void {
  for (const raw of nodes) {
    if (!isUsjNode(raw)) continue;
    const t = raw.type ?? '';
    const m = raw.marker ?? '';

    if (t === 'ms' && m === 'zaln-s') {
      const strong = raw['x-strong'] ?? '';
      const lemma = raw['x-lemma'] ?? '';
      const content = raw['x-content'] ?? '';
      const occ = raw['x-occurrence'] ?? '';
      const occs = raw['x-occurrences'] ?? '';
      parts.push(`z:strong=${strong}:lemma=${lemma}:content=${content}:occ=${occ}/${occs}`);
    } else if (t === 'char' && m === 'w') {
      const wordText = Array.isArray(raw.content)
        ? raw.content.filter((c) => typeof c === 'string').join('')
        : '';
      const occ = raw['x-occurrence'] ?? '';
      const occs = raw['x-occurrences'] ?? '';
      parts.push(`w:${wordText}:occ=${occ}/${occs}`);
    }

    if (Array.isArray(raw.content)) {
      _walkForFingerprint(raw.content, parts);
    }
  }
}

// ---------------------------------------------------------------------------
// Per-verse word-alignment extraction
// ---------------------------------------------------------------------------

export interface AlignSource {
  strong: string;
  lemma: string;
  content: string;
  occurrence: number;
  occurrences: number;
}

export interface WordAlign {
  /** Translation word text (surface form from \w node). */
  text: string;
  /** x-occurrence of the \w node (1-based). */
  occurrence: number;
  /** Stable group ID (djb2 over source attrs), or undefined when bare \w outside \zaln-s. */
  groupId: string | undefined;
}

export interface AlignGroup {
  /** Stable ID derived from source attributes (strong+lemma+content+occ/occs). */
  id: string;
  source: AlignSource;
  /** 0-based index into the alignment colour palette — assigned by first-encounter order. */
  paletteIdx: number;
  /** Indices into VerseAlignment.words[] for the translation words linked to this group. */
  translationIndices: number[];
}

export interface VerseAlignment {
  /** Ordered list of \w tokens encountered in this verse (from original aligned USJ). */
  words: WordAlign[];
  /** Unique source groups in first-encounter order. */
  groups: AlignGroup[];
}

export type SidePick = 'ours' | 'theirs';
export type AlignmentGroupPicks = Map<string, SidePick>;

/**
 * Stable key for a per-group alignment choice within a verse hunk.
 * Format: `${verseHunkId}::${groupId}`.
 */
export function alignmentGroupPickKey(verseHunkId: string, groupId: string): string {
  return `${verseHunkId}::${groupId}`;
}

/**
 * Resolve effective alignment side for one group.
 * - If explicit per-group override exists, use it.
 * - Otherwise fall back to `defaultSide` (typically the chosen content side).
 */
export function resolveAlignmentGroupSide(
  verseHunkId: string,
  groupId: string,
  defaultSide: SidePick | null,
  picks: AlignmentGroupPicks,
): SidePick | null {
  const explicit = picks.get(alignmentGroupPickKey(verseHunkId, groupId));
  if (explicit) return explicit;
  return defaultSide;
}

/**
 * Return deterministic union of alignment group ids in first-encounter order:
 * all mine groups first, then groups only present in theirs.
 */
export function mergedAlignmentGroups(
  mine: VerseAlignment,
  theirs: VerseAlignment,
): AlignGroup[] {
  const byId = new Map<string, AlignGroup>();
  for (const g of mine.groups) byId.set(g.id, g);
  for (const g of theirs.groups) if (!byId.has(g.id)) byId.set(g.id, g);
  return [...byId.values()];
}

/**
 * Extract structured word-alignment data from a list of USJ verse content
 * nodes (the nodes under a \v, possibly wrapped in \zaln-s milestones).
 *
 * Words inside a \zaln-s scope receive `groupId` equal to the group's stable
 * djb2 ID (derived from strong+lemma+content+occ/occs).  Bare \w nodes
 * outside any \zaln-s receive `groupId === undefined`.
 */
export function extractVerseAlignment(nodes: unknown[]): VerseAlignment {
  const words: WordAlign[] = [];
  // Ordered map preserves first-encounter order so paletteIdx is stable.
  const groupsMap = new Map<string, AlignGroup>();
  // Current open \zaln-s group (set when we enter, cleared on \zaln-e).
  // USJ produced by USFMParser uses a FLAT (sibling) structure for milestones:
  //   [{type:"ms",marker:"zaln-s",...}, {type:"char",marker:"w",...}, {type:"ms",marker:"zaln-e"}]
  // So we track the active group as sequential state, not via nesting.
  let currentGroupId: string | undefined;

  function walkFlat(ns: unknown[]): void {
    for (const raw of ns) {
      if (!isUsjNode(raw)) continue;
      const t = raw.type ?? '';
      const m = raw.marker ?? '';

      if (t === 'ms' && m === 'zaln-s') {
        const strong = String(raw['x-strong'] ?? '');
        const lemma = String(raw['x-lemma'] ?? '');
        const content = String(raw['x-content'] ?? '');
        const occ = Number(raw['x-occurrence'] ?? 0);
        const occs = Number(raw['x-occurrences'] ?? 0);
        const groupId = djb2(`${strong}\0${lemma}\0${content}\0${occ}/${occs}`);

        if (!groupsMap.has(groupId)) {
          groupsMap.set(groupId, {
            id: groupId,
            source: { strong, lemma, content, occurrence: occ, occurrences: occs },
            paletteIdx: groupsMap.size,
            translationIndices: [],
          });
        }
        currentGroupId = groupId;
        // zaln-s in flat USJ has no meaningful content — children are siblings.
        continue;
      }

      if (t === 'ms' && m === 'zaln-e') {
        currentGroupId = undefined;
        continue;
      }

      if (t === 'char' && m === 'w') {
        const wordText = Array.isArray(raw.content)
          ? raw.content.filter((c) => typeof c === 'string').join('')
          : '';
        const wordOcc = Number(raw['x-occurrence'] ?? 1);
        const wordIdx = words.length;
        words.push({ text: wordText, occurrence: wordOcc, groupId: currentGroupId });
        if (currentGroupId && groupsMap.has(currentGroupId)) {
          groupsMap.get(currentGroupId)!.translationIndices.push(wordIdx);
        }
        continue;
      }

      // Recurse into other structured nodes (e.g. verse containers when called
      // at the paragraph level) but preserve the current group state.
      if (Array.isArray(raw.content)) {
        walkFlat(raw.content);
      }
    }
  }

  walkFlat(nodes);
  return { words, groups: [...groupsMap.values()] };
}

// ---------------------------------------------------------------------------
// Alignment diff helpers
// ---------------------------------------------------------------------------

export type AlignmentChange =
  | { kind: 'group-removed'; mineGroup: AlignGroup }
  | { kind: 'group-added'; theirsGroup: AlignGroup }
  | { kind: 'group-rerouted'; mineGroup: AlignGroup; theirsGroup: AlignGroup; sharedTranslation: string[] };

/**
 * Diff two VerseAlignment objects and return a list of alignment changes.
 * Groups are matched by their stable ID (source fingerprint).
 */
export function diffWordAlignments(
  mine: VerseAlignment,
  theirs: VerseAlignment,
): AlignmentChange[] {
  const changes: AlignmentChange[] = [];
  const mineById = new Map<string, AlignGroup>(mine.groups.map((g) => [g.id, g]));
  const theirsById = new Map<string, AlignGroup>(theirs.groups.map((g) => [g.id, g]));

  for (const mineGroup of mine.groups) {
    const theirsGroup = theirsById.get(mineGroup.id);
    if (!theirsGroup) {
      changes.push({ kind: 'group-removed', mineGroup });
    } else {
      const mineWords = new Set(mineGroup.translationIndices.map((i) => mine.words[i]?.text ?? ''));
      const theirsWords = new Set(theirsGroup.translationIndices.map((i) => theirs.words[i]?.text ?? ''));
      const isSame =
        mineWords.size === theirsWords.size && [...mineWords].every((w) => theirsWords.has(w));
      if (!isSame) {
        const sharedTranslation = [...new Set([...mineWords, ...theirsWords])];
        changes.push({ kind: 'group-rerouted', mineGroup, theirsGroup, sharedTranslation });
      }
    }
  }

  for (const theirsGroup of theirs.groups) {
    if (!mineById.has(theirsGroup.id)) {
      changes.push({ kind: 'group-added', theirsGroup });
    }
  }

  return changes;
}

/**
 * Build a verse-fingerprint map from an already-extracted alignment map (the
 * `alignments` field returned by `stripAlignments()` from @usfm-tools/editor-core).
 *
 * Keys in the input are verse SIDs like "TIT 3:1"; we extract just the verse
 * number ("1") and optionally filter to a specific chapter so that verse 1 of
 * chapter 1 and verse 1 of chapter 3 don't collide.
 *
 * @param alignments  AlignmentMap from stripAlignments().alignments
 * @param chapterFilter  Optional chapter number to restrict to (0 = intro)
 */
export function fingerprintsFromAlignmentMap(
  alignments: Record<string, Array<{
    sources: Array<{ strong: string; lemma: string; content: string; occurrence: number; occurrences: number }>;
    targets: Array<{ word: string; occurrence: number; occurrences: number }>;
  }>>,
  chapterFilter?: number,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const [verseRef, groups] of Object.entries(alignments)) {
    // verseRef format: "TIT 3:1"
    const colonIdx = verseRef.lastIndexOf(':');
    const beforeColon = colonIdx >= 0 ? verseRef.slice(0, colonIdx) : '';
    const verseNum = colonIdx >= 0 ? verseRef.slice(colonIdx + 1).split('-')[0] : '';
    if (!verseNum) continue;

    if (chapterFilter !== undefined) {
      const chapStr = beforeColon.split(' ').pop() ?? '';
      const chapNum = parseInt(chapStr, 10);
      if (!isNaN(chapNum) && chapNum !== chapterFilter) continue;
    }

    const parts: string[] = [];
    for (const group of groups) {
      for (const src of group.sources) {
        parts.push(`z:${src.strong}:${src.lemma}:${src.content}:${src.occurrence}/${src.occurrences}`);
      }
      for (const tgt of group.targets) {
        parts.push(`w:${tgt.word}:${tgt.occurrence}/${tgt.occurrences}`);
      }
    }
    map.set(verseNum, parts.join('|'));
  }
  return map;
}

// ---------------------------------------------------------------------------
// Segment collection
// ---------------------------------------------------------------------------

export function collectSegments(
  nodes: unknown[],
  segments: RenderSegment[] = [],
  fingerprintMap?: Map<string, string>,
): RenderSegment[] {
  for (const raw of nodes) {
    if (typeof raw === 'string') {
      if (raw.trim()) segments.push({ kind: 'text', text: raw });
      continue;
    }
    if (!isUsjNode(raw)) continue;

    const marker = (raw.marker ?? raw.type ?? '') as string;

    if (raw.type === 'chapter') continue;

    if (raw.type === 'verse') {
      const verseNum = String(raw.number ?? '');
      const fp = fingerprintMap?.get(verseNum);
      segments.push({
        kind: 'verse',
        text: '',
        marker: 'v',
        verseNum,
        ...(fp !== undefined ? { alignmentFingerprint: fp } : {}),
      });
      if (raw.content) collectSegments(raw.content, segments, fingerprintMap);
      continue;
    }

    if (SKIP_MARKERS.has(marker)) continue;

    if (FOOTNOTE_MARKERS.has(marker)) {
      const inner: RenderSegment[] = [];
      if (raw.content) collectSegments(raw.content, inner, fingerprintMap);
      const ft = inner.map((s) => s.text).join('');
      segments.push({ kind: 'footnote', text: ft, marker });
      continue;
    }

    if (INTRO_HEADING_MARKERS.has(marker)) {
      segments.push({ kind: 'para-break', text: '', marker });
      const childSegs: RenderSegment[] = [];
      if (raw.content) collectSegments(raw.content, childSegs, fingerprintMap);
      // Tag text children as intro-heading kind
      for (const s of childSegs) {
        if (s.kind === 'text') s.kind = 'intro-heading';
      }
      segments.push(...childSegs);
      continue;
    }

    if (HEADING_MARKERS.has(marker)) {
      segments.push({ kind: 'para-break', text: '', marker });
      const childSegs: RenderSegment[] = [];
      if (raw.content) collectSegments(raw.content, childSegs, fingerprintMap);
      for (const s of childSegs) {
        if (s.kind === 'text') s.kind = 'heading-text';
      }
      segments.push(...childSegs);
      continue;
    }

    if (PARAGRAPH_MARKERS.has(marker) || raw.type === 'para') {
      segments.push({ kind: 'para-break', text: '', marker: marker || 'p' });
      if (raw.content) collectSegments(raw.content, segments, fingerprintMap);
      continue;
    }

    if (raw.content) collectSegments(raw.content, segments, fingerprintMap);
  }
  return segments;
}

// ---------------------------------------------------------------------------
// Segment-level LCS diff
// ---------------------------------------------------------------------------

export type SegmentChange = 'unchanged' | 'added' | 'removed' | 'modified' | 'alignment-only';

export interface DiffedSegment extends RenderSegment {
  change: SegmentChange;
}

export function lcsMatrix(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

function segKey(s: RenderSegment): string {
  if (s.kind === 'verse') return `v:${s.verseNum ?? ''}`;
  return `${s.kind}:${s.text}`;
}

export function diffSegments(
  ours: RenderSegment[],
  theirs: RenderSegment[],
  oursFingerprints?: Map<string, string>,
  theirsFingerprints?: Map<string, string>,
): { oursDiff: DiffedSegment[]; theirsDiff: DiffedSegment[] } {
  const oKeys = ours.map(segKey);
  const tKeys = theirs.map(segKey);
  const dp = lcsMatrix(oKeys, tKeys);

  const oursDiff: DiffedSegment[] = [];
  const theirsDiff: DiffedSegment[] = [];

  let i = ours.length;
  let j = theirs.length;
  const oOps: Array<'keep' | 'remove'> = [];
  const tOps: Array<'keep' | 'add'> = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oKeys[i - 1] === tKeys[j - 1]) {
      oOps.unshift('keep');
      tOps.unshift('keep');
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      tOps.unshift('add');
      j--;
    } else {
      oOps.unshift('remove');
      i--;
    }
  }

  let oi = 0;
  let ti = 0;
  for (let k = 0; k < Math.max(oOps.length, tOps.length); k++) {
    const oOp = oOps[k];
    const tOp = tOps[k];
    if (oOp === 'keep' && tOp === 'keep') {
      oursDiff.push({ ...ours[oi++], change: 'unchanged' });
      theirsDiff.push({ ...theirs[ti++], change: 'unchanged' });
    } else if (oOp === 'remove') {
      oursDiff.push({ ...ours[oi++], change: 'removed' });
    } else if (tOp === 'add') {
      theirsDiff.push({ ...theirs[ti++], change: 'added' });
    }
  }

  // Post-process: detect alignment-only differences on unchanged verse segments.
  // Conditions for reclassification:
  //   1. Verse segment is 'unchanged' (LCS matched it by key v:N on both sides).
  //   2. Alignment fingerprints differ.
  //   3. The visible text BETWEEN this verse and the next is identical on both
  //      sides. (If text differs the diff already shows removed/added segments —
  //      we must not hide that behind the 'alignment-only' label.)
  if (oursFingerprints && theirsFingerprints) {
    const verseTextMap = (segs: DiffedSegment[], vNum: string): string => {
      let capturing = false;
      const parts: string[] = [];
      for (const s of segs) {
        if (s.kind === 'verse') {
          if (s.verseNum === vNum) { capturing = true; continue; }
          if (capturing) break;
        }
        if (capturing && (s.kind === 'text' || s.kind === 'intro-heading')) parts.push(s.text);
      }
      return parts.join(' ').trim();
    };

    for (const seg of oursDiff) {
      if (seg.kind === 'verse' && seg.change === 'unchanged' && seg.verseNum) {
        const oFP = oursFingerprints.get(seg.verseNum) ?? '';
        const tFP = theirsFingerprints.get(seg.verseNum) ?? '';
        if (oFP === tFP) continue;
        // Only reclassify if visible text is identical
        if (verseTextMap(oursDiff, seg.verseNum) === verseTextMap(theirsDiff, seg.verseNum)) {
          seg.change = 'alignment-only';
        }
      }
    }
    for (const seg of theirsDiff) {
      if (seg.kind === 'verse' && seg.change === 'unchanged' && seg.verseNum) {
        const oFP = oursFingerprints.get(seg.verseNum) ?? '';
        const tFP = theirsFingerprints.get(seg.verseNum) ?? '';
        if (oFP === tFP) continue;
        if (verseTextMap(oursDiff, seg.verseNum) === verseTextMap(theirsDiff, seg.verseNum)) {
          seg.change = 'alignment-only';
        }
      }
    }
  }

  return { oursDiff, theirsDiff };
}

export function segmentText(segs: DiffedSegment[]): string {
  return segs.filter((s) => s.kind === 'text' || s.kind === 'intro-heading').map((s) => s.text).join(' ').trim();
}

// ---------------------------------------------------------------------------
// Paragraph-level collection + diff (B1)
// ---------------------------------------------------------------------------

/** All paragraph-like markers that open a new paragraph unit. */
const ALL_PARA_MARKERS = new Set([
  ...PARAGRAPH_MARKERS,
  ...HEADING_MARKERS,
  ...INTRO_HEADING_MARKERS,
]);

/**
 * A single paragraph unit, representing one logical block bounded by a
 * paragraph/heading marker.
 *
 * `originalNodes` come from the alignment-preserving USJ (keep \zaln-s/\w).
 * `displaySegments` come from the stripped USJ (for visible diff rendering).
 */
export interface ParaUnit {
  /** Stable ID: `${chapterNum}:p${ordinal}` — assigned by the caller. */
  paraId: string;
  /** Primary USFM paragraph marker (first in markerSequence, e.g. 'p', 'q1', 'mt'). */
  marker: string;
  /**
   * Ordered list of all paragraph markers in this unit.  For a simple paragraph
   * it contains just [marker].  For a verse-group (continuation paragraphs merged
   * in), it lists all merged markers in document order, e.g. ['p', 'q1'].
   */
  markerSequence: string[];
  /** Verse numbers contained in this paragraph (e.g. ['1','2','3']). */
  verseRefs: string[];
  /**
   * Two-part fingerprint:
   *   structKey = `${marker}|${verseRefs.join(',')}`  ← used for LCS matching
   *   textHash  = djb2 of plain text ← distinguishes changed vs. unchanged
   * Full fingerprint stored as `${structKey}|${textHash}`.
   * Groups use the primary (first) marker so a split-verse group and its
   * un-split counterpart still LCS-pair and appear as 'changed' rather than
   * as independent ours-only/theirs-only hunks.
   */
  fingerprint: string;
  /** Original USJ nodes (alignment markers intact). May hold multiple para nodes when this unit is a verse-group. */
  originalNodes: unknown[];
  /** Display segments (alignment stripped). */
  displaySegments: RenderSegment[];
}

/** Fast djb2 hash that returns a short hex string (not cryptographic). */
function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}

/**
 * Extract verse numbers from a list of USJ nodes (alignment-preserving).
 * Returns string verse numbers in document order (e.g. ['1','2','3']).
 */
function extractVerseNums(nodes: unknown[]): string[] {
  const nums: string[] = [];
  for (const raw of nodes) {
    if (!isUsjNode(raw)) continue;
    if (raw.type === 'verse') {
      const n = String(raw.number ?? '').trim();
      if (n) nums.push(n);
    }
    if (Array.isArray(raw.content)) {
      nums.push(...extractVerseNums(raw.content));
    }
  }
  return nums;
}

/**
 * Plain text from a list of original (possibly aligned) USJ nodes.
 *
 * Whitespace is collapsed to single spaces before returning so that aligned
 * USFM (`\zaln-s … \w word \w* \zaln-e\*` with space siblings at alignment
 * boundaries) and un-aligned USFM (single text run) produce the same string
 * and therefore the same djb2 hash.  Real content changes — different words,
 * punctuation, insertions/deletions — still produce different normalized strings.
 */
function plainTextFromNodes(nodes: unknown[]): string {
  const parts: string[] = [];
  function walk(ns: unknown[]): void {
    for (const raw of ns) {
      if (typeof raw === 'string') { parts.push(raw); continue; }
      if (!isUsjNode(raw)) continue;
      if (raw.type === 'verse') continue; // skip verse markers themselves
      if (Array.isArray(raw.content)) walk(raw.content);
    }
  }
  walk(nodes);
  return parts.join('').replace(/\s+/g, ' ').trim();
}

/**
 * Collect paragraph units from a chapter's worth of top-level USJ nodes.
 *
 * USJ structure for a chapter: `[chapterNode, paraNode, paraNode, ...]`
 * Each `para` node wraps its verse nodes and text inline in `content`.
 *
 * Both `originalNodes` (alignment-preserving) and `strippedNodes`
 * (alignment-stripped) must have the same structural shape (same parser run).
 * Each `ParaUnit` stores the **whole para node** in `originalNodes` so that
 * `stitchUsfm` can emit it verbatim (alignment markers intact).
 *
 * After collecting flat units, `groupContinuations` merges any continuation
 * paragraph (e.g. \q1, \m, \b) that immediately follows a verse-owning body
 * paragraph into a single verse-group ParaUnit.
 *
 * @param chapterNum  Chapter number (0 = intro) — used to generate paraIds.
 * @param originalNodes  Top-level nodes from the alignment-preserving USJ.
 * @param strippedNodes  Parallel top-level nodes from the stripped USJ.
 */
export function collectParagraphs(
  chapterNum: number,
  originalNodes: unknown[],
  strippedNodes: unknown[],
): ParaUnit[] {
  const units: ParaUnit[] = [];
  let ordinal = 0;

  const len = Math.max(originalNodes.length, strippedNodes.length);
  for (let i = 0; i < len; i++) {
    const orig = originalNodes[i];
    const strip = strippedNodes[i];

    if (!isUsjNode(orig)) continue;

    // Skip structural nodes that are not content paragraphs.
    if (orig.type === 'book' || orig.type === 'chapter') continue;

    if (orig.type === 'para' || orig.type === 'ms') {
      const marker = (orig.marker as string | undefined) ?? 'p';

      // The para node's children contain verse nodes and text spans.
      const origContent = Array.isArray(orig.content) ? (orig.content as unknown[]) : [];
      const stripContent =
        isUsjNode(strip) && Array.isArray((strip as Record<string, unknown>).content)
          ? ((strip as Record<string, unknown>).content as unknown[])
          : origContent;

      const verseRefs = extractVerseNums(origContent);
      const plainText = plainTextFromNodes(origContent);
      const structKey = `${marker}|${verseRefs.join(',')}`;
      const textHash = djb2(plainText);
      const fingerprint = `${structKey}|${textHash}`;
      const displaySegments = collectSegments(stripContent);

      units.push({
        paraId: `${chapterNum}:p${ordinal}`,
        marker,
        markerSequence: [marker],
        verseRefs,
        fingerprint,
        // Store the whole para node — stitchUsfm emits it verbatim.
        originalNodes: [orig],
        displaySegments,
      });
      ordinal++;
    }
    // Ignore other node types at the top level (e.g. unrecognised markers).
  }

  return groupContinuations(units);
}

/**
 * Merge continuation paragraph units into the preceding verse-owning body
 * paragraph, creating verse-groups.
 *
 * A unit is a candidate for merging when ALL of:
 *   1. Its `marker` is in CONTINUATION_MARKERS.
 *   2. It has no `\v` nodes of its own (verseRefs.length === 0).
 *   3. The immediately preceding unit in the accumulator is a body paragraph
 *      (primary marker in PARAGRAPH_MARKERS) that owns at least one verse.
 *
 * Headings (\s*, \mt*, etc.) always start a new independent unit.
 *
 * Fingerprint is recomputed with the primary (first) marker as the struct-key
 * prefix, so merged and un-merged counterparts on the other side still LCS-pair
 * as 'changed' rather than independent ours-only / theirs-only hunks.
 */
function groupContinuations(units: ParaUnit[]): ParaUnit[] {
  const result: ParaUnit[] = [];

  for (const unit of units) {
    const prev = result.length > 0 ? result[result.length - 1] : null;

    const isContinuation =
      CONTINUATION_MARKERS.has(unit.marker) &&
      unit.verseRefs.length === 0 &&
      prev !== null &&
      PARAGRAPH_MARKERS.has(prev.markerSequence[0]) &&
      prev.verseRefs.length > 0;

    if (isContinuation && prev !== null) {
      // Insert a synthetic para-break segment so the renderer still shows the
      // visual paragraph division within the group.
      const syntheticBreak: RenderSegment = { kind: 'para-break', text: '', marker: unit.marker };
      const mergedDisplaySegs = [...prev.displaySegments, syntheticBreak, ...unit.displaySegments];
      const mergedOrigNodes = [...prev.originalNodes, ...unit.originalNodes];
      const mergedMarkerSeq = [...prev.markerSequence, unit.marker];

      // Recompute text hash over all combined content nodes.
      const allContent = mergedOrigNodes.flatMap((n) =>
        isUsjNode(n) && Array.isArray(n.content) ? (n.content as unknown[]) : [],
      );
      const combinedText = plainTextFromNodes(allContent);
      const textHash = djb2(combinedText);

      // Use the primary (first) marker so cross-side pairing still works in LCS.
      const primaryMarker = mergedMarkerSeq[0];
      const structKey = `${primaryMarker}|${prev.verseRefs.join(',')}`;
      const fingerprint = `${structKey}|${textHash}`;

      result[result.length - 1] = {
        ...prev,
        markerSequence: mergedMarkerSeq,
        fingerprint,
        originalNodes: mergedOrigNodes,
        displaySegments: mergedDisplaySegs,
      };
    } else {
      result.push(unit);
    }
  }

  return result;
}

/**
 * Return the concatenated inner content nodes of all para nodes in a ParaUnit.
 *
 * For a simple (single-node) unit this returns just that node's content array.
 * For a verse-group with multiple original nodes (continuation paragraphs merged
 * into one unit), it concatenates every node's content in document order so that
 * `collectVerses` receives a flat stream including both the verse node and any
 * continuation text that follows.
 */
export function paraContentNodes(unit: ParaUnit): unknown[] {
  if (unit.originalNodes.length === 1) {
    const node = unit.originalNodes[0];
    if (isUsjNode(node) && Array.isArray(node.content)) return node.content as unknown[];
    return [];
  }
  // Multi-node group: flatten all para nodes' content arrays.
  return unit.originalNodes.flatMap((n) =>
    isUsjNode(n) && Array.isArray(n.content) ? (n.content as unknown[]) : [],
  );
}

// ---------------------------------------------------------------------------
// Paragraph-level diff
// ---------------------------------------------------------------------------

export type ParagraphHunkKind = 'unchanged' | 'changed' | 'ours-only' | 'theirs-only' | 'split';

export type ParagraphHunk =
  | { kind: 'unchanged';   id: string; ours: ParaUnit; theirs: ParaUnit }
  | { kind: 'changed';     id: string; ours: ParaUnit; theirs: ParaUnit }
  | { kind: 'ours-only';   id: string; ours: ParaUnit }
  | { kind: 'theirs-only'; id: string; theirs: ParaUnit }
  /**
   * One side reorganised the same verse range into a different number of paragraphs.
   * `oursParas` and `theirsParas` together cover identical verse sets but differ in
   * paragraph structure — i.e. a split (1→N), merge (N→1), or full restructure (N→M).
   */
  | { kind: 'split'; id: string; oursParas: ParaUnit[]; theirsParas: ParaUnit[] };

/**
 * Diff two lists of `ParaUnit` using LCS keyed on `marker|verseRefs`
 * (text-hash excluded so edited paragraphs still pair up).
 *
 * Produces `ParagraphHunk[]` in document order.
 */
export function diffParagraphs(
  oursParas: ParaUnit[],
  theirsParas: ParaUnit[],
): ParagraphHunk[] {
  // structKey = everything before the last '|' (i.e. `marker|verseRefs`)
  const oKeys = oursParas.map((p) => p.fingerprint.slice(0, p.fingerprint.lastIndexOf('|')));
  const tKeys = theirsParas.map((p) => p.fingerprint.slice(0, p.fingerprint.lastIndexOf('|')));
  const dp = lcsMatrix(oKeys, tKeys);

  // Single timeline of ops — zipping two parallel op arrays drops steps when
  // lengths differ (e.g. 1× remove vs 2× add for a paragraph split).
  const steps: Array<'keep' | 'remove' | 'add'> = [];
  let i = oursParas.length;
  let j = theirsParas.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oKeys[i - 1] === tKeys[j - 1]) {
      steps.unshift('keep');
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      steps.unshift('add');
      j--;
    } else {
      steps.unshift('remove');
      i--;
    }
  }

  const hunks: ParagraphHunk[] = [];
  let oi = 0;
  let ti = 0;
  let hunkOrdinal = 0;
  for (const step of steps) {
    const id = `hunk${hunkOrdinal++}`;
    if (step === 'keep') {
      const oU = oursParas[oi++];
      const tU = theirsParas[ti++];
      // Same struct key — compare text hash to decide changed vs unchanged
      const oHash = oU.fingerprint.slice(oU.fingerprint.lastIndexOf('|') + 1);
      const tHash = tU.fingerprint.slice(tU.fingerprint.lastIndexOf('|') + 1);
      if (oHash === tHash) {
        hunks.push({ kind: 'unchanged', id, ours: oU, theirs: tU });
      } else {
        hunks.push({ kind: 'changed', id, ours: oU, theirs: tU });
      }
    } else if (step === 'remove') {
      hunks.push({ kind: 'ours-only', id, ours: oursParas[oi++] });
    } else {
      hunks.push({ kind: 'theirs-only', id, theirs: theirsParas[ti++] });
    }
  }

  return coalesceSplitMerges(hunks);
}

/**
 * Post-process a raw `ParagraphHunk[]` to detect paragraph splits and merges.
 *
 * A split/merge occurs when a maximal consecutive run of `'ours-only'` and
 * `'theirs-only'` hunks covers the **same set of verse numbers** on both sides
 * AND at least one side has more than one paragraph.  Such a run is collapsed
 * into a single `'split'` hunk so the user can make one structure decision and
 * then (optionally) drill into per-verse text picks.
 *
 * Runs where the verse sets differ (genuine independent insertions/deletions)
 * are left as individual `'ours-only'` / `'theirs-only'` hunks.
 */
export function coalesceSplitMerges(hunks: ParagraphHunk[]): ParagraphHunk[] {
  const result: ParagraphHunk[] = [];
  let i = 0;

  while (i < hunks.length) {
    const h = hunks[i];
    if (h.kind !== 'ours-only' && h.kind !== 'theirs-only') {
      result.push(h);
      i++;
      continue;
    }

    // Collect the maximal run of ours-only + theirs-only hunks starting at i.
    let j = i;
    const runOurs: ParaUnit[]   = [];
    const runTheirs: ParaUnit[] = [];
    let runId = h.id;
    while (j < hunks.length) {
      const rh = hunks[j];
      if (rh.kind === 'ours-only')   { runOurs.push(rh.ours);     j++; }
      else if (rh.kind === 'theirs-only') { runTheirs.push(rh.theirs); j++; }
      else break;
    }

    // Compute verse number unions for each side.
    const oursVerseSet   = new Set(runOurs.flatMap((p) => p.verseRefs));
    const theirsVerseSet = new Set(runTheirs.flatMap((p) => p.verseRefs));

    // Coalesce only when both sides have verses, the sets match, and the
    // structural arrangement differs (at least one side has multiple paragraphs).
    const versesMismatch =
      oursVerseSet.size !== theirsVerseSet.size ||
      [...oursVerseSet].some((v) => !theirsVerseSet.has(v));

    if (
      !versesMismatch &&
      oursVerseSet.size > 0 &&
      runOurs.length > 0 &&
      runTheirs.length > 0 &&
      (runOurs.length > 1 || runTheirs.length > 1)
    ) {
      result.push({ kind: 'split', id: runId, oursParas: runOurs, theirsParas: runTheirs });
    } else {
      // Not a structural split — emit as individual hunks unchanged.
      for (let k = i; k < j; k++) result.push(hunks[k]!);
    }
    i = j;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Verse-level collection + diff (B1b)
// ---------------------------------------------------------------------------

/**
 * A single verse unit within a paragraph.
 * `verseNum === '_pre'` holds any content that appears before the first `\v`.
 */
export interface VerseUnit {
  verseNum: string;
  /** Original USJ nodes for this verse (alignment markers intact). */
  originalNodes: unknown[];
  /** Display segments (alignment stripped). */
  displaySegments: RenderSegment[];
  /** djb2 of the plain visible text. */
  textHash: string;
  /** Word-level alignment data extracted from the original (aligned) nodes. */
  alignment: VerseAlignment;
}

/**
 * Slice the original nodes of a `ParaUnit` into per-verse `VerseUnit`s.
 * Pre-verse content (before the first `\v`) is captured under `'_pre'`.
 * The verse node itself is included at the start of its slice's `originalNodes`.
 *
 * @param originalNodes  Alignment-preserving nodes (from `ParaUnit.originalNodes`).
 * @param strippedNodes  Stripped nodes at the same structural level (for display segments).
 */
export function collectVerses(
  originalNodes: unknown[],
  strippedNodes: unknown[],
): VerseUnit[] {
  const units: VerseUnit[] = [];
  let currentVerseNum = '_pre';
  let origBuf: unknown[] = [];
  let stripBuf: unknown[] = [];

  const flush = () => {
    if (origBuf.length === 0 && stripBuf.length === 0) return;
    const plainText = plainTextFromNodes(origBuf);
    const alignment = extractVerseAlignment(origBuf);
    units.push({
      verseNum: currentVerseNum,
      originalNodes: origBuf,
      displaySegments: collectSegments(stripBuf),
      textHash: djb2(plainText),
      alignment,
    });
    origBuf = [];
    stripBuf = [];
  };

  const len = Math.max(originalNodes.length, strippedNodes.length);
  for (let i = 0; i < len; i++) {
    const orig = originalNodes[i];
    const strip = strippedNodes[i];
    if (isUsjNode(orig) && orig.type === 'verse') {
      flush();
      currentVerseNum = String(orig.number ?? '').trim() || '_pre';
      origBuf.push(orig);
      if (strip !== undefined) stripBuf.push(strip);
    } else {
      if (orig !== undefined) origBuf.push(orig);
      if (strip !== undefined) stripBuf.push(strip);
    }
  }
  flush();

  return units;
}

export type VerseHunkKind = 'unchanged' | 'changed' | 'alignment-only' | 'ours-only' | 'theirs-only';

export type VerseHunk =
  | { kind: 'unchanged';      id: string; ours: VerseUnit; theirs: VerseUnit }
  | { kind: 'changed';        id: string; ours: VerseUnit; theirs: VerseUnit }
  | { kind: 'alignment-only'; id: string; ours: VerseUnit; theirs: VerseUnit }
  | { kind: 'ours-only';      id: string; ours: VerseUnit }
  | { kind: 'theirs-only';    id: string; theirs: VerseUnit };

/**
 * Diff two lists of `VerseUnit` using LCS keyed on `verseNum`.
 * `changed` is emitted when verse numbers match but `textHash` differs.
 */
export function diffVerses(
  oursVerses: VerseUnit[],
  theirsVerses: VerseUnit[],
  paraHunkId: string,
): VerseHunk[] {
  const oKeys = oursVerses.map((v) => v.verseNum);
  const tKeys = theirsVerses.map((v) => v.verseNum);
  const dp = lcsMatrix(oKeys, tKeys);

  const steps: Array<'keep' | 'remove' | 'add'> = [];
  let i = oursVerses.length;
  let j = theirsVerses.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oKeys[i - 1] === tKeys[j - 1]) {
      steps.unshift('keep');
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      steps.unshift('add');
      j--;
    } else {
      steps.unshift('remove');
      i--;
    }
  }

  const hunks: VerseHunk[] = [];
  let oi = 0;
  let ti = 0;
  let vk = 0;
  for (const step of steps) {
    const id = `${paraHunkId}:v${vk++}`;
    if (step === 'keep') {
      const oV = oursVerses[oi++];
      const tV = theirsVerses[ti++];
      if (oV.textHash === tV.textHash) {
        hunks.push({ kind: 'unchanged', id, ours: oV, theirs: tV });
      } else {
        hunks.push({ kind: 'changed', id, ours: oV, theirs: tV });
      }
    } else if (step === 'remove') {
      hunks.push({ kind: 'ours-only', id, ours: oursVerses[oi++] });
    } else {
      hunks.push({ kind: 'theirs-only', id, theirs: theirsVerses[ti++] });
    }
  }

  return hunks;
}

/**
 * Build a verseNum → stripped-text map from a paragraph's displaySegments.
 * Used by enrichWithVerses to recompute VerseUnit.textHash from canonical
 * (alignment-free) text, so visually-identical verses produce equal hashes
 * regardless of whether one side uses \zaln-s/\w wrappers and the other a
 * single plain text run.
 *
 * Pre-verse content (before the first \v) is keyed under '_pre', matching
 * the convention used by collectVerses.
 */
function verseTextsFromDisplaySegments(segs: RenderSegment[]): Map<string, string> {
  const map = new Map<string, string>();
  let current = '_pre';
  for (const s of segs) {
    if (s.kind === 'verse') {
      current = s.verseNum ?? '_pre';
      continue;
    }
    if (
      s.kind === 'text' ||
      s.kind === 'heading-text' ||
      s.kind === 'intro-heading' ||
      s.kind === 'footnote'
    ) {
      map.set(current, (map.get(current) ?? '') + s.text);
    }
  }
  return map;
}

/**
 * Enrich a list of `ParagraphHunk`s so that every `'changed'` or `'split'` hunk
 * also carries `verseHunks`.  Unchanged/ours-only/theirs-only hunks are
 * returned as-is.
 */
export type EnrichedParagraphHunk =
  | (Extract<ParagraphHunk, { kind: 'unchanged' | 'ours-only' | 'theirs-only' }>)
  | (Extract<ParagraphHunk, { kind: 'changed' }> & { verseHunks: VerseHunk[] })
  | (Extract<ParagraphHunk, { kind: 'split' }>   & { verseHunks: VerseHunk[] });

/** Merged display segments for a list of ParaUnits with synthetic paragraph breaks. */
function mergedDisplaySegments(paras: ParaUnit[]): RenderSegment[] {
  const segs: RenderSegment[] = [];
  for (let i = 0; i < paras.length; i++) {
    if (i > 0) {
      // Insert a synthetic para-break so SideBlock renders the split visually.
      const marker = paras[i]!.marker;
      segs.push({ kind: 'para-break', text: '', marker });
    }
    segs.push(...paras[i]!.displaySegments);
  }
  return segs;
}

/** Flatten content nodes from all paragraphs in a ParaUnit list. */
function flattenContentNodes(paras: ParaUnit[]): unknown[] {
  return paras.flatMap((p) => paraContentNodes(p));
}

export function enrichWithVerses(
  hunks: ParagraphHunk[],
): EnrichedParagraphHunk[] {
  const rehash = (vs: VerseUnit[], texts: Map<string, string>): VerseUnit[] =>
    vs.map((v) => {
      const t = (texts.get(v.verseNum) ?? '').replace(/\s+/g, ' ').trim();
      return { ...v, textHash: djb2(t) };
    });

  const promoteAlignmentOnly = (rawHunks: VerseHunk[]): VerseHunk[] =>
    rawHunks.map((vh) => {
      if (vh.kind !== 'unchanged') return vh;
      const oFP = alignmentFingerprintForVerseNodes(vh.ours.originalNodes);
      const tFP = alignmentFingerprintForVerseNodes(vh.theirs.originalNodes);
      if (oFP === tFP) return vh;
      return { kind: 'alignment-only' as const, id: vh.id, ours: vh.ours, theirs: vh.theirs };
    });

  return hunks.map((h) => {
    // ── 'changed': single-para vs single-para ─────────────────────────────
    if (h.kind === 'changed') {
      const oContent = paraContentNodes(h.ours);
      const tContent = paraContentNodes(h.theirs);
      const oTexts = verseTextsFromDisplaySegments(h.ours.displaySegments);
      const tTexts = verseTextsFromDisplaySegments(h.theirs.displaySegments);
      const oVerses = rehash(collectVerses(oContent, oContent), oTexts);
      const tVerses = rehash(collectVerses(tContent, tContent), tTexts);
      const verseHunks = promoteAlignmentOnly(diffVerses(oVerses, tVerses, h.id));
      return { ...h, verseHunks } as EnrichedParagraphHunk;
    }

    // ── 'split': N-para vs M-para, same verse set ─────────────────────────
    if (h.kind === 'split') {
      const oContent  = flattenContentNodes(h.oursParas);
      const tContent  = flattenContentNodes(h.theirsParas);
      const oDisplaySegs = mergedDisplaySegments(h.oursParas);
      const tDisplaySegs = mergedDisplaySegments(h.theirsParas);
      const oTexts = verseTextsFromDisplaySegments(oDisplaySegs);
      const tTexts = verseTextsFromDisplaySegments(tDisplaySegs);
      const oVerses = rehash(collectVerses(oContent, oContent), oTexts);
      const tVerses = rehash(collectVerses(tContent, tContent), tTexts);
      const verseHunks = promoteAlignmentOnly(diffVerses(oVerses, tVerses, h.id));
      return { ...h, verseHunks } as EnrichedParagraphHunk;
    }

    return h as EnrichedParagraphHunk;
  });
}

/** Public helper: merged display segments across multiple ParaUnits (for UI rendering). */
export { mergedDisplaySegments as mergeParaDisplaySegments };

// ---------------------------------------------------------------------------
// Unified line diff (for the "Raw diff" pane)
// ---------------------------------------------------------------------------

export type LineDiffKind = 'context' | 'add' | 'remove';

export interface DiffLine {
  kind: LineDiffKind;
  text: string;
}

/**
 * Produce a unified-format line diff between two strings.
 * Uses the same LCS approach as diffSegments but over lines.
 */
export function unifiedLineDiff(a: string, b: string): DiffLine[] {
  const aLines = a.split('\n');
  const bLines = b.split('\n');
  const dp = lcsMatrix(aLines, bLines);

  const result: DiffLine[] = [];
  let ai = aLines.length;
  let bi = bLines.length;
  const aOps: Array<'keep' | 'remove'> = [];
  const bOps: Array<'keep' | 'add'> = [];

  while (ai > 0 || bi > 0) {
    if (ai > 0 && bi > 0 && aLines[ai - 1] === bLines[bi - 1]) {
      aOps.unshift('keep');
      bOps.unshift('keep');
      ai--;
      bi--;
    } else if (bi > 0 && (ai === 0 || dp[ai][bi - 1] >= dp[ai - 1][bi])) {
      bOps.unshift('add');
      bi--;
    } else {
      aOps.unshift('remove');
      ai--;
    }
  }

  let a2 = 0;
  let b2 = 0;
  for (let k = 0; k < Math.max(aOps.length, bOps.length); k++) {
    const aOp = aOps[k];
    const bOp = bOps[k];
    if (aOp === 'keep' && bOp === 'keep') {
      result.push({ kind: 'context', text: aLines[a2++] });
      b2++;
    } else {
      // 'remove' and 'add' can occur at the same k (a modified line replaces another).
      if (aOp === 'remove') result.push({ kind: 'remove', text: aLines[a2++] });
      if (bOp === 'add') result.push({ kind: 'add', text: bLines[b2++] });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Word-level diff
// ---------------------------------------------------------------------------

export type WordChange = 'unchanged' | 'added' | 'removed';

export interface WordToken {
  text: string;
  change: WordChange;
  /** True when this token is pure whitespace — always classified 'unchanged'. */
  isSpace: boolean;
}

/**
 * Split `s` into alternating whitespace / word / punctuation tokens.
 * Words = letters, digits, underscore plus the Latin-1 Supplement range
 * (accented characters for Spanish, Portuguese, etc.).
 * Everything else — .,;:!?¡¿()[]{}"'… — becomes its own standalone token,
 * so word matching in the LCS is independent of attached punctuation.
 *
 * Examples:
 *   tokenizeWords('hola, mundo')  → ['hola', ',', ' ', 'mundo']
 *   tokenizeWords('vivir.')       → ['vivir', '.']
 *   tokenizeWords('¡Esto!')       → ['¡', 'Esto', '!']
 *
 * This is intentional: aligned USFM produces punctuation as separate tiny
 * segments (e.g. 'vivir' + '.'), while un-aligned USFM keeps them together
 * ('vivir.').  Splitting both the same way lets the LCS pair them correctly.
 */
export function tokenizeWords(s: string): string[] {
  return s.match(/\s+|[\w\u00C0-\u017F]+|[^\s\w\u00C0-\u017F]+/gu) ?? [];
}

/**
 * Word-level diff of two strings using the existing `lcsMatrix`.
 *
 * Whitespace tokens are always classified `'unchanged'` on both sides —
 * only visible word changes are highlighted.
 *
 * Returns:
 *   oursTokens   — tokens from `ours`; non-space tokens are `'unchanged'` | `'removed'`
 *   theirsTokens — tokens from `theirs`; non-space tokens are `'unchanged'` | `'added'`
 */
export function wordDiff(
  ours: string,
  theirs: string,
): { oursTokens: WordToken[]; theirsTokens: WordToken[] } {
  const oAll = tokenizeWords(ours);
  const tAll = tokenizeWords(theirs);

  // LCS over non-whitespace tokens only so word ops are computed without
  // whitespace affecting alignment.
  const oWords = oAll.filter((t) => !/^\s+$/.test(t));
  const tWords = tAll.filter((t) => !/^\s+$/.test(t));
  const dp = lcsMatrix(oWords, tWords);

  const oWordOps: Array<'keep' | 'remove'> = [];
  const tWordOps: Array<'keep' | 'add'> = [];
  let i = oWords.length;
  let j = tWords.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oWords[i - 1] === tWords[j - 1]) {
      oWordOps.unshift('keep');
      tWordOps.unshift('keep');
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      tWordOps.unshift('add');
      j--;
    } else {
      oWordOps.unshift('remove');
      i--;
    }
  }

  // Reconstruct full token arrays, interleaving whitespace as 'unchanged'.
  const oursTokens: WordToken[] = [];
  let oWordOpIdx = 0;
  for (const tok of oAll) {
    const isSpace = /^\s+$/.test(tok);
    if (isSpace) {
      oursTokens.push({ text: tok, change: 'unchanged', isSpace: true });
    } else {
      const op = oWordOps[oWordOpIdx++] ?? 'keep';
      oursTokens.push({ text: tok, change: op === 'remove' ? 'removed' : 'unchanged', isSpace: false });
    }
  }

  const theirsTokens: WordToken[] = [];
  let tWordOpIdx = 0;
  for (const tok of tAll) {
    const isSpace = /^\s+$/.test(tok);
    if (isSpace) {
      theirsTokens.push({ text: tok, change: 'unchanged', isSpace: true });
    } else {
      const op = tWordOps[tWordOpIdx++] ?? 'keep';
      theirsTokens.push({ text: tok, change: op === 'add' ? 'added' : 'unchanged', isSpace: false });
    }
  }

  return { oursTokens, theirsTokens };
}

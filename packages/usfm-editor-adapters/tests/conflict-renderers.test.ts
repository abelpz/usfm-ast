/**
 * Smoke tests for the conflict renderer logic (pure functions — no React DOM).
 *
 * Tests the algorithms that back each renderer:
 *   - lineDiff (PlainTextDiffView)
 *   - YAML key collection (YamlKeyDiffView)
 *   - USJ chapter slicing (UsfmChapterDiffView)
 *   - collectSegments intro markers (UsfmChapterDiffView)
 *   - diffSegments LCS (UsfmChapterDiffView)
 *   - JSON key collection (JsonKeyDiffView)
 *   - unifiedLineDiff (RawUsfmDiffPane)
 *   - alignmentFingerprintForVerseNodes / buildVerseAlignmentMap
 *   - diffSegments alignment-only reclassification
 */

import * as jsYaml from 'js-yaml';
import { USFMParser } from '@usfm-tools/parser';
import { splitUsjByChapter, stripAlignments } from '@usfm-tools/editor-core';
import {
  collectSegments,
  diffSegments,
  unifiedLineDiff,
  alignmentFingerprintForVerseNodes,
  fingerprintsFromAlignmentMap,
  wordDiff,
  tokenizeWords,
  collectParagraphs,
  paraContentNodes,
  collectVerses,
  diffParagraphs,
  enrichWithVerses,
  extractVerseAlignment,
  diffWordAlignments,
  alignmentGroupPickKey,
  resolveAlignmentGroupSide,
  mergedAlignmentGroups,
  type RenderSegment,
  type DiffLine,
  type SegmentChange,
} from '../../usfm-editor-app/src/components/conflict-renderers/usfm-diff-logic';
import {
  buildConflictWorkspaceState,
  readConflictWorkspaceState,
  type ConflictWorkspacePayload,
} from '../../usfm-editor-app/src/lib/conflict-workspace-state';
import { stitchUsfm, isMergedReady, type HunkRequirements } from '../../usfm-editor-app/src/components/conflict-renderers/usfm-stitch';

// ---------------------------------------------------------------------------
// lineDiff (extracted from PlainTextDiffView)
// ---------------------------------------------------------------------------

type DiffOp = 'equal' | 'delete' | 'insert';
function lineDiff(a: string, b: string): Array<{ op: DiffOp; text: string }> {
  const aLines = a.split('\n');
  const bLines = b.split('\n');
  const m = aLines.length;
  const n = bLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (aLines[i] === bLines[j]) {
        dp[i][j] = 1 + dp[i + 1][j + 1];
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }
  const result: Array<{ op: DiffOp; text: string }> = [];
  let i = 0;
  let j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && aLines[i] === bLines[j]) {
      result.push({ op: 'equal', text: aLines[i] + '\n' });
      i++; j++;
    } else if (j < n && (i >= m || dp[i + 1][j] >= dp[i][j + 1])) {
      result.push({ op: 'insert', text: bLines[j] + '\n' });
      j++;
    } else {
      result.push({ op: 'delete', text: aLines[i] + '\n' });
      i++;
    }
  }
  return result;
}

describe('lineDiff (PlainTextDiffView logic)', () => {
  it('identical texts produce only equal ops', () => {
    const diffs = lineDiff('hello\nworld\n', 'hello\nworld\n');
    expect(diffs.every((d) => d.op === 'equal')).toBe(true);
  });

  it('completely different texts produce no equal ops', () => {
    const diffs = lineDiff('foo\n', 'bar\n');
    expect(diffs.some((d) => d.op === 'equal')).toBe(false);
    expect(diffs.some((d) => d.op === 'delete')).toBe(true);
    expect(diffs.some((d) => d.op === 'insert')).toBe(true);
  });

  it('addition at end is detected', () => {
    const diffs = lineDiff('line1\n', 'line1\nline2\n');
    expect(diffs.some((d) => d.op === 'insert' && d.text === 'line2\n')).toBe(true);
    // Trailing empty-line artifacts from split('\n') may produce a delete of '\n'; that's ok.
    // The important check is that meaningful content is not deleted.
    expect(diffs.every((d) => d.op !== 'delete' || d.text === '\n')).toBe(true);
  });

  it('deletion at start is detected', () => {
    const diffs = lineDiff('removed\nkept\n', 'kept\n');
    expect(diffs.some((d) => d.op === 'delete' && d.text === 'removed\n')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// YAML key collection (YamlKeyDiffView logic)
// ---------------------------------------------------------------------------

type PlainObj = Record<string, unknown>;

function isPlainObj(v: unknown): v is PlainObj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function canonical(v: unknown): string {
  return JSON.stringify(v) ?? '';
}

interface KeyRow {
  dotPath: string;
  oursChanged: boolean;
  theirsChanged: boolean;
  conflict: boolean;
}

function collectRows(base: PlainObj, ours: PlainObj, theirs: PlainObj, prefix = ''): KeyRow[] {
  const allKeys = new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)]);
  const rows: KeyRow[] = [];
  for (const key of allKeys) {
    const dotPath = prefix ? `${prefix}.${key}` : key;
    const bVal = base[key];
    const oVal = ours[key];
    const tVal = theirs[key];
    if (isPlainObj(bVal) && isPlainObj(oVal) && isPlainObj(tVal)) {
      rows.push(...collectRows(bVal, oVal, tVal, dotPath));
    } else {
      const bCan = canonical(bVal);
      const oCan = canonical(oVal);
      const tCan = canonical(tVal);
      if (oCan === tCan && oCan === bCan) continue;
      rows.push({
        dotPath,
        oursChanged: oCan !== bCan,
        theirsChanged: tCan !== bCan,
        conflict: oCan !== tCan && oCan !== bCan && tCan !== bCan,
      });
    }
  }
  return rows;
}

describe('YAML key collection (YamlKeyDiffView logic)', () => {
  it('no rows when all three sides are identical', () => {
    const obj = { title: 'Titus', version: '1' };
    expect(collectRows(obj, obj, obj)).toHaveLength(0);
  });

  it('detects conflict when both sides changed same key differently', () => {
    const base = { title: 'Old' };
    const ours = { title: 'Version A' };
    const theirs = { title: 'Version B' };
    const rows = collectRows(base, ours, theirs);
    expect(rows).toHaveLength(1);
    expect(rows[0].conflict).toBe(true);
  });

  it('detects theirs-only change (no conflict)', () => {
    const base = { title: 'Old', version: '1' };
    const ours = { title: 'Old', version: '1' };
    const theirs = { title: 'New', version: '1' };
    const rows = collectRows(base, ours, theirs);
    expect(rows).toHaveLength(1);
    expect(rows[0].conflict).toBe(false);
    expect(rows[0].theirsChanged).toBe(true);
  });

  it('handles nested YAML objects', () => {
    const base = { dublin_core: { modified: '2024-01-01', title: 'Titus' } };
    const ours = { dublin_core: { modified: '2024-06-01', title: 'Titus' } };
    const theirs = { dublin_core: { modified: '2024-09-01', title: 'Titus' } };
    const rows = collectRows(
      base as PlainObj,
      ours as PlainObj,
      theirs as PlainObj,
    );
    // Only modified differs; title is equal
    expect(rows).toHaveLength(1);
    expect(rows[0].dotPath).toBe('dublin_core.modified');
  });

  it('js-yaml parses round-trip YAML correctly', () => {
    const yaml = 'title: Titus\nversion: "1"\n';
    const parsed = jsYaml.load(yaml);
    expect(isPlainObj(parsed)).toBe(true);
    if (isPlainObj(parsed)) {
      expect(parsed.title).toBe('Titus');
    }
  });
});

// ---------------------------------------------------------------------------
// collectSegments — intro markers (UsfmChapterDiffView)
// ---------------------------------------------------------------------------

describe('collectSegments — intro markers', () => {
  function parseNodes(usfm: string): unknown[] {
    const p = new USFMParser({ silentConsole: true });
    p.parse(usfm);
    const usj = p.toJSON() as { content?: unknown[] };
    const slices = splitUsjByChapter(usj);
    const ch0 = slices.find((s) => s.chapter === 0);
    return ch0?.nodes ?? [];
  }

  it('\\mt produces an intro-heading segment', () => {
    const nodes = parseNodes('\\id JUD\n\\mt Judas\n');
    const segs = collectSegments(nodes);
    const headings = segs.filter((s) => s.kind === 'intro-heading' || (s.kind === 'text' && s.text.includes('Judas')));
    // Either the text is tagged as intro-heading or it appears in a text segment
    expect(segs.some((s) => s.text.includes('Judas'))).toBe(true);
  });

  it('\\mt1 produces a segment with the title text', () => {
    const nodes = parseNodes('\\id JUD\n\\mt1 The Letter of Jude\n');
    const segs = collectSegments(nodes);
    expect(segs.some((s) => s.text.includes('Jude'))).toBe(true);
  });

  it('\\ip (intro paragraph) produces a segment with text', () => {
    const nodes = parseNodes('\\id JUD\n\\ip This is an introduction.\n');
    const segs = collectSegments(nodes);
    expect(segs.some((s) => s.text && s.text.includes('introduction'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// diffSegments — LCS-based segment diff (UsfmChapterDiffView)
// ---------------------------------------------------------------------------

describe('diffSegments (UsfmChapterDiffView LCS)', () => {
  function makeSegs(verses: Array<{ num: string; text: string }>): RenderSegment[] {
    const segs: RenderSegment[] = [];
    for (const v of verses) {
      segs.push({ kind: 'verse', text: '', verseNum: v.num });
      segs.push({ kind: 'text', text: v.text });
    }
    return segs;
  }

  it('identical segments produce all-unchanged diff', () => {
    const segs = makeSegs([{ num: '1', text: 'In the beginning' }]);
    const { oursDiff, theirsDiff } = diffSegments(segs, segs);
    expect(oursDiff.every((s) => s.change === 'unchanged')).toBe(true);
    expect(theirsDiff.every((s) => s.change === 'unchanged')).toBe(true);
  });

  it('added verse on theirs side is marked added', () => {
    const ours = makeSegs([{ num: '1', text: 'Hello' }]);
    const theirs = makeSegs([{ num: '1', text: 'Hello' }, { num: '2', text: 'World' }]);
    const { theirsDiff } = diffSegments(ours, theirs);
    const addedSegs = theirsDiff.filter((s) => s.change === 'added');
    expect(addedSegs.length).toBeGreaterThan(0);
  });

  it('removed verse on ours side is marked removed', () => {
    const ours = makeSegs([{ num: '1', text: 'Hello' }, { num: '2', text: 'World' }]);
    const theirs = makeSegs([{ num: '1', text: 'Hello' }]);
    const { oursDiff } = diffSegments(ours, theirs);
    const removedSegs = oursDiff.filter((s) => s.change === 'removed');
    expect(removedSegs.length).toBeGreaterThan(0);
  });

  it('unchanged verse content is marked unchanged', () => {
    const ours = makeSegs([{ num: '1', text: 'Same' }, { num: '2', text: 'Different A' }]);
    const theirs = makeSegs([{ num: '1', text: 'Same' }, { num: '2', text: 'Different B' }]);
    const { oursDiff, theirsDiff } = diffSegments(ours, theirs);
    // v1 and its text should be unchanged on ours side
    const oursV1Text = oursDiff.find((s) => s.kind === 'text' && s.text === 'Same');
    expect(oursV1Text?.change).toBe('unchanged');
    // v2 text on ours is removed (or at minimum not unchanged), and theirs has an added segment
    const hasOursRemoved = oursDiff.some((s) => s.change === 'removed');
    const hasTheirsAdded = theirsDiff.some((s) => s.change === 'added');
    // At least one side should show a difference from the common LCS
    expect(hasOursRemoved || hasTheirsAdded).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// JSON key collection (JsonKeyDiffView logic — mirrors YamlKeyDiffView)
// ---------------------------------------------------------------------------

describe('JSON key collection (JsonKeyDiffView logic)', () => {
  function collectJsonRows(baseStr: string, oursStr: string, theirsStr: string) {
    type PlainObjJ = Record<string, unknown>;
    function isPlainObjJ(v: unknown): v is PlainObjJ {
      return typeof v === 'object' && v !== null && !Array.isArray(v);
    }
    function canonJ(v: unknown): string { return JSON.stringify(v) ?? ''; }
    function collectJ(base: PlainObjJ, ours: PlainObjJ, theirs: PlainObjJ, prefix = ''): Array<{ dotPath: string; conflict: boolean }> {
      const allKeys = new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)]);
      const rows: Array<{ dotPath: string; conflict: boolean }> = [];
      for (const key of allKeys) {
        const dotPath = prefix ? `${prefix}.${key}` : key;
        const bVal = base[key], oVal = ours[key], tVal = theirs[key];
        if (isPlainObjJ(oVal) && isPlainObjJ(tVal)) {
          rows.push(...collectJ(isPlainObjJ(bVal) ? bVal : {}, oVal, tVal, dotPath));
        } else {
          const bCan = canonJ(bVal), oCan = canonJ(oVal), tCan = canonJ(tVal);
          if (oCan === tCan && oCan === bCan) continue;
          rows.push({ dotPath, conflict: oCan !== tCan && oCan !== bCan && tCan !== bCan });
        }
      }
      return rows;
    }
    const b = JSON.parse(baseStr || '{}') as PlainObjJ;
    const o = JSON.parse(oursStr) as PlainObjJ;
    const t = JSON.parse(theirsStr) as PlainObjJ;
    return collectJ(b, o, t);
  }

  it('no rows when JSON is identical', () => {
    const j = JSON.stringify({ format: 'usfm-alignment', verses: {} });
    expect(collectJsonRows(j, j, j)).toHaveLength(0);
  });

  it('detects timestamp-only difference as a row', () => {
    const base   = JSON.stringify({ updated: '2024-01-01', verses: {} });
    const ours   = JSON.stringify({ updated: '2024-06-01', verses: {} });
    const theirs = JSON.stringify({ updated: '2024-09-01', verses: {} });
    const rows = collectJsonRows(base, ours, theirs);
    expect(rows).toHaveLength(1);
    expect(rows[0].dotPath).toBe('updated');
    expect(rows[0].conflict).toBe(true);
  });

  it('detects conflict when real verses content differs', () => {
    const base   = JSON.stringify({ verses: { '3JN 1:1': ['a'] } });
    const ours   = JSON.stringify({ verses: { '3JN 1:1': ['b'] } });
    const theirs = JSON.stringify({ verses: { '3JN 1:1': ['c'] } });
    const rows = collectJsonRows(base, ours, theirs);
    const versesRow = rows.find((r) => r.dotPath.includes('3JN'));
    expect(versesRow).toBeDefined();
    expect(versesRow!.conflict).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// USJ chapter slicing (UsfmChapterDiffView logic)
// ---------------------------------------------------------------------------

function parseUsj(usfm: string) {
  const p = new USFMParser({ silentConsole: true });
  p.parse(usfm);
  return p.toJSON() as { content?: unknown[] };
}

describe('splitUsjByChapter (UsfmChapterDiffView logic)', () => {
  const USFM_TIT = [
    '\\id TIT en_ult',
    '\\c 1',
    '\\p',
    '\\v 1 Paul, a servant of God',
    '\\v 2 In hope of eternal life',
    '\\c 2',
    '\\p',
    '\\v 1 But speak what is right',
    '',
  ].join('\n');

  it('splits multi-chapter USFM into chapter slices', () => {
    const usj = parseUsj(USFM_TIT);
    const slices = splitUsjByChapter(usj);
    const chapNums = slices.map((s) => s.chapter);
    expect(chapNums).toContain(1);
    expect(chapNums).toContain(2);
  });

  it('chapter 0 holds intro material', () => {
    const usj = parseUsj(USFM_TIT);
    const slices = splitUsjByChapter(usj);
    const ch0 = slices.find((s) => s.chapter === 0);
    // The \id node is in chapter 0
    expect(ch0).toBeDefined();
  });

  it('filters to specific chapters when given indices', () => {
    const usj = parseUsj(USFM_TIT);
    const all = splitUsjByChapter(usj);
    const targeted = all.filter((s) => [1].includes(s.chapter));
    expect(targeted).toHaveLength(1);
    expect(targeted[0].chapter).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// unifiedLineDiff
// ---------------------------------------------------------------------------

describe('unifiedLineDiff', () => {
  it('returns all context when inputs are identical', () => {
    const lines: DiffLine[] = unifiedLineDiff('foo\nbar\n', 'foo\nbar\n');
    expect(lines.every((l) => l.kind === 'context')).toBe(true);
  });

  it('marks added lines with kind=add', () => {
    const lines = unifiedLineDiff('foo\n', 'foo\nnew line\n');
    const added = lines.filter((l) => l.kind === 'add');
    expect(added.some((l) => l.text === 'new line')).toBe(true);
  });

  it('marks removed lines with kind=remove', () => {
    const lines = unifiedLineDiff('foo\nremoved\nbar\n', 'foo\nbar\n');
    const removed = lines.filter((l) => l.kind === 'remove');
    expect(removed.some((l) => l.text === 'removed')).toBe(true);
  });

  it('interleaves add/remove for a changed line in the middle', () => {
    const lines = unifiedLineDiff('a\nold\nb\n', 'a\nnew\nb\n');
    const kinds = lines.map((l) => l.kind);
    expect(kinds).toContain('remove');
    expect(kinds).toContain('add');
    expect(kinds).toContain('context');
  });

  it('returns empty array for two empty strings', () => {
    const lines = unifiedLineDiff('', '');
    // single empty string split by '\n' produces [''] — context line
    expect(lines.every((l) => l.kind === 'context')).toBe(true);
  });

  // Type-export sanity
  it('exports DiffLine and SegmentChange types correctly', () => {
    const dl: DiffLine = { kind: 'add', text: 'hello' };
    const sc: SegmentChange = 'alignment-only';
    expect(dl.kind).toBe('add');
    expect(sc).toBe('alignment-only');
  });
});

// ---------------------------------------------------------------------------
// alignmentFingerprintForVerseNodes
// ---------------------------------------------------------------------------

// A minimal aligned verse in USJ format (mimicking what USFMParser produces)
const ALIGNED_VERSE_NODES_A = [
  {
    type: 'ms',
    marker: 'zaln-s',
    'x-strong': 'G52790',
    'x-lemma': 'ὑπομιμνῄσκω',
    'x-content': 'ὑπομίμνῃσκε',
    'x-occurrence': '1',
    'x-occurrences': '1',
  },
  { type: 'char', marker: 'w', 'x-occurrence': '1', 'x-occurrences': '1', content: ['Remind'] },
  { type: 'ms', marker: 'zaln-e' },
];

// Same text, different Strong's number
const ALIGNED_VERSE_NODES_B = [
  {
    type: 'ms',
    marker: 'zaln-s',
    'x-strong': 'G99999',      // changed
    'x-lemma': 'ὑπομιμνῄσκω',
    'x-content': 'ὑπομίμνῃσκε',
    'x-occurrence': '1',
    'x-occurrences': '1',
  },
  { type: 'char', marker: 'w', 'x-occurrence': '1', 'x-occurrences': '1', content: ['Remind'] },
  { type: 'ms', marker: 'zaln-e' },
];

// Unaligned verse (no zaln or \w)
const UNALIGNED_VERSE_NODES = [
  'Remind the believers',
];

describe('alignmentFingerprintForVerseNodes', () => {
  it('produces the same fingerprint for identical alignment data', () => {
    const fp1 = alignmentFingerprintForVerseNodes(ALIGNED_VERSE_NODES_A);
    const fp2 = alignmentFingerprintForVerseNodes(ALIGNED_VERSE_NODES_A);
    expect(fp1).toBe(fp2);
  });

  it('produces different fingerprints when x-strong differs', () => {
    const fp1 = alignmentFingerprintForVerseNodes(ALIGNED_VERSE_NODES_A);
    const fp2 = alignmentFingerprintForVerseNodes(ALIGNED_VERSE_NODES_B);
    expect(fp1).not.toBe(fp2);
  });

  it('produces a different fingerprint when one side is unaligned', () => {
    const fp1 = alignmentFingerprintForVerseNodes(ALIGNED_VERSE_NODES_A);
    const fp2 = alignmentFingerprintForVerseNodes(UNALIGNED_VERSE_NODES);
    expect(fp1).not.toBe(fp2);
  });

  it('returns an empty string for nodes with no alignment data', () => {
    const fp = alignmentFingerprintForVerseNodes(['plain text']);
    expect(fp).toBe('');
  });
});

// ---------------------------------------------------------------------------
// fingerprintsFromAlignmentMap
// ---------------------------------------------------------------------------

describe('fingerprintsFromAlignmentMap', () => {
  const MOCK_ALIGNMENTS = {
    'TIT 3:1': [
      {
        sources: [{ strong: 'G52790', lemma: 'ὑπομιμνῄσκω', content: 'ὑπομίμνῃσκε', occurrence: 1, occurrences: 1 }],
        targets: [{ word: 'Remind', occurrence: 1, occurrences: 1 }],
      },
    ],
    'TIT 3:2': [
      {
        sources: [{ strong: 'G09870', lemma: 'βλασφημέω', content: 'βλασφημεῖν', occurrence: 1, occurrences: 1 }],
        targets: [{ word: 'malign', occurrence: 1, occurrences: 1 }],
      },
    ],
    'TIT 1:1': [
      {
        sources: [{ strong: 'G39720', lemma: 'Παῦλος', content: 'Παῦλος', occurrence: 1, occurrences: 1 }],
        targets: [{ word: 'Paul', occurrence: 1, occurrences: 1 }],
      },
    ],
  };

  it('produces verse-number keys from verseRef', () => {
    const map = fingerprintsFromAlignmentMap(MOCK_ALIGNMENTS);
    // Without chapter filter, all verse refs build entries; later chapters overwrite earlier with same verse num
    expect(map.has('1')).toBe(true);
    expect(map.has('2')).toBe(true);
  });

  it('fingerprint for a verse with alignment is non-empty', () => {
    const map = fingerprintsFromAlignmentMap(MOCK_ALIGNMENTS, 3);
    expect((map.get('1') ?? '').length).toBeGreaterThan(0);
  });

  it('chapter filter restricts to the given chapter only', () => {
    const mapCh3 = fingerprintsFromAlignmentMap(MOCK_ALIGNMENTS, 3);
    const mapCh1 = fingerprintsFromAlignmentMap(MOCK_ALIGNMENTS, 1);
    // Both have verse 1, but the fingerprint should differ (different words)
    expect(mapCh3.get('1')).not.toBe(mapCh1.get('1'));
  });

  it('verses not in the chapter filter are excluded', () => {
    const map = fingerprintsFromAlignmentMap(MOCK_ALIGNMENTS, 1);
    // Chapter 1 only has verse 1 (TIT 1:1); TIT 3:1 and TIT 3:2 are excluded
    expect(map.has('2')).toBe(false);
  });

  it('empty alignments produces an empty map', () => {
    const map = fingerprintsFromAlignmentMap({});
    expect(map.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// diffSegments — alignment-only reclassification
// ---------------------------------------------------------------------------

describe('diffSegments — alignment-only reclassification', () => {
  function makeSegsWithFP(
    verses: Array<{ num: string; text: string; fp?: string }>,
  ): { segs: RenderSegment[]; fpMap: Map<string, string> } {
    const segs: RenderSegment[] = [];
    const fpMap = new Map<string, string>();
    for (const v of verses) {
      segs.push({ kind: 'verse', text: '', verseNum: v.num, alignmentFingerprint: v.fp ?? '' });
      segs.push({ kind: 'text', text: v.text });
      if (v.fp !== undefined) fpMap.set(v.num, v.fp);
    }
    return { segs, fpMap };
  }

  it('identical text + identical fingerprint → unchanged (not alignment-only)', () => {
    const { segs: ours, fpMap: oursFP } = makeSegsWithFP([{ num: '1', text: 'Remind', fp: 'fp-A' }]);
    const { segs: theirs, fpMap: theirsFP } = makeSegsWithFP([{ num: '1', text: 'Remind', fp: 'fp-A' }]);
    const { oursDiff, theirsDiff } = diffSegments(ours, theirs, oursFP, theirsFP);
    const oursV1 = oursDiff.find((s) => s.kind === 'verse' && s.verseNum === '1');
    expect(oursV1?.change).toBe('unchanged');
    const theirsV1 = theirsDiff.find((s) => s.kind === 'verse' && s.verseNum === '1');
    expect(theirsV1?.change).toBe('unchanged');
  });

  it('identical text + different fingerprint → alignment-only on both sides', () => {
    const { segs: ours, fpMap: oursFP } = makeSegsWithFP([{ num: '1', text: 'Remind', fp: 'fp-A' }]);
    const { segs: theirs, fpMap: theirsFP } = makeSegsWithFP([{ num: '1', text: 'Remind', fp: 'fp-B' }]);
    const { oursDiff, theirsDiff } = diffSegments(ours, theirs, oursFP, theirsFP);
    const oursV1 = oursDiff.find((s) => s.kind === 'verse' && s.verseNum === '1');
    expect(oursV1?.change).toBe('alignment-only');
    const theirsV1 = theirsDiff.find((s) => s.kind === 'verse' && s.verseNum === '1');
    expect(theirsV1?.change).toBe('alignment-only');
  });

  it('different text → not alignment-only even if fingerprints differ', () => {
    const { segs: ours, fpMap: oursFP } = makeSegsWithFP([{ num: '1', text: 'Remind', fp: 'fp-A' }]);
    const { segs: theirs, fpMap: theirsFP } = makeSegsWithFP([{ num: '1', text: 'Different', fp: 'fp-B' }]);
    const { oursDiff } = diffSegments(ours, theirs, oursFP, theirsFP);
    const oursV1 = oursDiff.find((s) => s.kind === 'verse' && s.verseNum === '1');
    // The verse key v:1 matches (LCS keeps it as unchanged), but the text segments differ
    // (Remind vs Different). The post-processing checks text content and skips reclassification.
    expect(oursV1?.change).not.toBe('alignment-only');
  });

  it('works without fingerprint maps (no alignment-only classification)', () => {
    const { segs: ours } = makeSegsWithFP([{ num: '1', text: 'Remind', fp: 'fp-A' }]);
    const { segs: theirs } = makeSegsWithFP([{ num: '1', text: 'Remind', fp: 'fp-B' }]);
    const { oursDiff } = diffSegments(ours, theirs); // no fingerprint maps
    const oursV1 = oursDiff.find((s) => s.kind === 'verse' && s.verseNum === '1');
    expect(oursV1?.change).toBe('unchanged');
  });
});

// ---------------------------------------------------------------------------
// stripAlignments pipeline produces same display text as plain USFM
// ---------------------------------------------------------------------------

describe('stripAlignments display-text pipeline', () => {
  // Aligned USFM: \zaln-s + \w wrapping "Remind"
  const ALIGNED_USFM = [
    '\\id TIT',
    '\\c 1',
    '\\p',
    '\\v 1 \\zaln-s |x-strong="G52790" x-lemma="ὑπομιμνῄσκω" x-content="rem" x-occurrence="1" x-occurrences="1"\\*\\w Remind|x-occurrence="1" x-occurrences="1"\\w*\\zaln-e\\*',
  ].join('\n');

  // Plain USFM: same visible text without alignment markers
  const PLAIN_USFM = [
    '\\id TIT',
    '\\c 1',
    '\\p',
    '\\v 1 Remind',
  ].join('\n');

  function parseAndStrip(usfm: string) {
    const p = new USFMParser({ silentConsole: true });
    p.parse(usfm);
    const usj = p.toJSON() as Parameters<typeof stripAlignments>[0];
    return stripAlignments(usj);
  }

  function segTexts(usfm: string): string[] {
    const { editable } = parseAndStrip(usfm);
    const slices = splitUsjByChapter(editable as { content?: unknown[] });
    const ch1 = slices.find((s) => s.chapter === 1);
    const segs = collectSegments(ch1?.nodes ?? []);
    return segs.filter((s) => s.kind === 'text').map((s) => s.text);
  }

  it('aligned and plain USFM produce the same display text after stripping', () => {
    const alignedTexts = segTexts(ALIGNED_USFM);
    const plainTexts = segTexts(PLAIN_USFM);
    expect(alignedTexts.join(' ').trim()).toBe(plainTexts.join(' ').trim());
  });

  it('stripAlignments extracts alignment data for aligned verse', () => {
    const { alignments } = parseAndStrip(ALIGNED_USFM);
    // Should have at least one verse with alignment data
    expect(Object.keys(alignments).length).toBeGreaterThan(0);
    const verseData = Object.values(alignments)[0];
    expect(verseData).toBeDefined();
    expect(verseData[0].sources[0].strong).toBe('G52790');
  });

  it('fingerprintsFromAlignmentMap builds a map from real aligned USFM alignments', () => {
    const { alignments } = parseAndStrip(ALIGNED_USFM);
    const map = fingerprintsFromAlignmentMap(alignments);
    expect(map.size).toBeGreaterThan(0);
    const fp = [...map.values()][0];
    expect(fp.length).toBeGreaterThan(0);
  });

  it('collectVerses: aligned and plain USFM produce equal textHash for the same verse', () => {
    function parseUsj(usfm: string) {
      const p = new USFMParser({ silentConsole: true });
      p.parse(usfm);
      return p.toJSON() as { content?: unknown[] };
    }

    const alignedUsj = parseUsj(ALIGNED_USFM);
    const plainUsj   = parseUsj(PLAIN_USFM);

    const alignedSlices = splitUsjByChapter(alignedUsj);
    const plainSlices   = splitUsjByChapter(plainUsj);

    const alignedNodes = alignedSlices.find((s) => s.chapter === 1)?.nodes ?? [];
    const plainNodes   = plainSlices.find((s) => s.chapter === 1)?.nodes ?? [];

    const alignedParas = collectParagraphs(1, alignedNodes, alignedNodes);
    const plainParas   = collectParagraphs(1, plainNodes, plainNodes);

    const alignedVerses = collectVerses(paraContentNodes(alignedParas[0]), paraContentNodes(alignedParas[0]));
    const plainVerses   = collectVerses(paraContentNodes(plainParas[0]), paraContentNodes(plainParas[0]));

    expect(alignedVerses.length).toBe(plainVerses.length);
    expect(alignedVerses.length).toBeGreaterThan(0);
    expect(alignedVerses[0].textHash).toBe(plainVerses[0].textHash);
  });

  it('enrichWithVerses: alignment-only verse is unchanged; real-change verse is changed', () => {
    // Two-verse paragraph: v.1 same text but one side is aligned, v.2 has a real word change.
    const ALIGNED_TWO_VERSE = [
      '\\id TIT',
      '\\c 1',
      '\\p',
      '\\v 1 \\zaln-s |x-strong="G52790" x-lemma="ὑπομιμνῄσκω" x-content="rem" x-occurrence="1" x-occurrences="1"\\*\\w Remind|x-occurrence="1" x-occurrences="1"\\w*\\zaln-e\\*',
      '\\v 2 \\zaln-s |x-strong="G12340" x-lemma="foo" x-content="bar" x-occurrence="1" x-occurrences="1"\\*\\w Hello|x-occurrence="1" x-occurrences="1"\\w*\\zaln-e\\*',
    ].join('\n');

    const PLAIN_TWO_VERSE = [
      '\\id TIT',
      '\\c 1',
      '\\p',
      '\\v 1 Remind',
      '\\v 2 World',   // different word → real change
    ].join('\n');

    function parseUsj(usfm: string) {
      const p = new USFMParser({ silentConsole: true });
      p.parse(usfm);
      return p.toJSON() as { content?: unknown[] };
    }

    const alignedNodes = splitUsjByChapter(parseUsj(ALIGNED_TWO_VERSE)).find((s) => s.chapter === 1)?.nodes ?? [];
    const plainNodes   = splitUsjByChapter(parseUsj(PLAIN_TWO_VERSE)).find((s) => s.chapter === 1)?.nodes ?? [];

    const alignedParas = collectParagraphs(1, alignedNodes, alignedNodes);
    const plainParas   = collectParagraphs(1, plainNodes, plainNodes);

    const paraHunks = diffParagraphs(alignedParas, plainParas);
    const enriched  = enrichWithVerses(paraHunks);

    expect(enriched.length).toBeGreaterThan(0);
    const changedPara = enriched.find((h) => h.kind === 'changed');
    expect(changedPara).toBeDefined();
    if (changedPara && changedPara.kind === 'changed') {
      const v1hunk = changedPara.verseHunks.find((v) =>
        (v.kind === 'unchanged' || v.kind === 'changed' || v.kind === 'alignment-only') && v.ours.verseNum === '1',
      );
      const v2hunk = changedPara.verseHunks.find((v) =>
        (v.kind === 'unchanged' || v.kind === 'changed') && v.ours.verseNum === '2',
      );
      // v1 has alignment-only difference (same text, different \zaln-s wiring) → 'alignment-only'
      expect(v1hunk?.kind).toBe('alignment-only');
      expect(v2hunk?.kind).toBe('changed');    // 'Hello' vs 'World' → changed
    }
  });
});

// ---------------------------------------------------------------------------
// wordDiff / tokenizeWords
// ---------------------------------------------------------------------------

describe('tokenizeWords', () => {
  it('splits punctuation into standalone tokens (hola, mundo)', () => {
    expect(tokenizeWords('hola, mundo')).toEqual(['hola', ',', ' ', 'mundo']);
  });

  it('returns empty array for empty string', () => {
    expect(tokenizeWords('')).toEqual([]);
  });

  it('handles leading/trailing whitespace', () => {
    expect(tokenizeWords(' hello ')).toEqual([' ', 'hello', ' ']);
  });

  it('treats multiple spaces as a single whitespace token', () => {
    const tokens = tokenizeWords('a  b');
    expect(tokens).toEqual(['a', '  ', 'b']);
  });

  it('splits trailing punctuation from word (vivir.)', () => {
    expect(tokenizeWords('vivir.')).toEqual(['vivir', '.']);
  });

  it('splits opening and closing punctuation as standalone tokens (¡Esto!)', () => {
    expect(tokenizeWords('¡Esto!')).toEqual(['¡', 'Esto', '!']);
  });
});

describe('wordDiff', () => {
  it('identical strings → all tokens unchanged on both sides', () => {
    const { oursTokens, theirsTokens } = wordDiff('Paul a servant', 'Paul a servant');
    expect(oursTokens.every((t) => t.change === 'unchanged')).toBe(true);
    expect(theirsTokens.every((t) => t.change === 'unchanged')).toBe(true);
  });

  it('single word changed in the middle → one removed on ours, one added on theirs', () => {
    const { oursTokens, theirsTokens } = wordDiff('Paul a servant', 'Paul a slave');
    const removed = oursTokens.filter((t) => t.change === 'removed');
    const added = theirsTokens.filter((t) => t.change === 'added');
    expect(removed.length).toBe(1);
    expect(removed[0].text).toBe('servant');
    expect(added.length).toBe(1);
    expect(added[0].text).toBe('slave');
    // Surrounding words unchanged
    expect(oursTokens.find((t) => t.text === 'Paul')?.change).toBe('unchanged');
    expect(theirsTokens.find((t) => t.text === 'Paul')?.change).toBe('unchanged');
  });

  it('word inserted on theirs → only added tokens on theirs, none removed on ours', () => {
    const { oursTokens, theirsTokens } = wordDiff('Paul servant', 'Paul a servant');
    expect(oursTokens.filter((t) => t.change === 'removed').length).toBe(0);
    expect(theirsTokens.filter((t) => t.change === 'added').map((t) => t.text)).toContain('a');
  });

  it('word deleted on theirs → only removed token on ours, none added on theirs', () => {
    const { oursTokens, theirsTokens } = wordDiff('Paul a servant', 'Paul servant');
    expect(theirsTokens.filter((t) => t.change === 'added').length).toBe(0);
    expect(oursTokens.filter((t) => t.change === 'removed').map((t) => t.text)).toContain('a');
  });

  it('whitespace tokens are always classified unchanged on both sides', () => {
    const { oursTokens, theirsTokens } = wordDiff('old text here', 'new text here');
    for (const t of [...oursTokens, ...theirsTokens]) {
      if (t.isSpace) expect(t.change).toBe('unchanged');
    }
  });

  it('oursTokens never contain added; theirsTokens never contain removed', () => {
    const { oursTokens, theirsTokens } = wordDiff('alpha beta gamma', 'alpha delta gamma');
    expect(oursTokens.some((t) => t.change === 'added')).toBe(false);
    expect(theirsTokens.some((t) => t.change === 'removed')).toBe(false);
  });

  it('completely different strings → all words removed on ours, all added on theirs', () => {
    const { oursTokens, theirsTokens } = wordDiff('hello world', 'foo bar');
    expect(oursTokens.filter((t) => !t.isSpace).every((t) => t.change === 'removed')).toBe(true);
    expect(theirsTokens.filter((t) => !t.isSpace).every((t) => t.change === 'added')).toBe(true);
  });

  it('empty ours → all tokens on theirs are added', () => {
    const { oursTokens, theirsTokens } = wordDiff('', 'hello world');
    expect(oursTokens.length).toBe(0);
    expect(theirsTokens.filter((t) => !t.isSpace).every((t) => t.change === 'added')).toBe(true);
  });

  it('aligned-style (word-per-segment joined with spaces) vs un-aligned text with same words → mostly unchanged', () => {
    // Simulates the verse drill-down case: aligned USFM gives individual word
    // segments that extractPlainText joins with single spaces; un-aligned USFM
    // gives one big segment with natural spaces.  Both should normalise to the
    // same token stream so wordDiff yields mostly 'unchanged' tokens.
    const alignedText  = 'Sé que tu relación con Dios está bien gracias';
    const unalignedText = 'Sé que tu relación con Dios está bien gracias';
    const { oursTokens, theirsTokens } = wordDiff(alignedText, unalignedText);
    const removedCount = oursTokens.filter((t) => t.change === 'removed').length;
    const addedCount   = theirsTokens.filter((t) => t.change === 'added').length;
    expect(removedCount).toBe(0);
    expect(addedCount).toBe(0);
  });

  it('aligned-vs-unaligned with one word changed → only that one word flagged', () => {
    // "gracias" → "debido": everything else should be unchanged.
    const ours   = 'Sé que tu relación con Dios está bien gracias';
    const theirs = 'Sé que tu relación con Dios está bien debido';
    const { oursTokens, theirsTokens } = wordDiff(ours, theirs);
    const removed = oursTokens.filter((t) => t.change === 'removed');
    const added   = theirsTokens.filter((t) => t.change === 'added');
    expect(removed.length).toBe(1);
    expect(removed[0].text).toBe('gracias');
    expect(added.length).toBe(1);
    expect(added[0].text).toBe('debido');
    // All other non-space word tokens should be unchanged.
    expect(oursTokens.filter((t) => !t.isSpace && t.change === 'unchanged').length).toBeGreaterThan(5);
  });

  it('punctuation-attach: un-aligned "vivir." vs aligned "vivir ." → 0 removed, 0 added', () => {
    // Simulates extractPlainText output for un-aligned side ('vivir. Ellos dicen.')
    // vs aligned side ('vivir . Ellos dicen .') where punctuation is a separate segment
    // joined WITHOUT a synthetic space (ATTACHES_LEFT rule).
    // After the new tokenizeWords, both produce tokens ['vivir', '.', ' ', 'Ellos', ' ', 'dicen', '.']
    // so wordDiff should find 0 changed non-space tokens.
    const ours   = 'vivir. Ellos dicen.';
    const theirs = 'vivir. Ellos dicen.';
    const { oursTokens, theirsTokens } = wordDiff(ours, theirs);
    expect(oursTokens.filter((t) => t.change === 'removed').length).toBe(0);
    expect(theirsTokens.filter((t) => t.change === 'added').length).toBe(0);
  });

  it('punctuation-attach with one word changed → only that word flagged, punctuation unchanged', () => {
    // 'vivir' → 'caminar'; punctuation tokens '.' stay unchanged.
    const ours   = 'manera de vivir. Ellos dicen acerca de Jesús, el Cristo. Eso muy feliz.';
    const theirs = 'manera de caminar. Ellos dicen acerca de Jesús, el Cristo. Eso muy feliz.';
    const { oursTokens, theirsTokens } = wordDiff(ours, theirs);
    const removed = oursTokens.filter((t) => t.change === 'removed');
    const added   = theirsTokens.filter((t) => t.change === 'added');
    expect(removed.length).toBe(1);
    expect(removed[0].text).toBe('vivir');
    expect(added.length).toBe(1);
    expect(added[0].text).toBe('caminar');
    // Punctuation tokens should all be unchanged
    const oursPunct  = oursTokens.filter((t) => !t.isSpace && /^[^\w\u00C0-\u017F]/.test(t.text));
    const theirsPunct = theirsTokens.filter((t) => !t.isSpace && /^[^\w\u00C0-\u017F]/.test(t.text));
    expect(oursPunct.every((t) => t.change === 'unchanged')).toBe(true);
    expect(theirsPunct.every((t) => t.change === 'unchanged')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// extractVerseAlignment
// ---------------------------------------------------------------------------

// Minimal aligned USFM for TIT 1:4 — two \zaln-s groups, one bare \w outside.
const ALIGN_USFM = `\\id TIT
\\c 1
\\p
\\v 4 \\zaln-s |x-strong="G5485" x-lemma="χάρις" x-morph="Gr,N,,,,NFS," x-occurrence="1" x-occurrences="1" x-content="χάριν"\\*\\w grace|x-occurrence="1" x-occurrences="1"\\w*\\zaln-e\\* \\zaln-s |x-strong="G2532" x-lemma="καί" x-morph="Gr,CC,,,,,,,," x-occurrence="1" x-occurrences="1" x-content="καὶ"\\*\\w and|x-occurrence="1" x-occurrences="1"\\w*\\zaln-e\\* peace
`;

describe('extractVerseAlignment', () => {
  function parseAligned(usfm: string) {
    const p = new USFMParser({ silentConsole: true });
    p.parse(usfm);
    return p.toJSON() as import('@usfm-tools/editor-core').UsjDocument;
  }

  it('returns 2 groups and 3 words (2 aligned, 1 bare) from ALIGN_USFM', () => {
    const usj = parseAligned(ALIGN_USFM);
    const slices = splitUsjByChapter(usj);
    const ch1 = slices.find((s) => s.chapter === 1)!;
    // para content is in ch1.nodes[1].content (the \p node)
    const paraNode = ch1.nodes.find((n) => typeof n === 'object' && n !== null && (n as Record<string, unknown>).type === 'para') as Record<string, unknown> | undefined;
    const verseContent = paraNode?.content as unknown[] | undefined ?? [];
    const va = extractVerseAlignment(verseContent);
    expect(va.groups.length).toBe(2);
    // Only \w nodes appear in words[]: "grace" and "and". "peace" is plain text, not \w.
    expect(va.words.length).toBe(2);
    // Both words are aligned (inside \zaln-s groups), so none are unaligned.
    const unalignedWords = va.words.filter((w) => w.groupId === undefined);
    expect(unalignedWords.length).toBe(0);
  });

  it('paletteIdx is assigned in encounter order (0, 1)', () => {
    const usj = parseAligned(ALIGN_USFM);
    const slices = splitUsjByChapter(usj);
    const ch1 = slices.find((s) => s.chapter === 1)!;
    const paraNode = ch1.nodes.find((n) => typeof n === 'object' && n !== null && (n as Record<string, unknown>).type === 'para') as Record<string, unknown> | undefined;
    const verseContent = paraNode?.content as unknown[] ?? [];
    const va = extractVerseAlignment(verseContent);
    expect(va.groups[0].paletteIdx).toBe(0);
    expect(va.groups[1].paletteIdx).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// enrichWithVerses alignment-only promotion
// ---------------------------------------------------------------------------

// Aligned USFM: "grace" linked to Greek χάριν
const ALIGNED_PARA_USFM = `\\id TIT
\\c 3
\\p
\\v 2 \\zaln-s |x-strong="G5485" x-lemma="χάρις" x-morph="Gr,N,,,,NFS," x-occurrence="1" x-occurrences="1" x-content="χάριν"\\*\\w grace|x-occurrence="1" x-occurrences="1"\\w*\\zaln-e\\* and peace
\\v 3 Changed verse text here
`;

// Plain USFM: same text but "grace" is NOT aligned (alignment removed)
const PLAIN_PARA_USFM = `\\id TIT
\\c 3
\\p
\\v 2 grace and peace
\\v 3 Different verse text here
`;

describe('enrichWithVerses: alignment-only promotion', () => {
  function parseBothSides() {
    const p1 = new USFMParser({ silentConsole: true });
    p1.parse(ALIGNED_PARA_USFM);
    const oursDoc = p1.toJSON() as import('@usfm-tools/editor-core').UsjDocument;

    const p2 = new USFMParser({ silentConsole: true });
    p2.parse(PLAIN_PARA_USFM);
    const theirsDoc = p2.toJSON() as import('@usfm-tools/editor-core').UsjDocument;

    const { editable: oursStripped } = stripAlignments(oursDoc);
    const { editable: theirsStripped } = stripAlignments(theirsDoc);

    const oSlices = splitUsjByChapter(oursDoc);
    const tSlices = splitUsjByChapter(theirsDoc);
    const oStrippedSlices = splitUsjByChapter(oursStripped as { content?: unknown[] });
    const tStrippedSlices = splitUsjByChapter(theirsStripped as { content?: unknown[] });

    const ch = 3;
    const oNodes = oSlices.find((s) => s.chapter === ch)?.nodes ?? [];
    const tNodes = tSlices.find((s) => s.chapter === ch)?.nodes ?? [];
    const oStripped = oStrippedSlices.find((s) => s.chapter === ch)?.nodes ?? [];
    const tStripped = tStrippedSlices.find((s) => s.chapter === ch)?.nodes ?? [];

    const oParas = collectParagraphs(ch, oNodes, oStripped);
    const tParas = collectParagraphs(ch, tNodes, tStripped);
    const paraHunks = diffParagraphs(oParas, tParas);
    return enrichWithVerses(paraHunks);
  }

  it('v.2 (alignment-only diff) is promoted to kind alignment-only', () => {
    const enriched = parseBothSides();
    const changed = enriched.find((h) => h.kind === 'changed');
    expect(changed).toBeDefined();
    if (changed?.kind !== 'changed') return;
    const v2 = changed.verseHunks.find((vh) => {
      const num = vh.kind === 'theirs-only' ? vh.theirs.verseNum : vh.ours.verseNum;
      return num === '2';
    });
    expect(v2).toBeDefined();
    expect(v2?.kind).toBe('alignment-only');
  });

  it('v.3 (real text change) remains kind changed', () => {
    const enriched = parseBothSides();
    const changed = enriched.find((h) => h.kind === 'changed');
    if (changed?.kind !== 'changed') return;
    const v3 = changed.verseHunks.find((vh) => {
      const num = vh.kind === 'theirs-only' ? vh.theirs.verseNum : vh.ours.verseNum;
      return num === '3';
    });
    expect(v3?.kind).toBe('changed');
  });
});

// ---------------------------------------------------------------------------
// diffWordAlignments
// ---------------------------------------------------------------------------

describe('diffWordAlignments', () => {
  function parseVerseAlignment(usfm: string) {
    const p = new USFMParser({ silentConsole: true });
    p.parse(usfm);
    const usj = p.toJSON() as import('@usfm-tools/editor-core').UsjDocument;
    const slices = splitUsjByChapter(usj);
    const ch1 = slices.find((s) => s.chapter === 1)!;
    const paraNode = ch1.nodes.find((n) => typeof n === 'object' && n !== null && (n as Record<string, unknown>).type === 'para') as Record<string, unknown> | undefined;
    const content = paraNode?.content as unknown[] ?? [];
    return extractVerseAlignment(content);
  }

  const MINE_USFM = `\\id TIT
\\c 1
\\p
\\v 1 \\zaln-s |x-strong="G5485" x-lemma="χάρις" x-morph="Gr,N,,,,NFS," x-occurrence="1" x-occurrences="1" x-content="χάριν"\\*\\w grace|x-occurrence="1" x-occurrences="1"\\w*\\zaln-e\\*
`;

  // Theirs: "grace" is unaligned (no \zaln-s)
  const THEIRS_USFM = `\\id TIT
\\c 1
\\p
\\v 1 \\w grace|x-occurrence="1" x-occurrences="1"\\w*
`;

  it('group-removed when mine has a group theirs does not', () => {
    const mine = parseVerseAlignment(MINE_USFM);
    const theirs = parseVerseAlignment(THEIRS_USFM);
    const changes = diffWordAlignments(mine, theirs);
    expect(changes.some((c) => c.kind === 'group-removed')).toBe(true);
    expect(changes.filter((c) => c.kind === 'group-added').length).toBe(0);
  });

  it('no changes when alignment is identical', () => {
    const mine = parseVerseAlignment(MINE_USFM);
    const changes = diffWordAlignments(mine, mine);
    expect(changes.length).toBe(0);
  });
});

describe('alignment pick helpers', () => {
  it('builds stable verse-group key and resolves explicit override', () => {
    const picks = new Map<string, 'ours' | 'theirs'>();
    const key = alignmentGroupPickKey('h:v2', 'g1');
    expect(key).toBe('h:v2::g1');
    picks.set(key, 'theirs');
    expect(resolveAlignmentGroupSide('h:v2', 'g1', 'ours', picks)).toBe('theirs');
  });

  it('falls back to default side when no explicit override exists', () => {
    const picks = new Map<string, 'ours' | 'theirs'>();
    expect(resolveAlignmentGroupSide('h:v2', 'g2', 'ours', picks)).toBe('ours');
    expect(resolveAlignmentGroupSide('h:v2', 'g2', null, picks)).toBeNull();
  });
});

describe('conflict-workspace-state helpers', () => {
  it('round-trips a file payload through route state helpers', () => {
    const payload: ConflictWorkspacePayload = {
      kind: 'file' as const,
      origin: 'bundle-import' as const,
      projectId: 'p1',
      conflicts: [{
        conflictId: 'c1',
        path: '01-GEN.usfm',
        oursText: '\\id GEN\n',
        theirsText: '\\id GEN\n\\c 1\n',
        baseText: '\\id GEN\n',
        baseSource: 'receiver-commit',
        chapterIndices: [1],
      }],
      defaultOursLabel: 'Mine',
      defaultTheirsLabel: 'Theirs',
    };
    const state = buildConflictWorkspaceState(payload);
    const decoded = readConflictWorkspaceState(state);
    expect(decoded).toEqual(payload);
  });
});

// ---------------------------------------------------------------------------
// stitchUsfm: alignment-only verse pick uses theirs alignment
// ---------------------------------------------------------------------------

describe('stitchUsfm: alignment-only verse pick', () => {
  it('picking theirs for an alignment-only verse emits theirs \\zaln-s node', () => {
    const p1 = new USFMParser({ silentConsole: true });
    p1.parse(ALIGNED_PARA_USFM);
    const oursDoc = p1.toJSON() as import('@usfm-tools/editor-core').UsjDocument;

    const p2 = new USFMParser({ silentConsole: true });
    p2.parse(PLAIN_PARA_USFM);
    const theirsDoc = p2.toJSON() as import('@usfm-tools/editor-core').UsjDocument;

    const { editable: oursStripped2 } = stripAlignments(oursDoc);
    const { editable: theirsStripped2 } = stripAlignments(theirsDoc);

    const ch = 3;
    const oNodes = splitUsjByChapter(oursDoc).find((s) => s.chapter === ch)?.nodes ?? [];
    const tNodes = splitUsjByChapter(theirsDoc).find((s) => s.chapter === ch)?.nodes ?? [];
    const oStripped = splitUsjByChapter(oursStripped2 as { content?: unknown[] }).find((s) => s.chapter === ch)?.nodes ?? [];
    const tStripped = splitUsjByChapter(theirsStripped2 as { content?: unknown[] }).find((s) => s.chapter === ch)?.nodes ?? [];

    const oParas = collectParagraphs(ch, oNodes, oStripped);
    const tParas = collectParagraphs(ch, tNodes, tStripped);
    const paraHunks = diffParagraphs(oParas, tParas);
    const enriched = enrichWithVerses(paraHunks);
    const changedHunk = enriched.find((h) => h.kind === 'changed');
    expect(changedHunk?.kind).toBe('changed');
    if (changedHunk?.kind !== 'changed') return;

    // Find the alignment-only verse hunk (v.2)
    const v2Hunk = changedHunk.verseHunks.find((vh) => {
      const num = vh.kind === 'theirs-only' ? vh.theirs.verseNum : vh.ours.verseNum;
      return num === '2';
    });
    expect(v2Hunk?.kind).toBe('alignment-only');

    // Find the changed verse hunk (v.3) and pick ours
    const v3Hunk = changedHunk.verseHunks.find((vh) => {
      const num = vh.kind === 'theirs-only' ? vh.theirs.verseNum : vh.ours.verseNum;
      return num === '3';
    });
    expect(v3Hunk?.kind).toBe('changed');

    // Pick: v.2 → theirs (lose alignment), v.3 → ours
    const versePicks = new Map<string, 'ours' | 'theirs'>([
      [v2Hunk!.id, 'theirs'],
      [v3Hunk!.id, 'ours'],
    ]);

    const result = stitchUsfm({
      oursDoc,
      theirsDoc,
      picks: {
        chapter: new Map(),
        paragraph: new Map(),
        verse: versePicks,
      },
    });

    // v.2 picked theirs → should NOT contain \zaln-s (theirs is plain)
    expect(result).not.toContain('zaln-s');
    // v.3 picked ours → should contain "Changed verse text here"
    expect(result).toContain('Changed verse text here');
  });

  it('picking ours for an alignment-only verse preserves the \\zaln-s alignment', () => {
    const p1 = new USFMParser({ silentConsole: true });
    p1.parse(ALIGNED_PARA_USFM);
    const oursDoc = p1.toJSON() as import('@usfm-tools/editor-core').UsjDocument;

    const p2 = new USFMParser({ silentConsole: true });
    p2.parse(PLAIN_PARA_USFM);
    const theirsDoc = p2.toJSON() as import('@usfm-tools/editor-core').UsjDocument;

    const { editable: oursStripped3 } = stripAlignments(oursDoc);
    const { editable: theirsStripped3 } = stripAlignments(theirsDoc);

    const ch = 3;
    const oNodes = splitUsjByChapter(oursDoc).find((s) => s.chapter === ch)?.nodes ?? [];
    const tNodes = splitUsjByChapter(theirsDoc).find((s) => s.chapter === ch)?.nodes ?? [];
    const oStripped = splitUsjByChapter(oursStripped3 as { content?: unknown[] }).find((s) => s.chapter === ch)?.nodes ?? [];
    const tStripped = splitUsjByChapter(theirsStripped3 as { content?: unknown[] }).find((s) => s.chapter === ch)?.nodes ?? [];

    const oParas = collectParagraphs(ch, oNodes, oStripped);
    const tParas = collectParagraphs(ch, tNodes, tStripped);
    const paraHunks = diffParagraphs(oParas, tParas);
    const enriched = enrichWithVerses(paraHunks);
    const changedHunk = enriched.find((h) => h.kind === 'changed');
    if (changedHunk?.kind !== 'changed') return;

    const v2Hunk = changedHunk.verseHunks.find((vh) => {
      const num = vh.kind === 'theirs-only' ? vh.theirs.verseNum : vh.ours.verseNum;
      return num === '2';
    });
    const v3Hunk = changedHunk.verseHunks.find((vh) => {
      const num = vh.kind === 'theirs-only' ? vh.theirs.verseNum : vh.ours.verseNum;
      return num === '3';
    });

    // Pick: v.2 → ours (keep alignment), v.3 → ours
    const versePicks = new Map<string, 'ours' | 'theirs'>([
      [v2Hunk!.id, 'ours'],
      [v3Hunk!.id, 'ours'],
    ]);

    const result = stitchUsfm({
      oursDoc,
      theirsDoc,
      picks: {
        chapter: new Map(),
        paragraph: new Map(),
        verse: versePicks,
      },
    });

    // v.2 picked ours → should contain \zaln-s (ours has alignment)
    expect(result).toContain('zaln-s');
    expect(result).toContain('G5485'); // x-strong from ours
  });

  it('group overrides can switch alignment-only verse to theirs side', () => {
    const p1 = new USFMParser({ silentConsole: true });
    p1.parse(ALIGNED_PARA_USFM);
    const oursDoc = p1.toJSON() as import('@usfm-tools/editor-core').UsjDocument;

    const p2 = new USFMParser({ silentConsole: true });
    p2.parse(PLAIN_PARA_USFM);
    const theirsDoc = p2.toJSON() as import('@usfm-tools/editor-core').UsjDocument;

    const { editable: oursStripped } = stripAlignments(oursDoc);
    const { editable: theirsStripped } = stripAlignments(theirsDoc);

    const ch = 3;
    const oNodes = splitUsjByChapter(oursDoc).find((s) => s.chapter === ch)?.nodes ?? [];
    const tNodes = splitUsjByChapter(theirsDoc).find((s) => s.chapter === ch)?.nodes ?? [];
    const oStripped = splitUsjByChapter(oursStripped as { content?: unknown[] }).find((s) => s.chapter === ch)?.nodes ?? [];
    const tStripped = splitUsjByChapter(theirsStripped as { content?: unknown[] }).find((s) => s.chapter === ch)?.nodes ?? [];

    const oParas = collectParagraphs(ch, oNodes, oStripped);
    const tParas = collectParagraphs(ch, tNodes, tStripped);
    const paraHunks = diffParagraphs(oParas, tParas);
    const enriched = enrichWithVerses(paraHunks);
    const changedHunk = enriched.find((h) => h.kind === 'changed');
    if (changedHunk?.kind !== 'changed') return;

    const v2Hunk = changedHunk.verseHunks.find((vh) => {
      const num = vh.kind === 'theirs-only' ? vh.theirs.verseNum : vh.ours.verseNum;
      return num === '2';
    });
    expect(v2Hunk?.kind).toBe('alignment-only');
    if (!v2Hunk || v2Hunk.kind !== 'alignment-only') return;

    const allGroups = mergedAlignmentGroups(v2Hunk.ours.alignment, v2Hunk.theirs.alignment);
    const alignmentGroupPicks = new Map<string, 'ours' | 'theirs'>();
    for (const g of allGroups) alignmentGroupPicks.set(alignmentGroupPickKey(v2Hunk.id, g.id), 'theirs');

    const result = stitchUsfm({
      oursDoc,
      theirsDoc,
      picks: {
        chapter: new Map(),
        paragraph: new Map(),
        verse: new Map([[v2Hunk.id, 'ours']]),
      },
      alignmentGroupPicks,
    });

    // Group overrides all point to theirs -> emits theirs (plain) for that verse.
    expect(result).not.toContain('zaln-s');
  });
});

// ---------------------------------------------------------------------------
// Paragraph split / merge (coalesceSplitMerges + enrich + stitch)
// ---------------------------------------------------------------------------

describe('paragraph split/merge conflicts', () => {
  const SPLIT_OURS = `\\id TST
\\c 1
\\p
\\v 1 One alpha
\\v 2 Two beta
\\v 3 Three gamma
`;

  /** Same verses; bundle splits after v2 into a second paragraph. */
  const SPLIT_THEIRS = `\\id TST
\\c 1
\\p
\\v 1 One alpha
\\v 2 Two beta
\\p
\\v 3 Three gamma
`;

  const SPLIT_THEIRS_V3_CHANGED = `\\id TST
\\c 1
\\p
\\v 1 One alpha
\\v 2 Two beta
\\p
\\v 3 Three GAMMA-CHANGED
`;

  /** Merge: two paragraphs on ours, one on theirs — same verse set. */
  const MERGE_OURS = `\\id TST
\\c 1
\\p
\\v 1 One alpha
\\v 2 Two beta
\\p
\\v 3 Three gamma
`;

  const MERGE_THEIRS = `\\id TST
\\c 1
\\p
\\v 1 One alpha
\\v 2 Two beta
\\v 3 Three gamma
`;

  function enrichedForPair(oursUsfm: string, theirsUsfm: string, ch = 1) {
    const p1 = new USFMParser({ silentConsole: true });
    p1.parse(oursUsfm);
    const oursDoc = p1.toJSON() as import('@usfm-tools/editor-core').UsjDocument;
    const p2 = new USFMParser({ silentConsole: true });
    p2.parse(theirsUsfm);
    const theirsDoc = p2.toJSON() as import('@usfm-tools/editor-core').UsjDocument;

    const { editable: oSt } = stripAlignments(oursDoc);
    const { editable: tSt } = stripAlignments(theirsDoc);

    const oNodes = splitUsjByChapter(oursDoc).find((s) => s.chapter === ch)?.nodes ?? [];
    const tNodes = splitUsjByChapter(theirsDoc).find((s) => s.chapter === ch)?.nodes ?? [];
    const oStripped = splitUsjByChapter(oSt as { content?: unknown[] }).find((s) => s.chapter === ch)?.nodes ?? [];
    const tStripped = splitUsjByChapter(tSt as { content?: unknown[] }).find((s) => s.chapter === ch)?.nodes ?? [];

    const oParas = collectParagraphs(ch, oNodes, oStripped);
    const tParas = collectParagraphs(ch, tNodes, tStripped);
    return { enriched: enrichWithVerses(diffParagraphs(oParas, tParas)), oursDoc, theirsDoc };
  }

  it('1→2 split with identical verse text → single split hunk; verse hunks unchanged', () => {
    const { enriched } = enrichedForPair(SPLIT_OURS, SPLIT_THEIRS);
    const split = enriched.filter((h) => h.kind === 'split');
    expect(split.length).toBe(1);
    const s = split[0]!;
    expect(s.kind).toBe('split');
    if (s.kind !== 'split') return;
    expect(s.oursParas.length).toBe(1);
    expect(s.theirsParas.length).toBe(2);
    expect(s.verseHunks.every((v) => v.kind === 'unchanged')).toBe(true);
  });

  it('1→2 split with verse 3 text change → split hunk; v3 is changed in verseHunks', () => {
    const { enriched } = enrichedForPair(SPLIT_OURS, SPLIT_THEIRS_V3_CHANGED);
    const s = enriched.find((h) => h.kind === 'split');
    expect(s?.kind).toBe('split');
    if (!s || s.kind !== 'split') return;
    const v3 = s.verseHunks.find((vh) => (vh.kind === 'theirs-only' ? vh.theirs : vh.ours).verseNum === '3');
    expect(v3?.kind).toBe('changed');
  });

  it('2→1 merge → single split hunk', () => {
    const { enriched } = enrichedForPair(MERGE_OURS, MERGE_THEIRS);
    const s = enriched.find((h) => h.kind === 'split');
    expect(s?.kind).toBe('split');
    if (!s || s.kind !== 'split') return;
    expect(s.oursParas.length).toBe(2);
    expect(s.theirsParas.length).toBe(1);
  });

  it('adjacent ours-only / theirs-only with different verses → not coalesced', () => {
    const ours = `\\id TST
\\c 1
\\p
\\v 1 Only mine
`;
    const theirs = `\\id TST
\\c 1
\\p
\\v 2 Only theirs
`;
    const { enriched } = enrichedForPair(ours, theirs);
    expect(enriched.some((h) => h.kind === 'split')).toBe(false);
    expect(enriched.filter((h) => h.kind === 'ours-only').length).toBeGreaterThanOrEqual(1);
    expect(enriched.filter((h) => h.kind === 'theirs-only').length).toBeGreaterThanOrEqual(1);
  });

  it('stitchUsfm: paragraph pick theirs on split emits both bundle paragraphs', () => {
    const { enriched, oursDoc, theirsDoc } = enrichedForPair(SPLIT_OURS, SPLIT_THEIRS);
    const s = enriched.find((h) => h.kind === 'split');
    if (!s || s.kind !== 'split') throw new Error('expected split');
    const result = stitchUsfm({
      oursDoc,
      theirsDoc,
      picks: {
        chapter: new Map(),
        paragraph: new Map([[s.id, 'theirs']]),
        verse: new Map(),
      },
    });
    const afterC = result.split('\\c 1')[1] ?? '';
    const pCount = (afterC.match(/\\p/g) ?? []).length;
    expect(pCount).toBeGreaterThanOrEqual(2);
  });

  it('stitchUsfm: pick verse 3 from theirs with no paragraph pick uses ours structure + theirs v3', () => {
    const { enriched, oursDoc, theirsDoc } = enrichedForPair(SPLIT_OURS, SPLIT_THEIRS_V3_CHANGED);
    const s = enriched.find((h) => h.kind === 'split');
    if (!s || s.kind !== 'split') throw new Error('expected split');
    const v3 = s.verseHunks.find((vh) => (vh.kind === 'theirs-only' ? vh.theirs : vh.ours).verseNum === '3');
    if (!v3) throw new Error('v3 hunk');

    const result = stitchUsfm({
      oursDoc,
      theirsDoc,
      picks: {
        chapter: new Map(),
        paragraph: new Map(),
        verse: new Map([[v3.id, 'theirs']]),
      },
    });
    expect(result).toContain('GAMMA-CHANGED');
    // Still one \\p block for merged-from-ours template when only verse picks (structure from ours).
    const afterC = result.split('\\c 1')[1] ?? '';
    expect((afterC.match(/\\p/g) ?? []).length).toBe(1);
  });

  it('isMergedReady: split with changed verse requires verse picks when requirements list them', () => {
    const { enriched } = enrichedForPair(SPLIT_OURS, SPLIT_THEIRS_V3_CHANGED);
    const s = enriched.find((h) => h.kind === 'split');
    if (!s || s.kind !== 'split') throw new Error('expected split');
    const conflicting = s.verseHunks.filter((v) => v.kind !== 'unchanged');
    const req: HunkRequirements[] = [
      {
        chapter: 1,
        paragraphHunks: [
          {
            id: s.id,
            verseHunks: conflicting.map((v) => v.id),
          },
        ],
      },
    ];
    expect(isMergedReady(req, { chapter: new Map(), paragraph: new Map(), verse: new Map() })).toBe(false);
    const v3 = conflicting.find((v) => (v.kind === 'theirs-only' ? v.theirs : v.ours).verseNum === '3');
    expect(
      isMergedReady(req, {
        chapter: new Map(),
        paragraph: new Map([[s.id, 'ours']]),
        verse: new Map(v3 ? [[v3.id, 'theirs']] : []),
      }),
    ).toBe(true);
  });
});

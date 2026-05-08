/**
 * Tests for:
 *   - collectParagraphs / diffParagraphs (B1)
 *   - collectVerses / diffVerses (B1b)
 *   - stitchUsfm with chapter / paragraph / verse picks (B2)
 *   - isMergedReady gating logic (mirrors dialog Apply state)
 *   - single-verse paragraph edge case (no verse drill-down)
 *   - split-verse groups (continuation paragraph grouping)
 */

import { USFMParser } from '@usfm-tools/parser';
import { splitUsjByChapter } from '@usfm-tools/editor-core';
import type { UsjDocument } from '@usfm-tools/editor-core';
import {
  collectParagraphs,
  diffParagraphs,
  collectVerses,
  diffVerses,
  paraContentNodes,
} from '../../usfm-editor-app/src/components/conflict-renderers/usfm-diff-logic';
import {
  stitchUsfm,
  isMergedReady,
  type Picks,
  type HunkRequirements,
} from '../../usfm-editor-app/src/components/conflict-renderers/usfm-stitch';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseUsj(usfm: string): UsjDocument {
  const p = new USFMParser({ silentConsole: true });
  p.parse(usfm);
  return p.toJSON() as UsjDocument;
}

function chapterNodes(usfm: string, chapter: number): unknown[] {
  const usj = parseUsj(usfm);
  const slices = splitUsjByChapter(usj);
  return slices.find((s) => s.chapter === chapter)?.nodes ?? [];
}

function emptyPicks(): Picks {
  return { chapter: new Map(), paragraph: new Map(), verse: new Map() };
}

// ---------------------------------------------------------------------------
// Sample USFM fixtures
// ---------------------------------------------------------------------------

const OURS = `\\id TIT
\\c 1
\\p
\\v 1 Paul, a servant of God.
\\v 2 In hope of eternal life.
\\p
\\v 3 According to the commandment of God.
\\v 4 To Titus, my true child.
`;

const THEIRS_SAME = OURS;

const THEIRS_V1_EDIT = `\\id TIT
\\c 1
\\p
\\v 1 Paul, a slave of God.
\\v 2 In hope of eternal life.
\\p
\\v 3 According to the commandment of God.
\\v 4 To Titus, my true child.
`;

const THEIRS_EXTRA_PARA = `\\id TIT
\\c 1
\\p
\\v 1 Paul, a servant of God.
\\v 2 In hope of eternal life.
\\p
\\v 3 According to the commandment of God.
\\v 4 To Titus, my true child.
\\p
\\v 5 Grace and peace from God.
`;

// ---------------------------------------------------------------------------
// collectParagraphs
// ---------------------------------------------------------------------------

describe('collectParagraphs', () => {
  it('returns one ParaUnit per \\p block', () => {
    const nodes = chapterNodes(OURS, 1);
    const paras = collectParagraphs(1, nodes, nodes);
    // OURS ch1 has 2 \p blocks
    expect(paras.length).toBe(2);
  });

  it('each ParaUnit has a stable paraId with chapterNum prefix', () => {
    const nodes = chapterNodes(OURS, 1);
    const paras = collectParagraphs(1, nodes, nodes);
    expect(paras[0].paraId).toMatch(/^1:p0$/);
    expect(paras[1].paraId).toMatch(/^1:p1$/);
  });

  it('each ParaUnit tracks verseRefs', () => {
    const nodes = chapterNodes(OURS, 1);
    const paras = collectParagraphs(1, nodes, nodes);
    expect(paras[0].verseRefs).toContain('1');
    expect(paras[0].verseRefs).toContain('2');
    expect(paras[1].verseRefs).toContain('3');
    expect(paras[1].verseRefs).toContain('4');
  });

  it('preserves marker', () => {
    const nodes = chapterNodes(OURS, 1);
    const paras = collectParagraphs(1, nodes, nodes);
    expect(paras[0].marker).toBe('p');
  });

  it('fingerprint changes when verse text changes', () => {
    const oNodes = chapterNodes(OURS, 1);
    const tNodes = chapterNodes(THEIRS_V1_EDIT, 1);
    const oParas = collectParagraphs(1, oNodes, oNodes);
    const tParas = collectParagraphs(1, tNodes, tNodes);
    // First paragraph: same marker+verseRefs but different text → different text hash
    const oFP = oParas[0].fingerprint;
    const tFP = tParas[0].fingerprint;
    const oStruct = oFP.slice(0, oFP.lastIndexOf('|'));
    const tStruct = tFP.slice(0, tFP.lastIndexOf('|'));
    expect(oStruct).toBe(tStruct); // same struct key
    expect(oFP).not.toBe(tFP);    // different text hash
  });
});

// ---------------------------------------------------------------------------
// diffParagraphs
// ---------------------------------------------------------------------------

describe('diffParagraphs', () => {
  it('two identical texts → all unchanged', () => {
    const nodes = chapterNodes(OURS, 1);
    const paras = collectParagraphs(1, nodes, nodes);
    const hunks = diffParagraphs(paras, paras);
    expect(hunks.every((h) => h.kind === 'unchanged')).toBe(true);
  });

  it('detects a changed paragraph (verse text differs)', () => {
    const oNodes = chapterNodes(OURS, 1);
    const tNodes = chapterNodes(THEIRS_V1_EDIT, 1);
    const oParas = collectParagraphs(1, oNodes, oNodes);
    const tParas = collectParagraphs(1, tNodes, tNodes);
    const hunks = diffParagraphs(oParas, tParas);
    expect(hunks.some((h) => h.kind === 'changed')).toBe(true);
    expect(hunks.filter((h) => h.kind === 'unchanged').length).toBe(1);
  });

  it('detects theirs-only paragraph (theirs added one)', () => {
    const oNodes = chapterNodes(OURS, 1);
    const tNodes = chapterNodes(THEIRS_EXTRA_PARA, 1);
    const oParas = collectParagraphs(1, oNodes, oNodes);
    const tParas = collectParagraphs(1, tNodes, tNodes);
    const hunks = diffParagraphs(oParas, tParas);
    expect(hunks.some((h) => h.kind === 'theirs-only')).toBe(true);
  });

  it('detects ours-only paragraph (ours added one)', () => {
    const oNodes = chapterNodes(THEIRS_EXTRA_PARA, 1);
    const tNodes = chapterNodes(OURS, 1);
    const oParas = collectParagraphs(1, oNodes, oNodes);
    const tParas = collectParagraphs(1, tNodes, tNodes);
    const hunks = diffParagraphs(oParas, tParas);
    expect(hunks.some((h) => h.kind === 'ours-only')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// collectVerses / diffVerses
// ---------------------------------------------------------------------------

describe('collectVerses', () => {
  it('slices nodes into one VerseUnit per verse', () => {
    const nodes = chapterNodes(OURS, 1);
    const paras = collectParagraphs(1, nodes, nodes);
    // paraContentNodes gives the inner content of the para node
    const content = paraContentNodes(paras[0]);
    const verses = collectVerses(content, content);
    expect(verses.some((v) => v.verseNum === '1')).toBe(true);
    expect(verses.some((v) => v.verseNum === '2')).toBe(true);
  });

  it('textHash changes when verse text changes', () => {
    const oNodes = chapterNodes(OURS, 1);
    const tNodes = chapterNodes(THEIRS_V1_EDIT, 1);
    const oParas = collectParagraphs(1, oNodes, oNodes);
    const tParas = collectParagraphs(1, tNodes, tNodes);
    const oVerses = collectVerses(paraContentNodes(oParas[0]), paraContentNodes(oParas[0]));
    const tVerses = collectVerses(paraContentNodes(tParas[0]), paraContentNodes(tParas[0]));
    const oV1 = oVerses.find((v) => v.verseNum === '1')!;
    const tV1 = tVerses.find((v) => v.verseNum === '1')!;
    expect(oV1.textHash).not.toBe(tV1.textHash);
  });
});

describe('diffVerses', () => {
  it('identical paragraphs → all unchanged verse hunks', () => {
    const nodes = chapterNodes(OURS, 1);
    const paras = collectParagraphs(1, nodes, nodes);
    const content = paraContentNodes(paras[0]);
    const verses = collectVerses(content, content);
    const hunks = diffVerses(verses, verses, 'hunk0');
    expect(hunks.every((h) => h.kind === 'unchanged')).toBe(true);
  });

  it('detects a changed verse', () => {
    const oNodes = chapterNodes(OURS, 1);
    const tNodes = chapterNodes(THEIRS_V1_EDIT, 1);
    const oParas = collectParagraphs(1, oNodes, oNodes);
    const tParas = collectParagraphs(1, tNodes, tNodes);
    const oVerses = collectVerses(paraContentNodes(oParas[0]), paraContentNodes(oParas[0]));
    const tVerses = collectVerses(paraContentNodes(tParas[0]), paraContentNodes(tParas[0]));
    const hunks = diffVerses(oVerses, tVerses, 'hunk0');
    expect(hunks.some((h) => h.kind === 'changed')).toBe(true);
    // v2 is unchanged
    expect(hunks.some((h) => h.kind === 'unchanged')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// stitchUsfm
// ---------------------------------------------------------------------------

describe('stitchUsfm — chapter-level picks', () => {
  it('chapter pick ours → emits ours chapter text', () => {
    const oursDoc = parseUsj(OURS);
    const theirsDoc = parseUsj(THEIRS_V1_EDIT);
    const picks: Picks = { chapter: new Map([[1, 'ours']]), paragraph: new Map(), verse: new Map() };
    const result = stitchUsfm({ oursDoc, theirsDoc, picks });
    // ours has "servant of God"
    expect(result).toContain('servant');
  });

  it('chapter pick theirs → emits theirs chapter text', () => {
    const oursDoc = parseUsj(OURS);
    const theirsDoc = parseUsj(THEIRS_V1_EDIT);
    const picks: Picks = { chapter: new Map([[1, 'theirs']]), paragraph: new Map(), verse: new Map() };
    const result = stitchUsfm({ oursDoc, theirsDoc, picks });
    // theirs has "slave of God"
    expect(result).toContain('slave');
  });
});

describe('stitchUsfm — paragraph-level picks', () => {
  it('paragraph structure theirs + verse pick ours applies ours text for that verse', () => {
    const oursDoc = parseUsj(OURS);
    const theirsDoc = parseUsj(THEIRS_V1_EDIT);
    const picks: Picks = {
      chapter: new Map(),
      paragraph: new Map([['hunk0', 'theirs']]),
      verse: new Map([['hunk0:v0', 'ours']]),
    };
    const result = stitchUsfm({ oursDoc, theirsDoc, picks });
    expect(result).toContain('servant');
    expect(result).not.toContain('slave');
  });

  it('paragraph pick ours keeps ours text', () => {
    const oursDoc = parseUsj(OURS);
    const theirsDoc = parseUsj(THEIRS_V1_EDIT);
    const picks: Picks = {
      chapter: new Map(),
      paragraph: new Map([['hunk0', 'ours']]),
      verse: new Map(),
    };
    const result = stitchUsfm({ oursDoc, theirsDoc, picks });
    expect(result).toContain('servant');
  });

  it('keeps extra paragraph from theirs when pick is theirs', () => {
    const oursDoc = parseUsj(OURS);
    const theirsDoc = parseUsj(THEIRS_EXTRA_PARA);
    const picks: Picks = {
      chapter: new Map(),
      paragraph: new Map([['hunk2', 'theirs']]),  // the theirs-only para
      verse: new Map(),
    };
    const result = stitchUsfm({ oursDoc, theirsDoc, picks });
    expect(result).toContain('Grace and peace');
  });

  it('drops extra paragraph from theirs when pick is ours (discard theirs-only)', () => {
    const oursDoc = parseUsj(OURS);
    const theirsDoc = parseUsj(THEIRS_EXTRA_PARA);
    const picks: Picks = {
      chapter: new Map(),
      paragraph: new Map([['hunk2', 'ours']]),  // pick ours = discard theirs-only
      verse: new Map(),
    };
    const result = stitchUsfm({ oursDoc, theirsDoc, picks });
    expect(result).not.toContain('Grace and peace');
  });
});

describe('stitchUsfm — verse-level picks inside changed paragraph', () => {
  it('verse pick ours for changed verse keeps ours text', () => {
    const oursDoc = parseUsj(OURS);
    const theirsDoc = parseUsj(THEIRS_V1_EDIT);
    const picks: Picks = {
      chapter: new Map(),
      paragraph: new Map(),  // no para pick → drill to verse
      verse: new Map([['hunk0:v0', 'ours']]),
    };
    const result = stitchUsfm({ oursDoc, theirsDoc, picks });
    expect(result).toContain('servant');
  });

  it('verse pick theirs for changed verse keeps theirs text', () => {
    const oursDoc = parseUsj(OURS);
    const theirsDoc = parseUsj(THEIRS_V1_EDIT);
    const picks: Picks = {
      chapter: new Map(),
      paragraph: new Map(),
      verse: new Map([['hunk0:v0', 'theirs']]),
    };
    const result = stitchUsfm({ oursDoc, theirsDoc, picks });
    expect(result).toContain('slave');
  });

  it('unchanged verse is always kept regardless of picks', () => {
    const oursDoc = parseUsj(OURS);
    const theirsDoc = parseUsj(THEIRS_V1_EDIT);
    const picks: Picks = {
      chapter: new Map(),
      paragraph: new Map(),
      verse: new Map([['hunk0:v0', 'theirs']]),
    };
    const result = stitchUsfm({ oursDoc, theirsDoc, picks });
    expect(result).toContain('eternal life');
  });

  it('chapter pick overrides verse picks', () => {
    const oursDoc = parseUsj(OURS);
    const theirsDoc = parseUsj(THEIRS_V1_EDIT);
    const picks: Picks = {
      chapter: new Map([[1, 'ours']]),  // chapter wins
      paragraph: new Map(),
      verse: new Map([['hunk0:v0', 'theirs']]),  // ignored
    };
    const result = stitchUsfm({ oursDoc, theirsDoc, picks });
    expect(result).toContain('servant'); // ours
    expect(result).not.toContain('slave');
  });
});

// ---------------------------------------------------------------------------
// Edge-case fixtures: single-verse paragraphs and split-verse groups
// ---------------------------------------------------------------------------

/** One paragraph, exactly one verse. */
const SINGLE_VERSE = `\\id TIT
\\c 1
\\p
\\v 1 Only verse here.
`;

/** Ours has a continuation paragraph (\\q1) that forms a verse-group with the preceding \\p. */
const SPLIT_OURS = `\\id TIT
\\c 1
\\p
\\v 1 Servant,
\\q1 a servant.
\\p
\\v 2 Next verse.
`;

/** Theirs collapses the split into a single \\p (no \\q1 continuation). */
const SPLIT_THEIRS_MERGED = `\\id TIT
\\c 1
\\p
\\v 1 Slave, a slave.
\\p
\\v 2 Next verse.
`;

/**
 * Both ours and theirs use the same \\p + \\q1 group structure,
 * but v1 and v2 text differ on both sides — creates 2 conflicting verse hunks.
 */
const GROUP_OURS = `\\id TIT
\\c 1
\\p
\\v 1 A servant,
\\v 2 blessed,
\\q1 they are.
\\p
\\v 3 Next.
`;

const GROUP_THEIRS = `\\id TIT
\\c 1
\\p
\\v 1 A slave,
\\v 2 humble,
\\q1 they shall be.
\\p
\\v 3 Next.
`;

/** Heading \\s1 should NOT be merged into the preceding \\p — 3 units expected. */
const HEADING_BREAKS_GROUP = `\\id TIT
\\c 1
\\p
\\v 1 Text.
\\s1 New section.
\\p
\\v 2 Next.
`;

/** Leading \\q1 before any verse-owning paragraph — should NOT merge (no prev). */
const LEADING_CONTINUATION = `\\id TIT
\\c 1
\\q1 Some introduction.
\\p
\\v 1 A servant.
`;

// ---------------------------------------------------------------------------
// Single-verse paragraph
// ---------------------------------------------------------------------------

describe('collectParagraphs — single-verse paragraph', () => {
  it('produces one unit with verseRefs containing just "1"', () => {
    const nodes = chapterNodes(SINGLE_VERSE, 1);
    const paras = collectParagraphs(1, nodes, nodes);
    expect(paras.length).toBe(1);
    expect(paras[0].verseRefs).toEqual(['1']);
  });

  it('unit has markerSequence with a single entry', () => {
    const nodes = chapterNodes(SINGLE_VERSE, 1);
    const paras = collectParagraphs(1, nodes, nodes);
    expect(paras[0].markerSequence).toEqual(['p']);
  });

  it('has exactly one VerseUnit from collectVerses', () => {
    const nodes = chapterNodes(SINGLE_VERSE, 1);
    const paras = collectParagraphs(1, nodes, nodes);
    const content = paraContentNodes(paras[0]);
    const verses = collectVerses(content, content);
    expect(verses.filter((v) => v.verseNum !== '_pre').length).toBe(1);
    expect(verses.some((v) => v.verseNum === '1')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Split-verse group (continuation paragraph grouping)
// ---------------------------------------------------------------------------

describe('collectParagraphs — split-verse grouping', () => {
  it('merges \\q1 continuation into preceding \\p → 2 units (not 3)', () => {
    const nodes = chapterNodes(SPLIT_OURS, 1);
    const paras = collectParagraphs(1, nodes, nodes);
    // Without grouping: would be [\p, \q1, \p] = 3 units.
    // With grouping: [\p+\q1 group, \p] = 2 units.
    expect(paras.length).toBe(2);
  });

  it('first unit has markerSequence ["p", "q1"]', () => {
    const nodes = chapterNodes(SPLIT_OURS, 1);
    const paras = collectParagraphs(1, nodes, nodes);
    expect(paras[0].markerSequence).toEqual(['p', 'q1']);
  });

  it('group unit verseRefs are taken from the verse-owning \\p only', () => {
    const nodes = chapterNodes(SPLIT_OURS, 1);
    const paras = collectParagraphs(1, nodes, nodes);
    // Group covers v1 (from \p); \q1 had no \v
    expect(paras[0].verseRefs).toEqual(['1']);
  });

  it('group unit originalNodes holds both para nodes', () => {
    const nodes = chapterNodes(SPLIT_OURS, 1);
    const paras = collectParagraphs(1, nodes, nodes);
    expect(paras[0].originalNodes.length).toBe(2);
  });

  it('paraContentNodes returns combined content of both para nodes', () => {
    const nodes = chapterNodes(SPLIT_OURS, 1);
    const paras = collectParagraphs(1, nodes, nodes);
    const content = paraContentNodes(paras[0]);
    // Should include text from both \p and \q1
    const allText = content
      .filter((n) => typeof n === 'string')
      .join('');
    expect(allText).toContain('Servant');
    expect(allText).toContain('a servant');
  });

  it('collectVerses on combined content returns one VerseUnit for v1', () => {
    const nodes = chapterNodes(SPLIT_OURS, 1);
    const paras = collectParagraphs(1, nodes, nodes);
    const content = paraContentNodes(paras[0]);
    const verses = collectVerses(content, content);
    expect(verses.some((v) => v.verseNum === '1')).toBe(true);
    // The \q1 text ("a servant.") is appended to v1 since it has no \v
    const v1 = verses.find((v) => v.verseNum === '1')!;
    const v1Text = v1.originalNodes
      .filter((n) => typeof n === 'string')
      .join('');
    expect(v1Text).toContain('servant');
  });

  it('group pairs with non-group theirs counterpart as "changed" (primary marker LCS)', () => {
    const oNodes = chapterNodes(SPLIT_OURS, 1);
    const tNodes = chapterNodes(SPLIT_THEIRS_MERGED, 1);
    const oParas = collectParagraphs(1, oNodes, oNodes);
    const tParas = collectParagraphs(1, tNodes, tNodes);
    // Both have primary marker 'p' and verseRefs '1' → should pair as 'changed'
    const hunks = diffParagraphs(oParas, tParas);
    expect(hunks.some((h) => h.kind === 'changed')).toBe(true);
    // Second paragraph (v2/Next) should be unchanged
    expect(hunks.some((h) => h.kind === 'unchanged')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Group-level pick stitch
// ---------------------------------------------------------------------------

describe('stitchUsfm — group-level pick', () => {
  it('picking ours emits both \\p and \\q1 para nodes (group verbatim)', () => {
    const oursDoc = parseUsj(SPLIT_OURS);
    const theirsDoc = parseUsj(SPLIT_THEIRS_MERGED);
    const picks: Picks = {
      chapter: new Map(),
      paragraph: new Map([['hunk0', 'ours']]),
      verse: new Map(),
    };
    const result = stitchUsfm({ oursDoc, theirsDoc, picks });
    // Ours has "Servant," and "a servant." in separate para blocks (\p and \q1)
    expect(result).toContain('Servant');
    expect(result).toContain('a servant');
    // The \q1 block should be present
    expect(result).toMatch(/\\q1/);
  });

  it('picking theirs emits the single \\p (no \\q1)', () => {
    const oursDoc = parseUsj(SPLIT_OURS);
    const theirsDoc = parseUsj(SPLIT_THEIRS_MERGED);
    const picks: Picks = {
      chapter: new Map(),
      paragraph: new Map([['hunk0', 'theirs']]),
      verse: new Map(),
    };
    const result = stitchUsfm({ oursDoc, theirsDoc, picks });
    expect(result).toContain('Slave');
    // Theirs has no \q1
    expect(result).not.toMatch(/\\q1/);
  });
});

// ---------------------------------------------------------------------------
// Verse-mixing within a group (collapses to single \p)
// ---------------------------------------------------------------------------

describe('stitchUsfm — verse-mix within group', () => {
  it('picks Mine v1 + Theirs v2 → output has ours v1 text and theirs v2 text', () => {
    const oursDoc = parseUsj(GROUP_OURS);
    const theirsDoc = parseUsj(GROUP_THEIRS);

    // Discover the hunk structure
    const oNodes = chapterNodes(GROUP_OURS, 1);
    const tNodes = chapterNodes(GROUP_THEIRS, 1);
    const oParas = collectParagraphs(1, oNodes, oNodes);
    const tParas = collectParagraphs(1, tNodes, tNodes);
    const paraHunks = diffParagraphs(oParas, tParas);
    const changedHunk = paraHunks.find((h) => h.kind === 'changed')!;
    const oContent = paraContentNodes((changedHunk as Extract<typeof changedHunk, { kind: 'changed' }>).ours);
    const tContent = paraContentNodes((changedHunk as Extract<typeof changedHunk, { kind: 'changed' }>).theirs);
    const oVerses = collectVerses(oContent, oContent);
    const tVerses = collectVerses(tContent, tContent);
    const verseHunks = diffVerses(oVerses, tVerses, changedHunk.id);

    // Both v1 and v2 should differ → 2 changed verse hunks
    const conflicting = verseHunks.filter((v) => v.kind !== 'unchanged');
    expect(conflicting.length).toBe(2);

    // Pick ours for v1, theirs for v2
    const v1Hunk = verseHunks.find((v) => v.kind !== 'unchanged')!;
    const v2Hunk = verseHunks.filter((v) => v.kind !== 'unchanged')[1];
    const picks: Picks = {
      chapter: new Map(),
      paragraph: new Map(), // no paragraph pick → verse-level
      verse: new Map([
        [v1Hunk.id, 'ours'],
        [v2Hunk.id, 'theirs'],
      ]),
    };
    const result = stitchUsfm({ oursDoc, theirsDoc, picks });
    // Should have ours v1 text
    expect(result).toContain('A servant');
    // Should have theirs v2 text
    expect(result).toContain('humble');
    // Should NOT have ours v2 text
    expect(result).not.toContain('blessed');
  });

  it('verse-mix collapses group into a single \\p (\\q1 breaks lost — known trade-off)', () => {
    const oursDoc = parseUsj(GROUP_OURS);
    const theirsDoc = parseUsj(GROUP_THEIRS);

    const oNodes = chapterNodes(GROUP_OURS, 1);
    const tNodes = chapterNodes(GROUP_THEIRS, 1);
    const oParas = collectParagraphs(1, oNodes, oNodes);
    const tParas = collectParagraphs(1, tNodes, tNodes);
    const paraHunks = diffParagraphs(oParas, tParas);
    const changedHunk = paraHunks.find((h) => h.kind === 'changed') as Extract<(typeof paraHunks)[number], { kind: 'changed' }>;
    const oContent = paraContentNodes(changedHunk.ours);
    const tContent = paraContentNodes(changedHunk.theirs);
    const verseHunks = diffVerses(
      collectVerses(oContent, oContent),
      collectVerses(tContent, tContent),
      changedHunk.id,
    );

    const allVerseIds = verseHunks.filter((v) => v.kind !== 'unchanged').map((v) => v.id);
    const picks: Picks = {
      chapter: new Map(),
      paragraph: new Map(),
      verse: new Map(allVerseIds.map((id) => [id, 'ours'])),
    };
    const result = stitchUsfm({ oursDoc, theirsDoc, picks });
    // The collapsed output should still start with \p (the primary wrapper marker)
    expect(result).toMatch(/\\p\b/);
  });
});

// ---------------------------------------------------------------------------
// Heading interrupts group
// ---------------------------------------------------------------------------

describe('collectParagraphs — heading interrupts group', () => {
  it('\\s1 between \\p and \\p produces 3 separate units (not merged)', () => {
    const nodes = chapterNodes(HEADING_BREAKS_GROUP, 1);
    const paras = collectParagraphs(1, nodes, nodes);
    // \p(v1), \s1, \p(v2) — heading must NOT merge into \p(v1)
    expect(paras.length).toBe(3);
  });

  it('none of the 3 units has markerSequence.length > 1', () => {
    const nodes = chapterNodes(HEADING_BREAKS_GROUP, 1);
    const paras = collectParagraphs(1, nodes, nodes);
    expect(paras.every((u) => u.markerSequence.length === 1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Leading continuation (no preceding verse-owner)
// ---------------------------------------------------------------------------

describe('collectParagraphs — leading continuation paragraph', () => {
  it('\\q1 at chapter start with no preceding verse-owner stays standalone', () => {
    const nodes = chapterNodes(LEADING_CONTINUATION, 1);
    const paras = collectParagraphs(1, nodes, nodes);
    // \q1 (no prev) + \p(v1) = 2 units
    expect(paras.length).toBe(2);
  });

  it('the leading \\q1 unit has markerSequence ["q1"] (not merged)', () => {
    const nodes = chapterNodes(LEADING_CONTINUATION, 1);
    const paras = collectParagraphs(1, nodes, nodes);
    expect(paras[0].marker).toBe('q1');
    expect(paras[0].markerSequence).toEqual(['q1']);
  });
});

// ---------------------------------------------------------------------------
// isMergedReady
// ---------------------------------------------------------------------------

describe('isMergedReady — readiness gating', () => {
  // Example: ch1 with 2 paragraph hunks; para1 has 2 verse hunks
  const requirements: HunkRequirements[] = [
    {
      chapter: 1,
      paragraphHunks: [
        { id: 'hunk0', verseHunks: ['hunk0:v0', 'hunk0:v1'] },
        { id: 'hunk1', verseHunks: [] },
      ],
    },
  ];

  it('returns false when no picks at all', () => {
    expect(isMergedReady(requirements, emptyPicks())).toBe(false);
  });

  it('returns true with a chapter-level pick', () => {
    const picks = emptyPicks();
    picks.chapter.set(1, 'ours');
    expect(isMergedReady(requirements, picks)).toBe(true);
  });

  it('returns false with only one of two paragraph picks', () => {
    const picks = emptyPicks();
    picks.paragraph.set('hunk0', 'ours');
    expect(isMergedReady(requirements, picks)).toBe(false);
  });

  it('returns false with para0 verse picks only partially set', () => {
    const picks = emptyPicks();
    picks.paragraph.set('hunk0', 'ours');
    picks.verse.set('hunk0:v0', 'ours');
    picks.paragraph.set('hunk1', 'ours');
    // hunk0:v1 still missing
    expect(isMergedReady(requirements, picks)).toBe(false);
  });

  it('returns true when para0 has paragraph + all verse picks + para1 via para pick', () => {
    const picks = emptyPicks();
    picks.paragraph.set('hunk0', 'ours');
    picks.verse.set('hunk0:v0', 'ours');
    picks.verse.set('hunk0:v1', 'theirs');
    picks.paragraph.set('hunk1', 'ours');
    expect(isMergedReady(requirements, picks)).toBe(true);
  });

  it('returns false when hunk0 paragraph pick set but verse picks incomplete', () => {
    const picks = emptyPicks();
    picks.paragraph.set('hunk0', 'theirs');
    picks.paragraph.set('hunk1', 'ours');
    expect(isMergedReady(requirements, picks)).toBe(false);
  });

  it('returns true when hunk0 paragraph + both verse picks + hunk1 paragraph', () => {
    const picks = emptyPicks();
    picks.paragraph.set('hunk0', 'theirs');
    picks.verse.set('hunk0:v0', 'theirs');
    picks.verse.set('hunk0:v1', 'theirs');
    picks.paragraph.set('hunk1', 'ours');
    expect(isMergedReady(requirements, picks)).toBe(true);
  });
});

import type { AlignmentGroup, AlignmentMap, HelpEntry } from '@usfm-tools/types';

import {
  annotateTokensByAlignment,
  buildGatewayTokenOccurrences,
  matchHelpEntryToTokenIndicesByAlignment,
  verseHasAlignmentTargets,
} from '../src/helps/alignment-annotate';

function help(origWords: string, occurrence = 1, id = 'h1'): HelpEntry {
  return {
    id,
    resourceType: 'twl',
    ref: { chapter: 3, verse: 1 },
    origWords,
    occurrence,
    content: '',
  };
}

function src(content: string, occurrence = 1, occurrences = 1): AlignmentGroup['sources'][number] {
  return { strong: '', lemma: '', content, occurrence, occurrences };
}

function tgt(word: string, occurrence = 1, occurrences = 1): AlignmentGroup['targets'][number] {
  return { word, occurrence, occurrences };
}

/** Titus 1:1 shape: «Θεοῦ» twice, with other source words before the first one. */
const titusTokens = [
  'Pablo', 'siervo', 'de', 'Dios', 'y', 'apóstol', 'de', 'Jesucristo',
  'conforme', 'a', 'la', 'fe', 'de', 'los', 'elegidos', 'de', 'Dios',
];
const titusGroups: AlignmentGroup[] = [
  { sources: [src('Παῦλος')], targets: [tgt('Pablo')] },
  { sources: [src('δοῦλος')], targets: [tgt('siervo')] },
  { sources: [src('Θεοῦ', 1, 2)], targets: [tgt('de', 1, 4), tgt('Dios', 1, 2)] },
  { sources: [src('δὲ')], targets: [tgt('y')] },
  { sources: [src('ἀπόστολος')], targets: [tgt('apóstol')] },
  { sources: [src('Ἰησοῦ'), src('Χριστοῦ')], targets: [tgt('de', 2, 4), tgt('Jesucristo')] },
  { sources: [src('κατὰ')], targets: [tgt('conforme'), tgt('a')] },
  { sources: [src('πίστιν')], targets: [tgt('la'), tgt('fe')] },
  { sources: [src('ἐκλεκτῶν')], targets: [tgt('de', 3, 4), tgt('los'), tgt('elegidos')] },
  { sources: [src('Θεοῦ', 2, 2)], targets: [tgt('de', 4, 4), tgt('Dios', 2, 2)] },
];

describe('verseHasAlignmentTargets', () => {
  it('is false for empty or no targets', () => {
    expect(verseHasAlignmentTargets(undefined)).toBe(false);
    expect(verseHasAlignmentTargets([])).toBe(false);
    expect(verseHasAlignmentTargets([{ sources: [], targets: [] }])).toBe(false);
    expect(verseHasAlignmentTargets([{ sources: [{ strong: '', lemma: '', content: 'a', occurrence: 1, occurrences: 1 }], targets: [] }])).toBe(
      false,
    );
  });

  it('is true when any group has targets', () => {
    expect(
      verseHasAlignmentTargets([
        { sources: [], targets: [{ word: 'x', occurrence: 1, occurrences: 1 }] },
      ]),
    ).toBe(true);
  });
});

describe('buildGatewayTokenOccurrences', () => {
  it('counts repeated surface forms', () => {
    expect(buildGatewayTokenOccurrences(['to', 'see', 'to'])).toEqual([
      { norm: 'to', occurrence: 1 },
      { norm: 'see', occurrence: 1 },
      { norm: 'to', occurrence: 2 },
    ]);
  });
});

describe('matchHelpEntryToTokenIndicesByAlignment', () => {
  const groups = [
    {
      sources: [{ strong: 'G3056', lemma: 'λόγος', content: 'λόγος', occurrence: 1, occurrences: 1 }],
      targets: [{ word: 'word', occurrence: 1, occurrences: 1 }],
    },
  ];

  it('maps Greek origWords to gateway token by alignment', () => {
    const tokens = ['The', 'word', 'of', 'life'];
    const idx = matchHelpEntryToTokenIndicesByAlignment(tokens, help('λόγος'), groups);
    expect(idx).toEqual([1]);
  });

  it('respects occurrence for repeated Greek content in flat stream', () => {
    const g2 = [
      {
        sources: [{ strong: 'G1', lemma: 'καί', content: 'καί', occurrence: 1, occurrences: 2 }],
        targets: [{ word: 'and', occurrence: 1, occurrences: 2 }],
      },
      {
        sources: [{ strong: 'G2', lemma: 'καί', content: 'καί', occurrence: 2, occurrences: 2 }],
        targets: [{ word: 'and', occurrence: 2, occurrences: 2 }],
      },
    ];
    const tokens = ['A', 'and', 'B', 'and', 'C'];
    expect(matchHelpEntryToTokenIndicesByAlignment(tokens, help('καί', 1), g2)).toEqual([1]);
    expect(matchHelpEntryToTokenIndicesByAlignment(tokens, help('καί', 2), g2)).toEqual([3]);
  });

  it('resolves each occurrence of a single-word quote when other words precede the first', () => {
    expect(matchHelpEntryToTokenIndicesByAlignment(titusTokens, help('Θεοῦ', 1), titusGroups)).toEqual([2, 3]);
    expect(matchHelpEntryToTokenIndicesByAlignment(titusTokens, help('Θεοῦ', 2), titusGroups)).toEqual([15, 16]);
    expect(matchHelpEntryToTokenIndicesByAlignment(titusTokens, help('Θεοῦ', 3), titusGroups)).toEqual([]);
  });

  it('resolves each occurrence of a two-word quote', () => {
    const tokens = ['En', 'el', 'principio', 'era', 'la', 'Palabra', 'y', 'la', 'Palabra', 'estaba', 'con', 'Dios'];
    const g = [
      { sources: [src('ἐν')], targets: [tgt('En')] },
      { sources: [src('ἀρχῇ')], targets: [tgt('el'), tgt('principio')] },
      { sources: [src('ἦν', 1, 2)], targets: [tgt('era')] },
      { sources: [src('ὁ', 1, 2)], targets: [tgt('la', 1, 2)] },
      { sources: [src('λόγος', 1, 2)], targets: [tgt('Palabra', 1, 2)] },
      { sources: [src('καὶ')], targets: [tgt('y')] },
      { sources: [src('ὁ', 2, 2)], targets: [tgt('la', 2, 2)] },
      { sources: [src('λόγος', 2, 2)], targets: [tgt('Palabra', 2, 2)] },
      { sources: [src('ἦν', 2, 2)], targets: [tgt('estaba')] },
      { sources: [src('πρὸς')], targets: [tgt('con')] },
      { sources: [src('τὸν'), src('Θεόν')], targets: [tgt('Dios')] },
    ];
    expect(matchHelpEntryToTokenIndicesByAlignment(tokens, help('ὁ λόγος', 1), g)).toEqual([4, 5]);
    expect(matchHelpEntryToTokenIndicesByAlignment(tokens, help('ὁ λόγος', 2), g)).toEqual([7, 8]);
    expect(matchHelpEntryToTokenIndicesByAlignment(tokens, help('ὁ λόγος', 3), g)).toEqual([]);
  });

  it('handles & segments in order', () => {
    const g3 = [
      {
        sources: [{ strong: 'G1', lemma: 'a', content: 'alpha', occurrence: 1, occurrences: 1 }],
        targets: [{ word: 'A', occurrence: 1, occurrences: 1 }],
      },
      {
        sources: [{ strong: 'G2', lemma: 'b', content: 'beta', occurrence: 1, occurrences: 1 }],
        targets: [{ word: 'B', occurrence: 1, occurrences: 1 }],
      },
    ];
    const tokens = ['A', 'B'];
    const idx = matchHelpEntryToTokenIndicesByAlignment(tokens, help('alpha&beta', 1), g3);
    expect(idx.sort()).toEqual([0, 1]);
  });
});

describe('annotateTokensByAlignment', () => {
  const verseSid = 'TIT 3:1';
  const map: AlignmentMap = {
    [verseSid]: [
      {
        sources: [{ strong: 'G3056', lemma: 'λόγος', content: 'λόγος', occurrence: 1, occurrences: 1 }],
        targets: [{ word: 'palabra', occurrence: 1, occurrences: 1 }],
      },
    ],
  };

  it('uses alignment when verse has targets', () => {
    const tokens = ['La', 'palabra', 'es', 'buena'];
    const helps = [help('λόγος')];
    const ann = annotateTokensByAlignment(tokens, helps, map, verseSid);
    expect(ann).toEqual([{ tokenIndex: 1, entries: helps }]);
  });

  it('annotates distinct tokens for TWL rows that differ only by occurrence', () => {
    const first = help('Θεοῦ', 1, 'god-1');
    const second = help('Θεοῦ', 2, 'god-2');
    const ann = annotateTokensByAlignment(titusTokens, [first, second], { 'TIT 1:1': titusGroups }, 'TIT 1:1');
    expect(ann).toEqual([
      { tokenIndex: 2, entries: [first] },
      { tokenIndex: 3, entries: [first] },
      { tokenIndex: 15, entries: [second] },
      { tokenIndex: 16, entries: [second] },
    ]);
  });

  it('falls back to quote matcher when map missing verse', () => {
    const tokens = ['La', 'palabra'];
    const helps = [help('palabra')];
    const ann = annotateTokensByAlignment(tokens, helps, map, 'TIT 3:2');
    expect(ann.map((a) => a.tokenIndex)).toEqual([1]);
  });

  it('falls back when alignment has no targets', () => {
    const emptyTargets: AlignmentMap = {
      [verseSid]: [{ sources: [{ strong: '', lemma: '', content: 'x', occurrence: 1, occurrences: 1 }], targets: [] }],
    };
    const tokens = ['hello', 'world'];
    const helps = [help('world')];
    const ann = annotateTokensByAlignment(tokens, helps, emptyTargets, verseSid);
    expect(ann.map((a) => a.tokenIndex)).toEqual([1]);
  });
});

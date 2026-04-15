import type { AlignmentMap, HelpEntry } from '@usfm-tools/types';

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

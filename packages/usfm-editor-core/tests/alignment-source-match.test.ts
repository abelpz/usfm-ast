import type { AlignmentMap } from '@usfm-tools/types';
import type { OriginalWordToken } from '../src/word-identity';
import {
  matchSourceToExistingAlignments,
  originalWordMatchesToken,
  resolveSourceVerseKey,
} from '../src/alignment-provenance';

function ow(
  strong: string,
  lemma: string,
  content: string,
  occurrence: number,
  occurrences = 1,
) {
  return { strong, lemma, content, occurrence, occurrences };
}

function tok(
  surface: string,
  strong: string,
  lemma: string,
  occurrence: number,
  occurrences = 1,
  verseSid = 'TIT 1:1',
): OriginalWordToken {
  return { verseSid, surface, strong, lemma, occurrence, occurrences, index: 0 };
}

describe('originalWordMatchesToken', () => {
  it('matches on Strong number when both non-empty', () => {
    expect(
      originalWordMatchesToken(ow('G1234', 'foo', 'bar', 1), tok('x', 'G1234', 'other', 99)),
    ).toBe(true);
  });

  it('matches lemma + occurrence when strong empty', () => {
    expect(
      originalWordMatchesToken(ow('', 'δοῦλος', 'δοῦλος', 1), tok('δοῦλος', '', 'δοῦλος', 1)),
    ).toBe(true);
  });

  it('matches content + surface + occurrence', () => {
    expect(
      originalWordMatchesToken(ow('', '', 'Παῦλος', 1), tok('Παῦλος', '', '', 1)),
    ).toBe(true);
  });
});

describe('resolveSourceVerseKey', () => {
  const map: Record<string, OriginalWordToken[]> = {
    'el-x-koine/ugnt TIT 1:1': [tok('a', 'G1', 'a', 1)],
  };
  it('resolves by chapter:verse suffix', () => {
    expect(resolveSourceVerseKey(map, 'TIT 1:1')).toBe('el-x-koine/ugnt TIT 1:1');
  });
});

describe('matchSourceToExistingAlignments', () => {
  it('returns exact when no embedded source words', () => {
    const r = matchSourceToExistingAlignments({}, {});
    expect(r.confidence).toBe('exact');
    expect(r.matchRatio).toBe(1);
    expect(r.versesCompared).toBe(0);
  });

  it('exact when all source words match', () => {
    const source: Record<string, OriginalWordToken[]> = {
      'TIT 1:1': [tok('λόγος', 'G3056', 'λόγος', 1), tok('ζωή', 'G2222', 'ζωή', 1)],
    };
    const alignments: AlignmentMap = {
      'TIT 1:1': [
        {
          sources: [ow('G3056', 'λόγος', 'λόγος', 1), ow('G2222', 'ζωή', 'ζωή', 1)],
          targets: [],
        },
      ],
    };
    const r = matchSourceToExistingAlignments(source, alignments);
    expect(r.confidence).toBe('exact');
    expect(r.matchRatio).toBe(1);
    expect(r.versesCompared).toBe(1);
    expect(r.versesMatched).toBe(1);
    expect(r.mismatches).toHaveLength(0);
  });

  it('high when >= 90% match', () => {
    const source: Record<string, OriginalWordToken[]> = {
      'TIT 1:1': [
        tok('a', 'G1', 'a', 1),
        tok('b', 'G2', 'b', 1),
        tok('c', 'G3', 'c', 1),
        tok('d', 'G4', 'd', 1),
        tok('e', 'G5', 'e', 1),
        tok('f', 'G6', 'f', 1),
        tok('g', 'G7', 'g', 1),
        tok('h', 'G8', 'h', 1),
        tok('i', 'G9', 'i', 1),
        tok('z', 'G9999', 'z', 1),
      ],
    };
    const alignments: AlignmentMap = {
      'TIT 1:1': [
        {
          sources: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) =>
            ow(`G${i}`, String(i), String(i), 1),
          ),
          targets: [],
        },
      ],
    };
    const r = matchSourceToExistingAlignments(source, alignments);
    expect(r.confidence).toBe('high');
    expect(r.matchRatio).toBe(0.9);
  });

  it('partial when between 50% and 90%', () => {
    const source: Record<string, OriginalWordToken[]> = {
      'TIT 1:1': [tok('a', 'G1', 'a', 1), tok('b', 'G2', 'b', 1), tok('c', 'G3', 'c', 1), tok('d', 'G4', 'd', 1), tok('e', 'G5', 'e', 1)],
    };
    const alignments: AlignmentMap = {
      'TIT 1:1': [
        {
          sources: [ow('G1', 'a', 'a', 1), ow('G2', 'b', 'b', 1), ow('G3', 'c', 'c', 1), ow('Gx', 'x', 'x', 1), ow('Gy', 'y', 'y', 1)],
          targets: [],
        },
      ],
    };
    const r = matchSourceToExistingAlignments(source, alignments);
    expect(r.confidence).toBe('partial');
    expect(r.matchRatio).toBe(0.6);
  });

  it('none when < 50% match', () => {
    const source: Record<string, OriginalWordToken[]> = {
      'TIT 1:1': [tok('a', 'G1', 'a', 1), tok('b', 'G2', 'b', 1), tok('c', 'G3', 'c', 1), tok('d', 'G4', 'd', 1), tok('e', 'G5', 'e', 1)],
    };
    const alignments: AlignmentMap = {
      'TIT 1:1': [
        {
          sources: [ow('G1', 'a', 'a', 1), ow('Gx', 'x', 'x', 1), ow('Gy', 'y', 'y', 1), ow('Gz', 'z', 'z', 1), ow('Gw', 'w', 'w', 1)],
          targets: [],
        },
      ],
    };
    const r = matchSourceToExistingAlignments(source, alignments);
    expect(r.confidence).toBe('none');
    expect(r.matchRatio).toBe(0.2);
  });

  it('records mismatch when verse key missing in source', () => {
    const source: Record<string, OriginalWordToken[]> = {
      'TIT 1:1': [tok('a', 'G1', 'a', 1)],
    };
    const alignments: AlignmentMap = {
      'ROM 99:1': [{ sources: [ow('G1', 'a', 'a', 1)], targets: [] }],
    };
    const r = matchSourceToExistingAlignments(source, alignments);
    expect(r.mismatches.some((m) => m.verseSid === 'ROM 99:1')).toBe(true);
  });
});

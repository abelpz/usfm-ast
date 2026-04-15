import {
  annotateTokensByQuote,
  filterHelpsForVerse,
  findNthSubstringIndex,
  matchHelpQuoteToTokenIndices,
  tokenJoinedSpans,
} from '../src/helps/quote-matcher';
import type { HelpEntry } from '@usfm-tools/types';

describe('findNthSubstringIndex', () => {
  it('returns first occurrence by default', () => {
    expect(findNthSubstringIndex('foo bar foo baz', 'foo', 1)).toEqual({ start: 0, end: 3 });
  });

  it('returns second non-overlapping occurrence', () => {
    expect(findNthSubstringIndex('foo bar foo baz', 'foo', 2)).toEqual({ start: 8, end: 11 });
  });

  it('returns null when occurrence not found', () => {
    expect(findNthSubstringIndex('a b c', 'z', 1)).toBeNull();
    expect(findNthSubstringIndex('aaa', 'aa', 3)).toBeNull();
  });

  it('respects fromIndex', () => {
    expect(findNthSubstringIndex('aa aa', 'aa', 1, 1)).toEqual({ start: 3, end: 5 });
  });
});

describe('tokenJoinedSpans', () => {
  it('joins normalized tokens with single spaces', () => {
    const { joined, spans } = tokenJoinedSpans(['  a  ', 'b']);
    expect(joined).toBe('a b');
    expect(spans).toHaveLength(2);
    expect(spans[0]).toMatchObject({ tokenIndex: 0, startInJoined: 0, endInJoined: 1 });
    expect(spans[1]).toMatchObject({ tokenIndex: 1, startInJoined: 2, endInJoined: 3 });
  });
});

describe('matchHelpQuoteToTokenIndices', () => {
  it('matches single-token quote with occurrence 1', () => {
    const tokens = ['Παῦλος', 'δοῦλος', 'Θεοῦ'];
    expect(matchHelpQuoteToTokenIndices(tokens, 'Παῦλος', 1)).toEqual([0]);
  });

  it('matches multi-token substring spanning tokens', () => {
    const tokens = ['In', 'the', 'beginning'];
    expect(matchHelpQuoteToTokenIndices(tokens, 'the beginning', 1)).toEqual([1, 2]);
  });

  it('uses occurrence for repeated quotes', () => {
    const tokens = ['x', 'x', 'y'];
    expect(matchHelpQuoteToTokenIndices(tokens, 'x', 1)).toEqual([0]);
    expect(matchHelpQuoteToTokenIndices(tokens, 'x', 2)).toEqual([1]);
  });

  it('handles & segments with occurrence on first part only', () => {
    const tokens = ['a', 'b', 'c', 'd'];
    expect(matchHelpQuoteToTokenIndices(tokens, 'a & c', 1)).toEqual([0, 2]);
  });
});

describe('annotateTokensByQuote', () => {
  it('merges multiple help rows on same token', () => {
    const tokens = ['grace', 'and', 'peace'];
    const helps: HelpEntry[] = [
      {
        id: '1',
        resourceType: 'words-links',
        ref: { chapter: 1, verse: 1 },
        origWords: 'grace',
        occurrence: 1,
        content: 'twl',
      },
      {
        id: '2',
        resourceType: 'notes',
        ref: { chapter: 1, verse: 1 },
        origWords: 'grace',
        occurrence: 1,
        content: 'tn',
      },
    ];
    const ann = annotateTokensByQuote(tokens, helps);
    expect(ann).toHaveLength(1);
    expect(ann[0]!.tokenIndex).toBe(0);
    expect(ann[0]!.entries).toHaveLength(2);
  });
});

describe('filterHelpsForVerse', () => {
  it('filters by chapter and verse', () => {
    const helps: HelpEntry[] = [
      {
        id: 'a',
        resourceType: 'notes',
        ref: { chapter: 1, verse: 1 },
        origWords: 'x',
        occurrence: 1,
        content: '',
      },
      {
        id: 'b',
        resourceType: 'notes',
        ref: { chapter: 1, verse: 2 },
        origWords: 'y',
        occurrence: 1,
        content: '',
      },
    ];
    expect(filterHelpsForVerse(helps, 1, 2).map((h) => h.id)).toEqual(['b']);
  });

  it('excludes bookIntro and chapterIntro rows from verse decoration matching', () => {
    const helps: HelpEntry[] = [
      {
        id: 'intro',
        resourceType: 'notes',
        ref: { chapter: 0, verse: 0, segment: 'bookIntro' },
        origWords: 'x',
        occurrence: 1,
        content: '',
      },
      {
        id: 'chIntro',
        resourceType: 'notes',
        ref: { chapter: 1, verse: 0, segment: 'chapterIntro' },
        origWords: 'y',
        occurrence: 1,
        content: '',
      },
      {
        id: 'v1',
        resourceType: 'notes',
        ref: { chapter: 1, verse: 1 },
        origWords: 'z',
        occurrence: 1,
        content: '',
      },
    ];
    expect(filterHelpsForVerse(helps, 1, 1).map((h) => h.id)).toEqual(['v1']);
  });
});

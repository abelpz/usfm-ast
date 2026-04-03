import { reconcileAlignments } from '../dist';
import type { AlignmentGroup } from '@usfm-tools/types';

describe('reconcileAlignments', () => {
  it('preserves alignment when words shift with insertion nearby', () => {
    const groups: AlignmentGroup[] = [
      {
        sources: [
          {
            strong: 'G1',
            lemma: 'a',
            content: 'a',
            occurrence: 1,
            occurrences: 1,
          },
        ],
        targets: [{ word: 'hello', occurrence: 1, occurrences: 1 }],
      },
    ];
    const out = reconcileAlignments('hello world', 'oh hello world', groups);
    expect(out.length).toBe(1);
    expect(out[0].targets[0].word).toBe('hello');
  });

  it('handles duplicate tokens with greedy target placement', () => {
    const groups: AlignmentGroup[] = [
      {
        sources: [
          {
            strong: 'G1',
            lemma: 'a',
            content: 'a',
            occurrence: 1,
            occurrences: 1,
          },
        ],
        targets: [{ word: 'to', occurrence: 2, occurrences: 3 }],
      },
    ];
    const out = reconcileAlignments('a to b to c', 'a to b to c to', groups);
    expect(out[0].targets[0].word).toBe('to');
  });

  it('keeps partial alignment when fewer targets than words in verse', () => {
    const groups: AlignmentGroup[] = [
      {
        sources: [
          {
            strong: 'G1',
            lemma: 'a',
            content: 'a',
            occurrence: 1,
            occurrences: 1,
          },
        ],
        targets: [{ word: 'one', occurrence: 1, occurrences: 1 }],
      },
    ];
    const out = reconcileAlignments('one two three four five', 'one two three four five six', groups);
    expect(out.length).toBe(1);
    expect(out[0].targets[0].word).toBe('one');
  });

  it('documents reordering: LCS may drop non-stable words', () => {
    const groups: AlignmentGroup[] = [
      {
        sources: [
          {
            strong: 'G1',
            lemma: 'a',
            content: 'a',
            occurrence: 1,
            occurrences: 1,
          },
        ],
        targets: [{ word: 'a', occurrence: 1, occurrences: 1 }],
      },
    ];
    const out = reconcileAlignments('a b', 'b a', groups);
    expect(out.length).toBe(0);
  });
});

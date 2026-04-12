import type { AlignmentGroup } from '@usfm-tools/types';
import { reconcileAlignments } from '../src/alignment-reconcile';

describe('reconcileAlignments alignment shapes', () => {
  const baseGroup: AlignmentGroup = {
    sources: [
      {
        strong: 'G1',
        lemma: 'λόγος',
        content: 'λόγος',
        occurrence: 1,
        occurrences: 1,
      },
    ],
    targets: [{ word: 'palabra', occurrence: 1, occurrences: 2 }],
  };

  it('keeps target when word unchanged', () => {
    const oldT = 'hola palabra fe';
    const newT = 'hola palabra fe';
    const out = reconcileAlignments(oldT, newT, [baseGroup]);
    expect(out).toHaveLength(1);
    expect(out[0]!.targets[0]!.word).toBe('palabra');
  });

  it('drops when word removed', () => {
    const oldT = 'hola palabra fe';
    const newT = 'hola fe';
    const out = reconcileAlignments(oldT, newT, [baseGroup]);
    expect(out).toHaveLength(0);
  });

  it('updates occurrence when duplicate words', () => {
    const g: AlignmentGroup = {
      sources: [{ strong: 'G1', lemma: 'a', content: 'a', occurrence: 1, occurrences: 1 }],
      targets: [{ word: 'x', occurrence: 1, occurrences: 2 }],
    };
    const oldT = 'x y x';
    const newT = 'x y x';
    const out = reconcileAlignments(oldT, newT, [g]);
    expect(out[0]!.targets[0]!.occurrence).toBe(1);
  });
});

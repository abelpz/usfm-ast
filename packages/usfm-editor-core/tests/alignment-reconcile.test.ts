import { reconcileAlignments } from '../src/alignment-reconcile';
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

  describe('a verse whose groups come in the order of the source (Jonah 2:2 of a team)', () => {
    const src = (content: string) => ({ strong: 'H1', lemma: content, content, occurrence: 1, occurrences: 1 });
    const t = (word: string, occurrence = 1, occurrences = 1) => ({ word, occurrence, occurrences });
    const verse = 'Y él dijo: Clamé a Jehová desde mi angustia y él me respondió; desde el vientre del Seol clamé, tú escuchaste mi voz.';
    const groups: AlignmentGroup[] = [
      { sources: [src('ויאמר')], targets: [t('Y'), t('él', 1, 2), t('dijo')] },
      { sources: [src('קראתי')], targets: [t('Clamé')] },
      { sources: [src('אל'), src('יהוה')], targets: [t('a'), t('Jehová')] },
      // Its two words stand around the word of the next group.
      { sources: [src('מצרה')], targets: [t('desde', 1, 2), t('angustia')] },
      { sources: [src('לי')], targets: [t('mi', 1, 2)] },
      { sources: [src('ויענני')], targets: [t('y'), t('él', 2, 2), t('me'), t('respondió')] },
      { sources: [src('מבטן')], targets: [t('desde', 2, 2), t('el'), t('vientre')] },
      { sources: [src('שאול')], targets: [t('del'), t('Seol')] },
      { sources: [src('שועתי')], targets: [t('clamé')] },
      { sources: [src('שמעת')], targets: [t('tú'), t('escuchaste')] },
      { sources: [src('קולי')], targets: [t('mi', 2, 2), t('voz')] },
    ];
    const bare = (word: string) => word.replace(/[^\p{L}\p{N}]+/gu, '');
    const links = (gs: AlignmentGroup[]) =>
      gs.map((g) => `${g.sources.map((s) => s.content).join('+')}=${g.targets.map((x) => `${bare(x.word)}#${x.occurrence}/${x.occurrences}`).join(' ')}`);

    it('keeps every link of the words that did not change when one word does', () => {
      const out = reconcileAlignments(verse, verse.replace('angustia', 'aflicción'), groups);
      expect(links(out)).toEqual(links(groups).map((line) => line.replace(' angustia#1/1', '')));
    });

    it('the same when the new text comes in the lines of the poem', () => {
      const lined = verse.replace('dijo: ', 'dijo:\n').replace('respondió; ', 'respondió;\n').replace('angustia', 'aflicción');
      const out = reconcileAlignments(verse, lined, groups);
      expect(links(out)).toEqual(links(groups).map((line) => line.replace(' angustia#1/1', '')));
    });

    it('numbers again a word that is left as the only one of its kind', () => {
      const out = reconcileAlignments(verse, verse.replace('desde mi angustia', 'desde la angustia'), groups);
      const expected = links(groups)
        .filter((line) => !line.startsWith('לי='))
        .map((line) => line.replace('mi#2/2', 'mi#1/1'));
      expect(links(out)).toEqual(expected);
    });

    it('leaves the verse as it was when nothing changed', () => {
      expect(links(reconcileAlignments(verse, verse, groups))).toEqual(links(groups));
    });

    it('a word added before does not move the links to another word like it', () => {
      const out = reconcileAlignments(verse, `Y desde allí ${verse.slice(2)}`, groups);
      expect(links(out)).toEqual(
        links(groups).map((line) => line.replace('desde#1/2', 'desde#2/3').replace('desde#2/2', 'desde#3/3')),
      );
    });
  });

  it('gives a target whose number is of no word of the verse the first word like it that is free', () => {
    const src = { strong: 'G1', lemma: 'a', content: 'a', occurrence: 1, occurrences: 1 };
    const groups: AlignmentGroup[] = [
      { sources: [src], targets: [{ word: 'to', occurrence: 5, occurrences: 5 }] },
      { sources: [{ ...src, content: 'b' }], targets: [{ word: 'to', occurrence: 1, occurrences: 2 }] },
    ];
    const out = reconcileAlignments('a to b to c', 'a to b to c', groups);
    // The one that says which «to» it is keeps it; the other takes the one that is left.
    expect(out.map((g) => `${g.sources[0]!.content}=${g.targets.map((x) => x.occurrence).join(',')}`)).toEqual(['a=2', 'b=1']);
  });

  it('matches stored target word to old verse token when punctuation differs (comma)', () => {
    const groups: AlignmentGroup[] = [
      {
        sources: [{ strong: 'G1', lemma: 'x', content: 'x', occurrence: 1, occurrences: 1 }],
        targets: [{ word: 'Pablo', occurrence: 1, occurrences: 1 }],
      },
    ];
    const out = reconcileAlignments('Pablo, sigue', 'Pablo sigue', groups);
    expect(out.length).toBe(1);
    expect(out[0].targets[0].word).toBe('Pablo');
    expect(out[0].targets[0].occurrence).toBe(1);
  });
});

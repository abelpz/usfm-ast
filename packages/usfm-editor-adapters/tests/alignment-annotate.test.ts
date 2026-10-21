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

/**
 * One alignment group per source word, each aligned to its own gateway token, so a token index
 * is also the word's position in the alignment stream. `x-occurrence` follows stream order.
 */
function wordStream(words: string): { tokens: string[]; groups: AlignmentGroup[] } {
  const list = words.split(' ');
  const totals = new Map<string, number>();
  for (const w of list) totals.set(w, (totals.get(w) ?? 0) + 1);
  const seen = new Map<string, number>();
  const tokens = list.map((_, i) => `w${i}`);
  const groups = list.map((w, i) => {
    const occurrence = (seen.get(w) ?? 0) + 1;
    seen.set(w, occurrence);
    return { sources: [src(w, occurrence, totals.get(w))], targets: [tgt(tokens[i]!)] };
  });
  return { tokens, groups };
}

/**
 * Token indices each `occurrence` of `quote` resolves to in a {@link wordStream}. The words at
 * the `unaligned` positions are in the verse, and counted by `x-occurrence`, but have no
 * alignment group yet.
 */
function resolveInStream(words: string, quote: string, occurrences: number[], unaligned: number[] = []): number[][] {
  const { tokens, groups } = wordStream(words);
  const aligned = groups.filter((_, i) => !unaligned.includes(i));
  return occurrences.map((occ) => matchHelpEntryToTokenIndicesByAlignment(tokens, help(quote, occ), aligned));
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

/** A verse still being aligned: «καί» 1 of 2 has no alignment group yet. */
const partialTokens = ['a', 'and'];
const partialGroups: AlignmentGroup[] = [
  { sources: [src('A')], targets: [tgt('a')] },
  { sources: [src('καί', 2, 2)], targets: [tgt('and')] },
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

  it('does not count a looser window around a tighter match as an occurrence', () => {
    // The article of «τοῦ Κυρίου» plus the second «Θεοῦ» is not an occurrence of «τοῦ Θεοῦ».
    expect(resolveInStream('τοῦ Θεοῦ τοῦ Κυρίου τοῦ Θεοῦ', 'τοῦ Θεοῦ', [1, 2, 3])).toEqual([[0, 1], [4, 5], []]);
  });

  it('pairs a repeated word with the nearest one, not the first in the verse', () => {
    expect(resolveInStream('τοῦ Κυρίου τοῦ Θεοῦ', 'τοῦ Θεοῦ', [1, 2])).toEqual([[2, 3], []]);
  });

  it('resolves each occurrence when the gateway reverses the quote word order', () => {
    // In quote order the only match is «τοῦ»(2) + «Θεοῦ»(4), which straddles two phrases.
    expect(resolveInStream('Χ Θεοῦ τοῦ Υ Θεοῦ τοῦ', 'τοῦ Θεοῦ', [1, 2, 3])).toEqual([[1, 2], [4, 5], []]);
  });

  it('counts matches that compete for a source word once, preferring quote order', () => {
    expect(resolveInStream('Θεοῦ Θεοῦ τοῦ', 'τοῦ Θεοῦ', [1, 2])).toEqual([[1, 2], []]);
    expect(resolveInStream('Θεοῦ τοῦ Θεοῦ', 'τοῦ Θεοῦ', [1, 2])).toEqual([[1, 2], []]);
  });

  it('still matches across a word the gateway moved inside the quote', () => {
    expect(resolveInStream('ἐφανέρωσεν Χ τὸν λόγον', 'ἐφανέρωσεν τὸν λόγον', [1, 2])).toEqual([[0, 2, 3], []]);
  });

  describe('source word split across milestones', () => {
    // ULT-style split: «ἐκλεκτῶν» (1 of 1) carried by two adjacent milestones.
    const tokens = ['the', 'faith', 'of', 'the', 'chosen', 'of', 'God'];
    const g = [
      { sources: [src('πίστιν')], targets: [tgt('the', 1, 2), tgt('faith')] },
      { sources: [src('ἐκλεκτῶν')], targets: [tgt('of', 1, 2)] },
      { sources: [src('ἐκλεκτῶν')], targets: [tgt('the', 2, 2), tgt('chosen')] },
      { sources: [src('Θεοῦ')], targets: [tgt('of', 2, 2), tgt('God')] },
    ];

    it('matches a quote that lists the split word once', () => {
      expect(matchHelpEntryToTokenIndicesByAlignment(tokens, help('πίστιν ἐκλεκτῶν Θεοῦ'), g)).toEqual([
        0, 1, 2, 3, 4, 5, 6,
      ]);
      expect(matchHelpEntryToTokenIndicesByAlignment(tokens, help('πίστιν ἐκλεκτῶν'), g)).toEqual([0, 1, 2, 3, 4]);
    });

    it('does not count the second milestone as a second occurrence', () => {
      expect(matchHelpEntryToTokenIndicesByAlignment(tokens, help('ἐκλεκτῶν', 1), g)).toEqual([2, 3, 4]);
      expect(matchHelpEntryToTokenIndicesByAlignment(tokens, help('ἐκλεκτῶν', 2), g)).toEqual([]);
    });
  });

  it('numbers occurrences in original-language order when the gateway aligns them out of order', () => {
    // Titus 1:9: UGNT «ἐν τῇ διδασκαλίᾳ τῇ ὑγιαινούσῃ», en_ult "with sound teaching".
    const tokens = ['with', 'sound', 'teaching'];
    const g = [
      { sources: [src('ἐν')], targets: [tgt('with')] },
      { sources: [src('τῇ', 2, 2), src('ὑγιαινούσῃ')], targets: [tgt('sound')] },
      { sources: [src('τῇ', 1, 2), src('διδασκαλίᾳ')], targets: [tgt('teaching')] },
    ];
    expect(matchHelpEntryToTokenIndicesByAlignment(tokens, help('τῇ', 1), g)).toEqual([2]);
    expect(matchHelpEntryToTokenIndicesByAlignment(tokens, help('τῇ', 2), g)).toEqual([1]);
    expect(matchHelpEntryToTokenIndicesByAlignment(tokens, help('τῇ', 3), g)).toEqual([]);
    expect(matchHelpEntryToTokenIndicesByAlignment(tokens, help('ἐν τῇ διδασκαλίᾳ τῇ ὑγιαινούσῃ'), g)).toEqual([
      0, 1, 2,
    ]);
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

  it('places later & segments after the occurrence chosen for the first segment', () => {
    expect(resolveInStream('καὶ λόγος καὶ λόγος', 'καὶ & λόγος', [1, 2, 3])).toEqual([[0, 1], [2, 3], []]);
    // The first «λόγος» is nearer to the second «καὶ», but it comes before it.
    expect(resolveInStream('καὶ ὁ λόγος καὶ ὁ λόγος', 'καὶ & λόγος', [1, 2])).toEqual([[0, 2], [3, 5]]);
  });

  it('falls back to the nearest & segment before the previous one when the gateway reorders them', () => {
    // Titus 2:11 shape: UGNT «ἐπεφάνη γὰρ ἡ χάρις», gateway order "for the grace … has appeared".
    expect(resolveInStream('γὰρ ἡ χάρις ἐπεφάνη', 'ἐπεφάνη & ἡ χάρις', [1])).toEqual([[1, 2, 3]]);
    expect(resolveInStream('ἡ χάρις ἐπεφάνη Χ ἡ χάρις ἐπεφάνη', 'ἐπεφάνη & ἡ χάρις', [2])).toEqual([[4, 5, 6]]);
  });

  it('does not reuse a source word for two & segments', () => {
    expect(resolveInStream('καὶ Χ καὶ Υ', 'καὶ & καὶ', [1])).toEqual([[0, 2]]);
    expect(resolveInStream('καὶ Χ Υ', 'καὶ & καὶ', [1])).toEqual([[]]);
  });

  describe('partially aligned verse', () => {
    it('resolves a single-word quote by x-occurrence, not by its place among the aligned ones', () => {
      expect(matchHelpEntryToTokenIndicesByAlignment(partialTokens, help('καί', 1), partialGroups)).toEqual([]);
      expect(matchHelpEntryToTokenIndicesByAlignment(partialTokens, help('καί', 2), partialGroups)).toEqual([1]);
      expect(matchHelpEntryToTokenIndicesByAlignment(partialTokens, help('καί', 3), partialGroups)).toEqual([]);
    });

    it('keeps the number of every aligned occurrence, wherever the missing ones are', () => {
      const verse = 'καὶ Χ καὶ Υ καὶ';
      expect(resolveInStream(verse, 'καὶ', [1, 2, 3, 4], [2])).toEqual([[0], [], [4], []]);
      expect(resolveInStream(verse, 'καὶ', [1, 2, 3, 4], [0, 2])).toEqual([[], [], [4], []]);
      expect(resolveInStream(verse, 'καὶ', [1, 2, 3, 4], [4])).toEqual([[0], [2], [], []]);
    });

    it('numbers by x-occurrence when the gateway also reorders the aligned occurrences', () => {
      // «τῇ» 2 of 3 is not aligned, and the gateway reaches 3 of 3 before 1 of 3.
      const tokens = ['sound', 'teaching'];
      const g = [
        { sources: [src('τῇ', 3, 3)], targets: [tgt('sound')] },
        { sources: [src('τῇ', 1, 3)], targets: [tgt('teaching')] },
      ];
      const at = (occurrence: number) => matchHelpEntryToTokenIndicesByAlignment(tokens, help('τῇ', occurrence), g);
      expect([1, 2, 3].map(at)).toEqual([[1], [], [0]]);
    });

    it('gathers every milestone of a split word under its x-occurrence', () => {
      // «ἐκλεκτῶν» 2 of 2 carried by two milestones; 1 of 2 is not aligned.
      const tokens = ['of', 'the', 'chosen'];
      const g = [
        { sources: [src('ἐκλεκτῶν', 2, 2)], targets: [tgt('of')] },
        { sources: [src('ἐκλεκτῶν', 2, 2)], targets: [tgt('the'), tgt('chosen')] },
      ];
      const at = (occurrence: number) =>
        matchHelpEntryToTokenIndicesByAlignment(tokens, help('ἐκλεκτῶν', occurrence), g);
      expect([1, 2].map(at)).toEqual([[], [0, 1, 2]]);
    });

    it('places later & segments after the occurrence that x-occurrence names', () => {
      expect(resolveInStream('καὶ λόγος καὶ λόγος', 'καὶ & λόγος', [1, 2], [0])).toEqual([[], [2, 3]]);
    });

    it('takes the first aligned placement when the occurrence is below 1', () => {
      // TN has -1 for "every occurrence": no number to look up.
      for (const occurrence of [-1, 0]) {
        expect(matchHelpEntryToTokenIndicesByAlignment(partialTokens, help('καί', occurrence), partialGroups)).toEqual([
          1,
        ]);
      }
    });

    it('numbers a multi-word quote by its place among the placements found', () => {
      // A phrase has no x-occurrence. Its place is its number while what comes before it is aligned.
      expect(resolveInStream('ὁ λόγος Χ ὁ λόγος Υ ὁ λόγος', 'ὁ λόγος', [1, 2, 3], [6, 7])).toEqual([
        [0, 1],
        [3, 4],
        [],
      ]);
      // Known limit: with an earlier occurrence missing, the later one takes its number.
      expect(resolveInStream('ὁ λόγος Χ Υ ὁ λόγος', 'ὁ λόγος', [1, 2], [0, 1])).toEqual([[4, 5], []]);
      // The stream is the same when the verse has «ὁ λόγος» once, after a «λόγος» and a «ὁ»
      // that stand apart: there the placement is occurrence 1. Nothing tells the two verses apart.
      expect(resolveInStream('λόγος Χ ὁ Υ ὁ λόγος', 'ὁ λόγος', [1, 2], [0, 2])).toEqual([[4, 5], []]);
    });
  });

  describe('Hebrew words that differ only in accents', () => {
    // Psalm 1:1 shape. `x-occurrence` counts each accented form on its own, so both forms of
    // «לֹא» have an occurrence 1 although they normalize to the same text.
    const loMerkha = '\u05DC\u05B9\u05A5\u05D0'; // accent merkha (U+05A5)
    const loMunah = '\u05DC\u05B9\u05A3\u05D0'; // accent munah (U+05A3)
    const loTipcha = '\u05DC\u05B9\u0596\u05D0'; // accent tipcha (U+0596): a form the verse lacks
    const loPlain = '\u05DC\u05B9\u05D0'; // no accent: a form the verse lacks
    const walk = 'הָלַךְ';
    const walkMerkha = '\u05D4\u05B8\u05DC\u05B7\u05A5\u05DA\u05B0'; // «הָלַךְ» with an accent
    const stand = 'עָמָד';
    const sit = 'יָשָׁב';
    const tokens = ['not', 'walk', 'not', 'stand', 'not', 'sit'];
    const g = [
      { sources: [src(loMerkha, 1, 2)], targets: [tgt('not', 1, 3)] },
      { sources: [src(walk)], targets: [tgt('walk')] },
      { sources: [src(loMerkha, 2, 2)], targets: [tgt('not', 2, 3)] },
      { sources: [src(stand)], targets: [tgt('stand')] },
      { sources: [src(loMunah, 1, 1)], targets: [tgt('not', 3, 3)] },
      { sources: [src(sit)], targets: [tgt('sit')] },
    ];
    const resolve = (quote: string, occurrence = 1) =>
      matchHelpEntryToTokenIndicesByAlignment(tokens, help(quote, occurrence), g);

    it('treats Hebrew words that differ only in accents as different source words', () => {
      expect(resolve(`${loMerkha} ${walk} & ${loMunah} ${sit}`)).toEqual([0, 1, 4, 5]);
      expect(resolve(loMerkha, 2)).toEqual([2]);
    });

    it('resolves a quote to the source word of its own accented form', () => {
      // Both forms have an occurrence 1; each quote gets its own word and nothing of the other.
      expect(resolve(loMerkha, 1)).toEqual([0]);
      expect(resolve(loMunah, 1)).toEqual([4]);
    });

    it('counts occurrences among the source words of the quoted form only', () => {
      expect(resolve(loMerkha, 3)).toEqual([]);
      expect(resolve(loMunah, 2)).toEqual([]);
    });

    it('numbers the occurrences of an accented form by x-occurrence, not by gateway order', () => {
      const reordered = [
        { sources: [src(loMerkha, 2, 2)], targets: [tgt('a')] },
        { sources: [src(loMunah, 1, 1)], targets: [tgt('b')] },
        { sources: [src(loMerkha, 1, 2)], targets: [tgt('c')] },
      ];
      const at = (quote: string, occurrence: number) =>
        matchHelpEntryToTokenIndicesByAlignment(['a', 'b', 'c'], help(quote, occurrence), reordered);
      expect(at(loMerkha, 1)).toEqual([2]);
      expect(at(loMerkha, 2)).toEqual([0]);
      expect(at(loMunah, 1)).toEqual([1]);
    });

    it('numbers an accented form by x-occurrence when an earlier word of that form is not aligned', () => {
      // The first merkha form has no alignment group yet.
      const partial = [
        { sources: [src(loMunah, 1, 1)], targets: [tgt('a')] },
        { sources: [src(loMerkha, 2, 2)], targets: [tgt('b')] },
      ];
      const at = (quote: string, occurrence: number, groups = partial) =>
        matchHelpEntryToTokenIndicesByAlignment(['a', 'b'], help(quote, occurrence), groups);
      expect([1, 2].map((occ) => at(loMerkha, occ))).toEqual([[], [1]]);
      expect(at(loMunah, 1)).toEqual([0]);
      // A quoted form the verse lacks: the two aligned forms are counted in stream order, as
      // their x-occurrences do not compare.
      expect([1, 2, 3].map((occ) => at(loTipcha, occ))).toEqual([[0], [1], []]);
      // With one form aligned, its x-occurrence stands for the quoted word's.
      expect([1, 2].map((occ) => at(loTipcha, occ, partial.slice(1)))).toEqual([[], [1]]);
    });

    it('matches accent-insensitively when the verse lacks the quoted form', () => {
      // Accents drift between versions of the Hebrew text. No form can be preferred, so the
      // occurrences are every «לֹא» in stream order, each with its own gateway token.
      for (const drifted of [loTipcha, loPlain]) {
        expect([1, 2, 3, 4].map((occ) => resolve(drifted, occ))).toEqual([[0], [2], [4], []]);
      }
    });

    it('matches an accented quote against unaccented source words', () => {
      const unaccented = `${loPlain} ${walk} ${loPlain} ${sit}`;
      expect(resolveInStream(unaccented, loMerkha, [1, 2, 3])).toEqual([[0], [2], []]);
      expect(resolveInStream(unaccented, `${loMunah} ${sit}`, [1])).toEqual([[2, 3]]);
    });

    it('compares exact forms regardless of zero-width characters, punctuation and mark order', () => {
      expect(resolve(`\u2060${loMunah},`)).toEqual([4]);
      // The accent typed before the vowel point: the same text once in NFC.
      expect(resolve('\u05DC\u05A3\u05B9\u05D0')).toEqual([4]);
      // A word joiner inside `x-content`, as after a Hebrew prefix, and none in the quote.
      const prefixed = '\u05D5\u05B0';
      expect(resolveInStream(`${loMerkha} ${prefixed}\u2060${loMunah}`, `${prefixed}${loMunah}`, [1])).toEqual([[1]]);
    });

    it('uses the accented form to choose among candidates of a multi-word quote', () => {
      // Accent-insensitively, the tightest placement would take the munah form next to the verb.
      expect(resolveInStream(`${walk} ${loMunah} ${loMerkha}`, `${loMerkha} ${walk}`, [1, 2])).toEqual([[0, 2], []]);
    });

    it('keeps matching the other quote words by exact form when one of them has drifted', () => {
      expect(resolveInStream(`${walk} ${loMunah} ${loMerkha}`, `${loMerkha} ${walkMerkha}`, [1])).toEqual([[0, 2]]);
    });

    it('matches quote words that normalize alike accent-insensitively when one of them has drifted', () => {
      // The second «לֹא» of the quote has an accent the verse lacks, and the verse's form of
      // that word is the form of the quote's first «לֹא»: the forms cannot tell them apart.
      expect(resolve(`${loMerkha} ${walk} ${loTipcha} ${stand}`)).toEqual([0, 1, 2, 3]);
    });

    it('keeps the milestones of a split word together, without a word that only differs in accents', () => {
      const splitTokens = ['did', 'they', 'not', 'walk', 'nor', 'sit'];
      const split = [
        { sources: [src(loMerkha)], targets: [tgt('did')] },
        { sources: [src(walk)], targets: [tgt('they')] },
        { sources: [src(loMerkha)], targets: [tgt('not')] },
        { sources: [src(walk)], targets: [tgt('walk')] },
        { sources: [src(loMunah)], targets: [tgt('nor')] },
        { sources: [src(sit)], targets: [tgt('sit')] },
      ];
      const at = (quote: string, occurrence = 1) =>
        matchHelpEntryToTokenIndicesByAlignment(splitTokens, help(quote, occurrence), split);
      expect(at(loMerkha)).toEqual([0, 2]);
      expect(at(loMerkha, 2)).toEqual([]);
      expect(at(loMunah)).toEqual([4]);
      expect(at(`${loMerkha} ${walk}`)).toEqual([0, 1, 2, 3]);
      // Without the quoted form the split word is still one occurrence, apart from the other form.
      expect([1, 2, 3].map((occ) => at(loTipcha, occ))).toEqual([[0, 2], [4], []]);
    });
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

  it('annotates only the row whose occurrence is aligned in a partially aligned verse', () => {
    const first = help('καί', 1, 'and-1');
    const second = help('καί', 2, 'and-2');
    const ann = annotateTokensByAlignment(partialTokens, [first, second], { [verseSid]: partialGroups }, verseSid);
    expect(ann).toEqual([{ tokenIndex: 1, entries: [second] }]);
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

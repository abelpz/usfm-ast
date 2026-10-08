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

/** Token indices each `occurrence` of `quote` resolves to in a {@link wordStream}. */
function resolveInStream(words: string, quote: string, occurrences: number[]): number[][] {
  const { tokens, groups } = wordStream(words);
  return occurrences.map((occ) => matchHelpEntryToTokenIndicesByAlignment(tokens, help(quote, occ), groups));
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

  it('treats Hebrew words that differ only in accents as different source words', () => {
    // Psalm 1:1 shape. `x-occurrence` counts each accented form on its own, so both forms of
    // «לֹא» have an occurrence 1 although they normalize to the same text.
    const loMerkha = 'לֹ֥א'; // accent merkha (U+05A5)
    const loMunah = 'לֹ֣א'; // accent munah (U+05A3)
    const tokens = ['not', 'walk', 'not', 'stand', 'not', 'sit'];
    const g = [
      { sources: [src(loMerkha, 1, 2)], targets: [tgt('not', 1, 3)] },
      { sources: [src('הָלַךְ')], targets: [tgt('walk')] },
      { sources: [src(loMerkha, 2, 2)], targets: [tgt('not', 2, 3)] },
      { sources: [src('עָמָד')], targets: [tgt('stand')] },
      { sources: [src(loMunah, 1, 1)], targets: [tgt('not', 3, 3)] },
      { sources: [src('יָשָׁב')], targets: [tgt('sit')] },
    ];
    const quote = `${loMerkha} הָלַךְ & ${loMunah} יָשָׁב`;
    expect(matchHelpEntryToTokenIndicesByAlignment(tokens, help(quote), g)).toEqual([0, 1, 4, 5]);
    // The two occurrence numbers 1 belong to different forms and say nothing about their order.
    expect(matchHelpEntryToTokenIndicesByAlignment(tokens, help(loMerkha, 2), g)).toEqual([2]);
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

import { DocumentStore } from '@usfm-tools/editor-core';

import {
  collectTextFromVerseFragments,
  normalizeHelpsText,
  tokenCharRangesInPlainText,
  tokenizeVersePlainText,
  versePlainTextFromStore,
} from '../src/helps/verse-text';

describe('collectTextFromVerseFragments', () => {
  it('concatenates string and nested text', () => {
    const text = collectTextFromVerseFragments([
      'Hello ',
      { type: 'char', content: ['world'] },
      { type: 'note', content: ['skip'] },
    ]);
    expect(text).toBe('Hello world');
  });
});

describe('normalizeHelpsText', () => {
  it('NFC-trims and collapses whitespace', () => {
    expect(normalizeHelpsText('  a  \t b  ')).toBe('a b');
  });

  it('strips Hebrew cantillation marks (taamim) but keeps vowel points', () => {
    // וַיְהִי with pashta ֙ (U+0599) and meteg ֽ (U+05BD) → stripped to vowelled form
    const withAccents = 'וַֽיְהִי֙';
    const norm = normalizeHelpsText(withAccents);
    expect(norm).not.toMatch(/[\u0591-\u05AF\u05BD]/); // no cantillation
    expect(norm).toContain('ו'); // consonants remain
  });

  it('strips zero-width joiners from Hebrew maqef-linked phrases', () => {
    // Word joiner U+2060 appears between maqef-joined words in some TN TSVs
    const withJoiner = 'דְּבַר\u2060יְהוָה';
    const norm = normalizeHelpsText(withJoiner);
    expect(norm).not.toContain('\u2060');
  });

  it('maqef (U+05BE) is replaced with space so maqef-joined words become separate tokens', () => {
    // "word of Yahweh" in Hebrew: the maqef connects two separate lexical words
    const withMaqef = 'דְּבַר\u05BEיְהוָה';
    const norm = normalizeHelpsText(withMaqef);
    expect(norm).toBe('דְּבַר יְהוָה');
    expect(norm.split(/\s+/).filter(Boolean)).toHaveLength(2);
  });

  it('matches TN Hebrew quote (with cantillation + maqef) to alignment word list', () => {
    // TN quote as found in en_tn_JON.tsv: cantillation marks, word-joiner (U+2060), maqef (U+05BE)
    const tnQuote = 'וַֽ\u2060יְהִי֙ דְּבַר\u05BEיְהוָ\u05BD\u0594ה';
    const normQuote = normalizeHelpsText(tnQuote);
    // Cantillation stripped, word-joiner stripped, meteg stripped, maqef → space
    expect(normQuote).not.toMatch(/[\u0591-\u05AF\u05BD]/);
    expect(normQuote).not.toContain('\u2060');
    // Result should be three separate words that match alignment AlignedWord.content
    const words = normQuote.split(/\s+/).filter(Boolean);
    expect(words).toContain('וַיְהִי');
    expect(words).toContain('דְּבַר');
    expect(words).toContain('יְהוָה');
  });
});

describe('tokenizeVersePlainText', () => {
  it('splits on whitespace', () => {
    expect(tokenizeVersePlainText('  a b c  ')).toEqual(['a', 'b', 'c']);
  });
});

describe('tokenCharRangesInPlainText', () => {
  it('returns ranges in trimmed plain matching tokenize order', () => {
    const plain = '  a  bb c  ';
    const tokens = tokenizeVersePlainText(plain);
    const ranges = tokenCharRangesInPlainText(plain);
    expect(tokens).toEqual(['a', 'bb', 'c']);
    expect(ranges).toEqual([
      { start: 0, end: 1 },
      { start: 3, end: 5 },
      { start: 6, end: 7 },
    ]);
    const t = plain.trim();
    for (let i = 0; i < tokens.length; i++) {
      expect(t.slice(ranges[i]!.start, ranges[i]!.end)).toBe(tokens[i]);
    }
  });
});

describe('versePlainTextFromStore', () => {
  it('reads verse text from loaded USFM', () => {
    const usfm = `\\id TIT EN_ULT
\\c 1
\\p
\\v 1 Paul, a servant of God
`;
    const store = new DocumentStore({ silentConsole: true });
    store.loadUSFM(usfm);
    const plain = versePlainTextFromStore(store, 1, 1);
    expect(plain).toContain('Paul');
    expect(plain).toContain('servant');
  });

  it('spaces adjacent \\w tokens in aligned USFM (no literal space between \\w nodes)', () => {
    // Aligned USFM where two \\w nodes share one zaln-s with no explicit space node between them.
    // Prior bug: "the" + "word" → "theword" (joined with no space).
    const usfm = [
      '\\id TIT',
      '\\c 1',
      '\\p',
      '\\v 1 \\zaln-s |x-strong="H1697" x-content="dcr" x-occurrence="1" x-occurrences="1"\\*' +
        '\\w the|x-occurrence="1" x-occurrences="1"\\w*' +
        '\\w word|x-occurrence="1" x-occurrences="1"\\w*' +
        '\\zaln-e\\*',
    ].join('\n');
    const store = new DocumentStore({ silentConsole: true });
    store.loadUSFM(usfm);
    const plain = versePlainTextFromStore(store, 1, 1);
    // Must not be concatenated without a space
    expect(plain).not.toContain('theword');
    // Both tokens must be individually present
    const tokens = plain.trim().split(/\s+/);
    expect(tokens).toContain('the');
    expect(tokens).toContain('word');
  });
});

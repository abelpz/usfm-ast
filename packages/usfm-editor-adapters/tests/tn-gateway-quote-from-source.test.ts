import { DocumentStore } from '@usfm-tools/editor-core';

import { alignedGatewayQuoteForHelp } from '../src/helps/alignment-annotate';
import { parseTnTsv } from '../src/helps/twl-tn-loaders';
import { normalizeHelpsText, tokenizeVersePlainText, versePlainTextFromStore } from '../src/helps/verse-text';

/** unfoldingWord-style TN header: Quote + Occurrence map to HelpEntry.origWords / occurrence */
const TN_HEADER = `Reference	ID	Tags	SupportReference	Quote	Occurrence	Note`;

const SAMPLE_USFM = String.raw`\id JON EN_ULT
\c 1
\p
\v 1 And the word of Yahweh came to Jonah son of Amittai, saying,
`;

describe('TN gateway quote from source (USFM / USJ + parseTnTsv)', () => {
  it('builds the displayed gateway quote from source verse tokens for a parsed TN row (USFM)', () => {
    const store = new DocumentStore({ silentConsole: true });
    store.loadUSFM(SAMPLE_USFM);

    const plain = versePlainTextFromStore(store, 1, 1);
    const tokens = tokenizeVersePlainText(plain);
    expect(tokens.join(' ')).toContain('the');
    expect(tokens.join(' ')).toContain('word');

    const tsv = `${TN_HEADER}
1:1	n1	kt	rc://*/ta/translate/mantranslate1	the word of Yahweh	1	Story introduction
`;
    const [tn] = parseTnTsv(tsv);
    expect(tn).toBeDefined();
    expect(tn!.resourceType).toMatch(/note/i);

    const gateway = alignedGatewayQuoteForHelp(store, tn!);
    expect(gateway).toBe('the word of Yahweh');
  });

  it('matches the same TN quote when the document was loaded from USJ produced by getFullUSJ()', () => {
    const fromUsfm = new DocumentStore({ silentConsole: true });
    fromUsfm.loadUSFM(SAMPLE_USFM);
    const usj = fromUsfm.getFullUSJ();

    const fromUsj = new DocumentStore({ silentConsole: true });
    fromUsj.loadUSJ(usj);

    const plainUsfm = versePlainTextFromStore(fromUsfm, 1, 1);
    const plainUsj = versePlainTextFromStore(fromUsj, 1, 1);
    expect(plainUsj.replace(/\s+/g, ' ').trim()).toBe(plainUsfm.replace(/\s+/g, ' ').trim());

    const tsv = `${TN_HEADER}
1:1	n1	kt	rc://*/ta/translate/mantranslate1	the word of Yahweh	1	Story introduction
`;
    const [tn] = parseTnTsv(tsv);
    expect(alignedGatewayQuoteForHelp(fromUsj, tn!)).toBe('the word of Yahweh');
  });

  it('matches a Hebrew TN Quote (with cantillation marks) directly against a Hebrew OL source', () => {
    // Simulates loading WHB / UHB as the "source" store (no alignment needed — direct OL match).
    // Load via USJ directly to avoid the USFM parser misidentifying Hebrew Unicode codepoints
    // as USFM marker names when parsing raw Hebrew verse content.
    //
    // Hebrew words (vowel-pointed, no cantillation or maqef):
    //   \u05D5\u05B7\u05D9\u05B0\u05D4\u05B4\u05D9 = וַיְהִי
    //   \u05D3\u05B0\u05BC\u05D1\u05B7\u05E8       = דְּבַר
    //   \u05D9\u05B0\u05D4\u05D5\u05B8\u05D4       = יְהוָה
    const vayehi = '\u05D5\u05B7\u05D9\u05B0\u05D4\u05B4\u05D9';
    const davar  = '\u05D3\u05B0\u05BC\u05D1\u05B7\u05E8';
    const yhwh   = '\u05D9\u05B0\u05D4\u05D5\u05B8\u05D4';
    const hebrewVerseText = `${vayehi} ${davar} ${yhwh}`;

    const hebrewUsj = {
      type: 'USJ' as const,
      version: '3.1',
      content: [
        { type: 'book', marker: 'id', code: 'JON', content: ['JON HEB'] },
        { type: 'chapter', marker: 'c', number: '1', sid: 'JON 1' },
        {
          type: 'para',
          marker: 'p',
          content: [
            { type: 'verse', marker: 'v', number: '1', sid: 'JON 1:1' },
            hebrewVerseText,
          ],
        },
      ],
    };
    const store = new DocumentStore({ silentConsole: true });
    store.loadUSJ(hebrewUsj);

    // TN Quote with cantillation + maqef as in en_tn_JON.tsv:
    //   \u05D5\u05B7\u05BD\u2060\u05D9\u05B0\u05D4\u05B4\u05D9\u0599 = וַֽ⁠יְהִי֙
    //   \u05D3\u05B0\u05BC\u05D1\u05B7\u05E8\u05BE               = דְּבַר־ (with maqef)
    //   \u05D9\u05B0\u05D4\u05D5\u05B8\u0594\u05D4               = יְהוָ֔ה (with accent)
    const tnQuoteWithAccents =
      '\u05D5\u05B7\u05BD\u2060\u05D9\u05B0\u05D4\u05B4\u05D9\u0599' +
      ' ' +
      '\u05D3\u05B0\u05BC\u05D1\u05B7\u05E8\u05BE' +
      '\u05D9\u05B0\u05D4\u05D5\u05B8\u0594\u05D4';

    const tsv = `${TN_HEADER}
1:1\tn1\tkt\trc://*/ta/translate/writing-newevent\t${tnQuoteWithAccents}\t1\tstory intro
`;
    const [tn] = parseTnTsv(tsv);

    // Verify normalizeHelpsText strips cantillation from the quote
    const normQuote = normalizeHelpsText(tnQuoteWithAccents);
    expect(normQuote).not.toMatch(/[\u0591-\u05AF\u05BD]/);
    // maqef (U+05BE) → space: should produce three separate words
    const normWords = normQuote.split(/\s+/).filter(Boolean);
    expect(normWords).toContain(vayehi);
    expect(normWords).toContain(davar);
    expect(normWords).toContain(yhwh);

    const gateway = alignedGatewayQuoteForHelp(store, tn!);
    // Should match against the Hebrew source tokens (direct OL match via normalised quote)
    expect(gateway).not.toBeNull();
    expect(gateway).toContain(vayehi);
  });

  it('resolves Hebrew TN origWords to English via zaln-s alignment in the source', () => {
    // Aligned ULT-style source: zaln-s milestones + \w nodes with occurrence attributes.
    // The bug was that adjacent \w nodes (no literal space between them) were concatenated
    // as "theword" instead of "the word", making mapTargetToTokenIndex fail.
    const alignedUsfm = [
      '\\id JON EN_ULT',
      '\\c 1',
      '\\p',
      '\\v 1 ' +
        '\\zaln-s |x-strong="H1961" x-morph="He,VqX3ms" x-occurrence="1" x-occurrences="1" x-content="וַיְהִי"\\*' +
        '\\w And|x-occurrence="1" x-occurrences="1"\\w* ' +
        '\\w came|x-occurrence="1" x-occurrences="1"\\w*' +
        '\\zaln-e\\* ' +
        '\\zaln-s |x-strong="H1697" x-morph="He,Ncmsc" x-occurrence="1" x-occurrences="1" x-content="דְּבַר"\\*' +
        '\\w the|x-occurrence="1" x-occurrences="1"\\w*' +
        '\\w word|x-occurrence="1" x-occurrences="1"\\w*' +
        '\\zaln-e\\* ' +
        '\\zaln-s |x-strong="H3068" x-morph="He,Np" x-occurrence="1" x-occurrences="1" x-content="יְהוָה"\\*' +
        '\\w of|x-occurrence="1" x-occurrences="1"\\w* ' +
        '\\w Yahweh|x-occurrence="1" x-occurrences="1"\\w*' +
        '\\zaln-e\\*',
    ].join('\n');

    const store = new DocumentStore({ silentConsole: true });
    store.loadUSFM(alignedUsfm);

    // Confirm spacing fix: tokens should be separate words, not concatenated
    const plain = versePlainTextFromStore(store, 1, 1);
    expect(plain).not.toContain('theword');
    const tokens = tokenizeVersePlainText(plain);
    expect(tokens).toContain('the');
    expect(tokens).toContain('word');

    // TN origWords: the full Hebrew phrase (with cantillation), should map to English via alignment
    const tnQuote = 'וַֽ\u2060יְהִי֙ דְּבַר\u05BEיְהוָ֔ה';
    const tsv = `${TN_HEADER}
1:1\tn1\tkt\trc://*/ta/translate/writing-newevent\t${tnQuote}\t1\tstory intro
`;
    const [tn] = parseTnTsv(tsv);
    const gateway = alignedGatewayQuoteForHelp(store, tn!);

    // Should resolve to the English gateway words aligned to those three Hebrew words
    expect(gateway).not.toBeNull();
    expect(gateway).toContain('word');    // from דְּבַר → "the word"
    expect(gateway).toContain('Yahweh'); // from יְהוָה → "of Yahweh"
  });

  it('respects TN Occurrence when the same Quote appears twice in the verse', () => {
    const usfm = String.raw`\id JON EN_ULT
\c 1
\p
\v 1 Jonah fled. The ship sailed. Jonah slept below.
`;
    const store = new DocumentStore({ silentConsole: true });
    store.loadUSFM(usfm);

    const tsv = `${TN_HEADER}
1:1	n1	kt	rc://*/ta/translate/mantranslate1	Jonah	2	Second mention
`;
    const [tn] = parseTnTsv(tsv);
    const gateway = alignedGatewayQuoteForHelp(store, tn!);
    expect(gateway).toBe('Jonah');
    const plain = versePlainTextFromStore(store, 1, 1);
    const hits = [...plain.matchAll(/Jonah/g)];
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });
});

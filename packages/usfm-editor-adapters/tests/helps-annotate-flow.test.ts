import { annotateTokensByQuote, filterHelpsForVerse, parseTwlTsv } from '../src/helps';
import { tokenizeVersePlainText, versePlainTextFromStore } from '../src/helps/verse-text';
import { DocumentStore } from '@usfm-tools/editor-core';

describe('helps annotate flow (TWL + verse text)', () => {
  it('underlines matching Greek token with occurrence', () => {
    const usfm = `\\id TIT EL_UGNT
\\c 1
\\p
\\v 1 Παῦλος δοῦλος Θεοῦ
`;
    const store = new DocumentStore({ silentConsole: true });
    store.loadUSFM(usfm);
    const plain = versePlainTextFromStore(store, 1, 1);
    const tokens = tokenizeVersePlainText(plain);
    expect(tokens.length).toBeGreaterThanOrEqual(3);

    const twl = parseTwlTsv(`Reference	ID	Tags	OrigWords	Occurrence	SupportReference
1:1	abc	kt	Παῦλος	1	rc://*/tw/dict/bible/names/paul
`);
    const helps = filterHelpsForVerse(twl, 1, 1);
    const ann = annotateTokensByQuote(tokens, helps);
    expect(ann.some((a) => a.tokenIndex === 0 && a.entries.some((e) => e.origWords === 'Παῦλος'))).toBe(true);
  });
});

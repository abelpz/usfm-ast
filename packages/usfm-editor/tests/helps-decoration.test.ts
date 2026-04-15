/** @jest-environment jsdom */

import { DocumentStore } from '@usfm-tools/editor-core';
import type { HelpEntry } from '@usfm-tools/types';

import { buildHelpsDecorationSet } from '../src/helps-decoration';
import { chapterSubsetToPm } from '../src/usj-to-pm';

function helpsDecos(set: ReturnType<typeof buildHelpsDecorationSet>) {
  return set.find().filter((d) => {
    const attrs = (d as unknown as { type: { attrs?: { class?: string } } }).type.attrs;
    return Boolean(attrs?.class?.includes('usfm-helps-deco'));
  });
}

function twlEntry(id: string, ch: number, v: number, origWords: string, occurrence = 1): HelpEntry {
  return {
    id,
    resourceType: 'twl',
    ref: { chapter: ch, verse: v },
    origWords,
    occurrence,
    content: '',
  };
}

/** parseTwlTsv sets resourceType to 'words-links', not 'twl'. */
function parsedTwlEntry(id: string, ch: number, v: number, origWords: string, occurrence = 1): HelpEntry {
  return { ...twlEntry(id, ch, v, origWords, occurrence), resourceType: 'words-links' };
}

describe('buildHelpsDecorationSet', () => {
  it('adds inline decorations on gateway tokens that match TWL origWords', () => {
    const usfm = `\\id TIT EL_UGNT
\\c 1
\\p
\\v 1 Παῦλος δοῦλος Θεοῦ
`;
    const store = new DocumentStore({ silentConsole: true });
    store.loadUSFM(usfm);
    const doc = chapterSubsetToPm(store, {
      visibleChapters: [1],
      showIntroduction: false,
      contextChapters: 0,
    });
    const twl = [twlEntry('abc', 1, 1, 'Παῦλος', 1)];
    const set = buildHelpsDecorationSet(doc, store, twl, []);
    const found = helpsDecos(set);
    expect(found.length).toBeGreaterThan(0);
    const deco = found[0]!;
    const text = doc.textBetween(deco.from, deco.to);
    expect(text).toBe('Παῦλος');
  });

  it('applies usfm-helps-twl class when resourceType is "words-links" (parseTwlTsv output)', () => {
    // Regression: helpClasses used /twl/i which did not match the 'words-links' resourceType
    // set by parseTwlTsv — so TWL entries got no underline styling.
    const usfm = String.raw`\id TIT EN
\c 1
\p
\v 1 Titus servant
`;
    const store = new DocumentStore({ silentConsole: true });
    store.loadUSFM(usfm);
    const doc = chapterSubsetToPm(store, { visibleChapters: [1], showIntroduction: false, contextChapters: 0 });
    const twl = [parsedTwlEntry('w1', 1, 1, 'Titus', 1)];
    const set = buildHelpsDecorationSet(doc, store, twl, []);
    const found = helpsDecos(set);
    expect(found.length).toBeGreaterThan(0);
    const cls = (found[0] as unknown as { type: { attrs?: { class?: string } } }).type.attrs?.class ?? '';
    expect(cls).toContain('usfm-helps-twl');
    expect(cls).not.toContain('usfm-helps-tn');
  });

  it('decorates verse 1 when a section heading appears before \\v 1 (heading must not pollute assembled text)', () => {
    // Regression: collectVerseTextPieces started currentVerse=1, so heading text like "Chapter 1"
    // was concatenated into verse 1's assembled text, making it longer than storePlain and
    // causing the normalizePlain check to fail — verse 1 got zero decorations.
    const usfm = String.raw`\id TIT EN
\c 1
\s Chapter heading
\p
\v 1 Paul servant of God
`;
    const store = new DocumentStore({ silentConsole: true });
    store.loadUSFM(usfm);
    const doc = chapterSubsetToPm(store, { visibleChapters: [1], showIntroduction: false, contextChapters: 0 });
    const twl = [twlEntry('w1', 1, 1, 'Paul', 1)];
    const set = buildHelpsDecorationSet(doc, store, twl, []);
    const found = helpsDecos(set);
    expect(found.length).toBeGreaterThan(0);
    const deco = found[0]!;
    const text = doc.textBetween(deco.from, deco.to);
    expect(text).toBe('Paul');
  });

  it('still matches verse text when a footnote sits between words', () => {
    const usfm = String.raw`\id TIT EN
\c 1
\p
\v 1 Hello \f + \fr 1.1 \ft gloss\f* world.
`;
    const store = new DocumentStore({ silentConsole: true });
    store.loadUSFM(usfm);
    const doc = chapterSubsetToPm(store, {
      visibleChapters: [1],
      showIntroduction: false,
      contextChapters: 0,
    });
    const twl = [twlEntry('w1', 1, 1, 'Hello', 1)];
    const set = buildHelpsDecorationSet(doc, store, twl, []);
    const found = helpsDecos(set);
    expect(found.length).toBeGreaterThan(0);
    const deco = found[0]!;
    const text = doc.textBetween(deco.from, deco.to);
    expect(text).toBe('Hello');
  });
});

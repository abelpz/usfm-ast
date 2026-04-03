'use strict';

/**
 * Footnote with a nested character marker (`\\bd`) inside `\\fqa` content.
 * @see https://docs.usfm.bible/usfm/3.1/char/nesting.html
 * @see https://docs.usfm.bible/usfm/3.1/char/notes/footnote/index.html
 */

const noteNestedBdInFqa = {
  type: 'note',
  marker: 'f',
  content: [
    {
      marker: 'fr',
      content: ['1:13 '],
      type: 'char',
    },
    {
      marker: 'ft',
      content: ['Hebrew '],
      type: 'char',
    },
    {
      marker: 'fqa',
      content: [
        'the ',
        { type: 'char', marker: 'bd', content: ['men'] },
        ' dug in',
      ],
      type: 'char',
    },
  ],
  caller: '+',
};

/** Argument shape for {@link import('@usfm-tools/adapters').convertUSJDocumentToUSFM}. */
const usjDocumentContent = [{ type: 'para', marker: 'p', content: [noteNestedBdInFqa] }];

/** Canonical USFM from the stack’s visitor (no `+` on nested character markers). */
const canonicalUsfmFromVisitor =
  '\\p \\f + \\fr 1:13 \\ft Hebrew \\fqa the \\bd men\\bd* dug in\\f*';

/** Legacy nesting: `\\+bd` opens/closes the same USJ; visitor normalizes to {@link canonicalUsfmFromVisitor}. */
const alternateUsfmLegacyPlusPrefix =
  '\\p \\f + \\fr 1:13 \\ft Hebrew \\fqa the \\+bd men\\+bd* dug in\\f*';

module.exports = {
  noteNestedBdInFqa,
  usjDocumentContent,
  canonicalUsfmFromVisitor,
  alternateUsfmLegacyPlusPrefix,
};




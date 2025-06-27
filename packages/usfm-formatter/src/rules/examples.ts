/**
 * Example USFM formatting rules demonstrating advanced features
 *
 * These examples show how to use context conditions, patterns, and other
 * advanced rule features for custom USFM formatting.
 */

import { MarkerTypeEnum } from '@usfm-tools/types';
import { USFMFormattingRule } from './types';

/**
 * Example: Context-aware verse formatting
 * Verses after chapters get a space, verses after paragraphs get a newline
 */
export const contextualVerseRule: USFMFormattingRule = {
  id: 'verse-after-chapter',
  name: 'Verse After Chapter',
  description: 'Special spacing for verses after chapters',
  priority: 120,
  applies: {
    marker: 'v',
    type: MarkerTypeEnum.CHARACTER,
    context: {
      previousMarker: 'c',
    },
  },
  whitespace: {
    before: ' ', // Space, not newline after chapter
    after: ' ',
  },
};

/**
 * Example: Pattern-based rules for list items
 */
export const listItemRule: USFMFormattingRule = {
  id: 'list-items',
  name: 'List Item Spacing',
  description: 'Consistent spacing for list items',
  priority: 80,
  applies: {
    pattern: /^li\d*$/, // li, li1, li2, etc.
    type: MarkerTypeEnum.PARAGRAPH,
  },
  whitespace: {
    before: '\n',
    after: ' ',
  },
};

/**
 * Example: Multiple previous marker conditions
 */
export const verseAfterMultipleRule: USFMFormattingRule = {
  id: 'verse-after-multiple',
  name: 'Verse After Multiple Markers',
  description: 'Verse spacing after various structural markers',
  priority: 100,
  applies: {
    marker: 'v',
    type: MarkerTypeEnum.CHARACTER,
    context: {
      previousMarker: ['c', 's', 's1', 's2'], // Chapter or section markers
    },
  },
  whitespace: {
    before: '\n',
    after: ' ',
  },
};

/**
 * Example: Poetry context rules
 */
export const verseInPoetryRule: USFMFormattingRule = {
  id: 'verse-in-poetry',
  name: 'Verse in Poetry Context',
  description: 'Special verse formatting in poetry sections',
  priority: 110,
  applies: {
    marker: 'v',
    type: MarkerTypeEnum.CHARACTER,
    context: {
      ancestorMarkers: ['q', 'q1', 'q2'], // In poetry context
    },
  },
  whitespace: {
    before: '\n',
    after: ' ',
  },
};

/**
 * Example: Document start rule
 */
export const documentStartRule: USFMFormattingRule = {
  id: 'document-start-id',
  name: 'Document Start ID',
  description: 'ID marker at document start has no preceding whitespace',
  priority: 150,
  applies: {
    marker: 'id',
    type: MarkerTypeEnum.PARAGRAPH,
    context: {
      isDocumentStart: true,
    },
  },
  whitespace: {
    before: '', // No whitespace before document start
    after: ' ',
  },
};

/**
 * Example: Content-based rule
 */
export const shortVerseRule: USFMFormattingRule = {
  id: 'short-verse-inline',
  name: 'Short Verse Inline',
  description: 'Short verses stay inline with paragraph',
  priority: 90,
  applies: {
    marker: 'v',
    type: MarkerTypeEnum.CHARACTER,
    context: {
      hasContent: true,
      contentPattern: /^.{1,20}$/, // Content 20 chars or less
    },
  },
  whitespace: {
    before: ' ',
    after: ' ',
  },
};

/**
 * Example: Chapter with different spacing based on next marker
 */
export const chapterWithVerseRule: USFMFormattingRule = {
  id: 'chapter-with-verse',
  name: 'Chapter Followed by Verse',
  description: 'Chapter markers followed directly by verses',
  priority: 130,
  applies: {
    marker: 'c',
    type: MarkerTypeEnum.CHARACTER,
    context: {
      nextMarker: 'v',
    },
  },
  whitespace: {
    before: '\n\n',
    after: ' ', // Single space before verse
  },
};

/**
 * Example rule set for Bible translation formatting
 */
export const bibleTranslationRules: USFMFormattingRule[] = [
  {
    id: 'chapter-breaks',
    name: 'Chapter Breaks',
    description: 'Chapters with double line breaks',
    priority: 100,
    applies: { marker: 'c', type: MarkerTypeEnum.CHARACTER },
    whitespace: { before: '\n\n', after: ' ' },
  },
  {
    id: 'verse-inline',
    name: 'Inline Verses',
    description: 'Verses inline with text',
    priority: 90,
    applies: { marker: 'v', type: MarkerTypeEnum.CHARACTER },
    whitespace: { before: ' ', after: ' ' },
  },
  {
    id: 'paragraph-standard',
    name: 'Standard Paragraphs',
    description: 'Paragraphs on new lines',
    priority: 80,
    applies: { marker: 'p', type: MarkerTypeEnum.PARAGRAPH },
    whitespace: { before: '\n', after: '' },
  },
  {
    id: 'poetry-lines',
    name: 'Poetry Lines',
    description: 'Poetry with consistent spacing',
    priority: 85,
    applies: { pattern: /^q\d*$/, type: MarkerTypeEnum.PARAGRAPH },
    whitespace: { before: '\n', after: ' ' },
  },
];

/**
 * Example rule set for study Bible formatting
 */
export const studyBibleRules: USFMFormattingRule[] = [
  {
    id: 'study-chapter-major',
    name: 'Study Bible Chapter Major Breaks',
    description: 'Major breaks before chapters in study Bible',
    priority: 120,
    applies: { marker: 'c', type: MarkerTypeEnum.CHARACTER },
    whitespace: { before: '\n\n\n', after: '\n' },
  },
  {
    id: 'study-verse-block',
    name: 'Study Bible Block Verses',
    description: 'Block verses for easier annotation',
    priority: 110,
    applies: { marker: 'v', type: MarkerTypeEnum.CHARACTER },
    whitespace: { before: '\n', after: ' ' },
  },
  {
    id: 'study-section-breaks',
    name: 'Study Bible Section Breaks',
    description: 'Section headings with extra spacing',
    priority: 100,
    applies: { pattern: /^s\d*$/, type: MarkerTypeEnum.PARAGRAPH },
    whitespace: { before: '\n\n', after: '\n' },
  },
];

/**
 * All example rules combined
 */
export const allExampleRules: USFMFormattingRule[] = [
  contextualVerseRule,
  listItemRule,
  verseAfterMultipleRule,
  verseInPoetryRule,
  documentStartRule,
  shortVerseRule,
  chapterWithVerseRule,
  ...bibleTranslationRules,
  ...studyBibleRules,
];

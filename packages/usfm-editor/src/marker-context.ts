/**
 * USFM document-structure context for paragraph markers (which markers are valid
 * in identification headers, book titles, introduction, vs chapter body).
 *
 * Derived from the USFM document model — see https://docs.usfm.bible/usfm/latest/doc/index.html
 */

import type { EditorState } from 'prosemirror-state';

/** Logical editing region matching major USFM divisions. */
export type EditorSection = 'header' | 'book_titles' | 'book_introduction' | 'chapter';

/**
 * Marker palette depth: **basic** (draft / minimal), **medium** (friendly labels), **advanced** (all USFM).
 */
export type EditorMode = 'basic' | 'medium' | 'advanced';

export interface MarkerChoice {
  marker: string;
  label: string;
  /** UI grouping (headings, body, poetry, list, …). */
  category?: string;
}

/** One simplified “friendly” control mapped to concrete USFM per {@link EditorSection}. */
export interface ContextAwareMarkerDef {
  label: string;
  category: string;
  /** Target marker for each section (omit a section to skip that row there). */
  bySection: Partial<Record<EditorSection, string>>;
}

/**
 * Non-technical labels that map to different USFM markers depending on where the caret is.
 * Rows with no mapping for the current section are omitted by {@link getSimplifiedMarkerChoices}.
 */
/**
 * Minimal paragraph-style markers for a valid scripture draft (one row per section).
 */
export const BASIC_MARKERS: ContextAwareMarkerDef[] = [
  {
    label: 'Paragraph',
    category: 'Basic',
    bySection: {
      header: 'h',
      book_titles: 'mt',
      book_introduction: 'ip',
      chapter: 'p',
    },
  },
];

export const CONTEXT_AWARE_MARKERS: ContextAwareMarkerDef[] = [
  {
    label: 'Paragraph',
    category: 'Common',
    bySection: {
      header: 'h',
      book_titles: 'mt',
      book_introduction: 'ip',
      chapter: 'p',
    },
  },
  {
    label: 'Heading',
    category: 'Common',
    bySection: {
      header: 'toc1',
      book_titles: 'mt1',
      book_introduction: 'is1',
      chapter: 's1',
    },
  },
  {
    label: 'Poetry line 1',
    category: 'Common',
    bySection: {
      header: 'rem',
      book_titles: 'mt2',
      book_introduction: 'iq1',
      chapter: 'q1',
    },
  },
  {
    label: 'Poetry line 2',
    category: 'Common',
    bySection: {
      header: 'sts',
      book_titles: 'mte',
      book_introduction: 'iq2',
      chapter: 'q2',
    },
  },
  {
    label: 'List item 1',
    category: 'Common',
    bySection: {
      header: 'toc2',
      book_titles: 'imt',
      book_introduction: 'ili1',
      chapter: 'li1',
    },
  },
  {
    label: 'List item 2',
    category: 'Common',
    bySection: {
      header: 'toc3',
      book_titles: 'imt1',
      book_introduction: 'ili2',
      chapter: 'li2',
    },
  },
  {
    label: 'Blank line',
    category: 'Common',
    bySection: {
      header: 'toca1',
      book_titles: 'imt2',
      book_introduction: 'ib',
      chapter: 'b',
    },
  },
  {
    label: 'Indented paragraph',
    category: 'Common',
    bySection: {
      header: 'toca2',
      book_titles: 'rem',
      book_introduction: 'ipi',
      chapter: 'pi',
    },
  },
];

const HEADER: MarkerChoice[] = [
  { marker: 'ide', label: 'Encoding (\\ide)', category: 'Identification' },
  { marker: 'h', label: 'Short title (\\h)', category: 'Identification' },
  { marker: 'toc1', label: 'Long TOC (\\toc1)', category: 'Identification' },
  { marker: 'toc2', label: 'Short TOC (\\toc2)', category: 'Identification' },
  { marker: 'toc3', label: 'Book abbreviation (\\toc3)', category: 'Identification' },
  { marker: 'toca1', label: 'Long TOC alt (\\toca1)', category: 'Identification' },
  { marker: 'toca2', label: 'Short TOC alt (\\toca2)', category: 'Identification' },
  { marker: 'toca3', label: 'Abbrev. alt (\\toca3)', category: 'Identification' },
  { marker: 'rem', label: 'Remark (\\rem)', category: 'Identification' },
  { marker: 'sts', label: 'Text status (\\sts)', category: 'Identification' },
];

const BOOK_TITLES: MarkerChoice[] = [
  { marker: 'mt', label: 'Main title (\\mt)', category: 'Titles' },
  { marker: 'mt1', label: 'Main title 1 (\\mt1)', category: 'Titles' },
  { marker: 'mt2', label: 'Main title 2 (\\mt2)', category: 'Titles' },
  { marker: 'mt3', label: 'Main title 3 (\\mt3)', category: 'Titles' },
  { marker: 'mte', label: 'Main title end (\\mte)', category: 'Titles' },
  { marker: 'imt', label: 'Intro main title (\\imt)', category: 'Titles' },
  { marker: 'imt1', label: 'Intro main title 1 (\\imt1)', category: 'Titles' },
  { marker: 'imt2', label: 'Intro main title 2 (\\imt2)', category: 'Titles' },
  { marker: 'rem', label: 'Remark (\\rem)', category: 'Titles' },
];

const BOOK_INTRO: MarkerChoice[] = [
  { marker: 'imt', label: 'Intro title (\\imt)', category: 'Intro headings' },
  { marker: 'imt1', label: 'Intro title 1 (\\imt1)', category: 'Intro headings' },
  { marker: 'imt2', label: 'Intro title 2 (\\imt2)', category: 'Intro headings' },
  { marker: 'imte', label: 'Intro title end (\\imte)', category: 'Intro headings' },
  { marker: 'imte1', label: 'Intro title end 1 (\\imte1)', category: 'Intro headings' },
  { marker: 'imte2', label: 'Intro title end 2 (\\imte2)', category: 'Intro headings' },
  { marker: 'ib', label: 'Intro blank line (\\ib)', category: 'Intro body' },
  { marker: 'ie', label: 'Intro end (\\ie)', category: 'Intro body' },
  { marker: 'ili', label: 'Intro list (\\ili)', category: 'Lists' },
  { marker: 'ili1', label: 'Intro list 1 (\\ili1)', category: 'Lists' },
  { marker: 'ili2', label: 'Intro list 2 (\\ili2)', category: 'Lists' },
  { marker: 'imi', label: 'Intro margin (\\imi)', category: 'Intro body' },
  { marker: 'imq', label: 'Intro margin quote (\\imq)', category: 'Intro body' },
  { marker: 'im', label: 'Intro paragraph (\\im)', category: 'Intro body' },
  { marker: 'io', label: 'Intro outline (\\io)', category: 'Outline' },
  { marker: 'io1', label: 'Intro outline 1 (\\io1)', category: 'Outline' },
  { marker: 'io2', label: 'Intro outline 2 (\\io2)', category: 'Outline' },
  { marker: 'iot', label: 'Intro outline title (\\iot)', category: 'Outline' },
  { marker: 'ipi', label: 'Intro indented (\\ipi)', category: 'Intro body' },
  { marker: 'ipq', label: 'Intro poetic (\\ipq)', category: 'Intro body' },
  { marker: 'ipr', label: 'Intro right-aligned (\\ipr)', category: 'Intro body' },
  { marker: 'ip', label: 'Intro paragraph (\\ip)', category: 'Intro body' },
  { marker: 'iq', label: 'Intro poetic line (\\iq)', category: 'Poetry' },
  { marker: 'iq1', label: 'Intro poetic 1 (\\iq1)', category: 'Poetry' },
  { marker: 'iq2', label: 'Intro poetic 2 (\\iq2)', category: 'Poetry' },
  { marker: 'is', label: 'Intro section (\\is)', category: 'Sections' },
  { marker: 'is1', label: 'Intro section 1 (\\is1)', category: 'Sections' },
  { marker: 'is2', label: 'Intro section 2 (\\is2)', category: 'Sections' },
  { marker: 'iex', label: 'Intro expository (\\iex)', category: 'Intro body' },
  { marker: 'rem', label: 'Remark (\\rem)', category: 'Intro body' },
  { marker: 'lit', label: 'Liturgical note (\\lit)', category: 'Intro body' },
];

const CHAPTER_SECTION: MarkerChoice[] = [
  { marker: 's', label: 'Section (\\s)', category: 'Section / heading' },
  { marker: 's1', label: 'Section 1 (\\s1)', category: 'Section / heading' },
  { marker: 's2', label: 'Section 2 (\\s2)', category: 'Section / heading' },
  { marker: 's3', label: 'Section 3 (\\s3)', category: 'Section / heading' },
  { marker: 'ms', label: 'Major section (\\ms)', category: 'Section / heading' },
  { marker: 'ms1', label: 'Major section 1 (\\ms1)', category: 'Section / heading' },
  { marker: 'ms2', label: 'Major section 2 (\\ms2)', category: 'Section / heading' },
  { marker: 'mr', label: 'Major ref range (\\mr)', category: 'Section / heading' },
  { marker: 'r', label: 'Parallel ref (\\r)', category: 'Section / heading' },
  { marker: 'sr', label: 'Section range (\\sr)', category: 'Section / heading' },
  { marker: 'sp', label: 'Speaker (\\sp)', category: 'Section / heading' },
  { marker: 'sd', label: 'Semantic division (\\sd)', category: 'Section / heading' },
  { marker: 'sd1', label: 'Semantic division 1 (\\sd1)', category: 'Section / heading' },
  { marker: 'sd2', label: 'Semantic division 2 (\\sd2)', category: 'Section / heading' },
  { marker: 'cl', label: 'Chapter label (\\cl)', category: 'Section / heading' },
  { marker: 'cd', label: 'Chapter description (\\cd)', category: 'Section / heading' },
  { marker: 'mte', label: 'Main title end (\\mte)', category: 'Section / heading' },
  { marker: 'mte1', label: 'Main title end 1 (\\mte1)', category: 'Section / heading' },
  { marker: 'mte2', label: 'Main title end 2 (\\mte2)', category: 'Section / heading' },
];

const CHAPTER_BODY: MarkerChoice[] = [
  { marker: 'p', label: 'Paragraph (\\p)', category: 'Body paragraph' },
  { marker: 'm', label: 'Margin (\\m)', category: 'Body paragraph' },
  { marker: 'mi', label: 'Indented (\\mi)', category: 'Body paragraph' },
  { marker: 'mi1', label: 'Indented 1 (\\mi1)', category: 'Body paragraph' },
  { marker: 'mi2', label: 'Indented 2 (\\mi2)', category: 'Body paragraph' },
  { marker: 'nb', label: 'No break (\\nb)', category: 'Body paragraph' },
  { marker: 'pc', label: 'Centered (\\pc)', category: 'Body paragraph' },
  { marker: 'ph', label: 'Indented hanging (\\ph)', category: 'Body paragraph' },
  { marker: 'pi', label: 'Indented (\\pi)', category: 'Body paragraph' },
  { marker: 'pi1', label: 'Indented 1 (\\pi1)', category: 'Body paragraph' },
  { marker: 'pi2', label: 'Indented 2 (\\pi2)', category: 'Body paragraph' },
  { marker: 'pm', label: 'Embedded ref (\\pm)', category: 'Body paragraph' },
  { marker: 'pmc', label: 'Embedded ref closing (\\pmc)', category: 'Body paragraph' },
  { marker: 'pmo', label: 'Embedded ref opening (\\pmo)', category: 'Body paragraph' },
  { marker: 'pmr', label: 'Embedded ref refrain (\\pmr)', category: 'Body paragraph' },
  { marker: 'po', label: 'Opening (\\po)', category: 'Body paragraph' },
  { marker: 'pr', label: 'Right-aligned (\\pr)', category: 'Body paragraph' },
  { marker: 'cls', label: 'Closing (\\cls)', category: 'Body paragraph' },
  { marker: 'b', label: 'Blank line (\\b)', category: 'Body paragraph' },
];

const CHAPTER_POETRY: MarkerChoice[] = [
  { marker: 'q', label: 'Poetic line (\\q)', category: 'Poetry' },
  { marker: 'q1', label: 'Poetic line 1 (\\q1)', category: 'Poetry' },
  { marker: 'q2', label: 'Poetic line 2 (\\q2)', category: 'Poetry' },
  { marker: 'q3', label: 'Poetic line 3 (\\q3)', category: 'Poetry' },
  { marker: 'qr', label: 'Poetic right (\\qr)', category: 'Poetry' },
  { marker: 'qc', label: 'Poetic centered (\\qc)', category: 'Poetry' },
  { marker: 'qd', label: 'Poetic division (\\qd)', category: 'Poetry' },
  { marker: 'qa', label: 'Acrostic heading (\\qa)', category: 'Poetry' },
  { marker: 'qm', label: 'Poetic margin (\\qm)', category: 'Poetry' },
  { marker: 'qm1', label: 'Poetic margin 1 (\\qm1)', category: 'Poetry' },
  { marker: 'qm2', label: 'Poetic margin 2 (\\qm2)', category: 'Poetry' },
];

const CHAPTER_LIST: MarkerChoice[] = [
  { marker: 'li', label: 'List (\\li)', category: 'List' },
  { marker: 'li1', label: 'List 1 (\\li1)', category: 'List' },
  { marker: 'li2', label: 'List 2 (\\li2)', category: 'List' },
  { marker: 'lh', label: 'List header (\\lh)', category: 'List' },
  { marker: 'lf', label: 'List footer (\\lf)', category: 'List' },
  { marker: 'lim', label: 'Embedded list (\\lim)', category: 'List' },
  { marker: 'lim1', label: 'Embedded list 1 (\\lim1)', category: 'List' },
  { marker: 'lim2', label: 'Embedded list 2 (\\lim2)', category: 'List' },
];

const CHAPTER_MARKERS: MarkerChoice[] = [
  ...CHAPTER_SECTION,
  ...CHAPTER_BODY,
  ...CHAPTER_POETRY,
  ...CHAPTER_LIST,
];

const BY_SECTION: Record<EditorSection, MarkerChoice[]> = {
  header: HEADER,
  book_titles: BOOK_TITLES,
  book_introduction: BOOK_INTRO,
  chapter: CHAPTER_MARKERS,
};

/**
 * Paragraph-style markers allowed in the given document division (for menus and validation).
 */
export function getValidParagraphMarkers(section: EditorSection): MarkerChoice[] {
  return BY_SECTION[section];
}

function markerChoicesFromContextAware(
  defs: readonly ContextAwareMarkerDef[],
  section: EditorSection
): MarkerChoice[] {
  const out: MarkerChoice[] = [];
  for (const row of defs) {
    const marker = row.bySection[section];
    if (!marker) continue;
    out.push({
      marker,
      label: row.label,
      category: row.category,
    });
  }
  return out;
}

/**
 * Short, user-friendly marker list for the current section (concrete `marker` ids for PM commands).
 */
export function getSimplifiedMarkerChoices(section: EditorSection): MarkerChoice[] {
  return markerChoicesFromContextAware(CONTEXT_AWARE_MARKERS, section);
}

/**
 * Paragraph markers for the given UI mode and document section.
 */
export function getMarkerChoicesForMode(section: EditorSection, mode: EditorMode): MarkerChoice[] {
  switch (mode) {
    case 'basic':
      return markerChoicesFromContextAware(BASIC_MARKERS, section);
    case 'medium':
      return getSimplifiedMarkerChoices(section);
    case 'advanced':
      return getValidParagraphMarkers(section);
    default:
      return getSimplifiedMarkerChoices(section);
  }
}

/**
 * Map the ProseMirror document position to a high-level {@link EditorSection}.
 */
export function getEditorSectionAtPos(state: EditorState, pos: number): EditorSection {
  const $pos = state.doc.resolve(Math.max(0, Math.min(pos, state.doc.content.size)));
  for (let d = $pos.depth; d > 0; d--) {
    const name = $pos.node(d).type.name;
    if (name === 'header') return 'header';
    if (name === 'book_titles') return 'book_titles';
    if (name === 'book_introduction') return 'book_introduction';
    if (name === 'chapter') return 'chapter';
  }
  return 'chapter';
}

/**
 * Whether inserting a verse marker is meaningful in this section (chapter body only).
 */
export function canInsertVerseInSection(section: EditorSection): boolean {
  return section === 'chapter';
}

/**
 * Whether inserting a chapter marker is allowed (not in identification header or book titles).
 */
export function canInsertChapterMarkerInSection(section: EditorSection): boolean {
  return section !== 'header' && section !== 'book_titles';
}

export interface StructuralInsertionOptions {
  /** User may add the book titles block (before intro / first chapter). */
  canInsertBookTitles: boolean;
}

/**
 * Which structural blocks may be inserted at `pos`, per USFM document order:
 * `header? book_titles? book_introduction? chapter+`
 * ([Document structure](https://docs.usfm.bible/usfm/3.1.1/doc/index.html)).
 *
 * - **Book titles:** only if that node is still missing and the caret lies before the first `chapter`.
 */
export function getStructuralInsertions(
  state: import('prosemirror-state').EditorState,
  pos: number
): StructuralInsertionOptions {
  const doc = state.doc;
  let hasBookTitles = false;
  let firstChapterPos: number | null = null;

  let dpos = 1;
  doc.forEach((node) => {
    if (node.type.name === 'book_titles') hasBookTitles = true;
    if (node.type.name === 'chapter' && firstChapterPos === null) {
      firstChapterPos = dpos;
    }
    dpos += node.nodeSize;
  });

  const beforeFirstChapter = firstChapterPos === null || pos < firstChapterPos;

  return {
    canInsertBookTitles: !hasBookTitles && beforeFirstChapter,
  };
}

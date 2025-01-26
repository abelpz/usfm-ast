import { USFMMarkerInfo } from './types';

// this registry data is extracted from: https://github.com/usfm-bible/tcdocs/blob/main/grammar/usfm3_1.sty and https://docs.usfm.bible/usfm/3.1.1/
export const defaultMarkers: { [key: string]: USFMMarkerInfo } = {
  id: {
    displayName: 'File identification information',
    type: 'paragraph',
    context: ['ScriptureContent'],
    label: 'book',
  },
  usfm: {
    displayName: 'File markup version information',
    type: 'paragraph',
    context: ['ScriptureContent'],
    label: 'para',
  },
  ide: {
    displayName: 'File encoding information',
    type: 'paragraph',
    context: ['ScriptureContent'],
    label: 'para',
  },
  h: {
    displayName: 'Running header text for a book (basic)',
    type: 'paragraph',
    context: ['ScriptureContent'],
    label: 'para',
  },
  h1: {
    displayName: 'Running header text',
    type: 'paragraph',
    context: ['ScriptureContent'],
    label: 'para',
  },
  h2: {
    displayName: 'Running header text, left side of page',
    type: 'paragraph',
    context: ['ScriptureContent'],
    label: 'para',
  },
  h3: {
    displayName: 'Running header text, right side of page',
    type: 'paragraph',
    context: ['ScriptureContent'],
    label: 'para',
  },
  toc1: {
    displayName: 'Long table of contents text',
    type: 'paragraph',
    context: ['ScriptureContent'],
    label: 'para',
  },
  toc2: {
    displayName: 'Short table of contents text',
    type: 'paragraph',
    context: ['ScriptureContent'],
    label: 'para',
  },
  toc3: {
    displayName: 'Book Abbreviation',
    type: 'paragraph',
    context: ['ScriptureContent'],
    label: 'para',
  },
  toca1: {
    displayName: 'Alternative language long table of contents text',
    type: 'paragraph',
    context: ['ScriptureContent'],
    label: 'para',
  },
  toca2: {
    displayName: 'Alternative language short table of contents text',
    type: 'paragraph',
    context: ['ScriptureContent'],
    label: 'para',
  },
  toca3: {
    displayName: 'Alternative language book Abbreviation',
    type: 'paragraph',
    context: ['ScriptureContent'],
    label: 'para',
  },
  rem: {
    displayName: 'Comments and remarks',
    type: 'paragraph',
    context: ['ScriptureContent'],
    label: 'para',
    tags: ['nonpublishable', 'nonvernacular'],
  },
  sts: {
    displayName: 'Status of this file',
    type: 'paragraph',
    context: ['ScriptureContent'],
    label: 'para',
    tags: ['nonpublishable', 'nonvernacular'],
  },
  restore: {
    displayName: 'Project restore information',
    type: 'paragraph',
    context: ['ScriptureContent'],
    label: 'para',
    tags: ['nonpublishable', 'nonvernacular'],
  },
  imt: {
    displayName: 'Introduction major title, level 1 (if single level) (basic)',
    type: 'paragraph',
  },
  imt1: {
    displayName: 'Introduction major title, level 1 (if multiple levels)',
    type: 'paragraph',
  },
  imt2: {
    displayName: 'Introduction major title, level 2',
    type: 'paragraph',
  },
  imt3: {
    displayName: 'Introduction major title, level 3',
    type: 'paragraph',
  },
  imt4: {
    displayName: 'Introduction major title, level 4 (usually within parenthesis)',
    type: 'paragraph',
  },
  imte: {
    displayName: 'Introduction major title at introduction end, level 1 (if single level)',
    type: 'paragraph',
  },
  imte1: {
    displayName: 'Introduction major title at introduction end, level 1 (if multiple levels)',
    type: 'paragraph',
  },
  imte2: {
    displayName: 'Introduction major title at introduction end, level 2',
    type: 'paragraph',
  },
  is: {
    displayName: 'Introduction section heading, level 1 (if single level) (basic)',
    type: 'paragraph',
  },
  is1: {
    displayName: 'Introduction section heading, level 1 (if multiple levels)',
    type: 'paragraph',
  },
  is2: {
    displayName: 'Introduction section heading, level 2',
    type: 'paragraph',
  },
  iot: {
    displayName: 'Introduction outline title (basic)',
    type: 'paragraph',
  },
  io: {
    displayName: 'Introduction outline text, level 1 (if single level)',
    type: 'paragraph',
  },
  io1: {
    displayName: 'Introduction outline text, level 1 (if multiple levels) (basic)',
    type: 'paragraph',
  },
  io2: {
    displayName: 'Introduction outline text, level 2',
    type: 'paragraph',
  },
  io3: {
    displayName: 'Introduction outline text, level 3',
    type: 'paragraph',
  },
  io4: {
    displayName: 'Introduction outline text, level 4',
    type: 'paragraph',
  },
  ior: {
    displayName:
      'Introduction references range for outline entry; for marking references separately',
    type: 'character',
  },
  ip: {
    displayName: 'Introduction prose paragraph (basic)',
    type: 'paragraph',
  },
  im: {
    displayName: 'Introduction prose paragraph, with no first line indent (may occur after poetry)',
    type: 'paragraph',
  },
  ipi: {
    displayName: 'Introduction prose paragraph, indented, with first line indent',
    type: 'paragraph',
  },
  imi: {
    displayName: 'Introduction prose paragraph text, indented, with no first line indent',
    type: 'paragraph',
  },
  ili: {
    displayName: 'A list entry, level 1 (if single level)',
    type: 'paragraph',
  },
  ili1: {
    displayName: 'A list entry, level 1 (if multiple levels)',
    type: 'paragraph',
  },
  ili2: {
    displayName: 'A list entry, level 2',
    type: 'paragraph',
  },
  ipq: {
    displayName: 'Introduction prose paragraph, quote from the body text',
    type: 'paragraph',
  },
  imq: {
    displayName:
      'Introduction prose paragraph, quote from the body text, with no first line indent',
    type: 'paragraph',
  },
  ipr: {
    displayName: 'Introduction prose paragraph, right aligned',
    type: 'paragraph',
  },
  ib: {
    displayName: 'Introduction blank line',
    type: 'paragraph',
    role: 'break',
  },
  iq: {
    displayName: 'Introduction poetry text, level 1 (if single level)',
    type: 'paragraph',
  },
  iq1: {
    displayName: 'Introduction poetry text, level 1 (if multiple levels)',
    type: 'paragraph',
  },
  iq2: {
    displayName: 'Introduction poetry text, level 2',
    type: 'paragraph',
  },
  iq3: {
    displayName: 'Introduction poetry text, level 3',
    type: 'paragraph',
  },
  iex: {
    displayName:
      'Introduction explanatory or bridge text (e.g. explanation of missing book in Short Old Testament)',
    type: 'paragraph',
  },
  iqt: {
    displayName: 'For quoted scripture text appearing in the introduction',
    type: 'character',
  },
  ie: {
    displayName: 'Introduction ending marker',
    type: 'paragraph',
  },
  c: {
    displayName: 'Chapter number (necessary for normal Paratext operation)',
    type: 'paragraph',
  },
  ca: {
    displayName:
      'Second (alternate) chapter number (for coding dual versification; useful for places where different traditions of chapter breaks need to be supported in the same translation)',
    type: 'character',
  },
  cp: {
    displayName:
      'Published chapter number (chapter string that should appear in the published text)',
    type: 'paragraph',
  },
  cl: {
    displayName:
      'Chapter label used for translations that add a word such as "Chapter" before chapter numbers (e.g. Psalms). The subsequent text is the chapter label.',
    type: 'paragraph',
  },
  cd: {
    displayName: 'Chapter displayName (Publishing option D, e.g. in Russian Bibles)',
    type: 'paragraph',
  },
  v: {
    displayName: 'A verse number (Necessary for normal paratext operation) (basic)',
    type: 'character',
  },
  va: {
    displayName:
      'Second (alternate) verse number (for coding dual numeration in Psalms; see also NRSV Exo 22.1-4)',
    type: 'character',
  },
  vp: {
    displayName: 'Published verse marker (verse string that should appear in the published text)',
    type: 'character',
  },
  p: {
    displayName: 'paragraph text, with first line indent (basic)',
    type: 'paragraph',
  },
  m: {
    displayName: 'paragraph text, with no first line indent (may occur after poetry) (basic)',
    type: 'paragraph',
  },
  po: {
    displayName: 'Letter opening',
    type: 'paragraph',
  },
  pr: {
    displayName: 'Text refrain (paragraph text, right aligned)',
    type: 'paragraph',
  },
  cls: {
    displayName: 'Letter Closing',
    type: 'paragraph',
  },
  pmo: {
    displayName: 'Embedded text opening',
    type: 'paragraph',
  },
  pm: {
    displayName: 'Embedded text paragraph',
    type: 'paragraph',
  },
  pmc: {
    displayName: 'Embedded text closing',
    type: 'paragraph',
  },
  pmr: {
    displayName: 'Embedded text refrain (e.g. Then all the people shall say, "Amen!")',
    type: 'paragraph',
  },
  pi: {
    displayName:
      'paragraph text, level 1 indent (if sinlge level), with first line indent; often used for discourse (basic)',
    type: 'paragraph',
  },
  pi1: {
    displayName:
      'paragraph text, level 1 indent (if multiple levels), with first line indent; often used for discourse',
    type: 'paragraph',
  },
  pi2: {
    displayName: 'paragraph text, level 2 indent, with first line indent; often used for discourse',
    type: 'paragraph',
  },
  pi3: {
    displayName: 'paragraph text, level 3 indent, with first line indent; often used for discourse',
    type: 'paragraph',
  },
  pc: {
    displayName: 'paragraph text, centered (for Inscription)',
    type: 'paragraph',
  },
  mi: {
    displayName: 'paragraph text, indented, with no first line indent; often used for discourse',
    type: 'paragraph',
  },
  nb: {
    displayName:
      'paragraph text, with no break from previous paragraph text (at chapter boundary) (basic)',
    type: 'paragraph',
  },
  q: {
    displayName: 'Poetry text, level 1 indent (if single level)',
    type: 'paragraph',
  },
  q1: {
    displayName: 'Poetry text, level 1 indent (if multiple levels) (basic)',
    type: 'paragraph',
  },
  q2: {
    displayName: 'Poetry text, level 2 indent (basic)',
    type: 'paragraph',
  },
  q3: {
    displayName: 'Poetry text, level 3 indent',
    type: 'paragraph',
  },
  q4: {
    displayName: 'Poetry text, level 4 indent',
    type: 'paragraph',
  },
  qc: {
    displayName: 'Poetry text, centered',
    type: 'paragraph',
  },
  qr: {
    displayName: 'Poetry text, Right Aligned',
    type: 'paragraph',
  },
  qs: {
    displayName: 'Poetry text, Selah',
    type: 'character',
  },
  qa: {
    displayName: 'Poetry text, Acrostic marker/heading',
    type: 'paragraph',
  },
  qac: {
    displayName: 'Poetry text, Acrostic markup of the first character of a line of acrostic poetry',
    type: 'character',
  },
  qm: {
    displayName: 'Poetry text, embedded, level 1 indent (if single level)',
    type: 'paragraph',
  },
  qm1: {
    displayName: 'Poetry text, embedded, level 1 indent (if multiple levels)',
    type: 'paragraph',
  },
  qm2: {
    displayName: 'Poetry text, embedded, level 2 indent',
    type: 'paragraph',
  },
  qm3: {
    displayName: 'Poetry text, embedded, level 3 indent',
    type: 'paragraph',
  },
  qd: {
    displayName:
      'A Hebrew musical performance annotation, similar in content to Hebrew descriptive title.',
    type: 'paragraph',
  },
  b: {
    displayName: 'Poetry text stanza break (e.g. stanza break) (basic)',
    type: 'paragraph',
    role: 'break',
  },
  mt: {
    displayName: 'The main title of the book (if single level)',
    type: 'paragraph',
  },
  mt1: {
    displayName: 'The main title of the book (if multiple levels) (basic)',
    type: 'paragraph',
  },
  mt2: {
    displayName: 'A secondary title usually occurring before the main title (basic)',
    type: 'paragraph',
  },
  mt3: {
    displayName: 'A secondary title occurring after the main title',
    type: 'paragraph',
  },
  mt4: {
    displayName: 'A small secondary title sometimes occuring within parentheses',
    type: 'paragraph',
  },
  mte: {
    displayName:
      'The main title of the book repeated at the end of the book, level 1 (if single level)',
    type: 'paragraph',
  },
  mte1: {
    displayName:
      'The main title of the book repeated at the end of the book, level 1 (if multiple levels)',
    type: 'paragraph',
  },
  mte2: {
    displayName: "A secondary title occurring before or after the 'ending' main title",
    type: 'paragraph',
  },
  ms: {
    displayName: 'A major section division heading, level 1 (if single level) (basic)',
    type: 'paragraph',
  },
  mse: {
    displayName: 'A major section division ending heading, level 1 (if single level)',
    type: 'paragraph',
  },
  ms1: {
    displayName: 'A major section division heading, level 1 (if multiple levels)',
    type: 'paragraph',
  },
  ms2: {
    displayName: 'A major section division heading, level 2',
    type: 'paragraph',
  },
  ms2e: {
    displayName: 'A major section division ending heading, level 2',
    type: 'paragraph',
  },
  ms3: {
    displayName: 'A major section division heading, level 3',
    type: 'paragraph',
  },
  ms3e: {
    displayName: 'A major section division ending heading, level 3',
    type: 'paragraph',
  },
  mr: {
    displayName: 'A major section division references range heading (basic)',
    type: 'paragraph',
  },
  s: {
    displayName: 'A section heading, level 1 (if single level) (basic)',
    type: 'paragraph',
  },
  s1: {
    displayName: 'A section heading, level 1 (if multiple levels)',
    type: 'paragraph',
  },
  s1e: {
    displayName: 'A section ending heading, level 1 (if multiple levels)',
    type: 'paragraph',
  },
  s2: {
    displayName: 'A section heading, level 2 (e.g. Proverbs 22-24)',
    type: 'paragraph',
  },
  s2e: {
    displayName: 'A section ending heading, level 2',
    type: 'paragraph',
  },
  s3: {
    displayName: 'A section heading, level 3 (e.g. Genesis "The First Day")',
    type: 'paragraph',
  },
  s3e: {
    displayName: 'A section ending heading, level 3',
    type: 'paragraph',
  },
  s4: {
    displayName: 'A section heading, level 4',
    type: 'paragraph',
  },
  s4e: {
    displayName: 'A section ending heading, level 4',
    type: 'paragraph',
  },
  sr: {
    displayName: 'A section division references range heading',
    type: 'paragraph',
  },
  r: {
    displayName: 'Parallel reference(s) (basic)',
    type: 'paragraph',
  },
  sp: {
    displayName: 'A heading, to identify the speaker (e.g. Job)',
    type: 'paragraph',
  },
  d: {
    displayName: 'A Hebrew text heading, to provide displayName (e.g. Psalms)',
    type: 'paragraph',
  },
  sd: {
    displayName: 'Vertical space used to divide the text into sections, level 1 (if single level)',
    type: 'paragraph',
    role: 'break',
  },
  sd1: {
    displayName:
      'Vertical space used to divide the text into sections, level 1 (if multiple levels)',
    type: 'paragraph',
    role: 'break',
  },
  sd2: {
    displayName: 'Vertical space used to divide the text into sections, level 2',
    type: 'paragraph',
    role: 'break',
  },
  sd3: {
    displayName: 'Vertical space used to divide the text into sections, level 3',
    type: 'paragraph',
    role: 'break',
  },
  sd4: {
    displayName: 'Vertical space used to divide the text into sections, level 4',
    type: 'paragraph',
    role: 'break',
  },
  tr: {
    displayName: 'A new table row (basic)',
    type: 'paragraph',
  },
  th1: {
    displayName: 'A table heading, column 1',
    type: 'character',
  },
  th2: {
    displayName: 'A table heading, column 2',
    type: 'character',
  },
  th3: {
    displayName: 'A table heading, column 3',
    type: 'character',
  },
  th4: {
    displayName: 'A table heading, column 4',
    type: 'character',
  },
  th5: {
    displayName: 'A table heading, column 5',
    type: 'character',
  },
  th6: {
    displayName: 'A table heading, column 6',
    type: 'character',
  },
  th7: {
    displayName: 'A table heading, column 7',
    type: 'character',
  },
  th8: {
    displayName: 'A table heading, column 4',
    type: 'character',
  },
  tc1: {
    displayName: 'A table cell item, column 1',
    type: 'character',
  },
  tc2: {
    displayName: 'A table cell item, column 2',
    type: 'character',
  },
  tc3: {
    displayName: 'A table cell item, column 3',
    type: 'character',
  },
  tc4: {
    displayName: 'A table cell item, column 4',
    type: 'character',
  },
  tc5: {
    displayName: 'A table cell item, column 5',
    type: 'character',
  },
  tc6: {
    displayName: 'A table cell item, column 6',
    type: 'character',
  },
  tc7: {
    displayName: 'A table cell item, column 7',
    type: 'character',
  },
  tc8: {
    displayName: 'A table cell item, column 8',
    type: 'character',
  },
  thc1: {
    displayName: 'A table heading, column 1, center aligned',
    type: 'character',
  },
  thc2: {
    displayName: 'A table heading, column 2, center aligned',
    type: 'character',
  },
  thc3: {
    displayName: 'A table heading, column 3, center aligned',
    type: 'character',
  },
  thc4: {
    displayName: 'A table heading, column 4, center aligned',
    type: 'character',
  },
  thc5: {
    displayName: 'A table heading, column 5, center aligned',
    type: 'character',
  },
  thc6: {
    displayName: 'A table heading, column 6, center aligned',
    type: 'character',
  },
  thc7: {
    displayName: 'A table heading, column 7, center aligned',
    type: 'character',
  },
  thc8: {
    displayName: 'A table heading, column 8, center aligned',
    type: 'character',
  },
  tcc1: {
    displayName: 'A table cell item, column 1, center aligned',
    type: 'character',
  },
  tcc2: {
    displayName: 'A table cell item, column 2, center aligned',
    type: 'character',
  },
  tcc3: {
    displayName: 'A table cell item, column 3, center aligned',
    type: 'character',
  },
  tcc4: {
    displayName: 'A table cell item, column 4, center aligned',
    type: 'character',
  },
  tcc5: {
    displayName: 'A table cell item, column 5, center aligned',
    type: 'character',
  },
  tcc6: {
    displayName: 'A table cell item, column 6, center aligned',
    type: 'character',
  },
  tcc7: {
    displayName: 'A table cell item, column 7, center aligned',
    type: 'character',
  },
  tcc8: {
    displayName: 'A table cell item, column 8, center aligned',
    type: 'character',
  },
  thr1: {
    displayName: 'A table heading, column 1, right aligned',
    type: 'character',
  },
  thr2: {
    displayName: 'A table heading, column 2, right aligned',
    type: 'character',
  },
  thr3: {
    displayName: 'A table heading, column 3, right aligned',
    type: 'character',
  },
  thr4: {
    displayName: 'A table heading, column 4, right aligned',
    type: 'character',
  },
  thr5: {
    displayName: 'A table heading, column 5, right aligned',
    type: 'character',
  },
  thr6: {
    displayName: 'A table heading, column 6, right aligned',
    type: 'character',
  },
  thr7: {
    displayName: 'A table heading, column 7, right aligned',
    type: 'character',
  },
  thr8: {
    displayName: 'A table heading, column 8, right aligned',
    type: 'character',
  },
  tcr1: {
    displayName: 'A table cell item, column 1, right aligned',
    type: 'character',
  },
  tcr2: {
    displayName: 'A table cell item, column 2, right aligned',
    type: 'character',
  },
  tcr3: {
    displayName: 'A table cell item, column 3, right aligned',
    type: 'character',
  },
  tcr4: {
    displayName: 'A table cell item, column 4, right aligned',
    type: 'character',
  },
  tcr5: {
    displayName: 'A table cell item, column 5, right aligned',
    type: 'character',
  },
  tcr6: {
    displayName: 'A table cell item, column 6, right aligned',
    type: 'character',
  },
  tcr7: {
    displayName: 'A table cell item, column 7, right aligned',
    type: 'character',
  },
  tcr8: {
    displayName: 'A table cell item, column 8, right aligned',
    type: 'character',
  },
  lh: {
    displayName: 'List header (introductory remark)',
    type: 'paragraph',
  },
  li: {
    displayName: 'A list entry, level 1 (if single level)',
    type: 'paragraph',
  },
  li1: {
    displayName: 'A list entry, level 1 (if multiple levels) (basic)',
    type: 'paragraph',
  },
  li2: {
    displayName: 'A list entry, level 2 (basic)',
    type: 'paragraph',
  },
  li3: {
    displayName: 'A list entry, level 3',
    type: 'paragraph',
  },
  li4: {
    displayName: 'A list entry, level 4',
    type: 'paragraph',
  },
  lf: {
    displayName: 'List footer (concluding remark)',
    type: 'paragraph',
  },
  lim: {
    displayName: 'An embedded list entry, level 1 (if single level)',
    type: 'paragraph',
  },
  lim1: {
    displayName: 'An embedded list entry, level 1 (if multiple levels)',
    type: 'paragraph',
  },
  lim2: {
    displayName: 'An embedded list entry, level 2',
    type: 'paragraph',
  },
  lim3: {
    displayName: 'An embedded list item, level 3',
    type: 'paragraph',
  },
  lim4: {
    displayName: 'An embedded list entry, level 4',
    type: 'paragraph',
  },
  litl: {
    displayName: 'List entry total text',
    type: 'character',
  },
  lik: {
    displayName: 'Structure list entry key text',
    type: 'character',
  },
  liv: {
    displayName: 'Structured list entry value 1 content (if single value)',
    type: 'character',
  },
  liv1: {
    displayName: 'Structured list entrt value 1 content (if multiple values)',
    type: 'character',
  },
  liv2: {
    displayName: 'Structured list entry value 2 content',
    type: 'character',
  },
  liv3: {
    displayName: 'Structured list entry value 3 content',
    type: 'character',
  },
  liv4: {
    displayName: 'Structured list entry value 4 content',
    type: 'character',
  },
  f: {
    displayName: 'A Footnote text item (basic)',
    type: 'note',
  },
  fe: {
    displayName: 'An Endnote text item',
    type: 'note',
    context: ['NoteContent'],
  },
  fr: {
    displayName: 'The origin reference for the footnote (basic)',
    type: 'character',
    context: ['NoteContent'],
  },
  ft: {
    displayName: 'Footnote text, Protocanon (basic)',
    type: 'character',
    context: ['NoteContent'],
  },
  fk: {
    displayName: 'A footnote keyword (basic)',
    type: 'character',
    context: ['NoteContent'],
  },
  fq: {
    displayName: 'A footnote scripture quote or alternate rendering (basic)',
    type: 'character',
    context: ['NoteContent'],
  },
  fqa: {
    displayName: 'A footnote alternate rendering for a portion of scripture text',
    type: 'character',
    context: ['NoteContent'],
  },
  fl: {
    displayName:
      'A footnote label text item, for marking or "labelling" the type or alternate translation being provided in the note.',
    type: 'character',
    context: ['NoteContent'],
  },
  fw: {
    displayName:
      'A footnote witness list, for distinguishing a list of sigla representing witnesses in critical editions.',
    type: 'character',
    context: ['NoteContent'],
  },
  fp: {
    displayName: 'A Footnote additional paragraph marker',
    type: 'character',
    context: ['NoteContent'],
  },
  fs: {
    displayName:
      'A summary text for the concept/idea/quotation from the scripture translation for which the note is being provided.',
    type: 'character',
    context: ['NoteContent'],
  },
  fv: {
    displayName: 'A verse number within the footnote text',
    type: 'character',
    context: ['NoteContent'],
  },
  fdc: {
    displayName: 'Footnote text, applies to Deuterocanon only',
    type: 'character',
    context: ['NoteContent'],
  },
  fm: {
    displayName: 'An additional footnote marker location for a previous footnote',
    type: 'character',
    context: ['NoteContent'],
  },
  x: {
    displayName: 'A list of cross references (basic)',
    type: 'note',
  },
  xo: {
    displayName: 'The cross reference origin reference (basic)',
    type: 'character',
    context: ['NoteContent'],
  },
  xop: {
    displayName:
      'Published cross reference origin reference (origin reference that should appear in the published text)',
    type: 'character',
    context: ['NoteContent'],
  },
  xt: {
    displayName: 'The cross reference target reference(s), protocanon only (basic)',
    type: 'character',
    context: ['NoteContent'],
  },
  xta: {
    displayName: 'Cross reference target references added text',
    type: 'character',
    context: ['NoteContent'],
  },
  xk: {
    displayName: 'A cross reference keyword',
    type: 'character',
    context: ['NoteContent'],
  },
  xq: {
    displayName: 'A cross-reference quotation from the scripture text',
    type: 'character',
    context: ['NoteContent'],
  },
  xot: {
    displayName: 'Cross-reference target reference(s), Old Testament only',
    type: 'character',
    context: ['NoteContent'],
  },
  xnt: {
    displayName: 'Cross-reference target reference(s), New Testament only',
    type: 'character',
    context: ['NoteContent'],
  },
  xdc: {
    displayName: 'Cross-reference target reference(s), Deuterocanon only',
    type: 'character',
    context: ['NoteContent'],
  },
  rq: {
    displayName: 'A cross-reference indicating the source text for the preceding quotation.',
    type: 'character',
  },
  ef: {
    displayName: 'Study Bible extended footnote (basic)',
    type: 'note',
  },
  ex: {
    displayName: 'List of study Bible extended cross references',
    type: 'note',
  },
  esb: {
    displayName: 'Study Bible sidebar (mini article)',
    type: 'paragraph',
  },
  esbe: {
    displayName: 'Study Bible sidebar ending',
    type: 'paragraph',
  },
  erq: {
    displayName: 'Study Bible reflective questions',
    type: 'paragraph',
  },
  erqe: {
    displayName: 'Study Bible reflective questions ending',
    type: 'paragraph',
  },
  cat: {
    displayName: 'Study note category',
    type: 'character',
  },
  qt: {
    displayName: 'For Old Testament quoted text appearing in the New Testament (basic)',
    type: 'character',
  },
  nd: {
    displayName: 'For name of deity (basic)',
    type: 'character',
  },
  tl: {
    displayName: 'For transliterated words',
    type: 'character',
  },
  dc: {
    displayName: 'Deuterocanonical/LXX additions or insertions in the Protocanonical text',
    type: 'character',
  },
  bk: {
    displayName: 'For the quoted name of a book',
    type: 'character',
  },
  sig: {
    displayName: 'For the signature of the author of an Epistle',
    type: 'character',
  },
  pn: {
    displayName: 'For a proper name',
    type: 'character',
  },
  png: {
    displayName: 'For a geographic proper name',
    type: 'character',
  },
  addpn: {
    displayName: 'For chinese words to be dot underline & underline',
    type: 'character',
  },
  wj: {
    displayName: 'For marking the words of Jesus',
    type: 'character',
  },
  k: {
    displayName: 'For a keyword',
    type: 'character',
  },
  sls: {
    displayName:
      'To represent where the original text is in a secondary language or from an alternate text source',
    type: 'character',
  },
  ord: {
    displayName: 'For the text portion of an ordinal number',
    type: 'character',
  },
  add: {
    displayName: 'For a translational addition to the text',
    type: 'character',
  },
  lit: {
    displayName: 'For a comment or note inserted for liturgical use',
    type: 'paragraph',
  },
  no: {
    displayName: 'A character style, use normal text',
    type: 'character',
  },
  it: {
    displayName: 'A character style, use italic text',
    type: 'character',
  },
  bd: {
    displayName: 'A character style, use bold text',
    type: 'character',
  },
  bdit: {
    displayName: 'A character style, use bold + italic text',
    type: 'character',
  },
  em: {
    displayName: 'A character style, use emphasized text style',
    type: 'character',
  },
  sc: {
    displayName: 'A character style, for small capitalization text',
    type: 'character',
  },
  sup: {
    displayName:
      'A character style, for superscript text. Typically for use in critical edition footnotes.',
    type: 'character',
  },
  pb: {
    displayName:
      "Page Break used for new reader portions and children's bibles where content is controlled by the page",
    type: 'paragraph',
  },
  fig: {
    displayName: 'Illustration [Columns to span, height, filename, caption text]',
    type: 'character',
    allowsAttributes: true,
    attributes: {
      src: {
        description: 'The filename of the illustration',
        type: 'string',
        required: true,
      },
      size: {
        description: 'Illustration relative size',
        type: 'string',
        values: ['col', 'span'],
        required: true,
      },
      ref: {
        description: 'Scripture reference',
        type: 'string',
        required: true,
      },
      alt: {
        description: 'Short, free-form description of image.',
        type: 'string',
      },
      loc: {
        description:
          'Location / range. Specify a range of references at which the illustration might be inserted.',
        type: 'string',
      },
      copy: {
        description: 'Rights holder/copyright information.',
        type: 'string',
      },
    },
  },
  jmp: {
    displayName: 'For associating linking attributes to a span of text',
    type: 'character',
    allowsAttributes: true,
    defaultAttribute: 'href',
    attributes: {
      href: {
        description: 'Identifies the resource being linked to as a URI',
        type: 'string',
      },
      title: {
        description: 'The title of the linked resource',
        type: 'string',
      },
      id: {
        description: 'A unique identifier for a specific content location (i.e. an anchor).',
        type: 'string',
      },
    },
  },
  pro: {
    displayName: 'For indicating pronunciation in CJK texts',
    type: 'character',
  },
  rb: {
    displayName: 'Ruby gloss.',
    type: 'character',
    allowsAttributes: true,
    defaultAttribute: 'gloss',
    attributes: {
      gloss: {
        description: 'Ruby gloss characters',
        type: 'string',
      },
    },
  },
  w: {
    displayName: 'A wordlist text item',
    type: 'character',
    allowsAttributes: true,
    defaultAttribute: 'lemma',
    attributes: {
      lemma: {
        description: 'Citation form for the term in the glossary',
        type: 'string',
      },
      strong: {
        description: 'Strong’s ID in the form H#### (Hebrew) or G#### (Greek)',
        type: 'string',
      },
      srcloc: {
        description: 'Location of the word in the source text',
        type: 'string',
      },
    },
  },
  wh: {
    displayName: 'A Hebrew wordlist text item',
    type: 'character',
  },
  wg: {
    displayName: 'A Greek Wordlist text item',
    type: 'character',
  },
  wa: {
    displayName: 'An Aramaic Wordlist text item',
    type: 'character',
  },
  ndx: {
    displayName: 'A subject index text item',
    type: 'character',
  },
  periph: {
    displayName: 'Periheral content division marker.',
    type: 'paragraph',
  },
  p1: {
    displayName: 'Front or back matter text paragraph, level 1 (if multiple levels)',
    type: 'paragraph',
  },
  p2: {
    displayName: 'Front or back matter text paragraph, level 2 (if multiple levels)',
    type: 'paragraph',
  },
  k1: {
    displayName: 'Concordance main entry text or keyword, level 1',
    type: 'paragraph',
  },
  k2: {
    displayName: 'Concordance main entry text or keyword, level 2',
    type: 'paragraph',
  },
  xtSee: {
    displayName: 'Concordance and Names Index markup for an alternate entry target reference.',
    type: 'character',
  },
  xtSeeAlso: {
    displayName: 'Concordance and Names Index markup for an additional entry target reference.',
    type: 'character',
  },
  ph: {
    displayName: 'paragraph text, with level 1 hanging indent (if single level)',
    type: 'paragraph',
  },
  ph1: {
    displayName: 'paragraph text, with level 1 hanging indent (if multiple levels)',
    type: 'paragraph',
  },
  ph2: {
    displayName: 'paragraph text, with level 2 hanging indent',
    type: 'paragraph',
  },
  ph3: {
    displayName: 'paragraph text, with level 3 hanging indent',
    type: 'paragraph',
  },
  phi: {
    displayName: 'paragraph text, indented with hanging indent',
    type: 'paragraph',
  },
  tr1: {
    displayName: 'A table Row',
    type: 'paragraph',
  },
  tr2: {
    displayName: 'A table Row',
    type: 'paragraph',
  },
  ps: {
    displayName: 'paragraph text, no break with next paragraph text at chapter boundary',
    type: 'paragraph',
  },
  psi: {
    displayName:
      'paragraph text, indented, with no break with next paragraph text (at chapter boundary)',
    type: 'paragraph',
  },
  wr: {
    displayName: 'A Wordlist text item',
    type: 'character',
  },
  pub: {
    displayName: 'Front matter publication data',
    type: 'paragraph',
  },
  toc: {
    displayName: 'Front matter table of contents',
    type: 'paragraph',
  },
  pref: {
    displayName: 'Front matter preface',
    type: 'paragraph',
  },
  ref: {
    displayName: 'Scripture reference',
    type: 'character',
    allowsAttributes: true,
    defaultAttribute: 'loc',
    attributes: {
      loc: {
        description: 'Use for explicitely identifying the target scripture reference',
        type: 'string',
      },
      gen: {
        description: 'Set the value to true to indicate that a <ref> tag was auto-generated',
        type: 'boolean',
      },
    },
  },
  intro: {
    displayName: 'Front matter introduction',
    type: 'paragraph',
  },
  conc: {
    displayName: 'Back matter concordance',
    type: 'paragraph',
  },
  glo: {
    displayName: 'Back matter glossary',
    type: 'paragraph',
  },
  idx: {
    displayName: 'Back matter index',
    type: 'paragraph',
  },
  maps: {
    displayName: 'Back matter map index',
    type: 'paragraph',
  },
  cov: {
    displayName: 'Other peripheral materials - cover',
    type: 'paragraph',
  },
  spine: {
    displayName: 'Other peripheral materials - spine',
    type: 'paragraph',
  },
  pubinfo: {
    displayName: 'Publication information - Lang,Credit,Version,Copies,Publisher,Id,Logo',
    type: 'paragraph',
  },
  'zpa-xb': {
    displayName: 'Book Ref',
    type: 'character',
  },
  'zpa-xc': {
    displayName: 'Chapter Ref',
    type: 'character',
  },
  'zpa-xv': {
    displayName: 'Verse Ref',
    type: 'character',
  },
  'zpa-d': {
    displayName: 'Description',
    type: 'character',
  },
  ts: {
    displayName: "Translator's section",
    type: 'milestone',
  },
  t: {
    displayName: '',
    type: 'milestone',
  },
  efe: {
    type: 'note',
  },
  efm: {
    type: 'character',
  },
};

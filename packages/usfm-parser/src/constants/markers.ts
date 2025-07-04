import { USFMMarkerInfo } from './types';

// this registry data is extracted from: https://github.com/usfm-bible/tcdocs/blob/main/grammar/usfm3_1.sty and https://docs.usfm.bible/usfm/3.1.1/
export const defaultMarkers: { [key: string]: USFMMarkerInfo } = {
  id: {
    displayName: 'File identification information',
    type: 'paragraph',
    context: ['ScriptureContent'],
    label: 'book',
    hasSpecialContent: true,
    styleType: 'book',
  },
  usfm: {
    displayName: 'File markup version information',
    type: 'paragraph',
    context: ['ScriptureContent'],
  },
  ide: {
    displayName: 'File encoding information',
    type: 'paragraph',
    context: ['ScriptureContent'],
    styleType: 'para',
  },
  h: {
    displayName: 'Running header text for a book (basic)',
    type: 'paragraph',
    context: ['ScriptureContent'],
    styleType: 'para',
  },
  h1: {
    displayName: 'Running header text',
    type: 'paragraph',
    context: ['ScriptureContent'],
    styleType: 'para',
  },
  h2: {
    displayName: 'Running header text, left side of page',
    type: 'paragraph',
    context: ['ScriptureContent'],
    styleType: 'para',
  },
  h3: {
    displayName: 'Running header text, right side of page',
    type: 'paragraph',
    context: ['ScriptureContent'],
    styleType: 'para',
  },
  toc1: {
    displayName: 'Long table of contents text',
    type: 'paragraph',
    context: ['ScriptureContent'],
    styleType: 'para',
  },
  toc2: {
    displayName: 'Short table of contents text',
    type: 'paragraph',
    context: ['ScriptureContent'],
    styleType: 'para',
  },
  toc3: {
    displayName: 'Book Abbreviation',
    type: 'paragraph',
    context: ['ScriptureContent'],
    styleType: 'para',
  },
  toca1: {
    displayName: 'Alternative language long table of contents text',
    type: 'paragraph',
    context: ['ScriptureContent'],
    styleType: 'para',
  },
  toca2: {
    displayName: 'Alternative language short table of contents text',
    type: 'paragraph',
    context: ['ScriptureContent'],
    styleType: 'para',
  },
  toca3: {
    displayName: 'Alternative language book Abbreviation',
    type: 'paragraph',
    context: ['ScriptureContent'],
    styleType: 'para',
  },
  rem: {
    displayName: 'Comments and remarks',
    type: 'paragraph',
    context: ['ScriptureContent'],
    styleType: 'para',
    tags: ['nonpublishable', 'nonvernacular'],
  },
  sts: {
    displayName: 'Status of this file',
    type: 'paragraph',
    context: ['ScriptureContent'],
    styleType: 'para',
    tags: ['nonpublishable', 'nonvernacular'],
  },
  restore: {
    displayName: 'Project restore information',
    type: 'paragraph',
    context: ['ScriptureContent'],
    styleType: 'para',
    tags: ['nonpublishable', 'nonvernacular'],
  },
  imt: {
    displayName: 'Introduction major title, level 1 (if single level) (basic)',
    type: 'paragraph',
    styleType: 'para',
  },
  imt1: {
    displayName: 'Introduction major title, level 1 (if multiple levels)',
    type: 'paragraph',
    styleType: 'para',
  },
  imt2: {
    displayName: 'Introduction major title, level 2',
    type: 'paragraph',
    styleType: 'para',
  },
  imt3: {
    displayName: 'Introduction major title, level 3',
    type: 'paragraph',
    styleType: 'para',
  },
  imt4: {
    displayName: 'Introduction major title, level 4 (usually within parenthesis)',
    type: 'paragraph',
    styleType: 'para',
  },
  imte: {
    displayName: 'Introduction major title at introduction end, level 1 (if single level)',
    type: 'paragraph',
    styleType: 'para',
  },
  imte1: {
    displayName: 'Introduction major title at introduction end, level 1 (if multiple levels)',
    type: 'paragraph',
    styleType: 'para',
  },
  imte2: {
    displayName: 'Introduction major title at introduction end, level 2',
    type: 'paragraph',
    styleType: 'para',
  },
  is: {
    displayName: 'Introduction section heading, level 1 (if single level) (basic)',
    type: 'paragraph',
    styleType: 'para',
  },
  is1: {
    displayName: 'Introduction section heading, level 1 (if multiple levels)',
    type: 'paragraph',
    styleType: 'para',
  },
  is2: {
    displayName: 'Introduction section heading, level 2',
    type: 'paragraph',
    styleType: 'para',
  },
  iot: {
    displayName: 'Introduction outline title (basic)',
    type: 'paragraph',
    styleType: 'para',
  },
  io: {
    displayName: 'Introduction outline text, level 1 (if single level)',
    type: 'paragraph',
    styleType: 'para',
  },
  io1: {
    displayName: 'Introduction outline text, level 1 (if multiple levels) (basic)',
    type: 'paragraph',
    styleType: 'para',
  },
  io2: {
    displayName: 'Introduction outline text, level 2',
    type: 'paragraph',
    styleType: 'para',
  },
  io3: {
    displayName: 'Introduction outline text, level 3',
    type: 'paragraph',
    styleType: 'para',
  },
  io4: {
    displayName: 'Introduction outline text, level 4',
    type: 'paragraph',
    styleType: 'para',
  },
  ior: {
    displayName:
      'Introduction references range for outline entry; for marking references separately',
    type: 'character',
    styleType: 'char',
  },
  ip: {
    displayName: 'Introduction prose paragraph (basic)',
    type: 'paragraph',
    styleType: 'para',
  },
  im: {
    displayName: 'Introduction prose paragraph, with no first line indent (may occur after poetry)',
    type: 'paragraph',
    styleType: 'para',
  },
  ipi: {
    displayName: 'Introduction prose paragraph, indented, with first line indent',
    type: 'paragraph',
    styleType: 'para',
  },
  imi: {
    displayName: 'Introduction prose paragraph text, indented, with no first line indent',
    type: 'paragraph',
    styleType: 'para',
  },
  ili: {
    displayName: 'A list entry, level 1 (if single level)',
    type: 'paragraph',
    styleType: 'para',
  },
  ili1: {
    displayName: 'A list entry, level 1 (if multiple levels)',
    type: 'paragraph',
    styleType: 'para',
  },
  ili2: {
    displayName: 'A list entry, level 2',
    type: 'paragraph',
    styleType: 'para',
  },
  ipq: {
    displayName: 'Introduction prose paragraph, quote from the body text',
    type: 'paragraph',
    styleType: 'para',
  },
  imq: {
    displayName:
      'Introduction prose paragraph, quote from the body text, with no first line indent',
    type: 'paragraph',
    styleType: 'para',
  },
  ipr: {
    displayName: 'Introduction prose paragraph, right aligned',
    type: 'paragraph',
    styleType: 'para',
  },
  ib: {
    displayName: 'Introduction blank line',
    type: 'paragraph',
    role: 'break',
    styleType: 'para',
  },
  iq: {
    displayName: 'Introduction poetry text, level 1 (if single level)',
    type: 'paragraph',
    styleType: 'para',
  },
  iq1: {
    displayName: 'Introduction poetry text, level 1 (if multiple levels)',
    type: 'paragraph',
    styleType: 'para',
  },
  iq2: {
    displayName: 'Introduction poetry text, level 2',
    type: 'paragraph',
    styleType: 'para',
  },
  iq3: {
    displayName: 'Introduction poetry text, level 3',
    type: 'paragraph',
    styleType: 'para',
  },
  iex: {
    displayName:
      'Introduction explanatory or bridge text (e.g. explanation of missing book in Short Old Testament)',
    type: 'paragraph',
    styleType: 'para',
  },
  iqt: {
    displayName: 'For quoted scripture text appearing in the introduction',
    type: 'character',
    styleType: 'char',
  },
  ie: {
    displayName: 'Introduction ending marker',
    type: 'paragraph',
    styleType: 'para',
  },
  c: {
    displayName: 'Chapter number (necessary for normal Paratext operation)',
    type: 'paragraph',
    hasSpecialContent: true,
    styleType: 'chapter',
  },
  ca: {
    displayName:
      'Second (alternate) chapter number (for coding dual versification; useful for places where different traditions of chapter breaks need to be supported in the same translation)',
    type: 'character',
    hasSpecialContent: true,
    mergesInto: {
      markers: ['c'],
    },
    mergeAs: 'altnumber',
  },
  cp: {
    displayName:
      'Published chapter number (chapter string that should appear in the published text)',
    type: 'paragraph',
    hasSpecialContent: true,
    mergesInto: {
      markers: ['c'],
    },
    mergeAs: 'pubnumber',
  },
  cl: {
    displayName:
      'Chapter label used for translations that add a word such as "Chapter" before chapter numbers (e.g. Psalms). The subsequent text is the chapter label.',
    type: 'paragraph',
    styleType: 'para',
  },
  cd: {
    displayName: 'Chapter displayName (Publishing option D, e.g. in Russian Bibles)',
    type: 'paragraph',
    styleType: 'para',
  },
  v: {
    displayName: 'A verse number (Necessary for normal paratext operation) (basic)',
    type: 'character',
    hasSpecialContent: true,
    styleType: 'verse',
  },
  va: {
    displayName:
      'Second (alternate) verse number (for coding dual numeration in Psalms; see also NRSV Exo 22.1-4)',
    type: 'character',
    hasSpecialContent: true,
    mergesInto: {
      markers: ['v'],
    },
    mergeAs: 'altnumber',
  },
  vp: {
    displayName: 'Published verse marker (verse string that should appear in the published text)',
    type: 'character',
    hasSpecialContent: true,
    mergesInto: {
      markers: ['v'],
    },
    mergeAs: 'pubnumber',
  },
  p: {
    displayName: 'paragraph text, with first line indent (basic)',
    type: 'paragraph',
    styleType: 'para',
  },
  m: {
    displayName: 'paragraph text, with no first line indent (may occur after poetry) (basic)',
    type: 'paragraph',
    styleType: 'para',
  },
  po: {
    displayName: 'Letter opening',
    type: 'paragraph',
    styleType: 'para',
  },
  pr: {
    displayName: 'Text refrain (paragraph text, right aligned)',
    type: 'paragraph',
    styleType: 'para',
  },
  cls: {
    displayName: 'Letter Closing',
    type: 'paragraph',
    styleType: 'para',
  },
  pmo: {
    displayName: 'Embedded text opening',
    type: 'paragraph',
    styleType: 'para',
  },
  pm: {
    displayName: 'Embedded text paragraph',
    type: 'paragraph',
    styleType: 'para',
  },
  pmc: {
    displayName: 'Embedded text closing',
    type: 'paragraph',
    styleType: 'para',
  },
  pmr: {
    displayName: 'Embedded text refrain (e.g. Then all the people shall say, "Amen!")',
    type: 'paragraph',
    styleType: 'para',
  },
  pi: {
    displayName:
      'paragraph text, level 1 indent (if sinlge level), with first line indent; often used for discourse (basic)',
    type: 'paragraph',
    styleType: 'para',
  },
  pi1: {
    displayName:
      'paragraph text, level 1 indent (if multiple levels), with first line indent; often used for discourse',
    type: 'paragraph',
    styleType: 'para',
  },
  pi2: {
    displayName: 'paragraph text, level 2 indent, with first line indent; often used for discourse',
    type: 'paragraph',
    styleType: 'para',
  },
  pi3: {
    displayName: 'paragraph text, level 3 indent, with first line indent; often used for discourse',
    type: 'paragraph',
    styleType: 'para',
  },
  pc: {
    displayName: 'paragraph text, centered (for Inscription)',
    type: 'paragraph',
    styleType: 'para',
  },
  mi: {
    displayName: 'paragraph text, indented, with no first line indent; often used for discourse',
    type: 'paragraph',
    styleType: 'para',
  },
  nb: {
    displayName:
      'paragraph text, with no break from previous paragraph text (at chapter boundary) (basic)',
    type: 'paragraph',
    styleType: 'para',
  },
  q: {
    displayName: 'Poetry text, level 1 indent (if single level)',
    type: 'paragraph',
    styleType: 'para',
  },
  q1: {
    displayName: 'Poetry text, level 1 indent (if multiple levels) (basic)',
    type: 'paragraph',
    styleType: 'para',
  },
  q2: {
    displayName: 'Poetry text, level 2 indent (basic)',
    type: 'paragraph',
    styleType: 'para',
  },
  q3: {
    displayName: 'Poetry text, level 3 indent',
    type: 'paragraph',
    styleType: 'para',
  },
  q4: {
    displayName: 'Poetry text, level 4 indent',
    type: 'paragraph',
    styleType: 'para',
  },
  qc: {
    displayName: 'Poetry text, centered',
    type: 'paragraph',
    styleType: 'para',
  },
  qr: {
    displayName: 'Poetry text, Right Aligned',
    type: 'paragraph',
    styleType: 'para',
  },
  qs: {
    displayName: 'Poetry text, Selah',
    type: 'character',
    styleType: 'char',
  },
  qa: {
    displayName: 'Poetry text, Acrostic marker/heading',
    type: 'paragraph',
    styleType: 'para',
  },
  qac: {
    displayName: 'Poetry text, Acrostic markup of the first character of a line of acrostic poetry',
    type: 'character',
    styleType: 'char',
  },
  qm: {
    displayName: 'Poetry text, embedded, level 1 indent (if single level)',
    type: 'paragraph',
    styleType: 'para',
  },
  qm1: {
    displayName: 'Poetry text, embedded, level 1 indent (if multiple levels)',
    type: 'paragraph',
    styleType: 'para',
  },
  qm2: {
    displayName: 'Poetry text, embedded, level 2 indent',
    type: 'paragraph',
    styleType: 'para',
  },
  qm3: {
    displayName: 'Poetry text, embedded, level 3 indent',
    type: 'paragraph',
    styleType: 'para',
  },
  qd: {
    displayName:
      'A Hebrew musical performance annotation, similar in content to Hebrew descriptive title.',
    type: 'paragraph',
    styleType: 'para',
  },
  b: {
    displayName: 'Poetry text stanza break (e.g. stanza break) (basic)',
    type: 'paragraph',
    role: 'break',
    styleType: 'para',
  },
  mt: {
    displayName: 'The main title of the book (if single level)',
    type: 'paragraph',
    styleType: 'para',
  },
  mt1: {
    displayName: 'The main title of the book (if multiple levels) (basic)',
    type: 'paragraph',
    styleType: 'para',
  },
  mt2: {
    displayName: 'A secondary title usually occurring before the main title (basic)',
    type: 'paragraph',
    styleType: 'para',
  },
  mt3: {
    displayName: 'A secondary title occurring after the main title',
    type: 'paragraph',
    styleType: 'para',
  },
  mt4: {
    displayName: 'A small secondary title sometimes occuring within parentheses',
    type: 'paragraph',
    styleType: 'para',
  },
  mte: {
    displayName:
      'The main title of the book repeated at the end of the book, level 1 (if single level)',
    type: 'paragraph',
    styleType: 'para',
  },
  mte1: {
    displayName:
      'The main title of the book repeated at the end of the book, level 1 (if multiple levels)',
    type: 'paragraph',
    styleType: 'para',
  },
  mte2: {
    displayName: "A secondary title occurring before or after the 'ending' main title",
    type: 'paragraph',
    styleType: 'para',
  },
  ms: {
    displayName: 'A major section division heading, level 1 (if single level) (basic)',
    type: 'paragraph',
    styleType: 'para',
  },
  mse: {
    displayName: 'A major section division ending heading, level 1 (if single level)',
    type: 'paragraph',
    styleType: 'para',
  },
  ms1: {
    displayName: 'A major section division heading, level 1 (if multiple levels)',
    type: 'paragraph',
    styleType: 'para',
  },
  ms2: {
    displayName: 'A major section division heading, level 2',
    type: 'paragraph',
    styleType: 'para',
  },
  ms2e: {
    displayName: 'A major section division ending heading, level 2',
    type: 'paragraph',
    styleType: 'para',
  },
  ms3: {
    displayName: 'A major section division heading, level 3',
    type: 'paragraph',
    styleType: 'para',
  },
  ms3e: {
    displayName: 'A major section division ending heading, level 3',
    type: 'paragraph',
    styleType: 'para',
  },
  mr: {
    displayName: 'A major section division references range heading (basic)',
    type: 'paragraph',
    styleType: 'para',
  },
  s: {
    displayName: 'A section heading, level 1 (if single level) (basic)',
    type: 'paragraph',
    styleType: 'para',
  },
  s1: {
    displayName: 'A section heading, level 1 (if multiple levels)',
    type: 'paragraph',
    styleType: 'para',
  },
  s1e: {
    displayName: 'A section ending heading, level 1 (if multiple levels)',
    type: 'paragraph',
    styleType: 'para',
  },
  s2: {
    displayName: 'A section heading, level 2 (e.g. Proverbs 22-24)',
    type: 'paragraph',
    styleType: 'para',
  },
  s2e: {
    displayName: 'A section ending heading, level 2',
    type: 'paragraph',
    styleType: 'para',
  },
  s3: {
    displayName: 'A section heading, level 3 (e.g. Genesis "The First Day")',
    type: 'paragraph',
    styleType: 'para',
  },
  s3e: {
    displayName: 'A section ending heading, level 3',
    type: 'paragraph',
    styleType: 'para',
  },
  s4: {
    displayName: 'A section heading, level 4',
    type: 'paragraph',
    styleType: 'para',
  },
  s4e: {
    displayName: 'A section ending heading, level 4',
    type: 'paragraph',
    styleType: 'para',
  },
  sr: {
    displayName: 'A section division references range heading',
    type: 'paragraph',
    styleType: 'para',
  },
  r: {
    displayName: 'Parallel reference(s) (basic)',
    type: 'paragraph',
    styleType: 'para',
  },
  sp: {
    displayName: 'A heading, to identify the speaker (e.g. Job)',
    type: 'paragraph',
    styleType: 'para',
  },
  d: {
    displayName: 'A Hebrew text heading, to provide displayName (e.g. Psalms)',
    type: 'paragraph',
    styleType: 'para',
  },
  sd: {
    displayName: 'Vertical space used to divide the text into sections, level 1 (if single level)',
    type: 'paragraph',
    role: 'break',
    styleType: 'para',
  },
  sd1: {
    displayName:
      'Vertical space used to divide the text into sections, level 1 (if multiple levels)',
    type: 'paragraph',
    role: 'break',
    styleType: 'para',
  },
  sd2: {
    displayName: 'Vertical space used to divide the text into sections, level 2',
    type: 'paragraph',
    role: 'break',
    styleType: 'para',
  },
  sd3: {
    displayName: 'Vertical space used to divide the text into sections, level 3',
    type: 'paragraph',
    role: 'break',
    styleType: 'para',
  },
  sd4: {
    displayName: 'Vertical space used to divide the text into sections, level 4',
    type: 'paragraph',
    role: 'break',
    styleType: 'para',
  },
  tr: {
    displayName: 'A new table row (basic)',
    type: 'paragraph',
    styleType: 'table:row',
  },
  th1: {
    displayName: 'A table heading, column 1',
    type: 'character',
    styleType: 'table:cell',
  },
  th2: {
    displayName: 'A table heading, column 2',
    type: 'character',
    styleType: 'table:cell',
  },
  th3: {
    displayName: 'A table heading, column 3',
    type: 'character',
    styleType: 'table:cell',
  },
  th4: {
    displayName: 'A table heading, column 4',
    type: 'character',
    styleType: 'table:cell',
  },
  th5: {
    displayName: 'A table heading, column 5',
    type: 'character',
    styleType: 'table:cell',
  },
  th6: {
    displayName: 'A table heading, column 6',
    type: 'character',
    styleType: 'table:cell',
  },
  th7: {
    displayName: 'A table heading, column 7',
    type: 'character',
    styleType: 'table:cell',
  },
  th8: {
    displayName: 'A table heading, column 4',
    type: 'character',
    styleType: 'table:cell',
  },
  tc1: {
    displayName: 'A table cell item, column 1',
    type: 'character',
    styleType: 'table:cell',
  },
  tc2: {
    displayName: 'A table cell item, column 2',
    type: 'character',
    styleType: 'table:cell',
  },
  tc3: {
    displayName: 'A table cell item, column 3',
    type: 'character',
    styleType: 'table:cell',
  },
  tc4: {
    displayName: 'A table cell item, column 4',
    type: 'character',
    styleType: 'table:cell',
  },
  tc5: {
    displayName: 'A table cell item, column 5',
    type: 'character',
    styleType: 'table:cell',
  },
  tc6: {
    displayName: 'A table cell item, column 6',
    type: 'character',
    styleType: 'table:cell',
  },
  tc7: {
    displayName: 'A table cell item, column 7',
    type: 'character',
    styleType: 'table:cell',
  },
  tc8: {
    displayName: 'A table cell item, column 8',
    type: 'character',
    styleType: 'table:cell',
  },
  thc1: {
    displayName: 'A table heading, column 1, center aligned',
    type: 'character',
    styleType: 'table:cell',
  },
  thc2: {
    displayName: 'A table heading, column 2, center aligned',
    type: 'character',
    styleType: 'table:cell',
  },
  thc3: {
    displayName: 'A table heading, column 3, center aligned',
    type: 'character',
    styleType: 'table:cell',
  },
  thc4: {
    displayName: 'A table heading, column 4, center aligned',
    type: 'character',
    styleType: 'table:cell',
  },
  thc5: {
    displayName: 'A table heading, column 5, center aligned',
    type: 'character',
    styleType: 'table:cell',
  },
  thc6: {
    displayName: 'A table heading, column 6, center aligned',
    type: 'character',
    styleType: 'table:cell',
  },
  thc7: {
    displayName: 'A table heading, column 7, center aligned',
    type: 'character',
    styleType: 'table:cell',
  },
  thc8: {
    displayName: 'A table heading, column 8, center aligned',
    type: 'character',
    styleType: 'table:cell',
  },
  tcc1: {
    displayName: 'A table cell item, column 1, center aligned',
    type: 'character',
    styleType: 'table:cell',
  },
  tcc2: {
    displayName: 'A table cell item, column 2, center aligned',
    type: 'character',
    styleType: 'table:cell',
  },
  tcc3: {
    displayName: 'A table cell item, column 3, center aligned',
    type: 'character',
    styleType: 'table:cell',
  },
  tcc4: {
    displayName: 'A table cell item, column 4, center aligned',
    type: 'character',
    styleType: 'table:cell',
  },
  tcc5: {
    displayName: 'A table cell item, column 5, center aligned',
    type: 'character',
    styleType: 'table:cell',
  },
  tcc6: {
    displayName: 'A table cell item, column 6, center aligned',
    type: 'character',
    styleType: 'table:cell',
  },
  tcc7: {
    displayName: 'A table cell item, column 7, center aligned',
    type: 'character',
    styleType: 'table:cell',
  },
  tcc8: {
    displayName: 'A table cell item, column 8, center aligned',
    type: 'character',
    styleType: 'table:cell',
  },
  thr1: {
    displayName: 'A table heading, column 1, right aligned',
    type: 'character',
    styleType: 'table:cell',
  },
  thr2: {
    displayName: 'A table heading, column 2, right aligned',
    type: 'character',
    styleType: 'table:cell',
  },
  thr3: {
    displayName: 'A table heading, column 3, right aligned',
    type: 'character',
    styleType: 'table:cell',
  },
  thr4: {
    displayName: 'A table heading, column 4, right aligned',
    type: 'character',
    styleType: 'table:cell',
  },
  thr5: {
    displayName: 'A table heading, column 5, right aligned',
    type: 'character',
    styleType: 'table:cell',
  },
  thr6: {
    displayName: 'A table heading, column 6, right aligned',
    type: 'character',
    styleType: 'table:cell',
  },
  thr7: {
    displayName: 'A table heading, column 7, right aligned',
    type: 'character',
    styleType: 'table:cell',
  },
  thr8: {
    displayName: 'A table heading, column 8, right aligned',
    type: 'character',
    styleType: 'table:cell',
  },
  tcr1: {
    displayName: 'A table cell item, column 1, right aligned',
    type: 'character',
    styleType: 'table:cell',
  },
  tcr2: {
    displayName: 'A table cell item, column 2, right aligned',
    type: 'character',
    styleType: 'table:cell',
  },
  tcr3: {
    displayName: 'A table cell item, column 3, right aligned',
    type: 'character',
    styleType: 'table:cell',
  },
  tcr4: {
    displayName: 'A table cell item, column 4, right aligned',
    type: 'character',
    styleType: 'table:cell',
  },
  tcr5: {
    displayName: 'A table cell item, column 5, right aligned',
    type: 'character',
    styleType: 'table:cell',
  },
  tcr6: {
    displayName: 'A table cell item, column 6, right aligned',
    type: 'character',
    styleType: 'table:cell',
  },
  tcr7: {
    displayName: 'A table cell item, column 7, right aligned',
    type: 'character',
    styleType: 'table:cell',
  },
  tcr8: {
    displayName: 'A table cell item, column 8, right aligned',
    type: 'character',
    styleType: 'table:cell',
  },
  lh: {
    displayName: 'List header (introductory remark)',
    type: 'paragraph',
    styleType: 'para',
  },
  li: {
    displayName: 'A list entry, level 1 (if single level)',
    type: 'paragraph',
    styleType: 'para',
  },
  li1: {
    displayName: 'A list entry, level 1 (if multiple levels) (basic)',
    type: 'paragraph',
    styleType: 'para',
  },
  li2: {
    displayName: 'A list entry, level 2 (basic)',
    type: 'paragraph',
    styleType: 'para',
  },
  li3: {
    displayName: 'A list entry, level 3',
    type: 'paragraph',
    styleType: 'para',
  },
  li4: {
    displayName: 'A list entry, level 4',
    type: 'paragraph',
    styleType: 'para',
  },
  lf: {
    displayName: 'List footer (concluding remark)',
    type: 'paragraph',
    styleType: 'para',
  },
  lim: {
    displayName: 'An embedded list entry, level 1 (if single level)',
    type: 'paragraph',
    styleType: 'para',
  },
  lim1: {
    displayName: 'An embedded list entry, level 1 (if multiple levels)',
    type: 'paragraph',
    styleType: 'para',
  },
  lim2: {
    displayName: 'An embedded list entry, level 2',
    type: 'paragraph',
    styleType: 'para',
  },
  lim3: {
    displayName: 'An embedded list item, level 3',
    type: 'paragraph',
    styleType: 'para',
  },
  lim4: {
    displayName: 'An embedded list entry, level 4',
    type: 'paragraph',
    styleType: 'para',
  },
  litl: {
    displayName: 'List entry total text',
    type: 'character',
    styleType: 'char',
  },
  lik: {
    displayName: 'Structure list entry key text',
    type: 'character',
    styleType: 'char',
  },
  liv: {
    displayName: 'Structured list entry value 1 content (if single value)',
    type: 'character',
    styleType: 'char',
  },
  liv1: {
    displayName: 'Structured list entrt value 1 content (if multiple values)',
    type: 'character',
    styleType: 'char',
  },
  liv2: {
    displayName: 'Structured list entry value 2 content',
    type: 'character',
    styleType: 'char',
  },
  liv3: {
    displayName: 'Structured list entry value 3 content',
    type: 'character',
    styleType: 'char',
  },
  liv4: {
    displayName: 'Structured list entry value 4 content',
    type: 'character',
    styleType: 'char',
  },
  f: {
    displayName: 'A Footnote text item (basic)',
    type: 'note',
    hasSpecialContent: true,
    implicitAttributes: {
      caller: {
        description: 'The id of the footnote',
        type: 'string',
      },
      cat: {
        description: 'The category of the footnote',
        type: 'string',
      },
    },
    styleType: 'note',
  },
  fe: {
    displayName: 'An Endnote text item',
    type: 'note',
    context: ['NoteContent'],
    hasSpecialContent: true,
    implicitAttributes: {
      caller: {
        description: 'The id of the endnote',
        type: 'string',
      },
      cat: {
        description: 'The category of the endnote',
        type: 'string',
      },
    },
    styleType: 'note',
  },
  fr: {
    displayName: 'The origin reference for the footnote (basic)',
    type: 'character',
    context: ['NoteContent'],
    styleType: 'char',
  },
  ft: {
    displayName: 'Footnote text, Protocanon (basic)',
    type: 'character',
    context: ['NoteContent'],
    styleType: 'char',
  },
  fk: {
    displayName: 'A footnote keyword (basic)',
    type: 'character',
    context: ['NoteContent'],
    styleType: 'char',
  },
  fq: {
    displayName: 'A footnote scripture quote or alternate rendering (basic)',
    type: 'character',
    context: ['NoteContent'],
    styleType: 'char',
  },
  fqa: {
    displayName: 'A footnote alternate rendering for a portion of scripture text',
    type: 'character',
    context: ['NoteContent'],
    styleType: 'char',
  },
  fl: {
    displayName:
      'A footnote label text item, for marking or "labelling" the type or alternate translation being provided in the note.',
    type: 'character',
    context: ['NoteContent'],
    styleType: 'char',
  },
  fw: {
    displayName:
      'A footnote witness list, for distinguishing a list of sigla representing witnesses in critical editions.',
    type: 'character',
    context: ['NoteContent'],
    styleType: 'char',
  },
  fp: {
    displayName: 'A Footnote additional paragraph marker',
    type: 'character',
    context: ['NoteContent'],
    styleType: 'char',
  },
  fs: {
    displayName:
      'A summary text for the concept/idea/quotation from the scripture translation for which the note is being provided.',
    type: 'character',
    context: ['NoteContent'],
    styleType: 'char',
  },
  fv: {
    displayName: 'A verse number within the footnote text',
    type: 'character',
    styleType: 'char',
  },
  fdc: {
    displayName: 'Footnote text, applies to Deuterocanon only',
    type: 'character',
    context: ['NoteContent'],
    styleType: 'char',
  },
  fm: {
    displayName: 'An additional footnote marker location for a previous footnote',
    type: 'character',
    styleType: 'char',
  },
  x: {
    displayName: 'A list of cross references (basic)',
    type: 'note',
    hasSpecialContent: true,
    implicitAttributes: {
      caller: {
        description: 'The id of the cross reference',
        type: 'string',
      },
      cat: {
        description: 'The category of the cross reference',
        type: 'string',
      },
    },
    styleType: 'note',
  },
  xo: {
    displayName: 'The cross reference origin reference (basic)',
    type: 'character',
    context: ['NoteContent'],
    styleType: 'char',
  },
  xop: {
    displayName:
      'Published cross reference origin reference (origin reference that should appear in the published text)',
    type: 'character',
    context: ['NoteContent'],
    styleType: 'char',
  },
  xt: {
    displayName: 'The cross reference target reference(s), protocanon only (basic)',
    type: 'character',
    context: ['NoteContent'],
    styleType: 'char',
  },
  xta: {
    displayName: 'Cross reference target references added text',
    type: 'character',
    context: ['NoteContent'],
    styleType: 'char',
  },
  xk: {
    displayName: 'A cross reference keyword',
    type: 'character',
    context: ['NoteContent'],
    styleType: 'char',
  },
  xq: {
    displayName: 'A cross-reference quotation from the scripture text',
    type: 'character',
    context: ['NoteContent'],
    styleType: 'char',
  },
  xot: {
    displayName: 'Cross-reference target reference(s), Old Testament only',
    type: 'character',
    context: ['NoteContent'],
    styleType: 'char',
  },
  xnt: {
    displayName: 'Cross-reference target reference(s), New Testament only',
    type: 'character',
    context: ['NoteContent'],
    styleType: 'char',
  },
  xdc: {
    displayName: 'Cross-reference target reference(s), Deuterocanon only',
    type: 'character',
    context: ['NoteContent'],
    styleType: 'char',
  },
  rq: {
    displayName: 'A cross-reference indicating the source text for the preceding quotation.',
    type: 'character',
    styleType: 'char',
  },
  ef: {
    displayName: 'Study Bible extended footnote (basic)',
    type: 'note',
    hasSpecialContent: true,
    implicitAttributes: {
      caller: {
        description: 'The id of the extended footnote',
        type: 'string',
      },
      cat: {
        description: 'The category of the extended footnote',
        type: 'string',
      },
    },
    styleType: 'note',
  },
  ex: {
    displayName: 'List of study Bible extended cross references',
    type: 'note',
    hasSpecialContent: true,
    implicitAttributes: {
      caller: {
        description: 'The id of the extended cross reference',
        type: 'string',
      },
      cat: {
        description: 'The category of the extended cross reference',
        type: 'string',
      },
    },
    styleType: 'note',
  },
  esb: {
    displayName: 'Study Bible sidebar (mini article)',
    type: 'paragraph',
    closedBy: 'esbe',
    sectionContainer: true,
    implicitAttributes: {
      cat: {
        description: 'The category of the study Bible sidebar',
        type: 'string',
      },
    },
    styleType: 'sidebar',
  },
  esbe: {
    displayName: 'Study Bible sidebar ending',
    type: 'paragraph',
    closes: 'esb',
  },
  erq: {
    displayName: 'Study Bible reflective questions',
    type: 'paragraph',
    closedBy: 'erqe',
    sectionContainer: true,
    styleType: 'para',
  },
  erqe: {
    displayName: 'Study Bible reflective questions ending',
    type: 'paragraph',
    closes: 'erq',
    styleType: 'para',
  },
  cat: {
    displayName: 'Study note category',
    type: 'character',
    mergesInto: {
      markers: ['esb'],
      types: ['note'],
    },
    mergeAs: 'category',
    styleType: 'char',
  },
  qt: {
    displayName: 'For Old Testament quoted text appearing in the New Testament (basic)',
    type: 'character',
    styleType: 'char',
  },
  nd: {
    displayName: 'For name of deity (basic)',
    type: 'character',
    styleType: 'char',
  },
  tl: {
    displayName: 'For transliterated words',
    type: 'character',
    styleType: 'char',
  },
  dc: {
    displayName: 'Deuterocanonical/LXX additions or insertions in the Protocanonical text',
    type: 'character',
    styleType: 'char',
  },
  bk: {
    displayName: 'For the quoted name of a book',
    type: 'character',
    styleType: 'char',
  },
  sig: {
    displayName: 'For the signature of the author of an Epistle',
    type: 'character',
    styleType: 'char',
  },
  pn: {
    displayName: 'For a proper name',
    type: 'character',
    styleType: 'char',
  },
  png: {
    displayName: 'For a geographic proper name',
    type: 'character',
    styleType: 'char',
  },
  addpn: {
    displayName: 'For chinese words to be dot underline & underline',
    type: 'character',
    styleType: 'char',
  },
  wj: {
    displayName: 'For marking the words of Jesus',
    type: 'character',
    styleType: 'char',
  },
  k: {
    displayName: 'For a keyword',
    type: 'character',
    allowsAttributes: true,
    defaultAttribute: 'key',
    attributes: {
      key: {
        description: 'The keyword or search term for this glossary entry',
        type: 'string',
      },
    },
    styleType: 'char',
  },
  sls: {
    displayName:
      'To represent where the original text is in a secondary language or from an alternate text source',
    type: 'character',
    styleType: 'char',
  },
  ord: {
    displayName: 'For the text portion of an ordinal number',
    type: 'character',
    styleType: 'char',
  },
  add: {
    displayName: 'For a translational addition to the text',
    type: 'character',
    styleType: 'char',
  },
  lit: {
    displayName: 'For a comment or note inserted for liturgical use',
    type: 'paragraph',
    styleType: 'para',
  },
  no: {
    displayName: 'A character style, use normal text',
    type: 'character',
    styleType: 'char',
  },
  it: {
    displayName: 'A character style, use italic text',
    type: 'character',
    styleType: 'char',
  },
  bd: {
    displayName: 'A character style, use bold text',
    type: 'character',
    styleType: 'char',
  },
  bdit: {
    displayName: 'A character style, use bold + italic text',
    type: 'character',
    styleType: 'char',
  },
  em: {
    displayName: 'A character style, use emphasized text style',
    type: 'character',
    styleType: 'char',
  },
  sc: {
    displayName: 'A character style, for small capitalization text',
    type: 'character',
    styleType: 'char',
  },
  sup: {
    displayName:
      'A character style, for superscript text. Typically for use in critical edition footnotes.',
    type: 'character',
    styleType: 'char',
  },
  pb: {
    displayName:
      "Page Break used for new reader portions and children's bibles where content is controlled by the page",
    type: 'paragraph',
    styleType: 'para',
  },
  fig: {
    displayName: 'Illustration [Columns to span, height, filename, caption text]',
    label: 'figure',
    type: 'character',
    allowsAttributes: true,
    styleType: 'figure',
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
    styleType: 'char',
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
    styleType: 'char',
  },
  rb: {
    displayName: 'Ruby gloss.',
    type: 'character',
    styleType: 'char',
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
    styleType: 'char',
    allowsAttributes: true,
    defaultAttribute: 'lemma',
    attributes: {
      lemma: {
        description: 'Citation form for the term in the glossary',
        type: 'string',
      },
      strong: {
        description: "Strong's ID in the form H#### (Hebrew) or G#### (Greek)",
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
    styleType: 'char',
  },
  wg: {
    displayName: 'A Greek Wordlist text item',
    type: 'character',
    styleType: 'char',
  },
  wa: {
    displayName: 'An Aramaic Wordlist text item',
    type: 'character',
    styleType: 'char',
  },
  ndx: {
    displayName: 'A subject index text item',
    type: 'character',
    styleType: 'char',
  },
  periph: {
    displayName: 'Periheral content division marker.',
    allowsAttributes: true,
    attributes: {
      id: {
        description: 'The id of the peripheral content',
        type: 'string',
      },
    },
    hasSpecialContent: true,
    implicitAttributes: {
      alt: {
        description: 'The type of peripheral content',
        type: 'string',
      },
    },
    type: 'paragraph',
    styleType: 'periph',
  },
  p1: {
    displayName: 'Front or back matter text paragraph, level 1 (if multiple levels)',
    type: 'paragraph',
    styleType: 'para',
  },
  p2: {
    displayName: 'Front or back matter text paragraph, level 2 (if multiple levels)',
    type: 'paragraph',
    styleType: 'para',
  },
  k1: {
    displayName: 'Concordance main entry text or keyword, level 1',
    type: 'paragraph',
    styleType: 'para',
  },
  k2: {
    displayName: 'Concordance main entry text or keyword, level 2',
    type: 'paragraph',
    styleType: 'para',
  },
  xtSee: {
    displayName: 'Concordance and Names Index markup for an alternate entry target reference.',
    type: 'character',
    styleType: 'char',
  },
  xtSeeAlso: {
    displayName: 'Concordance and Names Index markup for an additional entry target reference.',
    type: 'character',
    styleType: 'char',
  },
  ph: {
    displayName: 'paragraph text, with level 1 hanging indent (if single level)',
    type: 'paragraph',
    styleType: 'para',
  },
  ph1: {
    displayName: 'paragraph text, with level 1 hanging indent (if multiple levels)',
    type: 'paragraph',
    styleType: 'para',
  },
  ph2: {
    displayName: 'paragraph text, with level 2 hanging indent',
    type: 'paragraph',
    styleType: 'para',
  },
  ph3: {
    displayName: 'paragraph text, with level 3 hanging indent',
    type: 'paragraph',
    styleType: 'para',
  },
  phi: {
    displayName: 'paragraph text, indented with hanging indent',
    type: 'paragraph',
    styleType: 'para',
  },
  tr1: {
    displayName: 'A table Row',
    type: 'paragraph',
    styleType: 'table:row',
  },
  tr2: {
    displayName: 'A table Row',
    type: 'paragraph',
    styleType: 'table:row',
  },
  ps: {
    displayName: 'paragraph text, no break with next paragraph text at chapter boundary',
    type: 'paragraph',
    styleType: 'para',
  },
  psi: {
    displayName:
      'paragraph text, indented, with no break with next paragraph text (at chapter boundary)',
    type: 'paragraph',
    styleType: 'para',
  },
  wr: {
    displayName: 'A Wordlist text item',
    type: 'character',
    styleType: 'char',
  },
  pub: {
    displayName: 'Front matter publication data',
    type: 'paragraph',
    styleType: 'para',
  },
  toc: {
    displayName: 'Front matter table of contents',
    type: 'paragraph',
    styleType: 'para',
  },
  pref: {
    displayName: 'Front matter preface',
    type: 'paragraph',
    styleType: 'para',
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
    styleType: 'para',
  },
  conc: {
    displayName: 'Back matter concordance',
    type: 'paragraph',
    styleType: 'para',
  },
  glo: {
    displayName: 'Back matter glossary',
    type: 'paragraph',
    styleType: 'para',
  },
  idx: {
    displayName: 'Back matter index',
    type: 'paragraph',
    styleType: 'para',
  },
  maps: {
    displayName: 'Back matter map index',
    type: 'paragraph',
    styleType: 'para',
  },
  cov: {
    displayName: 'Other peripheral materials - cover',
    type: 'paragraph',
    styleType: 'para',
  },
  spine: {
    displayName: 'Other peripheral materials - spine',
    type: 'paragraph',
    styleType: 'para',
  },
  pubinfo: {
    displayName: 'Publication information - Lang,Credit,Version,Copies,Publisher,Id,Logo',
    type: 'paragraph',
    styleType: 'para',
  },
  'zpa-xb': {
    displayName: 'Book Ref',
    type: 'character',
    styleType: 'char',
  },
  'zpa-xc': {
    displayName: 'Chapter Ref',
    type: 'character',
    styleType: 'char',
  },
  'zpa-xv': {
    displayName: 'Verse Ref',
    type: 'character',
    styleType: 'char',
  },
  'zpa-d': {
    displayName: 'Description',
    type: 'character',
    styleType: 'char',
  },
  ts: {
    displayName: "Translator's section",
    type: 'milestone',
    styleType: 'ms',
  },
  t: {
    displayName: '',
    type: 'milestone',
    styleType: 'ms',
  },
  efe: {
    type: 'note',
    styleType: 'note',
    implicitAttributes: {
      caller: {
        description: 'The id of the endnote',
        type: 'string',
      },
      cat: {
        description: 'The category of the endnote',
        type: 'string',
      },
    },
  },
  efm: {
    type: 'character',
    styleType: 'char',
  },
  // Alignment markers
  'zaln-s': {
    displayName: 'Alignment start milestone',
    type: 'milestone',
    styleType: 'ms',
    allowsAttributes: true,
    attributes: {
      'x-strong': {
        description: 'Strong number reference',
        type: 'string',
      },
      'x-lemma': {
        description: 'Lemma form',
        type: 'string',
      },
      'x-morph': {
        description: 'Morphological information',
        type: 'string',
      },
      'x-occurrence': {
        description: 'Occurrence number',
        type: 'string',
      },
      'x-occurrences': {
        description: 'Total occurrences',
        type: 'string',
      },
      'x-content': {
        description: 'Original language content',
        type: 'string',
      },
    },
  },
  'zaln-e': {
    displayName: 'Alignment end milestone',
    type: 'milestone',
    styleType: 'ms',
  },
};

// Export note content markers for use in visitors
export const noteContentMarkers = new Set([
  'fr',
  'ft',
  'fk',
  'fq',
  'fqa',
  'fl',
  'fp',
  'fv',
  'fdc',
  'fm',
  'xo',
  'xt',
  'xk',
  'xq',
  'xot',
  'xnt',
  'xdc',
]);

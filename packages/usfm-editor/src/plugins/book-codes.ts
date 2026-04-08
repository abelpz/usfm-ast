/**
 * Standard USFM book codes with canonical English names.
 * Each entry is [code, name] — codes are 3 uppercase alphanumeric characters.
 * Source: USFM 3.x book identification registry.
 *
 * Apocrypha / deuterocanon entries are kept in {@link USFM_BOOK_CODES_APOCRYPHA} only — they are
 * omitted from the combobox list but remain in {@link KNOWN_BOOK_CODES} for validation.
 */
export const USFM_BOOK_CODES: readonly [code: string, name: string][] = [
  // Old Testament
  ['GEN', 'Genesis'],
  ['EXO', 'Exodus'],
  ['LEV', 'Leviticus'],
  ['NUM', 'Numbers'],
  ['DEU', 'Deuteronomy'],
  ['JOS', 'Joshua'],
  ['JDG', 'Judges'],
  ['RUT', 'Ruth'],
  ['1SA', '1 Samuel'],
  ['2SA', '2 Samuel'],
  ['1KI', '1 Kings'],
  ['2KI', '2 Kings'],
  ['1CH', '1 Chronicles'],
  ['2CH', '2 Chronicles'],
  ['EZR', 'Ezra'],
  ['NEH', 'Nehemiah'],
  ['EST', 'Esther'],
  ['JOB', 'Job'],
  ['PSA', 'Psalms'],
  ['PRO', 'Proverbs'],
  ['ECC', 'Ecclesiastes'],
  ['SNG', 'Song of Solomon'],
  ['ISA', 'Isaiah'],
  ['JER', 'Jeremiah'],
  ['LAM', 'Lamentations'],
  ['EZK', 'Ezekiel'],
  ['DAN', 'Daniel'],
  ['HOS', 'Hosea'],
  ['JOL', 'Joel'],
  ['AMO', 'Amos'],
  ['OBA', 'Obadiah'],
  ['JON', 'Jonah'],
  ['MIC', 'Micah'],
  ['NAM', 'Nahum'],
  ['HAB', 'Habakkuk'],
  ['ZEP', 'Zephaniah'],
  ['HAG', 'Haggai'],
  ['ZEC', 'Zechariah'],
  ['MAL', 'Malachi'],
  // New Testament
  ['MAT', 'Matthew'],
  ['MRK', 'Mark'],
  ['LUK', 'Luke'],
  ['JHN', 'John'],
  ['ACT', 'Acts'],
  ['ROM', 'Romans'],
  ['1CO', '1 Corinthians'],
  ['2CO', '2 Corinthians'],
  ['GAL', 'Galatians'],
  ['EPH', 'Ephesians'],
  ['PHP', 'Philippians'],
  ['COL', 'Colossians'],
  ['1TH', '1 Thessalonians'],
  ['2TH', '2 Thessalonians'],
  ['1TI', '1 Timothy'],
  ['2TI', '2 Timothy'],
  ['TIT', 'Titus'],
  ['PHM', 'Philemon'],
  ['HEB', 'Hebrews'],
  ['JAS', 'James'],
  ['1PE', '1 Peter'],
  ['2PE', '2 Peter'],
  ['1JN', '1 John'],
  ['2JN', '2 John'],
  ['3JN', '3 John'],
  ['JUD', 'Jude'],
  ['REV', 'Revelation'],
  // Peripheral / other
  ['FRT', 'Front Matter'],
  ['BAK', 'Back Matter'],
  ['OTH', 'Other Matter'],
  ['INT', 'Introduction'],
  ['CNC', 'Concordance'],
  ['GLO', 'Glossary'],
  ['TDX', 'Topical Index'],
  ['NDX', 'Names Index'],
  ['XXA', 'Extra A'],
  ['XXB', 'Extra B'],
  ['XXC', 'Extra C'],
  ['XXD', 'Extra D'],
  ['XXE', 'Extra E'],
  ['XXF', 'Extra F'],
  ['XXG', 'Extra G'],
];

/** Deuterocanon / apocrypha (registry codes — not shown in the book-code combobox). */
export const USFM_BOOK_CODES_APOCRYPHA: readonly [code: string, name: string][] = [
  ['TOB', 'Tobit'],
  ['JDT', 'Judith'],
  ['ESG', 'Esther (Greek)'],
  ['WIS', 'Wisdom of Solomon'],
  ['SIR', 'Sirach'],
  ['BAR', 'Baruch'],
  ['LJE', 'Letter of Jeremiah'],
  ['S3Y', 'Song of the Three Young Men'],
  ['SUS', 'Susanna'],
  ['BEL', 'Bel and the Dragon'],
  ['1MA', '1 Maccabees'],
  ['2MA', '2 Maccabees'],
  ['3MA', '3 Maccabees'],
  ['4MA', '4 Maccabees'],
  ['1ES', '1 Esdras'],
  ['2ES', '2 Esdras'],
  ['MAN', 'Prayer of Manasseh'],
  ['PS2', 'Psalm 151'],
  ['ODA', 'Odae / Odes'],
  ['PSS', 'Psalms of Solomon'],
  ['EZA', 'Ezra Apocalypse'],
  ['5EZ', '5 Ezra'],
  ['6EZ', '6 Ezra'],
  ['DAG', 'Daniel (Greek)'],
  ['PS3', 'Psalms 152–155'],
  ['2BA', '2 Baruch (Apocalypse)'],
  ['LBA', 'Letter of Baruch'],
  ['JUB', 'Jubilees'],
  ['ENO', 'Enoch'],
  ['1MQ', '1 Meqabyan'],
  ['2MQ', '2 Meqabyan'],
  ['3MQ', '3 Meqabyan'],
  ['REP', 'Reproof'],
  ['4BA', '4 Baruch'],
  ['LAO', 'Laodiceans'],
];

/** Set of all known official codes for fast lookup (includes apocrypha). */
export const KNOWN_BOOK_CODES = new Set(
  [...USFM_BOOK_CODES, ...USFM_BOOK_CODES_APOCRYPHA].map(([c]) => c)
);

/** Filter the list by a raw query (matched against code prefix + name substring, case-insensitive). */
export function filterBookCodes(query: string): readonly [code: string, name: string][] {
  const q = query.toUpperCase().trim();
  if (!q) return USFM_BOOK_CODES;
  return USFM_BOOK_CODES.filter(
    ([code, name]) =>
      code.startsWith(q) || code.includes(q) || name.toUpperCase().includes(query.trim().toUpperCase())
  );
}

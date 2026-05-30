/**
 * Paratext per-book file prefix (2-digit or A0-style) — mirrors
 * `ptxprint.utils` bookcodes (see ptx2pdf `python/lib/ptxprint/utils.py`).
 */
const BOOKSLIST = `GEN|50 EXO|40 LEV|27 NUM|36 DEU|34 JOS|24 JDG|21 RUT|4 1SA|31 2SA|24 1KI|22 2KI|25 1CH|29 2CH|36 EZR|10 NEH|13
        EST|10 JOB|42 PSA|150 PRO|31 ECC|12 SNG|8 ISA|66 JER|52 LAM|5 EZK|48 DAN|12 HOS|14 JOL|3 AMO|9 OBA|1 JON|4 MIC|7 NAM|3
        HAB|3 ZEP|3 HAG|2 ZEC|14 MAL|4 ZZZ|0
        MAT|28 MRK|16 LUK|24 JHN|21 ACT|28 ROM|16 1CO|16 2CO|13 GAL|6 EPH|6 PHP|4 COL|4
        1TH|5 2TH|3 1TI|6 2TI|4 TIT|3 PHM|1 HEB|13 JAS|5 1PE|5 2PE|3 1JN|5 2JN|1 3JN|1 JUD|1 REV|22
        TOB|14 JDT|16 ESG|10 WIS|19 SIR|51 BAR|6 LJE|1 S3Y|1 SUS|1 BEL|1 1MA|16 2MA|15 3MA|7 4MA|18 1ES|9 2ES|16 MAN|1 PS2|1
        ZZZ|0 ZZZ|0 ZZZ|0 ZZZ|0 ZZZ|0 ZZZ|0 ZZZ|0 ZZZ|0 XXA|999 XXB|999 XXC|999 XXD|999 XXE|999 XXF|999 XXG|999 FRT|0 BAK|999 OTH|999 XXM|0 XXS|0 ZZZ|0
        ZZZ|0 ZZZ|0 INT|999 CNC|999 GLO|999 TDX|999 NDX|999 DAG|14 ZZZ|0 ZZZ|0 ZZZ|0 ZZZ|0 ZZZ|0 ZZZ|0 ZZZ|0 ZZZ|0 ZZZ|0 ZZZ|0 LAO|1`;

const END_BK_CODES: Record<string, string> = {
  XXG: '100',
  FRT: 'A0',
  BAK: 'A1',
  OTH: 'A2',
  INT: 'A7',
  CNC: 'A8',
  GLO: 'A9',
  TDX: 'B0',
  NDX: 'B1',
  DAG: 'B2',
  LAO: 'C3',
  XXM: '101',
  XXS: '102',
};

function isSkippedToken(t: string): boolean {
  return t.length >= 2 && t.slice(-2) === '|0';
}

function buildBookCodeMap(): ReadonlyMap<string, string> {
  const tokens = BOOKSLIST.trim().split(/\s+/).slice(0, 99);
  const m = new Map<string, string>();
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (isSkippedToken(t)) continue;
    const book = t.split('|')[0]!;
    m.set(book, String(i + 1).padStart(2, '0'));
  }
  for (const [k, v] of Object.entries(END_BK_CODES)) {
    m.set(k, v);
  }
  return m;
}

const BOOK_CODE_MAP = buildBookCodeMap();

/** Exit code used when `ptxprint` returns 0 but the expected PDF path is missing. */
export const PTXPRINT_MISSING_PDF_CODE = -2;

/** Two-digit or letter-digit prefix used before the 3-letter book id in Paratext filenames. */
export function getParatextFilePrefix(bookCode: string): string {
  const u = bookCode.trim().toUpperCase();
  const v = BOOK_CODE_MAP.get(u);
  if (v === undefined) {
    throw new Error(
      `Unknown USFM book code "${bookCode}" for Paratext filename mapping. Use a standard \\id code.`,
    );
  }
  return v;
}

/** Alias for {@link getParatextFilePrefix} (same Paratext numeric / letter prefix). */
export function getParatextNumber(bookCode: string): string {
  return getParatextFilePrefix(bookCode);
}

/** @internal — exposed for unit tests */
export function __getBookCodeMapSize(): number {
  return BOOK_CODE_MAP.size;
}

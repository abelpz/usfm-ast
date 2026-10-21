const ID_LINE = /^\uFEFF?\\id\s+(\S{3})\s*/;

/** Extract 3-letter book code from the first \\id line of USFM text. */
export function extractBookId(usfm: string): string {
  const lines = usfm.split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('\\rem')) continue;
    const m = t.match(ID_LINE);
    if (m?.[1]) return m[1].toUpperCase();
    break;
  }
    throw new Error('USFM must begin with a \\id line containing a 3-letter book code.');
}

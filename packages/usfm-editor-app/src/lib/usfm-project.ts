/** Extract 3-letter (or 2+ digit) book code from `\\id` line. */
export function extractBookCodeFromUsfm(usfm: string): string | null {
  const m = usfm.match(/\\id\s+([A-Za-z0-9]{2,3})\b/);
  return m?.[1] ? m[1].toUpperCase() : null;
}

export function blankUsfmForBook(code: string, displayName: string): string {
  const c = code.toUpperCase();
  const h = displayName.trim() || c;
  return String.raw`\id ${c} EN
\h ${h}
\mt ${h}

\c 1
\p
\v 1 
`;
}

/** Blank translation shell matching the source book's `\\id` code. */
export function blankTranslationFromSourceUsfm(sourceUsfm: string, displayName?: string): string {
  const code = extractBookCodeFromUsfm(sourceUsfm) ?? 'UNK';
  const name = displayName?.trim() || code;
  return blankUsfmForBook(code, name);
}

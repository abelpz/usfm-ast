/**
 * Example data + **minimum** types for unfoldingWord-style word alignment tokenization.
 *
 * uW tokenization can attach more fields (e.g. original: `strong`, `lemma`, `morph` from `\\zaln-s`;
 * gateway: extra attrs from `\\w`). Those are intentionally omitted here—extend
 * {@link AlignmentWordToken} or use discriminated source/target types when needed.
 */

export const usfmSource = `\\c 1 \\p \\v 1 Παῦλος, δοῦλος Θεοῦ, ἀπόστολος δὲ Ἰησοῦ Χριστοῦ`;
export const usfmTarget = `\\c 1 \\p \\v 1 Pablo, esclavo de Dios y apostol de Jesucristo`;

/** Verse-local surface identity (maps to `x-content` / `\\w` text + occurrence attrs in USFM). */
export type AlignmentWordToken = {
  /** Verse ref within chapter, e.g. `"1:1"` (or later a full SID like `"TIT 1:1"`). */
  ref: string;
  content: string;
  occurrence: number;
  occurrences: number;
};

/**
 * One alignment group: indices into parallel {@link AlignmentWordToken} arrays for the same verse.
 * Supports 1:1, 1:N, N:1, and N:M.
 */
export type AlignmentTokenGroup = {
  source: number[];
  target: number[];
};

/** Full aligned token set for a single verse (or one slice of a document). */
export type AlignedTokenSet = {
  sourceTokens: AlignmentWordToken[];
  targetTokens: AlignmentWordToken[];
  groups: AlignmentTokenGroup[];
};

export const tokenizedSource: AlignmentWordToken[] = [
  { ref: '1:1', content: 'Παῦλος', occurrence: 1, occurrences: 1 },
  { ref: '1:1', content: 'δοῦλος', occurrence: 1, occurrences: 1 },
  { ref: '1:1', content: 'Θεοῦ', occurrence: 1, occurrences: 2 },
  { ref: '1:1', content: 'ἀπόστολος', occurrence: 1, occurrences: 1 },
  { ref: '1:1', content: 'δὲ', occurrence: 1, occurrences: 1 },
  { ref: '1:1', content: 'Ἰησοῦ', occurrence: 1, occurrences: 1 },
  { ref: '1:1', content: 'Χριστοῦ', occurrence: 1, occurrences: 1 },
];

export const tokenizedTarget: AlignmentWordToken[] = [
  { ref: '1:1', content: 'Pablo', occurrence: 1, occurrences: 1 },
  { ref: '1:1', content: 'esclavo', occurrence: 1, occurrences: 1 },
  { ref: '1:1', content: 'de', occurrence: 1, occurrences: 2 },
  { ref: '1:1', content: 'Dios', occurrence: 1, occurrences: 1 },
  { ref: '1:1', content: 'y', occurrence: 1, occurrences: 1 },
  { ref: '1:1', content: 'apostol', occurrence: 1, occurrences: 1 },
  { ref: '1:1', content: 'de', occurrence: 2, occurrences: 2 },
  { ref: '1:1', content: 'Jesucristo', occurrence: 1, occurrences: 1 },
];

/**
 * Alignment over {@link tokenizedSource} / {@link tokenizedTarget} matching the structure of
 * {@link sourceAlignedUsfm} (1:1, 1:2, 2:2 for nested Greek → Spanish).
 */
export const alignedTokens: AlignedTokenSet = {
  sourceTokens: tokenizedSource,
  targetTokens: tokenizedTarget,
  groups: [
    { source: [0], target: [0] },
    { source: [1], target: [1] },
    { source: [2], target: [2, 3] },
    { source: [3], target: [5] },
    { source: [4], target: [4] },
    { source: [5, 6], target: [6, 7] },
  ],
};

/** Sample aligned USFM for the gateway line (wording may differ from {@link usfmTarget}). */
export const sourceAlignedUsfm = `
\\c 1 \\p \\v 1
\\zaln-s |x-occurrence="1" x-occurrences="1" x-content="Παῦλος"\\*
\\w Pablo|x-occurrence="1" x-occurrences="1"\\w*
\\zaln-e\\*,
\\zaln-s |x-occurrence="1" x-occurrences="1" x-content="δοῦλος"\\*
\\w siervo|x-occurrence="1" x-occurrences="1"\\w*
\\zaln-e\\*
\\zaln-s |x-occurrence="1" x-occurrences="2" x-content="Θεοῦ"\\*
\\w de|x-occurrence="1" x-occurrences="6"\\w*
\\w Dios|x-occurrence="1" x-occurrences="2"\\w*
\\zaln-e\\*
\\zaln-s |x-occurrence="1" x-occurrences="1" x-content="δὲ"\\*
\\w y|x-occurrence="1" x-occurrences="2"\\w*
\\zaln-e\\*
\\zaln-s |x-occurrence="1" x-occurrences="1" x-content="ἀπόστολος"\\*
\\w apóstol|x-occurrence="1" x-occurrences="1"\\w*
\\zaln-e\\*
\\zaln-s |x-occurrence="1" x-occurrences="1" x-content="Ἰησοῦ"\\*
\\zaln-s |x-occurrence="1" x-occurrences="1" x-content="Χριστοῦ"\\*
\\w de|x-occurrence="2" x-occurrences="6"\\w*
\\w Jesucristo|x-occurrence="1" x-occurrences="1"\\w*
\\zaln-e\\*
\\zaln-e\\*`;

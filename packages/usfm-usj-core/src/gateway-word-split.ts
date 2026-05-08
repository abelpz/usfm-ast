/**
 * Whitespace word splitting and surface normalization for **alignment** / gateway text.
 * (Diff UIs may use a richer tokenizer; this stays the single source for `stripAlignments`
 * reconciliation and `AlignedWord` matching.)
 */

/** Split gateway line into words (whitespace-separated, trimmed runs). */
export function tokenizeWords(line: string): string[] {
  return line.trim().split(/\s+/).filter((w) => w.length > 0);
}

/**
 * Strip leading/trailing characters that are not letters, numbers, or apostrophe (incl. curly apostrophe).
 * Same rule as alignment rebuild so "Pablo," ↔ "Pablo" and "Παῦλος," ↔ "Παῦλος" align.
 */
export function normalizeWordForAlignmentMatch(s: string): string {
  return s.replace(/^[^\p{L}\p{N}'\u2019]+|[^\p{L}\p{N}'\u2019]+$/gu, '');
}

/** Compare gateway / reference word surfaces for alignment (ignores attached punctuation). */
export function alignmentWordSurfacesEqual(a: string, b: string): boolean {
  return normalizeWordForAlignmentMatch(a) === normalizeWordForAlignmentMatch(b);
}

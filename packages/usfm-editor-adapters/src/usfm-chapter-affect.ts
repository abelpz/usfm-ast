/**
 * Derives which USFM chapters genuinely differ between two sides, by slicing
 * the document text at `\c N` boundaries and comparing normalized chunks.
 *
 * This is more reliable than reading `op.path.chapter` from OT operations,
 * because the OT engine places all unresolvable conflicts in a synthetic
 * chapter-0 bucket regardless of where the actual content difference is.
 */

/**
 * Split a USFM string into chapter-keyed chunks.
 * Key 0 = everything before the first `\c` (front matter: \id, \h, \toc*, \mt*, \rem …).
 * Key n = the block starting at `\c n` (includes the chapter node itself).
 *
 * Whitespace is normalized within each chunk (runs of whitespace → single space,
 * leading/trailing trimmed) so purely cosmetic differences (line-wrapping, trailing
 * newlines) don't create false positives.
 */
export function sliceUsfmByChapter(usfm: string): Map<number, string> {
  const result = new Map<number, string>();
  const lines = usfm.split('\n');

  let currentChapter = 0;
  let buffer: string[] = [];

  const flush = () => {
    const raw = buffer.join('\n');
    const normalized = raw.replace(/\s+/g, ' ').trim();
    if (normalized) result.set(currentChapter, normalized);
    buffer = [];
  };

  for (const line of lines) {
    // Match \c followed by whitespace and a number (the chapter marker).
    const m = /^\\c\s+(\d+)/.exec(line.trim());
    if (m) {
      flush();
      currentChapter = parseInt(m[1], 10);
    }
    buffer.push(line);
  }
  flush();

  return result;
}

/**
 * Return the set of chapter numbers (0 = front matter) where `ours` and
 * `theirs` differ.  A chapter present in only one side always counts as
 * different.
 */
export function affectedChaptersFromUsfm(ours: string, theirs: string): Set<number> {
  const oursSlices = sliceUsfmByChapter(ours);
  const theirsSlices = sliceUsfmByChapter(theirs);
  const affected = new Set<number>();

  const allKeys = new Set([...oursSlices.keys(), ...theirsSlices.keys()]);
  for (const ch of allKeys) {
    const oChunk = oursSlices.get(ch) ?? '';
    const tChunk = theirsSlices.get(ch) ?? '';
    if (oChunk !== tChunk) affected.add(ch);
  }

  return affected;
}

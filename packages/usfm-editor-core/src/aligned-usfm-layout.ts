/**
 * How aligned USFM is laid out in its file.
 */

/** What a line begins with stays on it: its paragraph mark, and the number of its verse. */
const LINE_LEAD = /^(?:\\(?!zaln-|w\s|v\s)[a-z]+\d*\s+)?(?:\\v\s+\S+\s+)?/;

/**
 * Aligned USFM laid out as unfoldingWord's tools write it: a group to a line, each further word of a group on a
 * line of its own, and the mark of a chunk (`\ts\*`) on a line of its own after an empty one.
 *
 * It was written a verse to a line, in lines of five thousand characters. The change of one word showed as the
 * whole verse changed, two people who had each touched a different word of a verse were in conflict, and a file
 * written by those tools came back with every line of it changed. Only white space moves: a line end where a
 * space was is the same space to whoever reads the file. A file with no alignment is left as it is.
 */
export function layoutAlignedUsfm(usfm: string): string {
  if (!/\\zaln-s\b/.test(usfm)) return usfm;
  const eol = usfm.includes('\r\n') ? '\r\n' : '\n';
  const lines = usfm.split(/\r?\n/).map((line) => {
    if (!line.includes('\\zaln-s')) return line;
    const lead = LINE_LEAD.exec(line)?.[0] ?? '';
    return lead + line.slice(lead.length).replace(/[ \t]+(?=\\zaln-s\b|\\w\s)/g, eol);
  });
  const text = lines
    .join(eol)
    .replace(/[ \t]*(?:\r?\n)*[ \t]*\\ts\\\*[ \t]*(?:\r?\n)?/g, `${eol}${eol}\\ts\\*${eol}`)
    .replace(/(?:\r?\n){3,}/g, `${eol}${eol}`)
    .replace(/[ \t]+(?=\r?\n)/g, '')
    .replace(/^(?:\r?\n)+/, '');
  return `${text.replace(/\s+$/, '')}${eol}`;
}

/**
 * The version a file says it is written in (`\usfm 3.0`), kept as it said it. A writer puts the version it writes
 * by default there, and a file that only passed through came out saying another one.
 */
export function keepUsfmVersionLine(written: string, original: string): string {
  const said = /^\\usfm[ \t]+(\S+)[ \t]*$/m.exec(original)?.[1];
  return said ? written.replace(/^\\usfm[ \t]+\S+[ \t]*$/m, `\\usfm ${said}`) : written;
}

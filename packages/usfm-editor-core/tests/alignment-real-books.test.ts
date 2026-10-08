/**
 * Whole books as they are in Door43, read and written back the way an application does each time somebody saves
 * the alignment of one verse: nothing of the rest of the book may change.
 *
 * - `psa.ult-aligned`: Psalms 3, 4 and 11 of the ULT, as they are in it. The titles of the first two are written
 *   before their first verse (`\d`) and aligned, with their words numbered on their own; the one of the third,
 *   after the number of its first verse. Each «Selah» is aligned inside a character style (`\qs`).
 * - `jon.tpl-aligned`: Jonah of a gateway team, written by unfoldingWord's tools. Chapter 2 is a psalm: its verses
 *   are on two and three lines (`\q`, `\q2`), and it has straight quotation marks.
 * - `jud.ult-aligned`: Jude of the ULT. A group to a line, chunk marks (`\ts\*`), a footnote, groups written in
 *   two pieces («May … be multiplied»).
 * - `jud.tpl-nested-writer`: Jude as this library wrote it before: a verse to a line, punctuation inside the
 *   groups, a group interrupted by others left open around them.
 * - `tit.tpl-aligned`, `alignment`: the fixtures the other tests use.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { extractAlignmentDocumentFromUsfm, mergeAlignmentIntoUsfm, stripAlignmentFromUsfm } from '../src/alignment-directory';

const fixture = (name: string) => readFileSync(join(__dirname, '../../usfm-parser/tests/fixtures/usfm', name), 'utf8');
const translation = { id: 'book' };
const source = { id: 'original' };

/**
 * The text of each verse as any reader of USFM takes it: the marks out, the white space as it is written. Worked
 * out from the file with expressions of its own, not with the code under test.
 */
function versesAsWritten(usfm: string): Map<string, string> {
  const plain = usfm
    .replace(/\\f\s[\s\S]*?\\f\*/g, '')
    .replace(/\\zaln-s\s*\|[^\\]*\\\*/g, '')
    .replace(/\\zaln-e\\\*/g, '')
    .replace(/\\w\s+([^|\\]*)(?:\|[^\\]*)?\\w\*/g, '$1')
    .replace(/\\ts\\\*/g, ' ');
  const out = new Map<string, string>();
  let chapter = '';
  for (const m of plain.matchAll(/\\c\s+(\d+)|\\v\s+(\S+)\s([\s\S]*?)(?=\\c\s|\\v\s|$)/g)) {
    if (m[1]) chapter = m[1];
    else out.set(`${chapter}:${m[2]}`, m[3]!.replace(/\\[a-z]+\d*\*?(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim());
  }
  return out;
}

/** Paragraphs, chapters, verses and chunk marks, in the order the file has them. */
const structure = (usfm: string) =>
  (usfm.match(/\\(?:c\s+\d+|v\s+\S+|ts\\\*|(?:p|m|nb|b|pi\d?|q\d?|qm\d?|li\d?|s\d?|cl|d|mt\d?|h|toc\d|ide)(?=\s|$))/gm) ?? []).map((mark) =>
    mark.replace(/\s+/g, ' '),
  );

/** How many words of the file are inside a group. */
function alignedWords(usfm: string): number {
  let depth = 0;
  let count = 0;
  for (const m of usfm.matchAll(/\\zaln-s\b|\\zaln-e\\\*|\\w\s/g)) {
    if (m[0].startsWith('\\zaln-s')) depth++;
    else if (m[0].startsWith('\\zaln-e')) depth--;
    else if (depth > 0) count++;
  }
  return count;
}

const groupsOf = (usfm: string) => {
  const { verses } = extractAlignmentDocumentFromUsfm(usfm, translation, source);
  return Object.fromEntries(
    Object.entries(verses).map(([sid, groups]) => [
      sid,
      groups.map((g) => `${g.sources.map((s) => `${s.content}#${s.occurrence}`).join('+')} = ${g.targets.map((t) => `${t.word}#${t.occurrence}`).join(' ')}`),
    ]),
  );
};

/** What the lines of a verse begin with: its paragraph mark and its number. */
const LEAD = /^(?:\\(?!zaln-|w\s|v\s)[a-z]+\d*\s+)?(?:\\v\s+\S+\s+)?/;

const BOOKS = ['psa.ult-aligned.usfm', 'jon.tpl-aligned.usfm', 'jud.ult-aligned.usfm', 'jud.tpl-nested-writer.usfm', 'tit.tpl-aligned.usfm', 'alignment.usfm'];

describe.each(BOOKS)('%s read and written back', (name) => {
  const usfm = fixture(name);
  const saved = mergeAlignmentIntoUsfm(usfm, extractAlignmentDocumentFromUsfm(usfm, translation, source));

  it('is read with the text of every verse as it is written', () => {
    expect([...versesAsWritten(stripAlignmentFromUsfm(usfm))]).toEqual([...versesAsWritten(usfm)]);
  });

  it('is read with every aligned word in a group', () => {
    const targets = Object.values(extractAlignmentDocumentFromUsfm(usfm, translation, source).verses)
      .flat()
      .reduce((n, group) => n + group.targets.length, 0);
    expect(targets).toBe(alignedWords(usfm));
  });

  it('keeps the text of every verse', () => {
    expect([...versesAsWritten(saved)]).toEqual([...versesAsWritten(usfm)]);
  });

  it('keeps every group of every verse', () => {
    expect(groupsOf(saved)).toEqual(groupsOf(usfm));
    expect(alignedWords(saved)).toBe(alignedWords(usfm));
  });

  it('keeps what each group says of its original words, an empty lemma included', () => {
    /** The attributes of every group as the file has them written, read with an expression of its own. */
    const sources = (text: string) =>
      [...new Set([...text.matchAll(/\\zaln-s\s*\|([^\\]*)\\\*/g)].map((m) => [...m[1]!.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => `${key}=${value}`).sort().join(' ')))].sort();
    expect(sources(saved)).toEqual(sources(usfm));
  });

  it('keeps its paragraphs, its lines of poetry and its chunk marks where they were', () => {
    expect(structure(saved)).toEqual(structure(usfm));
  });

  it('keeps what it says of itself before the first chapter', () => {
    const head = (text: string) => text.slice(0, text.search(/\\c\s+\d+/)).split(/\r?\n/).map((line) => line.trim()).filter((line) => line && line !== '\\ts\\*');
    expect(head(saved)).toEqual(head(usfm));
  });

  it('is written the same again', () => {
    expect(mergeAlignmentIntoUsfm(saved, extractAlignmentDocumentFromUsfm(saved, translation, source))).toBe(saved);
  });

  it('is laid out a group to a line, with nothing of a verse hanging off the end of another', () => {
    const lines = saved.split('\n');
    const crowded = lines.filter((line) => /[ \t](?:\\zaln-s\b|\\w\s)/.test(line.slice(LEAD.exec(line)![0].length)));
    expect(crowded).toEqual([]);
    expect(saved.endsWith('\n')).toBe(true);
    expect(saved).not.toMatch(/\S[ \t]*\\ts\\\*/);
    // The number of a verse stays on the line of its first words.
    expect(saved).not.toMatch(/\\v\s+\S+[ \t]*\r?\n\\zaln-s/);
  });

  it('never leaves a group open around another one, nor punctuation inside the end of a group', () => {
    let open = 0;
    let wordsIn = 0;
    const nested: number[] = [];
    for (const m of saved.matchAll(/\\zaln-s\b|\\zaln-e\\\*|\\w\s/g)) {
      if (m[0].startsWith('\\zaln-s')) {
        if (open > 0 && wordsIn > 0) nested.push(m.index!);
        open++;
      } else if (m[0].startsWith('\\zaln-e')) {
        open--;
        if (open === 0) wordsIn = 0;
      } else if (open > 0) wordsIn++;
    }
    expect(nested).toEqual([]);
    expect(saved.match(/\\w\*[^\s\\]+\\zaln-e/g) ?? []).toEqual([]);
  });
});

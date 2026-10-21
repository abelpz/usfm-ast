/**
 * What a verse reaches, read and written back: whoever writes the alignment of a book finds each aligned word where
 * whoever read it found it. A heading next to a verse or in the middle of it, the label of the next chapter and the
 * title of a psalm are the places where the two counted different words.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { extractAlignmentDocumentFromUsfm, mergeAlignmentIntoUsfm, stripAlignmentFromUsfm } from '../src/alignment-directory';
import { tokenizeDocument } from '../src/word-identity';
import { USFMParser } from '@usfm-tools/parser';
import { stripAlignments } from '@usfm-tools/usj-core';

const translation = { id: 'book' };
const source = { id: 'original' };
const read = (usfm: string) => extractAlignmentDocumentFromUsfm(usfm, translation, source);
/** The book as an application writes it each time somebody saves: read, and written with what was read. */
const rewrite = (usfm: string) => mergeAlignmentIntoUsfm(usfm, read(usfm));

/** A word aligned to an original word of its own, numbered in its verse as the file numbers it. */
const al = (word: string, occurrence = 1, occurrences = 1) =>
  String.raw`\zaln-s |x-strong="H${word.length}${occurrence}" x-lemma="${word}" x-occurrence="1" x-occurrences="1" x-content="${word.toUpperCase()}${occurrence}"\*\w ${word}|x-occurrence="${occurrence}" x-occurrences="${occurrences}"\w*\zaln-e\*`;

/**
 * Every word the file has marked, in order, with the paragraph it is in, its numbers and the original word of its
 * group: `d of#1/2 = OF1`. Read from the file with expressions of its own, not with the code under test.
 */
function markedWords(usfm: string): string[] {
  const out: string[] = [];
  let para = '';
  let group = '';
  for (const m of usfm.matchAll(/\\zaln-s\s*\|[^\\]*?x-content="([^"]*)"[^\\]*\\\*|\\zaln-e\\\*|\\w\s+([^|\\]*)\|x-occurrence="(\d+)"\s+x-occurrences="(\d+)"\\w\*|\\([a-z]+\d*)(?=\s)/g)) {
    if (m[1] !== undefined) group = m[1];
    else if (m[0].startsWith('\\zaln-e')) group = '';
    else if (m[2] !== undefined) out.push(`${para} ${m[2]}#${m[3]}/${m[4]}${group ? ` = ${group}` : ''}`);
    else if (!['v', 'c', 'id', 'w'].includes(m[5]!)) para = m[5]!;
  }
  return out;
}

/** The lines that begin with a mark, as they are written. */
const lineOf = (usfm: string, mark: string) => usfm.split(/\r?\n/).find((line) => line.startsWith(`\\${mark} `) || line === `\\${mark}`);

describe('a verse followed by a heading', () => {
  const usfm = String.raw`\id JON
\c 1
\p
\v 1 La ${al('palabra')} vino a ${al('Jonás', 1, 2)} y ${al('Jonás', 2, 2)} huyó.
\s1 Jonás huye de la palabra
\p
\v 2 ${al('Jonás')} bajó.
`;

  it('is written back with its words where they were, and the heading in plain words', () => {
    const saved = rewrite(usfm);
    expect(markedWords(saved)).toEqual(markedWords(usfm));
    expect(lineOf(saved, 's1')).toBe(String.raw`\s1 Jonás huye de la palabra`);
  });

  it('has its words numbered without those of the heading', () => {
    const numbered = tokenizeDocument(new USFMParser({ silentConsole: true }).parse(stripAlignmentFromUsfm(usfm)).toJSON() as { content: unknown[] });
    expect(numbered['JON 1:1']!.filter((t) => t.surface === 'Jonás').map((t) => `${t.occurrence}/${t.occurrences}`)).toEqual(['1/2', '2/2']);
    expect(numbered['JON 1:1']!.filter((t) => t.surface === 'palabra').map((t) => `${t.occurrence}/${t.occurrences}`)).toEqual(['1/1']);
  });
});

describe('the last verse of a chapter, followed by the label of the next one', () => {
  const usfm = String.raw`\id JON
\c 2
\p
\v 10 Y el pez vomitó a ${al('Jonás')} en el ${al('capítulo')} final.
\c 3
\cl capítulo 3
\p
\v 1 Otro ${al('capítulo')} para ${al('Jonás')}.
`;

  it('is written back with its words where they were, and the label as it was', () => {
    const saved = rewrite(usfm);
    expect(markedWords(saved)).toEqual(markedWords(usfm));
    expect(lineOf(saved, 'cl')).toBe(String.raw`\cl capítulo 3`);
  });

  it('is read with its own words only', () => {
    const numbered = tokenizeDocument(new USFMParser({ silentConsole: true }).parse(stripAlignmentFromUsfm(usfm)).toJSON() as { content: unknown[] });
    expect(numbered['JON 2:10']!.map((t) => t.surface).join(' ')).toBe('Y el pez vomitó a Jonás en el capítulo final.');
    expect(numbered['JON 2:10']!.find((t) => t.surface === 'capítulo')).toMatchObject({ occurrence: 1, occurrences: 1 });
  });
});

describe('a heading written in the middle of a verse that repeats a word of it', () => {
  // The numbers of each word are the ones a writer of USFM gives them: among the words of the verse, the heading left out.
  const usfm = String.raw`\id TST
\c 1
\p
\v 1 la ${al('casa', 1, 2)} de
\s1 La casa nueva
\p la ${al('casa', 2, 2)} grande
\v 2 otra ${al('casa')}
`;

  it('is written back with each word under its own number, and none in the heading', () => {
    const saved = rewrite(usfm);
    expect(markedWords(saved)).toEqual(['p casa#1/2 = CASA1', 'p casa#2/2 = CASA2', 'p casa#1/1 = CASA1']);
    expect(lineOf(saved, 's1')).toBe(String.raw`\s1 La casa nueva`);
  });

  it('keeps the alignment of the second word when the first one is taken away', () => {
    const doc = read(usfm);
    const saved = mergeAlignmentIntoUsfm(usfm, { ...doc, verses: { ...doc.verses, 'TST 1:1': doc.verses['TST 1:1']!.slice(1) } });
    expect(markedWords(saved)).toEqual(['p casa#2/2 = CASA2', 'p casa#1/1 = CASA1']);
    // The one that is left is the one after the heading.
    expect(saved).toContain(['\\v 1 la casa de', '\\s1 La casa nueva', '\\p la', '\\zaln-s |'].join('\n'));
  });
});

describe('the title of a psalm', () => {
  const usfm = String.raw`\id PSA
\cl Psalm
\c 2
\q1 \v 12 ${al('seekers')} ${al('of', 1, 2)} ${al('refuge')} ${al('of', 2, 2)} him.
\c 3
\d ${al('A')} ${al('psalm')} ${al('of', 1, 2)} ${al('David')}, the ${al('son')} ${al('of', 2, 2)} Jesse
\q1 \v 1 ${al('Yahweh')}, how many!
\qs ${al('Selah')}\qs*
`;

  it('is read as verse 0 of its psalm, with its words numbered on their own', () => {
    const { verses } = read(usfm);
    expect(Object.keys(verses)).toEqual(['PSA 2:12', 'PSA 3:0', 'PSA 3:1']);
    expect(verses['PSA 3:0']!.flatMap((g) => g.targets).map((t) => `${t.word}#${t.occurrence}/${t.occurrences}`)).toEqual(['A#1/1', 'psalm#1/1', 'of#1/2', 'David#1/1', 'son#1/1', 'of#2/2']);
  });

  it('keeps its alignment when the book is written back', () => {
    const saved = rewrite(usfm);
    expect(markedWords(saved)).toEqual(markedWords(usfm));
    expect(markedWords(saved).filter((word) => word.startsWith('d '))).toEqual(['d A#1/1 = A1', 'd psalm#1/1 = PSALM1', 'd of#1/2 = OF1', 'd David#1/1 = DAVID1', 'd son#1/1 = SON1', 'd of#2/2 = OF2']);
    expect(rewrite(saved)).toBe(saved);
  });

  it('keeps its alignment when the one of another verse is saved, and loses only its own', () => {
    const doc = read(usfm);
    const { 'PSA 2:12': _last, ...withoutLast } = doc.verses;
    expect(markedWords(mergeAlignmentIntoUsfm(usfm, { ...doc, verses: withoutLast })).map((word) => word.split(' ')[0])).toEqual(['d', 'd', 'd', 'd', 'd', 'd', 'q1', 'qs']);
    const { 'PSA 3:0': _title, ...withoutTitle } = doc.verses;
    const saved = mergeAlignmentIntoUsfm(usfm, { ...doc, verses: withoutTitle });
    expect(lineOf(saved, 'd')).toBe(String.raw`\d A psalm of David, the son of Jesse`);
    expect(markedWords(saved).map((word) => word.split(' ')[0])).toEqual(['q1', 'q1', 'q1', 'q1', 'q1', 'qs']);
  });

  it('keeps the alignment of a word written inside a character style', () => {
    const saved = rewrite(usfm);
    expect(markedWords(saved).at(-1)).toBe('qs Selah#1/1 = SELAH1');
    expect(saved).toMatch(/\\qs\s+\\zaln-s [^\n]*\\w Selah\|[^\n]*\\zaln-e\\\*\s*\\qs\*/);
  });
});

describe('psalms of the ULT, written back', () => {
  const usfm = readFileSync(join(__dirname, '../../usfm-parser/tests/fixtures/usfm/psa.ult-aligned.usfm'), 'utf8');
  const saved = rewrite(usfm);
  /**
   * The lines of the title of a psalm: from its `\d` to the empty line or the line of poetry after it. Line by
   * line, since a checkout may give the fixture other line ends than the ones a book is written with.
   */
  const titleOf = (text: string, chapter: number) =>
    /\\d [\s\S]*?(?=\r?\n(?:\r?\n|\\q))/.exec(text.slice(text.search(new RegExp(String.raw`\\c ${chapter}\r?\n`))))?.[0].split(/\r?\n/);

  it('have the lines of each title as they were', () => {
    expect(titleOf(usfm, 3)![0]).toMatch(/^\\d \\zaln-s .*\\w A\|/);
    // A word to a line: «A psalm of David, when he fled from the face of Absalom his son».
    expect(titleOf(usfm, 3)).toHaveLength(14);
    expect(titleOf(saved, 3)).toEqual(titleOf(usfm, 3));
    expect(titleOf(saved, 4)).toEqual(titleOf(usfm, 4));
    // The eleventh psalm has its title after the number of its first verse: it is text of that verse.
    expect(titleOf(saved, 11)).toEqual(titleOf(usfm, 11));
  });

  it('have every title under verse 0 of its psalm, and the last verse of a psalm with its own words', () => {
    const { alignments } = stripAlignments(new USFMParser({ silentConsole: true }).parse(saved).toJSON() as { content: unknown[] });
    const wordsOf = (sid: string) => (alignments[sid] ?? []).flatMap((g) => g.targets.map((t) => t.word)).join(' ');
    expect(wordsOf('PSA 3:0')).toBe('A psalm of David when he fled from the face of Absalom his son');
    expect(wordsOf('PSA 4:0')).toBe('For the chief musician with stringed instruments a psalm of David');
    expect(wordsOf('PSA 3:8')).toBe('Salvation is of Yahweh Your blessing is on your people Selah');
  });

  it('have every «Selah» aligned still', () => {
    const selahs = (text: string) => markedWords(text).filter((word) => word.startsWith('qs Selah#1/1 = '));
    expect(selahs(usfm)).toHaveLength(5);
    expect(selahs(saved)).toEqual(selahs(usfm));
  });
});

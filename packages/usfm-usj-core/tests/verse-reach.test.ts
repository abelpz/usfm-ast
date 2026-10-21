/**
 * What a verse reaches, for whoever reads its text, numbers its words or reads its alignment: its own chapter,
 * not the headings written next to it or in the middle of it, not its notes; and the title of a psalm, which is
 * verse 0 of its chapter.
 */
import * as fs from 'fs';
import * as path from 'path';
import { USFMParser } from '@usfm-tools/parser';
import {
  collectVerseTextsFromContent,
  findVerseInlineNodes,
  normalizeWordForAlignmentMatch,
  stripAlignments,
  tokenizeGatewayUsj,
} from '../src';

const parse = (usfm: string) => new USFMParser({ silentConsole: true }).parse(usfm).toJSON() as { content: unknown[] };
const read = (usfm: string) => stripAlignments(parse(usfm));

/** The text of each verse, without the white space a line is written with around it. */
const texts = (usfm: string) =>
  Object.fromEntries(Object.entries(collectVerseTextsFromContent(read(usfm).editable.content as unknown[])).map(([sid, text]) => [sid, text.trim()]));

/** The words of a verse as they are numbered for alignment: `casa#2/2`. */
const numbered = (usfm: string, sid: string) =>
  (tokenizeGatewayUsj(read(usfm).editable)[sid] ?? []).map((t) => `${normalizeWordForAlignmentMatch(t.surface)}#${t.occurrence}/${t.occurrences}`);

/** What each verse has aligned, by the words of the translation: `{ 'PSA 3:0': ['A psalm', 'of David'] }`. */
const aligned = (usfm: string) =>
  Object.fromEntries(Object.entries(read(usfm).alignments).map(([sid, groups]) => [sid, groups.map((g) => g.targets.map((t) => t.word).join(' '))]));

/** A word aligned to an original word of its own, numbered in its verse as the file numbers it. */
const al = (word: string, occurrence = 1, occurrences = 1) =>
  String.raw`\zaln-s |x-strong="H${word.length}${occurrence}" x-lemma="${word}" x-occurrence="1" x-occurrences="1" x-content="${word.toUpperCase()}${occurrence}"\*\w ${word}|x-occurrence="${occurrence}" x-occurrences="${occurrences}"\w*\zaln-e\*`;

describe('the text of a verse', () => {
  it('ends where a heading begins, and goes on after it', () => {
    const usfm = String.raw`\id JON
\c 1
\p
\v 1 La palabra vino a Jonás
\s1 Jonás huye
\p y Jonás se levantó.
\v 2 Y bajó a Jope.
\s1 La tormenta
\r (Sal 107.23-30)
\p
\v 3 Pero el SEÑOR envió un viento.
`;
    expect(texts(usfm)).toEqual({
      'JON 1:1': 'La palabra vino a Jonás y Jonás se levantó.',
      'JON 1:2': 'Y bajó a Jope.',
      'JON 1:3': 'Pero el SEÑOR envió un viento.',
    });
  });

  it('ends with its chapter: the label of the next one is not its text', () => {
    const usfm = String.raw`\id JON
\c 2
\p
\v 10 Y el pez vomitó a Jonás en tierra firme.
\c 3
\cl Capítulo 3
\p
\v 1 La palabra vino a Jonás por segunda vez.
`;
    expect(texts(usfm)).toEqual({
      'JON 2:10': 'Y el pez vomitó a Jonás en tierra firme.',
      'JON 3:1': 'La palabra vino a Jonás por segunda vez.',
    });
  });

  it('does not have the words of its footnote, nor two spaces where the note was', () => {
    const usfm = String.raw`\id JON
\c 3
\p
\v 3 Tres días \f + \fr 3:3 \ft Tres días de camino.\f* de camino.
\v 4 Nínive\f + \fr 3:4 \ft La gran ciudad.\f* será destruida.
`;
    expect(texts(usfm)).toEqual({ 'JON 3:3': 'Tres días de camino.', 'JON 3:4': 'Nínive será destruida.' });
    expect(numbered(usfm, 'JON 3:3')).toEqual(['Tres#1/1', 'días#1/1', 'de#1/1', 'camino#1/1']);
  });

  it('has the words of its character styles, and of a title written after its number', () => {
    const usfm = String.raw`\id PSA
\c 11
\q1 \v 1 \d To the chief musician; of David.
\q1 In \nd Yahweh\nd* I take refuge.
\qs Selah\qs*
`;
    expect(texts(usfm)).toEqual({ 'PSA 11:1': 'To the chief musician; of David. In Yahweh I take refuge. Selah' });
  });

  it('is on as many lines as it is written, each of them apart from the one before', () => {
    const usfm = String.raw`\id PSA
\c 1
\q1 \v 1 de día—
\q2 de noche
`;
    expect(texts(usfm)).toEqual({ 'PSA 1:1': 'de día— de noche' });
    expect(numbered(usfm, 'PSA 1:1')).toEqual(['de#1/2', 'día#1/1', 'de#2/2', 'noche#1/1']);
  });
});

describe('what a chapter says before its first verse', () => {
  const usfm = String.raw`\id PSA
\cl Psalm
\c 2
\q1 \v 12 The happinesses of all the seekers of refuge in him.
\c 3
\d A psalm of David, when he fled from the face of Absalom his son
\q1 \v 1 Yahweh, how many my oppressors have become!
\c 4
\cl Psalm Four
\s1 A heading
\q1 \v 1 Answer me when I call.
`;

  it('is verse 0 of the chapter, and nothing of the verse before it', () => {
    expect(texts(usfm)).toEqual({
      'PSA 2:12': 'The happinesses of all the seekers of refuge in him.',
      'PSA 3:0': 'A psalm of David, when he fled from the face of Absalom his son',
      'PSA 3:1': 'Yahweh, how many my oppressors have become!',
      'PSA 4:1': 'Answer me when I call.',
    });
  });

  it('has its words numbered on their own', () => {
    expect(numbered(usfm, 'PSA 3:0').filter((word) => word.startsWith('of#'))).toEqual(['of#1/2', 'of#2/2']);
    expect(numbered(usfm, 'PSA 2:12').filter((word) => word.startsWith('of#'))).toEqual(['of#1/2', 'of#2/2']);
  });

  it('is found by its key, as a verse is by its own', () => {
    const { content } = parse(usfm);
    expect(findVerseInlineNodes(content, 'PSA 3:0')).toEqual(['A psalm of David, when he fled from the face of Absalom his son']);
    expect(findVerseInlineNodes(content, 'PSA 2:12')).toEqual(['The happinesses of all the seekers of refuge in him.']);
    expect(findVerseInlineNodes(content, 'PSA 4:0')).toEqual([]);
  });
});

describe('the words of a verse, numbered', () => {
  it('does not count the words of a heading written in the middle of it', () => {
    const usfm = String.raw`\id TST
\c 1
\p
\v 1 la ${al('casa', 1, 2)} de
\s1 La casa nueva
\p la ${al('casa', 2, 2)} grande
`;
    expect(numbered(usfm, 'TST 1:1')).toEqual(['la#1/2', 'casa#1/2', 'de#1/1', 'la#2/2', 'casa#2/2', 'grande#1/1']);
    // What the file says of each aligned word is what is read of it.
    expect(read(usfm).alignments['TST 1:1']!.flatMap((g) => g.targets)).toEqual([
      { word: 'casa', occurrence: 1, occurrences: 2 },
      { word: 'casa', occurrence: 2, occurrences: 2 },
    ]);
  });

  it('does not count the words of the label of the chapter that follows', () => {
    const usfm = String.raw`\id TST
\c 1
\p
\v 9 el ${al('capítulo')} final
\c 2
\cl capítulo 2
\p
\v 1 otro ${al('capítulo')}
`;
    expect(numbered(usfm, 'TST 1:9')).toEqual(['el#1/1', 'capítulo#1/1', 'final#1/1']);
    expect(numbered(usfm, 'TST 2:1')).toEqual(['otro#1/1', 'capítulo#1/1']);
  });
});

describe('the alignment that is read', () => {
  it('gives the title of a psalm to its own chapter, not to the last verse of the psalm before', () => {
    const usfm = String.raw`\id PSA
\c 2
\q1 \v 12 ${al('seekers')} ${al('of')} ${al('refuge')}.
\c 3
\d ${al('A')} ${al('psalm')} ${al('of')} ${al('David')}
\q1 \v 1 ${al('Yahweh')}, how many!
`;
    expect(aligned(usfm)).toEqual({
      'PSA 2:12': ['seekers', 'of', 'refuge'],
      'PSA 3:0': ['A', 'psalm', 'of', 'David'],
      'PSA 3:1': ['Yahweh'],
    });
  });

  it('gives the words aligned in a heading to no verse, and leaves the heading in plain words', () => {
    const usfm = String.raw`\id TST
\c 1
\p
\v 1 ${al('uno')}
\s1 ${al('Título')}
\p
\v 2 ${al('dos')}
`;
    expect(aligned(usfm)).toEqual({ 'TST 1:1': ['uno'], 'TST 1:2': ['dos'] });
    expect(JSON.stringify(read(usfm).editable)).toContain('"marker":"s1","content":["Título"]');
  });

  describe('of psalms of the ULT', () => {
    const usfm = fs.readFileSync(path.join(__dirname, '../../usfm-parser/tests/fixtures/usfm/psa.ult-aligned.usfm'), 'utf8');
    const { editable, alignments } = read(usfm);
    const wordsOf = (sid: string) => (alignments[sid] ?? []).flatMap((g) => g.targets.map((t) => t.word)).join(' ');

    it('reads a title written before the first verse as verse 0 of its psalm', () => {
      expect(wordsOf('PSA 3:0')).toBe('A psalm of David when he fled from the face of Absalom his son');
      expect(wordsOf('PSA 4:0')).toBe('For the chief musician with stringed instruments a psalm of David');
      // The last verse of the third psalm ends in its own «Selah».
      expect(wordsOf('PSA 3:8')).toBe('Salvation is of Yahweh Your blessing is on your people Selah');
    });

    it('reads a title written after the number of the first verse as words of that verse', () => {
      expect(wordsOf('PSA 11:1').startsWith('To the chief musician of David In Yahweh I take refuge')).toBe(true);
      expect(alignments['PSA 11:0']).toBeUndefined();
    });

    it('numbers every aligned word as the file numbers it', () => {
      const tokens = tokenizeGatewayUsj(editable);
      const apart: string[] = [];
      let count = 0;
      for (const [sid, groups] of Object.entries(alignments)) {
        for (const target of groups.flatMap((g) => g.targets)) {
          count++;
          const same = (tokens[sid] ?? []).filter((t) => normalizeWordForAlignmentMatch(t.surface) === target.word);
          if (same.length !== target.occurrences || !same[target.occurrence - 1]) apart.push(`${sid} ${target.word}#${target.occurrence}/${target.occurrences}`);
        }
      }
      expect(apart).toEqual([]);
      expect(count).toBe(421);
    });
  });
});

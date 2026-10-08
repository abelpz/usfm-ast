import { readFileSync } from 'fs';
import { join } from 'path';
import {
  extractAlignmentDocumentFromUsfm,
  mergeAlignmentIntoUsfm,
  stripAlignmentFromUsfm,
  swapAlignmentInUsfm,
} from '../src/alignment-directory';
import { keepUsfmVersionLine, layoutAlignedUsfm } from '../src/aligned-usfm-layout';
import { withAlignmentVerses } from '../src/alignment-io';

const alignmentFixture = join(__dirname, '../../usfm-parser/tests/fixtures/usfm/alignment.usfm');

describe('alignment-directory', () => {
  const translation = { id: 'en_tit', language: 'en' };
  const source = { id: 'el_ugnt', language: 'el-x-koine', version: '0.34' };

  it('stripAlignmentFromUsfm removes zaln milestones (fixture)', () => {
    const usfm = readFileSync(alignmentFixture, 'utf8');
    const out = stripAlignmentFromUsfm(usfm);
    expect(out).not.toContain('zaln-s');
    expect(out).not.toContain('zaln-e');
  });

  it('extract + merge round-trips structure (fixture)', () => {
    const usfm = readFileSync(alignmentFixture, 'utf8');
    const doc = extractAlignmentDocumentFromUsfm(usfm, translation, source);
    expect(Object.keys(doc.verses).length).toBeGreaterThan(0);
    const plain = stripAlignmentFromUsfm(usfm);
    const merged = mergeAlignmentIntoUsfm(plain, doc);
    expect(merged).toContain('zaln-s');
  });

  describe('the text of a verse through save after save', () => {
    const verse = (text: string) => `\\id JUD\n\\c 1\n\\p\n\\v 1 ${text}\n`;
    const textOf = (usfm: string) => /\\v 1 (.*)/.exec(stripAlignmentFromUsfm(usfm))?.[1]?.trim();
    /** Each of `words` linked to an original word of its own, numbered as the verse has it. */
    const linking = (text: string, words: string[]) => {
      const all = text.match(/[\p{L}\p{N}]+/gu) ?? [];
      const seen: Record<string, number> = {};
      const groups = words.map((word, i) => {
        seen[word] = (seen[word] ?? 0) + 1;
        return {
          sources: [{ strong: `G${1000 + i}`, lemma: `l${i}`, content: `g${i}`, occurrence: 1, occurrences: 1 }],
          targets: [{ word, occurrence: seen[word]!, occurrences: all.filter((w) => w === word).length }],
        };
      });
      return withAlignmentVerses(extractAlignmentDocumentFromUsfm(verse(text), translation, source), { 'JUD 1:1': groups });
    };
    const savedTwice = (text: string, words: string[]) => {
      const once = mergeAlignmentIntoUsfm(verse(text), linking(text, words));
      const again = mergeAlignmentIntoUsfm(once, extractAlignmentDocumentFromUsfm(once, translation, source));
      return { once, again };
    };

    it.each([
      ['a quotation after a colon', 'Más bien, dijo: «¡Que el Señor te reprenda!»'],
      ['dashes around an aside', 'en sus fiestas de amor —arrecifes ocultos— banquetean sin temor'],
      ['supplied words in braces', 'deseo recordárselas. {Recuerden} que, en cambio, {solamente} dijo'],
      ['brackets and a question', 'les dijo (a ellos): ¿quién es? [No lo sabían].'],
      ['straight quotation marks', 'Yo mismo dije: "Yo he sido apartado de tus ojos"; pero "aún" no.'],
      ['a straight quotation mark that opens with nothing before it', 'la palabra "amor" es una sola'],
      ['an ellipsis before a word', 'y dijo …vengan todos'],
      ['a dash with a space on each side', 'la paz — la verdadera — viene de Dios'],
      ['words joined by a hyphen and by a dash', 'el bien-amado del gran día—como Sodoma'],
      ['a number with a point in it', 'hay más de 120.000 personas en ella'],
    ])('keeps its spaces with every word aligned: %s', (_name, text) => {
      const { once, again } = savedTwice(text, text.match(/[\p{L}\p{N}]+/gu) ?? []);
      expect(textOf(once)).toBe(text);
      expect(textOf(again)).toBe(text);
      expect(extractAlignmentDocumentFromUsfm(again, translation, source).verses['JUD 1:1']).toHaveLength(
        (text.match(/[\p{L}\p{N}]+/gu) ?? []).length,
      );
    });

    it('keeps its spaces while only some words are aligned', () => {
      const text = 'en sus fiestas de amor —arrecifes ocultos— banquetean sin temor; dijo: «¡Que el Señor…»';
      const { again } = savedTwice(text, ['amor', 'ocultos', 'dijo']);
      expect(textOf(again)).toBe(text);
      expect(extractAlignmentDocumentFromUsfm(again, translation, source).verses['JUD 1:1']).toHaveLength(3);
    });

    it.each([
      ['an ellipsis, a straight quote and a dash before words that are not aligned', 'y dijo …vengan todos "ahora" —al fin— y basta', ['dijo', 'todos', 'fin']],
      ['a quotation that only its last word is aligned in', 'dijo: "Yo he sido apartado". Luego calló', ['apartado', 'calló']],
      ['a hyphenated word with one half aligned', 'el bien-amado hijo', ['amado', 'hijo']],
    ])('keeps its spaces while only some words are aligned: %s', (_name, text, words) => {
      const { once, again } = savedTwice(text, words);
      expect(textOf(once)).toBe(text);
      expect(textOf(again)).toBe(text);
      expect(again).toBe(once);
      expect(extractAlignmentDocumentFromUsfm(again, translation, source).verses['JUD 1:1']).toHaveLength(words.length);
    });

    it('writes punctuation after the group, not inside it', () => {
      const { once } = savedTwice('Judas, siervo fiel: «hermano».', ['Judas', 'siervo', 'hermano']);
      expect(once).toMatch(/\\w Judas\|[^\\]*\\w\*\\zaln-e\\\*,/);
      expect(once).toMatch(/: «\\zaln-s [^\\]*\\\*\\w hermano\|[^\\]*\\w\*\\zaln-e\\\*»\./);
      expect(once).not.toMatch(/\\w\*[^\s\\]+\\zaln-e/);
    });

    it('leaves the punctuation written right after a group where it was', () => {
      const z = (word: string) =>
        `\\zaln-s |x-strong="G1" x-lemma="l" x-content="g" x-occurrence="1" x-occurrences="1"\\*\\w ${word}|x-occurrence="1" x-occurrences="1"\\w*\\zaln-e\\*`;
      // The form of other writers: punctuation outside the groups, a group to a line.
      expect(textOf(verse(`${z('heaven')}—${z('the')}\n${z('Lord')},\n${z('said')}: “${z('Come')}.”`))).toBe(
        'heaven—the Lord, said: “Come.”',
      );
    });
  });

  describe('a psalm with its alignment, as it is written in its file', () => {
    // Jonah 2:1-3 as a gateway team has it: a verse that begins in a paragraph and goes on in two lines of the
    // psalm, a chunk mark between two verses, straight quotation marks.
    const plain = [
      '\\id JON EN_GLT es-419_Español',
      '\\usfm 3.0',
      '\\ide UTF-8',
      '\\h Jonás',
      '\\mt Jonás',
      '',
      '\\ts\\*',
      '\\c 2',
      '\\p',
      '\\v 1 Y Jonás oró.',
      '\\v 2 Y él dijo:',
      '\\q Clamé a Jehová, y él me respondió;',
      '\\q2 desde el vientre del Seol clamé.',
      '',
      '\\ts\\*',
      '\\q',
      '\\v 3 Ahora "me echaste".',
      '',
    ].join('\n');
    const src = (content: string) => ({ strong: `H${content.length}`, lemma: '', morph: 'He,V', content, occurrence: 1, occurrences: 1 });
    const t = (word: string, occurrence = 1, occurrences = 1) => ({ word, occurrence, occurrences });
    const verses = {
      'JON 2:1': [
        { sources: [src('יונה')], targets: [t('Jonás')] },
        { sources: [src('פלל')], targets: [t('oró')] },
      ],
      'JON 2:2': [
        { sources: [src('אמר')], targets: [t('dijo')] },
        // One original word for two words that are on different lines.
        { sources: [src('קרא')], targets: [t('Clamé'), t('clamé')] },
        { sources: [src('אל'), src('יהוה')], targets: [t('a'), t('Jehová')] },
        { sources: [src('ענה')], targets: [t('me'), t('respondió')] },
        { sources: [src('בטן')], targets: [t('desde'), t('el', 1, 2), t('vientre')] },
      ],
      'JON 2:3': [{ sources: [src('שלך')], targets: [t('me'), t('echaste')] }],
    };
    const doc = withAlignmentVerses(extractAlignmentDocumentFromUsfm(plain, translation, source), verses);
    const saved = mergeAlignmentIntoUsfm(plain, doc);

    const S = (content: string) => `\\zaln-s |x-strong="H${content.length}" x-lemma="" x-morph="He,V" x-occurrence="1" x-occurrences="1" x-content="${content}"\\*`;
    const W = (word: string, of = 1) => `\\w ${word}|x-occurrence="1" x-occurrences="${of}"\\w*`;
    const E = '\\zaln-e\\*';

    it('is a group to a line, with the lines of the poem and the marks around them where they were', () => {
      expect(saved).toBe(
        [
          '\\id JON EN_GLT es-419_Español',
          '\\usfm 3.0',
          '\\ide UTF-8',
          '\\h Jonás',
          '\\mt Jonás',
          '',
          '\\ts\\*',
          '\\c 2',
          '\\p',
          '\\v 1 Y',
          `${S('יונה')}${W('Jonás')}${E}`,
          `${S('פלל')}${W('oró')}${E}.`,
          '\\v 2 Y él',
          `${S('אמר')}${W('dijo')}${E}:`,
          `\\q ${S('קרא')}${W('Clamé')}${E}`,
          `${S('אל')}${S('יהוה')}${W('a')}`,
          `${W('Jehová')}${E}${E}, y él`,
          `${S('ענה')}${W('me')}`,
          `${W('respondió')}${E};`,
          `\\q2 ${S('בטן')}${W('desde')}`,
          W('el', 2),
          `${W('vientre')}${E} del Seol`,
          `${S('קרא')}${W('clamé')}${E}.`,
          '',
          '\\ts\\*',
          '\\q',
          `\\v 3 Ahora "${S('שלך')}${W('me')}`,
          `${W('echaste')}${E}".`,
          '',
        ].join('\n'),
      );
    });

    it('is read back with the groups it was given, the one of two lines as one', () => {
      expect(extractAlignmentDocumentFromUsfm(saved, translation, source).verses).toEqual(verses);
    });

    it('is written the same when it is saved again', () => {
      expect(mergeAlignmentIntoUsfm(saved, extractAlignmentDocumentFromUsfm(saved, translation, source))).toBe(saved);
    });

    it('has the text of each verse as it was, on the lines it was on', () => {
      const body = (usfm: string) => usfm.slice(usfm.indexOf('\\c 2')).replace(/\s*\\ts\\\*/g, '').split('\n').map((line) => line.trimEnd()).filter(Boolean);
      expect(body(stripAlignmentFromUsfm(saved))).toEqual(body(plain));
    });

    it('keeps the alignment of the other verses when one verse loses its own', () => {
      const without = withAlignmentVerses(doc, { 'JON 2:1': verses['JON 2:1'], 'JON 2:3': verses['JON 2:3'] });
      const next = mergeAlignmentIntoUsfm(saved, without);
      expect(extractAlignmentDocumentFromUsfm(next, translation, source).verses).toEqual({ 'JON 2:1': verses['JON 2:1'], 'JON 2:3': verses['JON 2:3'] });
      expect(next).toContain('\\v 2 Y él dijo:\n\\q Clamé a Jehová, y él me respondió;\n\\q2 desde el vientre del Seol clamé.');
    });
  });

  describe('the layout of an aligned file', () => {
    it('leaves a file with no alignment as it is', () => {
      const plain = '\\id JUD\n\\c 1\n\\p\n\\v 1 Judas, siervo.\n\\v 2 Paz.\n';
      expect(layoutAlignedUsfm(plain)).toBe(plain);
    });

    it('puts a chunk mark on a line of its own in a file that has no alignment left', () => {
      const usfm = '\\id JUD\n\\usfm 3.0\n\\mt Judas\n\n\\ts\\*\n\\c 1\n\\p\n\\v 1 Judas.\n\\v 2 Paz.\n\n\\ts\\*\n\\p\n\\v 3 Amados.\n';
      const none = withAlignmentVerses(extractAlignmentDocumentFromUsfm(usfm, translation, source), {});
      const written = mergeAlignmentIntoUsfm(usfm, none);
      expect(written).toBe(usfm);
      expect(mergeAlignmentIntoUsfm(written, none)).toBe(written);
    });

    it('keeps the version the file said it was written in', () => {
      const usfm = '\\id JUD\n\\usfm 3.0\n\\c 1\n\\p\n\\v 1 Judas.\n';
      const doc = withAlignmentVerses(extractAlignmentDocumentFromUsfm(usfm, translation, source), {});
      expect(mergeAlignmentIntoUsfm(usfm, doc)).toContain('\\usfm 3.0\n');
      // Taken apart and put together again (the text edited in between), it still says it.
      const aligned = '\\id JUD\n\\usfm 3.0\n\\c 1\n\\p\n\\v 1 \\zaln-s |x-content="a"\\*\\w Judas|x-occurrence="1" x-occurrences="1"\\w*\\zaln-e\\*.\n';
      expect(stripAlignmentFromUsfm(aligned)).toContain('\\usfm 3.0\n');
      expect(swapAlignmentInUsfm(aligned, extractAlignmentDocumentFromUsfm(aligned, translation, source))).toContain('\\usfm 3.0\n');
      expect(keepUsfmVersionLine('\\id JUD\n\\usfm 3.1\n\\c 1', '\\id JUD\n\\usfm 3.0\n')).toBe('\\id JUD\n\\usfm 3.0\n\\c 1');
      expect(keepUsfmVersionLine('\\id JUD\n\\usfm 3.1\n', '\\id JUD\n')).toBe('\\id JUD\n\\usfm 3.1\n');
    });

    it('keeps the line ends of a file that has them in two characters', () => {
      const z = '\\zaln-s |x-content="a"\\*\\w uno|x-occurrence="1"\\w*\\zaln-e\\* \\zaln-s |x-content="b"\\*\\w dos|x-occurrence="1"\\w*\\zaln-e\\*';
      expect(layoutAlignedUsfm(`\\c 1\r\n\\p\r\n\\v 1 ${z}\r\n`)).toBe(`\\c 1\r\n\\p\r\n\\v 1 ${z.replace('\\* \\zaln-s', '\\*\r\n\\zaln-s')}\r\n`);
    });
  });

  it('swapAlignmentInUsfm can clear via empty verses', () => {
    const usfm = readFileSync(alignmentFixture, 'utf8');
    const doc = extractAlignmentDocumentFromUsfm(usfm, translation, source);
    const emptyVerses = withAlignmentVerses(doc, {});
    const swapped = swapAlignmentInUsfm(usfm, emptyVerses);
    expect(swapped).not.toContain('zaln-s');
  });
});

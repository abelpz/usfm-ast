import { readFileSync } from 'fs';
import { join } from 'path';
import {
  extractAlignmentDocumentFromUsfm,
  mergeAlignmentIntoUsfm,
  stripAlignmentFromUsfm,
  swapAlignmentInUsfm,
} from '../src/alignment-directory';
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

    it('leaves the punctuation written right after a group where it was', () => {
      const z = (word: string) =>
        `\\zaln-s |x-strong="G1" x-lemma="l" x-content="g" x-occurrence="1" x-occurrences="1"\\*\\w ${word}|x-occurrence="1" x-occurrences="1"\\w*\\zaln-e\\*`;
      // The form of other writers: punctuation outside the groups, a group to a line.
      expect(textOf(verse(`${z('heaven')}—${z('the')}\n${z('Lord')},\n${z('said')}: “${z('Come')}.”`))).toBe(
        'heaven—the Lord, said: “Come.”',
      );
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

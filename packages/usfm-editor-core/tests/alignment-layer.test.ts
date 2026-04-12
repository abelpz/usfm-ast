import { readFileSync } from 'fs';
import { join } from 'path';
import { USFMParser } from '@usfm-tools/parser';
import { stripAlignments } from '../src/alignment-layer';
import { rebuildAlignedUsj } from '../src/rebuild-aligned';
import { collectVerseTextsFromContent } from '../src/verse-text';

function loadFixture(name: string): string {
  return readFileSync(join(__dirname, '../../usfm-parser/tests/fixtures/usfm', name), 'utf8');
}

describe('alignment layer strip + rebuild', () => {
  it('preserves punctuation between alignment groups (alignment.usfm v1)', () => {
    const usfm = loadFixture('alignment.usfm');
    const parser = new USFMParser();
    parser.parse(usfm);
    const usj = parser.toJSON() as { type: 'USJ'; version: string; content: unknown[] };
    const { editable, alignments } = stripAlignments(usj);
    const rebuilt = rebuildAlignedUsj(editable, alignments);
    const flat = JSON.stringify(rebuilt.content);
    expect(flat).toContain('authorities');
    expect(flat).toContain('obedient');
    // Comma between groups appears as literal in stripped/rebuilt gateway text
    expect(flat).toMatch(/authorities.*,/);
  });

  it('preserves footnote and alignment when verse has mixed string and note content', () => {
    const usfm =
      '\\id TIT EN\n\\c 1\n\\p\n\\v 1 Hello \\f + \\fr 1.1 \\ft Note\\f* world aligned \\w here\\w* end.\n';
    const parser = new USFMParser();
    parser.parse(usfm);
    const usj = parser.toJSON() as { type: 'USJ'; version: string; content: unknown[] };
    const { editable, alignments } = stripAlignments(usj);
    const mapKeys = Object.keys(alignments);
    if (mapKeys.length > 0) {
      const rebuilt = rebuildAlignedUsj(editable, alignments);
      const s = JSON.stringify(rebuilt);
      expect(s).toContain('Note');
      expect(s).toContain('Hello');
    }
  });

  it('nested zaln-s in fixture strip yields groups that rebuild without throwing', () => {
    const usfm = loadFixture('alignment.usfm');
    const parser = new USFMParser();
    parser.parse(usfm);
    const usj = parser.toJSON() as { type: 'USJ'; version: string; content: unknown[] };
    const { editable, alignments } = stripAlignments(usj);
    expect(() => rebuildAlignedUsj(editable, alignments)).not.toThrow();
  });

  it('extra zaln-e does not throw strip+rebuild', () => {
    const usfm =
      '\\id TIT EN\n\\c 1\n\\p\n\\v 1 \\zaln-s |x-strong="a" x-lemma="b" x-content="c" x-occurrence="1" x-occurrences="1"\\*\\w Hello\\w*\\zaln-e\\*\\zaln-e\\* tail.\n';
    const parser = new USFMParser();
    parser.parse(usfm);
    const usj = parser.toJSON() as { type: 'USJ'; version: string; content: unknown[] };
    const { editable, alignments } = stripAlignments(usj);
    expect(() => rebuildAlignedUsj(editable, alignments)).not.toThrow();
  });

  it('inserts spaces between adjacent stripped \\w fragments when USJ has no literal space', () => {
    const usfm =
      '\\id TIT EN\n\\c 1\n\\p\n\\v 1 \\w siervo\\w*\\w de\\w* rest.\n';
    const parser = new USFMParser();
    parser.parse(usfm);
    const usj = parser.toJSON() as { type: 'USJ'; version: string; content: unknown[] };
    const { editable } = stripAlignments(usj);
    const byVerse = collectVerseTextsFromContent(editable.content as unknown[]);
    expect(byVerse['TIT 1:1']).toMatch(/siervo de/);
    expect(byVerse['TIT 1:1']).not.toMatch(/siervode/);
  });

  it('non-alignment milestones (ts-s / ts-e) pass through strip and rebuild', () => {
    const usfm = '\\id TIT EN\n\\c 1\n\\p\n\\v 1 Before \\ts-s\\* middle \\ts-e\\* after.\n';
    const parser = new USFMParser();
    parser.parse(usfm);
    const usj = parser.toJSON() as { type: 'USJ'; version: string; content: unknown[] };
    const { editable, alignments } = stripAlignments(usj);
    const rebuilt = rebuildAlignedUsj(editable, alignments);
    const flat = JSON.stringify(rebuilt.content);
    expect(flat).toContain('ts-s');
    expect(flat).toContain('ts-e');
  });

  it('partially aligned verse preserves unaligned words', () => {
    const editable = {
      type: 'EditableUSJ' as const,
      version: '3.1',
      content: [
        { type: 'chapter', marker: 'c', number: '1', sid: 'TIT 1' },
        {
          type: 'para',
          marker: 'p',
          content: [
            {
              type: 'verse',
              marker: 'v',
              number: '1',
              sid: 'TIT 1:1',
              content: ['Hello ', 'world'],
            },
          ],
        },
      ],
    };
    const alignments = {
      'TIT 1:1': [
        {
          sources: [
            {
              strong: 'G3962',
              lemma: 'θεός',
              content: 'God',
              occurrence: 1,
              occurrences: 1,
            },
          ],
          targets: [{ word: 'Hello', occurrence: 1, occurrences: 1 }],
        },
      ],
    };
    const rebuilt = rebuildAlignedUsj(editable, alignments);
    const flat = JSON.stringify(rebuilt.content);
    expect(flat).toContain('world');
    expect(flat).toContain('zaln-s');
  });

  it('non-contiguous targets in one group keep gateway word order (apostle of Jesus)', () => {
    const editable = {
      type: 'EditableUSJ' as const,
      version: '3.1',
      content: [
        { type: 'chapter', marker: 'c', number: '1', sid: 'TIT 1' },
        {
          type: 'para',
          marker: 'p',
          content: [
            {
              type: 'verse',
              marker: 'v',
              number: '1',
              sid: 'TIT 1:1',
              content: ['apostle of Jesus'],
            },
          ],
        },
      ],
    };
    const alignments = {
      'TIT 1:1': [
        {
          sources: [
            {
              strong: 'G652',
              lemma: 'ἀπόστολος',
              content: 'apostle',
              occurrence: 1,
              occurrences: 1,
            },
          ],
          targets: [
            { word: 'apostle', occurrence: 1, occurrences: 1 },
            { word: 'Jesus', occurrence: 1, occurrences: 1 },
          ],
        },
      ],
    };
    const before = collectVerseTextsFromContent(editable.content as unknown[]);
    const rebuilt = rebuildAlignedUsj(editable, alignments);
    const { editable: editable2 } = stripAlignments({
      type: 'USJ',
      version: '3.1',
      content: rebuilt.content as unknown[],
    });
    const after = collectVerseTextsFromContent(editable2.content as unknown[]);
    expect(after).toEqual(before);
  });
});

import * as fs from 'fs';
import * as path from 'path';
import { USFMParser } from '@usfm-tools/parser';
import { splitUsjByChapter, stripAlignments } from '../src';

const alignmentFixture = path.join(__dirname, '../../usfm-parser/tests/fixtures/usfm/alignment.usfm');

describe('splitUsjByChapter', () => {
  it('puts preface in chapter 0 and splits on \\c', () => {
    const usj = {
      type: 'USJ',
      version: '3.1',
      content: [
        { type: 'book', marker: 'id', code: 'TIT', content: ['Titus'] },
        { type: 'chapter', marker: 'c', number: '1', sid: 'TIT 1' },
        { type: 'para', marker: 'p', content: [] },
        { type: 'chapter', marker: 'c', number: '2', sid: 'TIT 2' },
        { type: 'para', marker: 'p', content: [] },
      ],
    };
    const slices = splitUsjByChapter(usj);
    expect(slices).toHaveLength(3);
    expect(slices[0].chapter).toBe(0);
    expect(slices[0].nodes).toHaveLength(1);
    expect(slices[1].chapter).toBe(1);
    expect(slices[2].chapter).toBe(2);
  });
});

describe('stripAlignments', () => {
  it('unwraps aligned gateway text and records groups', () => {
    const usfm = fs.readFileSync(alignmentFixture, 'utf8');
    const usj = new USFMParser({ silentConsole: true }).parse(usfm).toJSON();
    const { editable, alignments } = stripAlignments(usj);
    expect(editable.type).toBe('EditableUSJ');
    const tit31 = alignments['TIT 3:1'];
    expect(Array.isArray(tit31)).toBe(true);
    expect(tit31!.length).toBeGreaterThan(0);
    const flat = JSON.stringify(editable);
    expect(flat).not.toContain('zaln-s');
    expect(flat).not.toContain('"marker":"w"');
  });
});

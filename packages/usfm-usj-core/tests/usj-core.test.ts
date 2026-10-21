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

describe('stripAlignments: non-contiguous groups (docs/29, section 5)', () => {
  const ms = (content: string) => ({ type: 'ms', marker: 'zaln-s', 'x-content': content, 'x-strong': content, 'x-occurrence': '1', 'x-occurrences': '1' });
  const end = { type: 'ms', marker: 'zaln-e' };
  const w = (word: string) => ({ type: 'char', marker: 'w', content: [word], 'x-occurrence': '1', 'x-occurrences': '1' });
  const verse = (content: unknown[]) => ({ type: 'USJ', version: '3.1', content: [{ type: 'para', marker: 'p', content: [{ type: 'verse', marker: 'v', number: '1', sid: 'TIT 1:1' }, ...content] }] });
  const read = (content: unknown[]) =>
    (stripAlignments(verse(content)).alignments['TIT 1:1'] ?? []).map((g) => `${g.sources.map((s) => s.content).join('+')}=${g.targets.map((t) => t.word).join(' ')}`);

  it('keeps a group that interrupts another apart from it (5a)', () => {
    // El que[Comforter] los[you] consuela[Comforter]
    expect(read([w('El'), ' ', ms('Comforter'), w('que'), ' ', ms('you'), w('los'), end, ' ', w('consuela'), end])).toEqual(['Comforter=que consuela', 'you=los']);
  });

  it('reads an interrupted N:M group whole (5b)', () => {
    // llevó[carried out] la[the] misión[mission] a cabo[carried out]
    const content = [ms('carried'), ms('out'), w('llevó'), ' ', ms('the'), w('la'), end, ' ', ms('mission'), w('misión'), end, ' ', w('a'), ' ', w('cabo'), end, end];
    expect(read(content)).toEqual(['carried+out=llevó a cabo', 'the=la', 'mission=misión']);
  });

  it('still reads milestones opened together as the sources of one group', () => {
    expect(read([ms('a'), ms('b'), w('uno'), end, end, ' ', ms('c'), w('dos'), end])).toEqual(['a+b=uno', 'c=dos']);
  });
});

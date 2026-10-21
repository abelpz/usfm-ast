import * as fs from 'fs';
import * as path from 'path';
import { USFMParser } from '@usfm-tools/parser';
import { readsApartAfterGroup, splitUsjByChapter, stripAlignments } from '../src';

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

  // The way of unfoldingWord's tools, and of this library now: a group that another one interrupts is closed
  // and written again where it goes on.
  it('reads a group written in two pieces as the one group it is (5a)', () => {
    expect(read([w('El'), ' ', ms('Comforter'), w('que'), end, ms('you'), w('los'), end, ms('Comforter'), w('consuela'), end])).toEqual(['Comforter=que consuela', 'you=los']);
  });

  it('reads an N:M group written in two pieces whole (5b)', () => {
    const content = [ms('carried'), ms('out'), w('llevó'), end, end, ms('the'), w('la'), end, ms('mission'), w('misión'), end, ms('carried'), ms('out'), w('a'), ' ', w('cabo'), end, end];
    expect(read(content)).toEqual(['carried+out=llevó a cabo', 'the=la', 'mission=misión']);
  });

  it('keeps apart two groups whose original word is the same word in another place of the verse', () => {
    const other = { ...ms('and'), 'x-occurrence': '2', 'x-occurrences': '2' };
    const first = { ...ms('and'), 'x-occurrences': '2' };
    expect(read([first, w('y'), end, ms('peace'), w('paz'), end, other, w('y'), end])).toEqual(['and=y', 'peace=paz', 'and=y']);
  });

  it('joins a group whose words are on two lines of a poem', () => {
    const doc = {
      type: 'USJ',
      version: '3.1',
      content: [
        { type: 'para', marker: 'q1', content: [{ type: 'verse', marker: 'v', number: '2', sid: 'JON 2:2' }, ms('cried'), w('Clamé'), end, ms('Yahweh'), w('Jehová'), end, ';'] },
        { type: 'para', marker: 'q2', content: [ms('belly'), w('vientre'), end, ms('cried'), w('clamé'), end, '.'] },
        { type: 'para', marker: 'q1', content: [{ type: 'verse', marker: 'v', number: '3', sid: 'JON 2:3' }, ms('cried'), w('clamé'), end] },
      ],
    };
    const { alignments } = stripAlignments(doc);
    const said = (sid: string) => alignments[sid]!.map((g) => `${g.sources.map((s) => s.content).join('+')}=${g.targets.map((t) => t.word).join(' ')}`);
    expect(said('JON 2:2')).toEqual(['cried=Clamé clamé', 'Yahweh=Jehová', 'belly=vientre']);
    // The same original word in the next verse is of the next verse.
    expect(said('JON 2:3')).toEqual(['cried=clamé']);
  });
});

describe('stripAlignments: the text of a verse as it is written', () => {
  const z = (word: string, n = 1) =>
    `\\zaln-s |x-strong="G${n}" x-lemma="l" x-content="g${n}" x-occurrence="1" x-occurrences="1"\\*\\w ${word}|x-occurrence="1" x-occurrences="1"\\w*\\zaln-e\\*`;
  const textOf = (verse: string) => {
    const usj = new USFMParser({ silentConsole: true }).parse(`\\id JON\n\\c 2\n\\p\n\\v 4 ${verse}\n`).toJSON();
    const para = (stripAlignments(usj).editable.content as { type?: string; content?: unknown[] }[]).find((n) => n.type === 'para')!;
    return para.content!.filter((n) => typeof n === 'string').join('').trim();
  };

  it.each([
    // As unfoldingWord's tools write a gateway text: a group to a line, punctuation between the groups.
    ['a straight quotation mark that opens, after a colon', `${z('dije', 1)}: "${z('Yo', 2)}\n${z('he', 3)}`, 'dije: "Yo he'],
    ['a straight quotation mark that closes', `${z('santo', 1)}\n${z('templo', 2)}".`, 'santo templo".'],
    ['a straight quotation mark that opens, with nothing before it', `${z('palabra', 1)}\n"${z('amor', 2)}"\n${z('es', 3)}`, 'palabra "amor" es'],
    ['a comma and the next line', `${z('Jude', 1)},\n${z('a', 2)}\n${z('servant', 3)}`, 'Jude, a servant'],
    ['a dash that joins two words', `${z('day', 1)}—${z('as', 2)}`, 'day—as'],
    ['braces around a supplied word', `${z('kept', 1)} {${z('and', 2)}}\n${z('called', 3)}`, 'kept {and} called'],
    ['a word no group has', `${z('uno', 1)} dos\n${z('tres', 2)}`, 'uno dos tres'],
    ['a word no group has, with a quotation mark of its own', `${z('uno', 1)} "dos"\n${z('tres', 2)}`, 'uno "dos" tres'],
    ['two words of a group on two lines', `\\zaln-s |x-content="g"\\*\\w a|x-occurrence="1"\\w*\n\\w servant|x-occurrence="1"\\w*\\zaln-e\\*`, 'a servant'],
    ['parts of a word, each in its group', `${z('self', 1)}-${z('condemned', 2)}`, 'self-condemned'],
    // As this library wrote it before: punctuation inside the groups, a space between them.
    ['punctuation inside the groups', `\\zaln-s |x-content="a"\\*\\w dijo|x-occurrence="1"\\w*:\\zaln-e\\* \\zaln-s |x-content="b"\\*«¡\\w Que|x-occurrence="1"\\w*\\zaln-e\\*`, 'dijo: «¡Que'],
    // As it writes it now where the space would not be put back: inside the group, before its end.
    ['a space kept inside the group', `\\zaln-s |x-content="a"\\*\\w amor|x-occurrence="1"\\w* \\zaln-e\\*—${z('arrecifes', 2)}`, 'amor —arrecifes'],
  ])('%s', (_name, verse, text) => {
    expect(textOf(verse)).toBe(text);
  });
});

describe('readsApartAfterGroup', () => {
  it.each([
    ['otra', false, true],
    ['«hola»', false, true],
    ['¿quién?', false, true],
    ['(a ellos)', false, true],
    ['—arrecifes ocultos—', false, true],
    ['…vengan', false, true],
    ['"dos" tres', false, true],
    [', siervo', false, false],
    ['. ', false, false],
    ['— banquetean', false, false],
    ['". ', false, false],
    ['—', true, false],
    ["'", true, false],
    ['"', true, true],
    ['"', false, false],
  ])('%j (a group follows: %s) → %s', (chunk, groupFollows, apart) => {
    expect(readsApartAfterGroup(chunk, groupFollows)).toBe(apart);
  });
});

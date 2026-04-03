import { USFMParser } from '@usfm-tools/parser';
import * as fs from 'fs';
import * as path from 'path';
import {
  chapterSliceToUsjDocument,
  DocumentStore,
  reconcileAlignments,
  rebuildAlignedUsj,
  splitUsjByChapter,
  stripAlignments,
  tokenizeWords,
  lcsWordIndices,
  usfmRefToVerseSid,
} from '../dist';

const alignmentFixture = path.join(
  __dirname,
  '../../usfm-parser/tests/fixtures/usfm/alignment.usfm'
);

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

describe('word-diff', () => {
  it('tokenizes and finds LCS indices', () => {
    expect(tokenizeWords('  a  b  ')).toEqual(['a', 'b']);
    const { oldKept, newKept } = lcsWordIndices(['a', 'b', 'c'], ['a', 'x', 'b', 'c']);
    expect(oldKept.has(0)).toBe(true);
    expect(newKept.has(0)).toBe(true);
  });
});

describe('reconcileAlignments', () => {
  it('drops targets when a single aligned word is replaced', () => {
    const groups = [
      {
        sources: [{ strong: 'G1', lemma: 'a', content: 'a', occurrence: 1, occurrences: 1 }],
        targets: [{ word: 'Remind', occurrence: 1, occurrences: 1 }],
      },
    ];
    expect(reconcileAlignments('Remind', 'Remember', groups)).toHaveLength(0);
  });

  it('preserves targets when verse text is unchanged', () => {
    const groups = [
      {
        sources: [
          {
            strong: 'G1',
            lemma: 'a',
            content: 'a',
            occurrence: 1,
            occurrences: 1,
          },
        ],
        targets: [{ word: 'hello', occurrence: 1, occurrences: 1 }],
      },
    ];
    const out = reconcileAlignments('hello', 'hello', groups);
    expect(out).toHaveLength(1);
    expect(out[0]!.targets).toHaveLength(1);
    expect(out[0]!.targets[0]!.word).toBe('hello');
  });
});

describe('rebuildAlignedUsj', () => {
  it('re-inserts zaln milestones after strip + rebuild', () => {
    const usfm = fs.readFileSync(alignmentFixture, 'utf8');
    const usj = new USFMParser({ silentConsole: true }).parse(usfm).toJSON();
    const { editable, alignments } = stripAlignments(usj);
    const rebuilt = rebuildAlignedUsj(editable, alignments);
    const flat = JSON.stringify(rebuilt);
    expect(flat).toContain('zaln-s');
    expect(flat).toContain('"marker":"w"');
  });
});

describe('chapterSliceToUsjDocument', () => {
  it('wraps slice nodes as a USJ document', () => {
    const doc = chapterSliceToUsjDocument(
      { bookCode: 'TIT', chapter: 1, nodes: [{ type: 'chapter', marker: 'c', number: '1' }] },
      '3.1'
    );
    expect(doc.type).toBe('USJ');
    expect(doc.version).toBe('3.1');
    expect(doc.content).toHaveLength(1);
  });
});

describe('usfmRefToVerseSid', () => {
  it('formats BOOK C:V', () => {
    expect(usfmRefToVerseSid('tit', { book: 'TIT', chapter: 3, verse: 1 })).toBe('TIT 3:1');
  });
});

describe('DocumentStore', () => {
  it('getVerse, getAlignments, toUSFM(chapter), onChange', () => {
    const usfm = fs.readFileSync(alignmentFixture, 'utf8');
    const store = new DocumentStore({ silentConsole: true });
    store.loadUSFM(usfm);
    expect(Object.keys(store.getAlignments(3)).length).toBeGreaterThan(0);
    const bits = store.getVerse({ book: 'TIT', chapter: 3, verse: 1 });
    expect(bits.length).toBeGreaterThan(0);
    const chOnly = store.toUSFM(3);
    expect(chOnly).toContain('\\c 3');
    expect(chOnly).not.toContain('\\id');
    let fires = 0;
    const un = store.onChange(() => {
      fires++;
    });
    store.applyOperations([{ type: 'removeNode', path: { chapter: 3, indices: [9999] } }]);
    un();
    expect(fires).toBe(1);
  });

  it('loads USFM, round-trips a chapter slice, and emits USFM', () => {
    const usfm = fs.readFileSync(alignmentFixture, 'utf8');
    const store = new DocumentStore({ silentConsole: true });
    store.loadUSFM(usfm);
    expect(store.getBookCode()).toBe('TIT');
    const ch = 3;
    const { editable, alignments } = store.getEditableChapter(ch);
    expect(editable.type).toBe('EditableUSJ');
    store.updateEditableChapter(ch, editable, alignments);
    const out = store.toUSFM();
    expect(out.length).toBeGreaterThan(100);
    expect(out).toContain('\\id TIT');
  });
});

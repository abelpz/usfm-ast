import { readFileSync } from 'fs';
import { join } from 'path';
import { USFMParser } from '@usfm-tools/parser';
import { createUSFMEditorState, pmDocumentToUsj, serializeToUSJ, usjDocumentToPm } from '../src';
import { usfmSchema } from '../src/schema';

const fixture = (name: string) =>
  readFileSync(join(__dirname, '../../usfm-parser/tests/fixtures/usfm', name), 'utf8');

describe('USJ <-> ProseMirror', () => {
  it('round-trips basic.usfm via PM', () => {
    const usfm = fixture('basic.usfm');
    const parser = new USFMParser();
    parser.parse(usfm);
    const usj = parser.toJSON();
    const pm = usjDocumentToPm(usj, usfmSchema);
    const back = pmDocumentToUsj(pm);
    expect(back.type).toBe('USJ');
    expect(back.version).toBe(usj.version);
    expect(Array.isArray(back.content)).toBe(true);
    expect(back.content!.length).toBe(usj.content!.length);
  });

  it('createUSFMEditorState + serializeToUSJ preserves root shape', () => {
    const parser = new USFMParser();
    parser.parse(fixture('basic.usfm'));
    const usj = parser.toJSON();
    const state = createUSFMEditorState(usj);
    const out = serializeToUSJ(state);
    expect(out.type).toBe('USJ');
    expect(out.content!.length).toBe(usj.content!.length);
  });

  it('default empty book_introduction has \\is1 heading and \\ip paragraph', () => {
    const usj = {
      type: 'USJ',
      version: '3.1',
      content: [
        { type: 'chapter', marker: 'c', number: 1 },
        { type: 'para', marker: 'p', content: ['a'] },
      ],
    };
    const pm = usjDocumentToPm(usj, usfmSchema);
    const intro = pm.child(0);
    expect(intro.type.name).toBe('book_introduction');
    expect(intro.childCount).toBe(2);
    expect(intro.child(0).attrs.marker).toBe('is1');
    expect(intro.child(1).attrs.marker).toBe('ip');
    const back = pmDocumentToUsj(pm);
    expect(back.content).toEqual(usj.content);
  });

  it('hoists standalone block \\ts milestone into the following paragraph (inline)', () => {
    const usj = {
      type: 'USJ',
      version: '3.1',
      content: [
        { type: 'chapter', marker: 'c', number: 1 },
        { type: 'para', marker: 'p', content: ['a'] },
        { type: 'ms', marker: 'ts' },
        { type: 'para', marker: 'p', content: ['b'] },
      ],
    };
    const pm = usjDocumentToPm(usj, usfmSchema);
    expect(pm.child(0).type.name).toBe('book_introduction');
    const ch = pm.child(1);
    expect(ch.type.name).toBe('chapter');
    expect(ch.childCount).toBe(3);
    expect(ch.child(1).type.name).toBe('paragraph');
    const secondPara = ch.child(2);
    expect(secondPara.type.name).toBe('paragraph');
    expect(secondPara.childCount).toBe(2);
    expect(secondPara.child(0).type.name).toBe('milestone_inline');
    expect(secondPara.child(0).attrs.marker).toBe('ts');
    expect(secondPara.child(1).isText).toBe(true);
    expect(secondPara.child(1).text).toBe('b');
    const back = pmDocumentToUsj(pm);
    expect(back.content).toEqual([
      { type: 'chapter', marker: 'c', number: 1 },
      { type: 'para', marker: 'p', content: ['a'] },
      { type: 'para', marker: 'p', content: [{ type: 'ms', marker: 'ts' }, 'b'] },
    ]);
  });

  it('places \\mt in book_titles, not header', () => {
    const parser = new USFMParser();
    parser.parse(fixture('basic.usfm'));
    const usj = parser.toJSON();
    const pm = usjDocumentToPm(usj, usfmSchema);
    expect(pm.childCount).toBeGreaterThanOrEqual(4);
    expect(pm.child(0).type.name).toBe('header');
    expect(pm.child(1).type.name).toBe('book_titles');
    expect(pm.child(2).type.name).toBe('book_introduction');
    expect(pm.child(3).type.name).toBe('chapter');
    expect(pm.child(1).childCount).toBe(1);
    expect(pm.child(1).firstChild?.attrs.marker).toBe('mt');
  });
});

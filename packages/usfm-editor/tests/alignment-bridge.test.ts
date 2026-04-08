import { readFileSync } from 'fs';
import { join } from 'path';
import { USFMParser } from '@usfm-tools/parser';
import { stripAlignments } from '@usfm-tools/editor-core';
import { serializeWithAlignments, stripAndLoad } from '../src/alignment';

const fixture = (name: string) =>
  readFileSync(join(__dirname, '../../usfm-parser/tests/fixtures/usfm', name), 'utf8');

describe('alignment bridge', () => {
  it('stripAndLoad matches stripAlignments; serializeWithAlignments returns USJ', () => {
    const parser = new USFMParser();
    parser.parse(fixture('basic.usfm'));
    const usj = parser.toJSON();
    const { alignments: before } = stripAlignments(usj);

    const { state, alignments } = stripAndLoad(usj);
    expect(state.doc.type.name).toBe('doc');
    expect(Object.keys(alignments).length).toBe(Object.keys(before).length);

    const rebuilt = serializeWithAlignments(state, alignments);
    expect(rebuilt.type).toBe('USJ');
    expect(Array.isArray(rebuilt.content)).toBe(true);
  });
});

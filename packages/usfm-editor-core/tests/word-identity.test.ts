import { readFileSync } from 'fs';
import { join } from 'path';
import { USFMParser } from '@usfm-tools/parser';
import { tokenizeDocument } from '../src/word-identity';

const titUnaligned = join(__dirname, '../../usfm-parser/tests/fixtures/usfm/tit.tpl-unaligned.usfm');

describe('word-identity', () => {
  it('tokenizeDocument assigns occurrences for repeated words', () => {
    const usfm = readFileSync(titUnaligned, 'utf8');
    const p = new USFMParser({ silentConsole: true });
    p.parse(usfm);
    const usj = p.toJSON() as { content: unknown[] };
    const map = tokenizeDocument(usj);
    const v1 = map['TIT 1:1'];
    expect(v1?.length).toBeGreaterThan(5);
    const de = v1!.filter((t) => t.surface === 'de');
    expect(de.length).toBeGreaterThan(1);
    expect(de[0]!.occurrence).toBe(1);
    expect(de[1]!.occurrence).toBe(2);
  });

});

import * as fs from 'fs';
import * as path from 'path';
import { USFMParser } from '@usfm-tools/parser';
import {
  alignmentWordSurfacesEqual,
  normalizeWordForAlignmentMatch,
  tokenizeWords,
  stripAlignments,
  tokenizeGatewayUsj,
  transIndexForAlignedWord,
} from '../src';

describe('gateway-word-split', () => {
  it('tokenizeWords splits on whitespace', () => {
    expect(tokenizeWords('  a  b  ')).toEqual(['a', 'b']);
  });

  it('alignmentWordSurfacesEqual ignores outer punctuation', () => {
    expect(alignmentWordSurfacesEqual('Pablo', 'Pablo,')).toBe(true);
    expect(alignmentWordSurfacesEqual('Jesucristo,', 'Jesucristo')).toBe(true);
    expect(alignmentWordSurfacesEqual('Παῦλος', 'Παῦλος,')).toBe(true);
    expect(alignmentWordSurfacesEqual('de', 'del')).toBe(false);
  });

  it('normalizeWordForAlignmentMatch strips outer punctuation only', () => {
    expect(normalizeWordForAlignmentMatch('  Pablo,  ')).toBe('Pablo');
  });
});

describe('tokenizeGatewayUsj + transIndexForAlignedWord', () => {
  it('matches AlignedWord to gateway token index after strip', () => {
    const alignmentFixture = path.join(__dirname, '../../usfm-parser/tests/fixtures/usfm/alignment.usfm');
    const usfm = fs.readFileSync(alignmentFixture, 'utf8');
    const usj = new USFMParser({ silentConsole: true }).parse(usfm).toJSON();
    const { editable, alignments } = stripAlignments(usj);
    const byVerse = tokenizeGatewayUsj(editable);
    const tit31 = alignments['TIT 3:1'];
    expect(Array.isArray(tit31)).toBe(true);
    if (!tit31?.length) return;
    const firstGroup = tit31[0]!;
    const tok = byVerse['TIT 3:1'];
    expect(Array.isArray(tok)).toBe(true);
    for (const aw of firstGroup.targets) {
      const idx = transIndexForAlignedWord(tok!, aw);
      expect(idx).not.toBeNull();
      expect(alignmentWordSurfacesEqual(tok![idx!]!.surface, aw.word)).toBe(true);
      expect(tok![idx!]!.occurrence).toBe(aw.occurrence);
    }
  });
});

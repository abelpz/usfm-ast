import * as fs from 'fs';
import * as path from 'path';
import { USFMParser } from '@usfm-tools/parser';
import {
  alignmentWordSurfacesEqual,
  normalizeWordForAlignmentMatch,
  occurrenceStats,
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

describe('occurrenceStats', () => {
  it('numbers a word repeated with different punctuation as the same word', () => {
    const words = tokenizeWords('siervo de Jesucristo y guardados para Jesucristo, llamados:');
    expect(occurrenceStats(words, 2)).toEqual({ occurrence: 1, occurrences: 2 });
    expect(occurrenceStats(words, 6)).toEqual({ occurrence: 2, occurrences: 2 });
    // Each token is then found back by its own (word, occurrence), and by no other.
    const tokens = words.map((surface, index) => ({ verseSid: 'JUD 1:1', surface, index, ...occurrenceStats(words, index) }));
    expect(transIndexForAlignedWord(tokens, { word: 'Jesucristo', occurrence: 1, occurrences: 2 })).toBe(2);
    expect(transIndexForAlignedWord(tokens, { word: 'Jesucristo,', occurrence: 2, occurrences: 2 })).toBe(6);
  });

  it('keeps counting words that differ, and a surface of punctuation alone', () => {
    const words = tokenizeWords('de — del — de');
    expect(occurrenceStats(words, 0)).toEqual({ occurrence: 1, occurrences: 2 });
    expect(occurrenceStats(words, 2)).toEqual({ occurrence: 1, occurrences: 1 });
    expect(occurrenceStats(words, 3)).toEqual({ occurrence: 2, occurrences: 2 });
    expect(occurrenceStats(words, 4)).toEqual({ occurrence: 2, occurrences: 2 });
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

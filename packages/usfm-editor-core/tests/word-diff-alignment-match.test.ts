import { alignmentWordSurfacesEqual, normalizeWordForAlignmentMatch } from '../src/word-diff';

describe('alignmentWordSurfacesEqual', () => {
  it('treats trailing comma as non-distinct for matching', () => {
    expect(alignmentWordSurfacesEqual('Pablo', 'Pablo,')).toBe(true);
    expect(alignmentWordSurfacesEqual('Jesucristo,', 'Jesucristo')).toBe(true);
  });

  it('matches Greek surface with trailing punctuation', () => {
    expect(alignmentWordSurfacesEqual('Παῦλος', 'Παῦλος,')).toBe(true);
    expect(alignmentWordSurfacesEqual('Θεοῦ,', 'Θεοῦ')).toBe(true);
  });

  it('does not collapse distinct words', () => {
    expect(alignmentWordSurfacesEqual('de', 'del')).toBe(false);
  });

  it('normalizeWordForAlignmentMatch strips outer punctuation only', () => {
    expect(normalizeWordForAlignmentMatch('  Pablo,  ')).toBe('Pablo');
  });
});

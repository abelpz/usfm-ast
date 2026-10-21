import { extractBookId } from '../src/normalize/extractBookId';

describe('extractBookId', () => {
  it('reads 3-letter code from \\id', () => {
    expect(extractBookId('\\id JHN\n\\c 1\n')).toBe('JHN');
  });

  it('strips BOM', () => {
    expect(extractBookId('\uFEFF\\id MAT\n')).toBe('MAT');
  });

  it('throws when missing \\id', () => {
    expect(() => extractBookId('\\c 1\n')).toThrow();
  });
});

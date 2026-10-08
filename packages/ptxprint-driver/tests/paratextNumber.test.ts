import { getParatextFilePrefix, getParatextNumber } from '../src/books/paratextNumber';

describe('getParatextFilePrefix / getParatextNumber', () => {
  it('maps standard canon (incl. MAT after ZZZ slot)', () => {
    expect(getParatextFilePrefix('GEN')).toBe('01');
    expect(getParatextFilePrefix('MAL')).toBe('39');
    expect(getParatextFilePrefix('MAT')).toBe('41');
    expect(getParatextFilePrefix('JHN')).toBe('44');
    expect(getParatextFilePrefix('REV')).toBe('67');
  });

  it('maps JS books (1–3 John)', () => {
    expect(getParatextNumber('1JN')).toBe('63');
    expect(getParatextNumber('2JN')).toBe('64');
    expect(getParatextNumber('3JN')).toBe('65');
  });

  it('maps peripheral codes', () => {
    expect(getParatextFilePrefix('FRT')).toBe('A0');
    expect(getParatextFilePrefix('INT')).toBe('A7');
  });

  it('throws for unknown book code', () => {
    expect(() => getParatextFilePrefix('ZZZ')).toThrow(/Unknown USFM book code/);
  });
});

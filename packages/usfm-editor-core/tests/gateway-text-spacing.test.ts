import { appendGatewayText, needsSpaceBetween } from '../src/gateway-text-spacing';

describe('gateway-text-spacing', () => {
  it('needsSpaceBetween adds space for letter-to-letter glue', () => {
    expect(needsSpaceBetween('siervo', 'de')).toBe(true);
    expect(needsSpaceBetween('Dios', 'y')).toBe(true);
  });

  it('needsSpaceBetween avoids double space when either side has whitespace', () => {
    expect(needsSpaceBetween('hello ', 'world')).toBe(false);
    expect(needsSpaceBetween('hello', ' world')).toBe(false);
  });

  it('needsSpaceBetween keeps punctuation attached', () => {
    expect(needsSpaceBetween('hello', ',')).toBe(false);
    expect(needsSpaceBetween('hello', '.')).toBe(false);
    expect(needsSpaceBetween('word,', 'next')).toBe(true);
  });

  it('needsSpaceBetween separates digit run from following letter (verse number glue)', () => {
    expect(needsSpaceBetween('1', 'Pablo')).toBe(true);
  });

  it('appendGatewayText concatenates with a single space when needed', () => {
    expect(appendGatewayText('siervo', 'de')).toBe('siervo de');
    expect(appendGatewayText('hello,', 'next')).toBe('hello, next');
  });
});

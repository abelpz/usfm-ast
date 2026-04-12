import { getMarkerChoicesForMode, isMarkerAllowedForSection } from '../src/marker-context';

describe('getMarkerChoicesForMode', () => {
  it('basic mode returns paragraph and heading rows for chapter', () => {
    const ch = getMarkerChoicesForMode('chapter', 'basic');
    expect(ch.map((c) => c.marker).sort()).toEqual(['p', 's1']);
  });

  it('basic mode book_introduction lists ip and is1', () => {
    const b = getMarkerChoicesForMode('book_introduction', 'basic');
    expect(b.map((c) => c.marker).sort()).toEqual(['ip', 'is1']);
  });

  it('isMarkerAllowedForSection respects basic intro allowlist', () => {
    expect(isMarkerAllowedForSection('ip', 'book_introduction', 'basic')).toBe(true);
    expect(isMarkerAllowedForSection('is1', 'book_introduction', 'basic')).toBe(true);
    expect(isMarkerAllowedForSection('p', 'book_introduction', 'basic')).toBe(false);
  });

  it('medium mode returns simplified CONTEXT_AWARE rows for chapter', () => {
    const ch = getMarkerChoicesForMode('chapter', 'medium');
    expect(ch.length).toBeGreaterThan(1);
    expect(ch.some((c) => c.marker === 'q1')).toBe(true);
  });

  it('advanced mode returns full chapter marker list', () => {
    const ch = getMarkerChoicesForMode('chapter', 'advanced');
    expect(ch.length).toBeGreaterThan(50);
  });
});

import { getMarkerChoicesForMode } from '../src/marker-context';

describe('getMarkerChoicesForMode', () => {
  it('basic mode returns a single paragraph row per chapter section', () => {
    const ch = getMarkerChoicesForMode('chapter', 'basic');
    expect(ch.length).toBe(1);
    expect(ch[0]!.marker).toBe('p');
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

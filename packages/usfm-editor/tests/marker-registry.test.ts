import { getMarkerChoicesForMode } from '../src/marker-context';
import type { EditorSection, MarkerChoice } from '../src/marker-context';
import { DefaultMarkerRegistry, type MarkerRegistry } from '../src/marker-registry';

describe('DefaultMarkerRegistry', () => {
  const reg = new DefaultMarkerRegistry();

  it('getChoicesForMode chapter basic returns p', () => {
    const ch = reg.getChoicesForMode('chapter', 'basic');
    expect(ch.map((c) => c.marker)).toContain('p');
  });

  it('getChoicesForMode chapter advanced returns many markers', () => {
    const ch = reg.getChoicesForMode('chapter', 'advanced');
    expect(ch.length).toBeGreaterThan(50);
  });

  it('getChoicesForMode chapter medium returns friendly set', () => {
    const ch = reg.getChoicesForMode('chapter', 'medium');
    expect(ch.length).toBeGreaterThanOrEqual(8);
    expect(ch.length).toBeLessThan(50);
  });

  it('getChoicesForMode header basic returns h', () => {
    const h = reg.getChoicesForMode('header', 'basic');
    expect(h.map((c) => c.marker)).toContain('h');
  });

  it('canInsertVerse chapter true; header false', () => {
    expect(reg.canInsertVerse('chapter')).toBe(true);
    expect(reg.canInsertVerse('header')).toBe(false);
  });

  it('canInsertChapter chapter true; header false', () => {
    expect(reg.canInsertChapter('chapter')).toBe(true);
    expect(reg.canInsertChapter('header')).toBe(false);
  });

  it('unknown mode falls back like getMarkerChoicesForMode', () => {
    expect(reg.getChoicesForMode('chapter', 'draft')).toEqual(
      getMarkerChoicesForMode('chapter', 'draft')
    );
  });
});

describe('custom MarkerRegistry', () => {
  it('can add a custom marker to choices', () => {
    const prayer: MarkerChoice = { marker: 'prayer', label: 'Prayer' };
    const base = new DefaultMarkerRegistry();
    const custom: MarkerRegistry = {
      getChoicesForMode(section: EditorSection, mode: string) {
        if (section === 'chapter' && mode === 'basic') {
          return [...base.getChoicesForMode(section, mode), prayer];
        }
        return base.getChoicesForMode(section, mode);
      },
      getValidParagraphMarkers: (s) => base.getValidParagraphMarkers(s),
      canInsertVerse: (s) => base.canInsertVerse(s),
      canInsertChapter: (s) => base.canInsertChapter(s),
      getStructuralInsertions: (st, p) => base.getStructuralInsertions(st, p),
      getSectionAtPos: (st, p) => base.getSectionAtPos(st, p),
    };
    const ch = custom.getChoicesForMode('chapter', 'basic');
    expect(ch.some((c) => c.marker === 'prayer')).toBe(true);
  });
});

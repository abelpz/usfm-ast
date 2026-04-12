import { DefaultMarkerRegistry } from '@usfm-tools/editor';

import { createDocsPresentationLayer, mergePresentationLayer } from '../src/docs-presentation';

describe('Docs presentation layer', () => {
  const registry = new DefaultMarkerRegistry();
  const pres = createDocsPresentationLayer(registry);

  it('labels p as Paragraph in basic mode', () => {
    const label = pres.markerLabel('p', 'chapter', 'basic');
    expect(label).toBe('Paragraph');
  });

  it('keeps USFM-style label in advanced mode for q1', () => {
    expect(pres.markerLabel('q1', 'chapter', 'advanced')).toBe('\\q1');
  });

  it('maps menu categories for simplified modes', () => {
    expect(pres.menuCategory('Structure', 'basic')).toBe('Insert');
    expect(pres.menuCategory('Common', 'medium')).toBe('Paragraph styles');
  });

  it('detects simplified modes', () => {
    expect(pres.isSimplifiedMode('basic')).toBe(true);
    expect(pres.isSimplifiedMode('advanced')).toBe(false);
  });

  it('returns SVG string for bubble bold icon', () => {
    const svg = pres.bubbleIcon('bold');
    expect(typeof svg).toBe('string');
    expect(svg).toContain('<svg');
  });

  it('mergePresentationLayer overrides markerLabel when provided', () => {
    const merged = mergePresentationLayer(pres, {
      markerLabel: () => 'Custom label',
    });
    expect(merged.markerLabel('p', 'chapter', 'basic')).toBe('Custom label');
  });
});

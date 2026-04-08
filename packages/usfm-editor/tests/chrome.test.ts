import { resolveUSFMChrome } from '../src/chrome';

describe('resolveUSFMChrome', () => {
  it('minimal preset hides glyphs and header title', () => {
    const c = resolveUSFMChrome({ preset: 'minimal' });
    expect(c.header.title).toBe('none');
    expect(c.markers.showGlyph).toBe(false);
    expect(c.bookId.layout).toBe('split');
  });

  it('merges overrides on top of preset', () => {
    const c = resolveUSFMChrome({
      preset: 'minimal',
      header: { title: 'text', titleText: 'Meta' },
    });
    expect(c.header.title).toBe('text');
    expect(c.header.titleText).toBe('Meta');
    expect(c.bookTitles.title).toBe('none');
    expect(c.markers.showGlyph).toBe(false);
  });
});

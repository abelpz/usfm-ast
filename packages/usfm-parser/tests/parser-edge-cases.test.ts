/**
 * Targeted USFM strings for regression / edge behaviour (unicode, minimal docs, nesting).
 */
import { USFMParser } from '../src/parser/index';

describe('USFMParser edge cases', () => {
  it('empty input yields empty USJ content', () => {
    const p = new USFMParser();
    p.load('').parse();
    const j = p.toJSON();
    expect(j.type).toBe('USJ');
    expect(j.content).toEqual([]);
  });

  it('whitespace-only input', () => {
    const p = new USFMParser();
    p.load('   \n\t  ').parse();
    const j = p.toJSON();
    expect(j.type).toBe('USJ');
    expect(Array.isArray(j.content)).toBe(true);
  });

  it('book id only', () => {
    const p = new USFMParser();
    p.load('\\id TIT EN_ULT').parse();
    const j = p.toJSON();
    expect(j.content?.length).toBeGreaterThanOrEqual(1);
    expect((j.content[0] as { type?: string }).type).toBe('book');
  });

  it('unicode in verse text', () => {
    const p = new USFMParser();
    p.load('\\id MAT\n\\c 1\n\\p\n\\v 1 Hello — 世界').parse();
    const j = p.toJSON();
    const flat = JSON.stringify(j);
    expect(flat).toContain('世界');
  });

  it('nested character styles in paragraph', () => {
    const p = new USFMParser();
    p.load('\\id TIT\n\\c 1\n\\p\n\\v 1 \\bd outer \\it inner\\it* outer end\\bd*').parse();
    const j = p.toJSON();
    expect(j.content?.length).toBeGreaterThan(0);
  });

  it('footnote with multiple note-content markers', () => {
    const p = new USFMParser();
    p.load(
      '\\id TIT\n\\c 1\n\\p\n\\v 1 Text \\f + \\fr 1:1 \\ft gloss\\f* after.'
    ).parse();
    const j = p.toJSON();
    const s = JSON.stringify(j);
    expect(s).toContain('note');
  });

  it('table row with ranged cell marker', () => {
    const p = new USFMParser();
    p.load('\\id NUM\n\\c 2\n\\tr \\th1 A \\tcr1-2 Span').parse();
    const j = p.toJSON();
    expect(JSON.stringify(j)).toContain('table');
  });
});

/**
 * Stable API contract for @usfm-tools/parser (USFMParser).
 * Run in CI alongside ci-smoke; expectations match current output, not legacy tests.
 */
import { USFMParser } from '../src/parser/index';

describe('USFMParser contract (@usfm-tools/parser)', () => {
  it('toJSON returns a USJ root with version and content array', () => {
    const parser = new USFMParser();
    parser.load('\\id MAT').parse();
    const doc = parser.toJSON();
    expect(doc).toMatchObject({
      type: 'USJ',
      version: expect.any(String),
    });
    expect(Array.isArray(doc.content)).toBe(true);
  });

  it('paragraph marker yields para node from getNodes', () => {
    const parser = new USFMParser();
    parser.load('\\p hello').parse();
    const nodes = parser.getNodes();
    expect(nodes.length).toBeGreaterThanOrEqual(1);
    expect(nodes[0]).toMatchObject({ type: 'para', marker: 'p' });
  });

  it('supports fluent load().parse() and exposes getNodes array', () => {
    const parser = new USFMParser();
    const out = parser.load('\\c 1').parse().getNodes();
    expect(Array.isArray(out)).toBe(true);
    expect(out.some((n) => n && typeof (n as { type?: string }).type === 'string')).toBe(true);
  });

  it('toJSON nests chapter marker under USJ content', () => {
    const parser = new USFMParser();
    parser.load(['\\id MRK', '\\c 1', '\\p Text.'].join('\n')).parse();
    const doc = parser.toJSON();
    expect(doc.type).toBe('USJ');
    const hasChapter = doc.content?.some(
      (n: unknown) =>
        typeof n === 'object' &&
        n !== null &&
        (n as { type?: string }).type === 'chapter'
    );
    expect(hasChapter).toBe(true);
  });
});

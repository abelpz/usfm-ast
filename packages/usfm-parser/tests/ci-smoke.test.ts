/**
 * Minimal checks for CI. Older suites under tests/ still expect a previous
 * node shape (e.g. paragraph vs para); run them locally with CI unset.
 * See also usfm-parser-contract.test.ts (runs in CI).
 */
import { USFMParser } from '../src/parser/index';

describe('CI smoke (@usfm-tools/parser)', () => {
  it('parses a simple paragraph', () => {
    const parser = new USFMParser();
    parser.load('\\p hello').parse();
    const nodes = parser.getNodes();
    expect(Array.isArray(nodes)).toBe(true);
    expect(nodes.length).toBe(1);
    expect(nodes[0]).toMatchObject({ type: 'para', marker: 'p' });
  });
});

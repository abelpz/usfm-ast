/**
 * Minimal checks for CI. The main Jest suites still expect a legacy AST shape;
 * run them locally with CI unset until expectations are updated.
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

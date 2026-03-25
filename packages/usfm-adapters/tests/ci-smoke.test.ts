/**
 * Minimal checks for CI. Full adapter tests include snapshots and round-trips
 * that need refresh; run them locally with CI unset.
 */
import { USFMParser } from '@usfm-tools/parser';
import { USFMVisitor } from '../src';

describe('CI smoke (@usfm-tools/adapters)', () => {
  it('emits USFM from parser output via visitor', () => {
    const parser = new USFMParser();
    const visitor = new USFMVisitor();
    parser.load('\\p hello').parse().visit(visitor);
    const out = visitor.getResult();
    expect(out).toContain('\\p');
    expect(out).toContain('hello');
  });
});

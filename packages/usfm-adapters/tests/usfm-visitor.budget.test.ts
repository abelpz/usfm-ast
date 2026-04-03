import { readFileSync } from 'fs';
import { join } from 'path';
import { USFMParser } from '@usfm-tools/parser';
import { USFMVisitor } from '../src';

describe('USFMVisitor perf budget', () => {
  it('toUSFM on medium fixture stays under budget', () => {
    const usfm = readFileSync(join(__dirname, 'fixtures/usfm/medium.usfm'), 'utf8');
    const parser = new USFMParser();
    parser.parse(usfm);
    const visitor = new USFMVisitor();
    parser.visit(visitor);
    const t0 = performance.now();
    const out = visitor.getResult();
    const ms = performance.now() - t0;
    expect(out.length).toBeGreaterThan(500);
    expect(ms).toBeLessThan(500);
  });
});

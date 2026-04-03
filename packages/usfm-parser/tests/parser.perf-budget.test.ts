import fs from 'fs';
import path from 'path';
import { USFMParser } from '../dist';

/**
 * Fast regression guard for parse throughput (not the full performance suite in `parser.performance.test.ts`).
 */
describe('parser performance budget (CI)', () => {
  it('parses medium fixture repeatedly within a wall-clock budget', () => {
    const usfm = fs.readFileSync(path.join(__dirname, 'fixtures/usfm/medium.usfm'), 'utf8');
    const iterations = 25;
    const parser = new USFMParser({ silentConsole: true });
    const t0 = Date.now();
    for (let i = 0; i < iterations; i++) {
      parser.load(usfm).parse();
    }
    const ms = Date.now() - t0;
    expect(ms).toBeLessThan(30_000);
  });
});

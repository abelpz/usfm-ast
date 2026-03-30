/**
 * Parse every committed USFM under tests/fixtures and examples/usfm-markers (repo root).
 * Ensures the enhanced parser accepts real-world snippets without throwing and emits a USJ root.
 */
import fs from 'fs';
import path from 'path';
import { USFMParser } from '../src/parser/index';

function collectUsfmFiles(rootDir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(rootDir)) return out;
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (name.endsWith('.usfm')) out.push(p);
    }
  };
  walk(rootDir);
  return out.sort();
}

const repoRoot = path.join(__dirname, '..', '..', '..');
const fixtureRoot = path.join(__dirname, 'fixtures');
const examplesRoot = path.join(repoRoot, 'examples', 'usfm-markers');

/** Spec-style marker examples only; omit `examples/conversion` (generated output may not be valid USFM). */
const corpusFiles = [
  ...collectUsfmFiles(fixtureRoot),
  ...collectUsfmFiles(examplesRoot),
].filter((p, i, a) => a.indexOf(p) === i);

describe('USFM corpus (fixtures + examples)', () => {
  jest.setTimeout(120_000);

  it.each(corpusFiles)('parses %s', (filePath) => {
    const usfm = fs.readFileSync(filePath, 'utf8');
    const parser = new USFMParser();
    parser.load(usfm).parse();
    const json = parser.toJSON();
    expect(json).toMatchObject({ type: 'USJ', version: '3.1' });
    expect(Array.isArray(json.content)).toBe(true);
    expect(parser.getRootNode()).not.toBeNull();
  });
});

/**
 * Rewrite example.usj files under examples/usfm-markers from USFMParser output.
 * Run from repo root: bun tools/regenerate-example-usj.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { USFMParser } from '../packages/usfm-parser/dist/index.js';

const EXAMPLES_DIR = path.join(import.meta.dir, '..', 'examples', 'usfm-markers');

function walkUsfmFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walkUsfmFiles(full, out);
    else if (name === 'example.usfm') out.push(full);
  }
  return out;
}

const usfmPaths = walkUsfmFiles(EXAMPLES_DIR);
let ok = 0;
let fail = 0;

for (const usfmPath of usfmPaths) {
  const usjPath = path.join(path.dirname(usfmPath), 'example.usj');
  const usfm = fs.readFileSync(usfmPath, 'utf8');
  try {
    const parser = new USFMParser();
    parser.load(usfm).parse();
    const doc = parser.toJSON();
    fs.writeFileSync(usjPath, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
    ok += 1;
  } catch (e) {
    console.error(`FAIL ${usfmPath}:`, e);
    fail += 1;
  }
}

console.log(`Regenerated ${ok} example.usj files; ${fail} failed.`);

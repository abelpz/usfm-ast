/**
 * Requires devDependency `usfm3` (root `bun install`).
 * Note: npm usfm3@0.1.x may return {} from toUsj(); USX and vref are reliable.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { parse } from 'usfm3';

const [, , infile, outUsx, outVref, outUsj] = process.argv;
if (!infile || !outUsx || !outVref || !outUsj) {
  console.error('usage: node dump-usfm3.mjs <input.usfm> <out.usx> <out.vref.json> <out.usj.json>');
  process.exit(2);
}

const usfm = readFileSync(infile, 'utf8');
const r = parse(usfm, { validate: false });
try {
  writeFileSync(outUsx, r.toUsx(), 'utf8');
  writeFileSync(outVref, JSON.stringify(r.toVref(), null, 2) + '\n', 'utf8');
  writeFileSync(outUsj, JSON.stringify(r.toUsj(), null, 2) + '\n', 'utf8');
} finally {
  r.free();
}

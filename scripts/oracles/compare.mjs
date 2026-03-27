#!/usr/bin/env node
/**
 * Compare external parsers on one USFM file.
 *
 * Outputs (under --out, default ./oracle-out):
 * - usfmtc.usj.json, usfmtc.usx  (needs Python 3 + `pip install usfmtc`)
 * - usfm3.usx, usfm3.vref.json, usfm3.usj.json (needs root `bun install` for devDependency usfm3)
 *
 * Windows: if `python` is wrong (e.g. Inkscape), set PYTHON to a full Python 3.11+ path.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

function parseArgs() {
  const args = process.argv.slice(2);
  let outDir = join(process.cwd(), 'oracle-out');
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out' && args[i + 1]) {
      outDir = resolve(args[++i]);
    } else {
      rest.push(args[i]);
    }
  }
  const usfmPath = rest[0];
  return { usfmPath, outDir };
}

const { usfmPath, outDir } = parseArgs();
if (!usfmPath) {
  console.error('usage: node scripts/oracles/compare.mjs <file.usfm> [--out <dir>]');
  process.exit(2);
}

const absUsfm = resolve(usfmPath);
if (!existsSync(absUsfm)) {
  console.error(`not found: ${absUsfm}`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const pyExe = process.env.PYTHON || process.env.PYTHON3 || 'python';
const usfmtcScript = join(__dirname, 'usfmtc_dump.py');

console.log(`Input: ${absUsfm}`);
console.log(`Output directory: ${outDir}`);

const usfmtcUsj = join(outDir, 'usfmtc.usj.json');
const usfmtcUsx = join(outDir, 'usfmtc.usx');
const py = spawnSync(pyExe, [usfmtcScript, absUsfm, usfmtcUsj, usfmtcUsx], {
  encoding: 'utf-8',
  cwd: repoRoot,
});
if (py.status !== 0) {
  console.warn('[usfmtc] skipped or failed (install: pip install usfmtc; set PYTHON if needed)');
  if (py.stderr) console.warn(py.stderr.trim());
} else {
  console.log('[usfmtc] wrote usfmtc.usj.json, usfmtc.usx');
}

const dumpUsfm3 = join(__dirname, 'dump-usfm3.mjs');
const usfm3Usx = join(outDir, 'usfm3.usx');
const usfm3Vref = join(outDir, 'usfm3.vref.json');
const usfm3Usj = join(outDir, 'usfm3.usj.json');
const node = spawnSync(process.execPath, [dumpUsfm3, absUsfm, usfm3Usx, usfm3Vref, usfm3Usj], {
  encoding: 'utf-8',
  cwd: repoRoot,
});
if (node.status !== 0) {
  console.warn('[usfm3] skipped or failed (run bun install at repo root)');
  if (node.stderr) console.warn(node.stderr.trim());
} else {
  console.log('[usfm3] wrote usfm3.usx, usfm3.vref.json, usfm3.usj.json');
}

console.log('Done. Diff usfmtc.usx vs usfm3.usx or USJ files as needed.');

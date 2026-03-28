#!/usr/bin/env node
/**
 * Compare USJ from @usfm-tools/parser (USFMParser) with USJ from usfmtc (optional).
 *
 * Usage:
 *   node scripts/oracles/compare-parser.mjs <file.usfm>
 *
 * Requires `bun run build` (or tsc in usfm-parser) so dist/ exists.
 * usfmtc: pip install usfmtc; set PYTHON if needed.
 *
 * Env:
 *   ORACLE_REQUIRE_USFMTC=1 — exit 2 if usfmtc cannot be run (strict CI).
 */
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const require = createRequire(import.meta.url);

const usfmPath = resolve(process.argv[2] || '');

if (!usfmPath || !existsSync(usfmPath)) {
  console.error('usage: node scripts/oracles/compare-parser.mjs <file.usfm>');
  process.exit(2);
}

const { USFMParser } = require(resolve(repoRoot, 'packages/usfm-parser/dist/index.js'));
const { compareUsjSimilarity } = require(resolve(repoRoot, 'packages/usfm-parser/dist/oracle/compareUsj.js'));

const usfm = readFileSync(usfmPath, 'utf8');
const parser = new USFMParser();
parser.parse(usfm);
const ours = parser.toJSON();

const requireUsfmtc = process.env.ORACLE_REQUIRE_USFMTC === '1';
const pyExe = process.env.PYTHON || process.env.PYTHON3 || 'python';
const usfmtcScript = join(__dirname, 'usfmtc_dump.py');

const tmp = mkdtempSync(join(tmpdir(), 'usfm-oracle-'));
const usjPath = join(tmp, 'oracle.usj.json');
const usxPath = join(tmp, 'oracle.usx');

const py = spawnSync(pyExe, [usfmtcScript, usfmPath, usjPath, usxPath], {
  encoding: 'utf8',
  cwd: repoRoot,
});

if (py.status !== 0) {
  const msg = `[usfmtc] skipped (install: pip install usfmtc; set PYTHON if needed). status=${py.status}`;
  if (requireUsfmtc) {
    console.error(msg);
    if (py.stderr) console.error(py.stderr.trim());
    process.exit(2);
  }
  console.warn(msg);
  if (py.stderr) console.warn(py.stderr.trim());
  console.log(`USFMParser only: root type=${ours.type} version=${ours.version} content.length=${ours.content?.length ?? 0}`);
  process.exit(0);
}

const oracle = JSON.parse(readFileSync(usjPath, 'utf8'));
const result = compareUsjSimilarity(ours, oracle);

console.log(`Input: ${usfmPath}`);
console.log(`Text similarity:     ${result.textSimilarity.toFixed(4)}`);
console.log(`Structure similarity: ${result.structureSimilarity.toFixed(4)}`);
console.log(`Combined score:      ${result.score.toFixed(4)}`);
console.log(result.ok ? 'OK: oracle vs USFMParser are similar enough.' : 'FAIL: below similarity thresholds.');

for (const m of result.messages) {
  console.warn(m);
}

process.exit(result.ok ? 0 : 1);

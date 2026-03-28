#!/usr/bin/env node
/**
 * Compare USFMParser output with oracles (usfmtc; optionally usfm3 for USX).
 *
 * - USJ: USFMParser.toJSON() vs usfmtc outUsj (tolerant similarity).
 * - USX: USXVisitor on the same parse vs usfmtc outUsx; optionally vs usfm3 toUsx.
 *
 * Usage:
 *   node scripts/oracles/compare-parser.mjs <file.usfm>
 *
 * Requires root `bun run build` (parser + adapters dist).
 * usfmtc: pip install usfmtc; set PYTHON if needed.
 * usfm3: from root `bun install` (devDependency); used for extra USX line if WASM loads.
 *
 * Env:
 *   ORACLE_REQUIRE_USFMTC=1 — exit 2 if usfmtc cannot be run.
 *   ORACLE_SKIP_USFM3=1    — do not run usfm3 USX comparison.
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
const { USXVisitor } = require(resolve(repoRoot, 'packages/usfm-adapters/dist/index.js'));
const { compareUsjSimilarity, compareUsxSimilarity } = require(
  resolve(repoRoot, 'packages/usfm-parser/dist/oracle/index.js')
);

const usfm = readFileSync(usfmPath, 'utf8');
const parser = new USFMParser();
parser.parse(usfm);
const oursUsj = parser.toJSON();

const usxVisitor = new USXVisitor();
parser.visit(usxVisitor);
const oursUsx = usxVisitor.getDocument();

const requireUsfmtc = process.env.ORACLE_REQUIRE_USFMTC === '1';
const skipUsfm3 = process.env.ORACLE_SKIP_USFM3 === '1';
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
  console.log(`USFMParser only: USJ root type=${oursUsj.type} version=${oursUsj.version}`);
  console.log(`Our USX length: ${oursUsx.length} chars`);
  process.exit(0);
}

const oracleUsj = JSON.parse(readFileSync(usjPath, 'utf8'));
const oracleUsx = readFileSync(usxPath, 'utf8');

const usjResult = compareUsjSimilarity(oursUsj, oracleUsj);
const usxResult = compareUsxSimilarity(oursUsx, oracleUsx);

console.log(`Input: ${usfmPath}`);
console.log('');
console.log('=== USJ (USFMParser vs usfmtc) ===');
console.log(`Text similarity:      ${usjResult.textSimilarity.toFixed(4)}`);
console.log(`Structure similarity: ${usjResult.structureSimilarity.toFixed(4)}`);
console.log(`Combined score:       ${usjResult.score.toFixed(4)}`);
console.log(usjResult.ok ? 'OK' : 'FAIL');
for (const m of usjResult.messages) console.warn(m);

console.log('');
console.log('=== USX (USXVisitor vs usfmtc) ===');
console.log(`Text similarity:   ${usxResult.textSimilarity.toFixed(4)}`);
console.log(`Tag similarity:    ${usxResult.tagSimilarity.toFixed(4)}`);
console.log(`Combined score:    ${usxResult.score.toFixed(4)}`);
console.log(usxResult.ok ? 'OK' : 'FAIL');
for (const m of usxResult.messages) console.warn(m);

if (!skipUsfm3) {
  const dumpUsfm3 = join(__dirname, 'dump-usfm3.mjs');
  const usfm3UsxPath = join(tmp, 'usfm3.usx');
  const usfm3Vref = join(tmp, 'usfm3.vref.json');
  const usfm3Usj = join(tmp, 'usfm3.usj.json');
  const node = spawnSync(process.execPath, [dumpUsfm3, usfmPath, usfm3UsxPath, usfm3Vref, usfm3Usj], {
    encoding: 'utf8',
    cwd: repoRoot,
  });
  if (node.status !== 0) {
    console.log('');
    console.warn('[usfm3] skipped (usfm3 WASM/node error).');
    if (node.stderr) console.warn(node.stderr.trim());
  } else {
    const usfm3Usx = readFileSync(usfm3UsxPath, 'utf8');
    const usxVsUsfm3 = compareUsxSimilarity(oursUsx, usfm3Usx);
    console.log('');
    console.log('=== USX (USXVisitor vs usfm3) ===');
    console.log(`Text similarity:   ${usxVsUsfm3.textSimilarity.toFixed(4)}`);
    console.log(`Tag similarity:    ${usxVsUsfm3.tagSimilarity.toFixed(4)}`);
    console.log(`Combined score:    ${usxVsUsfm3.score.toFixed(4)}`);
    console.log(usxVsUsfm3.ok ? 'OK' : 'FAIL');
    for (const m of usxVsUsfm3.messages) console.warn(m);
  }
}

const allOk = usjResult.ok && usxResult.ok;
console.log('');
console.log(allOk ? 'Overall: USJ + USX (vs usfmtc) OK.' : 'Overall: FAIL (see above).');
process.exit(allOk ? 0 : 1);

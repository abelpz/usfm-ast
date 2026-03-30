#!/usr/bin/env node
/**
 * Compare parsers on one USFM file: emit USJ (and USX) for side-by-side diff.
 *
 * Outputs (under --out, default ./oracle-out):
 * - usfm-parser.usj.json  (@usfm-tools/parser USFMParser.toJSON(); needs `bunx turbo run build --filter=@usfm-tools/parser`)
 * - usfmtc.usj.json, usfmtc.usx  (needs Python 3 + `pip install usfmtc`)
 * - usfm3.usx, usfm3.vref.json, usfm3.usj.json (needs root `bun install` for devDependency usfm3)
 * - ORACLE_STATUS.json — which backends succeeded; explains missing or placeholder USJ
 *
 * All `.json` USJ outputs are normalized with JSON.parse + JSON.stringify (2-space indent) so
 * `diff`/`code --diff` compares stable, human-readable trees.
 *
 * Windows: if `python` is wrong (e.g. Inkscape), set PYTHON to a full Python 3.11+ path.
 * If `usfmtc` is not installed, the script runs `pip install -r scripts/oracles/requirements.txt` once
 * unless ORACLE_SKIP_USFMTC_PIP=1.
 */
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { spawnUsfmtcDump } from './usfmtc-env.mjs';
import { loadOracleCustomMarkers } from './oracle-custom-markers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const require = createRequire(import.meta.url);

/** Round-trip through JSON so outputs share one formatting path (parse → stringify). */
function formatJsonTree(obj) {
  return JSON.stringify(JSON.parse(JSON.stringify(obj)), null, 2) + '\n';
}

function fileBytes(p) {
  try {
    return statSync(p).size;
  } catch {
    return 0;
  }
}

function writeUsfmParserUsj(absUsfm, outFile, root) {
  const entry = resolve(repoRoot, 'packages/usfm-parser/dist/index.js');
  if (!existsSync(entry)) {
    console.warn(
      '[usfm-parser] skipped: packages/usfm-parser/dist not found (run: bunx turbo run build --filter=@usfm-tools/parser)'
    );
    return { ok: false, reason: 'dist missing' };
  }
  try {
    const { USFMParser } = require(entry);
    const usfm = readFileSync(absUsfm, 'utf8');
    const customMarkers = loadOracleCustomMarkers(absUsfm, root);
    const parser = customMarkers ? new USFMParser({ customMarkers }) : new USFMParser();
    parser.parse(usfm);
    const usj = parser.toJSON();
    writeFileSync(outFile, formatJsonTree(usj), 'utf8');
    console.log(`[usfm-parser] wrote ${outFile}`);
    return { ok: true, bytes: fileBytes(outFile) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[usfm-parser] failed:', msg);
    return { ok: false, reason: msg };
  }
}

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

console.log(`Input: ${absUsfm}`);
console.log(`Output directory: ${outDir}`);

const status = {
  input: absUsfm,
  outputDirectory: outDir,
  usfmParser: null,
  usfmtc: null,
  usfm3: null,
};

const oursUsj = join(outDir, 'usfm-parser.usj.json');
status.usfmParser = writeUsfmParserUsj(absUsfm, oursUsj, repoRoot);

const usfmtcScript = join(__dirname, 'usfmtc_dump.py');

const usfmtcUsj = join(outDir, 'usfmtc.usj.json');
const usfmtcUsx = join(outDir, 'usfmtc.usx');
const py = spawnUsfmtcDump(usfmtcScript, absUsfm, usfmtcUsj, usfmtcUsx, repoRoot);
if (py.status !== 0) {
  const errText = [py.stderr, py.stdout].filter(Boolean).join('\n').trim();
  console.warn('[usfmtc] skipped or failed (install: pip install usfmtc; set PYTHON if needed)');
  if (errText) console.warn(errText);
  status.usfmtc = {
    ok: false,
    hint:
      'Install Python 3.11+ with pip from python.org, then re-run (or set PYTHON or lowercase `python` to python.exe). Scripts try PYTHON / $python, python3, and python — a stray python (e.g. Inkscape) without pip is skipped. ORACLE_SKIP_USFMTC_PIP=1 disables auto pip install.',
    stderr: errText.slice(0, 4000),
  };
  writeFileSync(
    join(outDir, 'usfmtc.status.json'),
    formatJsonTree(status.usfmtc),
    'utf8'
  );
  console.log('[usfmtc] wrote usfmtc.status.json (usfmtc USJ/USX not generated)');
  for (const p of [usfmtcUsj, usfmtcUsx]) {
    try {
      if (existsSync(p)) unlinkSync(p);
    } catch {
      /* ignore */
    }
  }
} else {
  if (existsSync(usfmtcUsj)) {
    writeFileSync(usfmtcUsj, formatJsonTree(JSON.parse(readFileSync(usfmtcUsj, 'utf8'))), 'utf8');
  }
  status.usfmtc = {
    ok: true,
    files: ['usfmtc.usj.json', 'usfmtc.usx'],
    usjBytes: fileBytes(usfmtcUsj),
  };
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
  status.usfm3 = { ok: false, stderr: (node.stderr || '').trim().slice(0, 2000) };
} else {
  if (existsSync(usfm3Usj)) {
    const parsed = JSON.parse(readFileSync(usfm3Usj, 'utf8'));
    writeFileSync(usfm3Usj, formatJsonTree(parsed), 'utf8');
    if (parsed && typeof parsed === 'object' && '_oracleNote' in parsed) {
      console.warn(
        '[usfm3] usfm3.usj.json has no real USJ tree (library returns empty toUsj); read _oracleNote inside the file.'
      );
    }
  }
  if (existsSync(usfm3Vref)) {
    writeFileSync(usfm3Vref, formatJsonTree(JSON.parse(readFileSync(usfm3Vref, 'utf8'))), 'utf8');
  }
  const usjParsed = existsSync(usfm3Usj)
    ? JSON.parse(readFileSync(usfm3Usj, 'utf8'))
    : {};
  status.usfm3 = {
    ok: true,
    files: ['usfm3.usx', 'usfm3.vref.json', 'usfm3.usj.json'],
    usjPlaceholder: Boolean(usjParsed && usjParsed._oracleNote),
    usjBytes: fileBytes(usfm3Usj),
    usxBytes: fileBytes(usfm3Usx),
  };
  console.log('[usfm3] wrote usfm3.usx (line-broken), usfm3.vref.json, usfm3.usj.json');
}

writeFileSync(join(outDir, 'ORACLE_STATUS.json'), formatJsonTree(status), 'utf8');
console.log(`Wrote ${join(outDir, 'ORACLE_STATUS.json')} (read this for what is complete vs placeholder).`);
console.log('Done. Diff *.usj.json where backends succeeded; use USX when usfm3 USJ is placeholder.');

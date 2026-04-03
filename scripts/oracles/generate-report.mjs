#!/usr/bin/env node
/**
 * Run oracle artifact generation (optional) and write oracle-out/ORACLE_REPORT.md
 * with USJ/USX comparison metrics and structural deltas.
 *
 * Usage:
 *   node scripts/oracles/generate-report.mjs [path/to/file.usfm] [--out ./oracle-out] [--no-refresh]
 */
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadOracleCustomMarkers } from './oracle-custom-markers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const require = createRequire(import.meta.url);

function parseArgs() {
  const args = process.argv.slice(2);
  let outDir = join(repoRoot, 'oracle-out');
  let refresh = true;
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out' && args[i + 1]) {
      outDir = resolve(args[++i]);
    } else if (args[i] === '--no-refresh') {
      refresh = false;
    } else {
      rest.push(args[i]);
    }
  }
  const input =
    rest[0] ||
    join(repoRoot, 'packages/usfm-parser/tests/fixtures/usfm/basic.usfm');
  return { input: resolve(input), outDir, refresh };
}

function countNodeTypes(value) {
  const counts = new Map();
  function walk(n) {
    if (n === null || n === undefined) return;
    if (typeof n !== 'object') return;
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (typeof n.type === 'string' && n.type.length > 0) {
      counts.set(n.type, (counts.get(n.type) ?? 0) + 1);
    }
    const c = n.content;
    if (c === undefined) return;
    if (typeof c === 'string') return;
    if (Array.isArray(c)) c.forEach(walk);
  }
  walk(value);
  return counts;
}

function countSidKeys(value) {
  let n = 0;
  function walk(x) {
    if (x === null || x === undefined) return;
    if (typeof x !== 'object') return;
    if (Array.isArray(x)) return x.forEach(walk);
    if (Object.prototype.hasOwnProperty.call(x, 'sid') && x.sid != null && x.sid !== '') n++;
    const c = x.content;
    if (Array.isArray(c)) c.forEach(walk);
  }
  walk(value);
  return n;
}

function mdTable(headers, rows) {
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
  const line = (cells) => `| ${cells.map(esc).join(' | ')} |`;
  const h = line(headers);
  const sep = line(headers.map(() => '---'));
  const body = rows.length ? `${rows.map((r) => line(r)).join('\n')}` : '';
  return body ? `${h}\n${sep}\n${body}` : `${h}\n${sep}`;
}

const { input, outDir, refresh } = parseArgs();

if (refresh) {
  const compare = join(__dirname, 'compare.mjs');
  const r = spawnSync(process.execPath, [compare, input, '--out', outDir], {
    cwd: repoRoot,
    encoding: 'utf-8',
  });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout || 'compare.mjs failed');
    process.exit(r.status ?? 1);
  }
}

if (!existsSync(join(outDir, 'ORACLE_STATUS.json'))) {
  console.error(`Missing ORACLE_STATUS.json in ${outDir}. Run with refresh or oracles:compare first.`);
  process.exit(1);
}

const status = JSON.parse(readFileSync(join(outDir, 'ORACLE_STATUS.json'), 'utf8'));

const { compareUsjSimilarity, compareUsxSimilarity } = require(
  resolve(repoRoot, 'packages/usfm-parser/dist/oracle/index.js')
);
const { USFMParser } = require(resolve(repoRoot, 'packages/usfm-parser/dist/index.js'));
const { USXVisitor } = require(resolve(repoRoot, 'packages/usfm-adapters/dist/index.js'));

const usfm = readFileSync(input, 'utf8');
const customMarkers = loadOracleCustomMarkers(input, repoRoot);
const parser = customMarkers ? new USFMParser({ customMarkers }) : new USFMParser();
parser.parse(usfm);
const oursUsj = parser.toJSON();
const usxFmtc = new USXVisitor({
  verseMilestones: 'minimal',
  inlineBareSectionMilestones: true,
});
parser.visit(usxFmtc);
const oursUsx = usxFmtc.getDocument();
const usxUsfm3 = new USXVisitor();
parser.visit(usxUsfm3);
const oursUsxExplicit = usxUsfm3.getDocument();

const parserUsjPath = join(outDir, 'usfm-parser.usj.json');
const fmtcUsjPath = join(outDir, 'usfmtc.usj.json');
const fmtcUsxPath = join(outDir, 'usfmtc.usx');
const usfm3UsxPath = join(outDir, 'usfm3.usx');
const usfm3UsjPath = join(outDir, 'usfm3.usj.json');

let usjVsFmtc = null;
let typeRows = [];
let parserUsjDisk = null;
let fmtcUsj = null;

if (existsSync(parserUsjPath)) {
  parserUsjDisk = JSON.parse(readFileSync(parserUsjPath, 'utf8'));
}
if (existsSync(fmtcUsjPath)) {
  fmtcUsj = JSON.parse(readFileSync(fmtcUsjPath, 'utf8'));
}
const fmtcOk = status.usfmtc && status.usfmtc.ok === true;
if (parserUsjDisk && fmtcUsj && fmtcOk) {
  usjVsFmtc = compareUsjSimilarity(parserUsjDisk, fmtcUsj);
  const h1 = countNodeTypes(parserUsjDisk);
  const h2 = countNodeTypes(fmtcUsj);
  const types = new Set([...h1.keys(), ...h2.keys()]);
  typeRows = [...types].sort().map((t) => {
    const a = h1.get(t) ?? 0;
    const b = h2.get(t) ?? 0;
    return [t, a, b, a === b ? '' : b - a];
  });
}

let usxVsFmtc = null;
let usxVsUsfm3 = null;
if (fmtcOk && existsSync(fmtcUsxPath)) {
  const oracleUsx = readFileSync(fmtcUsxPath, 'utf8');
  usxVsFmtc = compareUsxSimilarity(oursUsx, oracleUsx);
}
if (existsSync(usfm3UsxPath)) {
  const u3 = readFileSync(usfm3UsxPath, 'utf8');
  usxVsUsfm3 = compareUsxSimilarity(oursUsxExplicit, u3);
}

let usfm3UsjNote = null;
if (existsSync(usfm3UsjPath)) {
  const uj = JSON.parse(readFileSync(usfm3UsjPath, 'utf8'));
  if (uj && typeof uj === 'object' && uj._oracleNote) usfm3UsjNote = uj._oracleNote;
}

const generatedAt = new Date().toISOString();

const lines = [];
lines.push('# Oracle comparison report');
lines.push('');
lines.push(`- **Generated:** ${generatedAt}`);
lines.push(`- **Input USFM:** \`${input.replace(/\\/g, '/')}\``);
lines.push(`- **Output directory:** \`${outDir.replace(/\\/g, '/')}\``);
lines.push(`- **Refresh:** ${refresh ? 'ran `compare.mjs` before reporting' : 'used existing artifacts (\`--no-refresh\`)'}`);
lines.push('');

lines.push('## Backend status (`ORACLE_STATUS.json`)');
lines.push('');
lines.push('```json');
lines.push(JSON.stringify(status, null, 2));
lines.push('```');
lines.push('');

lines.push('## USJ: @usfm-tools/parser vs usfmtc');
lines.push('');
if (!fmtcOk) {
  lines.push(
    '*usfmtc did not run successfully (`ORACLE_STATUS.json` → `usfmtc.ok: false`). Install Python + usfmtc, set `PYTHON`, then re-run `compare.mjs`.*'
  );
} else if (!usjVsFmtc) {
  lines.push('*Could not compare — missing `usfm-parser.usj.json` or `usfmtc.usj.json`.*');
} else {
  lines.push('Tolerant metrics: flattened text (Dice bigrams) + cosine on `type` histograms.');
  lines.push('');
  lines.push(mdTable(['Metric', 'Value'], [
    ['Text similarity', usjVsFmtc.textSimilarity.toFixed(4)],
    ['Structure similarity (type histogram)', usjVsFmtc.structureSimilarity.toFixed(4)],
    ['Combined score', usjVsFmtc.score.toFixed(4)],
    ['Pass (default thresholds)', usjVsFmtc.ok ? 'yes' : 'no'],
  ]));
  if (usjVsFmtc.messages.length) {
    lines.push('');
    lines.push('Messages:');
    usjVsFmtc.messages.forEach((m) => lines.push(`- ${m}`));
  }
  lines.push('');
  lines.push('### Root metadata');
  lines.push('');
  lines.push(
    mdTable(['Field', 'Parser', 'usfmtc'], [
      ['USJ `version`', parserUsjDisk?.version ?? '—', fmtcUsj?.version ?? '—'],
      [
        'Nodes with `sid` (approx.)',
        String(countSidKeys(parserUsjDisk)),
        String(countSidKeys(fmtcUsj)),
      ],
    ])
  );
  lines.push('');
  lines.push('### `type` counts (parser vs usfmtc)');
  lines.push('');
  if (typeRows.length) {
    lines.push(mdTable(['type', 'parser', 'usfmtc', 'Δ (usfmtc − parser)'], typeRows));
  }
  lines.push('');
  lines.push('### Typical shape differences (qualitative)');
  lines.push('');
  lines.push(
    '- **Version string:** parser often emits USJ 3.1; usfmtc may emit 3.0 — does not affect similarity scores directly.'
  );
  lines.push(
    '- **`sid` on book/chapter/verse:** parser frequently adds `sid`; usfmtc may omit it on the same logical nodes.'
  );
  lines.push(
    '- **Whitespace in `content` arrays:** punctuation and spaces may be split into separate string nodes in one tree and merged differently in the other; normalized text comparison collapses whitespace so scores can still be 1.0.'
  );
  lines.push(
    '- **Attribute ordering / key order on `char`:** JSON key order differs; semantics are compared via structure and text flattening, not byte equality.'
  );
}
lines.push('');

lines.push('## USJ: npm `usfm3`');
lines.push('');
if (usfm3UsjNote) {
  lines.push('`usfm3.usj.json` is a **placeholder** for this input:');
  lines.push('');
  lines.push(`> ${usfm3UsjNote}`);
  lines.push('');
  lines.push('Use **`usfm3.usx`** and **`usfm3.vref.json`** for npm usfm3 parity on this fixture, not USJ.');
} else if (existsSync(usfm3UsjPath)) {
  lines.push('usfm3 USJ present; no `_oracleNote` — inspect `usfm3.usj.json` manually.');
} else {
  lines.push('*No `usfm3.usj.json` in output directory.*');
}
lines.push('');

lines.push('## USX: USXVisitor vs oracles (parsed XML DOM)');
lines.push('');
lines.push(
  'Metrics ignore **text character data** between tags. **Structure** = recursive tag alignment + child-count penalty; **attributes** = value match on **shared** attribute names only (extra attrs on one side are ignored); **tag histogram** = cosine on element name counts.'
);
lines.push('');
if (usxVsFmtc) {
  lines.push('### vs usfmtc');
  lines.push('');
  lines.push(
    mdTable(['Metric', 'Value'], [
      ['Structure similarity', usxVsFmtc.structureSimilarity.toFixed(4)],
      ['Attribute similarity (shared keys)', usxVsFmtc.attributeSimilarity.toFixed(4)],
      ['Tag histogram similarity', usxVsFmtc.tagHistogramSimilarity.toFixed(4)],
      ['Combined score', usxVsFmtc.score.toFixed(4)],
      ['Pass (default thresholds)', usxVsFmtc.ok ? 'yes' : 'no'],
    ])
  );
  if (usxVsFmtc.messages.length) {
    lines.push('');
    usxVsFmtc.messages.forEach((m) => lines.push(`- ${m}`));
  }
  lines.push('');
  lines.push(
    '**Why structure is often below 1.0:** milestone / `verse` / `chapter` boundaries and sibling ordering can differ while scripture text still aligns; attribute similarity stays high when overlapping attrs (`style`, `number`, etc.) agree.'
  );
} else {
  lines.push('*No `usfmtc.usx` — skip USX vs usfmtc.*');
}
lines.push('');
if (usxVsUsfm3) {
  lines.push('### vs usfm3');
  lines.push('');
  lines.push(
    mdTable(['Metric', 'Value'], [
      ['Structure similarity', usxVsUsfm3.structureSimilarity.toFixed(4)],
      ['Attribute similarity', usxVsUsfm3.attributeSimilarity.toFixed(4)],
      ['Tag histogram similarity', usxVsUsfm3.tagHistogramSimilarity.toFixed(4)],
      ['Combined score', usxVsUsfm3.score.toFixed(4)],
      ['Pass (default thresholds)', usxVsUsfm3.ok ? 'yes' : 'no'],
    ])
  );
}
lines.push('');

lines.push('## Artifact sizes (bytes)');
lines.push('');
const artifacts = [
  'ORACLE_STATUS.json',
  'usfm-parser.usj.json',
  'usfmtc.usj.json',
  'usfmtc.usx',
  'usfm3.usj.json',
  'usfm3.usx',
  'usfm3.vref.json',
];
const sizeRows = artifacts
  .filter((f) => existsSync(join(outDir, f)))
  .map((f) => [f, String(statSync(join(outDir, f)).size)]);
lines.push(mdTable(['File', 'Bytes'], sizeRows));
lines.push('');

lines.push('## Regenerate');
lines.push('');
lines.push('```bash');
lines.push('bun run oracles:compare -- packages/usfm-parser/tests/fixtures/usfm/basic.usfm --out ./oracle-out');
lines.push('bun run oracles:report');
lines.push('```');
lines.push('');
lines.push('Set `PYTHON` / `python` to a Python 3.11+ with pip if usfmtc is not on the default interpreter.');
lines.push('');

const reportPath = join(outDir, 'ORACLE_REPORT.md');
writeFileSync(reportPath, lines.join('\n'), 'utf8');
console.log(`Wrote ${reportPath}`);

const metricsPath = join(outDir, 'ORACLE_METRICS.json');
const metrics = {
  generatedAt,
  input: input.replace(/\\/g, '/'),
  outDir: outDir.replace(/\\/g, '/'),
  status,
  usjVsFmtc: usjVsFmtc
    ? {
        textSimilarity: usjVsFmtc.textSimilarity,
        structureSimilarity: usjVsFmtc.structureSimilarity,
        score: usjVsFmtc.score,
        ok: usjVsFmtc.ok,
        messages: usjVsFmtc.messages,
      }
    : null,
  usxVsFmtc: usxVsFmtc
    ? {
        structureSimilarity: usxVsFmtc.structureSimilarity,
        attributeSimilarity: usxVsFmtc.attributeSimilarity,
        tagHistogramSimilarity: usxVsFmtc.tagHistogramSimilarity,
        score: usxVsFmtc.score,
        ok: usxVsFmtc.ok,
        messages: usxVsFmtc.messages,
      }
    : null,
  usxVsUsfm3: usxVsUsfm3
    ? {
        structureSimilarity: usxVsUsfm3.structureSimilarity,
        attributeSimilarity: usxVsUsfm3.attributeSimilarity,
        tagHistogramSimilarity: usxVsUsfm3.tagHistogramSimilarity,
        score: usxVsUsfm3.score,
        ok: usxVsUsfm3.ok,
        messages: usxVsUsfm3.messages,
      }
    : null,
  usfm3UsjPlaceholder: Boolean(usfm3UsjNote),
};
writeFileSync(metricsPath, JSON.stringify(metrics, null, 2) + '\n', 'utf8');
console.log(`Wrote ${metricsPath}`);

/**
 * generate-oracle-diffs.mjs
 *
 * For every USFM file in the corpus (fixtures + examples), performs a full
 * roundtrip (USFM → parse → USFMVisitor → re-parse) and writes:
 *
 *   docs/oracle-diffs/<path>.diff.md   — per-file diff + oracle scores
 *   docs/oracle-diffs/SUMMARY.md       — sortable table of all scores
 *
 * Run:  node scripts/generate-oracle-diffs.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ── resolve monorepo root ────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

// ── dynamic imports (CJS dist) ───────────────────────────────────────────────
// Use pathToFileURL so Windows absolute paths become valid file:// URLs.
import { pathToFileURL } from 'url';
const toUrl = (p) => pathToFileURL(p).href;

const { USFMParser } = await import(toUrl(
  path.join(REPO_ROOT, 'packages/usfm-parser/dist/index.js')
));
const { USFMVisitor, USXVisitor } = await import(toUrl(
  path.join(REPO_ROOT, 'packages/usfm-adapters/dist/index.js')
));
const { compareUsjSimilarity } = await import(toUrl(
  path.join(REPO_ROOT, 'packages/usfm-parser/dist/oracle/compareUsj.js')
));
const { compareUsxSimilarity } = await import(toUrl(
  path.join(REPO_ROOT, 'packages/usfm-parser/dist/oracle/compareUsx.js')
));

// ── corpus collection ────────────────────────────────────────────────────────
function collectUsfm(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.usfm')) out.push(p);
    }
  }
  walk(root);
  return out;
}

const fixtureRoot  = path.join(REPO_ROOT, 'packages/usfm-parser/tests/fixtures/usfm');
const examplesRoot = path.join(REPO_ROOT, 'examples/usfm-markers');

// de-duplicate by repo-relative path tail
const byTail = new Map();
for (const abs of [...collectUsfm(fixtureRoot), ...collectUsfm(examplesRoot)]) {
  const rel = abs.replace(/\\/g, '/');
  const tail = rel.slice(rel.indexOf('/packages/') !== -1 ? rel.indexOf('/packages/') : 0);
  if (!byTail.has(tail)) byTail.set(tail, abs);
}
const files = [...byTail.values()].sort();

console.log(`Found ${files.length} USFM files.`);

// ── helpers ──────────────────────────────────────────────────────────────────
function parse(usfm) {
  const p = new USFMParser({ silentConsole: true });
  p.load(usfm).parse();
  return p;
}

function roundtrip(usfm) {
  const p = parse(usfm);
  const v = new USFMVisitor();
  p.visit(v);
  return v.getResult();
}

function toUsj(usfm) {
  return parse(usfm).toJSON();
}

function toUsx(usfm) {
  const p = parse(usfm);
  const v = new USXVisitor();
  p.visit(v);
  return v.getDocument();
}

/**
 * Minimal Myers-style unified diff: returns an array of hunk strings.
 * Each hunk is a compact block of changed lines with 2-line context.
 */
function unifiedDiff(aLines, bLines, aLabel = 'original', bLabel = 'roundtrip') {
  // LCS-based diff via simple DP (O(n*m) — fine for USFM file sizes)
  const n = aLines.length;
  const m = bLines.length;

  // build edit script: array of ops ['=','<','>'] per line in merged output
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = aLines[i] === bLines[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);

  const ops = []; // {op:'=', a?, b?}
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && aLines[i] === bLines[j]) {
      ops.push({ op: '=', line: aLines[i] }); i++; j++;
    } else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) {
      ops.push({ op: '+', line: bLines[j] }); j++;
    } else {
      ops.push({ op: '-', line: aLines[i] }); i++;
    }
  }

  // group into hunks with 2-line context
  const CONTEXT = 2;
  const changed = new Set(ops.map((o, idx) => o.op !== '=' ? idx : -1).filter(x => x >= 0));
  if (changed.size === 0) return [];

  const hunks = [];
  let k = 0;
  while (k < ops.length) {
    if (ops[k].op === '=') { k++; continue; }
    // start of a hunk
    const start = Math.max(0, k - CONTEXT);
    let end = k;
    while (end < ops.length) {
      if (ops[end].op !== '=') {
        end++;
      } else {
        const nextChange = ops.findIndex((o, idx) => idx > end && o.op !== '=');
        if (nextChange >= 0 && nextChange - end <= CONTEXT * 2) {
          end = nextChange + 1;
        } else {
          end = Math.min(ops.length, end + CONTEXT);
          break;
        }
      }
    }
    const hunkOps = ops.slice(start, end);
    const lines = hunkOps.map(o => {
      if (o.op === '=') return `  ${o.line}`;
      if (o.op === '+') return `+ ${o.line}`;
      return `- ${o.line}`;
    });
    hunks.push(`@@ -${start + 1} +${start + 1} @@\n${lines.join('\n')}`);
    k = end;
  }
  return hunks;
}

function pct(v) { return (v * 100).toFixed(1) + '%'; }
function status(ok) { return ok ? '✅ PASS' : '❌ FAIL'; }

// ── output dir ───────────────────────────────────────────────────────────────
const OUT_ROOT = path.join(REPO_ROOT, 'docs/oracle-diffs');
fs.rmSync(OUT_ROOT, { recursive: true, force: true });
fs.mkdirSync(OUT_ROOT, { recursive: true });

// ── summary rows ─────────────────────────────────────────────────────────────
const summaryRows = [];

// ── main loop ────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;

for (const absPath of files) {
  const relPath = path.relative(REPO_ROOT, absPath).replace(/\\/g, '/');
  process.stdout.write(`  ${relPath} … `);

  let usfmOrig, usfmRt, usj1, usj2, usx1, usx2, usjCmp, usxCmp, hunks;

  try {
    usfmOrig = fs.readFileSync(absPath, 'utf8');
    usfmRt   = roundtrip(usfmOrig);
    usj1     = toUsj(usfmOrig);
    usj2     = toUsj(usfmRt);
    usx1     = toUsx(usfmOrig);
    usx2     = toUsx(usfmRt);
    usjCmp   = compareUsjSimilarity(usj1, usj2, { minScore: 0 });
    usxCmp   = compareUsxSimilarity(usx1, usx2, { minScore: 0 });
    hunks    = unifiedDiff(usfmOrig.split('\n'), usfmRt.split('\n'));
  } catch (err) {
    console.log(`ERROR: ${err.message}`);
    failed++;
    summaryRows.push({ relPath, usjScore: 0, usxScore: 0, ok: false, error: err.message });
    continue;
  }

  const overallOk = usjCmp.score >= 0.84 && usxCmp.score >= 0.73;
  const icon = overallOk ? '✅' : '❌';
  console.log(`${icon} USJ=${pct(usjCmp.score)} USX=${pct(usxCmp.score)} diff-hunks=${hunks.length}`);
  if (overallOk) passed++; else failed++;

  // ── per-file markdown ──────────────────────────────────────────────────────
  const outFile = path.join(OUT_ROOT, relPath + '.diff.md');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });

  const md = [
    `# Oracle diff: \`${relPath}\``,
    '',
    `## Scores`,
    '',
    `| Metric | Value |`,
    `|---|---|`,
    `| **USJ text similarity** | ${pct(usjCmp.textSimilarity)} |`,
    `| **USJ structure similarity** | ${pct(usjCmp.structureSimilarity)} |`,
    `| **USJ combined score** | ${pct(usjCmp.score)} |`,
    `| **USX structure similarity** | ${pct(usxCmp.structureSimilarity)} |`,
    `| **USX attribute similarity** | ${pct(usxCmp.attributeSimilarity)} |`,
    `| **USX tag-histogram similarity** | ${pct(usxCmp.tagHistogramSimilarity)} |`,
    `| **USX combined score** | ${pct(usxCmp.score)} |`,
    `| **Overall** | ${status(overallOk)} |`,
    '',
  ];

  const allMessages = [...usjCmp.messages, ...usxCmp.messages];
  if (allMessages.length) {
    md.push('## Issues', '');
    for (const msg of allMessages) md.push(`- ${msg}`);
    md.push('');
  }

  if (hunks.length === 0) {
    md.push('## USFM diff', '', '_No differences — roundtrip is exact._', '');
  } else {
    md.push(
      `## USFM diff (${hunks.length} hunk${hunks.length === 1 ? '' : 's'})`,
      '',
      '```diff',
      `--- ${relPath} (original)`,
      `+++ ${relPath} (roundtripped)`,
      ...hunks,
      '```',
      '',
    );
  }

  fs.writeFileSync(outFile, md.join('\n'), 'utf8');

  summaryRows.push({
    relPath,
    usjText: usjCmp.textSimilarity,
    usjStruct: usjCmp.structureSimilarity,
    usjScore: usjCmp.score,
    usxScore: usxCmp.score,
    diffHunks: hunks.length,
    ok: overallOk,
  });
}

// ── SUMMARY.md ───────────────────────────────────────────────────────────────
const summaryMd = [
  '# Oracle diff summary',
  '',
  `Generated from **${files.length} USFM files**.  `,
  `**${passed} passed**, **${failed} failed** (USJ ≥ 84 % and USX ≥ 73 % combined score).`,
  '',
  '| File | USJ text | USJ struct | USJ score | USX score | Diff hunks | Status |',
  '|---|---|---|---|---|---|---|',
  ...summaryRows
    .sort((a, b) => (a.usjScore ?? 0) - (b.usjScore ?? 0)) // lowest scores first
    .map(r => {
      const link = r.error ? r.relPath : `[${r.relPath}](./${r.relPath}.diff.md)`;
      if (r.error) {
        return `| ${link} | — | — | — | — | — | ❌ ERROR: ${r.error} |`;
      }
      return `| ${link} | ${pct(r.usjText)} | ${pct(r.usjStruct)} | ${pct(r.usjScore)} | ${pct(r.usxScore)} | ${r.diffHunks} | ${r.ok ? '✅' : '❌'} |`;
    }),
  '',
];

fs.writeFileSync(path.join(OUT_ROOT, 'SUMMARY.md'), summaryMd.join('\n'), 'utf8');

console.log(`\nDone. ${passed} passed / ${failed} failed.`);
console.log(`Output → docs/oracle-diffs/`);

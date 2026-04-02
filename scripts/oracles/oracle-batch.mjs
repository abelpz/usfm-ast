#!/usr/bin/env node
/**
 * Run oracle compare + report over several USFM fixtures (richer than `basic.usfm`).
 *
 * Each fixture gets:
 *   oracle-out/batch/<slug>/ORACLE_STATUS.json, ORACLE_REPORT.md, ORACLE_METRICS.json
 *
 * Usage:
 *   node scripts/oracles/oracle-batch.mjs [--batch-root ./oracle-out/batch] [--strict]
 *   node scripts/oracles/oracle-batch.mjs [--examples]       # curated 12 under examples/usfm-markers
 *   node scripts/oracles/oracle-batch.mjs [--examples-all]   # every **/example.usfm under examples/usfm-markers
 *   node scripts/oracles/oracle-batch.mjs path/to/a.usfm path/to/b.usfm
 *
 * With no paths: DEFAULT_FIXTURES, or --examples (curated 12), or --examples-all (full marker tree).
 *
 * Requires: built parser + adapters; Python + usfmtc for full usfmtc columns (set PYTHON).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

/** Curated: parser + adapter fixtures with notes, tables, milestones, longer narrative, etc. */
const DEFAULT_FIXTURES = [
  'packages/usfm-parser/tests/fixtures/usfm/basic.usfm',
  'packages/usfm-parser/tests/fixtures/usfm/medium.usfm',
  'packages/usfm-parser/tests/fixtures/usfm/complex.usfm',
  'packages/usfm-parser/tests/fixtures/usfm/tit.bsb.usfm',
  'packages/usfm-parser/tests/fixtures/usfm/list.usfm',
  'packages/usfm-parser/tests/fixtures/structure/milestones.usfm',
  'packages/usfm-adapters/tests/fixtures/usfm/rev.lsg.usfm',
  'packages/usfm-adapters/tests/fixtures/usfm/alignment.usfm',
  'packages/usfm-adapters/tests/fixtures/usfm/table.usfm',
  'packages/usfm-adapters/tests/fixtures/usfm/jmp.usfm',
];

/** Every `examples/usfm-markers/**/example.usfm` (same surface as fixture-matrix examples). */
function collectAllExampleUsfmPaths() {
  const root = join(repoRoot, 'examples/usfm-markers');
  const out = [];
  if (!existsSync(root)) return out;
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (name === 'example.usfm') out.push(relative(repoRoot, p).replace(/\\/g, '/'));
    }
  };
  walk(root);
  return out.sort();
}

/** Small smoke set for fast oracle runs (diverse markers). */
const CURATED_EXAMPLE_FIXTURES = [
  'examples/usfm-markers/note-f/f-example-1/example.usfm',
  'examples/usfm-markers/note-x/x-example-2/example.usfm',
  'examples/usfm-markers/fig-fig/fig-example-2/example.usfm',
  'examples/usfm-markers/periph-periph/periph-example-1/example.usfm',
  'examples/usfm-markers/char-ref/ref-example-1/example.usfm',
  'examples/usfm-markers/char-optbreak/optbreak-example-1/example.usfm',
  'examples/usfm-markers/char-th/th-example-1/example.usfm',
  'examples/usfm-markers/sbar-esb/esb-example-1/example.usfm',
  'examples/usfm-markers/ms-ts/ts-example-2/example.usfm',
  'examples/usfm-markers/para-p/p-example-1/example.usfm',
  'examples/usfm-markers/doc-id/id-example-1/example.usfm',
  'examples/usfm-markers/cv-c/c-example-1/example.usfm',
];

function slugFromRel(rel) {
  return rel.replace(/[\\/]/g, '__').replace(/[^\w.-]+/g, '_');
}

function parseArgs() {
  const args = process.argv.slice(2);
  let batchRoot = join(repoRoot, 'oracle-out/batch');
  let strict = false;
  let useExamples = false;
  let useExamplesAll = false;
  const paths = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--batch-root' && args[i + 1]) {
      batchRoot = resolve(args[++i]);
    } else if (args[i] === '--strict') {
      strict = true;
    } else if (args[i] === '--examples-all') {
      useExamplesAll = true;
    } else if (args[i] === '--examples') {
      useExamples = true;
    } else {
      paths.push(args[i]);
    }
  }
  return { batchRoot, strict, useExamples, useExamplesAll, paths: paths.length ? paths : null };
}

function mdTable(headers, rows) {
  const esc = (s) => String(s).replace(/\|/g, '\\|');
  const line = (cells) => `| ${cells.map(esc).join(' | ')} |`;
  const h = line(headers);
  const sep = line(headers.map(() => '---'));
  const body = rows.length ? rows.map((r) => line(r)).join('\n') : '';
  return body ? `${h}\n${sep}\n${body}` : `${h}\n${sep}`;
}

const compareScript = join(__dirname, 'compare.mjs');
const reportScript = join(__dirname, 'generate-report.mjs');

const { batchRoot, strict, useExamples, useExamplesAll, paths: cliPaths } = parseArgs();
const relList = cliPaths
  ? cliPaths.map((p) => relative(repoRoot, resolve(p)).replace(/\\/g, '/'))
  : useExamplesAll
    ? collectAllExampleUsfmPaths()
    : useExamples
      ? CURATED_EXAMPLE_FIXTURES
      : DEFAULT_FIXTURES;

mkdirSync(batchRoot, { recursive: true });

const rows = [];
let anyUsjFail = false;
let anyUsxFmtcFail = false;

for (const rel of relList) {
  const absUsfm = resolve(repoRoot, rel);
  if (!existsSync(absUsfm)) {
    console.warn(`[skip] not found: ${rel}`);
    rows.push([
      rel,
      '—',
      'skip',
      '—',
      '—',
      '—',
      '—',
      'file missing',
    ]);
    continue;
  }

  const slug = slugFromRel(rel);
  const outDir = join(batchRoot, slug);
  mkdirSync(outDir, { recursive: true });

  const c = spawnSync(process.execPath, [compareScript, absUsfm, '--out', outDir], {
    cwd: repoRoot,
    encoding: 'utf-8',
  });
  if (c.status !== 0) {
    console.warn(`[compare] failed for ${rel}:`, c.stderr?.slice(0, 500));
  }

  const r = spawnSync(
    process.execPath,
    [reportScript, absUsfm, '--out', outDir, '--no-refresh'],
    { cwd: repoRoot, encoding: 'utf-8' }
  );
  if (r.status !== 0) {
    console.warn(`[report] failed for ${rel}:`, r.stderr?.slice(0, 500));
  }

  const metricsPath = join(outDir, 'ORACLE_METRICS.json');
  let usjOk = '—';
  let usjScore = '—';
  let usxOk = '—';
  let usxScore = '—';
  let fmtc = '—';
  let note = '';

  if (existsSync(metricsPath)) {
    const m = JSON.parse(readFileSync(metricsPath, 'utf8'));
    const fmtcOk = m.status?.usfmtc?.ok === true;
    fmtc = fmtcOk ? 'yes' : 'no';
    if (m.usjVsFmtc) {
      usjOk = m.usjVsFmtc.ok ? 'yes' : 'no';
      usjScore = m.usjVsFmtc.score.toFixed(3);
      if (!m.usjVsFmtc.ok) anyUsjFail = true;
    } else if (!fmtcOk) {
      note = 'no usfmtc';
    }

    if (m.usxVsFmtc) {
      usxOk = m.usxVsFmtc.ok ? 'yes' : 'no';
      usxScore = m.usxVsFmtc.score.toFixed(3);
      if (!m.usxVsFmtc.ok) anyUsxFmtcFail = true;
    } else if (!fmtcOk) {
      note = note || 'no usfmtc usx';
    }

    if (m.usfm3UsjPlaceholder) {
      note = note ? `${note}; usfm3 USJ placeholder` : 'usfm3 USJ placeholder';
    }
  } else {
    note = 'no metrics file';
  }

  rows.push([rel, slug, fmtc, usjScore, usjOk, usxScore, usxOk, note]);
  console.log(`[done] ${rel} → ${relative(repoRoot, outDir)}`);
}

const generatedAt = new Date().toISOString();
const fixtureMode = cliPaths
  ? 'explicit paths'
  : useExamplesAll
    ? '`--examples-all` (all `examples/usfm-markers/**/example.usfm`)'
    : useExamples
      ? '`--examples` (curated 12)'
      : 'default (packages fixtures)';

const summaryLines = [
  '# Oracle batch report',
  '',
  `- **Generated:** ${generatedAt}`,
  `- **Batch root:** \`${batchRoot.replace(/\\/g, '/')}\``,
  `- **Fixture mode:** ${fixtureMode}`,
  `- **Fixtures:** ${rows.length}`,
  '',
  'Per-fixture outputs: `ORACLE_REPORT.md`, `ORACLE_METRICS.json`, and compare artifacts in each subdirectory.',
  '',
  mdTable(
    [
      'Fixture (repo-relative)',
      'Slug dir',
      'usfmtc ran',
      'USJ score',
      'USJ OK',
      'USX vs usfmtc score',
      'USX OK',
      'Notes',
    ],
    rows
  ),
  '',
  '## Legend',
  '',
  '- **USJ / USX scores** use `compareUsjSimilarity` / `compareUsxSimilarity` (see `packages/usfm-parser/src/oracle/`).',
  '- **usfmtc ran** = `ORACLE_STATUS.usfmtc.ok`. If **no**, set `PYTHON` and install `usfmtc`, then re-run.',
  '- Some richer fixtures may **fail USX OK** vs usfmtc while still scoring well on USJ; tune thresholds or treat as known gaps.',
  '',
  '## Regenerate',
  '',
  '```bash',
  'bun run oracles:batch',
  'bun run oracles:batch-examples        # curated 12',
  'bun run oracles:batch-examples-all    # full examples/usfm-markers tree',
  'bun run oracles:batch -- --strict   # exit 1 if any USJ/USX vs usfmtc fails',
  '# optional extra files:',
  'node scripts/oracles/oracle-batch.mjs packages/usfm-parser/tests/fixtures/usfm/complex.usfm',
  '```',
  '',
];

const summaryPath = join(batchRoot, 'BATCH_REPORT.md');
writeFileSync(summaryPath, summaryLines.join('\n'), 'utf8');
console.log(`\nWrote ${summaryPath}`);

process.exit(strict && (anyUsjFail || anyUsxFmtcFail) ? 1 : 0);

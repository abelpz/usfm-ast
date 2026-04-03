#!/usr/bin/env node
/**
 * Print a compact table of USX vs npm usfm3 (and USJ vs usfmtc when present) from a batch run.
 *
 * Usage:
 *   node scripts/oracles/summarize-batch-metrics.mjs [oracle-out/batch]
 *   node scripts/oracles/summarize-batch-metrics.mjs oracle-out/batch-examples
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const batchRoot = resolve(repoRoot, process.argv[2] || 'oracle-out/batch');

if (!existsSync(batchRoot)) {
  console.error(`Not found: ${batchRoot}`);
  process.exit(1);
}

const rows = [];
for (const name of readdirSync(batchRoot)) {
  const sub = join(batchRoot, name);
  if (!statSync(sub).isDirectory()) continue;
  const p = join(sub, 'ORACLE_METRICS.json');
  if (!existsSync(p)) continue;
  const m = JSON.parse(readFileSync(p, 'utf8'));
  const input = m.input || name;
  const fmtc = m.status?.usfmtc?.ok === true ? 'yes' : 'no';
  const u3 = m.usxVsUsfm3;
  const u3s = u3 ? u3.score.toFixed(3) : '—';
  const u3ok = u3 ? (u3.ok ? 'yes' : 'no') : '—';
  const uj = m.usjVsFmtc;
  const ujs = uj ? uj.score.toFixed(3) : '—';
  const ujok = uj ? (uj.ok ? 'yes' : 'no') : '—';
  rows.push({ input, fmtc, ujs, ujok, u3s, u3ok });
}

rows.sort((a, b) => a.input.localeCompare(b.input));

console.log(`Batch: ${batchRoot.replace(/\\/g, '/')}\n`);
console.log('input\tusfmtc\tUSJ vs fmtc\tUSJ OK\tUSX vs usfm3\tUSX OK');
for (const r of rows) {
  console.log(
    `${r.input.split(/[/\\]/).slice(-3).join('/')}\t${r.fmtc}\t${r.ujs}\t${r.ujok}\t${r.u3s}\t${r.u3ok}`
  );
}

#!/usr/bin/env node
/**
 * Run scripts/roundtrip-diff.mjs on every *.usfm under packages/usfm-parser/tests/fixtures/usfm/
 * and print a one-line summary table. Requires built parser + adapters.
 */
import { execSync } from 'node:child_process';
import { readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const fixtureDir = join(repoRoot, 'packages', 'usfm-parser', 'tests', 'fixtures', 'usfm');
const outRoot = join(repoRoot, 'roundtrip-out', 'fixtures-usfm-batch');

const files = readdirSync(fixtureDir)
  .filter((f) => f.endsWith('.usfm'))
  .sort();

mkdirSync(outRoot, { recursive: true });

console.log(`${fixtureDir.replace(/\\/g, '/')} (${files.length} files)\n`);
console.log('file'.padEnd(22) + '  USFM  USJ   USX');
console.log('-'.repeat(46));

for (const f of files) {
  const abs = join(fixtureDir, f);
  const slug = basename(f, '.usfm');
  const out = join(outRoot, slug);
  const cmd = `node "${join(repoRoot, 'scripts', 'roundtrip-diff.mjs')}" "${abs}" --out "${out}"`;
  let log = '';
  try {
    log = execSync(cmd, {
      encoding: 'utf8',
      cwd: repoRoot,
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
  } catch (e) {
    console.log(`${f.padEnd(22)}  ERROR`);
    console.error(e.stderr || e.message);
    continue;
  }
  const usfm = /USFM text identical: (true|false)/.exec(log)?.[1] ?? '?';
  const usj = /USJ structure identical: (true|false)/.exec(log)?.[1] ?? '?';
  const usx = /USX text identical \(default USXVisitor\): (true|false)/.exec(log)?.[1] ?? '?';
  console.log(`${f.padEnd(22)}  ${usfm.padEnd(5)} ${usj.padEnd(5)} ${usx}`);
}

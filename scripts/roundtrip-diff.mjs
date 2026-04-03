#!/usr/bin/env node
/**
 * Write unified diffs for round-trip conversions so you can see what changes
 * between "original" and "after one loop" for each serialized format.
 *
 * USFM input:
 *   1) USFM — original file vs USFM after parse → USFMVisitor
 *   2) USJ — parser.toJSON() before vs after re-parse of that round-tripped USFM
 *   3) USX — USXVisitor output before vs after (same USFM round-trip as (1))
 *
 * USJ file input (--usj):
 *   USJ JSON → convertUSJDocumentToUSFM → parse → toJSON (diff JSON)
 *
 * Requires: `bun run build` (packages/usfm-parser/dist + packages/usfm-adapters/dist).
 *
 * Usage:
 *   node scripts/roundtrip-diff.mjs path/to/file.usfm [--out ./roundtrip-out]
 *   node scripts/roundtrip-diff.mjs --usj path/to/file.usj [--out ./roundtrip-out]
 *   node scripts/roundtrip-diff.mjs path/to/file.usfm --usx-minimal [--out ./dir]
 *     (second USX diff using verseMilestones: minimal + inlineBareSectionMilestones, for usfmtc-style parity)
 */
import { createTwoFilesPatch } from 'diff';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const { USFMParser } = require(resolve(repoRoot, 'packages/usfm-parser/dist/index.js'));
const {
  USFMVisitor,
  USXVisitor,
  convertUSJDocumentToUSFM,
} = require(resolve(repoRoot, 'packages/usfm-adapters/dist/index.js'));

function normalizeNewlines(s) {
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function prettyJson(obj) {
  return JSON.stringify(obj, null, 2) + '\n';
}

function roundtripUsfm(usfm) {
  const parser = new USFMParser();
  parser.load(usfm).parse();
  const v = new USFMVisitor();
  parser.visit(v);
  return v.getResult();
}

function usxFromUsfm(usfm, options) {
  const parser = new USFMParser();
  parser.load(usfm).parse();
  const v = new USXVisitor(options || {});
  parser.visit(v);
  return v.getDocument();
}

function parseArgs(argv) {
  const args = argv.slice(2);
  let usjPath = null;
  let outDir = join(repoRoot, 'roundtrip-out');
  let usfmPath = null;
  let usxMinimal = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--usj' && args[i + 1]) {
      usjPath = resolve(args[++i]);
      continue;
    }
    if (a === '--out' && args[i + 1]) {
      outDir = resolve(args[++i]);
      continue;
    }
    if (a === '--usx-minimal') {
      usxMinimal = true;
      continue;
    }
    if (a.startsWith('-')) continue;
    usfmPath = resolve(a);
  }
  return { usfmPath, usjPath, outDir, usxMinimal };
}

function writePatch(outDir, name, oldPathLabel, newPathLabel, oldStr, newStr) {
  const patch = createTwoFilesPatch(oldPathLabel, newPathLabel, oldStr, newStr, '', '', { context: 3 });
  const dest = join(outDir, name);
  writeFileSync(dest, patch, 'utf8');
  return dest;
}

function runFromUsj(usjPath, outDir) {
  mkdirSync(outDir, { recursive: true });
  const raw = readFileSync(usjPath, 'utf8');
  const doc = JSON.parse(raw);
  const usfmOut = normalizeNewlines(convertUSJDocumentToUSFM(doc));
  const p = new USFMParser();
  p.load(usfmOut).parse();
  const finalUsj = p.toJSON();

  const patchPath = writePatch(
    outDir,
    'usj-file-roundtrip.diff',
    basename(usjPath),
    'after-usj-to-usfm-to-parse.usj',
    prettyJson(doc),
    prettyJson(finalUsj)
  );

  const summary = [
    `Mode: --usj (USJ → USFM → parse → USJ)`,
    `Input: ${usjPath}`,
    `USJ JSON identical: ${JSON.stringify(doc) === JSON.stringify(finalUsj)}`,
    '',
    `Wrote: ${patchPath}`,
  ].join('\n');
  writeFileSync(join(outDir, 'SUMMARY.txt'), summary + '\n', 'utf8');
  console.log(summary);
}

function runFromUsfm(usfmPath, outDir, usxMinimal) {
  mkdirSync(outDir, { recursive: true });
  const originalUsfm = normalizeNewlines(readFileSync(usfmPath, 'utf8'));
  const rtUsfm = normalizeNewlines(roundtripUsfm(originalUsfm));

  const files = [];

  files.push(
    writePatch(
      outDir,
      'usfm-roundtrip.diff',
      basename(usfmPath),
      'after-parse-USFMVisitor.usfm',
      originalUsfm,
      rtUsfm
    )
  );

  const p1 = new USFMParser();
  p1.load(originalUsfm).parse();
  const usj1 = p1.toJSON();

  const p2 = new USFMParser();
  p2.load(rtUsfm).parse();
  const usj2 = p2.toJSON();

  files.push(
    writePatch(
      outDir,
      'usj-roundtrip.diff',
      'toJSON-before.usj',
      'toJSON-after-usfm-roundtrip.usj',
      prettyJson(usj1),
      prettyJson(usj2)
    )
  );

  const usx1 = normalizeNewlines(usxFromUsfm(originalUsfm, {}));
  const usx2 = normalizeNewlines(usxFromUsfm(rtUsfm, {}));
  files.push(
    writePatch(outDir, 'usx-roundtrip.diff', 'USX-before.usx', 'USX-after-usfm-roundtrip.usx', usx1, usx2)
  );

  const lines = [
    `Mode: USFM input`,
    `Input: ${usfmPath}`,
    `USFM text identical: ${originalUsfm === rtUsfm}`,
    `USJ structure identical: ${JSON.stringify(usj1) === JSON.stringify(usj2)}`,
    `USX text identical (default USXVisitor): ${usx1 === usx2}`,
    '',
    'Artifacts:',
    ...files.map((f) => `  ${f}`),
  ];

  if (usxMinimal) {
    const m = { verseMilestones: 'minimal', inlineBareSectionMilestones: true };
    const u1 = normalizeNewlines(usxFromUsfm(originalUsfm, m));
    const u2 = normalizeNewlines(usxFromUsfm(rtUsfm, m));
    const p = writePatch(
      outDir,
      'usx-roundtrip-minimal-milestones.diff',
      'USX-minimal-before.usx',
      'USX-minimal-after-usfm-roundtrip.usx',
      u1,
      u2
    );
    files.push(p);
    lines.push(`USX minimal-milestones identical: ${u1 === u2}`);
    lines.push(`  ${p}`);
  }

  lines.push('');
  const summary = lines.join('\n');
  writeFileSync(join(outDir, 'SUMMARY.txt'), summary + '\n', 'utf8');
  console.log(summary);
}

const { usfmPath, usjPath, outDir, usxMinimal } = parseArgs(process.argv);

if (usjPath) {
  if (!existsSync(usjPath)) {
    console.error(`Not found: ${usjPath}`);
    process.exit(2);
  }
  runFromUsj(usjPath, outDir);
  process.exit(0);
}

if (!usfmPath || !existsSync(usfmPath)) {
  console.error(`roundtrip-diff — unified diffs for format round-trips

Requires: bun run build (parser + adapters)

Usage:
  node scripts/roundtrip-diff.mjs <file.usfm> [--out <dir>] [--usx-minimal]
  node scripts/roundtrip-diff.mjs --usj <file.usj> [--out <dir>]

USFM mode writes:
  usfm-roundtrip.diff   original USFM vs after parse → USFMVisitor
  usj-roundtrip.diff    toJSON before vs after re-parse of round-tripped USFM
  usx-roundtrip.diff    USX (default visitor) before vs after same USFM round-trip
  --usx-minimal         also usx-roundtrip-minimal-milestones.diff (usfmtc-style USX options)

USJ mode writes:
  usj-file-roundtrip.diff   original JSON vs parse(convertUSJDocumentToUSFM(usj))

Default output directory: ./roundtrip-out/
`);
  process.exit(2);
}

runFromUsfm(usfmPath, outDir, usxMinimal);

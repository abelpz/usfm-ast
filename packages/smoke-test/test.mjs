/**
 * Smoke-test: verifies the core API surface of each published package.
 *
 * In a workspace context the packages are resolved via the monorepo symlinks.
 * In a post-publish context, run after `npm install` in this directory.
 *
 * Run:
 *   node test.mjs
 *
 * To skip gracefully in CI (workspace mode where packages aren't published yet),
 * set SMOKE_TEST_SKIP=1.
 */

if (process.env.SMOKE_TEST_SKIP === '1') {
  console.log('smoke-test: SMOKE_TEST_SKIP=1 — skipping (workspace / pre-publish mode)');
  process.exit(0);
}

let pass = 0;
let fail = 0;

function ok(label, fn) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result
        .then(() => { console.log(`  ✓ ${label}`); pass++; })
        .catch(err => { console.error(`  ✗ ${label}: ${err.message}`); fail++; });
    }
    console.log(`  ✓ ${label}`);
    pass++;
  } catch (err) {
    console.error(`  ✗ ${label}: ${err.message}`);
    fail++;
  }
}

// ── @usfm-tools/parser ────────────────────────────────────────────────────────
console.log('\n@usfm-tools/parser');
const { UsfmParser } = await import('@usfm-tools/parser');
const SAMPLE_USFM = `\\id GEN\n\\h Genesis\n\\c 1\n\\v 1 In the beginning God created the heavens and the earth.\n`;
ok('parses USFM without throwing', () => {
  const parser = new UsfmParser();
  const result = parser.parse(SAMPLE_USFM);
  if (!result) throw new Error('parse returned falsy');
});

// ── @usfm-tools/types ────────────────────────────────────────────────────────
console.log('\n@usfm-tools/types');
const types = await import('@usfm-tools/types');
ok('exports are defined', () => {
  if (!types) throw new Error('module is undefined');
});

// ── @usfm-tools/formatter ────────────────────────────────────────────────────
console.log('\n@usfm-tools/formatter');
const { UsfmFormatter } = await import('@usfm-tools/formatter');
ok('formatter class exists', () => {
  if (typeof UsfmFormatter !== 'function') throw new Error('UsfmFormatter not a constructor');
});

// ── @usfm-tools/adapters ─────────────────────────────────────────────────────
console.log('\n@usfm-tools/adapters');
const adapters = await import('@usfm-tools/adapters');
ok('exports are defined', () => {
  if (!adapters) throw new Error('module is undefined');
});

// ── @usfm-tools/usj-core ─────────────────────────────────────────────────────
console.log('\n@usfm-tools/usj-core');
const usjCore = await import('@usfm-tools/usj-core');
ok('exports are defined', () => {
  if (!usjCore) throw new Error('module is undefined');
});

// ── @usfm-tools/editor-core ──────────────────────────────────────────────────
console.log('\n@usfm-tools/editor-core');
const editorCore = await import('@usfm-tools/editor-core');
ok('exports are defined', () => {
  if (!editorCore) throw new Error('module is undefined');
});

// ── @usfm-tools/editor-themes ────────────────────────────────────────────────
console.log('\n@usfm-tools/editor-themes');
const themes = await import('@usfm-tools/editor-themes');
ok('exports are defined', () => {
  if (!themes) throw new Error('module is undefined');
});

// ── @usfm-tools/checking ─────────────────────────────────────────────────────
console.log('\n@usfm-tools/checking');
const checking = await import('@usfm-tools/checking');
ok('exports are defined', () => {
  if (!checking) throw new Error('module is undefined');
});

// ── @usfm-tools/ptxprint-driver ──────────────────────────────────────────────
console.log('\n@usfm-tools/ptxprint-driver');
const { usfmToPdf, PtxprintNotFoundError, PtxprintExitError } = await import('@usfm-tools/ptxprint-driver');
ok('usfmToPdf is a function', () => {
  if (typeof usfmToPdf !== 'function') throw new Error('not a function');
});
ok('PtxprintNotFoundError is exported', () => {
  if (!PtxprintNotFoundError) throw new Error('not exported');
});
ok('PtxprintExitError is exported', () => {
  if (!PtxprintExitError) throw new Error('not exported');
});

// ── @usj-tools/core ──────────────────────────────────────────────────────────
console.log('\n@usj-tools/core');
const usjToolsCore = await import('@usj-tools/core');
ok('exports are defined', () => {
  if (!usjToolsCore) throw new Error('module is undefined');
});

// ── @usj-tools/adapters ──────────────────────────────────────────────────────
console.log('\n@usj-tools/adapters');
const usjAdapters = await import('@usj-tools/adapters');
ok('exports are defined', () => {
  if (!usjAdapters) throw new Error('module is undefined');
});

// ── Summary ───────────────────────────────────────────────────────────────────
// Wait for any async ok() checks
await new Promise(r => setTimeout(r, 100));
console.log(`\n${pass + fail} checks — ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

#!/usr/bin/env node
/**
 * publish-all.mjs
 *
 * Publishes all non-private packages in the monorepo in topological order.
 * Temporarily replaces `workspace:*` deps with the real semver version before
 * calling `npm publish --access public`, then restores the original file.
 *
 * Usage:
 *   node scripts/publish-all.mjs [--dry-run]
 */
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');
const DRY_RUN = process.argv.includes('--dry-run');
// Accept OTP via --otp=CODE arg or NPM_OTP env var
const otpArg = process.argv.find(a => a.startsWith('--otp='));
const OTP = otpArg ? otpArg.slice(6) : process.env.NPM_OTP;

// ── Ordered publish list (topological – dependencies first) ──────────────────
// ptxprint-driver@0.2.1 is already published; it's in the map so workspace:*
// references to it resolve correctly for ptxprint-cli.
const PUBLISH_ORDER = [
  // Level 0 – no internal deps
  'packages/shared-types',          // @usfm-tools/types
  'packages/usfm-door43-rest',      // @usfm-tools/door43-rest
  'packages/usfm-editor-themes',    // @usfm-tools/editor-themes
  'packages/usj-core',              // @usj-tools/core
  'packages/usj-adapters',          // @usj-tools/adapters
  'packages/usj-formatter',         // @usj-tools/formatter

  // Level 1 – depend on level 0
  'packages/usfm-parser',           // @usfm-tools/parser
  'packages/usfm-usj-core',         // @usfm-tools/usj-core  (→types)
  'packages/usj-validator',         // @usj-tools/validator  (→usj/core)
  'packages/usj-cli',               // @usj-tools/cli        (→usj/core)

  // Level 2 – depend on parser / types
  'packages/usfm-formatter',        // @usfm-tools/formatter (→parser,types)
  'packages/usfm-adapters',         // @usfm-tools/adapters  (→parser,types,formatter)
  'packages/usfm-cli',              // @usfm-tools/cli       (→parser)
  'packages/usfm-validator',        // @usfm-tools/validator (→parser)
  'packages/usfm-editor-checking',  // @usfm-tools/checking  (→types)
  'packages/usfm-editor-project-formats', // @usfm-tools/project-formats (→types)

  // Level 3 – depend on adapters / editor-core
  'packages/platform-adapters',     // @usfm-tools/platform-adapters (→types)
  'packages/usfm-editor-core',      // @usfm-tools/editor-core
  'packages/usfm-readonly-react',   // @usfm-tools/usfm-readonly-react

  // Level 4
  'packages/usfm-editor-adapters',  // @usfm-tools/editor-adapters
  'packages/usfm-editor',           // @usfm-tools/editor
  'packages/usfm-editor-ui',        // @usfm-tools/editor-ui

  // ptxprint-cli last (depends on already-published ptxprint-driver)
  'packages/ptxprint-cli',          // @usfm-tools/ptxprint-cli
];

// ── Build name→version map for all workspace packages ───────────────────────
function buildVersionMap() {
  const map = new Map();
  // Include already-published driver
  map.set('@usfm-tools/ptxprint-driver', '0.2.1');

  for (const rel of PUBLISH_ORDER) {
    const pkgPath = join(ROOT, rel, 'package.json');
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      if (pkg.name && pkg.version) map.set(pkg.name, pkg.version);
    } catch { /* skip */ }
  }
  return map;
}

// ── Replace workspace:* with real version, publish, revert ──────────────────
function publishPkg(relPath, versionMap) {
  const pkgPath = join(ROOT, relPath, 'package.json');
  const original = readFileSync(pkgPath, 'utf8');
  const pkg = JSON.parse(original);

  if (pkg.private) {
    console.log(`  SKIP (private): ${pkg.name}`);
    return;
  }

  // Replace workspace:* in all dep fields
  let modified = false;
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    if (!pkg[field]) continue;
    for (const [dep, ver] of Object.entries(pkg[field])) {
      if (ver === 'workspace:*') {
        const resolved = versionMap.get(dep);
        if (!resolved) throw new Error(`No version found for workspace dep "${dep}" in ${pkg.name}`);
        pkg[field][dep] = `^${resolved}`;
        modified = true;
      }
    }
  }

  if (modified) writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

  const flag = DRY_RUN ? ' --dry-run' : '';
  try {
    console.log(`\n→ Publishing ${pkg.name}@${pkg.version}${DRY_RUN ? ' (dry-run)' : ''}…`);
    const otpFlag = OTP ? ` --otp=${OTP}` : '';
    const out = execSync(
      `npm publish --access public${flag}${otpFlag}`,
      { cwd: join(ROOT, relPath), encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] },
    );
    console.log(out.trim().split('\n').filter(l => l.startsWith('npm notice')).slice(-4).join('\n'));
    console.log(`  ✓ ${pkg.name}@${pkg.version}`);
  } catch (err) {
    const msg = (err.stderr || err.stdout || err.message || '').toString();
    // Extract just the npm error lines (they follow all the npm notice lines)
    const errorLines = msg.split('\n').filter(l => l.startsWith('npm error'));
    const summary = errorLines.join('\n') || msg.slice(-300);
    if (msg.includes('previously published') || msg.includes('cannot publish over')) {
      console.log(`  ~ Already published: ${pkg.name}@${pkg.version}`);
    } else {
      console.error(`  ✗ FAILED: ${pkg.name}@${pkg.version}`);
      console.error(summary);
    }
  } finally {
    if (modified) writeFileSync(pkgPath, original, 'utf8'); // always revert
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
const versionMap = buildVersionMap();
const PARALLEL = process.argv.includes('--parallel');

if (PARALLEL) {
  // Publish all packages simultaneously so a single OTP covers the full run.
  // (npm doesn't verify that dependencies exist at publish time, only install time.)
  console.log(`Publishing ${PUBLISH_ORDER.length} packages in PARALLEL${DRY_RUN ? ' (DRY RUN)' : ''}…\n`);
  const results = await Promise.allSettled(
    PUBLISH_ORDER.map(rel => Promise.resolve(publishPkg(rel, versionMap)))
  );
  const failed = results.filter(r => r.status === 'rejected').length;
  console.log(`\nDone. ${PUBLISH_ORDER.length - failed} succeeded, ${failed} failed.`);
} else {
  console.log(`Publishing ${PUBLISH_ORDER.length} packages${DRY_RUN ? ' (DRY RUN)' : ''}…\n`);
  for (const rel of PUBLISH_ORDER) {
    publishPkg(rel, versionMap);
  }
  console.log('\nDone.');
}

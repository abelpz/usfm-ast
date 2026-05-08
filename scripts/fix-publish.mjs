#!/usr/bin/env node
/**
 * fix-publish.mjs
 *
 * For each package that was published with `workspace:*` deps, this script:
 *  1. Bumps the patch version (0.1.0 → 0.1.1, 0.2.1 → 0.2.2, …)
 *  2. Replaces all `workspace:*` dep values with `^<currentVersion>`
 *  3. Publishes with `npm publish --access public`
 *  4. Reverts package.json to the original content
 *
 * Usage:
 *   node scripts/fix-publish.mjs [--dry-run]
 */
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');
const DRY_RUN = process.argv.includes('--dry-run');

// ── Packages that need fixing (workspace:* found in their published deps) ────
// Listed in topological order so independent ones publish first.
const BAD_PACKAGES = [
  'packages/usfm-parser',           // @usfm-tools/parser
  'packages/usfm-usj-core',         // @usfm-tools/usj-core
  'packages/usfm-formatter',        // @usfm-tools/formatter
  'packages/usfm-adapters',         // @usfm-tools/adapters
  'packages/usfm-cli',              // @usfm-tools/cli
  'packages/usfm-validator',        // @usfm-tools/validator
  'packages/usfm-editor-checking',  // @usfm-tools/checking
  'packages/usfm-editor-project-formats', // @usfm-tools/project-formats
  'packages/platform-adapters',     // @usfm-tools/platform-adapters
  'packages/usfm-editor-core',      // @usfm-tools/editor-core
  'packages/usfm-readonly-react',   // @usfm-tools/usfm-readonly-react
  'packages/usfm-editor-adapters',  // @usfm-tools/editor-adapters
  'packages/usfm-editor',           // @usfm-tools/editor
  'packages/usfm-editor-ui',        // @usfm-tools/editor-ui
  'packages/usj-validator',         // @usj-tools/validator
  'packages/usj-cli',               // @usj-tools/cli
  'packages/ptxprint-driver',       // @usfm-tools/ptxprint-driver
];

// ── Build name → current-version map (all workspace packages) ────────────────
function buildVersionMap() {
  const allPkgs = [
    'packages/shared-types', 'packages/usfm-door43-rest', 'packages/usfm-editor-themes',
    'packages/usj-core', 'packages/usj-adapters', 'packages/usj-formatter',
    ...BAD_PACKAGES,
  ];
  const map = new Map();
  for (const rel of allPkgs) {
    try {
      const pkg = JSON.parse(readFileSync(join(ROOT, rel, 'package.json'), 'utf8'));
      if (pkg.name && pkg.version) map.set(pkg.name, pkg.version);
    } catch { /* skip */ }
  }
  return map;
}

function bumpPatch(version) {
  const parts = version.split('.');
  parts[parts.length - 1] = String(Number(parts[parts.length - 1]) + 1);
  return parts.join('.');
}

function fixAndPublish(relPath, versionMap) {
  const pkgPath = join(ROOT, relPath, 'package.json');
  const original = readFileSync(pkgPath, 'utf8');
  const pkg = JSON.parse(original);

  if (pkg.private) { console.log(`  SKIP (private): ${pkg.name}`); return; }

  const bumpedVersion = bumpPatch(pkg.version);
  pkg.version = bumpedVersion;

  // Replace workspace:* with ^<resolvedVersion> in all dep fields
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    if (!pkg[field]) continue;
    for (const [dep, ver] of Object.entries(pkg[field])) {
      if (ver === 'workspace:*') {
        const resolved = versionMap.get(dep);
        if (!resolved) throw new Error(`No version in map for "${dep}" (in ${pkg.name})`);
        pkg[field][dep] = `^${resolved}`;
      }
    }
  }

  const patched = JSON.stringify(pkg, null, 2) + '\n';

  if (DRY_RUN) {
    console.log(`  [dry-run] Would publish ${pkg.name}@${bumpedVersion}`);
    console.log('  Patched deps:', JSON.stringify(pkg.dependencies ?? {}, null, 2).split('\n').slice(0,8).join('\n'));
    return;
  }

  writeFileSync(pkgPath, patched, 'utf8');
  try {
    console.log(`\n→ Publishing ${pkg.name}@${bumpedVersion}…`);
    const out = execSync(
      'npm publish --access public',
      { cwd: join(ROOT, relPath), encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] },
    );
    const successLine = out.split('\n').find(l => l.startsWith('+') || l.includes('published'));
    console.log(`  ✓ ${pkg.name}@${bumpedVersion}${successLine ? `  (${successLine.trim()})` : ''}`);
  } catch (err) {
    const msg = ((err.stderr || '') + (err.stdout || '') + (err.message || '')).toString();
    const errLines = msg.split('\n').filter(l => l.startsWith('npm error'));
    console.error(`  ✗ FAILED: ${pkg.name}@${bumpedVersion}`);
    console.error(errLines.join('\n') || msg.slice(-400));
  } finally {
    writeFileSync(pkgPath, original, 'utf8'); // always revert
  }
}

const onlyArg = process.argv.find(a => a.startsWith('--only='));
const onlyFilter = onlyArg ? onlyArg.split('=')[1] : null;
const targets = onlyFilter
  ? BAD_PACKAGES.filter(p => p.includes(onlyFilter))
  : BAD_PACKAGES;

const versionMap = buildVersionMap();
console.log(`Fixing ${targets.length} package(s)${DRY_RUN ? ' (DRY RUN)' : ''}…\n`);

for (const rel of targets) {
  fixAndPublish(rel, versionMap);
}

console.log('\nDone.');

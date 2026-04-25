/**
 * Publish workspace packages whose name starts with the given scope prefix
 * (e.g. @usfm-tools, @usj-tools). Run `bun run build` first.
 *
 * Packages are published in dependency order: if A has `workspace:*` on B and
 * both match the scope, B is published before A.
 *
 * Optional: npm 9+ provenance — `npm publish --access public --provenance` from each
 * package directory when OIDC / token allow (see docs/16-production-readiness.md).
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const prefix = process.argv[2];
if (!prefix) {
  console.error('Usage: node scripts/publish-scope.cjs <@scope-prefix>');
  process.exit(1);
}

const root = path.join(__dirname, '..', 'packages');

/** @typedef {{ name: string, dir: string, json: Record<string, unknown> }} Pkg */

/** @returns {Pkg[]} */
function loadScopePackages() {
  /** @type {Pkg[]} */
  const out = [];
  for (const dirName of fs.readdirSync(root)) {
    const pkgDir = path.join(root, dirName);
    const pjPath = path.join(pkgDir, 'package.json');
    if (!fs.statSync(pkgDir).isDirectory() || !fs.existsSync(pjPath)) continue;
    const json = JSON.parse(fs.readFileSync(pjPath, 'utf8'));
    const { name, private: isPrivate } = json;
    if (isPrivate || typeof name !== 'string' || !name.startsWith(prefix)) continue;
    out.push({ name, dir: pkgDir, json });
  }
  return out;
}

/** @param {Record<string, unknown>} json */
function workspaceDepsInScope(json, byName) {
  /** @type {string[]} */
  const deps = [];
  const sections = [json.dependencies, json.devDependencies, json.peerDependencies];
  for (const section of sections) {
    if (!section || typeof section !== 'object') continue;
    for (const [depName, spec] of Object.entries(section)) {
      if (typeof spec !== 'string' || !spec.startsWith('workspace')) continue;
      if (byName.has(depName)) deps.push(depName);
    }
  }
  return deps;
}

/**
 * Kahn topological order: B before A when A has workspace dep on B.
 * @param {Pkg[]} pkgs
 * @returns {Pkg[]}
 */
function orderByWorkspaceDeps(pkgs) {
  const byName = new Map(pkgs.map((p) => [p.name, p]));
  /** @type {Map<string, string[]>} depName -> packages that depend on it */
  const dependents = new Map();
  /** @type {Map<string, number>} */
  const inDegree = new Map();

  for (const p of pkgs) {
    const ws = workspaceDepsInScope(p.json, byName);
    inDegree.set(p.name, ws.length);
    for (const d of ws) {
      if (!dependents.has(d)) dependents.set(d, []);
      dependents.get(d).push(p.name);
    }
  }

  /** @type {string[]} */
  const queue = [];
  for (const p of pkgs) {
    if ((inDegree.get(p.name) ?? 0) === 0) queue.push(p.name);
  }

  /** @type {string[]} */
  const sorted = [];
  while (queue.length) {
    const u = queue.shift();
    if (!u) break;
    sorted.push(u);
    for (const v of dependents.get(u) || []) {
      const next = (inDegree.get(v) ?? 0) - 1;
      inDegree.set(v, next);
      if (next === 0) queue.push(v);
    }
  }

  if (sorted.length !== pkgs.length) {
    const missing = pkgs.map((p) => p.name).filter((n) => !sorted.includes(n));
    console.warn(
      `publish-scope: workspace dependency cycle among [${missing.join(', ')}]; publishing remaining in arbitrary name order`,
    );
    for (const n of missing) sorted.push(n);
  }

  const idx = new Map(sorted.map((n, i) => [n, i]));
  return [...pkgs].sort((a, b) => (idx.get(a.name) ?? 0) - (idx.get(b.name) ?? 0));
}

const pkgs = orderByWorkspaceDeps(loadScopePackages());
for (const { name, dir } of pkgs) {
  console.log(`Publishing ${name}…`);
  execSync('npm publish --access public', { cwd: dir, stdio: 'inherit' });
}

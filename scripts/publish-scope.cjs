/**
 * Publish workspace packages whose name starts with the given scope prefix
 * (e.g. @usfm-tools, @usj-tools). Run `bun run build` first.
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
for (const dir of fs.readdirSync(root)) {
  const pkgDir = path.join(root, dir);
  const pjPath = path.join(pkgDir, 'package.json');
  if (!fs.statSync(pkgDir).isDirectory() || !fs.existsSync(pjPath)) continue;
  const { name, private: isPrivate } = JSON.parse(fs.readFileSync(pjPath, 'utf8'));
  if (isPrivate || !name.startsWith(prefix)) continue;
  console.log(`Publishing ${name}…`);
  execSync('npm publish --access public', { cwd: pkgDir, stdio: 'inherit' });
}

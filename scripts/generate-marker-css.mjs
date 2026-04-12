/**
 * Build-time: regenerate `packages/usfm-editor-themes/markers.css` from Paratext-style `usfm.sty`.
 * Run from repo root: `node scripts/generate-marker-css.mjs`
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const script = path.join(root, 'packages/usfm-editor-themes/scripts/generate.mjs');

const r = spawnSync(process.execPath, [script], { cwd: root, stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status ?? 1);

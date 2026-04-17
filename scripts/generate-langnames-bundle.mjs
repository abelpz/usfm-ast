/**
 * Generates packages/usfm-editor-app/public/langnames-bundle.json
 *
 * Source: https://git.door43.org/api/v1/languages/langnames.json
 * Run:   node scripts/generate-langnames-bundle.mjs
 *        node scripts/generate-langnames-bundle.mjs --fetch   (fetch fresh from DCS)
 *
 * The output keeps only the fields needed by the target-language picker:
 *   lc  – BCP-47 language code
 *   ln  – Local language name (native script)
 *   ang – English name (used for search matching)
 *   ld  – Text direction ("ltr" | "rtl")
 *
 * Fields stripped: alt, cc, gw, hc, lr, pk
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const OUT_FILE = path.resolve(repoRoot, 'packages/usfm-editor-app/public/langnames-bundle.json');
const DCS_URL = 'https://git.door43.org/api/v1/languages/langnames.json';

const fetchMode = process.argv.includes('--fetch');

async function getRawData() {
  if (fetchMode) {
    console.log(`Fetching from ${DCS_URL}…`);
    const res = await fetch(DCS_URL, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return await res.json();
  }
  // Fall back to a local copy if available.
  const localPaths = [
    path.resolve(repoRoot, 'scripts/langnames-source.json'),
    path.resolve(process.env.USERPROFILE ?? process.env.HOME ?? '', '.cursor/projects/c-Users-LENOVO-Git-Github-usfm-ast/uploads/langnames-0.json'),
  ];
  for (const p of localPaths) {
    if (fs.existsSync(p)) {
      console.log(`Reading local file: ${p}`);
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  }
  throw new Error(
    'No local langnames source found. Run with --fetch to download from DCS, or place the file at scripts/langnames-source.json',
  );
}

function isRecord(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function process_entry(item) {
  if (!isRecord(item)) return null;
  const lc = typeof item.lc === 'string' ? item.lc.trim() : '';
  if (!lc) return null;
  const ln =
    typeof item.ln === 'string' && item.ln.trim()
      ? item.ln.trim()
      : typeof item.ang === 'string' && item.ang.trim()
        ? item.ang.trim()
        : lc;
  const ang = typeof item.ang === 'string' && item.ang.trim() ? item.ang.trim() : undefined;
  const ld = item.ld === 'rtl' ? 'rtl' : 'ltr';
  const entry = { lc, ln };
  if (ang && ang !== ln) entry.ang = ang;
  if (ld === 'rtl') entry.ld = 'rtl'; // omit ltr (it's the default, saves space)
  return entry;
}

async function main() {
  const raw = await getRawData();
  if (!Array.isArray(raw)) throw new Error('Expected a JSON array');

  const entries = raw
    .map(process_entry)
    .filter(Boolean)
    .sort((a, b) => a.ln.localeCompare(b.ln, undefined, { sensitivity: 'base' }));

  const bundle = { v: 1, generatedAt: new Date().toISOString().slice(0, 10), entries };
  const json = JSON.stringify(bundle);

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, json, 'utf8');

  const rawKB = Math.round(json.length / 1024);
  console.log(`✓ Written ${entries.length} entries to ${OUT_FILE} (${rawKB} KB raw)`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });

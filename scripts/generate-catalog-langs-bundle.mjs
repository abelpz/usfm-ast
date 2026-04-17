/**
 * Generates packages/usfm-editor-app/public/catalog-langs-bundle.json
 *
 * Source: GET /api/v1/catalog/list/languages (same defaults as fetchCatalogLanguages)
 * Run:   node scripts/generate-catalog-langs-bundle.mjs --fetch
 *
 * Output shape matches langnames-bundle: { v, generatedAt, entries: [{ lc, ln, ang?, ld? }] }
 * `ld` is only stored when `"rtl"` (saves space; default is LTR).
 * If the catalog API omits direction, entries are enriched from
 * GET /api/v1/languages/langnames.json (same as generate-langnames-bundle.mjs).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const OUT_FILE = path.resolve(repoRoot, 'packages/usfm-editor-app/public/catalog-langs-bundle.json');

const DCS_URL =
  'https://git.door43.org/api/v1/catalog/list/languages?topic=tc-ready&subject=Bible%2CAligned+Bible';

const LANGNAMES_URL = 'https://git.door43.org/api/v1/languages/langnames.json';

const fetchMode = process.argv.includes('--fetch');

function catalogEnvelopeData(body) {
  if (Array.isArray(body)) return body;
  if (body && typeof body === 'object' && Array.isArray(body.data)) return body.data;
  if (body && typeof body === 'object' && Array.isArray(body.results)) return body.results;
  return [];
}

async function getRawRows() {
  if (fetchMode) {
    console.log(`Fetching ${DCS_URL}…`);
    const res = await fetch(DCS_URL, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const body = await res.json();
    return catalogEnvelopeData(body);
  }
  throw new Error('Run with --fetch to download catalog languages from Door43.');
}

/** Map lc (lowercase) -> true if rtl from langnames.json */
async function fetchLangnamesLdMap() {
  console.log(`Fetching ${LANGNAMES_URL} for direction enrichment…`);
  const res = await fetch(LANGNAMES_URL, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`langnames HTTP ${res.status}: ${res.statusText}`);
  const raw = await res.json();
  if (!Array.isArray(raw)) return new Map();
  /** @type {Map<string, boolean>} */
  const map = new Map();
  for (const item of raw) {
    if (typeof item !== 'object' || item === null || !item.lc) continue;
    const lc = String(item.lc).trim().toLowerCase();
    if (!lc) continue;
    if (item.ld === 'rtl') map.set(lc, true);
  }
  return map;
}

function isRecord(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function processEntry(item) {
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
  const ldRaw = item.ld ?? item.direction;
  const ldFromCatalog =
    ldRaw === 'rtl' || ldRaw === 'RTL'
      ? 'rtl'
      : ldRaw === 'ltr' || ldRaw === 'LTR'
        ? 'ltr'
        : undefined;
  const entry = { lc, ln };
  if (ang && ang !== ln) entry.ang = ang;
  if (ldFromCatalog === 'rtl') entry.ld = 'rtl';
  return { entry, ldFromCatalog };
}

/**
 * @param {{ lc: string; ln: string; ang?: string; ld?: string }} entry
 * @param {Map<string, boolean>} langnamesRtl
 */
function enrichLd(entry, langnamesRtl) {
  if (entry.ld === 'rtl') return;
  if (langnamesRtl.get(entry.lc.toLowerCase())) {
    entry.ld = 'rtl';
  }
}

async function main() {
  const raw = await getRawRows();
  if (!Array.isArray(raw)) throw new Error('Expected a JSON array or envelope with data[]');

  const langnamesRtl = await fetchLangnamesLdMap();

  const processed = raw.map(processEntry).filter(Boolean);
  for (const p of processed) {
    enrichLd(p.entry, langnamesRtl);
  }

  const entries = processed
    .map((p) => p.entry)
    .sort((a, b) => a.ln.localeCompare(b.ln, undefined, { sensitivity: 'base' }));

  const bundle = { v: 1, generatedAt: new Date().toISOString().slice(0, 10), entries };
  const json = JSON.stringify(bundle);

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, json, 'utf8');

  const rtlCount = entries.filter((e) => e.ld === 'rtl').length;
  const rawKB = Math.round(json.length / 1024);
  console.log(
    `✓ Written ${entries.length} catalog languages (${rtlCount} rtl) to ${OUT_FILE} (${rawKB} KB raw)`,
  );
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

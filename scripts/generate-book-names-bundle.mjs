/**
 * Generate packages/usfm-editor-app/public/book-names-bundle.json
 *
 * Fetches Bible book titles for each requested language from the Door43 catalog
 * by finding an Aligned Bible resource and reading its manifest.yaml.
 *
 * Usage:
 *   bun run generate-book-names              # update existing bundle
 *   bun run generate-book-names -- --lang fr,de,pt   # specific languages only
 *   bun run generate-book-names -- --add sw,vi       # append new languages
 *
 * The script reads the CURRENT bundle and merges new data into it, so running
 * it repeatedly is idempotent.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLE_PATH = resolve(__dirname, '../packages/usfm-editor-app/public/book-names-bundle.json');
const DCS_BASE = 'https://git.door43.org/api/v1';

// Canonical USFM book codes in USFM_BOOK_CODES order (OT + NT = 66 entries).
const BOOK_CODES = [
  'GEN','EXO','LEV','NUM','DEU','JOS','JDG','RUT',
  '1SA','2SA','1KI','2KI','1CH','2CH','EZR','NEH','EST','JOB',
  'PSA','PRO','ECC','SNG','ISA','JER','LAM','EZK','DAN',
  'HOS','JOL','AMO','OBA','JON','MIC','NAM','HAB','ZEP','HAG','ZEC','MAL',
  'MAT','MRK','LUK','JHN','ACT','ROM',
  '1CO','2CO','GAL','EPH','PHP','COL','1TH','2TH','1TI','2TI','TIT','PHM',
  'HEB','JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV',
];

// Parse args
const args = process.argv.slice(2);
const langFlag = args.find((a) => a.startsWith('--lang=') || a === '--lang');
const addFlag  = args.find((a) => a.startsWith('--add=')  || a === '--add');

function parseList(flag) {
  if (!flag) return null;
  const idx = args.indexOf(flag);
  const val = flag.includes('=') ? flag.split('=')[1] : args[idx + 1];
  return val ? val.split(',').map((s) => s.trim()).filter(Boolean) : null;
}

const currentBundle = existsSync(BUNDLE_PATH)
  ? JSON.parse(readFileSync(BUNDLE_PATH, 'utf8'))
  : {};

const defaultLangs = Object.keys(currentBundle).filter((k) => k !== '_comment');
const requestedLangs = parseList(langFlag) ?? parseList(addFlag) ?? defaultLangs;

console.log(`Processing ${requestedLangs.length} language(s): ${requestedLangs.join(', ')}\n`);

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

/** Parse a simple manifest.yaml `projects` section without a full YAML parser. */
function extractProjectsFromYaml(yaml) {
  const projects = {};
  // Match each project block by identifier + title
  const blockRe = /- identifier:\s*(\S+)[\s\S]*?title:\s*(.+)/g;
  let m;
  while ((m = blockRe.exec(yaml)) !== null) {
    const code = m[1].trim().toUpperCase();
    const title = m[2].trim().replace(/^["']|["']$/g, '');
    if (title) projects[code] = title;
  }
  return projects;
}

async function fetchBookNamesForLang(lc) {
  // Search the catalog for an Aligned Bible in this language
  const results = await fetchJson(
    `${DCS_BASE}/catalog/search?lang=${lc}&subject=Aligned+Bible&limit=3`
  ).catch(() => null);

  const items = results?.data ?? results?.results ?? [];
  if (!items.length) {
    // Fallback: try plain "Bible"
    const r2 = await fetchJson(
      `${DCS_BASE}/catalog/search?lang=${lc}&subject=Bible&limit=3`
    ).catch(() => null);
    items.push(...(r2?.data ?? r2?.results ?? []));
  }

  for (const item of items) {
    const owner = item.repo?.owner?.login ?? item.owner;
    const repo  = item.repo?.name ?? item.name;
    if (!owner || !repo) continue;

    const branches = ['master', 'main'];
    for (const branch of branches) {
      const url = `https://git.door43.org/${owner}/${repo}/raw/branch/${branch}/manifest.yaml`;
      const yaml = await fetch(url).then((r) => r.ok ? r.text() : null).catch(() => null);
      if (!yaml) continue;

      const titles = extractProjectsFromYaml(yaml);
      const names = BOOK_CODES.map((c) => titles[c] ?? null);
      const covered = names.filter(Boolean).length;
      if (covered >= 27) { // at least NT
        console.log(`  ✓ ${lc}: ${covered}/66 books from ${owner}/${repo}`);
        return names;
      }
    }
  }
  return null;
}

const newBundle = { _comment: currentBundle._comment ?? 'Bible book names by BCP-47 base language. Regenerate with: bun run generate-book-names' };

// Preserve existing entries not being updated
for (const [k, v] of Object.entries(currentBundle)) {
  if (k !== '_comment') newBundle[k] = v;
}

let updated = 0, failed = 0;
for (const lc of requestedLangs) {
  process.stdout.write(`Fetching ${lc}… `);
  try {
    const names = await fetchBookNamesForLang(lc);
    if (names) {
      newBundle[lc] = names;
      updated++;
    } else {
      console.log(`  ✗ ${lc}: no suitable resource found (keeping existing data)`);
      failed++;
    }
  } catch (e) {
    console.log(`  ✗ ${lc}: ${e.message}`);
    failed++;
  }
}

// Sort keys alphabetically (except _comment first)
const sorted = { _comment: newBundle._comment };
for (const k of Object.keys(newBundle).filter((k) => k !== '_comment').sort()) {
  sorted[k] = newBundle[k];
}

writeFileSync(BUNDLE_PATH, JSON.stringify(sorted, null, 2), 'utf8');
console.log(`\nDone — ${updated} updated, ${failed} failed. Bundle written to:\n  ${BUNDLE_PATH}`);

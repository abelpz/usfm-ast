/**
 * Door43 language directory — target-language picker data.
 *
 * Priority chain for `getLangnames()`:
 *   1. In-memory cache (instant, same session).
 *   2. localStorage (7-day TTL, survives page reload).
 *   3. **Bundled JSON** (`/langnames-bundle.json`, served statically by Vite /
 *      Tauri's WebView) — instant offline boot even on first run.
 *   4. Network fetch from DCS (`GET /api/v1/languages/langnames.json`).
 *
 * The bundled file is kept up-to-date by running:
 *   node scripts/generate-langnames-bundle.mjs --fetch
 *
 * Source / catalog languages (Door43 published catalog) are fetched via
 * `GET /api/v1/catalog/list/languages` — see `getCatalogLanguages()` below,
 * which also loads `/catalog-langs-bundle.json` offline (like langnames).
 *
 * @see https://git.door43.org/api/swagger (languages → langnames JSON)
 */

import { fetchCatalogLanguages } from '@/dcs-client';

const STORAGE_KEY_PREFIX = 'usfm-editor-dcs-langnames:';
const STORAGE_VERSION = 2; // bumped because we now include `ld` field
/** Refresh from network after this many milliseconds (stale cache still usable offline). */
const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type DcsLangnameEntry = {
  /** BCP-47 language code. */
  lc: string;
  /** Local (native) language name. */
  ln: string;
  /** English name — used for search matching. */
  ang?: string;
  /** Text direction. Defaults to "ltr" when absent. */
  ld?: 'ltr' | 'rtl';
};

type BundleFile = {
  v: number;
  generatedAt: string;
  entries: DcsLangnameEntry[];
};

type StoredBlob = {
  v: number;
  fetchedAt: number;
  entries: DcsLangnameEntry[];
};

function normalizeHost(host: string): string {
  let h = host.trim();
  if (!h) return 'git.door43.org';
  h = h.replace(/^https?:\/\//i, '');
  const slash = h.indexOf('/');
  if (slash >= 0) h = h.slice(0, slash);
  h = h.trim().toLowerCase();
  return h || 'git.door43.org';
}

function storageKey(host: string): string {
  return `${STORAGE_KEY_PREFIX}${normalizeHost(host)}`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function parseLangnamesJson(raw: unknown): DcsLangnameEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: DcsLangnameEntry[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const lc = item.lc;
    if (typeof lc !== 'string' || !lc.trim()) continue;
    const lcTrim = lc.trim();
    const ln =
      typeof item.ln === 'string' && item.ln.trim()
        ? item.ln.trim()
        : typeof item.ang === 'string' && item.ang.trim()
          ? item.ang.trim()
          : lcTrim;
    const ang = typeof item.ang === 'string' && item.ang.trim() ? item.ang.trim() : undefined;
    const ld: 'ltr' | 'rtl' | undefined = item.ld === 'rtl' ? 'rtl' : undefined;
    const entry: DcsLangnameEntry = { lc: lcTrim, ln };
    if (ang && ang !== ln) entry.ang = ang;
    if (ld) entry.ld = ld;
    out.push(entry);
  }
  out.sort((a, b) => a.ln.localeCompare(b.ln, undefined, { sensitivity: 'base' }));
  return out;
}

// ─── In-memory and in-flight caches ──────────────────────────────────────────

const memoryByHost = new Map<string, DcsLangnameEntry[]>();
const inflightByHost = new Map<string, Promise<DcsLangnameEntry[]>>();

// ─── localStorage persistence ─────────────────────────────────────────────────

function readDisk(host: string): { entries: DcsLangnameEntry[]; stale: boolean } | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey(host)) : null;
    if (!raw) return null;
    const o = JSON.parse(raw) as StoredBlob;
    if (o.v !== STORAGE_VERSION || !Array.isArray(o.entries) || typeof o.fetchedAt !== 'number') return null;
    if (o.entries.length === 0) return null;
    const stale = Date.now() - o.fetchedAt > MAX_CACHE_AGE_MS;
    return { entries: o.entries, stale };
  } catch {
    return null;
  }
}

function writeDisk(host: string, entries: DcsLangnameEntry[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const blob: StoredBlob = { v: STORAGE_VERSION, fetchedAt: Date.now(), entries };
    localStorage.setItem(storageKey(host), JSON.stringify(blob));
  } catch {
    /* quota or private mode */
  }
}

// ─── Bundled JSON fallback ────────────────────────────────────────────────────

/** Resolves once; subsequent calls return the cached promise. */
let bundlePromise: Promise<DcsLangnameEntry[]> | null = null;

/**
 * Load `/langnames-bundle.json` — a static file served by Vite / Tauri's
 * WebView from the `public/` folder. This is the fallback for offline first
 * boot when localStorage is empty (e.g. fresh install with no internet).
 *
 * Only used for the default DCS host; other hosts fall back to network.
 */
function loadBundle(): Promise<DcsLangnameEntry[]> {
  if (bundlePromise) return bundlePromise;
  bundlePromise = (async () => {
    try {
      const res = await fetch('./langnames-bundle.json', { cache: 'force-cache' });
      if (!res.ok) return [];
      const data = await res.json() as BundleFile;
      if (data.v !== 1 || !Array.isArray(data.entries)) return [];
      return data.entries;
    } catch {
      return [];
    }
  })();
  return bundlePromise;
}

// ─── Network fetch ────────────────────────────────────────────────────────────

async function fetchLangnamesFromNetwork(host: string): Promise<DcsLangnameEntry[]> {
  const h = normalizeHost(host);
  const url = `https://${h}/api/v1/languages/langnames.json`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`DCS langnames ${res.status}: ${res.statusText}`);
  const raw: unknown = await res.json();
  return parseLangnamesJson(raw);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns language list for the **target language** picker.
 *
 * Resolution order:
 *  1. In-memory cache.
 *  2. localStorage (7-day TTL).
 *  3. Bundled JSON (static file, offline-first, default host only).
 *  4. Network fetch from DCS.
 *
 * When the localStorage copy is stale, a background network revalidation
 * is triggered without blocking the caller.
 */
export async function getLangnames(host?: string): Promise<DcsLangnameEntry[]> {
  const h = normalizeHost(host ?? 'git.door43.org');
  const isDefault = h === 'git.door43.org';

  // 1. In-memory.
  const mem = memoryByHost.get(h);
  if (mem && mem.length > 0) return mem;

  // One in-flight fetch per host.
  const pending = inflightByHost.get(h);
  if (pending) return pending;

  // 2. localStorage.
  const disk = readDisk(h);
  if (disk && !disk.stale) {
    memoryByHost.set(h, disk.entries);
    return disk.entries;
  }
  if (disk?.stale) {
    // Return stale data immediately; revalidate in background.
    memoryByHost.set(h, disk.entries);
    void fetchLangnamesFromNetwork(h)
      .then((fresh) => { memoryByHost.set(h, fresh); writeDisk(h, fresh); })
      .catch(() => {});
    return disk.entries;
  }

  // 3. Bundled JSON (only for the default host; other hosts go straight to network).
  if (isDefault) {
    const bundle = await loadBundle();
    if (bundle.length > 0) {
      memoryByHost.set(h, bundle);
      // Trigger a background network fetch to get the freshest list.
      void fetchLangnamesFromNetwork(h)
        .then((fresh) => { memoryByHost.set(h, fresh); writeDisk(h, fresh); })
        .catch(() => {});
      return bundle;
    }
  }

  // 4. Network fetch (blocking).
  const work = (async () => {
    try {
      const fresh = await fetchLangnamesFromNetwork(h);
      memoryByHost.set(h, fresh);
      writeDisk(h, fresh);
      return fresh;
    } catch {
      // Last resort: return bundle data if available.
      if (isDefault) {
        const bundle = await loadBundle();
        if (bundle.length > 0) return bundle;
      }
      throw new Error('Could not load language list. Check your connection.');
    } finally {
      inflightByHost.delete(h);
    }
  })();

  inflightByHost.set(h, work);
  return work;
}

/** Warm cache after app shell loads; safe to fire-and-forget. */
export function prefetchLangnames(host?: string): void {
  void getLangnames(host).catch(() => {});
}

/**
 * Pre-populate the in-memory langnames cache (skips disk + network).
 * Called by the KV-backed cache layer when a fresh copy is in Tauri Store.
 */
export function primeLangnamesMemory(host: string, entries: DcsLangnameEntry[]): void {
  memoryByHost.set(normalizeHost(host), entries);
}

// ─── Catalog languages (source languages from DCS catalog) ───────────────────
//
// Resolution order for `getCatalogLanguages()` mirrors `getLangnames()`:
// memory → localStorage (7-day TTL) → bundled `/catalog-langs-bundle.json`
// (default host only) → network. Regenerate: `bun run generate-catalog-langs`.

const CATALOG_LANG_STORAGE_PREFIX = 'usfm-editor-dcs-catalog-langs:';
const CATALOG_STORAGE_VERSION = 4;

type CatalogStoredBlob = {
  v: number;
  fetchedAt: number;
  entries: DcsLangnameEntry[];
};

function catalogStorageKey(host: string): string {
  return `${CATALOG_LANG_STORAGE_PREFIX}${normalizeHost(host)}`;
}

const catalogMemoryByHost = new Map<string, DcsLangnameEntry[]>();
const catalogInflightByHost = new Map<string, Promise<DcsLangnameEntry[]>>();

function readCatalogDisk(host: string): { entries: DcsLangnameEntry[]; stale: boolean } | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(catalogStorageKey(host)) : null;
    if (!raw) return null;
    const o = JSON.parse(raw) as CatalogStoredBlob;
    if (o.v !== CATALOG_STORAGE_VERSION || !Array.isArray(o.entries) || typeof o.fetchedAt !== 'number') return null;
    if (o.entries.length === 0) return null;
    const stale = Date.now() - o.fetchedAt > MAX_CACHE_AGE_MS;
    return { entries: o.entries, stale };
  } catch {
    return null;
  }
}

function writeCatalogDisk(host: string, entries: DcsLangnameEntry[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const blob: CatalogStoredBlob = { v: CATALOG_STORAGE_VERSION, fetchedAt: Date.now(), entries };
    localStorage.setItem(catalogStorageKey(host), JSON.stringify(blob));
  } catch {
    /* ignore */
  }
}

/** Resolves once; subsequent calls return the cached promise. */
let catalogBundlePromise: Promise<DcsLangnameEntry[]> | null = null;

/**
 * Load `/catalog-langs-bundle.json` — static file in `public/` (Vite / Tauri).
 * Offline-first when localStorage is empty (e.g. fresh install, no network).
 */
function loadCatalogBundle(): Promise<DcsLangnameEntry[]> {
  if (catalogBundlePromise) return catalogBundlePromise;
  catalogBundlePromise = (async () => {
    try {
      const res = await fetch('./catalog-langs-bundle.json', { cache: 'force-cache' });
      if (!res.ok) return [];
      const data = (await res.json()) as BundleFile;
      if (data.v !== 1 || !Array.isArray(data.entries)) return [];
      return data.entries;
    } catch {
      return [];
    }
  })();
  return catalogBundlePromise;
}

async function fetchCatalogLanguagesMapped(h: string): Promise<DcsLangnameEntry[]> {
  const fresh = await fetchCatalogLanguages(h);
  return fresh.map((r) => ({
    lc: r.lc,
    ln: r.ln,
    ...(r.ang && r.ang !== r.ln ? { ang: r.ang } : {}),
    ...(r.ld === 'rtl' ? { ld: 'rtl' as const } : {}),
  }));
}

/**
 * Languages that appear in the Door43 published catalog (reference / source
 * pickers). ~200 entries. Same resolution chain as target langnames: memory,
 * disk, bundled JSON (default host), then network with background refresh.
 */
export async function getCatalogLanguages(host?: string): Promise<DcsLangnameEntry[]> {
  const h = normalizeHost(host ?? 'git.door43.org');
  const isDefault = h === 'git.door43.org';

  const mem = catalogMemoryByHost.get(h);
  if (mem && mem.length > 0) return mem;

  const pending = catalogInflightByHost.get(h);
  if (pending) return pending;

  const disk = readCatalogDisk(h);
  if (disk && !disk.stale) {
    catalogMemoryByHost.set(h, disk.entries);
    return disk.entries;
  }
  if (disk?.stale) {
    catalogMemoryByHost.set(h, disk.entries);
    void fetchCatalogLanguagesMapped(h)
      .then((fresh) => {
        catalogMemoryByHost.set(h, fresh);
        writeCatalogDisk(h, fresh);
      })
      .catch(() => {});
    return disk.entries;
  }

  if (isDefault) {
    const bundle = await loadCatalogBundle();
    if (bundle.length > 0) {
      catalogMemoryByHost.set(h, bundle);
      void fetchCatalogLanguagesMapped(h)
        .then((fresh) => {
          catalogMemoryByHost.set(h, fresh);
          writeCatalogDisk(h, fresh);
        })
        .catch(() => {});
      return bundle;
    }
  }

  const work = (async () => {
    try {
      const fresh = await fetchCatalogLanguagesMapped(h);
      catalogMemoryByHost.set(h, fresh);
      writeCatalogDisk(h, fresh);
      return fresh;
    } catch {
      if (disk?.entries.length) return disk.entries;
      if (isDefault) {
        const b = await loadCatalogBundle();
        if (b.length > 0) return b;
      }
      throw new Error('Could not load catalog language list from Door43.');
    } finally {
      catalogInflightByHost.delete(h);
    }
  })();

  catalogInflightByHost.set(h, work);
  return work;
}

export function prefetchCatalogLanguages(host?: string): void {
  void getCatalogLanguages(host).catch(() => {});
}

/**
 * Pre-populate the in-memory catalog languages cache (skips disk + network).
 * Called by the KV-backed cache layer when a fresh copy is in Tauri Store.
 */
export function primeCatalogMemory(host: string, entries: DcsLangnameEntry[]): void {
  catalogMemoryByHost.set(normalizeHost(host), entries);
}

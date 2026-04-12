/**
 * Door43 language directory from DCS (`GET /api/v1/languages/langnames.json`).
 * @see https://git.door43.org/api/swagger (languages → langnames JSON)
 */

import { fetchCatalogLanguages } from '@/dcs-client';

const STORAGE_KEY_PREFIX = 'usfm-editor-dcs-langnames:';
const STORAGE_VERSION = 1;
/** Refresh from network after this many milliseconds (local cache still used offline). */
const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type DcsLangnameEntry = {
  lc: string;
  ln: string;
  ang?: string;
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
    out.push({ lc: lcTrim, ln, ang });
  }
  out.sort((a, b) => a.ln.localeCompare(b.ln, undefined, { sensitivity: 'base' }));
  return out;
}

const memoryByHost = new Map<string, DcsLangnameEntry[]>();
const inflightByHost = new Map<string, Promise<DcsLangnameEntry[]>>();

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
    const blob: StoredBlob = {
      v: STORAGE_VERSION,
      fetchedAt: Date.now(),
      entries,
    };
    localStorage.setItem(storageKey(host), JSON.stringify(blob));
  } catch {
    /* quota or private mode */
  }
}

async function fetchLangnamesFromNetwork(host: string): Promise<DcsLangnameEntry[]> {
  const h = normalizeHost(host);
  const url = `https://${h}/api/v1/languages/langnames.json`;
  const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'force-cache' });
  if (!res.ok) throw new Error(`DCS langnames ${res.status}: ${res.statusText}`);
  const raw: unknown = await res.json();
  return parseLangnamesJson(raw);
}

/**
 * Returns in-memory or disk cache when available; revalidates in the background if stale.
 * Concurrent callers share one in-flight fetch per host.
 */
export async function getLangnames(host?: string): Promise<DcsLangnameEntry[]> {
  const h = normalizeHost(host ?? 'git.door43.org');
  const mem = memoryByHost.get(h);
  if (mem && mem.length > 0) return mem;

  const pending = inflightByHost.get(h);
  if (pending) return pending;

  const disk = readDisk(h);
  if (disk && !disk.stale) {
    memoryByHost.set(h, disk.entries);
    return disk.entries;
  }
  if (disk?.stale) {
    memoryByHost.set(h, disk.entries);
  }

  const work = (async () => {
    try {
      const fresh = await fetchLangnamesFromNetwork(h);
      memoryByHost.set(h, fresh);
      writeDisk(h, fresh);
      return fresh;
    } catch {
      if (disk?.entries.length) return disk.entries;
      throw new Error('Could not load language list from Door43.');
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

/* ---- Catalog languages (published resources only, ~21 KB) ---- */

const CATALOG_LANG_STORAGE_PREFIX = 'usfm-editor-dcs-catalog-langs:';
/** Bumped when catalog language query changes (e.g. `topic` / `subject`). */
const CATALOG_STORAGE_VERSION = 3;

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
    const blob: CatalogStoredBlob = {
      v: CATALOG_STORAGE_VERSION,
      fetchedAt: Date.now(),
      entries,
    };
    localStorage.setItem(catalogStorageKey(host), JSON.stringify(blob));
  } catch {
    /* ignore */
  }
}

/**
 * Languages that appear in the Door43 published catalog (for “Translate from source” → DCS).
 */
export async function getCatalogLanguages(host?: string): Promise<DcsLangnameEntry[]> {
  const h = normalizeHost(host ?? 'git.door43.org');
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
  }

  const work = (async () => {
    try {
      const fresh = await fetchCatalogLanguages(h);
      const entries: DcsLangnameEntry[] = fresh.map((r) => ({ lc: r.lc, ln: r.ln, ang: r.ang }));
      catalogMemoryByHost.set(h, entries);
      writeCatalogDisk(h, entries);
      return entries;
    } catch {
      if (disk?.entries.length) return disk.entries;
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

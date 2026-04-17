/**
 * KV-backed layer over the DCS catalog/langnames in-memory cache.
 *
 * On Tauri, the platform KV adapter writes to a JSON file in AppData via the
 * Tauri Store plugin -- more durable than WebView localStorage (which could be
 * cleared on some OS configurations). This module reads the stored blob at boot
 * and primes the in-memory cache immediately, so the UI is usable offline
 * without a network round-trip.
 *
 * After a successful network fetch the existing code already writes to
 * localStorage; here we also mirror to KV so the two caches stay in sync.
 *
 * Keys are host-aware: any DCS server the user connects to via the login form
 * (git.door43.org, qa.door43.org, a self-hosted instance, etc.) gets its own
 * KV entry so offline boot works regardless of which server was last used.
 */
import type { KeyValueAdapter } from '@usfm-tools/platform-adapters';
import {
  getLangnames,
  getCatalogLanguages,
  primeLangnamesMemory,
  primeCatalogMemory,
  type DcsLangnameEntry,
} from './dcs-langnames-cache';

/** Refresh from network after 24 h; still usable offline beyond that. */
const MAX_KV_AGE_MS = 24 * 60 * 60 * 1000;

type CachedBlob = {
  fetchedAt: number;
  entries: DcsLangnameEntry[];
};

function normalizeHost(host: string): string {
  let h = host.trim();
  if (!h) return 'git.door43.org';
  h = h.replace(/^https?:\/\//i, '');
  const slash = h.indexOf('/');
  if (slash >= 0) h = h.slice(0, slash);
  return h.trim().toLowerCase() || 'git.door43.org';
}

function kvLangnamesKey(host: string): string {
  return `catalog-cache:langnames:${normalizeHost(host)}`;
}

function kvCatalogKey(host: string): string {
  return `catalog-cache:catalog-langs:${normalizeHost(host)}`;
}

function isFreshBlob(blob: CachedBlob): boolean {
  return Date.now() - blob.fetchedAt < MAX_KV_AGE_MS;
}

async function readBlob(kv: KeyValueAdapter, key: string): Promise<CachedBlob | null> {
  try {
    const raw = await kv.get(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedBlob;
    if (!Array.isArray(parsed.entries) || typeof parsed.fetchedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeBlob(kv: KeyValueAdapter, key: string, entries: DcsLangnameEntry[]): Promise<void> {
  try {
    const blob: CachedBlob = { fetchedAt: Date.now(), entries };
    await kv.set(key, JSON.stringify(blob));
  } catch {
    /* best-effort -- non-fatal if KV write fails */
  }
}

/**
 * Call once at app boot (before rendering) with the platform KV adapter and
 * the DCS host the user last connected to.
 *
 * - Reads any previously persisted langnames from KV and primes the
 *   in-memory cache so offline boots are instant.
 * - Schedules a background refresh from the network if the KV copy is stale
 *   (>24 h) or absent, and persists the result back to KV.
 *
 * @param kv   Platform key-value adapter (Tauri Store on desktop, localStorage on web).
 * @param host DCS host to prime caches for. Defaults to 'git.door43.org'.
 *             Pass the host stored in the user's saved credentials so any
 *             custom server gets its own offline cache slot.
 */
export async function initKvCatalogCache(kv: KeyValueAdapter, host = 'git.door43.org'): Promise<void> {
  const langnamesKey = kvLangnamesKey(host);
  const catalogKey = kvCatalogKey(host);

  const [langnamesBlob, catalogBlob] = await Promise.all([
    readBlob(kv, langnamesKey),
    readBlob(kv, catalogKey),
  ]);

  // Prime in-memory caches immediately from KV so offline boots work.
  if (langnamesBlob && langnamesBlob.entries.length > 0) {
    primeLangnamesMemory(host, langnamesBlob.entries);
  }
  if (catalogBlob && catalogBlob.entries.length > 0) {
    primeCatalogMemory(host, catalogBlob.entries);
  }

  // Background refresh when stale or absent.
  const needsLangnames = !langnamesBlob || !isFreshBlob(langnamesBlob);
  const needsCatalog = !catalogBlob || !isFreshBlob(catalogBlob);

  if (needsLangnames) {
    void getLangnames(host)
      .then((entries) => writeBlob(kv, langnamesKey, entries))
      .catch(() => { /* offline -- use primed cache */ });
  }
  if (needsCatalog) {
    void getCatalogLanguages(host)
      .then((entries) => writeBlob(kv, catalogKey, entries))
      .catch(() => { /* offline -- use primed cache */ });
  }
}

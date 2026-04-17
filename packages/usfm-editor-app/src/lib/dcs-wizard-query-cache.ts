/**
 * Catalog source cache for wizard steps and the reference panel.
 *
 * Two-tier strategy:
 *  1. In-memory (2-min TTL) — avoids duplicate network calls within a session.
 *  2. localStorage (no expiry) — survives page reloads and works offline.
 *     Keys include the DCS host so any server the user logs into is cached
 *     independently (git.door43.org, qa.door43.org, self-hosted, etc.).
 *
 * `fetchCatalogSourcesCached` tries the network first; on failure it returns
 * whatever is in localStorage so the reference panel works offline.
 */

import {
  DEFAULT_CATALOG_SUBJECT,
  DEFAULT_CATALOG_TOPIC,
  DEFAULT_SCRIPTURE_REPO_SUBJECT,
  searchCatalogSources,
  searchReposForScriptureLanguage,
  type CatalogEntry,
  type Door43RepoRow,
} from '@/dcs-client';

const DEFAULT_HOST = 'git.door43.org';

const TTL_MS = 2 * 60 * 1000;
const LS_PREFIX = 'dcs-catalog-sources:v1:';

function normalizeHost(host?: string): string {
  let h = (host ?? DEFAULT_HOST).trim();
  if (!h) return DEFAULT_HOST;
  h = h.replace(/^https?:\/\//i, '');
  const slash = h.indexOf('/');
  if (slash >= 0) h = h.slice(0, slash);
  h = h.trim().toLowerCase();
  return h || DEFAULT_HOST;
}

type Timed<T> = { storedAt: number; data: T };

function isFresh(entry: Timed<unknown> | undefined): boolean {
  return !!entry && Date.now() - entry.storedAt < TTL_MS;
}

// -- localStorage persistence -------------------------------------------------

function lsKey(host: string, lc: string, topic: string, subject: string): string {
  return `${LS_PREFIX}${host}:${lc}:${topic}:${subject}`;
}

function readCatalogFromStorage(key: string): CatalogEntry[] | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed as CatalogEntry[];
  } catch {
    return null;
  }
}

function writeCatalogToStorage(key: string, entries: CatalogEntry[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(entries));
  } catch {
    // quota or private mode -- non-fatal
  }
}

// -- In-memory cache ----------------------------------------------------------

const catalogByKey = new Map<string, Timed<CatalogEntry[]>>();
const catalogInflight = new Map<string, Promise<CatalogEntry[]>>();

function catalogCacheKey(host: string, langLc: string, topic: string, subject: string): string {
  return `${host}\n${langLc}\n${topic}\n${subject}`;
}

export function peekCatalogSourcesWizardCache(
  host: string | undefined,
  lang: string,
  topic: string = DEFAULT_CATALOG_TOPIC,
  subject: string = DEFAULT_CATALOG_SUBJECT,
): CatalogEntry[] | null {
  const h = normalizeHost(host);
  const lc = lang.trim().toLowerCase();
  if (!lc) return null;
  const key = catalogCacheKey(h, lc, topic, subject);
  const hit = catalogByKey.get(key);
  return isFresh(hit) ? hit!.data : null;
}

/** Original wizard cache -- in-memory only with 2-min TTL. */
export function fetchCatalogSourcesWizardCached(
  options: Parameters<typeof searchCatalogSources>[0],
): Promise<CatalogEntry[]> {
  const h = normalizeHost(options.host);
  const lc = options.lang.trim().toLowerCase();
  const topic = options.topic ?? DEFAULT_CATALOG_TOPIC;
  const subject = options.subject ?? DEFAULT_CATALOG_SUBJECT;
  const key = catalogCacheKey(h, lc, topic, subject);

  const fresh = catalogByKey.get(key);
  if (isFresh(fresh)) return Promise.resolve(fresh!.data);

  const pending = catalogInflight.get(key);
  if (pending) return pending;

  const work = searchCatalogSources(options)
    .then((rows) => {
      catalogByKey.set(key, { storedAt: Date.now(), data: rows });
      return rows;
    })
    .finally(() => {
      catalogInflight.delete(key);
    });

  catalogInflight.set(key, work);
  return work;
}

/**
 * Durable catalog search with localStorage fallback for offline use.
 *
 * Resolution order:
 *  1. In-memory (2-min TTL) -- instant within session.
 *  2. Network -- try live catalog search; on success write to memory + localStorage.
 *  3. localStorage -- return persisted results when network fails.
 *
 * Returns `{ entries, fromCache }` where `fromCache` is true when the network
 * was unavailable and localStorage data was used instead.
 */
export async function fetchCatalogSourcesCached(
  options: Parameters<typeof searchCatalogSources>[0],
): Promise<{ entries: CatalogEntry[]; fromCache: boolean }> {
  const h = normalizeHost(options.host);
  const lc = options.lang.trim().toLowerCase();
  const topic = options.topic ?? DEFAULT_CATALOG_TOPIC;
  const subject = options.subject ?? DEFAULT_CATALOG_SUBJECT;
  const memKey = catalogCacheKey(h, lc, topic, subject);
  const storageKey = lsKey(h, lc, topic, subject);

  // 1. In-memory
  const mem = catalogByKey.get(memKey);
  if (isFresh(mem)) return { entries: mem!.data, fromCache: false };

  // Deduplicate in-flight requests
  const inflight = catalogInflight.get(memKey);
  if (inflight) return { entries: await inflight, fromCache: false };

  // 2. Network
  const work = searchCatalogSources(options)
    .then((rows) => {
      catalogByKey.set(memKey, { storedAt: Date.now(), data: rows });
      writeCatalogToStorage(storageKey, rows);
      return rows;
    })
    .finally(() => {
      catalogInflight.delete(memKey);
    });
  catalogInflight.set(memKey, work);

  try {
    const entries = await work;
    return { entries, fromCache: false };
  } catch {
    // 3. localStorage fallback
    const stored = readCatalogFromStorage(storageKey);
    if (stored) return { entries: stored, fromCache: true };
    throw new Error('No sources available -- check your connection or download sources while online.');
  }
}

/**
 * Read persisted catalog entries from localStorage without triggering a
 * network fetch. Returns null if nothing is stored for this key.
 */
export function peekCatalogSourcesStorage(
  host: string | undefined,
  lang: string,
  topic = DEFAULT_CATALOG_TOPIC,
  subject = DEFAULT_CATALOG_SUBJECT,
): CatalogEntry[] | null {
  const h = normalizeHost(host);
  const lc = lang.trim().toLowerCase();
  if (!lc) return null;
  return readCatalogFromStorage(lsKey(h, lc, topic, subject));
}

// -- Repo search (open-from-DCS "repository" step) ----------------------------

const reposByKey = new Map<string, Timed<Door43RepoRow[]>>();
const reposInflight = new Map<string, Promise<Door43RepoRow[]>>();

function reposCacheKey(host: string, langLc: string, uid: number | undefined, subject: string): string {
  const scope = uid === undefined ? 'public' : `uid:${uid}`;
  return `${host}\n${langLc}\n${scope}\n${subject}`;
}

export function peekReposSearchWizardCache(
  host: string | undefined,
  lang: string,
  uid: number | undefined,
  subject: string = DEFAULT_SCRIPTURE_REPO_SUBJECT,
): Door43RepoRow[] | null {
  const h = normalizeHost(host);
  const lc = lang.trim().toLowerCase();
  if (!lc) return null;
  const key = reposCacheKey(h, lc, uid, subject);
  const hit = reposByKey.get(key);
  return isFresh(hit) ? hit!.data : null;
}

export function searchReposForScriptureLanguageWizardCached(
  options: Parameters<typeof searchReposForScriptureLanguage>[0],
): Promise<Door43RepoRow[]> {
  const h = normalizeHost(options.host);
  const lc = options.lang.trim().toLowerCase();
  const subject = options.subject ?? DEFAULT_SCRIPTURE_REPO_SUBJECT;
  const key = reposCacheKey(h, lc, options.uid, subject);

  const fresh = reposByKey.get(key);
  if (isFresh(fresh)) return Promise.resolve(fresh!.data);

  const pending = reposInflight.get(key);
  if (pending) return pending;

  const work = searchReposForScriptureLanguage(options)
    .then((rows) => {
      reposByKey.set(key, { storedAt: Date.now(), data: rows });
      return rows;
    })
    .finally(() => {
      reposInflight.delete(key);
    });

  reposInflight.set(key, work);
  return work;
}

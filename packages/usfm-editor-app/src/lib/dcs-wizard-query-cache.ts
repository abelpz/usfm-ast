/**
 * Short-lived in-memory cache for wizard steps (translate + open-from-DCS).
 * Avoids duplicate network calls when the user goes Back and returns within a few minutes.
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

// --- Catalog published sources (translate “edition” step) ---

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

// --- Repo search (open-from-DCS “repository” step) ---

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

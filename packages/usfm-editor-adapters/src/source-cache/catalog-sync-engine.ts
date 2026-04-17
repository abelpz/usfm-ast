/**
 * CatalogSyncEngine — orchestrates downloading full DCS catalog repos
 * (ULT, UST, TN, TW, TA, …) for a given language and storing them in a
 * `SourceCacheStorage` for fully offline use.
 *
 * Call `downloadLanguage()` to fetch all resources for a language tag.
 * Progress is reported through an optional `onProgress` callback.
 */
import type { CachedSourceFile, CachedSourceRepo, SourceCacheStorage } from '@usfm-tools/types';

/** Catalog subjects to include in a language bundle by default. */
export const DEFAULT_CATALOG_SUBJECTS = [
  'Aligned Bible',
  'Bible',
  'Greek New Testament',
  'Hebrew Old Testament',
  // TSV variants are the published format for TN and TWL in modern catalogs.
  'TSV Translation Notes',
  'TSV Translation Words Links',
  // Legacy / non-TSV subjects kept for older catalog entries.
  'Translation Notes',
  'Translation Words Links',
  'Translation Words',
  'Translation Academy',
] as const;

export interface CatalogIngredient {
  path: string;
  identifier: string;
}

export interface CatalogEntryInfo {
  repoId: string;
  owner: string;
  repoName: string;
  langCode: string;
  subject: string;
  releaseTag: string;
  ingredients: CatalogIngredient[];
}

export interface DownloadProgress {
  repoId: string;
  releaseTag: string;
  /** How many files have been stored so far in this repo. */
  filesCompleted: number;
  /** Total files expected for this repo (0 if not yet known). */
  filesTotal: number;
  /** Total bytes downloaded so far across all repos in this session. */
  totalBytesDownloaded: number;
  /** Human-readable status message. */
  message: string;
}

export interface CatalogSyncEngineOptions {
  /** DCS host, e.g. `"git.door43.org"`. Defaults to `"git.door43.org"`. */
  host?: string;
  /** Optional Bearer token for authenticated requests. */
  token?: string;
  /**
   * Catalog subjects to include. Defaults to `DEFAULT_CATALOG_SUBJECTS`.
   */
  subjects?: readonly string[];
  /**
   * Catalog topic filter (default: `"tc-ready"`).
   */
  topic?: string;
  /**
   * Injectable `fetch` function — use the `PlatformAdapter.httpFetch` so
   * offline queuing and proxy behaviour is respected.
   */
  httpFetch?: typeof fetch;
  /**
   * Progress callback. Called after each file is stored.
   */
  onProgress?: (progress: DownloadProgress) => void;
}

function catalogApiBase(host: string): string {
  const h = host.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  return `https://${h}/api/v1`;
}

function authHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/json' };
  if (token) h.Authorization = `token ${token}`;
  return h;
}

type JsonRecord = Record<string, unknown>;

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function decodeBase64Content(b64: string): string {
  const clean = b64.replace(/\s/g, '');
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(clean, 'base64').toString('utf8');
  }
  return decodeURIComponent(
    atob(clean)
      .split('')
      .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join(''),
  );
}

async function fetchJson<T>(
  url: string,
  headers: Record<string, string>,
  httpFetch: typeof fetch,
): Promise<T | null> {
  try {
    const res = await httpFetch(url, { headers });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export class CatalogSyncEngine {
  private readonly host: string;
  private readonly token: string | undefined;
  private readonly subjects: readonly string[];
  private readonly topic: string;
  private readonly httpFetch: typeof fetch;
  private readonly onProgress: ((p: DownloadProgress) => void) | undefined;

  constructor(
    private readonly cacheStorage: SourceCacheStorage,
    opts: CatalogSyncEngineOptions = {},
  ) {
    this.host = opts.host ?? 'git.door43.org';
    this.token = opts.token;
    this.subjects = opts.subjects ?? DEFAULT_CATALOG_SUBJECTS;
    this.topic = opts.topic ?? 'tc-ready';
    this.httpFetch = opts.httpFetch ?? globalThis.fetch.bind(globalThis);
    this.onProgress = opts.onProgress;
  }

  /** List all catalog entries for a given language from the DCS catalog API. */
  async listCatalogEntries(langCode: string): Promise<CatalogEntryInfo[]> {
    const base = catalogApiBase(this.host);
    const headers = authHeaders(this.token);
    const entries: CatalogEntryInfo[] = [];

    for (const subject of this.subjects) {
      let page = 1;
      let keepPaging = true;
      while (keepPaging) {
        // Original-language subjects are often not tagged tc-ready; omit topic (see tc-study).
        const topicQs =
          subject === 'Greek New Testament' || subject === 'Hebrew Old Testament'
            ? ''
            : `&topic=${encodeURIComponent(this.topic)}`;
        const url =
          `${base}/catalog/search?lang=${encodeURIComponent(langCode)}` +
          `&subject=${encodeURIComponent(subject)}` +
          topicQs +
          `&page=${page}&limit=50`;

        const data = await fetchJson<JsonRecord>(url, headers, this.httpFetch);
        if (!data) { keepPaging = false; break; }

        const results = data.data;
        if (!Array.isArray(results) || results.length === 0) { keepPaging = false; break; }

        for (const raw of results) {
          if (!isRecord(raw)) continue;
          const fullName =
            typeof raw.full_name === 'string' ? raw.full_name.trim() : '';
          if (!fullName.includes('/')) continue;
          const slash = fullName.indexOf('/');
          const owner = fullName.slice(0, slash);
          const repoName = fullName.slice(slash + 1);

          const rel = raw.release;
          let tagName = '';
          if (isRecord(rel) && typeof rel.tag_name === 'string') {
            tagName = rel.tag_name.trim();
          }
          if (!tagName && typeof raw.branch_or_tag_name === 'string') {
            tagName = (raw.branch_or_tag_name as string).trim();
          }
          if (!tagName) continue;

          const lang =
            typeof raw.language === 'string' ? raw.language.trim() : langCode;
          const sub =
            typeof raw.subject === 'string' ? raw.subject.trim() : subject;

          const ingredients = this.parseIngredients(raw);

          entries.push({
            repoId: fullName,
            owner,
            repoName,
            langCode: lang,
            subject: sub,
            releaseTag: tagName,
            ingredients,
          });
        }

        const meta = data.metadata ?? data.meta;
        const total =
          isRecord(meta) && typeof meta.total_count === 'number'
            ? meta.total_count
            : results.length;
        if (results.length < 50 || entries.length >= total) { keepPaging = false; break; }
        page++;
      }
    }

    return entries;
  }

  /**
   * Download and cache all source repos for a language.
   *
   * @param langCode BCP 47 language code, e.g. `"en"`, `"es-419"`.
   * @param options.skipIfCached When `true` (default), skip repos that are
   *   already cached at the same release tag.
   * @param options.signal Optional `AbortSignal` to cancel the download.
   */
  async downloadLanguage(
    langCode: string,
    options: { skipIfCached?: boolean; signal?: AbortSignal } = {},
  ): Promise<void> {
    const { skipIfCached = true, signal } = options;
    const entries = await this.listCatalogEntries(langCode);
    let totalBytes = 0;

    for (const entry of entries) {
      if (signal?.aborted) break;

      if (skipIfCached) {
        const existing = await this.cacheStorage.getCachedRepo(
          entry.repoId,
          entry.releaseTag,
        );
        if (existing) {
          this.onProgress?.({
            repoId: entry.repoId,
            releaseTag: entry.releaseTag,
            filesCompleted: existing.fileCount,
            filesTotal: existing.fileCount,
            totalBytesDownloaded: totalBytes,
            message: `Skipped (already cached): ${entry.repoId} ${entry.releaseTag}`,
          });
          continue;
        }
      }

      totalBytes = await this.downloadRepo(entry, totalBytes, signal);
    }
  }

  /**
   * Download a single repo snapshot. Returns updated `totalBytesDownloaded`.
   */
  async downloadRepo(
    entry: CatalogEntryInfo,
    initialBytes = 0,
    signal?: AbortSignal,
  ): Promise<number> {
    const base = catalogApiBase(this.host);
    const headers = authHeaders(this.token);
    const files: CachedSourceFile[] = [];
    let totalBytes = initialBytes;
    const filesTotal = entry.ingredients.length;

    this.onProgress?.({
      repoId: entry.repoId,
      releaseTag: entry.releaseTag,
      filesCompleted: 0,
      filesTotal,
      totalBytesDownloaded: totalBytes,
      message: `Downloading ${entry.repoId} ${entry.releaseTag}…`,
    });

    for (const ing of entry.ingredients) {
      if (signal?.aborted) break;

      const pathSeg = ing.path
        .replace(/^\.\//, '')
        .split('/')
        .map(encodeURIComponent)
        .join('/');

      const url =
        `${base}/repos/${encodeURIComponent(entry.owner)}/` +
        `${encodeURIComponent(entry.repoName)}/contents/${pathSeg}` +
        `?ref=${encodeURIComponent(entry.releaseTag)}`;

      const data = await fetchJson<JsonRecord>(url, headers, this.httpFetch);
      if (!data || typeof data.content !== 'string') continue;

      const content = decodeBase64Content(data.content as string);
      totalBytes += content.length;

      files.push({
        repoId: entry.repoId,
        releaseTag: entry.releaseTag,
        path: ing.path.replace(/^\.\//, ''),
        content,
      });

      this.onProgress?.({
        repoId: entry.repoId,
        releaseTag: entry.releaseTag,
        filesCompleted: files.length,
        filesTotal,
        totalBytesDownloaded: totalBytes,
        message: `Downloaded ${files.length}/${filesTotal}: ${ing.path}`,
      });
    }

    const repo: CachedSourceRepo = {
      repoId: entry.repoId,
      langCode: entry.langCode,
      subject: entry.subject,
      releaseTag: entry.releaseTag,
      downloadedAt: new Date().toISOString(),
      sizeBytes: totalBytes - initialBytes,
      fileCount: files.length,
    };

    await this.cacheStorage.putCachedRepo(repo, files);

    this.onProgress?.({
      repoId: entry.repoId,
      releaseTag: entry.releaseTag,
      filesCompleted: files.length,
      filesTotal,
      totalBytesDownloaded: totalBytes,
      message: `Cached ${entry.repoId} ${entry.releaseTag} (${files.length} files)`,
    });

    return totalBytes;
  }

  /**
   * Check DCS for newer releases of all pinned repos.
   * Returns a map of repoId → latest release tag on DCS.
   */
  async checkForUpdates(
    repoIds: string[],
  ): Promise<Map<string, string>> {
    const base = catalogApiBase(this.host);
    const headers = authHeaders(this.token);
    const latestTags = new Map<string, string>();

    for (const repoId of repoIds) {
      const [owner, repoName] = repoId.split('/');
      if (!owner || !repoName) continue;

      const url = `${base}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/releases?limit=1`;
      const data = await fetchJson<unknown[]>(url, headers, this.httpFetch);
      if (!data || !Array.isArray(data) || data.length === 0) continue;

      const release = data[0];
      if (!isRecord(release)) continue;
      const tag = release.tag_name;
      if (typeof tag === 'string' && tag.trim()) {
        latestTags.set(repoId, tag.trim());
      }
    }

    return latestTags;
  }

  private parseIngredients(raw: JsonRecord): CatalogIngredient[] {
    const ingredientsRaw = raw.ingredients;
    const out: CatalogIngredient[] = [];

    if (Array.isArray(ingredientsRaw)) {
      for (const ing of ingredientsRaw) {
        if (!isRecord(ing)) continue;
        const path = typeof ing.path === 'string' ? ing.path.trim() : '';
        if (!path) continue;
        const identifier =
          typeof ing.identifier === 'string' ? ing.identifier.trim() : path;
        out.push({ path, identifier });
      }
    } else if (isRecord(ingredientsRaw)) {
      for (const [pathKey, ing] of Object.entries(ingredientsRaw)) {
        if (!isRecord(ing)) continue;
        const path = pathKey.trim().replace(/^\.\//, '');
        if (!path) continue;
        const identifier =
          typeof ing.identifier === 'string' ? ing.identifier.trim() : path;
        out.push({ path, identifier });
      }
    }

    return out;
  }
}

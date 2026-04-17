/**
 * `CacheFirstSourceTextProvider` — three-tier read path.
 *
 * 1. Processed cache (Layer 2): pre-parsed `UsjDocument`, instant.
 * 2. Raw storage (Layer 1):     raw USFM content → parse → write to Layer 2.
 * 3. Network (DCS API):         fetch → write to Layer 1 → parse → write to Layer 2.
 *
 * On a network hit the caller can optionally provide a `onNetworkFetch` callback
 * so the app can enqueue a full-language background download.
 */
import type { SourceTextProvider, UsjDocument } from '@usfm-tools/editor-core';
import type { ProcessedCacheStorage, RepoId, SourceCacheStorage } from '@usfm-tools/types';
import { PROCESSED_CACHE_VERSION } from './constants';
import { pinProjectToLatestCachedRelease } from './version-pinning';

export interface CacheFirstSourceTextProviderOptions {
  /** Layer 1 — raw repo file storage. */
  rawStorage: SourceCacheStorage;
  /** Layer 2 — processed/parsed data cache. */
  processedCache: ProcessedCacheStorage;

  /** Identifies which cached snapshot to look up in raw storage. */
  repoId: RepoId;
  releaseTag: string;
  /** Relative ingredient path within the repo, e.g. `"01-GEN.usfm"`. */
  ingredientPath: string;

  /** BCP 47 language code — surfaced on the provider's `langCode` property. */
  langCode: string;
  /** Three-letter book code (e.g. `"GEN"`). Used for processed cache metadata. */
  bookCode?: string;
  /** Catalog subject (e.g. `"Aligned Bible"`). Used for processed cache metadata. */
  subject?: string;
  /** Human-readable label shown in the UI. */
  displayName: string;
  /** Block text direction when known (Door43 `ld` / manifest). */
  direction?: 'ltr' | 'rtl';
  /**
   * Parser schema version. If the processed cache entry's version does not
   * match, the raw content is re-parsed and the cache is updated.
   */
  parserVersion?: string;

  // ── DCS network fallback ──────────────────────────────────────────────────
  /** DCS host URL, e.g. `"https://git.door43.org"`. Required for network fallback. */
  baseUrl?: string;
  /** Repo owner (e.g. `"unfoldingWord"`). Required for network fallback. */
  owner?: string;
  /** Repo name (e.g. `"en_ult"`). Required for network fallback. */
  repo?: string;
  /** Git ref (branch or tag). Defaults to `releaseTag`. */
  ref?: string;
  /** Optional auth token for private repos. */
  token?: string;

  /**
   * Called when the file was fetched from the network (Layer 3 hit).
   * Use this to enqueue a background full-language download so subsequent
   * loads come from cache.
   */
  onNetworkFetch?: (repoId: RepoId, langCode: string) => void;

  /**
   * When provided, automatically create a version pin on the first successful
   * cache hit. Enables update tracking for this project.
   */
  projectId?: string;
}

function decodeBase64Utf8(b64: string): string {
  const cleaned = b64.replace(/\s/g, '');
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(cleaned, 'base64').toString('utf8');
  }
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

async function parseUsfmToUsj(content: string): Promise<UsjDocument> {
  const { DocumentStore } = await import('@usfm-tools/editor-core');
  const store = new DocumentStore({ silentConsole: true });
  store.loadUSFM(content);
  return store.getFullUSJ();
}

function bookCodeFromPath(path: string): string | null {
  // Common DCS ingredient naming patterns:
  //   01-GEN.usfm, 42-LUK.usfm, en_tn_01-GEN.tsv, …
  const m = path.match(/[_-]([A-Z0-9]{2,3})\.(usfm|sfm|tsv|md)$/i);
  return m ? m[1]!.toUpperCase() : null;
}

export class CacheFirstSourceTextProvider implements SourceTextProvider {
  readonly id: string;
  readonly displayName: string;
  readonly langCode: string;
  readonly direction?: 'ltr' | 'rtl';

  private readonly opts: CacheFirstSourceTextProviderOptions;

  constructor(opts: CacheFirstSourceTextProviderOptions) {
    this.opts = opts;
    this.id = `cache-first:${opts.repoId}@${opts.releaseTag}:${opts.ingredientPath}`;
    this.displayName = opts.displayName;
    this.langCode = opts.langCode;
    if (opts.direction) this.direction = opts.direction;
  }

  async load(): Promise<UsjDocument> {
    const {
      rawStorage,
      processedCache,
      repoId,
      releaseTag,
      ingredientPath,
      langCode,
      bookCode,
      subject = '',
      parserVersion = PROCESSED_CACHE_VERSION,
      onNetworkFetch,
      projectId,
    } = this.opts;

    const resolvedBookCode = bookCode ?? bookCodeFromPath(ingredientPath);

    // ── Layer 2: processed cache ─────────────────────────────────────────────
    try {
      const processed = await processedCache.get(
        repoId,
        releaseTag,
        ingredientPath,
        'usj',
        parserVersion,
      );
      if (processed) {
        // Auto-pin project to this cached release (fire-and-forget).
        if (projectId) {
          void pinProjectToLatestCachedRelease(rawStorage, projectId, repoId).catch(() => {
            // Non-critical: pin will be created on next successful read.
          });
        }
        return JSON.parse(processed.data) as UsjDocument;
      }
    } catch {
      // Non-critical: fall through to Layer 1
    }

    // ── Layer 1: raw storage ─────────────────────────────────────────────────
    try {
      const rawFile = await rawStorage.getCachedFile(repoId, releaseTag, ingredientPath);
      if (rawFile) {
        const usj = await parseUsfmToUsj(rawFile.content);
        // Write-through to processed cache (fire-and-forget).
        void this.writeProcessedCache(
          processedCache,
          repoId,
          releaseTag,
          ingredientPath,
          usj,
          langCode,
          resolvedBookCode,
          subject,
          parserVersion,
        );
        // Auto-pin project to this cached release (fire-and-forget).
        if (projectId) {
          void pinProjectToLatestCachedRelease(rawStorage, projectId, repoId).catch(() => {});
        }
        return usj;
      }
    } catch {
      // Non-critical: fall through to Layer 3
    }

    // ── Layer 3: network ─────────────────────────────────────────────────────
    const content = await this.fetchFromNetwork();
    const usj = await parseUsfmToUsj(content);

    // Write-through: raw storage + processed cache (fire-and-forget).
    void this.writeRawAndProcessed(
      rawStorage,
      processedCache,
      repoId,
      releaseTag,
      ingredientPath,
      content,
      usj,
      langCode,
      resolvedBookCode,
      subject,
      parserVersion,
    );

    // Notify caller so it can enqueue a full-language background download.
    onNetworkFetch?.(repoId, langCode);

    return usj;
  }

  private async fetchFromNetwork(): Promise<string> {
    const { baseUrl, owner, repo, ingredientPath, releaseTag, ref, token } = this.opts;

    if (!baseUrl || !owner || !repo) {
      throw new Error(
        `CacheFirstSourceTextProvider: file not in cache and no DCS credentials provided ` +
          `(repoId=${this.opts.repoId}, path=${ingredientPath}). ` +
          `Provide baseUrl/owner/repo for network fallback.`,
      );
    }

    const gitRef = ref ?? releaseTag;
    const path = ingredientPath
      .replace(/^\.\//, '')
      .split('/')
      .map((seg) => encodeURIComponent(seg))
      .join('/');

    const url =
      `${baseUrl.replace(/\/$/, '')}/api/v1/repos/` +
      `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}` +
      `?ref=${encodeURIComponent(gitRef)}`;

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers['Authorization'] = `token ${token}`;

    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      throw new Error(
        `CacheFirstSourceTextProvider: DCS fetch failed ${resp.status} ${resp.statusText}`,
      );
    }

    interface GiteaContents { content?: string }
    const json = (await resp.json()) as GiteaContents;
    return decodeBase64Utf8(json.content ?? '');
  }

  private async writeProcessedCache(
    cache: ProcessedCacheStorage,
    repoId: RepoId,
    releaseTag: string,
    path: string,
    usj: UsjDocument,
    langCode: string,
    bookCode: string | null,
    subject: string,
    parserVersion: string,
  ): Promise<void> {
    try {
      await cache.put({
        repoId,
        releaseTag,
        path,
        cacheType: 'usj',
        langCode,
        bookCode,
        subject,
        data: JSON.stringify(usj),
        parserVersion,
        builtAt: new Date().toISOString(),
      });
    } catch {
      // Non-critical: next load will re-parse from raw storage.
    }
  }

  private async writeRawAndProcessed(
    _rawStorage: SourceCacheStorage,
    processedCache: ProcessedCacheStorage,
    repoId: RepoId,
    releaseTag: string,
    path: string,
    _content: string,
    usj: UsjDocument,
    langCode: string,
    bookCode: string | null,
    subject: string,
    parserVersion: string,
  ): Promise<void> {
    // Raw storage holds only raw content — no USJ stored there.
    // The background download scheduler will fill raw storage via zipball.
    // Write the parsed result directly to processed cache (Layer 2).
    await this.writeProcessedCache(
      processedCache,
      repoId,
      releaseTag,
      path,
      usj,
      langCode,
      bookCode,
      subject,
      parserVersion,
    );
  }
}

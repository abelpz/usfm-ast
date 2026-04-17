/**
 * Offline source-cache contracts.
 *
 * A "source repo" is any DCS catalog resource (ULT, UST, TN, TW, TA, …) that
 * can be pre-downloaded so translators can work without internet access.
 * Each downloaded snapshot is identified by (repoId, releaseTag) and kept
 * indefinitely until no project pins it and GC removes it.
 *
 * Two-layer design:
 *   Layer 1 – Raw Storage   (`SourceCacheStorage`): raw file content only, durable.
 *             No parsed data — USJ and index data live exclusively in Layer 2.
 *   Layer 2 – Processed Cache (`ProcessedCacheStorage`): parsed USJ / indexed
 *             helps data, derivable from Layer 1, can be evicted and rebuilt.
 */

/** Identifies a catalog repo.  Format: `{owner}/{repoName}` */
export type RepoId = string;

/** A downloaded snapshot of a DCS catalog repo at a specific release. */
export interface CachedSourceRepo {
  /** e.g. `"unfoldingWord/en_ult"` */
  repoId: RepoId;
  /** BCP 47 language code (e.g. `"en"`, `"es-419"`). */
  langCode: string;
  /** Catalog subject (e.g. `"Aligned Bible"`, `"Translation Notes"`). */
  subject: string;
  /** Release tag this cache was built from (e.g. `"v87"`). */
  releaseTag: string;
  /** ISO 8601 — when the download completed. */
  downloadedAt: string;
  /** Total compressed size in bytes (informational for UI). */
  sizeBytes: number;
  /** Number of files stored for this snapshot. */
  fileCount: number;
}

/** A single file within a cached source repo snapshot. */
export interface CachedSourceFile {
  repoId: RepoId;
  releaseTag: string;
  /** Relative path within the repo, e.g. `"01-GEN.usfm"` or `"en_tn_57-TIT.tsv"`. */
  path: string;
  /** Raw USFM/TSV/Markdown content (source of truth). */
  content: string;
}

/**
 * A project's pin to a specific cached source repo release.
 * Pinning ensures a project always loads the same source version even after
 * newer releases are downloaded — preventing mid-project source changes.
 */
export interface ProjectSourcePin {
  projectId: string;
  repoId: RepoId;
  /** The release tag this project is pinned to. */
  pinnedTag: string;
  /**
   * A newer release tag available in the cache (or on the server).
   * `null` when the pinned tag is the latest known.
   * Non-null signals the user that an upgrade is available.
   */
  availableTag: string | null;
}

// ─── Background Download Queue ────────────────────────────────────────────────

/** Discriminates between the two kinds of background download jobs. */
export type DownloadJobKind = 'source' | 'project';

export type DownloadJobStatus =
  | 'queued'
  | 'downloading'
  | 'extracting'
  | 'hydrating'
  | 'done'
  | 'error';

/**
 * A single background download job.
 * `kind: 'source'` — catalog reference resource (ULT, UST, TN, …).
 * `kind: 'project'` — user's own translator project repo.
 */
export interface DownloadJob {
  id: string;
  kind: DownloadJobKind;
  /** BCP 47 language code (source resources) or project language (project). */
  langCode: string;
  /** `{owner}/{repoName}` */
  repoId: string;
  /** Catalog release tag (source) or git ref/branch (project). */
  releaseTag: string;
  /**
   * Pre-signed URL to the zip archive.
   * `null` when the zip URL must be constructed at download time (project downloads)
   * or when the catalog entry has no published release.
   */
  zipballUrl: string | null;
  /** Catalog subject or `"project"` for translator repos. */
  subject: string;
  /** Lower number = higher priority. */
  priority: number;
  status: DownloadJobStatus;
  bytesDownloaded: number;
  retryCount: number;
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601 — last status update. */
  updatedAt: string;
}

/**
 * Persistent queue for background download jobs.
 * Web: IndexedDB (`usfm-download-queue-v1`).
 * Tauri: filesystem JSON file.
 */
export interface DownloadQueue {
  /**
   * Enqueue background download of all source/reference repos for a language.
   * Deduplicates: if jobs for `(langCode, repoId, releaseTag)` already exist,
   * they are not duplicated.
   */
  enqueueSource(langCode: string, options?: { priorityRepoId?: string; host?: string; token?: string }): Promise<void>;

  /**
   * Enqueue background download of a project repo via archive endpoint.
   * `GET /repos/{owner}/{repo}/archive/{ref}.zip`
   */
  enqueueProject(owner: string, repo: string, ref: string, host?: string): Promise<void>;

  /** Return the highest-priority pending job without removing it. */
  peek(): Promise<DownloadJob | null>;

  /** Update status fields on an existing job. */
  updateJob(id: string, patch: Partial<Pick<DownloadJob, 'status' | 'bytesDownloaded' | 'retryCount'>>): Promise<void>;

  /** Remove a completed or permanently failed job. */
  dequeue(id: string): Promise<void>;

  /** List all jobs that are not `done`. */
  listPending(): Promise<DownloadJob[]>;

  /** List all jobs for a specific language code. */
  listByLanguage(langCode: string): Promise<DownloadJob[]>;

  /** Clear all jobs (e.g. on user-initiated cancel). */
  clear(): Promise<void>;
}

// ─── Layer 2: Processed Cache ─────────────────────────────────────────────────

/**
 * A single entry in the processed cache (parsed / indexed data built from raw
 * storage). Always derivable from `SourceCacheStorage` — safe to evict.
 */
export interface ProcessedCacheEntry {
  repoId: RepoId;
  releaseTag: string;
  /** Relative ingredient path within the repo, e.g. `"01-GEN.usfm"`. */
  path: string;
  /**
   * Discriminator for the type of processed data stored.
   * `'usj'` — JSON-serialised `UsjDocument`.
   * `'tn-index'` / `'twl-index'` / `'tw-articles'` / `'ta-articles'` — future.
   */
  cacheType: 'usj' | 'tn-index' | 'twl-index' | 'tw-articles' | 'ta-articles';
  langCode: string;
  /** Three-letter book code (`"GEN"`, `"LUK"`, …), or `null` for non-book resources. */
  bookCode: string | null;
  subject: string;
  /** `JSON.stringify`-ed processed data (USJ object, index map, …). */
  data: string;
  /** Parser/schema version used to build this entry. Used for invalidation. */
  parserVersion: string;
  /** ISO 8601 timestamp of when this entry was written. */
  builtAt: string;
}

/**
 * Pluggable storage for the processed (Layer 2) cache.
 * Web: IndexedDB (`usfm-processed-cache-v1`).
 * Native (Tauri): filesystem under `usfm-editor/processed-cache/`.
 *
 * All methods are safe to call concurrently; implementations must be
 * internally serialised where required.
 */
export interface ProcessedCacheStorage {
  /**
   * Retrieve a processed entry by its exact identity triple.
   * Returns `null` when the entry does not exist or the `parserVersion` is
   * different from `currentParserVersion` (stale entries are treated as
   * misses so callers always get valid data or `null`).
   */
  get(
    repoId: RepoId,
    releaseTag: string,
    path: string,
    cacheType: ProcessedCacheEntry['cacheType'],
    currentParserVersion: string,
  ): Promise<ProcessedCacheEntry | null>;

  /** Persist or replace a processed entry. */
  put(entry: ProcessedCacheEntry): Promise<void>;

  /**
   * Delete all entries whose `parserVersion` does not match `currentVersion`.
   * Returns the number of entries removed.
   */
  invalidateByParserVersion(currentVersion: string): Promise<number>;

  /** Delete all entries for a given `(repoId, releaseTag)` snapshot. */
  invalidateRepo(repoId: RepoId, releaseTag: string): Promise<void>;

  /** Estimate the total size of all stored entries in bytes. */
  estimateSize(): Promise<number>;

  /**
   * Evict the least-recently-written entries until the estimated size is
   * below `targetBytes`. Returns the number of entries removed.
   * Used to stay within browser storage quotas.
   */
  evictLRU(targetBytes: number): Promise<number>;

  /** Delete all entries (full clear). */
  clear(): Promise<void>;
}

// ─── Layer 1: Raw Storage ─────────────────────────────────────────────────────

/**
 * Pluggable storage interface for the offline source cache.
 * Web: IndexedDB. Native (Tauri/Capacitor): SQLite.
 */
export interface SourceCacheStorage {
  // ── Repo snapshots ───────────────────────────────────────────────────────

  /**
   * Return the distinct language codes of all downloaded snapshots.
   * Cheaper than `listCachedRepos()` when you only need to know which languages
   * are available (e.g. populating the offline language picker).
   */
  listLanguages(): Promise<string[]>;

  /** List all downloaded snapshots, optionally filtered by language. */
  listCachedRepos(langCode?: string): Promise<CachedSourceRepo[]>;

  /** Get a specific snapshot's metadata. */
  getCachedRepo(repoId: RepoId, releaseTag: string): Promise<CachedSourceRepo | null>;

  /**
   * Persist a repo snapshot with all its files in a single transaction.
   * If the (repoId, releaseTag) already exists it is replaced.
   */
  putCachedRepo(repo: CachedSourceRepo, files: CachedSourceFile[]): Promise<void>;

  /** Delete a specific repo snapshot and all its files. */
  deleteCachedRepo(repoId: RepoId, releaseTag: string): Promise<void>;

  // ── Files ────────────────────────────────────────────────────────────────

  /** Get a single cached file. Returns `null` if not found. */
  getCachedFile(repoId: RepoId, releaseTag: string, path: string): Promise<CachedSourceFile | null>;

  /** List all paths for a given (repoId, releaseTag) snapshot. */
  listCachedFiles(repoId: RepoId, releaseTag: string): Promise<string[]>;

  // ── Version pins ─────────────────────────────────────────────────────────

  /** Get a project's pin to a specific source repo. */
  getPin(projectId: string, repoId: RepoId): Promise<ProjectSourcePin | null>;

  /** List all pins for a project. */
  listPins(projectId: string): Promise<ProjectSourcePin[]>;

  /**
   * List every pin across all projects.
   * Used by `UpdateChecker` to scan for repos with available upgrades.
   */
  listAllPins(): Promise<ProjectSourcePin[]>;

  /** Create or update a pin. */
  setPin(pin: ProjectSourcePin): Promise<void>;

  /** Remove a pin (e.g. when a source is removed from a project). */
  removePin(projectId: string, repoId: RepoId): Promise<void>;

  /**
   * Return all repoId+releaseTag pairs still referenced by at least one pin.
   * Used by GC to decide which snapshots are safe to delete.
   */
  getReferencedSnapshots(): Promise<Array<{ repoId: RepoId; releaseTag: string }>>;

  /**
   * Delete all snapshots that have no active project pins.
   * Returns the number of snapshots removed.
   */
  garbageCollect(): Promise<number>;
}

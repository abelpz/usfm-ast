/**
 * Remote sync contracts for local translation projects (DCS REST, isomorphic-git, …).
 */

/** Remote file metadata (e.g. from git tree API). */
export interface RemoteFileEntry {
  path: string;
  sha: string;
  size: number;
}

/** Result of pushing local files to a remote repository. */
export interface ProjectPushResult {
  filesCreated: number;
  filesUpdated: number;
  filesDeleted: number;
  /** Last commit SHA from the remote when reported by the API (Contents PUT). */
  commitSha?: string;
  /**
   * Post-push remote file index (blob entries).
   * Populated by implementations that track state during push to avoid an extra
   * `getRemoteFileIndex()` round-trip after the push completes.
   */
  syncedFiles?: RemoteFileEntry[];
}

/** Push failed: remote blob SHA changed since we read it (CAS / optimistic lock). */
export type ProjectPushStaleResult = {
  kind: 'stale';
  /** Local path key → remote blob SHA we observed when stale was detected. */
  staleByPath: Record<string, string>;
};

export type ProjectPushOutcome = ProjectPushResult | ProjectPushStaleResult;

export function isProjectPushStale(
  r: ProjectPushOutcome,
): r is ProjectPushStaleResult {
  return (r as ProjectPushStaleResult).kind === 'stale';
}

/** Options for {@link ProjectSyncAdapter.pushFiles}. */
export type PushFilesOptions = {
  /**
   * Remote paths we have previously synced; used to decide safe deletes of remote-only files.
   */
  previouslySyncedPaths?: ReadonlySet<string>;
  /**
   * Expected remote blob SHA per **local** path key (CAS). When set for an update, a mismatch
   * yields {@link ProjectPushStaleResult} instead of silently overwriting.
   */
  expectedBaseShaByPath?: Record<string, string>;
};

/**
 * Pluggable sync transport for a project ↔ remote Git host.
 * Implementations may use Gitea Contents API, isomorphic-git, etc.
 */
export interface ProjectSyncAdapter {
  /** Ensure the remote repository exists; create if missing (when permitted). */
  ensureRemoteRepo(): Promise<{ owner: string; repo: string; created: boolean }>;

  /** List tracked files on the remote (blobs only). */
  getRemoteFileIndex(): Promise<RemoteFileEntry[]>;

  /**
   * Push local UTF-8 text files to the remote, creating or updating as needed.
   * Returns counts and, when available, the post-push remote file index via `syncedFiles`
   * so callers can persist blob SHAs without an extra `getRemoteFileIndex()` round-trip.
   *
   * When `options.previouslySyncedPaths` is set, remote files are only **deleted** if their path
   * (local key, stripping `content/`) was in that set — preserving README, `.github/`, etc.
   * that were never uploaded by this client. When omitted, behavior matches legacy: delete
   * any remote text file not covered by the local map.
   *
   * When `options.expectedBaseShaByPath` is set for an existing remote file, the push fails with
   * `{ kind: 'stale', staleByPath }` if the live remote blob SHA differs (no silent overwrite).
   */
  pushFiles(
    localFiles: Map<string, string>,
    message: string,
    options?: PushFilesOptions,
  ): Promise<ProjectPushOutcome>;

  /** Pull all text files from the remote into a path → content map. */
  pullFiles(): Promise<Map<string, string>>;
}

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
   */
  pushFiles(
    localFiles: Map<string, string>,
    message: string,
  ): Promise<ProjectPushResult>;

  /** Pull all text files from the remote into a path → content map. */
  pullFiles(): Promise<Map<string, string>>;
}

/**
 * Local translation project storage contracts.
 * Implementations live in host packages (e.g. IndexedDB in @usfm-tools/editor-adapters).
 */

/** DCS (or other Gitea host) linkage for syncing a local project. */
export interface ProjectSyncConfig {
  host: string;
  /** Organization login or personal username that owns the repo. */
  owner: string;
  /** Repository name, typically `{language}_{id}` lowercased. */
  repo: string;
  branch: string;
  targetType: 'user' | 'org';
}

/**
 * Pending merge conflict for a project file (persisted in IndexedDB so the dialog can resume).
 * Text snapshots are raw USFM / JSON / YAML as applicable — not USJ.
 */
export interface FileConflict {
  /** Stable id for UI resume (e.g. `${path}#${chapterIndices.join(',')}` or random UUID). */
  conflictId: string;
  /** Repo-relative path (local key, no `content/` prefix). */
  path: string;
  /** Chapters in conflict (USFM); empty for non-chapter files. */
  chapterIndices: number[];
  baseText: string;
  oursText: string;
  theirsText: string;
}

/**
 * Sidecar JSON at `.sync/<BOOK>.json` (repo-relative). Anchors three-way merge and bundle import.
 * Not embedded in USFM — survives round-trips without parser loss.
 */
export interface ProjectDocSyncSidecar {
  schema: 1;
  docId: string;
  /** Last Tier-2 (book branch) commit this document was merged with. */
  baseCommit?: string;
  /** Git blob SHA of the USFM at `baseCommit` (optional, for CAS debugging). */
  baseBlobSha?: string;
  vectorClock?: Record<string, number>;
  journalId?: string;
  savedAt: string;
}

/** Metadata for a locally-stored translation project. */
export interface ProjectMeta {
  /** User-chosen 3-8 letter uppercase ID (e.g. "RVR"). */
  id: string;
  /** Human-readable name (e.g. "Reina Valera"). */
  name: string;
  /** BCP-47 language tag (e.g. "es", "es-419"). */
  language: string;
  format: 'resource-container';
  /** ISO 8601 */
  created: string;
  /** ISO 8601 — bumped on any file write */
  updated: string;
  /** When set, project files may sync to this Door43 repo. */
  syncConfig?: ProjectSyncConfig;
  /** ISO 8601 — last successful push of project files to remote. */
  lastRemoteSyncAt?: string;
  /**
   * Whether auto-sync is enabled for this project.
   * Defaults to `true`; when `false` the user must trigger sync manually.
   */
  autoSync?: boolean;
  /**
   * ISO 8601 — set when a push attempt fails so the next reconnect can retry.
   * Cleared on the next successful push.
   */
  pendingSyncAt?: string;
  /**
   * BCP-47 code of the user's preferred source/reference language for this project (e.g. "en").
   * Drives catalog scripture auto-load and translation-helps discovery in the reference panel.
   */
  sourceRefLanguage?: string;
  /**
   * Last known remote commit SHA per branch ref (e.g. `{ tit: "abc…", main: "def…" }`).
   * Used to detect when Tier-2 moved and to fetch a consistent `base` snapshot for 3-way merge.
   */
  lastRemoteCommit?: Record<string, string>;
  /** Unresolved sync merge conflicts (cleared after user resolution + successful push). */
  pendingConflicts?: FileConflict[];
}

/** A versioned snapshot release of a project. */
export interface ProjectRelease {
  /** Matches /^v\d+(\.\d+){0,2}$/ e.g. "v1.0.0" */
  version: string;
  /** Optional 2-4 char publishing label, e.g. "1960" */
  versionLabel?: string;
  /** e.g. "Biblia Reina Valera" */
  title?: string;
  /** ISO 8601 */
  created: string;
  /** Uppercase USFM book codes included in this release */
  books: string[];
  /** ISO 8601 — set when the release has been published to the remote DCS repository. */
  publishedAt?: string;
}

/**
 * Pluggable storage backend for local translation projects (virtual FS + metadata + releases).
 */
export interface ProjectStorage {
  createProject(meta: ProjectMeta): Promise<string>;
  listProjects(): Promise<ProjectMeta[]>;
  getProject(id: string): Promise<ProjectMeta | null>;
  updateProject(id: string, patch: Partial<ProjectMeta>): Promise<void>;
  deleteProject(id: string): Promise<void>;

  writeFile(projectId: string, path: string, content: string): Promise<void>;
  readFile(projectId: string, path: string): Promise<string | null>;
  deleteFile(projectId: string, path: string): Promise<void>;
  listFiles(projectId: string, prefix?: string): Promise<string[]>;

  createRelease(projectId: string, release: ProjectRelease): Promise<void>;
  listReleases(projectId: string): Promise<ProjectRelease[]>;
  /** Patch fields on an existing release identified by `version`. */
  updateRelease(projectId: string, version: string, patch: Partial<ProjectRelease>): Promise<void>;

  /**
   * Remote blob SHAs from the last successful sync (path → sha).
   * Used with {@link ProjectSyncAdapter} to skip unchanged uploads.
   */
  getSyncShas(projectId: string): Promise<Record<string, string>>;
  /** Replace stored remote SHAs for paths (typically after a successful push). */
  setSyncShas(projectId: string, shas: Record<string, string>): Promise<void>;
}

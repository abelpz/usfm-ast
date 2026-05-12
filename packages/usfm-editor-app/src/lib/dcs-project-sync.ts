import { DcsRestProjectSync, gitBlobShaHex } from '@usfm-tools/editor-adapters';
import {
  CommitNotFoundError,
  ensureRepoUsesMainDefaultBranch,
  ensureBranch,
  createDcsRelease,
  ensureOpenPullRequest,
  mergePullRequestOrCloseIfNothingToMerge,
  compareRefs,
} from '@usfm-tools/door43-rest';
import type { IBrowserGitAdapter } from './browser-git-adapter';
import { writeFileWithCrdt } from './crdt-storage';
import { isProjectPushStale } from '@usfm-tools/types';
import type {
  FileConflict,
  ProjectMeta,
  ProjectPushResult,
  ProjectStorage,
  ProjectSyncAdapter,
  ProjectSyncConfig,
  RemoteFileEntry,
} from '@usfm-tools/types';
import { mergeProjectMaps } from '@usfm-tools/editor-adapters';

/** Default Door43 repo name: `{language}_{id}` (BCP-47 + project id), normalized for Gitea. */
export function suggestedDoor43RepoName(meta: Pick<ProjectMeta, 'language' | 'id'>): string {
  const lang = meta.language
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, '-')
    .replace(/-+/g, '-');
  const id = meta.id
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-');
  return `${lang}_${id}`.replace(/-+/g, '-');
}

export async function gatherProjectFileMap(
  storage: ProjectStorage,
  projectId: string,
): Promise<Map<string, string>> {
  const paths = await storage.listFiles(projectId);
  const map = new Map<string, string>();
  for (const p of paths) {
    const c = await storage.readFile(projectId, p);
    if (c !== null) map.set(p, c);
  }
  return map;
}

/**
 * Extensions that are eligible for sync. Kept in sync with DcsRestProjectSync.
 *
 * Note: `.json` covers `.alignment.json` sidecar files written by
 * `alignment-layer-persistence.syncAlignmentsToProject`. These files live at
 * `alignments/<lang>/<BOOK>.alignment.json` and are automatically picked up
 * by `gatherProjectFileMap` → `listFiles` when the project is pushed.
 * The book USFM always embeds the active alignment layer via `session.toUSFM()`.
 */
const TEXT_EXTS = new Set([
  '.md',
  '.yaml',
  '.yml',
  '.json',
  '.jsonl',
  '.usfm',
  '.sfm',
  '.txt',
  '.tsv',
  '.css',
  '.html',
]);

function isTextSyncPath(path: string): boolean {
  const lower = path.toLowerCase();
  if (lower.includes('/.git/')) return false;
  const ext = lower.includes('.') ? lower.slice(lower.lastIndexOf('.')) : '';
  return ext === '' || TEXT_EXTS.has(ext);
}

export type LocalChangeSummary = {
  /** Paths whose content changed since the last successful push. */
  changedPaths: string[];
  /** Paths that exist locally but have never been synced. */
  newPaths: string[];
  /** Paths that were synced before but no longer exist locally. */
  deletedPaths: string[];
};

/**
 * Detect which local files are out of sync with the last recorded remote state.
 *
 * This is a **purely local check** — no network call is made. It compares
 * git blob SHAs of the current IndexedDB content against the SHAs stored by
 * the last successful `pushLocalProjectToDcs` call.
 */
export async function detectLocalChanges(
  storage: ProjectStorage,
  projectId: string,
): Promise<LocalChangeSummary> {
  const [paths, storedShas] = await Promise.all([
    storage.listFiles(projectId),
    storage.getSyncShas(projectId),
  ]);

  const storedKeys = new Set(Object.keys(storedShas));
  const changedPaths: string[] = [];
  const newPaths: string[] = [];

  for (const p of paths) {
    if (!isTextSyncPath(p)) continue;
    const content = await storage.readFile(projectId, p);
    if (content === null) continue;
    const blobSha = await gitBlobShaHex(content);
    if (!(p in storedShas)) {
      newPaths.push(p);
    } else if (storedShas[p] !== blobSha) {
      changedPaths.push(p);
    }
    storedKeys.delete(p);
  }

  // Remaining stored keys are files that existed at last sync but are gone locally.
  const deletedPaths = [...storedKeys].filter(isTextSyncPath);

  return { changedPaths, newPaths, deletedPaths };
}

function isLocalDeltaEmpty(summary: LocalChangeSummary): boolean {
  return (
    summary.changedPaths.length === 0 &&
    summary.newPaths.length === 0 &&
    summary.deletedPaths.length === 0
  );
}

/** Returns `true` if any local file differs from the last recorded remote state. */
export async function hasLocalChanges(
  storage: ProjectStorage,
  projectId: string,
): Promise<boolean> {
  const { changedPaths, newPaths, deletedPaths } = await detectLocalChanges(storage, projectId);
  return changedPaths.length + newPaths.length + deletedPaths.length > 0;
}

/**
 * Publish any `ProjectRelease` entries that have not yet been pushed to DCS
 * (i.e. those without a `publishedAt` timestamp).
 *
 * Called automatically after a successful `pushLocalProjectToDcs`.
 * Each successfully published release is marked with `publishedAt` in storage.
 */
export async function publishPendingReleasesToDcs(options: {
  storage: ProjectStorage;
  projectId: string;
  token: string;
  sync: ProjectSyncConfig;
}): Promise<void> {
  const { storage, projectId, token, sync } = options;
  const releases = await storage.listReleases(projectId);
  const pending = releases.filter((r) => !r.publishedAt);
  if (pending.length === 0) return;

  for (const rel of pending) {
    const bodyLines: string[] = [];
    if (rel.title) bodyLines.push(`**${rel.title}**`);
    if (rel.books.length > 0) {
      bodyLines.push('');
      bodyLines.push(`Books: ${rel.books.join(', ')}`);
    }

    try {
      await createDcsRelease({
        host: sync.host,
        token,
        owner: sync.owner,
        repo: sync.repo,
        tag: rel.version,
        name: rel.title ?? rel.version,
        body: bodyLines.join('\n'),
      });
      await storage.updateRelease(projectId, rel.version, {
        publishedAt: new Date().toISOString(),
      });
    } catch (err) {
      // Log but don't rethrow — one failed release should not block others.
      console.warn(`Failed to publish release ${rel.version} to DCS:`, err);
    }
  }
}

// ---------------------------------------------------------------------------
// Branch naming
// ---------------------------------------------------------------------------

/**
 * Tier-1 branch: the personal working branch for a specific translator + book.
 * e.g. `abelper8/tit`
 */
export function workingBranchName(username: string, bookCode: string): string {
  const safeUser = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '-');
  const safeBook = bookCode.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '-');
  return `${safeUser}/${safeBook}`;
}

/**
 * Tier-2 branch: shared aggregation branch for all translators of a given book.
 * e.g. `tit`
 */
export function bookBranchName(bookCode: string): string {
  return bookCode.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '-');
}

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

/** Remote changed between read and PUT — caller should pull/merge and retry. */
export class StalePushError extends Error {
  constructor(public readonly staleByPath: Record<string, string>) {
    super('Remote file(s) changed since last read — sync again');
    this.name = 'StalePushError';
  }
}

/** Unresolved three-way merge — user must resolve in UI. */
export class SyncConflictsError extends Error {
  constructor(public readonly conflicts: FileConflict[]) {
    super('Merge conflicts require resolution');
    this.name = 'SyncConflictsError';
  }
}

/** Build CAS expectations: local paths we update + previously-synced paths we may delete. */
export function buildExpectedBaseShasForPush(options: {
  remoteIndex: RemoteFileEntry[];
  localMap: Map<string, string>;
  previouslySyncedPaths: ReadonlySet<string>;
}): Record<string, string> {
  const { remoteIndex, localMap, previouslySyncedPaths } = options;
  const byLocal = new Map<string, RemoteFileEntry>();
  for (const e of remoteIndex) {
    const lk = e.path.startsWith('content/') ? e.path.slice('content/'.length) : e.path;
    byLocal.set(lk, e);
  }
  const out: Record<string, string> = {};
  for (const path of localMap.keys()) {
    const e = byLocal.get(path);
    if (e) out[path] = e.sha;
  }
  for (const path of previouslySyncedPaths) {
    if (localMap.has(path)) continue;
    const e = byLocal.get(path);
    if (e) out[path] = e.sha;
  }
  return out;
}

export async function pushLocalProjectToDcs(options: {
  storage: ProjectStorage;
  projectId: string;
  token: string;
  sync: ProjectSyncConfig;
  /**
   * Override the target branch for the push.
   * When provided (e.g. `{username}/{bookCode}`) the push lands on this branch
   * instead of `sync.branch`. The merge to `sync.branch` must be triggered
   * separately (e.g. via a pull-request or higher-level sync flow).
   */
  workingBranch?: string;
  /**
   * When set, push fails with {@link StalePushError} if any remote blob SHA
   * differs (optimistic locking). Omit for legacy best-effort push.
   */
  expectedBaseShaByPath?: Record<string, string>;
}): Promise<ProjectPushResult> {
  const { storage, projectId, token, sync } = options;
  const pushBranch = options.workingBranch ?? sync.branch;

  // Ensure `main` exists and is the default (Scripture Burritos convention).
  if (sync.branch.trim().toLowerCase() === 'main') {
    await ensureRepoUsesMainDefaultBranch({
      host: sync.host,
      token,
      owner: sync.owner,
      repo: sync.repo,
    });
  }

  // If pushing to a working branch (Tier-1), ensure it exists before writing files.
  if (options.workingBranch && options.workingBranch !== sync.branch) {
    await ensureBranch({
      host: sync.host,
      token,
      owner: sync.owner,
      repo: sync.repo,
      branch: options.workingBranch,
      fromBranch: sync.branch,
    });
  }

  const adapter = new DcsRestProjectSync({
    host: sync.host,
    token,
    owner: sync.owner,
    repo: sync.repo,
    branch: pushBranch,
    targetType: sync.targetType,
  });
  const map = await gatherProjectFileMap(storage, projectId);
  const storedShas = await storage.getSyncShas(projectId);
  const previouslySyncedPaths = new Set(Object.keys(storedShas));
  const result = await adapter.pushFiles(map, 'Project sync', {
    previouslySyncedPaths,
    expectedBaseShaByPath: options.expectedBaseShaByPath,
  });

  if (isProjectPushStale(result)) {
    throw new StalePushError(result.staleByPath);
  }

  // Use the post-push remote index returned by pushFiles to avoid a second API round-trip.
  // Fall back to a fresh getRemoteFileIndex() only if the implementation didn't return one.
  const idx = result.syncedFiles ?? (await adapter.getRemoteFileIndex());

  // Record blob SHAs keyed by *local* path (strip content/ prefix added by RC repos).
  const next: Record<string, string> = {};
  for (const e of idx) {
    const localKey = e.path.startsWith('content/') ? e.path.slice('content/'.length) : e.path;
    if (map.has(localKey) || map.has(e.path)) {
      next[localKey] = e.sha;
    }
  }
  await storage.setSyncShas(projectId, next);
  return result;
}

// ---------------------------------------------------------------------------
// Pull + merge + push (Tier-2 → local → Tier-1)
// ---------------------------------------------------------------------------

/** Outcome of {@link syncLocalProjectWithDcs}: full merge+push vs nothing to do. */
export type SyncLocalProjectWithDcsResult =
  | { kind: 'synced'; pushResult: ProjectPushResult; tier2HeadSha: string }
  | { kind: 'noop'; tier2HeadSha: string };

/**
 * Per-(projectId, tier2) in-flight promise. Prevents concurrent sync calls from
 * running a second 3-way merge while the first one is still pushing, which would
 * use a stale base and surface spurious conflicts.
 */
const _syncInFlight = new Map<string, Promise<SyncLocalProjectWithDcsResult>>();

/**
 * Whether at least one additional call arrived while a sync was in-flight.
 * Only one trailing follow-up is queued — callers that pile up share the
 * same queued promise rather than stacking unboundedly.
 */
const _syncPending = new Set<string>();

/**
 * Pull from the Tier-2 (`{bookCode}`) branch, 3-way merge into local storage,
 * then CAS-push **directly back to the same Tier-2 branch** — no Tier-1 personal
 * branch is created and no PR auto-merge loop is needed (Phase 5).
 *
 * **Ancestry-aware:** before running a full three-way merge, calls `compareRefs`
 * to check whether Tier-2 has any commits not already in our last push.
 * If not, the pull step is skipped entirely (noop or push-only path).
 *
 * **Mutex:** at most one call per `(projectId, bookCode)` pair runs at a time.
 * A second call that arrives while the first is in-flight queues one trailing
 * follow-up; additional callers share that queued promise.
 *
 * **Offline-first:** all edits are stored locally (IndexedDB / LightningFS) and
 * only Door43 (DCS) is contacted for online sync — no additional relay server.
 *
 * **Local git (Phase 3):** when `gitAdapter` is supplied, the base-tree snapshot
 * is read from the local git clone instead of fetching from DCS over REST.  After a
 * successful push the merged file set is committed into the local repo and the
 * `localGitOidByDcsRef` mapping in `ProjectMeta` is updated so future syncs can
 * skip the base-tree REST call.
 *
 * Updates `lastRemoteCommit[tier2]`, `lastPushedCommit[tier2]`, and (when
 * `gitAdapter` is provided) `localGitOidByDcsRef` after a successful merge+push.
 */
export async function syncLocalProjectWithDcs(options: {
  storage: ProjectStorage;
  projectId: string;
  token: string;
  sync: ProjectSyncConfig;
  username: string;
  bookCode?: string;
  /**
   * Optional local git adapter (Phase 3).  When supplied:
   * - base-tree files are read from the local clone when a snapshot is available,
   *   avoiding a REST `pullFilesAt` round-trip.
   * - the merged file set is committed into the local clone after a successful push
   *   so subsequent syncs can use the local snapshot.
   */
  gitAdapter?: IBrowserGitAdapter;
  /**
   * Injectable sync adapter (test seam).  When supplied, all remote I/O goes
   * through this adapter instead of constructing a real {@link DcsRestProjectSync}.
   * DCS-specific coordination calls (ensureBranch, compareRefs) are skipped.
   * This lets unit tests simulate multi-user conflict scenarios without HTTP.
   */
  _adapter?: ProjectSyncAdapter;
}): Promise<SyncLocalProjectWithDcsResult> {
  const { projectId, sync, bookCode } = options;
  const tier2 = bookCode ? bookBranchName(bookCode) : sync.branch;
  const mutexKey = `${projectId}:${tier2}`;

  const existing = _syncInFlight.get(mutexKey);
  if (existing) {
    if (!_syncPending.has(mutexKey)) {
      _syncPending.add(mutexKey);
      const followUp = existing.then(() => {
        _syncPending.delete(mutexKey);
        return syncLocalProjectWithDcs(options);
      });
      return followUp;
    }
    return existing;
  }

  const run = _syncOnce(options);
  _syncInFlight.set(mutexKey, run);
  // Clean up the map when the run settles.  The cleanup chain must not propagate
  // a rejection (which would create an unhandled-rejection noise in the process).
  void run.then(
    () => { if (_syncInFlight.get(mutexKey) === run) _syncInFlight.delete(mutexKey); },
    () => { if (_syncInFlight.get(mutexKey) === run) _syncInFlight.delete(mutexKey); },
  );
  return run;
}

/**
 * Core sync implementation. Called exclusively from {@link syncLocalProjectWithDcs}
 * which owns the per-key mutex.
 *
 * Phase 5: pushes directly to the Tier-2 (`{bookCode}`) branch — no Tier-1 personal
 * branch is created and no PR auto-merge loop is needed.  File-level conflicts are
 * resolved locally via the 3-pane UI before the push is retried.
 */
async function _syncOnce(options: {
  storage: ProjectStorage;
  projectId: string;
  token: string;
  sync: ProjectSyncConfig;
  username: string;
  bookCode?: string;
  gitAdapter?: IBrowserGitAdapter;
  _adapter?: ProjectSyncAdapter;
}): Promise<SyncLocalProjectWithDcsResult> {
  const { storage, projectId, token, sync, username, bookCode } = options;
  const injected = options._adapter;

  const meta = await storage.getProject(projectId);
  if (!meta) throw new Error(`Project not found: ${projectId}`);

  // Phase 5: push target is the Tier-2 (book) branch directly — no Tier-1 personal branch.
  const tier2 = bookCode ? bookBranchName(bookCode) : sync.branch;

  // DCS-specific coordination: skipped when an injected adapter is provided.
  if (!injected) {
    if (sync.branch.trim().toLowerCase() === 'main') {
      await ensureRepoUsesMainDefaultBranch({
        host: sync.host,
        token,
        owner: sync.owner,
        repo: sync.repo,
      });
    }

    // Ensure the book branch exists before reading its tip or pushing to it.
    if (bookCode && tier2 !== sync.branch) {
      await ensureBranch({
        host: sync.host,
        token,
        owner: sync.owner,
        repo: sync.repo,
        branch: tier2,
        fromBranch: sync.branch,
      });
    }
  }

  const adapterTier2 = injected ?? new DcsRestProjectSync({
    host: sync.host,
    token,
    owner: sync.owner,
    repo: sync.repo,
    branch: tier2,
    targetType: sync.targetType,
  });

  const tier2HeadSha = await adapterTier2.getRemoteHeadCommit();
  const localDelta = await detectLocalChanges(storage, projectId);

  // Legacy anchor (kept as fallback when lastPushedCommit is not yet populated).
  const lastBase = meta.lastRemoteCommit?.[tier2];
  // Ancestry anchor: Tier-2 SHA after our last successful push + autoMerge.
  const lastPushed = meta.lastPushedCommit?.[tier2];

  // --- Fast noop: Tier-2 hasn't moved since our last push and nothing changed locally ---
  if (lastPushed && lastPushed === tier2HeadSha && isLocalDeltaEmpty(localDelta)) {
    return { kind: 'noop', tier2HeadSha };
  }

  // --- Ancestry check via compareRefs (DCS only; injected adapter uses simple equality) ---
  let needsMerge = true;
  let mergeBaseOid: string | null = null;

  if (lastPushed) {
    if (injected) {
      // Injected adapter: no compareRefs API. Use simple equality — if head hasn't moved,
      // no merge needed. If it has, we use lastPushed as the base ref.
      if (lastPushed === tier2HeadSha) {
        needsMerge = false;
      } else {
        mergeBaseOid = lastPushed;
      }
    } else {
      const cmp = await compareRefs({
        host: sync.host,
        token,
        owner: sync.owner,
        repo: sync.repo,
        base: lastPushed,   // what we last owned on Tier-2
        head: tier2HeadSha, // current Tier-2 tip
      });
      if (cmp.totalCommits === 0) {
        // Tier-2 has no commits beyond our last push — nothing new to pull.
        needsMerge = false;
      } else {
        // Use the API-supplied merge-base as the true common ancestor for 3-way.
        mergeBaseOid = cmp.mergeBaseCommit;
      }
    }
  } else if (lastBase && lastBase === tier2HeadSha && isLocalDeltaEmpty(localDelta)) {
    // Legacy fallback noop (no lastPushed recorded yet).
    return { kind: 'noop', tier2HeadSha };
  }

  // --- Three-way merge (only when Tier-2 has genuinely new content) ---
  if (needsMerge) {
    // Prefer the true merge-base from compareRefs; fall back to the legacy lastBase anchor.
    const baseRef = mergeBaseOid ?? lastBase ?? tier2HeadSha;

    // Fetch the current remote tree. If the commit OID is not accessible via the
    // commits API (some Gitea instances return 404 for /git/commits/{sha}), fall back
    // to fetching by branch name — we'll get the latest remote files, which is still
    // a correct (if slightly non-atomic) view of the remote state.
    let theirsFiles: Map<string, string>;
    if (injected) {
      theirsFiles = await injected.pullFilesAt(tier2HeadSha);
    } else {
      try {
        theirsFiles = await adapterTier2.pullFilesAt(tier2HeadSha);
      } catch (e) {
        if (!(e instanceof CommitNotFoundError)) throw e;
        theirsFiles = await adapterTier2.pullFilesAt(tier2);
      }
    }

    // Phase 3: read base files from local git when a snapshot for this DCS OID is cached,
    // avoiding a REST round-trip for `pullFilesAt(baseRef)`.
    let baseFiles: Map<string, string>;
    const localBaseOid = options.gitAdapter
      ? (meta.localGitOidByDcsRef?.[baseRef] ?? null)
      : null;
    if (options.gitAdapter && localBaseOid) {
      baseFiles = await options.gitAdapter.readFilesAt(localBaseOid);
    } else if (baseRef === tier2HeadSha) {
      baseFiles = new Map(theirsFiles);
    } else if (injected) {
      baseFiles = await injected.pullFilesAt(baseRef);
    } else {
      try {
        baseFiles = await adapterTier2.pullFilesAt(baseRef);
      } catch (e) {
        if (!(e instanceof CommitNotFoundError)) throw e;
        // Stale base anchor — the OID no longer exists on the remote.
        // Degrade to a 2-way merge (no common ancestor). This is conservative:
        // more lines may appear as conflicts, but no data is lost.
        baseFiles = new Map();
      }
    }

    const oursFiles = await gatherProjectFileMap(storage, projectId);
    const allPaths = new Set<string>([
      ...baseFiles.keys(),
      ...theirsFiles.keys(),
      ...oursFiles.keys(),
    ]);

    const { merged, conflicts, deleted } = mergeProjectMaps({
      paths: allPaths,
      getBase: (p) => baseFiles.get(p),
      getOurs: (p) => oursFiles.get(p),
      getTheirs: (p) => theirsFiles.get(p),
    });

    if (conflicts.length > 0) {
      await storage.updateProject(projectId, { pendingConflicts: conflicts });
      throw new SyncConflictsError(conflicts);
    }

    await storage.updateProject(projectId, { pendingConflicts: [] });

    for (const [path, content] of merged) {
      const prev = await storage.readFile(projectId, path);
      if (prev !== content) {
        await writeFileWithCrdt(storage, projectId, path, content);
      }
    }

    // Remove files silently deleted by the merge (one side deleted, other unchanged).
    for (const path of deleted) {
      await storage.deleteFile(projectId, path);
    }

  } else if (isLocalDeltaEmpty(localDelta)) {
    // Ancestry check said Tier-2 is not ahead of us, and nothing changed locally.
    return { kind: 'noop', tier2HeadSha };
  }
  // else: needsMerge=false but localDelta non-empty → skip merge, fall through to push.

  // Phase 5: push directly to the book branch (tier2), not a personal Tier-1 branch.
  const pushBranch = tier2;

  // When an injected adapter is present, push through it directly without HTTP coordination.
  if (injected) {
    const map = await gatherProjectFileMap(storage, projectId);
    const storedShas = await storage.getSyncShas(projectId);
    const previouslySyncedPaths = new Set(Object.keys(storedShas));
    const remoteIndex = await injected.getRemoteFileIndex();
    let expectedBaseShaByPath = buildExpectedBaseShasForPush({
      remoteIndex,
      localMap: map,
      previouslySyncedPaths,
    });

    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      const pushOutcome = await injected.pushFiles(map, 'Project sync', {
        previouslySyncedPaths,
        expectedBaseShaByPath,
      });
      if (isProjectPushStale(pushOutcome)) {
        if (attempt < 2) {
          const freshIndex = await injected.getRemoteFileIndex();
          const mapNow = await gatherProjectFileMap(storage, projectId);
          const shasNow = await storage.getSyncShas(projectId);
          expectedBaseShaByPath = buildExpectedBaseShasForPush({
            remoteIndex: freshIndex,
            localMap: mapNow,
            previouslySyncedPaths: new Set(Object.keys(shasNow)),
          });
          lastErr = new StalePushError(pushOutcome.staleByPath);
          continue;
        }
        throw new StalePushError(pushOutcome.staleByPath);
      }

      // Compute git-compatible blob SHAs for the files just pushed.
      // We derive them locally (gitBlobShaHex) so detectLocalChanges — which
      // also uses gitBlobShaHex — sees no changes on the next sync cycle.
      const next: Record<string, string> = {};
      for (const [lk, content] of map) {
        next[lk] = await gitBlobShaHex(content);
      }
      await storage.setSyncShas(projectId, next);

      const newHeadSha = await injected.getRemoteHeadCommit();
      await storage.updateProject(projectId, {
        lastRemoteCommit: { ...(meta.lastRemoteCommit ?? {}), [tier2]: newHeadSha },
        lastPushedCommit: { ...(meta.lastPushedCommit ?? {}), [tier2]: newHeadSha },
        pendingConflicts: [],
      });

      return { kind: 'synced' as const, pushResult: pushOutcome, tier2HeadSha: newHeadSha };
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  // DCS path — use pushLocalProjectToDcs with CAS retry.
  const adapterPush = new DcsRestProjectSync({
    host: sync.host,
    token,
    owner: sync.owner,
    repo: sync.repo,
    branch: pushBranch,
    targetType: sync.targetType,
  });
  const map = await gatherProjectFileMap(storage, projectId);
  const storedShas = await storage.getSyncShas(projectId);
  const previouslySyncedPaths = new Set(Object.keys(storedShas));
  let expectedBaseShaByPath = buildExpectedBaseShasForPush({
    remoteIndex: await adapterPush.getRemoteFileIndex(),
    localMap: map,
    previouslySyncedPaths,
  });

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const pushResult = await pushLocalProjectToDcs({
        storage,
        projectId,
        token,
        sync,
        workingBranch: pushBranch !== sync.branch ? pushBranch : undefined,
        expectedBaseShaByPath,
      });

      // Phase 3: commit the merged file snapshot into the local git adapter so
      // subsequent syncs can read the base tree locally without a REST round-trip.
      let newLocalOidByDcsRef: Record<string, string> | undefined;
      if (options.gitAdapter) {
        try {
          const mergedMap = await gatherProjectFileMap(storage, projectId);
          const localOid = await options.gitAdapter.commitAll(
            mergedMap,
            `sync ${tier2HeadSha.slice(0, 8)}`,
            { name: username, email: `${username}@local` },
          );
          newLocalOidByDcsRef = {
            ...(meta.localGitOidByDcsRef ?? {}),
            [tier2HeadSha]: localOid,
          };
        } catch {
          // Non-fatal — local git snapshot failure does not block the sync result.
        }
      }

      // Use the commit SHA from the push result as the new anchor when available.
      // pushResult.commitSha is the SHA of the new commit we just created on DCS —
      // the correct anchor for the next sync.  Falls back to tier2HeadSha (the
      // remote HEAD *before* our push) when the API didn't return a commit SHA
      // (e.g. a no-op push where all files matched and no PUT was issued).
      const pushedSha = pushResult.commitSha ?? tier2HeadSha;

      await storage.updateProject(projectId, {
        lastRemoteCommit: { ...(meta.lastRemoteCommit ?? {}), [tier2]: pushedSha },
        lastPushedCommit: { ...(meta.lastPushedCommit ?? {}), [tier2]: pushedSha },
        ...(newLocalOidByDcsRef ? { localGitOidByDcsRef: newLocalOidByDcsRef } : {}),
        pendingConflicts: [],
      });

      return { kind: 'synced' as const, pushResult, tier2HeadSha: pushedSha };
    } catch (e) {
      lastError = e;
      if (e instanceof StalePushError && attempt < 2) {
        const fresh = await adapterPush.getRemoteFileIndex();
        const mapNow = await gatherProjectFileMap(storage, projectId);
        const shasNow = await storage.getSyncShas(projectId);
        expectedBaseShaByPath = buildExpectedBaseShasForPush({
          remoteIndex: fresh,
          localMap: mapNow,
          previouslySyncedPaths: new Set(Object.keys(shasNow)),
        });
        continue;
      }
      throw e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

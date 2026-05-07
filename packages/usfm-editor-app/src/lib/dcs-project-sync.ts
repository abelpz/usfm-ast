import { DcsRestProjectSync, gitBlobShaHex } from '@usfm-tools/editor-adapters';
import {
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
// Auto-merge
// ---------------------------------------------------------------------------

export type AutoMergeResult =
  | { merged: true }
  | { merged: false; conflictPrUrl: string };

/**
 * After a successful push to the Tier-1 branch (`{username}/{bookCode}`), attempt
 * to auto-merge the two PR hops:
 *
 *   {username}/{bookCode}  →  {bookCode}  →  main
 *
 * Each hop:
 *  1. Ensures the target branch exists (creating from main if needed).
 *  2. Finds or creates an open PR between the branches.
 *  3. Calls the Gitea merge API.
 *
 * Returns `{ merged: true }` when both hops succeed, or
 * `{ merged: false, conflictPrUrl }` pointing to the first PR that could not
 * be automatically merged.
 *
 * If a hop’s merge fails but the head is already fully contained in the base
 * (nothing left to integrate), that PR is closed and the hop is treated as success.
 */
export async function autoMergeToDcs(options: {
  token: string;
  sync: ProjectSyncConfig;
  username: string;
  bookCode: string;
}): Promise<AutoMergeResult> {
  const { token, sync, username, bookCode } = options;
  const host = sync.host;
  const owner = sync.owner;
  const repo = sync.repo;
  const mainBranch = sync.branch; // always 'main'
  const tier1 = workingBranchName(username, bookCode);
  const tier2 = bookBranchName(bookCode);

  // Ensure the Tier-2 (book) branch exists before we try to target it.
  await ensureBranch({ host, token, owner, repo, branch: tier2, fromBranch: mainBranch });

  // --- Hop 1: Tier-1 → Tier-2 ---
  const pr1 = await ensureOpenPullRequest({
    host,
    token,
    owner,
    repo,
    head: tier1,
    base: tier2,
    title: `[auto] ${username}: ${bookCode.toUpperCase()} changes`,
    body: `Automatic PR from translator branch \`${tier1}\` into book branch \`${tier2}\`.`,
  });

  const merge1 = await mergePullRequestOrCloseIfNothingToMerge({
    host,
    token,
    owner,
    repo,
    index: pr1.number,
    method: 'merge',
    message: `Auto-merge ${tier1} → ${tier2}`,
    baseRef: tier2,
    headRef: tier1,
  });

  if (!merge1.merged) {
    return { merged: false, conflictPrUrl: merge1.prHtmlUrl };
  }

  // --- Hop 2: Tier-2 → main ---
  const pr2 = await ensureOpenPullRequest({
    host,
    token,
    owner,
    repo,
    head: tier2,
    base: mainBranch,
    title: `[auto] ${bookCode.toUpperCase()} → ${mainBranch}`,
    body: `Automatic PR from book branch \`${tier2}\` into \`${mainBranch}\`.`,
  });

  const merge2 = await mergePullRequestOrCloseIfNothingToMerge({
    host,
    token,
    owner,
    repo,
    index: pr2.number,
    method: 'merge',
    message: `Auto-merge ${tier2} → ${mainBranch}`,
    baseRef: mainBranch,
    headRef: tier2,
  });

  if (!merge2.merged) {
    return { merged: false, conflictPrUrl: merge2.prHtmlUrl };
  }

  return { merged: true };
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
   * instead of `sync.branch`. The merge to `sync.branch` is handled separately
   * by `autoMergeToDcs`.
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
 * Merge Tier-2 (`bookCode` branch) into local storage, then CAS-push to Tier-1 (or `sync.branch`).
 *
 * **Ancestry-aware:** before running a full three-way merge, calls `compareRefs`
 * to check whether Tier-2 has any commits that are not already in our last push.
 * If not, the pull step is skipped entirely (noop or push-only path).
 *
 * **Mutex:** at most one call per `(projectId, bookCode)` pair runs at a time.
 * A second call that arrives while the first is in-flight queues one trailing
 * follow-up; additional callers share that queued promise.
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
 */
async function _syncOnce(options: {
  storage: ProjectStorage;
  projectId: string;
  token: string;
  sync: ProjectSyncConfig;
  username: string;
  bookCode?: string;
  gitAdapter?: IBrowserGitAdapter;
}): Promise<SyncLocalProjectWithDcsResult> {
  const { storage, projectId, token, sync, username, bookCode } = options;

  const meta = await storage.getProject(projectId);
  if (!meta) throw new Error(`Project not found: ${projectId}`);

  const tier2 = bookCode ? bookBranchName(bookCode) : sync.branch;
  const wb = bookCode ? workingBranchName(username, bookCode) : undefined;

  if (sync.branch.trim().toLowerCase() === 'main') {
    await ensureRepoUsesMainDefaultBranch({
      host: sync.host,
      token,
      owner: sync.owner,
      repo: sync.repo,
    });
  }

  // Tier-2 (book) branch must exist before we can read its tip; otherwise GET …/branches/{book} 404s
  // on every sync until something else created it.
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

  if (wb && wb !== sync.branch) {
    await ensureBranch({
      host: sync.host,
      token,
      owner: sync.owner,
      repo: sync.repo,
      branch: wb,
      fromBranch: sync.branch,
    });
  }

  const adapterTier2 = new DcsRestProjectSync({
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

  // --- Ancestry check via compareRefs ---
  let needsMerge = true;
  let mergeBaseOid: string | null = null;

  if (lastPushed) {
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
  } else if (lastBase && lastBase === tier2HeadSha && isLocalDeltaEmpty(localDelta)) {
    // Legacy fallback noop (no lastPushed recorded yet).
    return { kind: 'noop', tier2HeadSha };
  }

  // --- Three-way merge (only when Tier-2 has genuinely new content) ---
  if (needsMerge) {
    // Prefer the true merge-base from compareRefs; fall back to the legacy lastBase anchor.
    const baseRef = mergeBaseOid ?? lastBase ?? tier2HeadSha;

    const theirsFiles = await adapterTier2.pullFilesAt(tier2HeadSha);

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
    } else {
      baseFiles = await adapterTier2.pullFilesAt(baseRef);
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

    // Record the merge-base used (for debug and future optimization).
    if (mergeBaseOid) {
      await storage.updateProject(projectId, {
        lastMergedBaseCommit: {
          ...(meta.lastMergedBaseCommit ?? {}),
          [tier2]: mergeBaseOid,
        },
      });
    }
  } else if (isLocalDeltaEmpty(localDelta)) {
    // Ancestry check said Tier-2 is not ahead of us, and nothing changed locally.
    return { kind: 'noop', tier2HeadSha };
  }
  // else: needsMerge=false but localDelta non-empty → skip merge, fall through to push.

  const pushBranch = wb ?? sync.branch;
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
        workingBranch: wb,
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

      // Record the Tier-2 tip we synced from and the conservative lastPushedCommit.
      // The hook will overwrite lastPushedCommit with the post-autoMerge Tier-2 head
      // once autoMergeToDcs succeeds, giving us the most accurate anchor.
      await storage.updateProject(projectId, {
        lastRemoteCommit: { ...(meta.lastRemoteCommit ?? {}), [tier2]: tier2HeadSha },
        lastPushedCommit: { ...(meta.lastPushedCommit ?? {}), [tier2]: tier2HeadSha },
        ...(newLocalOidByDcsRef ? { localGitOidByDcsRef: newLocalOidByDcsRef } : {}),
        pendingConflicts: [],
      });

      return { kind: 'synced' as const, pushResult, tier2HeadSha };
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

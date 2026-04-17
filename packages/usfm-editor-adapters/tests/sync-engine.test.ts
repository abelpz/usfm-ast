/**
 * Unit tests for the sync-engine functions in dcs-project-sync.ts:
 *   - detectLocalChanges
 *   - buildExpectedBaseShasForPush
 *   - syncLocalProjectWithDcs: no-op fast-path, pull-before-push, CAS retry loop
 */

import type { ProjectMeta, ProjectRelease, ProjectStorage } from '@usfm-tools/types';
import { gitBlobShaHex } from '../src/storage/dcs-rest-project-sync';
import {
  detectLocalChanges,
  buildExpectedBaseShasForPush,
  syncLocalProjectWithDcs,
  StalePushError,
  SyncConflictsError,
} from '../../usfm-editor-app/src/lib/dcs-project-sync';

// ---------------------------------------------------------------------------
// Minimal in-memory ProjectStorage
// ---------------------------------------------------------------------------

function makeStorage(
  meta: Partial<ProjectMeta> & Pick<ProjectMeta, 'id' | 'name' | 'language'>,
): ProjectStorage & { _files: Map<string, string>; _meta: ProjectMeta } {
  const files = new Map<string, string>();
  const now = new Date().toISOString();
  let storedMeta: ProjectMeta = {
    format: 'resource-container',
    created: now,
    updated: now,
    ...meta,
  };
  let syncShas: Record<string, string> = {};
  const releases: ProjectRelease[] = [];

  const storage: ProjectStorage & { _files: Map<string, string>; _meta: ProjectMeta } = {
    _files: files,
    get _meta() { return storedMeta; },
    createProject: async () => storedMeta.id,
    listProjects: async () => [storedMeta],
    getProject: async () => storedMeta,
    updateProject: async (_id, patch) => { storedMeta = { ...storedMeta, ...patch }; },
    deleteProject: async () => {},
    writeFile: async (_pid, path, content) => { files.set(path, content); },
    readFile: async (_pid, path) => files.get(path) ?? null,
    deleteFile: async (_pid, path) => { files.delete(path); },
    listFiles: async () => [...files.keys()],
    createRelease: async (_pid, rel) => { releases.push(rel); },
    listReleases: async () => releases,
    updateRelease: async (_pid, ver, patch) => {
      const i = releases.findIndex((r) => r.version === ver);
      if (i >= 0) releases[i] = { ...releases[i], ...patch };
    },
    getSyncShas: async () => ({ ...syncShas }),
    setSyncShas: async (_pid, shas) => { syncShas = { ...shas }; },
  };
  return storage;
}

// ---------------------------------------------------------------------------
// detectLocalChanges
// ---------------------------------------------------------------------------

describe('detectLocalChanges', () => {
  it('reports new paths not present in syncShas', async () => {
    const storage = makeStorage({ id: 'p1', name: 'P', language: 'en' });
    await storage.writeFile('p1', '56-TIT.usfm', '\\id TIT\n');
    const result = await detectLocalChanges(storage, 'p1');
    expect(result.newPaths).toContain('56-TIT.usfm');
    expect(result.changedPaths).toHaveLength(0);
    expect(result.deletedPaths).toHaveLength(0);
  });

  it('reports changed paths whose SHA differs from syncShas', async () => {
    const storage = makeStorage({ id: 'p1', name: 'P', language: 'en' });
    const content = '\\id TIT\n';
    const sha = await gitBlobShaHex(content);
    await storage.setSyncShas('p1', { '56-TIT.usfm': sha });
    await storage.writeFile('p1', '56-TIT.usfm', '\\id TIT\n\\c 1\n');
    const result = await detectLocalChanges(storage, 'p1');
    expect(result.changedPaths).toContain('56-TIT.usfm');
    expect(result.newPaths).toHaveLength(0);
  });

  it('reports deleted paths present in syncShas but no longer in storage', async () => {
    const storage = makeStorage({ id: 'p1', name: 'P', language: 'en' });
    await storage.setSyncShas('p1', { '56-TIT.usfm': 'abc123' });
    const result = await detectLocalChanges(storage, 'p1');
    expect(result.deletedPaths).toContain('56-TIT.usfm');
    expect(result.newPaths).toHaveLength(0);
    expect(result.changedPaths).toHaveLength(0);
  });

  it('reports nothing when file is unchanged from syncShas', async () => {
    const storage = makeStorage({ id: 'p1', name: 'P', language: 'en' });
    const content = '\\id TIT\n';
    const sha = await gitBlobShaHex(content);
    await storage.setSyncShas('p1', { '56-TIT.usfm': sha });
    await storage.writeFile('p1', '56-TIT.usfm', content);
    const result = await detectLocalChanges(storage, 'p1');
    expect(result.changedPaths).toHaveLength(0);
    expect(result.newPaths).toHaveLength(0);
    expect(result.deletedPaths).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildExpectedBaseShasForPush
// ---------------------------------------------------------------------------

describe('buildExpectedBaseShasForPush', () => {
  it('includes shas for files present in both remote index and local map', () => {
    const result = buildExpectedBaseShasForPush({
      remoteIndex: [{ path: '56-TIT.usfm', sha: 'aaa', size: 10 }],
      localMap: new Map([['56-TIT.usfm', '\\id TIT\n']]),
      previouslySyncedPaths: new Set(),
    });
    expect(result['56-TIT.usfm']).toBe('aaa');
  });

  it('includes shas for previously-synced paths being deleted', () => {
    const result = buildExpectedBaseShasForPush({
      remoteIndex: [
        { path: '56-TIT.usfm', sha: 'aaa', size: 10 },
        { path: 'notes.md', sha: 'bbb', size: 5 },
      ],
      localMap: new Map([['56-TIT.usfm', '\\id TIT\n']]),
      previouslySyncedPaths: new Set(['notes.md']),
    });
    expect(result['56-TIT.usfm']).toBe('aaa');
    expect(result['notes.md']).toBe('bbb');
  });

  it('omits remote paths that are not local and not previously synced', () => {
    const result = buildExpectedBaseShasForPush({
      remoteIndex: [{ path: 'stranger.md', sha: 'zzz', size: 3 }],
      localMap: new Map(),
      previouslySyncedPaths: new Set(),
    });
    expect(Object.keys(result)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// syncLocalProjectWithDcs — mock DcsRestProjectSync via jest.mock
// ---------------------------------------------------------------------------

const USFM_BASE = '\\id TIT\n\\c 1\n\\p\n\\v 1 Base\n';
const USFM_LOCAL = '\\id TIT\n\\c 1\n\\p\n\\v 1 Local\n';
const USFM_REMOTE = '\\id TIT\n\\c 1\n\\p\n\\v 1 Remote\n';

/** Build a minimal DcsRestProjectSync-shaped mock. */
function mockAdapter(overrides: {
  getRemoteHeadCommit?: jest.Mock;
  pullFilesAt?: jest.Mock;
  getRemoteFileIndex?: jest.Mock;
  pushFiles?: jest.Mock;
}) {
  return {
    getRemoteHeadCommit: overrides.getRemoteHeadCommit ?? jest.fn().mockResolvedValue('sha-remote'),
    pullFilesAt: overrides.pullFilesAt ?? jest.fn().mockResolvedValue(new Map([['56-TIT.usfm', USFM_REMOTE]])),
    getRemoteFileIndex: overrides.getRemoteFileIndex ?? jest.fn().mockResolvedValue([{ path: '56-TIT.usfm', sha: 'aaa', size: 10 }]),
    pushFiles: overrides.pushFiles ?? jest.fn().mockResolvedValue({
      filesCreated: 0,
      filesUpdated: 1,
      filesDeleted: 0,
      commitSha: 'commit-1',
      syncedFiles: [{ path: '56-TIT.usfm', sha: 'bbb', size: 12 }],
    }),
    ensureRemoteRepo: jest.fn().mockResolvedValue({ created: false, owner: 'u', repo: 'r' }),
  };
}

jest.mock('../src/storage/dcs-rest-project-sync', () => {
  const actual = jest.requireActual('../src/storage/dcs-rest-project-sync') as Record<string, unknown>;
  return {
    ...actual,
    DcsRestProjectSync: jest.fn().mockImplementation(() => currentAdapterMock),
  };
});

jest.mock('@usfm-tools/door43-rest', () => ({
  ensureRepoUsesMainDefaultBranch: jest.fn().mockResolvedValue(undefined),
  ensureBranch: jest.fn().mockResolvedValue(undefined),
  createDcsRelease: jest.fn().mockResolvedValue({}),
  ensureOpenPullRequest: jest.fn().mockResolvedValue({ number: 1 }),
  mergePullRequestOrCloseIfNothingToMerge: jest.fn().mockResolvedValue({ merged: true }),
}));

let currentAdapterMock: ReturnType<typeof mockAdapter>;

const SYNC_CONFIG = {
  host: 'git.door43.org',
  owner: 'u',
  repo: 'r',
  branch: 'main',
  targetType: 'user' as const,
};

describe('syncLocalProjectWithDcs', () => {
  beforeEach(() => {
    currentAdapterMock = mockAdapter({});
  });

  it('returns noop when remote is unchanged and no local delta', async () => {
    const COMMIT = 'sha-remote';
    const storage = makeStorage({
      id: 'p1',
      name: 'P',
      language: 'en',
      lastRemoteCommit: { tit: COMMIT },
    });
    // Write file whose sha matches the stored sync sha
    const content = USFM_BASE;
    const sha = await gitBlobShaHex(content);
    await storage.setSyncShas('p1', { '56-TIT.usfm': sha });
    await storage.writeFile('p1', '56-TIT.usfm', content);

    currentAdapterMock = mockAdapter({
      getRemoteHeadCommit: jest.fn().mockResolvedValue(COMMIT),
    });

    const result = await syncLocalProjectWithDcs({
      storage,
      projectId: 'p1',
      token: 't',
      sync: SYNC_CONFIG,
      username: 'alice',
      bookCode: 'TIT',
    });

    expect(result.kind).toBe('noop');
    expect(currentAdapterMock.pullFilesAt).not.toHaveBeenCalled();
  });

  it('pull-before-push: merges remote-unchanged file and pushes', async () => {
    // Remote unchanged from base; we modified locally → take-ours fast-forward (no conflict).
    const storage = makeStorage({
      id: 'p1',
      name: 'P',
      language: 'en',
      lastRemoteCommit: { tit: 'old-sha' },
    });
    await storage.writeFile('p1', '56-TIT.usfm', USFM_LOCAL);
    const baseSha = await gitBlobShaHex(USFM_BASE);
    await storage.setSyncShas('p1', { '56-TIT.usfm': baseSha });

    currentAdapterMock = mockAdapter({
      getRemoteHeadCommit: jest.fn().mockResolvedValue('new-sha'),
      pullFilesAt: jest.fn()
        // First call: theirs @ new-sha — same as base (remote unchanged)
        .mockResolvedValueOnce(new Map([['56-TIT.usfm', USFM_BASE]]))
        // Second call: base @ old-sha
        .mockResolvedValueOnce(new Map([['56-TIT.usfm', USFM_BASE]])),
    });

    const result = await syncLocalProjectWithDcs({
      storage,
      projectId: 'p1',
      token: 't',
      sync: SYNC_CONFIG,
      username: 'alice',
      bookCode: 'TIT',
    });

    expect(result.kind).toBe('synced');
    expect(currentAdapterMock.pushFiles).toHaveBeenCalledTimes(1);
  });

  it('CAS stale → retries up to 3 times then throws', async () => {
    const storage = makeStorage({ id: 'p1', name: 'P', language: 'en' });
    await storage.writeFile('p1', '56-TIT.usfm', USFM_LOCAL);

    const stalePushResult = { kind: 'stale', staleByPath: { '56-TIT.usfm': 'zzz' } };
    currentAdapterMock = mockAdapter({
      pushFiles: jest.fn().mockResolvedValue(stalePushResult),
    });

    await expect(
      syncLocalProjectWithDcs({
        storage,
        projectId: 'p1',
        token: 't',
        sync: SYNC_CONFIG,
        username: 'alice',
        bookCode: 'TIT',
      }),
    ).rejects.toThrow('Remote file(s) changed since last read');

    // Should have retried exactly 3 times (attempt 0, 1, 2)
    expect(currentAdapterMock.pushFiles).toHaveBeenCalledTimes(3);
  });

  it('surfaces file conflicts without pushing', async () => {
    // Both sides modified a plain-text file from the same base → unresolvable conflict.
    const storage = makeStorage({
      id: 'p1',
      name: 'P',
      language: 'en',
      lastRemoteCommit: { tit: 'old-sha' },
    });
    const BASE = 'line1\nline2\n';
    const OUR_VER = 'line1-ours\nline2\n';
    const THEIR_VER = 'line1-theirs\nline2\n';
    await storage.writeFile('p1', 'notes.txt', OUR_VER);
    const baseSha = await gitBlobShaHex(BASE);
    await storage.setSyncShas('p1', { 'notes.txt': baseSha });

    currentAdapterMock = mockAdapter({
      getRemoteHeadCommit: jest.fn().mockResolvedValue('remote-sha'),
      pullFilesAt: jest.fn()
        // theirs @ remote-sha
        .mockResolvedValueOnce(new Map([['notes.txt', THEIR_VER]]))
        // base @ old-sha
        .mockResolvedValueOnce(new Map([['notes.txt', BASE]])),
    });

    await expect(
      syncLocalProjectWithDcs({
        storage,
        projectId: 'p1',
        token: 't',
        sync: SYNC_CONFIG,
        username: 'alice',
        bookCode: 'TIT',
      }),
    ).rejects.toThrow(SyncConflictsError);

    // Push should not have been attempted
    expect(currentAdapterMock.pushFiles).not.toHaveBeenCalled();
  });

  it('silently deletes a file that remote has not changed but we deleted locally', async () => {
    const BASE = USFM_BASE;
    const storage = makeStorage({
      id: 'p1',
      name: 'P',
      language: 'en',
      lastRemoteCommit: { tit: 'old-sha' },
    });
    // We have NO file (locally deleted); syncShas still shows it as previously synced
    const baseSha = await gitBlobShaHex(BASE);
    await storage.setSyncShas('p1', { '56-TIT.usfm': baseSha });

    currentAdapterMock = mockAdapter({
      getRemoteHeadCommit: jest.fn().mockResolvedValue('new-sha'),
      // Both theirs and base are the same (remote unchanged)
      pullFilesAt: jest.fn().mockResolvedValue(new Map([['56-TIT.usfm', BASE]])),
    });

    const result = await syncLocalProjectWithDcs({
      storage,
      projectId: 'p1',
      token: 't',
      sync: SYNC_CONFIG,
      username: 'alice',
      bookCode: 'TIT',
    });

    expect(result.kind).toBe('synced');
    // File should not be in storage (silent delete)
    expect(await storage.readFile('p1', '56-TIT.usfm')).toBeNull();
  });
});

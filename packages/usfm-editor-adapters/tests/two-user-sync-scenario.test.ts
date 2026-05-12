/**
 * Two-user conflict simulation tests.
 *
 * These tests verify the full sync loop (merge + push + conflict detection)
 * using an in-memory adapter — no HTTP, no IndexedDB, no real git.
 *
 * Scenario A — non-overlapping edits auto-merge
 * Scenario B — same file, same verse, both users changed it → SyncConflictsError
 * Scenario C — same file, different verses → auto-merged
 * Scenario D — User B resolves conflict and retries → synced
 * Scenario E — first-sync fast-path: neither user has synced before
 */

import type { ProjectSyncConfig } from '@usfm-tools/types';
import {
  syncLocalProjectWithDcs,
  SyncConflictsError,
} from '../../usfm-editor-app/src/lib/dcs-project-sync';
import { MemoryRemote, MemoryProjectSyncAdapter } from './helpers/memory-sync-adapter';
import { makeStorage } from './helpers/make-storage';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Minimal ProjectSyncConfig — values not used by the injected-adapter path. */
const syncConfig: ProjectSyncConfig = {
  host: 'memory.test',
  owner: 'org',
  repo: 'tit-project',
  branch: 'main',
  targetType: 'org',
};

const PROJECT_ID = 'proj-1';

function syncAs(
  username: string,
  storage: ReturnType<typeof makeStorage>,
  adapter: MemoryProjectSyncAdapter,
) {
  return syncLocalProjectWithDcs({
    storage,
    projectId: PROJECT_ID,
    token: 'unused',
    sync: syncConfig,
    username,
    _adapter: adapter,
  });
}

// ---------------------------------------------------------------------------
// Scenario A — non-overlapping edits: auto-merged, no conflict
// ---------------------------------------------------------------------------

describe('Two-user sync — Scenario A: non-overlapping edits auto-merge', () => {
  const TIT_BASE = '\\id TIT\n\\c 1\n\\p\n\\v 1 Base verse one.\n\\v 2 Base verse two.\n';

  it('User A edits verse 1, User B edits verse 2 — merges silently', async () => {
    const remote = new MemoryRemote(new Map([['56-TIT.usfm', TIT_BASE]]));
    const adapterA = new MemoryProjectSyncAdapter(remote);
    const adapterB = new MemoryProjectSyncAdapter(remote);

    // Both users start by syncing — pulls the base state into their storage
    // and records lastPushedCommit so subsequent syncs know the common ancestor.
    const storageA = makeStorage({ id: PROJECT_ID, name: 'TIT', language: 'en' });
    await storageA.writeFile(PROJECT_ID, '56-TIT.usfm', TIT_BASE);
    const syncA1 = await syncAs('alice', storageA, adapterA);
    expect(syncA1.kind).toBe('synced');

    const storageB = makeStorage({ id: PROJECT_ID, name: 'TIT', language: 'en' });
    await storageB.writeFile(PROJECT_ID, '56-TIT.usfm', TIT_BASE);
    const syncB1 = await syncAs('bob', storageB, adapterB);
    expect(syncB1.kind).toBe('synced');

    // Alice edits verse 1 and pushes first.
    const titEditA = TIT_BASE.replace('Base verse one.', 'Alice edited verse one.');
    await storageA.writeFile(PROJECT_ID, '56-TIT.usfm', titEditA);
    const syncA2 = await syncAs('alice', storageA, adapterA);
    expect(syncA2.kind).toBe('synced');

    // Bob edits verse 2 (different location) and syncs.
    const titEditB = TIT_BASE.replace('Base verse two.', 'Bob edited verse two.');
    await storageB.writeFile(PROJECT_ID, '56-TIT.usfm', titEditB);
    const syncB2 = await syncAs('bob', storageB, adapterB);

    // Bob's sync should succeed — non-overlapping text-line edits auto-merge.
    expect(syncB2.kind).toBe('synced');

    // Remote should contain both edits.
    const remoteFiles = remote.getCurrentFiles();
    const merged = remoteFiles.get('56-TIT.usfm') ?? '';
    expect(merged).toContain('Alice edited verse one.');
    expect(merged).toContain('Bob edited verse two.');
  });
});

// ---------------------------------------------------------------------------
// Scenario B — both users edited the same verse → conflict surfaced
// ---------------------------------------------------------------------------

describe('Two-user sync — Scenario B: same-verse conflict surfaced', () => {
  const TIT_BASE = '\\id TIT\n\\c 1\n\\p\n\\v 1 Original verse one.\n';

  it('throws SyncConflictsError when both users changed the same verse differently', async () => {
    const remote = new MemoryRemote(new Map([['56-TIT.usfm', TIT_BASE]]));
    const adapterA = new MemoryProjectSyncAdapter(remote);
    const adapterB = new MemoryProjectSyncAdapter(remote);

    // Both users do an initial sync to record the common base anchor.
    const storageA = makeStorage({ id: PROJECT_ID, name: 'TIT', language: 'en' });
    await storageA.writeFile(PROJECT_ID, '56-TIT.usfm', TIT_BASE);
    await syncAs('alice', storageA, adapterA);

    const storageB = makeStorage({ id: PROJECT_ID, name: 'TIT', language: 'en' });
    await storageB.writeFile(PROJECT_ID, '56-TIT.usfm', TIT_BASE);
    await syncAs('bob', storageB, adapterB);

    // Alice edits verse 1 and pushes first.
    const titAlice = TIT_BASE.replace('Original verse one.', 'Alice version of verse one.');
    await storageA.writeFile(PROJECT_ID, '56-TIT.usfm', titAlice);
    await syncAs('alice', storageA, adapterA);

    // Bob also edited verse 1 differently and tries to sync.
    const titBob = TIT_BASE.replace('Original verse one.', 'Bob version of verse one.');
    await storageB.writeFile(PROJECT_ID, '56-TIT.usfm', titBob);

    await expect(syncAs('bob', storageB, adapterB)).rejects.toThrow(SyncConflictsError);

    // pendingConflicts should be recorded in Bob's storage.
    const meta = await storageB.getProject(PROJECT_ID);
    expect(meta?.pendingConflicts).toBeDefined();
    expect(meta!.pendingConflicts!.length).toBeGreaterThan(0);
    expect(meta!.pendingConflicts![0].path).toBe('56-TIT.usfm');
  });
});

// ---------------------------------------------------------------------------
// Scenario C — same file, different verses: plain-text 3-way auto-merge
// ---------------------------------------------------------------------------

describe('Two-user sync — Scenario C: different verses in same file auto-merge', () => {
  const TIT_BASE = [
    '\\id TIT',
    '\\c 1',
    '\\p',
    '\\v 1 Verse one original.',
    '\\v 2 Verse two original.',
    '\\v 3 Verse three original.',
    '',
  ].join('\n');

  it('auto-merges when each user edited a different verse', async () => {
    const remote = new MemoryRemote(new Map([['56-TIT.usfm', TIT_BASE]]));
    const adapterA = new MemoryProjectSyncAdapter(remote);
    const adapterB = new MemoryProjectSyncAdapter(remote);

    const storageA = makeStorage({ id: PROJECT_ID, name: 'TIT', language: 'en' });
    await storageA.writeFile(PROJECT_ID, '56-TIT.usfm', TIT_BASE);
    await syncAs('alice', storageA, adapterA);

    const storageB = makeStorage({ id: PROJECT_ID, name: 'TIT', language: 'en' });
    await storageB.writeFile(PROJECT_ID, '56-TIT.usfm', TIT_BASE);
    await syncAs('bob', storageB, adapterB);

    // Alice edits verse 1, Bob edits verse 3.
    const titAlice = TIT_BASE.replace('Verse one original.', 'Verse one — Alice.');
    await storageA.writeFile(PROJECT_ID, '56-TIT.usfm', titAlice);
    await syncAs('alice', storageA, adapterA);

    const titBob = TIT_BASE.replace('Verse three original.', 'Verse three — Bob.');
    await storageB.writeFile(PROJECT_ID, '56-TIT.usfm', titBob);

    const result = await syncAs('bob', storageB, adapterB);
    expect(result.kind).toBe('synced');

    const merged = remote.getCurrentFiles().get('56-TIT.usfm') ?? '';
    expect(merged).toContain('Verse one — Alice.');
    expect(merged).toContain('Verse three — Bob.');
  });
});

// ---------------------------------------------------------------------------
// Scenario D — Bob resolves conflict and retries → succeeds
// ---------------------------------------------------------------------------

describe('Two-user sync — Scenario D: conflict resolved and retried', () => {
  const TIT_BASE = '\\id TIT\n\\c 1\n\\p\n\\v 1 Original.\n';

  it('syncs successfully after the user accepts their resolution', async () => {
    const remote = new MemoryRemote(new Map([['56-TIT.usfm', TIT_BASE]]));
    const adapterA = new MemoryProjectSyncAdapter(remote);
    const adapterB = new MemoryProjectSyncAdapter(remote);

    const storageA = makeStorage({ id: PROJECT_ID, name: 'TIT', language: 'en' });
    await storageA.writeFile(PROJECT_ID, '56-TIT.usfm', TIT_BASE);
    await syncAs('alice', storageA, adapterA);

    const storageB = makeStorage({ id: PROJECT_ID, name: 'TIT', language: 'en' });
    await storageB.writeFile(PROJECT_ID, '56-TIT.usfm', TIT_BASE);
    await syncAs('bob', storageB, adapterB);

    // Alice pushes her edit first.
    await storageA.writeFile(PROJECT_ID, '56-TIT.usfm',
      TIT_BASE.replace('Original.', 'Alice.'));
    await syncAs('alice', storageA, adapterA);

    // Bob also edited — this causes a conflict.
    await storageB.writeFile(PROJECT_ID, '56-TIT.usfm',
      TIT_BASE.replace('Original.', 'Bob.'));
    await expect(syncAs('bob', storageB, adapterB)).rejects.toThrow(SyncConflictsError);

    // Bob resolves the conflict by "accepting theirs" (Alice's version).
    // This is the most common single-click resolution in the UI.
    const aliceVersion = TIT_BASE.replace('Original.', 'Alice.');
    await storageB.writeFile(PROJECT_ID, '56-TIT.usfm', aliceVersion);
    await storageB.updateProject(PROJECT_ID, { pendingConflicts: [] });

    // Retry — ours == theirs == Alice's version → auto-merged (no conflict).
    const retryResult = await syncAs('bob', storageB, adapterB);
    expect(retryResult.kind).toBe('synced');

    const final = remote.getCurrentFiles().get('56-TIT.usfm') ?? '';
    expect(final).toContain('Alice.');
  });
});

// ---------------------------------------------------------------------------
// Scenario E — fast-path noop when both users are up to date
// ---------------------------------------------------------------------------

describe('Two-user sync — Scenario E: noop when nothing changed', () => {
  it('returns noop when local and remote are identical', async () => {
    const initial = new Map([['56-TIT.usfm', '\\id TIT\n\\c 1\n\\p\n\\v 1 Stable.\n']]);
    const remote = new MemoryRemote(initial);
    const adapter = new MemoryProjectSyncAdapter(remote);

    const storage = makeStorage({ id: PROJECT_ID, name: 'TIT', language: 'en' });
    await storage.writeFile(PROJECT_ID, '56-TIT.usfm', '\\id TIT\n\\c 1\n\\p\n\\v 1 Stable.\n');

    // First sync — syncs the file.
    const first = await syncAs('alice', storage, adapter);
    expect(first.kind).toBe('synced');

    // Second sync immediately — nothing changed, should be noop.
    const second = await syncAs('alice', storage, adapter);
    expect(second.kind).toBe('noop');
  });
});

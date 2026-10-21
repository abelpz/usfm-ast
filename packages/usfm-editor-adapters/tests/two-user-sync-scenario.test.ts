/**
 * Two-user conflict simulation tests — in-memory, no HTTP.
 *
 * Each scenario uses MemoryRemote (shared "server") + MemoryProjectSyncAdapter
 * injected via the `_adapter` seam in syncLocalProjectWithDcs, so the full sync
 * loop (merge, CAS push, conflict detection, noop fast-path) runs identically
 * to what the real app does against DCS — just without network I/O.
 *
 * Scenarios
 * ---------
 *  A  Non-overlapping edits (verse 1 vs verse 2) → auto-merged
 *  B  Same verse, different text → SyncConflictsError + pendingConflicts stored
 *  C  Different verses in same file → plain-text 3-way auto-merge
 *  D  Conflict resolved ("accept theirs") → retry succeeds
 *  E  Nothing changed after sync → noop fast-path
 *  F  New file added by one user while other is unaware → remote-only import
 *  G  YAML manifest metadata-only drift → auto-merged (no human conflict)
 *  H  YAML manifest real-field conflict → SyncConflictsError
 *  I  Sync sidecar (.sync/*.json) always auto-merges → no human conflict
 *  J  CRDT (.ybin) companion present → never conflicts for concurrent edits
 *  K  File deleted by one user, edited by other → conflict surfaced
 *  L  Multiple files: some conflict, manifest auto-merges → only USFM conflict
 *  M  Third sync after A's push is noop for A (already up to date)
 */

import type { ProjectPushOutcome, ProjectSyncConfig, PushFilesOptions } from '@usfm-tools/types';
import {
  syncLocalProjectWithDcs,
  SyncConflictsError,
} from '../../usfm-editor-app/src/lib/dcs-project-sync';
import { crdtPathFromUsfm, usfmToYjsBase64, updateYjsBase64WithUsfm } from '../src';
import { MemoryRemote, MemoryProjectSyncAdapter } from './helpers/memory-sync-adapter';
import { makeStorage } from './helpers/make-storage';

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const SYNC_CONFIG: ProjectSyncConfig = {
  host: 'memory.test',
  owner: 'org',
  repo: 'test-project',
  branch: 'main',
  targetType: 'org',
};

const PID = 'proj-1';

function sync(
  username: string,
  storage: ReturnType<typeof makeStorage>,
  adapter: MemoryProjectSyncAdapter,
  bookCode?: string,
) {
  return syncLocalProjectWithDcs({
    storage,
    projectId: PID,
    token: 'unused',
    sync: SYNC_CONFIG,
    username,
    bookCode,
    _adapter: adapter,
  });
}

/** Shorthand: create storage with one USFM file already written. */
async function userStorage(content: string) {
  const s = makeStorage({ id: PID, name: 'Test', language: 'en' });
  await s.writeFile(PID, '56-TIT.usfm', content);
  return s;
}

// ---------------------------------------------------------------------------
// USFM fixtures
// ---------------------------------------------------------------------------

const TIT_BASE = [
  '\\id TIT',
  '\\c 1',
  '\\p',
  '\\v 1 Verse one original.',
  '\\v 2 Verse two original.',
  '\\v 3 Verse three original.',
  '',
].join('\n');

// ---------------------------------------------------------------------------
// Scenario A — non-overlapping verse edits: auto-merged
// ---------------------------------------------------------------------------

describe('Scenario A — non-overlapping edits auto-merge', () => {
  it('Alice edits v1, Bob edits v2 → both changes land on remote', async () => {
    const remote = new MemoryRemote(new Map([['56-TIT.usfm', TIT_BASE]]));
    const adA = new MemoryProjectSyncAdapter(remote);
    const adB = new MemoryProjectSyncAdapter(remote);

    // Both users do an initial sync to record the common base anchor.
    const sA = await userStorage(TIT_BASE);
    await sync('alice', sA, adA);

    const sB = await userStorage(TIT_BASE);
    await sync('bob', sB, adB);

    // Alice edits verse 1.
    await sA.writeFile(PID, '56-TIT.usfm', TIT_BASE.replace('Verse one original.', 'Alice — verse one.'));
    await sync('alice', sA, adA);

    // Bob edits verse 2 (different location).
    await sB.writeFile(PID, '56-TIT.usfm', TIT_BASE.replace('Verse two original.', 'Bob — verse two.'));
    const result = await sync('bob', sB, adB);

    expect(result.kind).toBe('synced');
    const merged = remote.getCurrentFiles().get('56-TIT.usfm') ?? '';
    expect(merged).toContain('Alice — verse one.');
    expect(merged).toContain('Bob — verse two.');
  });
});

// ---------------------------------------------------------------------------
// Scenario B — same verse, different text → conflict surfaced
// ---------------------------------------------------------------------------

describe('Scenario B — same-verse conflict surfaced', () => {
  it('throws SyncConflictsError and stores pendingConflicts', async () => {
    const remote = new MemoryRemote(new Map([['56-TIT.usfm', TIT_BASE]]));
    const adA = new MemoryProjectSyncAdapter(remote);
    const adB = new MemoryProjectSyncAdapter(remote);

    const sA = await userStorage(TIT_BASE);
    await sync('alice', sA, adA);
    const sB = await userStorage(TIT_BASE);
    await sync('bob', sB, adB);

    await sA.writeFile(PID, '56-TIT.usfm', TIT_BASE.replace('Verse one original.', 'Alice version.'));
    await sync('alice', sA, adA);

    await sB.writeFile(PID, '56-TIT.usfm', TIT_BASE.replace('Verse one original.', 'Bob version.'));
    await expect(sync('bob', sB, adB)).rejects.toThrow(SyncConflictsError);

    const meta = await sB.getProject(PID);
    expect(meta?.pendingConflicts?.length).toBeGreaterThan(0);
    expect(meta!.pendingConflicts![0].path).toBe('56-TIT.usfm');
    // Both ours and theirs should be present in the conflict.
    expect(meta!.pendingConflicts![0].oursText).toContain('Bob version.');
    expect(meta!.pendingConflicts![0].theirsText).toContain('Alice version.');
  });
});

// ---------------------------------------------------------------------------
// Scenario C — different verses in same file → plain-text 3-way auto-merge
// ---------------------------------------------------------------------------

describe('Scenario C — different verses in same file auto-merge', () => {
  it('Alice edits v1, Bob edits v3 → auto-merged', async () => {
    const remote = new MemoryRemote(new Map([['56-TIT.usfm', TIT_BASE]]));
    const adA = new MemoryProjectSyncAdapter(remote);
    const adB = new MemoryProjectSyncAdapter(remote);

    const sA = await userStorage(TIT_BASE);
    await sync('alice', sA, adA);
    const sB = await userStorage(TIT_BASE);
    await sync('bob', sB, adB);

    await sA.writeFile(PID, '56-TIT.usfm', TIT_BASE.replace('Verse one original.', 'Alice — v1.'));
    await sync('alice', sA, adA);

    await sB.writeFile(PID, '56-TIT.usfm', TIT_BASE.replace('Verse three original.', 'Bob — v3.'));
    const result = await sync('bob', sB, adB);

    expect(result.kind).toBe('synced');
    const merged = remote.getCurrentFiles().get('56-TIT.usfm') ?? '';
    expect(merged).toContain('Alice — v1.');
    expect(merged).toContain('Bob — v3.');
  });
});

// ---------------------------------------------------------------------------
// Scenario D — conflict resolved ("accept theirs") → retry succeeds
// ---------------------------------------------------------------------------

describe('Scenario D — conflict resolved and retried', () => {
  it('syncs after user accepts remote version', async () => {
    const remote = new MemoryRemote(new Map([['56-TIT.usfm', TIT_BASE]]));
    const adA = new MemoryProjectSyncAdapter(remote);
    const adB = new MemoryProjectSyncAdapter(remote);

    const sA = await userStorage(TIT_BASE);
    await sync('alice', sA, adA);
    const sB = await userStorage(TIT_BASE);
    await sync('bob', sB, adB);

    const aliceVersion = TIT_BASE.replace('Verse one original.', 'Alice final.');
    await sA.writeFile(PID, '56-TIT.usfm', aliceVersion);
    await sync('alice', sA, adA);

    await sB.writeFile(PID, '56-TIT.usfm', TIT_BASE.replace('Verse one original.', 'Bob final.'));
    await expect(sync('bob', sB, adB)).rejects.toThrow(SyncConflictsError);

    // Bob reviews and accepts "theirs" (Alice's version).
    await sB.writeFile(PID, '56-TIT.usfm', aliceVersion);
    await sB.updateProject(PID, { pendingConflicts: [] });

    const retry = await sync('bob', sB, adB);
    expect(retry.kind).toBe('synced');
    expect(remote.getCurrentFiles().get('56-TIT.usfm')).toContain('Alice final.');
  });
});

// ---------------------------------------------------------------------------
// Scenario E — noop fast-path when nothing changed
// ---------------------------------------------------------------------------

describe('Scenario E — noop when nothing changed', () => {
  it('returns noop on the second sync when remote and local are identical', async () => {
    const remote = new MemoryRemote(new Map([['56-TIT.usfm', TIT_BASE]]));
    const ad = new MemoryProjectSyncAdapter(remote);
    const s = await userStorage(TIT_BASE);

    const first = await sync('alice', s, ad);
    expect(first.kind).toBe('synced');

    const second = await sync('alice', s, ad);
    expect(second.kind).toBe('noop');
  });
});

// ---------------------------------------------------------------------------
// Scenario F — remote-only new file imported silently
// ---------------------------------------------------------------------------

describe('Scenario F — remote-only file imported on pull', () => {
  it('Bob gets Alice\'s new file without conflict when Bob never had it', async () => {
    const remote = new MemoryRemote(new Map([['56-TIT.usfm', TIT_BASE]]));
    const adA = new MemoryProjectSyncAdapter(remote);
    const adB = new MemoryProjectSyncAdapter(remote);

    const sA = await userStorage(TIT_BASE);
    await sync('alice', sA, adA);

    const sB = await userStorage(TIT_BASE);
    await sync('bob', sB, adB);

    // Alice creates a brand-new book file and pushes.
    const PHM_CONTENT = '\\id PHM\n\\c 1\n\\p\n\\v 1 Paul to Philemon.\n';
    await sA.writeFile(PID, '57-PHM.usfm', PHM_CONTENT);
    await sync('alice', sA, adA);

    // Bob syncs — should pull Alice's new file without conflict.
    const result = await sync('bob', sB, adB);
    expect(result.kind).toBe('synced');

    // Bob's storage should now contain the new file.
    const imported = await sB.readFile(PID, '57-PHM.usfm');
    expect(imported).toContain('Paul to Philemon.');
  });
});

// ---------------------------------------------------------------------------
// Scenario G — YAML manifest metadata-only drift → auto-merged
// ---------------------------------------------------------------------------

describe('Scenario G — YAML manifest metadata-only drift auto-merges', () => {
  const MANIFEST_BASE = [
    'dublin_core:',
    '  title: Titus',
    '  modified: "2024-01-01"',
    '  language:',
    '    identifier: en',
  ].join('\n') + '\n';

  it('both sides update dublin_core.modified differently → merged silently', async () => {
    const remote = new MemoryRemote(new Map([
      ['56-TIT.usfm', TIT_BASE],
      ['manifest.yaml', MANIFEST_BASE],
    ]));
    const adA = new MemoryProjectSyncAdapter(remote);
    const adB = new MemoryProjectSyncAdapter(remote);

    const sA = makeStorage({ id: PID, name: 'Test', language: 'en' });
    await sA.writeFile(PID, '56-TIT.usfm', TIT_BASE);
    await sA.writeFile(PID, 'manifest.yaml', MANIFEST_BASE);
    await sync('alice', sA, adA);

    const sB = makeStorage({ id: PID, name: 'Test', language: 'en' });
    await sB.writeFile(PID, '56-TIT.usfm', TIT_BASE);
    await sB.writeFile(PID, 'manifest.yaml', MANIFEST_BASE);
    await sync('bob', sB, adB);

    // Both update manifest.modified to different timestamps (metadata-only drift).
    const manifestA = MANIFEST_BASE.replace('"2024-01-01"', '"2026-05-12"');
    await sA.writeFile(PID, 'manifest.yaml', manifestA);
    await sync('alice', sA, adA);

    const manifestB = MANIFEST_BASE.replace('"2024-01-01"', '"2026-05-13"');
    await sB.writeFile(PID, 'manifest.yaml', manifestB);
    const result = await sync('bob', sB, adB);

    // Metadata-only drift in YAML → auto-merged, no conflict.
    expect(result.kind).toBe('synced');
    const merged = remote.getCurrentFiles().get('manifest.yaml') ?? '';
    expect(merged).toContain('title: Titus');
  });
});

// ---------------------------------------------------------------------------
// Scenario H — YAML manifest real-field conflict → conflict surfaced
// ---------------------------------------------------------------------------

describe('Scenario H — YAML manifest real-field conflict surfaced', () => {
  const MANIFEST_BASE = 'dublin_core:\n  title: Old Title\n  modified: "2024-01-01"\n';

  it('both sides change title to different values → SyncConflictsError', async () => {
    const remote = new MemoryRemote(new Map([
      ['56-TIT.usfm', TIT_BASE],
      ['manifest.yaml', MANIFEST_BASE],
    ]));
    const adA = new MemoryProjectSyncAdapter(remote);
    const adB = new MemoryProjectSyncAdapter(remote);

    const sA = makeStorage({ id: PID, name: 'Test', language: 'en' });
    await sA.writeFile(PID, '56-TIT.usfm', TIT_BASE);
    await sA.writeFile(PID, 'manifest.yaml', MANIFEST_BASE);
    await sync('alice', sA, adA);

    const sB = makeStorage({ id: PID, name: 'Test', language: 'en' });
    await sB.writeFile(PID, '56-TIT.usfm', TIT_BASE);
    await sB.writeFile(PID, 'manifest.yaml', MANIFEST_BASE);
    await sync('bob', sB, adB);

    await sA.writeFile(PID, 'manifest.yaml', MANIFEST_BASE.replace('Old Title', 'Alice Title'));
    await sync('alice', sA, adA);

    await sB.writeFile(PID, 'manifest.yaml', MANIFEST_BASE.replace('Old Title', 'Bob Title'));
    await expect(sync('bob', sB, adB)).rejects.toThrow(SyncConflictsError);

    const meta = await sB.getProject(PID);
    const conflict = meta!.pendingConflicts!.find((c) => c.path === 'manifest.yaml');
    expect(conflict).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Scenario I — sync sidecar (.sync/*.json) always auto-merges
// ---------------------------------------------------------------------------

describe('Scenario I — sync sidecar auto-merges without human conflict', () => {
  it('diverged baseBlobSha and savedAt never surface as a conflict', async () => {
    const sidecarPath = '.sync/TIT.json';
    const baseSidecar = JSON.stringify({
      schema: 1, docId: 'TPS:TIT',
      baseBlobSha: 'sha-base',
      vectorClock: { alice: 1 },
      savedAt: '2026-05-11T12:00:00Z',
    });

    const remote = new MemoryRemote(new Map([
      ['56-TIT.usfm', TIT_BASE],
      [sidecarPath, baseSidecar],
    ]));
    const adA = new MemoryProjectSyncAdapter(remote);
    const adB = new MemoryProjectSyncAdapter(remote);

    const sA = makeStorage({ id: PID, name: 'Test', language: 'en' });
    await sA.writeFile(PID, '56-TIT.usfm', TIT_BASE);
    await sA.writeFile(PID, sidecarPath, baseSidecar);
    await sync('alice', sA, adA);

    const sB = makeStorage({ id: PID, name: 'Test', language: 'en' });
    await sB.writeFile(PID, '56-TIT.usfm', TIT_BASE);
    await sB.writeFile(PID, sidecarPath, baseSidecar);
    await sync('bob', sB, adB);

    // Alice updates her sidecar (different blob sha + timestamp, higher clock).
    const sidecarA = JSON.stringify({
      schema: 1, docId: 'TPS:TIT',
      baseBlobSha: 'sha-alice-pushed',
      vectorClock: { alice: 5 },
      savedAt: '2026-05-12T14:00:00Z',
    });
    await sA.writeFile(PID, sidecarPath, sidecarA);
    await sync('alice', sA, adA);

    // Bob has his own diverged sidecar.
    const sidecarB = JSON.stringify({
      schema: 1, docId: 'TPS:TIT',
      baseBlobSha: 'sha-bob-local',
      vectorClock: { alice: 3, bob: 7 },
      savedAt: '2026-05-11T23:00:00Z',
    });
    await sB.writeFile(PID, sidecarPath, sidecarB);

    // Must NOT throw — sidecar divergence is always resolved automatically.
    const result = await sync('bob', sB, adB);
    expect(result.kind).toBe('synced');

    // Merged sidecar should have max clock per actor.
    const merged = remote.getCurrentFiles().get(sidecarPath) ?? '';
    const mergedObj = JSON.parse(merged) as { vectorClock: Record<string, number> };
    expect(mergedObj.vectorClock.alice).toBe(5);  // max(5, 3)
    expect(mergedObj.vectorClock.bob).toBe(7);    // only Bob had it
  });
});

// ---------------------------------------------------------------------------
// Scenario J — CRDT (.ybin) companion: concurrent edits never conflict
// ---------------------------------------------------------------------------

describe('Scenario J — CRDT-backed USFM: concurrent edits auto-merged via Yjs', () => {
  it('two users edit different verses with .ybin companion → no conflict', async () => {
    const ybinPath = crdtPathFromUsfm('56-TIT.usfm');
    const baseYbin = usfmToYjsBase64(TIT_BASE);

    const remote = new MemoryRemote(new Map([
      ['56-TIT.usfm', TIT_BASE],
      [ybinPath, baseYbin],
    ]));
    const adA = new MemoryProjectSyncAdapter(remote);
    const adB = new MemoryProjectSyncAdapter(remote);

    const sA = makeStorage({ id: PID, name: 'Test', language: 'en' });
    await sA.writeFile(PID, '56-TIT.usfm', TIT_BASE);
    await sA.writeFile(PID, ybinPath, baseYbin);
    await sync('alice', sA, adA);

    const sB = makeStorage({ id: PID, name: 'Test', language: 'en' });
    await sB.writeFile(PID, '56-TIT.usfm', TIT_BASE);
    await sB.writeFile(PID, ybinPath, baseYbin);
    await sync('bob', sB, adB);

    // Alice edits verse 1 and writes updated .ybin.
    const titAlice = TIT_BASE.replace('Verse one original.', 'CRDT Alice v1.');
    const ybinAlice = updateYjsBase64WithUsfm(baseYbin, titAlice);
    await sA.writeFile(PID, '56-TIT.usfm', titAlice);
    await sA.writeFile(PID, ybinPath, ybinAlice);
    await sync('alice', sA, adA);

    // Bob edits verse 3 (different verse) and writes updated .ybin.
    const titBob = TIT_BASE.replace('Verse three original.', 'CRDT Bob v3.');
    const ybinBob = updateYjsBase64WithUsfm(baseYbin, titBob);
    await sB.writeFile(PID, '56-TIT.usfm', titBob);
    await sB.writeFile(PID, ybinPath, ybinBob);

    // CRDT merge — should never conflict.
    const result = await sync('bob', sB, adB);
    expect(result.kind).toBe('synced');

    // Remote USFM should contain both edits.
    const finalUsfm = remote.getCurrentFiles().get('56-TIT.usfm') ?? '';
    expect(finalUsfm).toContain('CRDT Alice v1.');
    expect(finalUsfm).toContain('CRDT Bob v3.');
    expect(finalUsfm.match(/^\\id\b/gm)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Scenario K — delete/modify conflict: one user deletes, other edits
// ---------------------------------------------------------------------------

describe('Scenario K — delete/modify conflict', () => {
  it('surfaces conflict when Alice deletes a file Bob has edited', async () => {
    const remote = new MemoryRemote(new Map([
      ['56-TIT.usfm', TIT_BASE],
      ['57-PHM.usfm', '\\id PHM\n\\c 1\n\\p\n\\v 1 Original.\n'],
    ]));
    const adA = new MemoryProjectSyncAdapter(remote);
    const adB = new MemoryProjectSyncAdapter(remote);

    const sA = makeStorage({ id: PID, name: 'Test', language: 'en' });
    await sA.writeFile(PID, '56-TIT.usfm', TIT_BASE);
    await sA.writeFile(PID, '57-PHM.usfm', '\\id PHM\n\\c 1\n\\p\n\\v 1 Original.\n');
    await sync('alice', sA, adA);

    const sB = makeStorage({ id: PID, name: 'Test', language: 'en' });
    await sB.writeFile(PID, '56-TIT.usfm', TIT_BASE);
    await sB.writeFile(PID, '57-PHM.usfm', '\\id PHM\n\\c 1\n\\p\n\\v 1 Original.\n');
    await sync('bob', sB, adB);

    // Alice deletes PHM and pushes.
    await sA.deleteFile(PID, '57-PHM.usfm');
    await sync('alice', sA, adA);

    // Bob edits PHM and syncs — delete/modify conflict.
    await sB.writeFile(PID, '57-PHM.usfm', '\\id PHM\n\\c 1\n\\p\n\\v 1 Bob edited.\n');
    await expect(sync('bob', sB, adB)).rejects.toThrow(SyncConflictsError);

    const meta = await sB.getProject(PID);
    const conflict = meta!.pendingConflicts!.find((c) => c.path === '57-PHM.usfm');
    expect(conflict).toBeDefined();
    // theirsText = '' signals "remotely deleted".
    expect(conflict!.theirsText).toBe('');
    expect(conflict!.oursText).toContain('Bob edited.');
  });
});

// ---------------------------------------------------------------------------
// Scenario L — multiple files: only the conflicted USFM surfaces, manifest
//              metadata-only drift auto-merges in the same sync
// ---------------------------------------------------------------------------

describe('Scenario L — mixed: USFM conflict + manifest metadata auto-merge', () => {
  const MANIFEST = 'dublin_core:\n  title: Titus\n  modified: "2024-01-01"\n';

  it('only USFM file raises conflict; manifest is merged silently in the same run', async () => {
    const remote = new MemoryRemote(new Map([
      ['56-TIT.usfm', TIT_BASE],
      ['manifest.yaml', MANIFEST],
    ]));
    const adA = new MemoryProjectSyncAdapter(remote);
    const adB = new MemoryProjectSyncAdapter(remote);

    const sA = makeStorage({ id: PID, name: 'Test', language: 'en' });
    await sA.writeFile(PID, '56-TIT.usfm', TIT_BASE);
    await sA.writeFile(PID, 'manifest.yaml', MANIFEST);
    await sync('alice', sA, adA);

    const sB = makeStorage({ id: PID, name: 'Test', language: 'en' });
    await sB.writeFile(PID, '56-TIT.usfm', TIT_BASE);
    await sB.writeFile(PID, 'manifest.yaml', MANIFEST);
    await sync('bob', sB, adB);

    // Alice edits verse 1 and updates manifest.modified.
    await sA.writeFile(PID, '56-TIT.usfm', TIT_BASE.replace('Verse one original.', 'Alice v1.'));
    await sA.writeFile(PID, 'manifest.yaml', MANIFEST.replace('"2024-01-01"', '"2026-05-12"'));
    await sync('alice', sA, adA);

    // Bob also edits verse 1 (conflict!) and updates manifest.modified differently.
    await sB.writeFile(PID, '56-TIT.usfm', TIT_BASE.replace('Verse one original.', 'Bob v1.'));
    await sB.writeFile(PID, 'manifest.yaml', MANIFEST.replace('"2024-01-01"', '"2026-05-13"'));

    await expect(sync('bob', sB, adB)).rejects.toThrow(SyncConflictsError);

    const meta = await sB.getProject(PID);
    // Only USFM conflict — manifest auto-merged.
    expect(meta!.pendingConflicts!.length).toBe(1);
    expect(meta!.pendingConflicts![0].path).toBe('56-TIT.usfm');
  });
});

// ---------------------------------------------------------------------------
// Scenario M — Alice's second sync is noop (remote advanced, but she already
//              pushed it — no local changes, no remote delta)
// ---------------------------------------------------------------------------

describe('Scenario M — noop for already-synced user after remote advances', () => {
  it('Alice is noop on second sync after Bob also pushed (same content)', async () => {
    const remote = new MemoryRemote(new Map([['56-TIT.usfm', TIT_BASE]]));
    const adA = new MemoryProjectSyncAdapter(remote);
    const adB = new MemoryProjectSyncAdapter(remote);

    const sA = await userStorage(TIT_BASE);
    await sync('alice', sA, adA);
    const sB = await userStorage(TIT_BASE);
    await sync('bob', sB, adB);

    // Alice edits and pushes.
    const titAlice = TIT_BASE.replace('Verse one original.', 'Alice v1.');
    await sA.writeFile(PID, '56-TIT.usfm', titAlice);
    const syncA2 = await sync('alice', sA, adA);
    expect(syncA2.kind).toBe('synced');

    // Immediately sync Alice again — nothing changed locally and she's the head.
    const syncA3 = await sync('alice', sA, adA);
    expect(syncA3.kind).toBe('noop');
  });
});

// ---------------------------------------------------------------------------
// Scenario N - stale self-conflict: remote sidecar is already in local history
// ---------------------------------------------------------------------------

describe('Scenario N - stale self-conflict auto-resolves', () => {
  it('keeps the local edit when the remote book snapshot is an older self save', async () => {
    const baseSidecar = JSON.stringify({
      schema: 1,
      docId: `${PID}:TIT`,
      vectorClock: { user: 1 },
      savedAt: '2026-01-01T00:00:00Z',
    });
    const remoteSidecar = JSON.stringify({
      schema: 1,
      docId: `${PID}:TIT`,
      vectorClock: { user: 2 },
      savedAt: '2026-01-01T00:01:00Z',
    });
    const localSidecar = JSON.stringify({
      schema: 1,
      docId: `${PID}:TIT`,
      vectorClock: { user: 4 },
      savedAt: '2026-01-01T00:02:00Z',
    });

    const remote = new MemoryRemote(new Map([
      ['56-TIT.usfm', TIT_BASE],
      ['.sync/TIT.json', baseSidecar],
    ]));
    const baseSha = remote.getHead();
    remote.push(new Map([
      ['56-TIT.usfm', TIT_BASE.replace('Verse one original.', 'Older remote self edit.')],
      ['.sync/TIT.json', remoteSidecar],
    ]));

    const storage = makeStorage({
      id: PID,
      name: 'Test',
      language: 'en',
      lastPushedCommit: { tit: baseSha },
    });
    await storage.writeFile(PID, '56-TIT.usfm', TIT_BASE.replace('Verse one original.', 'Newest local self edit.'));
    await storage.writeFile(PID, '.sync/TIT.json', localSidecar);

    const result = await sync('user', storage, new MemoryProjectSyncAdapter(remote), 'TIT');

    expect(result.kind).toBe('synced');
    const merged = remote.getCurrentFiles().get('56-TIT.usfm') ?? '';
    expect(merged).toContain('Newest local self edit.');
    expect(merged).not.toContain('Older remote self edit.');
    const meta = await storage.getProject(PID);
    expect(meta!.pendingConflicts).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Scenario O - real multi-user conflict: remote has an uncovered actor clock
// ---------------------------------------------------------------------------

describe('Scenario O - multi-user conflict still surfaces', () => {
  it('does not apply stale-self auto-resolution to another user edit', async () => {
    const sidecarPath = '.sync/TIT.json';
    const baseSidecar = JSON.stringify({
      schema: 1,
      docId: `${PID}:TIT`,
      vectorClock: { system: 1 },
      savedAt: '2026-01-01T00:00:00Z',
    });
    const remote = new MemoryRemote(new Map([
      ['56-TIT.usfm', TIT_BASE],
      [sidecarPath, baseSidecar],
    ]));
    const adA = new MemoryProjectSyncAdapter(remote);
    const adB = new MemoryProjectSyncAdapter(remote);

    const sA = await userStorage(TIT_BASE);
    await sA.writeFile(PID, sidecarPath, baseSidecar);
    await sync('alice', sA, adA, 'TIT');

    const sB = await userStorage(TIT_BASE);
    await sB.writeFile(PID, sidecarPath, baseSidecar);
    await sync('bob', sB, adB, 'TIT');

    await sA.writeFile(PID, '56-TIT.usfm', TIT_BASE.replace('Verse one original.', 'Alice v1.'));
    await sA.writeFile(PID, sidecarPath, JSON.stringify({
      schema: 1,
      docId: `${PID}:TIT`,
      vectorClock: { system: 1, alice: 2 },
      savedAt: '2026-01-01T00:01:00Z',
    }));
    await sync('alice', sA, adA, 'TIT');

    await sB.writeFile(PID, '56-TIT.usfm', TIT_BASE.replace('Verse one original.', 'Bob v1.'));
    await sB.writeFile(PID, sidecarPath, JSON.stringify({
      schema: 1,
      docId: `${PID}:TIT`,
      vectorClock: { system: 1, bob: 2 },
      savedAt: '2026-01-01T00:01:30Z',
    }));

    await expect(sync('bob', sB, adB, 'TIT')).rejects.toThrow(SyncConflictsError);
    const meta = await sB.getProject(PID);
    expect(meta!.pendingConflicts![0].path).toBe('56-TIT.usfm');
  });
});

// ---------------------------------------------------------------------------
// Scenario P - same Door43 user on two devices still has distinct actor clocks
// ---------------------------------------------------------------------------

describe('Scenario P - same account on two devices still conflicts correctly', () => {
  it('does not treat another device actor as stale local history', async () => {
    const sidecarPath = '.sync/TIT.json';
    const baseSidecar = JSON.stringify({
      schema: 1,
      docId: `${PID}:TIT`,
      vectorClock: { system: 1 },
      savedAt: '2026-01-01T00:00:00Z',
    });
    const remote = new MemoryRemote(new Map([
      ['56-TIT.usfm', TIT_BASE],
      [sidecarPath, baseSidecar],
    ]));
    const adLaptop = new MemoryProjectSyncAdapter(remote);
    const adDesktop = new MemoryProjectSyncAdapter(remote);

    const laptop = await userStorage(TIT_BASE);
    await laptop.writeFile(PID, sidecarPath, baseSidecar);
    await sync('same-user', laptop, adLaptop, 'TIT');

    const desktop = await userStorage(TIT_BASE);
    await desktop.writeFile(PID, sidecarPath, baseSidecar);
    await sync('same-user', desktop, adDesktop, 'TIT');

    await laptop.writeFile(PID, '56-TIT.usfm', TIT_BASE.replace('Verse one original.', 'Laptop v1.'));
    await laptop.writeFile(PID, sidecarPath, JSON.stringify({
      schema: 1,
      docId: `${PID}:TIT`,
      vectorClock: { system: 1, 'same-user@laptop': 2 },
      savedAt: '2026-01-01T00:01:00Z',
    }));
    await sync('same-user', laptop, adLaptop, 'TIT');

    await desktop.writeFile(PID, '56-TIT.usfm', TIT_BASE.replace('Verse one original.', 'Desktop v1.'));
    await desktop.writeFile(PID, sidecarPath, JSON.stringify({
      schema: 1,
      docId: `${PID}:TIT`,
      vectorClock: { system: 1, 'same-user@desktop': 2 },
      savedAt: '2026-01-01T00:01:30Z',
    }));

    await expect(sync('same-user', desktop, adDesktop, 'TIT')).rejects.toThrow(SyncConflictsError);
    const meta = await desktop.getProject(PID);
    expect(meta!.pendingConflicts![0].path).toBe('56-TIT.usfm');
  });
});

// ---------------------------------------------------------------------------
// Scenario Q - stale CAS means restart pull/merge, not overwrite
// ---------------------------------------------------------------------------

describe('Scenario Q - stale push restarts sync and preserves remote edits', () => {
  class StaleOnceAdapter extends MemoryProjectSyncAdapter {
    private staleInjected = false;

    constructor(
      private readonly remoteRef: MemoryRemote,
      private readonly remoteEdit: string,
    ) {
      super(remoteRef);
    }

    async pushFiles(
      localFiles: Map<string, string>,
      message: string,
      options?: PushFilesOptions,
    ): Promise<ProjectPushOutcome> {
      if (!this.staleInjected) {
        this.staleInjected = true;
        this.remoteRef.push(new Map([
          ['56-TIT.usfm', this.remoteEdit],
        ]));
      }
      return super.pushFiles(localFiles, message, options);
    }
  }

  it('re-pulls and merges a remote edit that appears between read and push', async () => {
    const remote = new MemoryRemote(new Map([['56-TIT.usfm', TIT_BASE]]));
    const baseSha = remote.getHead();
    const storage = makeStorage({
      id: PID,
      name: 'Test',
      language: 'en',
      lastPushedCommit: { tit: baseSha },
      lastRemoteCommit: { tit: baseSha },
    });
    await storage.writeFile(PID, '56-TIT.usfm', TIT_BASE.replace('Verse one original.', 'Local v1.'));

    const remoteEdit = TIT_BASE.replace('Verse three original.', 'Remote v3.');
    const result = await sync('alice', storage, new StaleOnceAdapter(remote, remoteEdit), 'TIT');

    expect(result.kind).toBe('synced');
    const finalUsfm = remote.getCurrentFiles().get('56-TIT.usfm') ?? '';
    expect(finalUsfm).toContain('Local v1.');
    expect(finalUsfm).toContain('Remote v3.');
  });
});

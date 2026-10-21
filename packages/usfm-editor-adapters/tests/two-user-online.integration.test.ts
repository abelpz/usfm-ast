/**
 * Online two-user conflict integration tests — runs against qa.door43.org.
 *
 * These tests exercise the SAME scenarios as two-user-sync-scenario.test.ts
 * but use real HTTP calls via DcsRestProjectSync — zero mocking.  They confirm
 * that the in-memory results match what the real DCS API produces.
 *
 * Prerequisites
 * -------------
 * Fill in `.env.qa` at the repo root and set `QA_INTEGRATION=1`:
 *
 *   QA_HOST=https://qa.door43.org
 *   QA_USER1_USERNAME=...
 *   QA_USER1_PASSWORD=...
 *   QA_USER2_USERNAME=...
 *   QA_USER2_PASSWORD=...
 *   QA_REPO_PREFIX=usfm-ast-test   # optional, default value shown
 *
 * Run:
 *   QA_INTEGRATION=1 bun run test --filter=@usfm-tools/editor-adapters \
 *     -- --testPathPattern="two-user-online"
 *
 * Scenarios mirroring the in-memory suite (A–M)
 * -----------------------------------------------
 *  OA  Non-overlapping edits → auto-merged on remote
 *  OB  Same verse, different text → SyncConflictsError with pendingConflicts
 *  OC  Different verses in same file → plain-text 3-way auto-merge
 *  OD  Conflict resolved ("accept theirs") → retry succeeds
 *  OE  Noop fast-path after sync with no local changes
 *  OF  YAML manifest metadata-only drift → auto-merged, no conflict
 *  OG  Remote-only new file imported silently (in-memory F)
 *  OH  Delete/modify conflict (in-memory K)
 *  OI  Sync sidecar (.sync/*.json) always auto-merges (in-memory I)
 *  OJ  Mixed: USFM conflict + manifest metadata auto-merge (in-memory L)
 *  OK  YAML real-field conflict surfaced (in-memory H)
 *  OL  Noop for already-synced user after remote advances (in-memory M)
 */

import type { ProjectSyncConfig } from '@usfm-tools/types';
import {
  syncLocalProjectWithDcs,
  SyncConflictsError,
} from '../../usfm-editor-app/src/lib/dcs-project-sync';
import { getQaDescribe } from './helpers/qa-env';
import {
  loginAllQaUsers,
  logoutAllQaUsers,
  createTestRepo,
  deleteTestRepo,
  addCollaborator,
  type QaSession,
} from './helpers/qa-users';
import { makeStorage } from './helpers/make-storage';

// ---------------------------------------------------------------------------
// QA guard
// ---------------------------------------------------------------------------

const { describeQa, qa } = getQaDescribe();

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

let sessions: [QaSession, QaSession] = [] as unknown as [QaSession, QaSession];
let testRepo = '';

const owner = () => sessions[0].username;

function syncConfig(): ProjectSyncConfig {
  return {
    host: qa.host,
    owner: owner(),
    repo: testRepo,
    branch: 'main',
    targetType: 'user',
  };
}

const PID = 'qa-proj';

/** Sync user's storage against the real DCS repo. */
function syncOnline(username: string, storage: ReturnType<typeof makeStorage>, token: string) {
  return syncLocalProjectWithDcs({
    storage,
    projectId: PID,
    token,
    sync: syncConfig(),
    username,
  });
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
// Lifecycle
// ---------------------------------------------------------------------------

describeQa('QA online — two-user conflict scenarios', () => {
  beforeAll(async () => {
    sessions = await loginAllQaUsers(qa);
    testRepo = await createTestRepo(sessions[0], {
      owner: sessions[0].username,
      repoPrefix: `${qa.repoPrefix}-conflict`,
      targetType: 'user',
    });
    await addCollaborator(sessions[0], owner(), testRepo, sessions[1].username);
    console.log(`[QA] Repo: https://${qa.host.replace(/^https?:\/\//, '')}/${owner()}/${testRepo}`);
  }, 60_000);

  afterAll(async () => {
    if (testRepo) await deleteTestRepo(sessions[0], owner(), testRepo);
    await logoutAllQaUsers(sessions, qa);
  }, 30_000);

  // -------------------------------------------------------------------------
  // OA — non-overlapping edits auto-merge
  // -------------------------------------------------------------------------

  describeQa('OA — non-overlapping verse edits auto-merge on DCS', () => {
    const REPO_FILE = '56-TIT.usfm';

    it('Alice edits v1, Bob edits v2 → auto-merged on remote', async () => {
      // Both users do an initial sync so they record the common anchor.
      const sA = makeStorage({ id: PID, name: 'TIT', language: 'en' });
      await sA.writeFile(PID, REPO_FILE, TIT_BASE);
      await syncOnline(sessions[0].username, sA, sessions[0].token);

      const sB = makeStorage({ id: PID, name: 'TIT', language: 'en' });
      await sB.writeFile(PID, REPO_FILE, TIT_BASE);
      await syncOnline(sessions[1].username, sB, sessions[1].token);

      // Alice edits verse 1 and pushes first.
      await sA.writeFile(PID, REPO_FILE,
        TIT_BASE.replace('Verse one original.', 'Alice — verse one.'));
      const rA = await syncOnline(sessions[0].username, sA, sessions[0].token);
      expect(rA.kind).toBe('synced');

      // Bob edits verse 2 (different location) and syncs.
      await sB.writeFile(PID, REPO_FILE,
        TIT_BASE.replace('Verse two original.', 'Bob — verse two.'));
      const rB = await syncOnline(sessions[1].username, sB, sessions[1].token);
      expect(rB.kind).toBe('synced');

      // Bob's local storage should now contain both edits.
      const final = await sB.readFile(PID, REPO_FILE);
      expect(final).toContain('Alice — verse one.');
      expect(final).toContain('Bob — verse two.');
    }, 60_000);
  });

  // -------------------------------------------------------------------------
  // OB — same verse, different text → conflict surfaced
  // -------------------------------------------------------------------------

  describeQa('OB — same-verse conflict surfaced on DCS', () => {
    const REPO_FILE = '57-3JN.usfm';
    const BASE = '\\id 3JN\n\\c 1\n\\p\n\\v 1 Original verse.\n';

    it('throws SyncConflictsError and saves pendingConflicts', async () => {
      const sA = makeStorage({ id: PID, name: '3JN', language: 'en' });
      await sA.writeFile(PID, REPO_FILE, BASE);
      await syncOnline(sessions[0].username, sA, sessions[0].token);

      const sB = makeStorage({ id: PID, name: '3JN', language: 'en' });
      await sB.writeFile(PID, REPO_FILE, BASE);
      await syncOnline(sessions[1].username, sB, sessions[1].token);

      // Alice pushes her edit first.
      await sA.writeFile(PID, REPO_FILE, BASE.replace('Original verse.', 'Alice version.'));
      await syncOnline(sessions[0].username, sA, sessions[0].token);

      // Bob has a conflicting edit.
      await sB.writeFile(PID, REPO_FILE, BASE.replace('Original verse.', 'Bob version.'));
      await expect(
        syncOnline(sessions[1].username, sB, sessions[1].token),
      ).rejects.toThrow(SyncConflictsError);

      const meta = await sB.getProject(PID);
      expect(meta?.pendingConflicts?.length).toBeGreaterThan(0);
      const conflict = meta!.pendingConflicts!.find((c) => c.path === REPO_FILE);
      expect(conflict).toBeDefined();
      expect(conflict!.oursText).toContain('Bob version.');
      expect(conflict!.theirsText).toContain('Alice version.');
    }, 60_000);
  });

  // -------------------------------------------------------------------------
  // OC — different verses in same file: 3-way auto-merge
  // -------------------------------------------------------------------------

  describeQa('OC — different-verse auto-merge on DCS', () => {
    const REPO_FILE = '58-PHM.usfm';
    const BASE = [
      '\\id PHM', '\\c 1', '\\p',
      '\\v 1 Verse one.', '\\v 2 Verse two.', '\\v 3 Verse three.', '',
    ].join('\n');

    it('Alice edits v1, Bob edits v3 → auto-merged', async () => {
      const sA = makeStorage({ id: PID, name: 'PHM', language: 'en' });
      await sA.writeFile(PID, REPO_FILE, BASE);
      await syncOnline(sessions[0].username, sA, sessions[0].token);

      const sB = makeStorage({ id: PID, name: 'PHM', language: 'en' });
      await sB.writeFile(PID, REPO_FILE, BASE);
      await syncOnline(sessions[1].username, sB, sessions[1].token);

      await sA.writeFile(PID, REPO_FILE, BASE.replace('Verse one.', 'Alice v1.'));
      await syncOnline(sessions[0].username, sA, sessions[0].token);

      await sB.writeFile(PID, REPO_FILE, BASE.replace('Verse three.', 'Bob v3.'));
      const rB = await syncOnline(sessions[1].username, sB, sessions[1].token);
      expect(rB.kind).toBe('synced');

      const merged = await sB.readFile(PID, REPO_FILE);
      expect(merged).toContain('Alice v1.');
      expect(merged).toContain('Bob v3.');
    }, 60_000);
  });

  // -------------------------------------------------------------------------
  // OD — conflict resolved ("accept theirs") → retry succeeds
  // -------------------------------------------------------------------------

  describeQa('OD — resolve conflict and retry on DCS', () => {
    const REPO_FILE = '59-HEB.usfm';
    const BASE = '\\id HEB\n\\c 1\n\\p\n\\v 1 Original.\n';

    it('after resolving by accepting theirs, retry syncs cleanly', async () => {
      const sA = makeStorage({ id: PID, name: 'HEB', language: 'en' });
      await sA.writeFile(PID, REPO_FILE, BASE);
      await syncOnline(sessions[0].username, sA, sessions[0].token);

      const sB = makeStorage({ id: PID, name: 'HEB', language: 'en' });
      await sB.writeFile(PID, REPO_FILE, BASE);
      await syncOnline(sessions[1].username, sB, sessions[1].token);

      const aliceVersion = BASE.replace('Original.', 'Alice pushed first.');
      await sA.writeFile(PID, REPO_FILE, aliceVersion);
      await syncOnline(sessions[0].username, sA, sessions[0].token);

      await sB.writeFile(PID, REPO_FILE, BASE.replace('Original.', 'Bob conflicting.'));
      await expect(
        syncOnline(sessions[1].username, sB, sessions[1].token),
      ).rejects.toThrow(SyncConflictsError);

      // Bob accepts "theirs" (Alice's version) and retries.
      await sB.writeFile(PID, REPO_FILE, aliceVersion);
      await sB.updateProject(PID, { pendingConflicts: [] });

      const retry = await syncOnline(sessions[1].username, sB, sessions[1].token);
      expect(retry.kind).toBe('synced');
    }, 90_000);
  });

  // -------------------------------------------------------------------------
  // OE — noop fast-path
  // -------------------------------------------------------------------------

  describeQa('OE — noop fast-path on DCS', () => {
    it('second sync immediately after first is noop', async () => {
      const REPO_FILE = '60-JAS.usfm';
      const CONTENT = '\\id JAS\n\\c 1\n\\p\n\\v 1 Stable verse.\n';

      const s = makeStorage({ id: PID, name: 'JAS', language: 'en' });
      await s.writeFile(PID, REPO_FILE, CONTENT);

      const first = await syncOnline(sessions[0].username, s, sessions[0].token);
      expect(first.kind).toBe('synced');

      const second = await syncOnline(sessions[0].username, s, sessions[0].token);
      expect(second.kind).toBe('noop');
    }, 40_000);
  });

  // -------------------------------------------------------------------------
  // OF — YAML manifest metadata-only drift → auto-merged
  // -------------------------------------------------------------------------

  describeQa('OF — YAML manifest metadata-only drift auto-merges on DCS', () => {
    const MANIFEST_BASE = 'dublin_core:\n  title: Test Project\n  modified: "2024-01-01"\n';

    it('both users update modified timestamp → merged silently', async () => {
      const sA = makeStorage({ id: PID, name: 'Manifest', language: 'en' });
      await sA.writeFile(PID, 'manifest.yaml', MANIFEST_BASE);
      await syncOnline(sessions[0].username, sA, sessions[0].token);

      const sB = makeStorage({ id: PID, name: 'Manifest', language: 'en' });
      await sB.writeFile(PID, 'manifest.yaml', MANIFEST_BASE);
      await syncOnline(sessions[1].username, sB, sessions[1].token);

      await sA.writeFile(PID, 'manifest.yaml',
        MANIFEST_BASE.replace('"2024-01-01"', '"2026-05-12"'));
      await syncOnline(sessions[0].username, sA, sessions[0].token);

      await sB.writeFile(PID, 'manifest.yaml',
        MANIFEST_BASE.replace('"2024-01-01"', '"2026-05-13"'));
      const rB = await syncOnline(sessions[1].username, sB, sessions[1].token);

      expect(rB.kind).toBe('synced');
      const merged = await sB.readFile(PID, 'manifest.yaml');
      expect(merged).toContain('title: Test Project');
    }, 60_000);
  });

  // -------------------------------------------------------------------------
  // OG — remote-only new file imported silently (mirrors in-memory F)
  // -------------------------------------------------------------------------

  describeQa('OG — remote-only new file imported silently on DCS', () => {
    const MAIN_FILE = '61-ROM.usfm';
    const NEW_FILE  = '62-1CO.usfm';
    const MAIN_BASE = '\\id ROM\n\\c 1\n\\p\n\\v 1 Paul to Rome.\n';
    const NEW_CONTENT = '\\id 1CO\n\\c 1\n\\p\n\\v 1 Paul to Corinth.\n';

    it('Bob gets Alice\'s brand-new book without conflict', async () => {
      const sA = makeStorage({ id: PID, name: 'ROM', language: 'en' });
      await sA.writeFile(PID, MAIN_FILE, MAIN_BASE);
      await syncOnline(sessions[0].username, sA, sessions[0].token);

      const sB = makeStorage({ id: PID, name: 'ROM', language: 'en' });
      await sB.writeFile(PID, MAIN_FILE, MAIN_BASE);
      await syncOnline(sessions[1].username, sB, sessions[1].token);

      // Alice creates a brand-new book and pushes.
      await sA.writeFile(PID, NEW_FILE, NEW_CONTENT);
      await syncOnline(sessions[0].username, sA, sessions[0].token);

      // Bob syncs — should import Alice's new book without conflict.
      const rB = await syncOnline(sessions[1].username, sB, sessions[1].token);
      expect(rB.kind).toBe('synced');

      const imported = await sB.readFile(PID, NEW_FILE);
      expect(imported).toContain('Paul to Corinth.');
    }, 60_000);
  });

  // -------------------------------------------------------------------------
  // OH — delete/modify conflict (mirrors in-memory K)
  // -------------------------------------------------------------------------

  describeQa('OH — delete/modify conflict surfaced on DCS', () => {
    const SHARED_FILE  = '63-2CO.usfm';
    const TARGET_FILE  = '64-GAL.usfm';
    const SHARED_BASE  = '\\id 2CO\n\\c 1\n\\p\n\\v 1 Shared book.\n';
    const TARGET_BASE  = '\\id GAL\n\\c 1\n\\p\n\\v 1 Original Galatians.\n';

    it('throws SyncConflictsError with theirsText="" when remote deleted the file', async () => {
      const sA = makeStorage({ id: PID, name: '2CO', language: 'en' });
      await sA.writeFile(PID, SHARED_FILE, SHARED_BASE);
      await sA.writeFile(PID, TARGET_FILE, TARGET_BASE);
      await syncOnline(sessions[0].username, sA, sessions[0].token);

      const sB = makeStorage({ id: PID, name: '2CO', language: 'en' });
      await sB.writeFile(PID, SHARED_FILE, SHARED_BASE);
      await sB.writeFile(PID, TARGET_FILE, TARGET_BASE);
      await syncOnline(sessions[1].username, sB, sessions[1].token);

      // Alice deletes the target file and pushes.
      await sA.deleteFile(PID, TARGET_FILE);
      await syncOnline(sessions[0].username, sA, sessions[0].token);

      // Bob has edited the now-deleted file — conflict expected.
      await sB.writeFile(PID, TARGET_FILE, TARGET_BASE.replace('Original Galatians.', 'Bob edited Galatians.'));
      await expect(
        syncOnline(sessions[1].username, sB, sessions[1].token),
      ).rejects.toThrow(SyncConflictsError);

      const meta = await sB.getProject(PID);
      const conflict = meta!.pendingConflicts!.find((c) => c.path === TARGET_FILE);
      expect(conflict).toBeDefined();
      expect(conflict!.theirsText).toBe('');            // '' = remotely deleted
      expect(conflict!.oursText).toContain('Bob edited Galatians.');
    }, 90_000);
  });

  // -------------------------------------------------------------------------
  // OI — sync sidecar (.sync/*.json) always auto-merges (mirrors in-memory I)
  // -------------------------------------------------------------------------

  describeQa('OI — sync sidecar auto-merges without surfacing a conflict on DCS', () => {
    const USFM_FILE    = '65-COL.usfm';
    const SIDECAR_PATH = '.sync/COL.json';
    const USFM_BASE    = '\\id COL\n\\c 1\n\\p\n\\v 1 Paul to Colossae.\n';
    const SIDECAR_BASE = JSON.stringify({
      schema: 1, docId: 'TPS:COL',
      baseBlobSha: 'sha-genesis',
      vectorClock: { system: 1 },
      savedAt: '2026-01-01T00:00:00Z',
    });

    it('diverged baseBlobSha + vectorClock never surface as a user conflict', async () => {
      const sA = makeStorage({ id: PID, name: 'COL', language: 'en' });
      await sA.writeFile(PID, USFM_FILE, USFM_BASE);
      await sA.writeFile(PID, SIDECAR_PATH, SIDECAR_BASE);
      await syncOnline(sessions[0].username, sA, sessions[0].token);

      const sB = makeStorage({ id: PID, name: 'COL', language: 'en' });
      await sB.writeFile(PID, USFM_FILE, USFM_BASE);
      await sB.writeFile(PID, SIDECAR_PATH, SIDECAR_BASE);
      await syncOnline(sessions[1].username, sB, sessions[1].token);

      // Alice advances her sidecar (new blob sha, higher clock, newer timestamp).
      const sidecarA = JSON.stringify({
        schema: 1, docId: 'TPS:COL',
        baseBlobSha: 'sha-alice-pushed',
        vectorClock: { system: 1, alice: 5 },
        savedAt: '2026-05-12T14:00:00Z',
      });
      await sA.writeFile(PID, SIDECAR_PATH, sidecarA);
      await syncOnline(sessions[0].username, sA, sessions[0].token);

      // Bob's sidecar diverged (different blob sha, independent clock, older time).
      const sidecarB = JSON.stringify({
        schema: 1, docId: 'TPS:COL',
        baseBlobSha: 'sha-bob-local',
        vectorClock: { system: 1, alice: 3, bob: 7 },
        savedAt: '2026-05-11T23:00:00Z',
      });
      await sB.writeFile(PID, SIDECAR_PATH, sidecarB);

      // Must NOT throw — sidecar divergence is always resolved automatically.
      const rB = await syncOnline(sessions[1].username, sB, sessions[1].token);
      expect(rB.kind).toBe('synced');

      const mergedRaw = await sB.readFile(PID, SIDECAR_PATH);
      const mergedObj = JSON.parse(mergedRaw!) as { vectorClock: Record<string, number> };
      expect(mergedObj.vectorClock.alice).toBe(5);   // max(5, 3)
      expect(mergedObj.vectorClock.bob).toBe(7);     // Bob-only actor preserved
    }, 90_000);
  });

  // -------------------------------------------------------------------------
  // OJ — mixed: USFM conflict + manifest metadata auto-merge (mirrors in-memory L)
  // -------------------------------------------------------------------------

  describeQa('OJ — mixed USFM conflict + manifest auto-merge on DCS', () => {
    const USFM_FILE    = '66-EPH.usfm';
    // Must end with "manifest.yaml" so isYamlManifest() triggers the deep-merge path.
    const MANIFEST     = 'manifest.yaml';
    const USFM_BASE    = '\\id EPH\n\\c 1\n\\p\n\\v 1 Paul to Ephesus.\n\\v 2 Verse two.\n';
    const MANIFEST_BASE = 'dublin_core:\n  title: Ephesians\n  modified: "2024-01-01"\n';

    it('only the USFM file raises conflict; manifest is merged silently in the same run', async () => {
      const sA = makeStorage({ id: PID, name: 'EPH', language: 'en' });
      await sA.writeFile(PID, USFM_FILE, USFM_BASE);
      await sA.writeFile(PID, MANIFEST, MANIFEST_BASE);
      await syncOnline(sessions[0].username, sA, sessions[0].token);

      const sB = makeStorage({ id: PID, name: 'EPH', language: 'en' });
      await sB.writeFile(PID, USFM_FILE, USFM_BASE);
      await sB.writeFile(PID, MANIFEST, MANIFEST_BASE);
      await syncOnline(sessions[1].username, sB, sessions[1].token);

      // Alice edits verse 1 and bumps manifest modified date.
      await sA.writeFile(PID, USFM_FILE, USFM_BASE.replace('Paul to Ephesus.', 'Alice v1.'));
      await sA.writeFile(PID, MANIFEST, MANIFEST_BASE.replace('"2024-01-01"', '"2026-05-12"'));
      await syncOnline(sessions[0].username, sA, sessions[0].token);

      // Bob also edits verse 1 (conflict!) and bumps manifest modified differently.
      await sB.writeFile(PID, USFM_FILE, USFM_BASE.replace('Paul to Ephesus.', 'Bob v1.'));
      await sB.writeFile(PID, MANIFEST, MANIFEST_BASE.replace('"2024-01-01"', '"2026-05-13"'));

      await expect(
        syncOnline(sessions[1].username, sB, sessions[1].token),
      ).rejects.toThrow(SyncConflictsError);

      const meta = await sB.getProject(PID);
      // Only the USFM file should be in pendingConflicts — manifest auto-merged.
      const usfmConflict = meta!.pendingConflicts!.find((c) => c.path === USFM_FILE);
      const manifestConflict = meta!.pendingConflicts!.find((c) => c.path === MANIFEST);
      expect(usfmConflict).toBeDefined();
      expect(manifestConflict).toBeUndefined();
    }, 90_000);
  });

  // -------------------------------------------------------------------------
  // OK — YAML real-field conflict surfaced (mirrors in-memory H)
  // -------------------------------------------------------------------------

  describeQa('OK — YAML real-field conflict surfaced on DCS', () => {
    const MANIFEST = 'manifest-ok.yaml';
    const MANIFEST_BASE = 'dublin_core:\n  title: Old Title\n  modified: "2024-01-01"\n';

    it('both users change title to different values → SyncConflictsError', async () => {
      const sA = makeStorage({ id: PID, name: 'Manifest OK', language: 'en' });
      await sA.writeFile(PID, MANIFEST, MANIFEST_BASE);
      await syncOnline(sessions[0].username, sA, sessions[0].token);

      const sB = makeStorage({ id: PID, name: 'Manifest OK', language: 'en' });
      await sB.writeFile(PID, MANIFEST, MANIFEST_BASE);
      await syncOnline(sessions[1].username, sB, sessions[1].token);

      await sA.writeFile(PID, MANIFEST, MANIFEST_BASE.replace('Old Title', 'Alice Title'));
      await syncOnline(sessions[0].username, sA, sessions[0].token);

      await sB.writeFile(PID, MANIFEST, MANIFEST_BASE.replace('Old Title', 'Bob Title'));
      await expect(
        syncOnline(sessions[1].username, sB, sessions[1].token),
      ).rejects.toThrow(SyncConflictsError);

      const meta = await sB.getProject(PID);
      const conflict = meta!.pendingConflicts!.find((c) => c.path === MANIFEST);
      expect(conflict).toBeDefined();
      expect(conflict!.oursText).toContain('Bob Title');
      expect(conflict!.theirsText).toContain('Alice Title');
    }, 90_000);
  });

  // -------------------------------------------------------------------------
  // OL — noop for already-synced user after remote advances (mirrors in-memory M)
  // -------------------------------------------------------------------------

  describeQa('OL — noop for already-synced user after remote advances on DCS', () => {
    const REPO_FILE = '67-PHP.usfm';
    const BASE = '\\id PHP\n\\c 1\n\\p\n\\v 1 Stable verse.\n';

    it('Alice is noop on her second sync after she already pushed', async () => {
      const sA = makeStorage({ id: PID, name: 'PHP', language: 'en' });
      await sA.writeFile(PID, REPO_FILE, BASE);
      await syncOnline(sessions[0].username, sA, sessions[0].token);

      // Alice edits and pushes.
      const edited = BASE.replace('Stable verse.', 'Alice edited.');
      await sA.writeFile(PID, REPO_FILE, edited);
      const r1 = await syncOnline(sessions[0].username, sA, sessions[0].token);
      expect(r1.kind).toBe('synced');

      // Immediately sync Alice again — nothing changed locally, she's the head.
      const r2 = await syncOnline(sessions[0].username, sA, sessions[0].token);
      expect(r2.kind).toBe('noop');
    }, 60_000);
  });
});

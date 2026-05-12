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
 * Scenarios mirroring the in-memory suite
 * ----------------------------------------
 *  OA  Non-overlapping edits → auto-merged on remote
 *  OB  Same verse, different text → SyncConflictsError with pendingConflicts
 *  OC  Different verses in same file → plain-text 3-way auto-merge
 *  OD  Conflict resolved ("accept theirs") → retry succeeds
 *  OE  Noop fast-path after sync with no local changes
 *  OF  YAML manifest metadata-only drift → auto-merged, no conflict
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
});

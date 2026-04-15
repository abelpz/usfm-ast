/**
 * Integration tests — 3-tier branch sync with two QA users
 *
 * These tests run against qa.door43.org with real HTTP calls.
 * They are skipped unless `QA_INTEGRATION=1` is set and `.env.qa` is filled in.
 *
 * Run:
 *   QA_INTEGRATION=1 bun run test --filter=@usfm-tools/editor-adapters
 *
 * What is tested:
 *  1. Both users can log in and acquire short-lived tokens.
 *  2. User 1 creates a shared org test repo.
 *  3. User 1 pushes a USFM file to their Tier-1 branch ({user1}/tit).
 *  4. Auto-merge creates a PR {user1}/tit → tit (Tier-2) and merges it.
 *  5. Auto-merge creates a PR tit → main (Tier-3) and merges it.
 *  6. User 2 pushes a conflicting edit to the same verse → auto-merge
 *     either succeeds (fast-forward / 3-way) or returns a conflict PR URL.
 *  7. User 2 reads the repo tree and file on main.
 *  8. Teardown revokes all tokens and deletes the test repo.
 */

import { getQaDescribe } from './helpers/qa-env';
import {
  loginAllQaUsers,
  logoutAllQaUsers,
  createTestRepo,
  deleteTestRepo,
  addCollaborator,
  type QaSession,
} from './helpers/qa-users';
import {
  workingBranchName,
  bookBranchName,
  autoMergeToDcs,
} from '../../usfm-editor-app/src/lib/dcs-project-sync';
import {
  ensureBranch,
  createRepoFile,
  createOrUpdateRepoFile,
  getFileContent,
  listRepoGitTree,
} from '@usfm-tools/door43-rest';
import type { ProjectSyncConfig } from '@usfm-tools/types';

// ---------------------------------------------------------------------------
// Guard — all suites use `describeQa` so they are skipped as a group when
// credentials are not configured.
// ---------------------------------------------------------------------------
const { describeQa, qa } = getQaDescribe();

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------
let sessions: [QaSession, QaSession] = [] as unknown as [QaSession, QaSession];
let testRepo = '';
const BOOK_CODE = 'TIT';
// Repo is created under User 1's personal account; User 2 is added as a collaborator.
const owner = () => sessions[0].username;

const syncConfig = (): ProjectSyncConfig => ({
  host: qa.host,
  owner: owner(),
  repo: testRepo,
  branch: 'main',
  targetType: 'user',
});

// ---------------------------------------------------------------------------
// All tests live inside a single `describeQa` block so they are collectively
// skipped when QA env vars are absent.
// ---------------------------------------------------------------------------
describeQa('QA integration — 3-tier sync', () => {
  beforeAll(async () => {
    sessions = await loginAllQaUsers(qa);
    // Create repo under User 1's personal account, then add User 2 as a collaborator.
    testRepo = await createTestRepo(sessions[0], {
      owner: sessions[0].username,
      repoPrefix: qa.repoPrefix,
      targetType: 'user',
    });
    await addCollaborator(sessions[0], sessions[0].username, testRepo, sessions[1].username);
    console.log(`[QA] Created test repo: ${owner()}/${testRepo} on ${qa.host}`);
  }, 60_000);

  afterAll(async () => {
    if (testRepo) {
      await deleteTestRepo(sessions[0], owner(), testRepo);
      console.log(`[QA] Deleted test repo: ${owner()}/${testRepo}`);
    }
    await logoutAllQaUsers(sessions, qa);
  }, 30_000);

  // -------------------------------------------------------------------------
  describe('token acquisition', () => {
    it('both users receive a valid token', () => {
      expect(sessions).toHaveLength(2);
      for (const s of sessions) {
        expect(typeof s.token).toBe('string');
        expect(s.token.length).toBeGreaterThan(10);
        expect(typeof s.tokenId).toBe('number');
        expect(s.tokenId).toBeGreaterThan(0);
      }
    });
  });

  // -------------------------------------------------------------------------
  describe('branch naming', () => {
    it('workingBranchName produces {username}/{bookcode}', () => {
      const s = sessions[0];
      expect(workingBranchName(s.username, BOOK_CODE)).toBe(
        `${s.username.toLowerCase()}/${BOOK_CODE.toLowerCase()}`,
      );
    });

    it('bookBranchName produces lowercase book code', () => {
      expect(bookBranchName(BOOK_CODE)).toBe(BOOK_CODE.toLowerCase());
    });
  });

  // -------------------------------------------------------------------------
  describe('User 1 — push and auto-merge', () => {
    const USFM_V1 = `\\id TIT\n\\h Titus\n\\c 1\n\\p\n\\v 1 Paul, a servant of God.\n`;
    let tier1Branch: string;

    beforeAll(() => {
      tier1Branch = workingBranchName(sessions[0].username, BOOK_CODE);
    });

    it('ensures Tier-1 branch exists', async () => {
      await expect(
        ensureBranch({
          host: qa.host,
          token: sessions[0].token,
          owner: owner(),
          repo: testRepo,
          branch: tier1Branch,
          fromBranch: 'main',
        }),
      ).resolves.not.toThrow();
    }, 20_000);

    it('creates the USFM file on the Tier-1 branch', async () => {
      const result = await createRepoFile({
        host: qa.host,
        token: sessions[0].token,
        owner: owner(),
        repo: testRepo,
        path: `${BOOK_CODE.toUpperCase()}.usfm`,
        content: USFM_V1,
        message: `[test] Add ${BOOK_CODE} (user 1)`,
        branch: tier1Branch,
      });
      expect(result.commit.sha).toMatch(/^[0-9a-f]{40}$/);
    }, 20_000);

    it('auto-merges Tier-1 → Tier-2 → main', async () => {
      const result = await autoMergeToDcs({
        token: sessions[0].token,
        sync: syncConfig(),
        username: sessions[0].username,
        bookCode: BOOK_CODE,
      });
      expect(result.merged).toBe(true);
    }, 60_000);

    it('file is visible on main after merge', async () => {
      const tree = await listRepoGitTree({
        host: qa.host,
        token: sessions[0].token,
        owner: owner(),
        repo: testRepo,
        ref: 'main',
        recursive: true,
      });
      const found = tree.some((e) => e.path === `${BOOK_CODE.toUpperCase()}.usfm`);
      expect(found).toBe(true);
    }, 20_000);
  });

  // -------------------------------------------------------------------------
  describe('User 2 — concurrent edit to same book (conflict scenario)', () => {
    const USFM_V2 = `\\id TIT\n\\h Titus\n\\c 1\n\\p\n\\v 1 Paul, called as an apostle.\n`;
    let tier1Branch: string;

    beforeAll(() => {
      tier1Branch = workingBranchName(sessions[1].username, BOOK_CODE);
    });

    it('ensures Tier-1 branch exists for User 2', async () => {
      await expect(
        ensureBranch({
          host: qa.host,
          token: sessions[1].token,
          owner: owner(),
          repo: testRepo,
          branch: tier1Branch,
          fromBranch: 'main',
        }),
      ).resolves.not.toThrow();
    }, 20_000);

    it('pushes an alternate translation to the Tier-1 branch', async () => {
      // Use createOrUpdateRepoFile because User 1's changes may have already
      // merged into main before User 2's branch was forked, so TIT.usfm may
      // already exist on the branch.
      const result = await createOrUpdateRepoFile({
        host: qa.host,
        token: sessions[1].token,
        owner: owner(),
        repo: testRepo,
        path: `${BOOK_CODE.toUpperCase()}.usfm`,
        content: USFM_V2,
        message: `[test] Update ${BOOK_CODE} (user 2 — alternate translation)`,
        branch: tier1Branch,
      });
      expect(result.commit.sha).toMatch(/^[0-9a-f]{40}$/);
    }, 20_000);

    it('auto-merge either succeeds or returns a conflict PR URL', async () => {
      const result = await autoMergeToDcs({
        token: sessions[1].token,
        sync: syncConfig(),
        username: sessions[1].username,
        bookCode: BOOK_CODE,
      });
      if (result.merged) {
        expect(result.merged).toBe(true);
      } else {
        expect(result.conflictPrUrl).toMatch(/^https?:\/\//);
        console.log(`[QA] Conflict PR (expected): ${result.conflictPrUrl}`);
      }
    }, 60_000);
  });

  // -------------------------------------------------------------------------
  describe('User 2 — read access after User 1 merge', () => {
    it('can list the git tree on main', async () => {
      const tree = await listRepoGitTree({
        host: qa.host,
        token: sessions[1].token,
        owner: owner(),
        repo: testRepo,
        ref: 'main',
        recursive: true,
      });
      expect(Array.isArray(tree)).toBe(true);
    }, 20_000);

    it('can read the USFM file on main', async () => {
      const file = await getFileContent({
        host: qa.host,
        token: sessions[1].token,
        owner: owner(),
        repo: testRepo,
        path: `${BOOK_CODE.toUpperCase()}.usfm`,
        ref: 'main',
      });
      expect(file.content).toContain('\\id TIT');
    }, 20_000);
  });
});

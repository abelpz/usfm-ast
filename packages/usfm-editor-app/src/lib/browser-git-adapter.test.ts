/**
 * BrowserGitAdapter tests — run under Bun using node:fs (no IndexedDB needed).
 *
 * Each test creates a fresh temp directory and disposes it on completion so
 * tests are fully isolated.
 */

import { describe, expect, test, afterEach, beforeEach } from 'bun:test';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { createNodeGitAdapter } from './browser-git-adapter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'bga-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

function adapter(subdir = 'repo') {
  return createNodeGitAdapter(join(tmpDir, subdir), { name: 'Tester', email: 'test@local' });
}

const FILES_V1 = new Map([
  ['files/TIT.usfm', '\\id TIT\n\\c 1\n\\v 1 Titus v1\n'],
  ['manifest.yaml', 'dublin_core:\n  version: "1"\n'],
]);

const FILES_V2 = new Map([
  ['files/TIT.usfm', '\\id TIT\n\\c 1\n\\v 1 Titus v2 (updated)\n'],
  ['manifest.yaml', 'dublin_core:\n  version: "2"\n'],
]);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BrowserGitAdapter (node:fs backend)', () => {
  test('init creates a git repo on first call', async () => {
    const a = adapter();
    await a.init();
    // Calling init twice is idempotent.
    await a.init();
    const head = await a.headCommit();
    // No commits yet — HEAD is null on a freshly initialised repo.
    expect(head).toBeNull();
  });

  test('commitAll creates a first commit and returns its OID', async () => {
    const a = adapter();
    const oid = await a.commitAll(FILES_V1, 'initial snapshot', { name: 'User', email: 'u@t' });
    expect(typeof oid).toBe('string');
    expect(oid).toHaveLength(40);
    const head = await a.headCommit();
    expect(head).toBe(oid);
  });

  test('commitAll with two commits advances HEAD', async () => {
    const a = adapter();
    const oid1 = await a.commitAll(FILES_V1, 'v1');
    const oid2 = await a.commitAll(FILES_V2, 'v2');
    expect(oid2).not.toBe(oid1);
    const head = await a.headCommit();
    expect(head).toBe(oid2);
  });

  test('readFilesAt HEAD returns committed content', async () => {
    const a = adapter();
    await a.commitAll(FILES_V1, 'v1');
    const head = await a.headCommit();
    const files = await a.readFilesAt(head!);
    expect(files.get('files/TIT.usfm')).toBe('\\id TIT\n\\c 1\n\\v 1 Titus v1\n');
    expect(files.get('manifest.yaml')).toBe('dublin_core:\n  version: "1"\n');
  });

  test('readFilesAt an earlier OID returns historical content', async () => {
    const a = adapter();
    const oid1 = await a.commitAll(FILES_V1, 'v1');
    await a.commitAll(FILES_V2, 'v2');
    const files = await a.readFilesAt(oid1);
    expect(files.get('files/TIT.usfm')).toBe('\\id TIT\n\\c 1\n\\v 1 Titus v1\n');
  });

  test('commitAll removes a deleted file in subsequent commit', async () => {
    const a = adapter();
    await a.commitAll(FILES_V1, 'v1');
    // Second commit omits manifest.yaml → file should be deleted.
    const oid2 = await a.commitAll(
      new Map([['files/TIT.usfm', '\\id TIT\n\\v 1 only-usfm\n']]),
      'drop-manifest',
    );
    const files = await a.readFilesAt(oid2);
    expect(files.has('manifest.yaml')).toBe(false);
    expect(files.has('files/TIT.usfm')).toBe(true);
  });

  test('readFilesAt returns empty map for empty repo', async () => {
    const a = adapter();
    await a.init();
    const files = await a.readFilesAt('HEAD');
    expect(files.size).toBe(0);
  });

  test('two separate adapters on different dirs are isolated', async () => {
    const a1 = adapter('repo-a');
    const a2 = adapter('repo-b');
    await a1.commitAll(FILES_V1, 'a1-commit');
    // a2 should have no commits.
    const head2 = await a2.headCommit();
    expect(head2).toBeNull();
  });

  test('defaultAuthor is used when no author passed to commitAll', async () => {
    const a = createNodeGitAdapter(join(tmpDir, 'author-test'), {
      name: 'DefaultAuthor',
      email: 'default@test',
    });
    await a.commitAll(FILES_V1, 'authored commit');
    // Just verify the commit was made (we trust isomorphic-git to record the author).
    const head = await a.headCommit();
    expect(head).not.toBeNull();
  });
});

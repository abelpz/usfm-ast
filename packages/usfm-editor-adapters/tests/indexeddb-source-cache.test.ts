/**
 * Tests for IndexedDbSourceCacheStorage.
 * `fake-indexeddb/auto` is loaded in jest-setup.ts so no real IndexedDB needed.
 */
import type { CachedSourceFile, CachedSourceRepo } from '@usfm-tools/types';
import { IndexedDbSourceCacheStorage } from '../src/storage/indexeddb-source-cache';

function makeRepo(overrides?: Partial<CachedSourceRepo>): CachedSourceRepo {
  return {
    repoId: 'test/en_ult',
    langCode: 'en',
    subject: 'Aligned Bible',
    releaseTag: 'v80',
    downloadedAt: '2026-01-01T00:00:00.000Z',
    sizeBytes: 1024,
    fileCount: 2,
    ...overrides,
  };
}

function makeFile(overrides?: Partial<CachedSourceFile>): CachedSourceFile {
  return {
    repoId: 'test/en_ult',
    releaseTag: 'v80',
    path: '01-GEN.usfm',
    content: '\\id GEN\n\\c 1\n\\v 1 In the beginning...',
    ...overrides,
  };
}

// Each test that creates a storage instance will use the same fake-indexeddb
// which is reset per test file. Tests within the file share the IDB instance
// but use unique (repoId, releaseTag) pairs to avoid conflicts.

describe('IndexedDbSourceCacheStorage — Repo CRUD', () => {
  it('putCachedRepo → getCachedRepo round-trips', async () => {
    const s = new IndexedDbSourceCacheStorage();
    const repo = makeRepo();
    const files = [makeFile()];
    await s.putCachedRepo(repo, files);
    const fetched = await s.getCachedRepo(repo.repoId, repo.releaseTag);
    expect(fetched).toMatchObject({ repoId: repo.repoId, releaseTag: repo.releaseTag });
  });

  it('listCachedRepos returns all stored repos', async () => {
    const s = new IndexedDbSourceCacheStorage();
    await s.putCachedRepo(makeRepo({ repoId: 'test/en_ult', releaseTag: 'v81' }), []);
    await s.putCachedRepo(makeRepo({ repoId: 'test/es_ult', releaseTag: 'v20', langCode: 'es' }), []);
    const all = await s.listCachedRepos();
    const ids = all.map((r) => r.repoId);
    expect(ids).toContain('test/en_ult');
    expect(ids).toContain('test/es_ult');
  });

  it('listCachedRepos filters by langCode', async () => {
    const s = new IndexedDbSourceCacheStorage();
    await s.putCachedRepo(makeRepo({ repoId: 'test/en_ust', releaseTag: 'v60', langCode: 'en' }), []);
    await s.putCachedRepo(makeRepo({ repoId: 'test/fr_ult', releaseTag: 'v10', langCode: 'fr' }), []);
    const enRepos = await s.listCachedRepos('en');
    const frRepos = await s.listCachedRepos('fr');
    expect(enRepos.every((r) => r.langCode === 'en')).toBe(true);
    expect(frRepos.every((r) => r.langCode === 'fr')).toBe(true);
  });

  it('deleteCachedRepo removes the repo and its files', async () => {
    const s = new IndexedDbSourceCacheStorage();
    const repo = makeRepo({ repoId: 'test/del', releaseTag: 'v1' });
    await s.putCachedRepo(repo, [makeFile({ repoId: 'test/del', releaseTag: 'v1' })]);
    await s.deleteCachedRepo(repo.repoId, repo.releaseTag);
    expect(await s.getCachedRepo(repo.repoId, repo.releaseTag)).toBeNull();
    const files = await s.listCachedFiles(repo.repoId, repo.releaseTag);
    expect(files).toHaveLength(0);
  });

  it('putCachedRepo with same key replaces files', async () => {
    const s = new IndexedDbSourceCacheStorage();
    const repo = makeRepo({ repoId: 'test/replace', releaseTag: 'v1' });
    await s.putCachedRepo(repo, [makeFile({ repoId: 'test/replace', releaseTag: 'v1', path: 'old.usfm' })]);
    await s.putCachedRepo(repo, [makeFile({ repoId: 'test/replace', releaseTag: 'v1', path: 'new.usfm' })]);
    const files = await s.listCachedFiles(repo.repoId, repo.releaseTag);
    expect(files).toHaveLength(1);
    expect(files).toContain('new.usfm');
    expect(files).not.toContain('old.usfm');
  });
});

describe('IndexedDbSourceCacheStorage — File CRUD', () => {
  it('getCachedFile returns stored file', async () => {
    const s = new IndexedDbSourceCacheStorage();
    const repo = makeRepo({ repoId: 'test/file-read', releaseTag: 'v1' });
    const file = makeFile({ repoId: 'test/file-read', releaseTag: 'v1', path: 'TIT.usfm', content: 'hello' });
    await s.putCachedRepo(repo, [file]);
    const fetched = await s.getCachedFile(repo.repoId, repo.releaseTag, 'TIT.usfm');
    expect(fetched?.content).toBe('hello');
  });

  it('getCachedFile returns null for missing file', async () => {
    const s = new IndexedDbSourceCacheStorage();
    const result = await s.getCachedFile('nonexistent', 'v1', 'anything.usfm');
    expect(result).toBeNull();
  });

  it('listCachedFiles returns paths for a snapshot', async () => {
    const s = new IndexedDbSourceCacheStorage();
    const repo = makeRepo({ repoId: 'test/listfiles', releaseTag: 'v1' });
    await s.putCachedRepo(repo, [
      makeFile({ repoId: 'test/listfiles', releaseTag: 'v1', path: 'a.usfm' }),
      makeFile({ repoId: 'test/listfiles', releaseTag: 'v1', path: 'b.usfm' }),
    ]);
    const paths = await s.listCachedFiles(repo.repoId, repo.releaseTag);
    expect(paths.sort()).toEqual(['a.usfm', 'b.usfm'].sort());
  });

  it('getCachedFile stores only raw content (no usjCache field)', async () => {
    const s = new IndexedDbSourceCacheStorage();
    const repo = makeRepo({ repoId: 'test/usj', releaseTag: 'v1' });
    const file = makeFile({ repoId: 'test/usj', releaseTag: 'v1', path: 'GEN.usfm', content: 'raw' });
    await s.putCachedRepo(repo, [file]);
    const fetched = await s.getCachedFile(repo.repoId, repo.releaseTag, 'GEN.usfm');
    expect(fetched?.content).toBe('raw');
    // Parsed USJ lives in ProcessedCacheStorage (Layer 2), not here.
    expect(fetched).not.toHaveProperty('usjCache');
    expect(fetched).not.toHaveProperty('usjCacheVersion');
  });
});

describe('IndexedDbSourceCacheStorage — Version pins', () => {
  it('setPin and getPin round-trip', async () => {
    const s = new IndexedDbSourceCacheStorage();
    await s.setPin({ projectId: 'proj1', repoId: 'test/en_ult', pinnedTag: 'v80', availableTag: null });
    const pin = await s.getPin('proj1', 'test/en_ult');
    expect(pin?.pinnedTag).toBe('v80');
    expect(pin?.availableTag).toBeNull();
  });

  it('getPin returns null when no pin exists', async () => {
    const s = new IndexedDbSourceCacheStorage();
    expect(await s.getPin('no-proj', 'no-repo')).toBeNull();
  });

  it('listPins returns all pins for a project', async () => {
    const s = new IndexedDbSourceCacheStorage();
    await s.setPin({ projectId: 'projA', repoId: 'test/en_ult', pinnedTag: 'v80', availableTag: null });
    await s.setPin({ projectId: 'projA', repoId: 'test/en_ust', pinnedTag: 'v50', availableTag: 'v51' });
    await s.setPin({ projectId: 'projB', repoId: 'test/en_ult', pinnedTag: 'v80', availableTag: null });
    const pinsA = await s.listPins('projA');
    expect(pinsA).toHaveLength(2);
    const pinsB = await s.listPins('projB');
    expect(pinsB).toHaveLength(1);
  });

  it('removePin deletes the pin', async () => {
    const s = new IndexedDbSourceCacheStorage();
    await s.setPin({ projectId: 'rem', repoId: 'test/en_ult', pinnedTag: 'v80', availableTag: null });
    await s.removePin('rem', 'test/en_ult');
    expect(await s.getPin('rem', 'test/en_ult')).toBeNull();
  });
});

describe('IndexedDbSourceCacheStorage — GC', () => {
  it('getReferencedSnapshots returns pinned (repoId, releaseTag) pairs', async () => {
    const s = new IndexedDbSourceCacheStorage();
    await s.setPin({ projectId: 'gcproj', repoId: 'test/gc_ult', pinnedTag: 'v1', availableTag: null });
    const refs = await s.getReferencedSnapshots();
    const found = refs.find((r) => r.repoId === 'test/gc_ult' && r.releaseTag === 'v1');
    expect(found).toBeDefined();
  });

  it('garbageCollect removes unreferenced snapshots and keeps referenced ones', async () => {
    const s = new IndexedDbSourceCacheStorage();
    // Pinned snapshot — must be kept.
    const kept = makeRepo({ repoId: 'test/gc-kept', releaseTag: 'v1' });
    await s.putCachedRepo(kept, []);
    await s.setPin({ projectId: 'gcproj2', repoId: 'test/gc-kept', pinnedTag: 'v1', availableTag: null });

    // Orphaned snapshot — must be removed.
    const orphan = makeRepo({ repoId: 'test/gc-orphan', releaseTag: 'v2' });
    await s.putCachedRepo(orphan, []);

    const removed = await s.garbageCollect();
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(await s.getCachedRepo(kept.repoId, kept.releaseTag)).not.toBeNull();
    expect(await s.getCachedRepo(orphan.repoId, orphan.releaseTag)).toBeNull();
  });
});

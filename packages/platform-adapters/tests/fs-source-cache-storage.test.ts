/**
 * Unit tests for FsSourceCacheStorage using an in-memory FileSystemAdapter mock.
 */
import { FsSourceCacheStorage } from '../src/tauri/fs-source-cache-storage';
import type { FileSystemAdapter } from '../src/interfaces/fs-adapter';
import type { CachedSourceFile, CachedSourceRepo, ProjectSourcePin } from '@usfm-tools/types';

// ---------------------------------------------------------------------------
// In-memory FileSystemAdapter mock (same pattern as fs-project-storage tests)
// ---------------------------------------------------------------------------
class MemFs implements FileSystemAdapter {
  readonly store = new Map<string, string>();

  private norm(path: string) {
    return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
  }

  async readFile(path: string): Promise<Uint8Array> {
    return new TextEncoder().encode(await this.readText(path));
  }
  async writeFile(path: string, data: Uint8Array): Promise<void> {
    this.store.set(this.norm(path), new TextDecoder().decode(data));
  }
  async readText(path: string): Promise<string> {
    const v = this.store.get(this.norm(path));
    if (v === undefined) throw new Error(`ENOENT: ${path}`);
    return v;
  }
  async writeText(path: string, text: string): Promise<void> {
    this.store.set(this.norm(path), text);
  }
  async exists(path: string): Promise<boolean> {
    return this.store.has(this.norm(path));
  }
  async mkdir(): Promise<void> { /* no-op */ }
  async listDir(path: string): Promise<string[]> {
    const prefix = this.norm(path) + '/';
    const children = new Set<string>();
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        const segment = key.slice(prefix.length).split('/')[0];
        if (segment) children.add(segment);
      }
    }
    if (children.size === 0) throw new Error(`ENOENT: ${path}`);
    return [...children].sort();
  }
  async remove(path: string, recursive = false): Promise<void> {
    const norm = this.norm(path);
    if (recursive) {
      const prefix = norm + '/';
      for (const key of [...this.store.keys()]) {
        if (key === norm || key.startsWith(prefix)) this.store.delete(key);
      }
    } else {
      if (!this.store.has(norm)) throw new Error(`ENOENT: ${path}`);
      this.store.delete(norm);
    }
  }
  async copy(src: string, dest: string): Promise<void> {
    this.store.set(this.norm(dest), await this.readText(src));
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRepo(repoId: string, releaseTag: string, langCode = 'en'): CachedSourceRepo {
  return {
    repoId,
    langCode,
    subject: 'Aligned Bible',
    releaseTag,
    downloadedAt: '2024-01-01T00:00:00Z',
    sizeBytes: 1000,
    fileCount: 1,
  };
}

function makeFile(repoId: string, releaseTag: string, path: string): CachedSourceFile {
  return {
    repoId,
    releaseTag,
    path,
    content: `\\id ${path}`,
  };
}

function makePin(projectId: string, repoId: string, pinnedTag: string): ProjectSourcePin {
  return { projectId, repoId, pinnedTag, availableTag: null };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('FsSourceCacheStorage', () => {
  let fs: MemFs;
  let cache: FsSourceCacheStorage;

  beforeEach(() => {
    fs = new MemFs();
    cache = new FsSourceCacheStorage(fs, 'sc');
  });

  // ── Repo snapshots ────────────────────────────────────────────────────────

  it('puts and retrieves a cached repo', async () => {
    const repo = makeRepo('unfoldingWord/en_ult', 'v87');
    const files = [makeFile('unfoldingWord/en_ult', 'v87', '57-TIT.usfm')];
    await cache.putCachedRepo(repo, files);
    const result = await cache.getCachedRepo('unfoldingWord/en_ult', 'v87');
    expect(result).toEqual(repo);
  });

  it('returns null for a missing repo', async () => {
    expect(await cache.getCachedRepo('x/y', 'v1')).toBeNull();
  });

  it('lists all cached repos', async () => {
    await cache.putCachedRepo(makeRepo('a/ult', 'v1'), []);
    await cache.putCachedRepo(makeRepo('a/ust', 'v2'), []);
    const list = await cache.listCachedRepos();
    expect(list.map((r) => r.repoId).sort()).toEqual(['a/ult', 'a/ust']);
  });

  it('filters repos by langCode', async () => {
    await cache.putCachedRepo(makeRepo('a/en', 'v1', 'en'), []);
    await cache.putCachedRepo(makeRepo('a/es', 'v1', 'es'), []);
    const en = await cache.listCachedRepos('en');
    expect(en.map((r) => r.repoId)).toEqual(['a/en']);
  });

  it('returns empty list when no repos cached', async () => {
    expect(await cache.listCachedRepos()).toEqual([]);
  });

  it('replaces files on second putCachedRepo', async () => {
    const repo = makeRepo('a/ult', 'v1');
    await cache.putCachedRepo(repo, [makeFile('a/ult', 'v1', 'old.usfm')]);
    await cache.putCachedRepo(repo, [makeFile('a/ult', 'v1', 'new.usfm')]);
    const files = await cache.listCachedFiles('a/ult', 'v1');
    expect(files).toContain('new.usfm');
    expect(files).not.toContain('old.usfm');
  });

  it('deletes a cached repo', async () => {
    await cache.putCachedRepo(makeRepo('a/ult', 'v1'), [makeFile('a/ult', 'v1', 'f.usfm')]);
    await cache.deleteCachedRepo('a/ult', 'v1');
    expect(await cache.getCachedRepo('a/ult', 'v1')).toBeNull();
    expect(await cache.listCachedFiles('a/ult', 'v1')).toEqual([]);
  });

  // ── Files ─────────────────────────────────────────────────────────────────

  it('retrieves a cached file', async () => {
    const file = makeFile('a/ult', 'v1', '57-TIT.usfm');
    await cache.putCachedRepo(makeRepo('a/ult', 'v1'), [file]);
    const result = await cache.getCachedFile('a/ult', 'v1', '57-TIT.usfm');
    expect(result).toEqual(file);
  });

  it('returns null for a missing cached file', async () => {
    expect(await cache.getCachedFile('a/ult', 'v1', 'ghost.usfm')).toBeNull();
  });

  it('lists cached file paths', async () => {
    await cache.putCachedRepo(makeRepo('a/ult', 'v1'), [
      makeFile('a/ult', 'v1', '01-GEN.usfm'),
      makeFile('a/ult', 'v1', '02-EXO.usfm'),
    ]);
    const files = await cache.listCachedFiles('a/ult', 'v1');
    expect(files).toContain('01-GEN.usfm');
    expect(files).toContain('02-EXO.usfm');
  });

  it('returns empty array for missing snapshot files', async () => {
    expect(await cache.listCachedFiles('none', 'v0')).toEqual([]);
  });

  it('round-trips file paths that contain forward slashes', async () => {
    const path = 'bible/57-TIT.usfm';
    const file = makeFile('a/ult', 'v1', path);
    await cache.putCachedRepo(makeRepo('a/ult', 'v1'), [file]);
    // getCachedFile should find the file by original path
    const result = await cache.getCachedFile('a/ult', 'v1', path);
    expect(result).toEqual(file);
    // listCachedFiles should return the decoded path (with slashes restored)
    const files = await cache.listCachedFiles('a/ult', 'v1');
    expect(files).toContain(path);
  });

  it('round-trips file paths that contain percent signs', async () => {
    const path = '57%2FTIT.usfm';
    const file = makeFile('a/ult', 'v1', path);
    await cache.putCachedRepo(makeRepo('a/ult', 'v1'), [file]);
    const result = await cache.getCachedFile('a/ult', 'v1', path);
    expect(result).toEqual(file);
    const files = await cache.listCachedFiles('a/ult', 'v1');
    expect(files).toContain(path);
  });

  // ── Pins ──────────────────────────────────────────────────────────────────

  it('sets and retrieves a pin', async () => {
    const pin = makePin('proj1', 'a/ult', 'v87');
    await cache.setPin(pin);
    const result = await cache.getPin('proj1', 'a/ult');
    expect(result).toEqual(pin);
  });

  it('returns null for a missing pin', async () => {
    expect(await cache.getPin('proj1', 'a/ult')).toBeNull();
  });

  it('updates an existing pin', async () => {
    await cache.setPin(makePin('proj1', 'a/ult', 'v87'));
    await cache.setPin({ ...makePin('proj1', 'a/ult', 'v88'), availableTag: null });
    const result = await cache.getPin('proj1', 'a/ult');
    expect(result?.pinnedTag).toBe('v88');
  });

  it('lists all pins for a project', async () => {
    await cache.setPin(makePin('proj1', 'a/ult', 'v1'));
    await cache.setPin(makePin('proj1', 'a/ust', 'v1'));
    const pins = await cache.listPins('proj1');
    expect(pins.map((p) => p.repoId).sort()).toEqual(['a/ult', 'a/ust']);
  });

  it('removes a pin', async () => {
    await cache.setPin(makePin('proj1', 'a/ult', 'v1'));
    await cache.removePin('proj1', 'a/ult');
    expect(await cache.getPin('proj1', 'a/ult')).toBeNull();
  });

  // ── Garbage collection ───────────────────────────────────────────────────

  it('garbage collects unreferenced snapshots', async () => {
    await cache.putCachedRepo(makeRepo('a/ult', 'v1'), []);
    await cache.putCachedRepo(makeRepo('a/ult', 'v2'), []);
    await cache.setPin(makePin('proj1', 'a/ult', 'v2'));
    const removed = await cache.garbageCollect();
    expect(removed).toBe(1);
    expect(await cache.getCachedRepo('a/ult', 'v1')).toBeNull();
    expect(await cache.getCachedRepo('a/ult', 'v2')).not.toBeNull();
  });

  it('garbage collect returns 0 when all snapshots are referenced', async () => {
    await cache.putCachedRepo(makeRepo('a/ult', 'v1'), []);
    await cache.setPin(makePin('p', 'a/ult', 'v1'));
    expect(await cache.garbageCollect()).toBe(0);
  });

  it('getReferencedSnapshots returns unique repo+tag pairs', async () => {
    await cache.setPin(makePin('p1', 'a/ult', 'v1'));
    await cache.setPin(makePin('p2', 'a/ult', 'v1'));
    await cache.setPin(makePin('p1', 'a/ust', 'v2'));
    const refs = await cache.getReferencedSnapshots();
    expect(refs).toHaveLength(2);
  });
});

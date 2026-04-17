/**
 * Unit tests for FsProjectStorage using an in-memory FileSystemAdapter mock.
 */
import { FsProjectStorage } from '../src/tauri/fs-project-storage';
import type { FileSystemAdapter } from '../src/interfaces/fs-adapter';
import type { ProjectMeta, ProjectRelease } from '@usfm-tools/types';

// ---------------------------------------------------------------------------
// In-memory FileSystemAdapter mock
// ---------------------------------------------------------------------------
class MemFs implements FileSystemAdapter {
  private readonly store = new Map<string, string>();

  private normKey(path: string) {
    return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
  }

  async readFile(path: string): Promise<Uint8Array> {
    const text = this.store.get(this.normKey(path));
    if (text === undefined) throw new Error(`ENOENT: ${path}`);
    return new TextEncoder().encode(text);
  }

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    this.store.set(this.normKey(path), new TextDecoder().decode(data));
  }

  async readText(path: string): Promise<string> {
    const text = this.store.get(this.normKey(path));
    if (text === undefined) throw new Error(`ENOENT: ${path}`);
    return text;
  }

  async writeText(path: string, text: string): Promise<void> {
    this.store.set(this.normKey(path), text);
  }

  async exists(path: string): Promise<boolean> {
    return this.store.has(this.normKey(path));
  }

  async mkdir(_path: string, _recursive?: boolean): Promise<void> {
    // No-op — virtual FS doesn't need real directories.
  }

  async listDir(path: string): Promise<string[]> {
    const prefix = this.normKey(path) + '/';
    const children = new Set<string>();
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        // Return the immediate child name (first segment after the prefix).
        const rest = key.slice(prefix.length);
        const segment = rest.split('/')[0];
        if (segment) children.add(segment);
      }
    }
    if (children.size === 0) throw new Error(`ENOENT: ${path}`);
    return [...children].sort();
  }

  async remove(path: string, recursive = false): Promise<void> {
    const norm = this.normKey(path);
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
    const text = await this.readText(src);
    await this.writeText(dest, text);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeMeta(id: string): ProjectMeta {
  return {
    id,
    name: `Project ${id}`,
    language: 'en',
    format: 'resource-container',
    created: '2024-01-01T00:00:00Z',
    updated: '2024-01-01T00:00:00Z',
  };
}

function makeRelease(version: string): ProjectRelease {
  return {
    version,
    title: `Release ${version}`,
    created: '2024-01-01T00:00:00Z',
    books: ['TIT'],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('FsProjectStorage', () => {
  let fs: MemFs;
  let storage: FsProjectStorage;

  beforeEach(() => {
    fs = new MemFs();
    storage = new FsProjectStorage(fs, 'projects');
  });

  // ── Projects ──────────────────────────────────────────────────────────────

  it('creates and retrieves a project', async () => {
    const meta = makeMeta('proj1');
    await storage.createProject(meta);
    const result = await storage.getProject('proj1');
    expect(result).toEqual(meta);
  });

  it('throws when creating a duplicate project', async () => {
    await storage.createProject(makeMeta('dupe'));
    await expect(storage.createProject(makeMeta('dupe'))).rejects.toThrow('already exists');
  });

  it('returns null for a missing project', async () => {
    const result = await storage.getProject('ghost');
    expect(result).toBeNull();
  });

  it('lists projects sorted by updated desc', async () => {
    const a = { ...makeMeta('a'), updated: '2024-01-01T00:00:00Z' };
    const b = { ...makeMeta('b'), updated: '2024-02-01T00:00:00Z' };
    await storage.createProject(a);
    await storage.createProject(b);
    const list = await storage.listProjects();
    expect(list.map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('updates a project', async () => {
    await storage.createProject(makeMeta('upd'));
    await storage.updateProject('upd', { name: 'Updated' });
    const result = await storage.getProject('upd');
    expect(result?.name).toBe('Updated');
    expect(result?.id).toBe('upd');
  });

  it('throws when updating a missing project', async () => {
    await expect(storage.updateProject('nope', { name: 'x' })).rejects.toThrow('not found');
  });

  it('deletes a project', async () => {
    await storage.createProject(makeMeta('del'));
    await storage.deleteProject('del');
    expect(await storage.getProject('del')).toBeNull();
  });

  it('deleteProject is a no-op when the project does not exist', async () => {
    // Should not throw when the directory is absent.
    await expect(storage.deleteProject('ghost')).resolves.toBeUndefined();
  });

  it('returns empty list when projects dir does not exist', async () => {
    expect(await storage.listProjects()).toEqual([]);
  });

  // ── Files ─────────────────────────────────────────────────────────────────

  it('writes and reads a file', async () => {
    await storage.createProject(makeMeta('fp'));
    await storage.writeFile('fp', '01-GEN.usfm', '\\id GEN');
    const content = await storage.readFile('fp', '01-GEN.usfm');
    expect(content).toBe('\\id GEN');
  });

  it('returns null for a missing file', async () => {
    await storage.createProject(makeMeta('fp2'));
    expect(await storage.readFile('fp2', 'missing.usfm')).toBeNull();
  });

  it('normalizes path separators on write and read', async () => {
    await storage.createProject(makeMeta('np'));
    await storage.writeFile('np', '.\\sub\\01-GEN.usfm', 'content');
    expect(await storage.readFile('np', 'sub/01-GEN.usfm')).toBe('content');
  });

  it('lists files', async () => {
    await storage.createProject(makeMeta('lf'));
    await storage.writeFile('lf', '01-GEN.usfm', 'a');
    await storage.writeFile('lf', '02-EXO.usfm', 'b');
    const files = await storage.listFiles('lf');
    expect(files).toContain('01-GEN.usfm');
    expect(files).toContain('02-EXO.usfm');
  });

  it('filters listed files by prefix', async () => {
    await storage.createProject(makeMeta('pfx'));
    await storage.writeFile('pfx', 'ot/01-GEN.usfm', 'a');
    await storage.writeFile('pfx', 'nt/41-MAT.usfm', 'b');
    const ot = await storage.listFiles('pfx', 'ot/');
    expect(ot).toContain('ot/01-GEN.usfm');
    expect(ot).not.toContain('nt/41-MAT.usfm');
  });

  it('writeFile updates the project updated timestamp', async () => {
    const meta = { ...makeMeta('ts1'), updated: '2024-01-01T00:00:00Z' };
    await storage.createProject(meta);
    await storage.writeFile('ts1', 'file.usfm', 'hello');
    const updated = await storage.getProject('ts1');
    expect(updated?.updated).not.toBe('2024-01-01T00:00:00Z');
  });

  it('deletes a file', async () => {
    await storage.createProject(makeMeta('df'));
    await storage.writeFile('df', 'file.usfm', 'x');
    await storage.deleteFile('df', 'file.usfm');
    expect(await storage.readFile('df', 'file.usfm')).toBeNull();
  });

  it('deleteFile updates the project updated timestamp', async () => {
    const meta = { ...makeMeta('ts2'), updated: '2024-01-01T00:00:00Z' };
    await storage.createProject(meta);
    await storage.writeFile('ts2', 'file.usfm', 'x');
    await storage.deleteFile('ts2', 'file.usfm');
    const updated = await storage.getProject('ts2');
    expect(updated?.updated).not.toBe('2024-01-01T00:00:00Z');
  });

  it('lists deeply nested files (depth 3+)', async () => {
    await storage.createProject(makeMeta('deep'));
    await storage.writeFile('deep', 'a/b/c/deep.usfm', 'deep content');
    await storage.writeFile('deep', 'a/b/shallow.usfm', 'shallow content');
    const files = await storage.listFiles('deep');
    expect(files).toContain('a/b/c/deep.usfm');
    expect(files).toContain('a/b/shallow.usfm');
  });

  it('prefix filter works with deeply nested paths', async () => {
    await storage.createProject(makeMeta('deepf'));
    await storage.writeFile('deepf', 'a/b/c/deep.usfm', 'd');
    await storage.writeFile('deepf', 'x/y.usfm', 'x');
    const filtered = await storage.listFiles('deepf', 'a/');
    expect(filtered).toContain('a/b/c/deep.usfm');
    expect(filtered).not.toContain('x/y.usfm');
  });

  // ── Releases ──────────────────────────────────────────────────────────────

  it('creates and lists releases', async () => {
    await storage.createProject(makeMeta('rel'));
    await storage.createRelease('rel', makeRelease('v1.0.0'));
    await storage.createRelease('rel', makeRelease('v2.0.0'));
    const releases = await storage.listReleases('rel');
    expect(releases.map((r) => r.version)).toEqual(['v2.0.0', 'v1.0.0']);
  });

  it('returns empty releases for unknown project', async () => {
    expect(await storage.listReleases('none')).toEqual([]);
  });

  it('updates a release', async () => {
    await storage.createProject(makeMeta('uprel'));
    await storage.createRelease('uprel', makeRelease('v1.0.0'));
    await storage.updateRelease('uprel', 'v1.0.0', { title: 'Patched' });
    const releases = await storage.listReleases('uprel');
    expect(releases[0]?.title).toBe('Patched');
    expect(releases[0]?.version).toBe('v1.0.0');
  });

  it('throws when updating a missing release', async () => {
    await storage.createProject(makeMeta('norel'));
    await expect(storage.updateRelease('norel', 'v9.9.9', {})).rejects.toThrow('not found');
  });

  // ── Sync SHAs ─────────────────────────────────────────────────────────────

  it('stores and retrieves sync SHAs', async () => {
    await storage.createProject(makeMeta('sha'));
    const shas = { '01-GEN.usfm': 'abc123', '02-EXO.usfm': 'def456' };
    await storage.setSyncShas('sha', shas);
    const result = await storage.getSyncShas('sha');
    expect(result).toEqual(shas);
  });

  it('returns empty object for missing sync SHAs', async () => {
    expect(await storage.getSyncShas('no-shas')).toEqual({});
  });

  it('replaces sync SHAs on second call', async () => {
    await storage.createProject(makeMeta('rsha'));
    await storage.setSyncShas('rsha', { a: '1' });
    await storage.setSyncShas('rsha', { b: '2' });
    expect(await storage.getSyncShas('rsha')).toEqual({ b: '2' });
  });
});

import type { ProjectMeta, ProjectRelease } from '@usfm-tools/types';
import { IndexedDbProjectStorage } from '../src/storage/indexeddb-project-storage';

function sampleMeta(id: string, updated = '2026-01-01T00:00:00.000Z'): ProjectMeta {
  return {
    id,
    name: `Name ${id}`,
    language: 'en',
    format: 'resource-container',
    created: '2026-01-01T00:00:00.000Z',
    updated,
  };
}

/** Isolated DB per call avoids `deleteDatabase` races under fake-indexeddb. */
function storage(): IndexedDbProjectStorage {
  return new IndexedDbProjectStorage(`test-usfm-proj-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`);
}

describe('IndexedDbProjectStorage', () => {
  it('creates a project and lists it', async () => {
    const s = storage();
    const meta = sampleMeta('MYPROJ');
    await expect(s.createProject(meta)).resolves.toBe('MYPROJ');
    await expect(s.getProject('MYPROJ')).resolves.toEqual(meta);
    const list = await s.listProjects();
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe('MYPROJ');
  });

  it('rejects duplicate createProject', async () => {
    const s = storage();
    const meta = sampleMeta('DUP');
    await s.createProject(meta);
    await expect(s.createProject(meta)).rejects.toThrow(/already exists/);
  });

  it('writes and reads files, listFiles, deleteFile', async () => {
    const s = storage();
    await s.createProject(sampleMeta('F1'));
    await s.writeFile('F1', 'manifest.yaml', 'hello');
    await expect(s.readFile('F1', 'manifest.yaml')).resolves.toBe('hello');
    await s.writeFile('F1', 'checking/stages.json', '{}');
    const all = await s.listFiles('F1');
    expect(all.sort()).toEqual(['checking/stages.json', 'manifest.yaml']);
    const prefixed = await s.listFiles('F1', 'checking/');
    expect(prefixed).toEqual(['checking/stages.json']);
    await s.deleteFile('F1', 'manifest.yaml');
    await expect(s.readFile('F1', 'manifest.yaml')).resolves.toBeNull();
  });

  it('bumps project updated on writeFile', async () => {
    const s = storage();
    const meta = sampleMeta('U1', '2020-01-01T00:00:00.000Z');
    await s.createProject(meta);
    await s.writeFile('U1', 'a.txt', 'x');
    const after = await s.getProject('U1');
    expect(after!.updated >= meta.updated).toBe(true);
    expect(after!.updated).not.toBe('2020-01-01T00:00:00.000Z');
  });

  it('updateProject merges fields', async () => {
    const s = storage();
    await s.createProject(sampleMeta('UP'));
    await s.updateProject('UP', { name: 'Renamed' });
    const m = await s.getProject('UP');
    expect(m!.name).toBe('Renamed');
    expect(m!.id).toBe('UP');
  });

  it('createRelease and listReleases', async () => {
    const s = storage();
    await s.createProject(sampleMeta('REL'));
    const rel: ProjectRelease = {
      version: 'v1.0.0',
      versionLabel: 'A1',
      title: 'First',
      created: '2026-02-01T12:00:00.000Z',
      books: ['GEN', 'EXO'],
    };
    await s.createRelease('REL', rel);
    const list = await s.listReleases('REL');
    expect(list).toHaveLength(1);
    expect(list[0]!.version).toBe('v1.0.0');
    expect(list[0]!.books).toEqual(['GEN', 'EXO']);
  });

  it('deleteProject removes project, files, and releases', async () => {
    const s = storage();
    await s.createProject(sampleMeta('DEL'));
    await s.writeFile('DEL', 'x.usfm', '\\id GEN');
    await s.createRelease('DEL', {
      version: 'v1.0.0',
      created: '2026-01-01T00:00:00.000Z',
      books: ['GEN'],
    });
    await s.setSyncShas('DEL', { 'x.usfm': 'abc123' });
    await s.deleteProject('DEL');
    await expect(s.getProject('DEL')).resolves.toBeNull();
    await expect(s.readFile('DEL', 'x.usfm')).resolves.toBeNull();
    await expect(s.listReleases('DEL')).resolves.toEqual([]);
    await expect(s.getSyncShas('DEL')).resolves.toEqual({});
  });

  it('getSyncShas and setSyncShas', async () => {
    const s = storage();
    await s.createProject(sampleMeta('SHA'));
    await expect(s.getSyncShas('SHA')).resolves.toEqual({});
    await s.setSyncShas('SHA', { 'a.txt': 'sha1', 'b/c.md': 'sha2' });
    await expect(s.getSyncShas('SHA')).resolves.toEqual({ 'a.txt': 'sha1', 'b/c.md': 'sha2' });
    await s.setSyncShas('SHA', { 'a.txt': 'sha3' });
    await expect(s.getSyncShas('SHA')).resolves.toEqual({ 'a.txt': 'sha3' });
  });

  it('normalizes path separators on write/read', async () => {
    const s = storage();
    await s.createProject(sampleMeta('NORM'));
    await s.writeFile('NORM', '.\\foo\\bar.txt', 'c');
    await expect(s.readFile('NORM', 'foo/bar.txt')).resolves.toBe('c');
  });
});

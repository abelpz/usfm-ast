/**
 * Unit tests for exportProjectBundle / importProjectBundle (project-bundle.ts).
 *   - Round-trip: export then re-import recovers all files unchanged
 *   - Checksum mismatch: import fails with a clear error
 *   - Legacy journal/project.jsonl is surfaced via the return value
 */

import JSZip from 'jszip';
import type { ProjectMeta, ProjectRelease, ProjectStorage } from '@usfm-tools/types';
import {
  exportProjectBundle,
  importProjectBundle,
  BUNDLE_MANIFEST,
  type BundleManifest,
} from '../../usfm-editor-app/src/lib/project-bundle';

// ---------------------------------------------------------------------------
// Minimal in-memory ProjectStorage (same helper pattern as sync-engine tests)
// ---------------------------------------------------------------------------

function makeStorage(): ProjectStorage & { _files: Map<string, string> } {
  const files = new Map<string, string>();
  const now = new Date().toISOString();
  const storedMeta: ProjectMeta = { id: 'p1', name: 'P', language: 'en', format: 'resource-container', created: now, updated: now };
  const releases: ProjectRelease[] = [];
  let syncShas: Record<string, string> = {};

  return {
    _files: files,
    createProject: async () => 'p1',
    listProjects: async () => [storedMeta],
    getProject: async () => storedMeta,
    updateProject: async () => {},
    deleteProject: async () => {},
    writeFile: async (_pid, path, content) => { files.set(path, content); },
    readFile: async (_pid, path) => files.get(path) ?? null,
    deleteFile: async (_pid, path) => { files.delete(path); },
    listFiles: async () => [...files.keys()],
    createRelease: async (_pid, rel) => { releases.push(rel); },
    listReleases: async () => releases,
    updateRelease: async (_pid, ver, patch) => {
      const i = releases.findIndex((r) => r.version === ver);
      if (i >= 0) releases[i] = { ...releases[i], ...patch };
    },
    getSyncShas: async () => ({ ...syncShas }),
    setSyncShas: async (_pid, shas) => { syncShas = { ...shas }; },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('exportProjectBundle / importProjectBundle', () => {
  it('round-trip: all files survive export → import unchanged', async () => {
    const src = makeStorage();
    await src.writeFile('p1', 'manifest.yaml', 'id: tit\n');
    await src.writeFile('p1', '56-TIT.usfm', '\\id TIT\n\\c 1\n\\v 1 Hello\n');
    await src.writeFile('p1', 'journal/TIT.jsonl', '{"id":"e1"}\n');

    const blob = await exportProjectBundle({ storage: src, projectId: 'p1' });

    const dest = makeStorage();
    const { importedPaths } = await importProjectBundle({
      storage: dest,
      projectId: 'p1',
      blob,
    });

    expect(importedPaths.sort()).toEqual(['56-TIT.usfm', 'journal/TIT.jsonl', 'manifest.yaml'].sort());
    expect(await dest.readFile('p1', '56-TIT.usfm')).toBe('\\id TIT\n\\c 1\n\\v 1 Hello\n');
    expect(await dest.readFile('p1', 'manifest.yaml')).toBe('id: tit\n');
    expect(await dest.readFile('p1', 'journal/TIT.jsonl')).toBe('{"id":"e1"}\n');
  });

  it('checksum mismatch: import rejects with descriptive error', async () => {
    const src = makeStorage();
    await src.writeFile('p1', '56-TIT.usfm', '\\id TIT\n');
    const blob = await exportProjectBundle({ storage: src, projectId: 'p1' });

    // Tamper with the zip: replace the file content but not the manifest sha
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    zip.folder('files')!.file('56-TIT.usfm', '\\id TIT\n/* tampered */\n');
    const tamperedBlob = await zip.generateAsync({ type: 'blob' });

    const dest = makeStorage();
    await expect(
      importProjectBundle({ storage: dest, projectId: 'p1', blob: tamperedBlob }),
    ).rejects.toThrow('Checksum mismatch');
  });

  it('bundle manifest is present and valid', async () => {
    const src = makeStorage();
    await src.writeFile('p1', '56-TIT.usfm', '\\id TIT\n');
    const blob = await exportProjectBundle({ storage: src, projectId: 'p1' });

    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const raw = await zip.file(BUNDLE_MANIFEST)?.async('string');
    expect(raw).toBeTruthy();
    const manifest = JSON.parse(raw!) as BundleManifest;
    expect(manifest.schema).toBe(1);
    expect(manifest.projectId).toBe('p1');
    expect(typeof manifest.exportedAt).toBe('string');
    expect(manifest.files['56-TIT.usfm']).toMatch(/^[0-9a-f]{64}$/);
  });

  it('legacy journal/project.jsonl is surfaced in return value', async () => {
    const src = makeStorage();
    await src.writeFile('p1', '56-TIT.usfm', '\\id TIT\n');
    const JOURNAL = '{"id":"j1","seq":1}\n';
    const blob = await exportProjectBundle({
      storage: src,
      projectId: 'p1',
      journalJsonl: JOURNAL,
    });

    const dest = makeStorage();
    const { journalJsonl } = await importProjectBundle({
      storage: dest,
      projectId: 'p1',
      blob,
    });

    expect(journalJsonl).toBe(JOURNAL);
  });

  it('empty project exports and imports with no files', async () => {
    const src = makeStorage();
    const blob = await exportProjectBundle({ storage: src, projectId: 'p1' });

    const dest = makeStorage();
    const { importedPaths } = await importProjectBundle({
      storage: dest,
      projectId: 'p1',
      blob,
    });
    expect(importedPaths).toHaveLength(0);
  });

  it('enableMerge: new-remote files are written without conflict', async () => {
    const src = makeStorage();
    await src.writeFile('p1', '56-TIT.usfm', '\\id TIT\n\\c 1\n\\v 1 Hello\n');
    const blob = await exportProjectBundle({ storage: src, projectId: 'p1' });

    const dest = makeStorage(); // empty — no pre-existing files
    const { importedPaths, conflicts } = await importProjectBundle({
      storage: dest,
      projectId: 'p1',
      blob,
      enableMerge: true,
    });

    expect(conflicts).toHaveLength(0);
    expect(importedPaths).toContain('56-TIT.usfm');
    expect(await dest.readFile('p1', '56-TIT.usfm')).toBe('\\id TIT\n\\c 1\n\\v 1 Hello\n');
  });

  it('enableMerge: identical local and bundle files produce no conflict', async () => {
    const content = '\\id TIT\n\\c 1\n\\v 1 Same\n';
    const src = makeStorage();
    await src.writeFile('p1', '56-TIT.usfm', content);
    const blob = await exportProjectBundle({ storage: src, projectId: 'p1' });

    const dest = makeStorage();
    await dest.writeFile('p1', '56-TIT.usfm', content); // same content pre-loaded

    const { importedPaths, conflicts } = await importProjectBundle({
      storage: dest,
      projectId: 'p1',
      blob,
      enableMerge: true,
    });

    expect(conflicts).toHaveLength(0);
    expect(importedPaths).toContain('56-TIT.usfm');
  });

  it('enableMerge: different local and bundle content surfaces a FileConflict', async () => {
    const src = makeStorage();
    await src.writeFile('p1', 'notes.txt', 'bundle version\n');
    const blob = await exportProjectBundle({ storage: src, projectId: 'p1' });

    const dest = makeStorage();
    await dest.writeFile('p1', 'notes.txt', 'local version\n'); // diverged

    const { conflicts } = await importProjectBundle({
      storage: dest,
      projectId: 'p1',
      blob,
      enableMerge: true,
    });

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].path).toBe('notes.txt');
    expect(conflicts[0].oursText).toBe('local version\n');
    expect(conflicts[0].theirsText).toBe('bundle version\n');
    // Conflicting file should NOT be overwritten yet
    expect(await dest.readFile('p1', 'notes.txt')).toBe('local version\n');
  });
});

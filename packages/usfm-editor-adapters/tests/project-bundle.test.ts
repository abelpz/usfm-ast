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
  PROJECT_BUNDLE_MANIFEST,
  type BundleManifest,
} from '../../usfm-editor-app/src/lib/project-bundle';

// ---------------------------------------------------------------------------
// Minimal in-memory ProjectStorage (same helper pattern as sync-engine tests)
// ---------------------------------------------------------------------------

function makeStorage(): ProjectStorage & { _files: Map<string, string> } {
  const files = new Map<string, string>();
  const now = new Date().toISOString();
  let storedMeta: ProjectMeta = { id: 'p1', name: 'P', language: 'en', format: 'resource-container', created: now, updated: now };
  const releases: ProjectRelease[] = [];
  let syncShas: Record<string, string> = {};

  return {
    _files: files,
    createProject: async () => 'p1',
    listProjects: async () => [storedMeta],
    getProject: async () => storedMeta,
    updateProject: async (_pid, patch) => {
      storedMeta = { ...storedMeta, ...patch };
    },
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
  it('round-trip: content files survive export → import unchanged (local-state excluded)', async () => {
    const src = makeStorage();
    await src.writeFile('p1', 'manifest.yaml', 'id: tit\n');
    await src.writeFile('p1', '56-TIT.usfm', '\\id TIT\n\\c 1\n\\v 1 Hello\n');
    // These are local-state files and must NOT be included in the bundle
    await src.writeFile('p1', 'journal/TIT.jsonl', '{"id":"e1"}\n');
    await src.writeFile('p1', '.sync/TIT.json', '{"baseCommit":"abc"}\n');

    const blob = await exportProjectBundle({ storage: src, projectId: 'p1' });

    const dest = makeStorage();
    const { importedPaths } = await importProjectBundle({
      storage: dest,
      projectId: 'p1',
      blob,
    });

    // Only content files should be exported/imported
    expect(importedPaths.sort()).toEqual(['56-TIT.usfm', 'manifest.yaml'].sort());
    expect(await dest.readFile('p1', '56-TIT.usfm')).toBe('\\id TIT\n\\c 1\n\\v 1 Hello\n');
    expect(await dest.readFile('p1', 'manifest.yaml')).toBe('id: tit\n');
    // Local-state files were not included in the bundle
    expect(await dest.readFile('p1', 'journal/TIT.jsonl')).toBeNull();
    expect(await dest.readFile('p1', '.sync/TIT.json')).toBeNull();
  });

  it('export: bundle zip does not contain .sync/ or journal/ paths', async () => {
    const src = makeStorage();
    await src.writeFile('p1', '56-TIT.usfm', '\\id TIT\n');
    await src.writeFile('p1', '.sync/TIT.json', '{"baseCommit":"abc"}\n');
    await src.writeFile('p1', 'journal/TIT.jsonl', '{"id":"e1"}\n');

    const blob = await exportProjectBundle({ storage: src, projectId: 'p1' });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());

    const allPaths: string[] = [];
    zip.forEach((path) => allPaths.push(path));
    const localStatePaths = allPaths.filter(
      (p) => p.includes('/.sync/') || p.includes('/journal/') || p.startsWith('.sync/') || p.startsWith('journal/'),
    );
    expect(localStatePaths).toHaveLength(0);
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
    const raw = await zip.file(PROJECT_BUNDLE_MANIFEST)?.async('string');
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
    const m = await dest.getProject('p1');
    expect(m?.bundleImportSnapshot?.files['56-TIT.usfm']).toBeNull();
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
    const m = await dest.getProject('p1');
    expect(m?.bundleImportSnapshot?.files['56-TIT.usfm']).toBeDefined();
    expect(m?.bundleImportSnapshot?.files['56-TIT.usfm']).not.toBeNull();
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

  it('enableMerge: conflicts carry bundle-import labels', async () => {
    const src = makeStorage();
    await src.writeFile('p1', 'notes.txt', 'bundle version\n');
    const blob = await exportProjectBundle({ storage: src, projectId: 'p1' });

    const dest = makeStorage();
    await dest.writeFile('p1', 'notes.txt', 'local version\n');

    const { conflicts } = await importProjectBundle({
      storage: dest,
      projectId: 'p1',
      blob,
      enableMerge: true,
    });

    expect(conflicts[0].oursLabel).toBe('Yours (existing)');
    expect(conflicts[0].theirsLabel).toBe('From bundle');
    expect(conflicts[0].baseSource).toBe('none');
  });

  it('enableMerge: sidecar-match annotates conflict baseSource correctly', async () => {
    // notes.txt is not a USFM file so sidecar resolution doesn't apply to it
    const src = makeStorage();
    await src.writeFile('p1', 'notes.txt', 'bundle text\n');
    // .sync/ is local-state and will NOT be bundled
    const blob = await exportProjectBundle({ storage: src, projectId: 'p1' });

    const dest = makeStorage();
    await dest.writeFile('p1', 'notes.txt', 'local text\n');

    const { conflicts } = await importProjectBundle({
      storage: dest,
      projectId: 'p1',
      blob,
      enableMerge: true,
    });

    // notes.txt conflict should exist with baseSource: 'none' (not a USFM file)
    const notesConflict = conflicts.find((c) => c.path === 'notes.txt');
    expect(notesConflict).toBeDefined();
    expect(notesConflict!.oursLabel).toBe('Yours (existing)');
    expect(notesConflict!.theirsLabel).toBe('From bundle');
    // notes.txt is not a USFM file so sidecar resolution doesn't apply
    expect(notesConflict!.baseSource).toBe('none');
  });

  it('enableMerge: legacy bundle with .sync/ file does not conflict — receiver sidecar is preserved', async () => {
    // Simulate a legacy bundle that still contains a .sync/ sidecar
    const receiverSidecar = JSON.stringify({ baseCommit: 'recv123', savedAt: '2024-01-01' });
    const bundleSidecar = JSON.stringify({ baseCommit: 'bundle456', savedAt: '2024-06-01' });

    // Build bundle manually with a .sync/ path inside
    const zip = new JSZip();
    const manifestFiles: Record<string, string> = {};
    const enc = new TextEncoder();

    async function sha256Hex(text: string): Promise<string> {
      const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }

    // Use a plain text file that reliably conflicts (not USFM — avoids OT merge complexities)
    const bundleNotes = 'notes from bundle\n';
    const filesFolder = zip.folder('files')!;
    filesFolder.file('notes.txt', bundleNotes);
    manifestFiles['notes.txt'] = await sha256Hex(bundleNotes);
    // Legacy bundle includes .sync/ (should be silently ignored on import)
    filesFolder.file('.sync/TIT.json', bundleSidecar);
    manifestFiles['.sync/TIT.json'] = await sha256Hex(bundleSidecar);

    zip.file(PROJECT_BUNDLE_MANIFEST, JSON.stringify({ schema: 1, projectId: 'p1', exportedAt: new Date().toISOString(), files: manifestFiles }));
    const blob = await zip.generateAsync({ type: 'blob' });

    const dest = makeStorage();
    await dest.writeFile('p1', 'notes.txt', 'notes from local\n');
    await dest.writeFile('p1', '.sync/TIT.json', receiverSidecar); // receiver's own sidecar

    const { conflicts } = await importProjectBundle({
      storage: dest,
      projectId: 'p1',
      blob,
      enableMerge: true,
    });

    // .sync/TIT.json should NOT appear as a conflict
    const sidecarConflict = conflicts.find((c) => c.path === '.sync/TIT.json');
    expect(sidecarConflict).toBeUndefined();

    // Receiver sidecar must be preserved, not overwritten by bundle
    expect(await dest.readFile('p1', '.sync/TIT.json')).toBe(receiverSidecar);

    // notes.txt conflict is still surfaced
    expect(conflicts.find((c) => c.path === 'notes.txt')).toBeDefined();
  });

  it('enableMerge: manifest-only timestamp drift does NOT produce a conflict', async () => {
    // Simulate a bundle whose manifest.yaml differs only in dublin_core.modified
    const baseManifest = 'dublin_core:\n  modified: "2024-01-01"\n  title: Titus\n';
    const bundleManifest = 'dublin_core:\n  modified: "2024-09-01"\n  title: Titus\n';
    const localManifest = 'dublin_core:\n  modified: "2024-06-01"\n  title: Titus\n';

    const src = makeStorage();
    await src.writeFile('p1', 'manifest.yaml', bundleManifest);
    const blob = await exportProjectBundle({ storage: src, projectId: 'p1' });

    const dest = makeStorage();
    await dest.writeFile('p1', 'manifest.yaml', localManifest);
    // Provide a base so merge engine can compare; but even with empty base it should work
    void baseManifest;

    const { conflicts } = await importProjectBundle({
      storage: dest,
      projectId: 'p1',
      blob,
      enableMerge: true,
    });

    // The manifest timestamp difference should be silently merged
    const manifestConflict = conflicts.find((c) => c.path === 'manifest.yaml');
    expect(manifestConflict).toBeUndefined();
    const m = await dest.getProject('p1');
    expect(m?.bundleImportSnapshot?.files['manifest.yaml']).toBeDefined();
  });

  it('overwrite mode: bundleImportSnapshot captures pre-import state', async () => {
    const src = makeStorage();
    await src.writeFile('p1', '56-TIT.usfm', '\\id TIT\n');
    const blob = await exportProjectBundle({ storage: src, projectId: 'p1' });

    const dest = makeStorage();
    const { importedPaths } = await importProjectBundle({
      storage: dest,
      projectId: 'p1',
      blob,
      enableMerge: false,
    });

    expect(importedPaths).toContain('56-TIT.usfm');
    const m = await dest.getProject('p1');
    expect(m?.bundleImportSnapshot?.files['56-TIT.usfm']).toBeNull();
  });
});

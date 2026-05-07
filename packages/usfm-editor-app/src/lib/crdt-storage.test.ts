import { describe, expect, test } from 'bun:test';
import { writeFileWithCrdt } from './crdt-storage';
import { yjsBase64ToUsfm } from '@usfm-tools/editor-adapters';
import type { ProjectStorage } from '@usfm-tools/types';

// ---------------------------------------------------------------------------
// Minimal in-memory ProjectStorage stub for tests
// ---------------------------------------------------------------------------

function makeStorage(): ProjectStorage & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    createProject: async () => 'proj',
    listProjects: async () => [],
    getProject: async () => null,
    updateProject: async () => {},
    deleteProject: async () => {},
    writeFile: async (_id, path, content) => { files.set(path, content); },
    readFile: async (_id, path) => files.get(path) ?? null,
    deleteFile: async (_id, path) => { files.delete(path); },
    listFiles: async () => [...files.keys()],
    createRelease: async () => {},
    listReleases: async () => [],
    updateRelease: async () => {},
    getSyncShas: async () => ({}),
    setSyncShas: async () => {},
  };
}

// ---------------------------------------------------------------------------
// writeFileWithCrdt
// ---------------------------------------------------------------------------

const USFM = `\\id JHN
\\c 1
\\p
\\v 1 In the beginning was the Word.
`;

describe('writeFileWithCrdt', () => {
  test('writes the USFM file normally', async () => {
    const storage = makeStorage();
    await writeFileWithCrdt(storage, 'proj', 'files/JHN.usfm', USFM);
    expect(storage.files.get('files/JHN.usfm')).toBe(USFM);
  });

  test('also writes a companion crdt/*.ybin file for USFM paths', async () => {
    const storage = makeStorage();
    await writeFileWithCrdt(storage, 'proj', 'files/JHN.usfm', USFM);
    const ybinKey = 'crdt/JHN.ybin';
    expect(storage.files.has(ybinKey)).toBe(true);
  });

  test('.ybin content decodes back to the original USFM', async () => {
    const storage = makeStorage();
    await writeFileWithCrdt(storage, 'proj', 'files/JHN.usfm', USFM);
    const base64 = storage.files.get('crdt/JHN.ybin')!;
    expect(yjsBase64ToUsfm(base64)).toBe(USFM);
  });

  test('handles numbered-prefix USFM paths', async () => {
    const storage = makeStorage();
    await writeFileWithCrdt(storage, 'proj', '65-3JN.usfm', USFM);
    expect(storage.files.has('files/JHN.usfm')).toBe(false);  // raw write goes to original path
    expect(storage.files.has('65-3JN.usfm')).toBe(true);
    expect(storage.files.has('crdt/65-3JN.ybin')).toBe(true);
  });

  test('does NOT write .ybin for non-USFM files', async () => {
    const storage = makeStorage();
    await writeFileWithCrdt(storage, 'proj', 'manifest.yaml', 'title: Test\n');
    expect([...storage.files.keys()]).toEqual(['manifest.yaml']);
  });

  test('does NOT write .ybin for JSON alignment files', async () => {
    const storage = makeStorage();
    await writeFileWithCrdt(storage, 'proj', 'JHN.alignment.json', '{}');
    expect([...storage.files.keys()]).toEqual(['JHN.alignment.json']);
  });

  test('is non-fatal when .ybin write throws', async () => {
    const storage = makeStorage();
    let writeCount = 0;
    const originalWrite = storage.writeFile.bind(storage);
    storage.writeFile = async (id, path, content) => {
      writeCount++;
      if (path.endsWith('.ybin')) throw new Error('storage quota');
      return originalWrite(id, path, content);
    };
    // Should not throw even though .ybin write fails
    await expect(writeFileWithCrdt(storage, 'proj', 'files/JHN.usfm', USFM)).resolves.toBeUndefined();
    expect(storage.files.get('files/JHN.usfm')).toBe(USFM);
    expect(writeCount).toBe(2); // USFM write + failed .ybin attempt
  });
});

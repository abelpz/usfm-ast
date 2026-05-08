import { describe, expect, test } from 'bun:test';
import { writeFileWithCrdt, readYbinAsUsfm } from './crdt-storage';
import { usfmToYjsBase64, yjsBase64ToUsfm } from '@usfm-tools/editor-adapters';
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

// ---------------------------------------------------------------------------
// readYbinAsUsfm
// ---------------------------------------------------------------------------

describe('readYbinAsUsfm', () => {
  test('returns USFM decoded from stored .ybin', async () => {
    const storage = makeStorage();
    storage.files.set('crdt/JHN.ybin', usfmToYjsBase64(USFM));
    const result = await readYbinAsUsfm(storage, 'proj', 'files/JHN.usfm');
    expect(result).toBe(USFM);
  });

  test('returns null when no .ybin exists', async () => {
    const storage = makeStorage();
    const result = await readYbinAsUsfm(storage, 'proj', 'files/JHN.usfm');
    expect(result).toBeNull();
  });

  test('returns null on storage error (non-fatal)', async () => {
    const storage = makeStorage();
    storage.readFile = async () => { throw new Error('I/O error'); };
    const result = await readYbinAsUsfm(storage, 'proj', 'files/JHN.usfm');
    expect(result).toBeNull();
  });

  test('round-trips: write with writeFileWithCrdt then read back', async () => {
    const storage = makeStorage();
    await writeFileWithCrdt(storage, 'proj', 'files/JHN.usfm', USFM);
    const result = await readYbinAsUsfm(storage, 'proj', 'files/JHN.usfm');
    expect(result).toBe(USFM);
  });
});

// ---------------------------------------------------------------------------
// Phase 7: incremental .ybin update (preserves genesis client IDs)
// ---------------------------------------------------------------------------

describe('writeFileWithCrdt — Phase 7 incremental update', () => {
  const USFM_V1 = '\\id JHN\n\\c 1\n\\p\n\\v 1 Version one.\n';
  const USFM_V2 = '\\id JHN\n\\c 1\n\\p\n\\v 1 Version two.\n';
  const USFM_V3 = '\\id JHN\n\\c 1\n\\p\n\\v 1 Version three.\n';

  test('second write updates the .ybin in place (incremental, not replaced)', async () => {
    const storage = makeStorage();
    await writeFileWithCrdt(storage, 'proj', 'files/JHN.usfm', USFM_V1);
    const ybin1 = storage.files.get('crdt/JHN.ybin')!;

    await writeFileWithCrdt(storage, 'proj', 'files/JHN.usfm', USFM_V2);
    const ybin2 = storage.files.get('crdt/JHN.ybin')!;

    // State grew (operations accumulated)
    expect(ybin2.length).toBeGreaterThan(ybin1.length);
    // Decodes to latest content
    expect(yjsBase64ToUsfm(ybin2)).toBe(USFM_V2);
  });

  test('three consecutive writes all decode to the final content', async () => {
    const storage = makeStorage();
    await writeFileWithCrdt(storage, 'proj', 'files/JHN.usfm', USFM_V1);
    await writeFileWithCrdt(storage, 'proj', 'files/JHN.usfm', USFM_V2);
    await writeFileWithCrdt(storage, 'proj', 'files/JHN.usfm', USFM_V3);
    const result = await readYbinAsUsfm(storage, 'proj', 'files/JHN.usfm');
    expect(result).toBe(USFM_V3);
  });

  test('.ybin from consecutive writes is larger than genesis (history is preserved)', async () => {
    const storage = makeStorage();
    await writeFileWithCrdt(storage, 'proj', 'files/JHN.usfm', USFM_V1);
    const genesis = storage.files.get('crdt/JHN.ybin')!;
    await writeFileWithCrdt(storage, 'proj', 'files/JHN.usfm', USFM_V2);
    await writeFileWithCrdt(storage, 'proj', 'files/JHN.usfm', USFM_V3);
    const accumulated = storage.files.get('crdt/JHN.ybin')!;
    expect(accumulated.length).toBeGreaterThan(genesis.length);
  });
});

import { YbinDocProvider } from '../src/ybin-doc-provider';
import { usfmToYjsBase64 } from '../src/yjs-codec';
import { crdtPathFromUsfm } from '../src/crdt-paths';
import type { ProjectStorage } from '@usfm-tools/types';

// ---------------------------------------------------------------------------
// In-memory ProjectStorage stub
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

const USFM_PATH = 'files/JHN.usfm';
const CRDT_PATH = crdtPathFromUsfm(USFM_PATH); // 'crdt/JHN.ybin'

const USFM = `\\id JHN
\\c 1
\\p
\\v 1 In the beginning was the Word.
\\v 2 He was in the beginning with God.
`;

// ---------------------------------------------------------------------------
// YbinDocProvider.load
// ---------------------------------------------------------------------------

describe('YbinDocProvider.load', () => {
  test('loads USFM from stored .ybin', async () => {
    const storage = makeStorage();
    storage.files.set(CRDT_PATH, usfmToYjsBase64(USFM));

    const provider = await YbinDocProvider.load(storage, 'proj', USFM_PATH);
    expect(provider.toUsfm()).toBe(USFM);
    provider.destroy();
  });

  test('falls back to USFM text file when no .ybin exists', async () => {
    const storage = makeStorage();
    storage.files.set(USFM_PATH, USFM);

    const provider = await YbinDocProvider.load(storage, 'proj', USFM_PATH);
    expect(provider.toUsfm()).toBe(USFM);
    provider.destroy();
  });

  test('returns empty doc when neither .ybin nor USFM file exists', async () => {
    const storage = makeStorage();
    const provider = await YbinDocProvider.load(storage, 'proj', USFM_PATH);
    expect(provider.toUsfm()).toBe('');
    provider.destroy();
  });

  test('prefers .ybin over USFM text (CRDT is source of truth)', async () => {
    const storage = makeStorage();
    const ybinContent = 'CRDT version: from .ybin\n';
    storage.files.set(CRDT_PATH, usfmToYjsBase64(ybinContent));
    storage.files.set(USFM_PATH, 'Different raw USFM\n');

    const provider = await YbinDocProvider.load(storage, 'proj', USFM_PATH);
    expect(provider.toUsfm()).toBe(ybinContent);
    provider.destroy();
  });

  test('is non-fatal when storage.readFile throws', async () => {
    const storage = makeStorage();
    storage.readFile = async () => { throw new Error('I/O error'); };

    const provider = await YbinDocProvider.load(storage, 'proj', USFM_PATH);
    expect(provider.toUsfm()).toBe('');
    provider.destroy();
  });
});

// ---------------------------------------------------------------------------
// YbinDocProvider.getDoc
// ---------------------------------------------------------------------------

describe('YbinDocProvider.getDoc', () => {
  test('returns the underlying Y.Doc', async () => {
    const storage = makeStorage();
    storage.files.set(CRDT_PATH, usfmToYjsBase64(USFM));

    const provider = await YbinDocProvider.load(storage, 'proj', USFM_PATH);
    const doc = provider.getDoc();
    expect(doc.getText('usfm').toString()).toBe(USFM);
    provider.destroy();
  });
});

// ---------------------------------------------------------------------------
// YbinDocProvider.applyUsfmUpdate
// ---------------------------------------------------------------------------

describe('YbinDocProvider.applyUsfmUpdate', () => {
  test('updates Y.Doc content to the new USFM', async () => {
    const storage = makeStorage();
    storage.files.set(CRDT_PATH, usfmToYjsBase64(USFM));

    const provider = await YbinDocProvider.load(storage, 'proj', USFM_PATH);
    const updated = USFM + '\\v 3 The light shines in the darkness.\n';
    provider.applyUsfmUpdate(updated);
    expect(provider.toUsfm()).toBe(updated);
    provider.destroy();
  });

  test('is a no-op when content is already identical', async () => {
    const storage = makeStorage();
    storage.files.set(CRDT_PATH, usfmToYjsBase64(USFM));

    const provider = await YbinDocProvider.load(storage, 'proj', USFM_PATH);
    const doc = provider.getDoc();
    let updateCount = 0;
    doc.on('update', () => { updateCount++; });

    provider.applyUsfmUpdate(USFM); // same content
    expect(updateCount).toBe(0);
    provider.destroy();
  });

  test('fires exactly one Y.Doc update for a content change', async () => {
    const storage = makeStorage();
    const provider = await YbinDocProvider.load(storage, 'proj', USFM_PATH);
    const doc = provider.getDoc();
    let updateCount = 0;
    doc.on('update', () => { updateCount++; });

    provider.applyUsfmUpdate('\\id JHN\n\\c 1\n');
    // Transact wraps the delete + insert into a single update event.
    expect(updateCount).toBe(1);
    provider.destroy();
  });
});

// ---------------------------------------------------------------------------
// YbinDocProvider.startPersisting
// ---------------------------------------------------------------------------

describe('YbinDocProvider.startPersisting', () => {
  test('writes .ybin to storage after an update (debounced)', async () => {
    const storage = makeStorage();
    const provider = await YbinDocProvider.load(storage, 'proj', USFM_PATH);

    // Use 0 ms debounce so flush runs in the same tick loop.
    const stop = provider.startPersisting(storage, 'proj', USFM_PATH, 0);

    provider.applyUsfmUpdate('\\id JHN\n\\c 2\n');

    // Allow the debounced setTimeout(0) to fire.
    await new Promise((r) => setTimeout(r, 20));

    const stored = storage.files.get(CRDT_PATH);
    expect(stored).toBeDefined();
    // Decoding should return the updated content.
    const { yjsBase64ToUsfm } = await import('../src/yjs-codec');
    expect(yjsBase64ToUsfm(stored!)).toBe('\\id JHN\n\\c 2\n');

    stop();
    provider.destroy();
  });

  test('cleanup function stops further writes', async () => {
    const storage = makeStorage();
    const provider = await YbinDocProvider.load(storage, 'proj', USFM_PATH);
    let writeCount = 0;
    const origWrite = storage.writeFile.bind(storage);
    storage.writeFile = async (id, path, content) => {
      if (path === CRDT_PATH) writeCount++;
      return origWrite(id, path, content);
    };

    const stop = provider.startPersisting(storage, 'proj', USFM_PATH, 0);
    stop(); // unsubscribe immediately

    provider.applyUsfmUpdate('\\id JHN\n\\c 3\n');
    await new Promise((r) => setTimeout(r, 20));

    expect(writeCount).toBe(0);
    provider.destroy();
  });
});

// ---------------------------------------------------------------------------
// YbinDocProvider.destroy
// ---------------------------------------------------------------------------

describe('YbinDocProvider.destroy', () => {
  test('stops persistence and destroys the doc', async () => {
    const storage = makeStorage();
    const provider = await YbinDocProvider.load(storage, 'proj', USFM_PATH);
    let writeCount = 0;
    const origWrite = storage.writeFile.bind(storage);
    storage.writeFile = async (id, path, content) => {
      if (path === CRDT_PATH) writeCount++;
      return origWrite(id, path, content);
    };

    provider.startPersisting(storage, 'proj', USFM_PATH, 0);
    provider.destroy();

    // After destroy, further mutations on the (now-destroyed) doc should not persist.
    await new Promise((r) => setTimeout(r, 20));
    expect(writeCount).toBe(0);
  });
});

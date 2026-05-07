/**
 * useYbinDocProvider integration tests.
 *
 * The hook is thin glue (load → subscribe → persist → destroy).  Since
 * `@testing-library/react` is not in this package we test the equivalent
 * "effect body" logic directly — this is equivalent to what renderHook
 * would exercise and covers the observable side effects.
 */
import { describe, expect, test } from 'bun:test';
import { YbinDocProvider, usfmToYjsBase64, convertUSJDocumentToUSFM } from '@usfm-tools/editor-adapters';
import { crdtPathFromUsfm } from '@usfm-tools/editor-adapters';
import { USFMParser } from '@usfm-tools/parser';
import type { ProjectStorage } from '@usfm-tools/types';

// ---------------------------------------------------------------------------
// Helpers
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

/** Convert USFM → USJ using the real parser (same as convertUSJDocumentToUSFM's twin). */
function usfmToUsj(usfm: string) {
  const p = new USFMParser({ silentConsole: true });
  p.parse(usfm || '\\id XXX\n');
  return p.toJSON();
}

const USFM_A = `\\id JHN\n\\c 1\n\\p\n\\v 1 In the beginning was the Word.\n`;
const USFM_B = `\\id JHN\n\\c 1\n\\p\n\\v 1 In the beginning was the Word.\n\\v 2 He was in the beginning with God.\n`;

const USFM_PATH = 'files/JHN.usfm';
const CRDT_PATH = crdtPathFromUsfm(USFM_PATH);

// ---------------------------------------------------------------------------
// Simulated hook effect body
// (reproduces the logic inside useYbinDocProvider's useEffect)
// ---------------------------------------------------------------------------

type MockSession = {
  onChangeFns: Set<() => void>;
  triggerChange: (usfm: string) => void;
  /** Simulates ctrl.session.onChange */
  onChange: (fn: () => void) => () => void;
  /** Simulates ctrl.session.toUSJWithAlignments */
  toUSJWithAlignments: (usfm: string) => ReturnType<typeof usfmToUsj>;
};

function makeMockSession(): MockSession {
  const onChangeFns = new Set<() => void>();
  let _currentUsfm = '';
  return {
    onChangeFns,
    triggerChange(usfm: string) {
      _currentUsfm = usfm;
      for (const fn of onChangeFns) fn();
    },
    onChange(fn: () => void) {
      onChangeFns.add(fn);
      return () => onChangeFns.delete(fn);
    },
    toUSJWithAlignments(_usfm: string) {
      return usfmToUsj(_currentUsfm || USFM_A);
    },
  };
}

/**
 * Runs the equivalent of useYbinDocProvider's useEffect body.
 * Returns cleanup function, the provider, and a "get current USFM from session" callback.
 */
async function simulateHookEffect(
  storage: ReturnType<typeof makeStorage>,
  session: MockSession,
  usfmPath: string,
  debounceMs = 0,
) {
  const provider = await YbinDocProvider.load(storage, 'proj', usfmPath);
  const stopPersisting = provider.startPersisting(storage, 'proj', usfmPath, debounceMs);

  const offChange = session.onChange(() => {
    try {
      // Same logic as the hook: get USJ from session, convert, apply.
      const usj = session.toUSJWithAlignments('');
      const usfm = convertUSJDocumentToUSFM(usj as Parameters<typeof convertUSJDocumentToUSFM>[0]);
      provider.applyUsfmUpdate(usfm);
    } catch {
      // non-fatal
    }
  });

  const cleanup = () => {
    offChange();
    stopPersisting();
    provider.destroy();
  };

  return { provider, cleanup };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useYbinDocProvider — effect body wiring', () => {
  test('loads Y.Doc from .ybin on mount', async () => {
    const storage = makeStorage();
    storage.files.set(CRDT_PATH, usfmToYjsBase64(USFM_A));
    const session = makeMockSession();

    const { provider, cleanup } = await simulateHookEffect(storage, session, USFM_PATH);
    expect(provider.toUsfm()).toBe(USFM_A);
    cleanup();
  });

  test('falls back to empty doc when neither .ybin nor USFM exists', async () => {
    const storage = makeStorage();
    const session = makeMockSession();

    const { provider, cleanup } = await simulateHookEffect(storage, session, USFM_PATH);
    expect(provider.toUsfm()).toBe('');
    cleanup();
  });

  test('applyUsfmUpdate is called when session onChange fires', async () => {
    const storage = makeStorage();
    storage.files.set(CRDT_PATH, usfmToYjsBase64(USFM_A));
    const session = makeMockSession();

    const { provider, cleanup } = await simulateHookEffect(storage, session, USFM_PATH);

    // Trigger a content change (session now reports USFM_B)
    session.triggerChange(USFM_B);

    const updated = provider.toUsfm();
    // The Y.Doc should now contain the converted USFM_B content (verse 2).
    expect(updated).toContain('\\v 2');
    cleanup();
  });

  test('onChange subscription is removed by cleanup', async () => {
    const storage = makeStorage();
    const session = makeMockSession();
    const { provider, cleanup } = await simulateHookEffect(storage, session, USFM_PATH);

    cleanup();

    // After cleanup, onChangeFns should be empty.
    expect(session.onChangeFns.size).toBe(0);
  });

  test('persistence writes .ybin after onChange (debounce 0)', async () => {
    const storage = makeStorage();
    const session = makeMockSession();

    const { provider, cleanup } = await simulateHookEffect(storage, session, USFM_PATH, 0);

    // Fire a change so the Y.Doc gets content.
    session.triggerChange(USFM_A);

    // Allow debounced setTimeout(0) to fire.
    await new Promise((r) => setTimeout(r, 20));

    expect(storage.files.has(CRDT_PATH)).toBe(true);
    cleanup();
  });

  test('provider.destroy stops persistence after cleanup', async () => {
    const storage = makeStorage();
    const session = makeMockSession();
    let writeCount = 0;
    const origWrite = storage.writeFile.bind(storage);
    storage.writeFile = async (id, path, content) => {
      if (path === CRDT_PATH) writeCount++;
      return origWrite(id, path, content);
    };

    const { cleanup } = await simulateHookEffect(storage, session, USFM_PATH, 0);
    cleanup(); // destroy + stop persisting

    session.triggerChange(USFM_A);
    await new Promise((r) => setTimeout(r, 20));

    expect(writeCount).toBe(0); // no writes after cleanup
  });
});

// ---------------------------------------------------------------------------
// YbinStorageTarget shape
// ---------------------------------------------------------------------------

describe('YbinStorageTarget type contract', () => {
  test('ybinTarget with all three fields accepted by simulateHookEffect', async () => {
    const storage = makeStorage();
    storage.files.set(USFM_PATH, USFM_A);
    const session = makeMockSession();

    const target = { storage, projectId: 'proj', usfmPath: USFM_PATH };
    const { provider, cleanup } = await simulateHookEffect(
      target.storage,
      session,
      target.usfmPath,
    );
    expect(provider.toUsfm()).toBe(USFM_A);
    cleanup();
  });
});

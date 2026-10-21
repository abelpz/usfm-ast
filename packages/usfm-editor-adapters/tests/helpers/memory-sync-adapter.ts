/**
 * In-memory implementation of {@link ProjectSyncAdapter} for unit tests.
 *
 * Multiple `MemoryProjectSyncAdapter` instances may share a single
 * {@link MemoryRemote} to simulate two (or more) users syncing against the
 * same repository without any real HTTP calls.
 *
 * Usage:
 *   const remote = new MemoryRemote(initialFiles);
 *   const adapterA = new MemoryProjectSyncAdapter(remote);
 *   const adapterB = new MemoryProjectSyncAdapter(remote);
 *   // ... use adapterA / adapterB as the `_adapter` option of syncLocalProjectWithDcs
 */

import type {
  ProjectPushOutcome,
  ProjectSyncAdapter,
  PushFilesOptions,
  RemoteFileEntry,
} from '@usfm-tools/types';

// ---------------------------------------------------------------------------
// Shared "server" state
// ---------------------------------------------------------------------------

/**
 * Simulated remote repository.  Tracks commit history so `pullFilesAt` can
 * return files from any prior commit SHA, mirroring what a real git host does.
 */
export class MemoryRemote {
  /** sha → snapshot */
  private readonly snapshots = new Map<string, Map<string, string>>();
  private head: string;

  constructor(initialFiles: Map<string, string> = new Map()) {
    this.head = 'sha-initial';
    this.snapshots.set(this.head, new Map(initialFiles));
  }

  getHead(): string {
    return this.head;
  }

  /** Returns the files at the given ref (commit SHA or branch-like alias). */
  getFilesAt(ref: string): Map<string, string> | undefined {
    return this.snapshots.get(ref);
  }

  getCurrentFiles(): Map<string, string> {
    return this.snapshots.get(this.head)!;
  }

  /**
   * Attempt a push with CAS semantics.
   * Returns the new head SHA on success, or `null` on a stale mismatch.
   */
  push(
    files: Map<string, string>,
    options?: PushFilesOptions,
  ): { ok: true; headSha: string; index: RemoteFileEntry[] } | { ok: false; staleByPath: Record<string, string> } {
    const current = this.getCurrentFiles();

    if (options?.expectedBaseShaByPath) {
      const staleByPath: Record<string, string> = {};
      for (const [path, expectedSha] of Object.entries(options.expectedBaseShaByPath)) {
        const currentContent = current.get(path) ?? '';
        const currentSha = simpleSha(currentContent);
        if (currentContent !== '' && currentSha !== expectedSha) {
          staleByPath[path] = currentSha;
        }
      }
      if (Object.keys(staleByPath).length > 0) {
        return { ok: false, staleByPath };
      }
    }

    const newSha = `sha-${++this._counter}`;
    const newFiles = new Map(files);
    this.snapshots.set(newSha, newFiles);
    this.head = newSha;

    const index: RemoteFileEntry[] = [];
    for (const [path, content] of newFiles) {
      index.push({ path, sha: simpleSha(content), size: content.length });
    }

    return { ok: true, headSha: newSha, index };
  }

  private _counter = 0;
}

// ---------------------------------------------------------------------------
// Per-user adapter
// ---------------------------------------------------------------------------

/**
 * A `ProjectSyncAdapter` that delegates all remote operations to a shared
 * `MemoryRemote`.  Pass one of these as `_adapter` to `syncLocalProjectWithDcs`
 * to run the full sync loop without any HTTP calls.
 */
export class MemoryProjectSyncAdapter implements ProjectSyncAdapter {
  constructor(private readonly remote: MemoryRemote) {}

  async ensureRemoteRepo() {
    return { owner: 'test', repo: 'test', created: false };
  }

  async getRemoteHeadCommit(): Promise<string> {
    return this.remote.getHead();
  }

  async pullFilesAt(ref: string): Promise<Map<string, string>> {
    const files = this.remote.getFilesAt(ref);
    if (!files) throw new Error(`MemoryRemote: unknown ref "${ref}"`);
    return new Map(files);
  }

  async pullFiles(): Promise<Map<string, string>> {
    return new Map(this.remote.getCurrentFiles());
  }

  async getRemoteFileIndex(): Promise<RemoteFileEntry[]> {
    const current = this.remote.getCurrentFiles();
    return [...current.entries()].map(([path, content]) => ({
      path,
      sha: simpleSha(content),
      size: content.length,
    }));
  }

  async pushFiles(
    localFiles: Map<string, string>,
    _message: string,
    options?: PushFilesOptions,
  ): Promise<ProjectPushOutcome> {
    const result = this.remote.push(localFiles, options);
    if (!result.ok) {
      return { kind: 'stale', staleByPath: result.staleByPath };
    }
    return {
      filesCreated: 0,
      filesUpdated: localFiles.size,
      filesDeleted: 0,
      commitSha: result.headSha,
      syncedFiles: result.index,
    };
  }
}

// ---------------------------------------------------------------------------
// Minimal deterministic SHA (not cryptographic — test use only)
// ---------------------------------------------------------------------------

/**
 * Simple deterministic hash used in place of real git blob SHAs.
 * Only needed so CAS comparisons are stable within a test run.
 */
function simpleSha(content: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) {
    h ^= content.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * BrowserGitAdapter — isomorphic-git wrapper for browser (LightningFS / OPFS) and Node/Bun
 * (node:fs for tests).
 *
 * Responsibilities:
 *  - Maintain a shallow local git clone of a DCS project repo per browser storage key.
 *  - Stage + commit project file snapshots into that local clone.
 *  - Fetch updates from DCS (so the 3-way merge base is always accurate).
 *  - Push local commits back to DCS (eventually replaces REST blob-CAS push).
 *  - Expose `readFilesAt(ref)` so `syncLocalProjectWithDcs` can use the true
 *    merge-base tree without REST round-trips.
 *
 * Phase 2 note: push is wired but `DcsRestProjectSync` remains the production push
 * path until Phase 6. Use `fetchOnly: true` in `syncOptions` to skip push.
 */

import git, { type PromiseFsClient } from 'isomorphic-git';
import http from 'isomorphic-git/http/web';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface BrowserGitAuthor {
  name: string;
  email: string;
}

export interface BrowserGitRemoteOptions {
  /** Full clone URL, e.g. `https://git.door43.org/org/en_titus`. */
  url: string;
  /** Gitea personal access token (used as HTTP Basic password). */
  token: string;
  /** Branch / ref to track (default `main`). */
  branch?: string;
}

export interface BrowserGitCloneOptions extends BrowserGitRemoteOptions {
  /**
   * Number of commits to include in the shallow clone (default 10).
   * Increase if merge-base detection needs deeper history.
   */
  depth?: number;
}

/**
 * Project-level local git repo operations.
 *
 * The adapter is injected with an `fs`-compatible object so it works in both
 * the browser (LightningFS over IndexedDB) and in test environments (node:fs).
 */
export interface IBrowserGitAdapter {
  /** Current HEAD commit OID, or `null` when the repo is empty / not yet cloned. */
  headCommit(): Promise<string | null>;

  /**
   * Read all non-.git files tracked at `ref` as a `path → UTF-8 content` map.
   * `ref` may be a commit OID, branch name, or `HEAD`.
   */
  readFilesAt(ref: string): Promise<Map<string, string>>;

  /**
   * Stage the given `files` map (add + remove) and record a git commit.
   * Returns the new commit OID.
   */
  commitAll(
    files: Map<string, string>,
    message: string,
    author: BrowserGitAuthor,
  ): Promise<string>;

  /**
   * Shallow-clone `options.url` into the local repo.
   * If the repo already has commits (previously cloned), this is a no-op —
   * call {@link fetch} instead to pull new work.
   */
  clone(options: BrowserGitCloneOptions): Promise<void>;

  /**
   * Fetch the latest commits for `options.branch` from the remote.
   * After a successful fetch the remote-tracking ref `origin/<branch>` is updated.
   */
  fetch(options: BrowserGitRemoteOptions): Promise<void>;

  /**
   * Push local HEAD to the remote branch.
   * Uses HTTP Basic auth (username `'x-token'`, password = token).
   */
  push(options: BrowserGitRemoteOptions): Promise<void>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * @param fs   isomorphic-git–compatible `PromiseFsClient` (LightningFS or node:fs)
 * @param dir  Virtual root directory inside the FS (e.g. `'/'` or `'/repo'`)
 */
export class BrowserGitAdapter implements IBrowserGitAdapter {
  private ready: Promise<void> | null = null;

  constructor(
    private readonly fs: PromiseFsClient,
    private readonly dir: string,
    /** Git author used when no author is passed explicitly to commit operations. */
    private readonly defaultAuthor: BrowserGitAuthor = {
      name: 'usfm-ast',
      email: 'usfm-ast@local',
    },
  ) {}

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  /**
   * Ensure the repo directory exists and is a git repo.
   * Idempotent — safe to call multiple times.
   */
  async init(): Promise<void> {
    if (!this.ready) {
      this.ready = this._init();
    }
    return this.ready;
  }

  private async _init(): Promise<void> {
    try {
      await this.fs.promises.mkdir(this.dir, { recursive: true } as unknown);
    } catch {
      // Directory may already exist — that is fine.
    }
    try {
      await git.log({ fs: this.fs, dir: this.dir, depth: 1 });
    } catch {
      // Not a git repo yet — initialize one.
      await git.init({ fs: this.fs, dir: this.dir, defaultBranch: 'main' });
    }
  }

  // -------------------------------------------------------------------------
  // Head / read
  // -------------------------------------------------------------------------

  async headCommit(): Promise<string | null> {
    await this.init();
    try {
      const log = await git.log({ fs: this.fs, dir: this.dir, depth: 1 });
      return log[0]?.oid ?? null;
    } catch {
      return null;
    }
  }

  async readFilesAt(ref: string): Promise<Map<string, string>> {
    await this.init();
    const result = new Map<string, string>();
    try {
      await git.walk({
        fs: this.fs,
        dir: this.dir,
        trees: [git.TREE({ ref })],
        map: async (filepath, [entry]) => {
          if (filepath === '.') return undefined; // skip root entry
          if (!entry) return undefined;
          const type = await entry.type();
          if (type === 'blob') {
            const buf = await entry.content();
            if (buf) {
              result.set(filepath, new TextDecoder().decode(buf));
            }
          }
          // Return undefined for trees so walk recurses into them.
          return undefined;
        },
      });
    } catch {
      // Ref may not exist (e.g. empty repo) — return empty map.
    }
    return result;
  }

  // -------------------------------------------------------------------------
  // Commit
  // -------------------------------------------------------------------------

  async commitAll(
    files: Map<string, string>,
    message: string,
    author: BrowserGitAuthor = this.defaultAuthor,
  ): Promise<string> {
    await this.init();

    // Write / update files.
    for (const [filePath, content] of files) {
      const fullPath = `${this.dir}/${filePath}`.replace(/\/+/g, '/');
      const dirPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
      if (dirPath && dirPath !== this.dir) {
        try {
          await this.fs.promises.mkdir(dirPath, { recursive: true } as unknown);
        } catch {
          /* already exists */
        }
      }
      await this.fs.promises.writeFile(fullPath, content);
      await git.add({ fs: this.fs, dir: this.dir, filepath: filePath });
    }

    // Remove files that are no longer present in the map (compare to HEAD tree).
    const headOid = await this.headCommit();
    if (headOid) {
      const existing = await this.readFilesAt(headOid);
      for (const existingPath of existing.keys()) {
        if (!files.has(existingPath)) {
          try {
            await this.fs.promises.unlink(`${this.dir}/${existingPath}`.replace(/\/+/g, '/'));
          } catch {
            /* already gone */
          }
          await git.remove({ fs: this.fs, dir: this.dir, filepath: existingPath });
        }
      }
    }

    const oid = await git.commit({
      fs: this.fs,
      dir: this.dir,
      message,
      author: {
        name: author.name,
        email: author.email,
        timestamp: Math.floor(Date.now() / 1000),
        timezoneOffset: new Date().getTimezoneOffset(),
      },
    });
    return oid;
  }

  // -------------------------------------------------------------------------
  // Remote operations
  // -------------------------------------------------------------------------

  async clone(options: BrowserGitCloneOptions): Promise<void> {
    await this.init();
    // Skip if we already have commits (idempotent).
    const existing = await this.headCommit();
    if (existing) return;

    const branch = options.branch ?? 'main';
    await git.clone({
      fs: this.fs,
      http,
      dir: this.dir,
      url: options.url,
      ref: branch,
      singleBranch: true,
      depth: options.depth ?? 10,
      onAuth: () => ({ username: 'x-token', password: options.token }),
    });
  }

  async fetch(options: BrowserGitRemoteOptions): Promise<void> {
    await this.init();
    const branch = options.branch ?? 'main';
    await git.fetch({
      fs: this.fs,
      http,
      dir: this.dir,
      remote: 'origin',
      remoteRef: branch,
      depth: 10,
      onAuth: () => ({ username: 'x-token', password: options.token }),
    });
  }

  async push(options: BrowserGitRemoteOptions): Promise<void> {
    await this.init();
    const branch = options.branch ?? 'main';
    await git.push({
      fs: this.fs,
      http,
      dir: this.dir,
      remote: 'origin',
      remoteRef: branch,
      onAuth: () => ({ username: 'x-token', password: options.token }),
    });
  }
}

// ---------------------------------------------------------------------------
// Production factory (browser — LightningFS)
// ---------------------------------------------------------------------------

/**
 * Create a `BrowserGitAdapter` backed by LightningFS (IndexedDB) for the given project.
 *
 * Each project gets its own IndexedDB database (keyed by `projectId`) so repos
 * don't share storage.  The working tree is always mounted at `'/'`.
 *
 * **Call this only in browser contexts.** In Node/Bun/tests use
 * {@link createNodeGitAdapter} instead.
 */
export function createBrowserGitAdapter(
  projectId: string,
  defaultAuthor?: BrowserGitAuthor,
): BrowserGitAdapter {
  // Dynamic import avoids bundling LightningFS in SSR / Node builds.
  // We use a synchronous constructor here because LightningFS is available
  // synchronously once the module is imported.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const LightningFS = require('@isomorphic-git/lightning-fs') as {
    new(name: string, opts?: { wipe?: boolean }): PromiseFsClient;
  };
  const fs = new LightningFS(`usfm-git-${projectId}`);
  return new BrowserGitAdapter(fs, '/', defaultAuthor);
}

// ---------------------------------------------------------------------------
// Test / Node factory
// ---------------------------------------------------------------------------

/**
 * Create a `BrowserGitAdapter` backed by `node:fs` (for Bun/Node tests).
 * The `dir` must be an absolute path to an existing (or creatable) directory.
 */
export function createNodeGitAdapter(
  dir: string,
  defaultAuthor?: BrowserGitAuthor,
): BrowserGitAdapter {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeFs = require('fs') as { promises: PromiseFsClient['promises'] };
  return new BrowserGitAdapter({ promises: nodeFs.promises }, dir, defaultAuthor);
}

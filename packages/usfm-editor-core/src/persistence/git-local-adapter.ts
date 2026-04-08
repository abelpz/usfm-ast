import fs from 'fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'fs/promises';
import type { Dirent } from 'fs';
import git from 'isomorphic-git';
import { dirname, join } from 'path';

import type { PersistenceAdapter } from './persistence-adapter';

function isNode(): boolean {
  return typeof process !== 'undefined' && process.versions?.node !== undefined;
}

export interface GitLocalPersistenceOptions {
  /** Commit after each save (default true). */
  commitOnSave?: boolean;
  /** Branch name for commits (default `main`). */
  branch?: string;
}

/**
 * Local Git working tree persistence: each {@link save} writes a file and optionally records a
 * Git commit (isomorphic-git), enabling push/pull to DCS later.
 */
export class GitLocalPersistenceAdapter implements PersistenceAdapter {
  readonly ready: boolean;
  private repoReady = false;
  private readonly commitOnSave: boolean;
  private readonly branch: string;

  constructor(
    private readonly repoDir: string,
    options?: GitLocalPersistenceOptions
  ) {
    this.ready = isNode();
    this.commitOnSave = options?.commitOnSave ?? true;
    this.branch = options?.branch ?? 'main';
  }

  private async ensureRepo(): Promise<void> {
    if (this.repoReady || !this.ready) return;
    await mkdir(this.repoDir, { recursive: true });
    try {
      await git.log({ fs, dir: this.repoDir, depth: 1 });
    } catch {
      await git.init({ fs, dir: this.repoDir, defaultBranch: this.branch });
    }
    this.repoReady = true;
  }

  private filePath(key: string): string {
    return join(this.repoDir, key.replace(/\\/g, '/').replace(/^\/+/, ''));
  }

  async save(key: string, data: Uint8Array | string): Promise<void> {
    if (!this.ready) return;
    await this.ensureRepo();
    const p = this.filePath(key);
    await mkdir(dirname(p), { recursive: true });
    if (typeof data === 'string') {
      await writeFile(p, data, 'utf8');
    } else {
      await writeFile(p, Buffer.from(data));
    }
    if (!this.commitOnSave) return;
    try {
      await git.add({ fs, dir: this.repoDir, filepath: key.replace(/\\/g, '/') });
      const oid = await git.commit({
        fs,
        dir: this.repoDir,
        message: `persist ${key}`,
        author: {
          name: 'usfm-ast',
          email: 'usfm-ast@local',
          timestamp: Math.floor(Date.now() / 1000),
          timezoneOffset: new Date().getTimezoneOffset(),
        },
      });
      void oid;
    } catch {
      /* first commit on empty repo can fail until ref exists — ignore */
    }
  }

  async load(key: string): Promise<Uint8Array | string | null> {
    if (!this.ready) return null;
    try {
      const p = this.filePath(key);
      return await readFile(p);
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.ready) return;
    try {
      await rm(this.filePath(key), { force: true });
      await this.ensureRepo();
      if (this.commitOnSave) {
        await git.remove({ fs, dir: this.repoDir, filepath: key.replace(/\\/g, '/') });
        await git.commit({
          fs,
          dir: this.repoDir,
          message: `delete ${key}`,
          author: {
            name: 'usfm-ast',
            email: 'usfm-ast@local',
            timestamp: Math.floor(Date.now() / 1000),
            timezoneOffset: new Date().getTimezoneOffset(),
          },
        });
      }
    } catch {
      /* ignore */
    }
  }

  async list(prefix: string): Promise<string[]> {
    if (!this.ready) return [];
    const out: string[] = [];
    const walk = async (dir: string, rel: string): Promise<void> => {
      let entries: Dirent[];
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (e.name === '.git') continue;
        const p = join(dir, e.name);
        const r = rel ? `${rel}/${e.name}` : e.name;
        const rk = r.replace(/\\/g, '/');
        if (e.isDirectory()) {
          await walk(p, rk);
        } else if (rk.startsWith(prefix)) {
          out.push(rk);
        }
      }
    };
    try {
      await walk(this.repoDir, '');
    } catch {
      return [];
    }
    return out.sort();
  }
}

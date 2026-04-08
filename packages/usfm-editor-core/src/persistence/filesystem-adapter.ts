import { mkdir, readdir, readFile, rm, writeFile } from 'fs/promises';
import type { Dirent } from 'fs';
import { dirname, join } from 'path';

import type { PersistenceAdapter } from './persistence-adapter';

function isNodeFs(): boolean {
  return typeof process !== 'undefined' && process.versions?.node !== undefined;
}

/**
 * Node.js / Electron / Tauri filesystem persistence under a root directory.
 * No-ops with `ready: false` when not running on Node.
 */
export class FileSystemPersistenceAdapter implements PersistenceAdapter {
  readonly ready: boolean;

  constructor(private readonly rootDir: string) {
    this.ready = isNodeFs() && typeof rootDir === 'string' && rootDir.length > 0;
  }

  private path(key: string): string {
    const safe = key.replace(/\\/g, '/').replace(/^\/+/, '');
    return join(this.rootDir, safe);
  }

  async save(key: string, data: Uint8Array | string): Promise<void> {
    if (!this.ready) return;
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    if (typeof data === 'string') {
      await writeFile(p, data, 'utf8');
    } else {
      await writeFile(p, data);
    }
  }

  async load(key: string): Promise<Uint8Array | string | null> {
    if (!this.ready) return null;
    try {
      const p = this.path(key);
      return await readFile(p);
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.ready) return;
    try {
      await rm(this.path(key), { force: true });
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
      await mkdir(this.rootDir, { recursive: true });
      await walk(this.rootDir, '');
    } catch {
      return [];
    }
    return out.sort();
  }
}

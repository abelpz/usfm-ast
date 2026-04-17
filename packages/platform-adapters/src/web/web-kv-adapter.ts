import type { KeyValueAdapter } from '../interfaces/kv-adapter';

/**
 * `localStorage`-backed key-value adapter for the web shell.
 *
 * `localStorage` is synchronous under the hood; we wrap in Promise so callers
 * can be written against the async `KeyValueAdapter` interface and work
 * unchanged on Tauri / Capacitor where storage truly is async.
 *
 * Pass an optional `prefix` to namespace keys and avoid collisions.
 */
export class WebKeyValueAdapter implements KeyValueAdapter {
  private readonly prefix: string;

  constructor(prefix = '') {
    this.prefix = prefix;
  }

  private key(k: string): string {
    return this.prefix ? `${this.prefix}.${k}` : k;
  }

  async get(key: string): Promise<string | null> {
    try {
      return localStorage.getItem(this.key(key));
    } catch {
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    try {
      localStorage.setItem(this.key(key), value);
    } catch {
      /* storage full or unavailable — fail silently */
    }
  }

  async remove(key: string): Promise<void> {
    try {
      localStorage.removeItem(this.key(key));
    } catch {
      /* ignore */
    }
  }

  async clear(): Promise<void> {
    try {
      if (this.prefix) {
        const toRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(this.prefix + '.')) toRemove.push(k);
        }
        toRemove.forEach((k) => localStorage.removeItem(k));
      } else {
        localStorage.clear();
      }
    } catch {
      /* ignore */
    }
  }

  /**
   * Synchronous read — for code paths that cannot be async (e.g. ProseMirror
   * plugin init). Prefer `get()` everywhere else.
   */
  getSync(key: string): string | null {
    try {
      return localStorage.getItem(this.key(key));
    } catch {
      return null;
    }
  }
}

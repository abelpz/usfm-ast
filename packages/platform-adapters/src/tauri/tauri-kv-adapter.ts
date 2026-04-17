/**
 * Tauri key-value adapter backed by `@tauri-apps/plugin-store`.
 *
 * The Store plugin persists data in a JSON file in the app data directory
 * (platform-appropriate: `%APPDATA%` on Windows, `~/Library/Application Support`
 * on macOS, `~/.local/share` on Linux).
 *
 * NOTE: This file imports from `@tauri-apps/plugin-store` which is only
 * available inside a Tauri runtime. Do not import this in non-Tauri builds.
 */
import type { KeyValueAdapter } from '../interfaces/kv-adapter';

/** Lazy-loaded Tauri Store instance. Import is deferred so web builds never touch it. */
let storePromise: Promise<import('@tauri-apps/plugin-store').Store> | null = null;

async function getStore(storeName: string): Promise<import('@tauri-apps/plugin-store').Store> {
  if (!storePromise) {
    const { load } = await import('@tauri-apps/plugin-store');
    storePromise = load(storeName, { autoSave: 500 });
  }
  return storePromise;
}

export class TauriKeyValueAdapter implements KeyValueAdapter {
  private readonly storeName: string;

  /**
   * @param storeName File name for the store (e.g. `"settings.json"`).
   *   The file is created in the Tauri app data directory.
   */
  constructor(storeName = 'settings.json') {
    this.storeName = storeName;
  }

  async get(key: string): Promise<string | null> {
    const store = await getStore(this.storeName);
    const value = await store.get<string>(key);
    return value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    const store = await getStore(this.storeName);
    await store.set(key, value);
    await store.save();
  }

  async remove(key: string): Promise<void> {
    const store = await getStore(this.storeName);
    await store.delete(key);
    await store.save();
  }

  async clear(): Promise<void> {
    const store = await getStore(this.storeName);
    await store.clear();
    await store.save();
  }

  /** Tauri store is async-only — always returns null. Use `get()` for reliable reads. */
  getSync(_key: string): string | null {
    return null;
  }
}

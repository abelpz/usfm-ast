import type { PersistenceAdapter } from './persistence-adapter';

/** In-memory adapter for tests and ephemeral sessions. */
export class MemoryPersistenceAdapter implements PersistenceAdapter {
  readonly ready = true;
  private readonly store = new Map<string, Uint8Array | string>();

  async save(key: string, data: Uint8Array | string): Promise<void> {
    this.store.set(key, data);
  }

  async load(key: string): Promise<Uint8Array | string | null> {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(prefix: string): Promise<string[]> {
    return [...this.store.keys()].filter((k) => k.startsWith(prefix));
  }
}

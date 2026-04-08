/**
 * Pluggable persistence for offline-first editing (IndexedDB, filesystem, local Git, …).
 */

export interface PersistenceAdapter {
  /** Persist binary or string payload under a key. */
  save(key: string, data: Uint8Array | string): Promise<void>;
  load(key: string): Promise<Uint8Array | string | null>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
  readonly ready: boolean;
}

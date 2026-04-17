import { IndexedDbProjectStorage } from '@usfm-tools/editor-adapters';
import type { PlatformAdapter } from '@usfm-tools/platform-adapters';
import type { ProjectStorage } from '@usfm-tools/types';

let _instance: ProjectStorage | null = null;

/**
 * App-level singleton for project storage.
 *
 * When a `PlatformAdapter` is provided (e.g. the Tauri FS-backed adapter),
 * its `storage` field is used directly. Otherwise falls back to
 * `IndexedDbProjectStorage` for web/PWA environments.
 *
 * Call `initProjectStorage(adapter)` once at app boot before any reads/writes.
 */
export function initProjectStorage(adapter: PlatformAdapter): void {
  _instance = adapter.storage;
}

export function getProjectStorage(): ProjectStorage {
  if (!_instance) _instance = new IndexedDbProjectStorage();
  return _instance;
}

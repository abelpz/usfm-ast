/**
 * Singleton accessor for the app-wide offline sync queue.
 *
 * When a `PlatformAdapter` is provided (e.g. Tauri FS-backed), its `syncQueue`
 * field is preferred. Otherwise falls back to `IndexedDbSyncQueue`.
 *
 * Call `initOfflineSyncQueue(adapter)` once at app boot before use.
 */
import { IndexedDbSyncQueue } from '@usfm-tools/editor-adapters';
import type { PlatformAdapter } from '@usfm-tools/platform-adapters';
import type { SyncQueue } from '@usfm-tools/types';

let _queue: SyncQueue | null = null;

export function initOfflineSyncQueue(adapter: PlatformAdapter): void {
  _queue = adapter.syncQueue ?? new IndexedDbSyncQueue();
}

export function getOfflineSyncQueue(): SyncQueue {
  if (!_queue) _queue = new IndexedDbSyncQueue();
  return _queue;
}

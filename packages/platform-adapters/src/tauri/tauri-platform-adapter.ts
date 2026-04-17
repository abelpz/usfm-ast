import type { ProjectStorage } from '@usfm-tools/types';
import type { PlatformAdapter } from '../interfaces/platform-adapter';
import { TauriFontAdapter } from './tauri-font-adapter';
import { TauriFileSystemAdapter } from './tauri-fs-adapter';
import { TauriKeyValueAdapter } from './tauri-kv-adapter';
import { TauriNetworkAdapter } from './tauri-network-adapter';
import { FsProjectStorage } from './fs-project-storage';
import { FsSourceCacheStorage } from './fs-source-cache-storage';
import { FsProcessedCacheStorage } from './fs-processed-cache';
import { FsSyncQueue } from './fs-sync-queue';

export interface TauriPlatformAdapterOptions {
  /**
   * Override the `ProjectStorage` implementation. Defaults to `FsProjectStorage`
   * backed by the native filesystem. Pass a stub in tests to avoid native FS calls.
   */
  storage?: ProjectStorage;
  /**
   * Store file name for the KV adapter (default: `"settings.json"`).
   * Created in the Tauri app data directory.
   */
  settingsStoreName?: string;
  /** Optional custom fetch (e.g. wrapped with rate limiting). */
  httpFetch?: typeof fetch;
  /**
   * Override the base path for project storage (default `"usfm-editor/projects"`).
   * Relative to AppData. Ignored when `storage` is provided directly.
   */
  projectsBasePath?: string;
  /**
   * Override the base path for source cache (default `"usfm-editor/source-cache"`).
   * Relative to AppData.
   */
  sourceCacheBasePath?: string;
  /**
   * Override the base path for the processed cache (default `"usfm-editor/processed-cache"`).
   * Relative to AppData.
   */
  processedCacheBasePath?: string;
  /**
   * Override the base path for the sync queue (default `"usfm-editor/sync-queue"`).
   * Relative to AppData.
   */
  syncQueueBasePath?: string;
}

/**
 * Composes Tauri-specific adapter implementations into a single
 * `PlatformAdapter` for use via `PlatformContext`.
 *
 * All storage is backed by the native filesystem under `BaseDirectory.AppData`:
 *
 *   - Projects  → `usfm-editor/projects/`
 *   - Sources   → `usfm-editor/source-cache/`
 *   - Sync queue → `usfm-editor/sync-queue/`
 *   - Settings  → `settings.json` (Tauri Store plugin)
 *
 * The Tauri desktop entry point calls this and passes the result to
 * `<PlatformProvider adapter={...}>`.
 *
 * @example
 * ```ts
 * // In packages/usfm-editor-app/src/main.tsx
 * import { createTauriPlatformAdapter } from '@usfm-tools/platform-adapters/tauri';
 *
 * const adapter = createTauriPlatformAdapter({});
 * ```
 */
export function createTauriPlatformAdapter(opts: TauriPlatformAdapterOptions = {}): PlatformAdapter {
  const fs = new TauriFileSystemAdapter();
  const storage: ProjectStorage = opts.storage ?? new FsProjectStorage(fs, opts.projectsBasePath);
  const sourceCache = new FsSourceCacheStorage(fs, opts.sourceCacheBasePath);
  const processedCache = new FsProcessedCacheStorage(fs, opts.processedCacheBasePath);
  const syncQueue = new FsSyncQueue(fs, opts.syncQueueBasePath);

  return {
    platform: 'tauri',
    storage,
    sourceCache,
    processedCache,
    syncQueue,
    kv: new TauriKeyValueAdapter(opts.settingsStoreName ?? 'settings.json'),
    network: new TauriNetworkAdapter(),
    fs,
    font: new TauriFontAdapter(),
    httpFetch: opts.httpFetch ?? globalThis.fetch.bind(globalThis),
  };
}

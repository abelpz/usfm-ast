import type { DownloadQueue, ProcessedCacheStorage, ProjectStorage, SourceCacheStorage, SyncQueue } from '@usfm-tools/types';
import type { FileSystemAdapter } from './fs-adapter';
import type { FontAdapter } from './font-adapter';
import type { KeyValueAdapter } from './kv-adapter';
import type { NetworkAdapter } from './network-adapter';

/**
 * Platform identifier string. Each shell provides one of these so the app
 * can make platform-aware decisions at runtime (e.g. show "Save to disk"
 * only on desktop).
 */
export type PlatformId = 'web' | 'tauri' | 'capacitor';

/**
 * Aggregate platform context — the single object injected via
 * `PlatformContext` into the React tree. Every platform-specific capability
 * is accessed through this interface so the app never calls browser / native
 * APIs directly.
 *
 * `fs` and `font` are optional because they are not available on all
 * platforms (e.g. the web shell has no native filesystem access).
 */
export interface PlatformAdapter {
  /** Runtime platform identifier. */
  readonly platform: PlatformId;

  /** Translation project storage (IndexedDB on web, SQLite on native). */
  readonly storage: ProjectStorage;

  /** Key-value settings store. */
  readonly kv: KeyValueAdapter;

  /** Network connectivity awareness. */
  readonly network: NetworkAdapter;

  /**
   * Native filesystem access (Tauri / Capacitor).
   * `undefined` on web — guard with `platform.fs?.readFile(...)`.
   */
  readonly fs?: FileSystemAdapter;

  /**
   * Font registration and optional Graphite shaping.
   * `undefined` on platforms where it is not needed.
   */
  readonly font?: FontAdapter;

  /**
   * Offline source cache storage (downloaded DCS catalog snapshots).
   * When provided by the platform adapter, the app prefers it over the
   * default `IndexedDbSourceCacheStorage` singleton.
   */
  readonly sourceCache?: SourceCacheStorage;

  /**
   * Processed cache storage (pre-parsed USJ, indexed helps data).
   * Layer 2 of the offline caching system — derived from `sourceCache` and
   * safely evictable. Falls back to `IndexedDbProcessedCacheStorage` when
   * not provided by the platform adapter.
   */
  readonly processedCache?: ProcessedCacheStorage;

  /**
   * Background download queue for source resources and project archives.
   * Falls back to `IndexedDbDownloadQueue` when not provided by the platform adapter.
   */
  readonly downloadQueue?: DownloadQueue;

  /**
   * Offline sync queue (file-change operations pending delivery to DCS).
   * When provided by the platform adapter, the app prefers it over the
   * default `IndexedDbSyncQueue` singleton.
   */
  readonly syncQueue?: SyncQueue;

  /**
   * Injectable `fetch` function. Use this instead of the global `fetch`
   * so implementations can wrap it with an offline queue, cache, or
   * background-sync strategy.
   */
  readonly httpFetch: typeof fetch;
}

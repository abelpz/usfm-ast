/**
 * React hook for managing the offline source cache.
 * Wraps `SourceCacheStorage` and `CatalogSyncEngine` with
 * observable state suitable for the cache management UI.
 *
 * The storage backend is resolved from the `PlatformAdapter` (Tauri FS-backed
 * or Capacitor) when available, falling back to `IndexedDbSourceCacheStorage`
 * for web/PWA environments.
 */
import {
  CatalogSyncEngine,
  IndexedDbSourceCacheStorage,
  IndexedDbProcessedCacheStorage,
  type CatalogSyncEngineOptions,
  type DownloadProgress,
} from '@usfm-tools/editor-adapters';
import type { CachedSourceRepo, ProcessedCacheStorage, SourceCacheStorage } from '@usfm-tools/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePlatform } from '@/platform/PlatformContext';

let _cacheStorage: SourceCacheStorage | null = null;
let _processedCacheStorage: ProcessedCacheStorage | null = null;

/** Initialize the raw-storage singleton from the platform adapter (call once at boot). */
export function initSourceCacheStorage(storage: SourceCacheStorage): void {
  _cacheStorage = storage;
}

/** Initialize the processed-cache singleton from the platform adapter (call once at boot). */
export function initProcessedCacheStorage(storage: ProcessedCacheStorage): void {
  _processedCacheStorage = storage;
}

export function getSourceCacheStorage(): SourceCacheStorage {
  if (!_cacheStorage) _cacheStorage = new IndexedDbSourceCacheStorage();
  return _cacheStorage;
}

export function getProcessedCacheStorage(): ProcessedCacheStorage {
  if (!_processedCacheStorage) _processedCacheStorage = new IndexedDbProcessedCacheStorage();
  return _processedCacheStorage;
}

export type DownloadStatus = 'idle' | 'checking' | 'downloading' | 'error';

export interface SourceCacheState {
  /** All downloaded repo snapshots. */
  repos: CachedSourceRepo[];
  /** Whether the repo list is loading. */
  loading: boolean;
  /** Current download status. */
  downloadStatus: DownloadStatus;
  /** Latest progress event. */
  progress: DownloadProgress | null;
  /** Error message from last operation, if any. */
  error: string | null;
  /**
   * Download all resources for a language.
   * @param langCode BCP 47 language code, e.g. `"en"`.
   * @param host DCS host (default: `"git.door43.org"`).
   * @param token Optional auth token.
   */
  downloadLanguage(langCode: string, host?: string, token?: string): Promise<void>;
  /**
   * Cancel a running download.
   */
  cancelDownload(): void;
  /**
   * Delete a specific repo snapshot from the cache.
   */
  deleteRepo(repoId: string, releaseTag: string): Promise<void>;
  /**
   * Run garbage collection (removes all unreferenced snapshots).
   * Returns the number of snapshots removed.
   */
  garbageCollect(): Promise<number>;
  /**
   * Refresh the repo list from storage.
   */
  refresh(): void;
}

export function useSourceCache(): SourceCacheState {
  const platform = usePlatform();
  const cacheStorage = useMemo(
    () => platform.sourceCache ?? getSourceCacheStorage(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [repos, setRepos] = useState<CachedSourceRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>('idle');
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const loadRepos = useCallback(async () => {
    setLoading(true);
    try {
      const list = await cacheStorage.listCachedRepos();
      setRepos(list);
    } finally {
      setLoading(false);
    }
  }, [cacheStorage]);

  useEffect(() => {
    void loadRepos();
  }, [loadRepos]);

  const downloadLanguage = useCallback(
    async (langCode: string, host?: string, token?: string) => {
      if (downloadStatus === 'downloading') return;
      setError(null);
      setDownloadStatus('downloading');
      setProgress(null);

      const abort = new AbortController();
      abortRef.current = abort;

      const opts: CatalogSyncEngineOptions = {
        host: host ?? 'git.door43.org',
        token,
        httpFetch: platform.httpFetch,
        onProgress: (p) => setProgress(p),
      };

      const engine = new CatalogSyncEngine(cacheStorage, opts);

      try {
        await engine.downloadLanguage(langCode, { signal: abort.signal });
        await loadRepos();
        setDownloadStatus('idle');
        setProgress(null);
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') {
          setDownloadStatus('idle');
        } else {
          setDownloadStatus('error');
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        abortRef.current = null;
      }
    },
    [cacheStorage, downloadStatus, loadRepos, platform],
  );

  const cancelDownload = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const deleteRepo = useCallback(
    async (repoId: string, releaseTag: string) => {
      await cacheStorage.deleteCachedRepo(repoId, releaseTag);
      await loadRepos();
    },
    [cacheStorage, loadRepos],
  );

  const garbageCollect = useCallback(async () => {
    const removed = await cacheStorage.garbageCollect();
    await loadRepos();
    return removed;
  }, [cacheStorage, loadRepos]);

  const refresh = useCallback(() => {
    void loadRepos();
  }, [loadRepos]);

  return {
    repos,
    loading,
    downloadStatus,
    progress,
    error,
    downloadLanguage,
    cancelDownload,
    deleteRepo,
    garbageCollect,
    refresh,
  };
}

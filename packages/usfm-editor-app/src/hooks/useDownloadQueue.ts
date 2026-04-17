/**
 * React hook for the background source download queue.
 *
 * Provides:
 *  - `activeJobs`     — all non-done jobs (live-updated)
 *  - `isDownloading`  — true while any job is in progress
 *  - `totalProgress`  — repos completed / total
 *  - `requestLanguage(langCode)` — enqueue a full language bundle
 *  - `cancelLanguage(langCode)`  — remove queued jobs for a language
 *
 * The `DownloadScheduler` singleton is started once and remains running until
 * the page unloads. It drains the queue automatically when the device is online.
 */
import {
  CatalogSyncEngine,
  DownloadScheduler,
  PROCESSED_CACHE_VERSION,
  UpdateChecker,
  scheduleCacheSweep,
  IndexedDbDownloadQueue,
  type DownloadProgressEvent,
} from '@usfm-tools/editor-adapters';
import type { DownloadJob, DownloadQueue } from '@usfm-tools/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlatform } from '@/platform/PlatformContext';
import { getProcessedCacheStorage, getSourceCacheStorage } from './useSourceCache';

let _downloadQueue: DownloadQueue | null = null;
let _schedulerStarted = false;
let _scheduler: DownloadScheduler | null = null;

// Promise that resolves once the catalog-aware queue is ready (after the
// scheduler useEffect runs). Callers that need per-repo zipball URLs must
// await this before calling enqueueSource so they don't get a placeholder job.
let _queueReadyResolve: ((q: DownloadQueue) => void) | null = null;
const _queueReady = new Promise<DownloadQueue>((resolve) => {
  _queueReadyResolve = resolve;
});

/** Initialize the download-queue singleton from the platform adapter (call once at boot). */
export function initDownloadQueue(queue: DownloadQueue): void {
  _downloadQueue = queue;
  // If this was called with a platform-provided queue (not the configured one),
  // don't resolve _queueReady yet -- the scheduler useEffect will do that when
  // it replaces this with a catalogFetch-aware instance.
}

export function getDownloadQueue(): DownloadQueue {
  if (!_downloadQueue) _downloadQueue = new IndexedDbDownloadQueue();
  return _downloadQueue;
}

/**
 * Returns a promise that resolves to the catalog-aware DownloadQueue.
 * Use this instead of `getDownloadQueue()` when enqueueing source languages
 * to guarantee jobs are created with real per-repo zipball URLs.
 */
export function getConfiguredDownloadQueue(): Promise<DownloadQueue> {
  return _queueReady;
}

/**
 * Immediately start draining the download queue.
 * Call this after enqueueing new jobs so downloads begin within milliseconds
 * rather than waiting for the next 10-second poll cycle.
 */
export function triggerSchedulerDrain(): void {
  _scheduler?.triggerDrain();
}

export interface DownloadQueueState {
  /** All pending/active download jobs. */
  activeJobs: DownloadJob[];
  /** True while at least one job is in a non-queued active state. */
  isDownloading: boolean;
  totalProgress: { reposCompleted: number; reposTotal: number };
  /** Latest progress event from the scheduler. */
  latestProgress: DownloadProgressEvent | null;
  /**
   * Enqueue background download of all source repos for a language.
   * No-op if jobs already exist for the language.
   */
  requestLanguage(langCode: string, options?: { host?: string; token?: string }): void;
  /** Remove all queued (not yet started) jobs for a language. */
  cancelLanguage(langCode: string): void;
  /** Refresh the job list from storage. */
  refresh(): void;
}

export function useDownloadQueue(): DownloadQueueState {
  const platform = usePlatform();

  const [activeJobs, setActiveJobs] = useState<DownloadJob[]>([]);
  const [latestProgress, setLatestProgress] = useState<DownloadProgressEvent | null>(null);

  // Always read through the singleton so we always use the latest (catalog-aware) queue.
  const loadJobs = useCallback(async () => {
    const pending = await getDownloadQueue().listPending();
    setActiveJobs(pending);
  }, []);

  // Start the DownloadScheduler once globally.
  useEffect(() => {
    if (_schedulerStarted) return;
    _schedulerStarted = true;

    const rawStorage = getSourceCacheStorage();
    const processedCache = getProcessedCacheStorage();
    const catalogEngine = new CatalogSyncEngine(rawStorage, {
      httpFetch: platform.httpFetch,
    });

    /**
     * Fetch real per-repo catalog entries for a language, including zipball URLs.
     * This is passed to IndexedDbDownloadQueue so that `enqueueSource()` creates
     * concrete jobs with real zipball URLs immediately — instead of a single
     * placeholder job that the scheduler has to resolve later via a fallback path.
     */
    const catalogFetch = async (
      langCode: string,
      opts: { host?: string; token?: string },
    ): Promise<Array<{ repoId: string; releaseTag: string; zipballUrl: string | null; subject: string; langCode: string }>> => {
      const engine = new CatalogSyncEngine(rawStorage, {
        host: opts.host,
        token: opts.token,
        httpFetch: platform.httpFetch,
      });
      const entries = await engine.listCatalogEntries(langCode);
      const host = opts.host ?? 'git.door43.org';
      const baseUrl = `https://${host.replace(/^https?:\/\//, '')}`;
      return entries.map((e) => ({
        repoId: e.repoId,
        releaseTag: e.releaseTag,
        langCode: e.langCode,
        subject: e.subject,
        // Construct the DCS archive URL from known parts (deterministic pattern).
        zipballUrl: `${baseUrl}/api/v1/repos/${encodeURIComponent(e.owner)}/${encodeURIComponent(e.repoName)}/archive/${encodeURIComponent(e.releaseTag)}.zip`,
      }));
    };

    // Create a catalog-aware queue and promote it as the module singleton so
    // all callers (e.g. ReferenceColumn) get the same configured instance.
    // Resolve _queueReady so getConfiguredDownloadQueue() callers unblock.
    const configuredQueue = new IndexedDbDownloadQueue(catalogFetch);
    initDownloadQueue(configuredQueue);
    _queueReadyResolve?.(configuredQueue);

    const scheduler = new DownloadScheduler({
      queue: configuredQueue,
      network: platform.network,
      rawStorage,
      processedCache,
      catalogEngine,
      httpFetch: platform.httpFetch,
      onProgress: (event) => {
        setLatestProgress(event);
        void loadJobs();
      },
      onJobDone: () => { void loadJobs(); },
      onJobFailed: () => { void loadJobs(); },
    });

    const updateChecker = new UpdateChecker({
      cache: rawStorage,
      network: platform.network,
      catalogEngine,
    });

    _scheduler = scheduler;
    scheduler.start();
    updateChecker.start();

    // Schedule a background idle sweep to evict stale processed cache entries.
    scheduleCacheSweep(processedCache, PROCESSED_CACHE_VERSION);

    // Load initial job list now that the configured queue is in place.
    void loadJobs();

    // Keep running for the lifetime of the app; clean up on hot-reload only.
    return () => {
      scheduler.stop();
      updateChecker.stop();
      _schedulerStarted = false;
      _scheduler = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync job list on mount (before scheduler effect runs and after each reload).
  const didInitialLoad = useRef(false);
  useEffect(() => {
    if (!didInitialLoad.current) {
      didInitialLoad.current = true;
      void loadJobs();
    }
  }, [loadJobs]);

  const requestLanguage = useCallback(
    (langCode: string, options?: { host?: string; token?: string }) => {
      void getDownloadQueue().enqueueSource(langCode, options).then(() => {
        // Kick the scheduler immediately instead of waiting for the 10-second poll.
        triggerSchedulerDrain();
        void loadJobs();
      });
    },
    [loadJobs],
  );

  const cancelLanguage = useCallback(
    (langCode: string) => {
      void getDownloadQueue().listByLanguage(langCode).then(async (jobs) => {
        for (const job of jobs) {
          if (job.status === 'queued') await getDownloadQueue().dequeue(job.id);
        }
        await loadJobs();
      });
    },
    [loadJobs],
  );

  const refresh = useCallback(() => { void loadJobs(); }, [loadJobs]);

  const isDownloading = activeJobs.some(
    (j) => j.status === 'downloading' || j.status === 'extracting' || j.status === 'hydrating',
  );
  const reposTotal = activeJobs.length;
  const reposCompleted = activeJobs.filter((j) => j.status === 'done').length;

  return {
    activeJobs,
    isDownloading,
    totalProgress: { reposCompleted, reposTotal },
    latestProgress,
    requestLanguage,
    cancelLanguage,
    refresh,
  };
}

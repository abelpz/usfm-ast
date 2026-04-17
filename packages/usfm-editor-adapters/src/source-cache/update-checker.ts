/**
 * UpdateChecker — periodically checks DCS for newer releases of all cached repos
 * and updates project pins' `availableTag` field when a new version is found.
 *
 * Runs on app start and every `checkIntervalMs` while online.
 */
import type { SourceCacheStorage } from '@usfm-tools/types';
import { notifyNewReleaseAvailable } from './version-pinning';
import type { CatalogSyncEngine } from './catalog-sync-engine';

interface NetworkLike {
  isOnline(): boolean;
  onStatusChange(cb: (online: boolean) => void): () => void;
}

export interface UpdateCheckerOptions {
  cache: SourceCacheStorage;
  network: NetworkLike;
  catalogEngine: CatalogSyncEngine;
  /** Interval between checks while online (ms). Default: 24 hours. */
  checkIntervalMs?: number;
  /**
   * Called when at least one repo has a new available release.
   * Provides a summary map of repoId → newTag for UI badges.
   */
  onUpdatesAvailable?: (updates: Map<string, string>) => void;
}

/**
 * Schedule a background sweep of the processed cache to evict entries whose
 * parser version is stale (e.g. after an app update).
 * Runs at idle priority using `requestIdleCallback` when available, otherwise
 * `setTimeout(..., 0)`.
 *
 * @param processedCache The processed cache storage to sweep.
 * @param currentParserVersion The current parser version string.
 * @param maxSizeBytes If the cache exceeds this size, LRU eviction is triggered.
 *   Default: 200 MB.
 */
export function scheduleCacheSweep(
  processedCache: import('@usfm-tools/types').ProcessedCacheStorage,
  currentParserVersion: string,
  maxSizeBytes = 200 * 1024 * 1024,
): void {
  const sweep = async () => {
    await processedCache.invalidateByParserVersion(currentParserVersion);
    const currentSize = await processedCache.estimateSize();
    if (currentSize > maxSizeBytes) {
      await processedCache.evictLRU(maxSizeBytes * 0.8); // Evict down to 80% of limit.
    }
  };

  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    (window as Window & { requestIdleCallback(cb: () => void): void }).requestIdleCallback(
      () => { void sweep(); },
    );
  } else {
    setTimeout(() => { void sweep(); }, 0);
  }
}

export class UpdateChecker {
  private readonly opts: Required<Omit<UpdateCheckerOptions, 'onUpdatesAvailable'>> &
    Pick<UpdateCheckerOptions, 'onUpdatesAvailable'>;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private unsubNetwork: (() => void) | null = null;
  private running = false;
  private lastCheckAt = 0;

  constructor(opts: UpdateCheckerOptions) {
    this.opts = {
      checkIntervalMs: 24 * 60 * 60 * 1_000,
      ...opts,
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    this.unsubNetwork = this.opts.network.onStatusChange((online) => {
      if (online) void this.checkIfDue();
    });

    if (this.opts.network.isOnline()) {
      void this.check();
    }
    this.scheduleNext();
  }

  stop(): void {
    this.running = false;
    this.unsubNetwork?.();
    this.unsubNetwork = null;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** Force an immediate check regardless of the interval. */
  async forceCheck(): Promise<Map<string, string>> {
    return this.check();
  }

  private scheduleNext(): void {
    if (!this.running) return;
    this.timer = setTimeout(() => {
      if (this.opts.network.isOnline()) void this.check();
      this.scheduleNext();
    }, this.opts.checkIntervalMs);
  }

  private async checkIfDue(): Promise<void> {
    const now = Date.now();
    if (now - this.lastCheckAt >= this.opts.checkIntervalMs) {
      await this.check();
    }
  }

  private async check(): Promise<Map<string, string>> {
    if (!this.running) return new Map();
    this.lastCheckAt = Date.now();

    const repos = await this.opts.cache.listCachedRepos();
    const repoIds = [...new Set(repos.map((r) => r.repoId))];
    if (!repoIds.length) return new Map();

    let latestTags: Map<string, string>;
    try {
      latestTags = await this.opts.catalogEngine.checkForUpdates(repoIds);
    } catch {
      return new Map();
    }

    const updates = new Map<string, string>();

    for (const [repoId, latestTag] of latestTags) {
      const cached = repos.filter((r) => r.repoId === repoId);
      const hasCachedLatest = cached.some((r) => r.releaseTag === latestTag);
      if (!hasCachedLatest) {
        updates.set(repoId, latestTag);
        await notifyNewReleaseAvailable(this.opts.cache, repoId, latestTag);
      }
    }

    if (updates.size > 0) {
      this.opts.onUpdatesAvailable?.(updates);
    }

    return updates;
  }
}

/**
 * DownloadScheduler — drains the `DownloadQueue` in the background using the
 * zipball download strategy.
 *
 * Lifecycle:
 *   1. Call `start()` once (on app mount).
 *   2. Listens to the `NetworkAdapter` and drains the queue when online.
 *   3. Call `stop()` on unmount to clean up listeners.
 *
 * Per the plan:
 *   - Source repos downloaded via `release.zipball_url` (one request per repo).
 *   - Fallback: per-file contents API when `zipballUrl` is null.
 *   - Project repos downloaded via `GET /repos/{owner}/{repo}/archive/{ref}.zip`.
 *   - Max 2 concurrent downloads to avoid saturating the connection.
 *   - Exponential backoff on failure.
 */
import type {
  CachedSourceFile,
  CachedSourceRepo,
  DownloadJob,
  DownloadQueue,
  ProcessedCacheStorage,
  SourceCacheStorage,
} from '@usfm-tools/types';
import type { CatalogSyncEngine } from './catalog-sync-engine';
import { PROCESSED_CACHE_VERSION } from './constants';
import { checkQuotaBeforeDownload, requestPersistentStorage } from '../storage/storage-quota';

interface NetworkLike {
  isOnline(): boolean;
  onStatusChange(cb: (online: boolean) => void): () => void;
}

export type DownloadProgressEvent = {
  job: DownloadJob;
  /** 0-100, updated during extraction. */
  percent?: number;
  message?: string;
};

export interface DownloadSchedulerOptions {
  queue: DownloadQueue;
  network: NetworkLike;
  rawStorage: SourceCacheStorage;
  processedCache: ProcessedCacheStorage;
  catalogEngine: CatalogSyncEngine;
  /** Polling interval while online (ms). Default: 10 s. */
  pollIntervalMs?: number;
  /** Max retries before a job is abandoned. Default: 5. */
  maxRetries?: number;
  /** Injectable fetch. Defaults to `globalThis.fetch`. */
  httpFetch?: typeof fetch;
  /** Called after each progress update. */
  onProgress?: (event: DownloadProgressEvent) => void;
  /** Called when a job completes successfully. */
  onJobDone?: (job: DownloadJob) => void;
  /** Called when a job permanently fails. */
  onJobFailed?: (job: DownloadJob, error: Error) => void;
}

const BACKOFF_BASE_MS = 2_000;

function backoffMs(retryCount: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** retryCount, 60_000);
}

/**
 * Build a verse-keyed index from a DCS Translation Notes or Translation Words
 * List TSV file.  Column 0 is expected to be the verse reference
 * (`GEN 1:1` or `1:1`); all columns are kept as-is per row.
 * Returns `{ "<ref>": string[][] }` where each value is an array of TSV rows
 * (already split into columns) for that reference.
 */
function buildTsvVerseIndex(tsv: string): Record<string, string[][]> {
  const index: Record<string, string[][]> = {};
  const lines = tsv.split('\n');
  // Skip header line (row 0).
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;
    const cols = line.split('\t');
    const ref = cols[0]?.trim() ?? '';
    if (!ref) continue;
    (index[ref] ??= []).push(cols);
  }
  return index;
}

export class DownloadScheduler {
  private readonly opts: Required<
    Omit<DownloadSchedulerOptions, 'onProgress' | 'onJobDone' | 'onJobFailed'>
  > &
    Pick<DownloadSchedulerOptions, 'onProgress' | 'onJobDone' | 'onJobFailed'>;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private unsubNetwork: (() => void) | null = null;
  private running = false;
  private activeDownloads = 0;
  private readonly MAX_CONCURRENT = 2;

  constructor(opts: DownloadSchedulerOptions) {
    this.opts = {
      pollIntervalMs: 10_000,
      maxRetries: 5,
      httpFetch: globalThis.fetch.bind(globalThis),
      ...opts,
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.unsubNetwork = this.opts.network.onStatusChange((online) => {
      if (online) void this.drain();
    });
    if (this.opts.network.isOnline()) void this.drain();
    this.schedulePoll();
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

  /** Manually trigger a drain (e.g. after new jobs are enqueued). */
  triggerDrain(): void {
    if (this.opts.network.isOnline()) void this.drain();
  }

  private schedulePoll(): void {
    if (!this.running) return;
    this.timer = setTimeout(() => {
      if (this.opts.network.isOnline()) void this.drain();
      this.schedulePoll();
    }, this.opts.pollIntervalMs);
  }

  private async drain(): Promise<void> {
    if (!this.running) return;

    while (
      this.running &&
      this.opts.network.isOnline() &&
      this.activeDownloads < this.MAX_CONCURRENT
    ) {
      const job = await this.opts.queue.peek();
      if (!job) break;

      // Mark as downloading immediately to avoid duplicate picks.
      await this.opts.queue.updateJob(job.id, { status: 'downloading' });
      this.activeDownloads++;

      // Run download in background — don't await here so we can start the
      // next job up to MAX_CONCURRENT.
      void this.runJob(job).finally(() => {
        this.activeDownloads--;
        // Try to fill the next slot.
        if (this.running && this.opts.network.isOnline()) {
          void this.drain();
        }
      });
    }
  }

  private async runJob(job: DownloadJob): Promise<void> {
    // Request persistent storage on first download attempt.
    void requestPersistentStorage();

    // Conservative estimate: 20 MB per repo zipball (typical range: 3–50 MB).
    // If quota is too tight, skip the job so the queue doesn't spin on a
    // storage-full device. The safety margin defaults to 50 MB on top of this.
    const ESTIMATED_JOB_BYTES = 20 * 1024 * 1024;
    const quotaCheck = await checkQuotaBeforeDownload(ESTIMATED_JOB_BYTES);
    if (!quotaCheck.ok) {
      const availMB = Math.round(quotaCheck.availableBytes / (1024 * 1024));
      throw new Error(
        `Not enough storage space to download ${job.repoId}. ` +
          `Available: ${availMB} MB. Free up space and try again.`,
      );
    }

    try {
      if (job.kind === 'source') {
        await this.runSourceJob(job);
      } else {
        await this.runProjectJob(job);
      }
      await this.opts.queue.dequeue(job.id);
      this.opts.onJobDone?.({ ...job, status: 'done' });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const newRetryCount = job.retryCount + 1;

      if (newRetryCount >= this.opts.maxRetries) {
        await this.opts.queue.updateJob(job.id, { status: 'error', retryCount: newRetryCount });
        this.opts.onJobFailed?.(job, error);
      } else {
        // Back to queued with incremented retry — scheduler will pick it up after backoff.
        setTimeout(async () => {
          await this.opts.queue.updateJob(job.id, {
            status: 'queued',
            retryCount: newRetryCount,
          });
        }, backoffMs(newRetryCount));
      }
    }
  }

  private async runSourceJob(job: DownloadJob): Promise<void> {
    this.opts.onProgress?.({ job, message: `Starting download: ${job.repoId}` });

    if (job.zipballUrl) {
      await this.downloadAndStoreZipball(job);
    } else {
      // Fallback: per-file contents API via CatalogSyncEngine.
      const [owner, repoName] = job.repoId.split('/');
      if (!owner || !repoName) throw new Error(`Invalid repoId: ${job.repoId}`);

      await this.opts.catalogEngine.downloadRepo(
        {
          repoId: job.repoId,
          owner,
          repoName,
          langCode: job.langCode,
          subject: job.subject,
          releaseTag: job.releaseTag,
          ingredients: [], // Will be fetched internally
        },
        0,
        undefined,
      );
    }

    // After raw storage is populated, eagerly build processed cache for USJ files.
    await this.buildProcessedCacheForRepo(job);
    this.opts.onProgress?.({ job, percent: 100, message: `Done: ${job.repoId}` });
  }

  private async runProjectJob(job: DownloadJob): Promise<void> {
    // Project downloads go to ProjectStorage (separate from source cache).
    // For Phase 2 we download the zip and log — full hydration is Phase 2 scope.
    // The zipball URL is pre-constructed in IndexedDbDownloadQueue.enqueueProject().
    if (!job.zipballUrl) throw new Error(`No archive URL for project job: ${job.repoId}`);

    this.opts.onProgress?.({
      job,
      message: `Downloading project archive: ${job.repoId}`,
    });
    await this.opts.queue.updateJob(job.id, { status: 'extracting' });

    // Download zip — for now we verify connectivity and log.
    // Full ProjectStorage hydration will be added in Phase 2 project integration.
    const resp = await this.opts.httpFetch(job.zipballUrl, { method: 'HEAD' });
    if (!resp.ok) {
      throw new Error(`Project archive HEAD check failed: ${resp.status} ${job.zipballUrl}`);
    }

    this.opts.onProgress?.({
      job,
      percent: 100,
      message: `Project archive verified: ${job.repoId} (full hydration pending)`,
    });
  }

  private async downloadAndStoreZipball(job: DownloadJob): Promise<void> {
    if (!job.zipballUrl) return;

    const resp = await this.opts.httpFetch(job.zipballUrl);
    if (!resp.ok) {
      throw new Error(`Zipball download failed: ${resp.status} ${job.zipballUrl}`);
    }

    await this.opts.queue.updateJob(job.id, { status: 'extracting' });
    this.opts.onProgress?.({ job, message: `Extracting: ${job.repoId}` });

    const arrayBuffer = await resp.arrayBuffer();

    // Dynamically import JSZip for zip extraction.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let jszip: any;
    try {
      // JSZip's default export varies between CJS/ESM environments.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod: any = await import('jszip');
      const JSZipCtor = mod.default ?? mod;
      jszip = await JSZipCtor.loadAsync(arrayBuffer);
    } catch {
      throw new Error('JSZip is not available. Add "jszip" to dependencies.');
    }

    const files: CachedSourceFile[] = [];
    let totalBytes = 0;

    const zipEntries = Object.entries(jszip.files);

    // DCS zipballs have a top-level directory like `en_ult-v87/`, strip it.
    const topDir = this.findTopDir(zipEntries.map(([name]) => name));

    for (const [name, zipEntry] of zipEntries) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entry = zipEntry as any;
      if (entry.dir) continue;

      // Strip the top-level directory prefix.
      const relativePath = topDir ? name.slice(topDir.length) : name;
      if (!relativePath) continue;

      const content = await entry.async('string');
      totalBytes += content.length;

      files.push({
        repoId: job.repoId,
        releaseTag: job.releaseTag,
        path: relativePath,
        content,
      });

      await this.opts.queue.updateJob(job.id, { bytesDownloaded: totalBytes });
    }

    if (!files.length) throw new Error(`Zipball for ${job.repoId} contained no files.`);

    const repo: CachedSourceRepo = {
      repoId: job.repoId,
      langCode: job.langCode,
      subject: job.subject,
      releaseTag: job.releaseTag,
      downloadedAt: new Date().toISOString(),
      sizeBytes: totalBytes,
      fileCount: files.length,
    };

    await this.opts.rawStorage.putCachedRepo(repo, files);
    this.opts.onProgress?.({
      job,
      message: `Stored ${files.length} files for ${job.repoId}`,
    });
  }

  private findTopDir(names: string[]): string {
    // Find the common top-level directory prefix (DCS zip pattern: `owner-repo-tag/`).
    const first = names[0] ?? '';
    const slash = first.indexOf('/');
    if (slash < 0) return '';
    const prefix = first.slice(0, slash + 1);
    return names.every((n) => n.startsWith(prefix)) ? prefix : '';
  }

  private async buildProcessedCacheForRepo(job: DownloadJob): Promise<void> {
    const paths = await this.opts.rawStorage.listCachedFiles(job.repoId, job.releaseTag);

    for (const path of paths) {
      const isUsfm = /\.(usfm|sfm)$/i.test(path);
      const isTn = /\btn\b.*\.tsv$/i.test(path) || /en_tn.*\.tsv$/i.test(path);
      const isTwl = /\btwl\b.*\.tsv$/i.test(path) || /en_twl.*\.tsv$/i.test(path);
      const isTw = /\btw\b/i.test(job.subject) && /\.md$/i.test(path);
      const isTa = /\bta\b/i.test(job.subject) && /\.md$/i.test(path);

      if (!isUsfm && !isTn && !isTwl && !isTw && !isTa) continue;

      const cacheType = isUsfm
        ? 'usj'
        : isTn
          ? 'tn-index'
          : isTwl
            ? 'twl-index'
            : isTw
              ? 'tw-articles'
              : 'ta-articles';

      // Skip if already cached (any parser version; will be invalidated on upgrade).
      const existing = await this.opts.processedCache.get(
        job.repoId,
        job.releaseTag,
        path,
        cacheType,
        '0',
      );
      if (existing) continue;

      const rawFile = await this.opts.rawStorage.getCachedFile(
        job.repoId,
        job.releaseTag,
        path,
      );
      if (!rawFile) continue;

      try {
        let data: string;
        let bookCode: string | null = null;

        const bookMatch = path.match(/[_-]([A-Z0-9]{2,3})\.(usfm|sfm|tsv|md)$/i);
        if (bookMatch) bookCode = bookMatch[1]!.toUpperCase();

        if (isUsfm) {
          const { DocumentStore } = await import('@usfm-tools/editor-core');
          const store = new DocumentStore({ silentConsole: true });
          store.loadUSFM(rawFile.content);
          data = JSON.stringify(store.getFullUSJ());
        } else if (isTn || isTwl) {
          // Index TSV by verse reference for fast lookup.
          // Format: { "GEN 1:1": [row, row, …], … }
          const index = buildTsvVerseIndex(rawFile.content);
          data = JSON.stringify(index);
        } else {
          // TW/TA — store Markdown as-is; keyed by path for article lookup.
          data = rawFile.content;
        }

        await this.opts.processedCache.put({
          repoId: job.repoId,
          releaseTag: job.releaseTag,
          path,
          cacheType,
          langCode: job.langCode,
          bookCode,
          subject: job.subject,
          data,
          parserVersion: PROCESSED_CACHE_VERSION,
          builtAt: new Date().toISOString(),
        });
      } catch {
        // Non-critical: next read will re-process from raw storage.
      }

      // Yield to the event loop between files to keep the UI responsive.
      await new Promise<void>((res) => setTimeout(res, 0));
    }
  }
}

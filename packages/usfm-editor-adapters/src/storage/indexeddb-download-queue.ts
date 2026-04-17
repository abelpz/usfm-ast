/**
 * IndexedDB implementation of `DownloadQueue`.
 *
 * Schema (DB: usfm-download-queue-v1):
 *   jobs – { id } key path
 *          Index: byLang     (langCode)
 *          Index: byStatus   (status)
 *          Index: byPriority (priority)
 */
import type { DownloadJob, DownloadQueue } from '@usfm-tools/types';

const DB_NAME = 'usfm-download-queue-v1';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = (ev.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('jobs')) {
        const store = db.createObjectStore('jobs', { keyPath: 'id' });
        store.createIndex('byLang', 'langCode');
        store.createIndex('byStatus', 'status');
        store.createIndex('byPriority', 'priority');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet<T>(store: IDBObjectStore, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((res, rej) => {
    const r = store.get(key);
    r.onsuccess = () => res(r.result as T | undefined);
    r.onerror = () => rej(r.error);
  });
}

function idbGetAll<T>(store: IDBObjectStore, query?: IDBKeyRange | IDBValidKey): Promise<T[]> {
  return new Promise((res, rej) => {
    const r = query !== undefined ? store.getAll(query) : store.getAll();
    r.onsuccess = () => res(r.result as T[]);
    r.onerror = () => rej(r.error);
  });
}

function idbGetAllIndex<T>(index: IDBIndex, query: IDBKeyRange | IDBValidKey): Promise<T[]> {
  return new Promise((res, rej) => {
    const r = index.getAll(query);
    r.onsuccess = () => res(r.result as T[]);
    r.onerror = () => rej(r.error);
  });
}

function idbPut(store: IDBObjectStore, value: unknown): Promise<void> {
  return new Promise((res, rej) => {
    const r = store.put(value);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

function idbDelete(store: IDBObjectStore, key: IDBValidKey): Promise<void> {
  return new Promise((res, rej) => {
    const r = store.delete(key);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

function newJobId(): string {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function now(): string {
  return new Date().toISOString();
}

export class IndexedDbDownloadQueue implements DownloadQueue {
  private dbPromise: Promise<IDBDatabase> | null = null;

  /**
   * Optional catalog fetch function for resolving language entries.
   * Provided at construction time by the DownloadScheduler.
   */
  constructor(
    private readonly catalogFetch?: (
      langCode: string,
      opts: { host?: string; token?: string },
    ) => Promise<Array<{ repoId: string; releaseTag: string; zipballUrl: string | null; subject: string; langCode: string }>>,
  ) {}

  private db(): Promise<IDBDatabase> {
    if (!this.dbPromise) this.dbPromise = openDb();
    return this.dbPromise;
  }

  async enqueueSource(
    langCode: string,
    options: { priorityRepoId?: string; host?: string; token?: string } = {},
  ): Promise<void> {
    const { priorityRepoId, host = 'git.door43.org', token } = options;

    // Resolve catalog entries to create per-repo jobs.
    if (!this.catalogFetch) {
      // Without a catalog fetcher, enqueue a single placeholder job for
      // the DownloadScheduler to resolve later.
      await this.enqueueRaw({
        id: newJobId(),
        kind: 'source',
        langCode,
        repoId: `pending/${langCode}`,
        releaseTag: '',
        zipballUrl: null,
        subject: 'pending',
        priority: priorityRepoId ? 0 : 5,
        status: 'queued',
        bytesDownloaded: 0,
        retryCount: 0,
        createdAt: now(),
        updatedAt: now(),
      });
      return;
    }

    const entries = await this.catalogFetch(langCode, { host, token });
    const db = await this.db();

    for (const entry of entries) {
      // Deduplicate: skip if a queued job for this (repoId, releaseTag) already exists.
      const existing = await this.findExistingJob(db, entry.repoId, entry.releaseTag);
      if (existing) continue;

      const priority = entry.repoId === priorityRepoId ? 0 : 5;
      await this.enqueueRaw({
        id: newJobId(),
        kind: 'source',
        langCode: entry.langCode,
        repoId: entry.repoId,
        releaseTag: entry.releaseTag,
        zipballUrl: entry.zipballUrl,
        subject: entry.subject,
        priority,
        status: 'queued',
        bytesDownloaded: 0,
        retryCount: 0,
        createdAt: now(),
        updatedAt: now(),
      });
    }
  }

  async enqueueProject(owner: string, repo: string, ref: string, host = 'git.door43.org'): Promise<void> {
    const repoId = `${owner}/${repo}`;
    const db = await this.db();
    const existing = await this.findExistingJob(db, repoId, ref);
    if (existing) return;

    const baseUrl = `https://${host.replace(/^https?:\/\//, '')}`;
    const zipballUrl = `${baseUrl}/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/archive/${encodeURIComponent(ref)}.zip`;

    await this.enqueueRaw({
      id: newJobId(),
      kind: 'project',
      langCode: '',
      repoId,
      releaseTag: ref,
      zipballUrl,
      subject: 'project',
      priority: 1,
      status: 'queued',
      bytesDownloaded: 0,
      retryCount: 0,
      createdAt: now(),
      updatedAt: now(),
    });
  }

  async peek(): Promise<DownloadJob | null> {
    const db = await this.db();
    const tx = db.transaction('jobs', 'readonly');
    const store = tx.objectStore('jobs');
    const all = await idbGetAll<DownloadJob>(store);
    const pending = all.filter((j) => j.status === 'queued');
    if (!pending.length) return null;
    pending.sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt));
    return pending[0] ?? null;
  }

  async updateJob(
    id: string,
    patch: Partial<Pick<DownloadJob, 'status' | 'bytesDownloaded' | 'retryCount'>>,
  ): Promise<void> {
    const db = await this.db();
    const tx = db.transaction('jobs', 'readwrite');
    const store = tx.objectStore('jobs');
    const job = await idbGet<DownloadJob>(store, id);
    if (!job) return;
    await idbPut(store, { ...job, ...patch, updatedAt: now() });
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  async dequeue(id: string): Promise<void> {
    const db = await this.db();
    const tx = db.transaction('jobs', 'readwrite');
    const store = tx.objectStore('jobs');
    await idbDelete(store, id);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  async listPending(): Promise<DownloadJob[]> {
    const db = await this.db();
    const tx = db.transaction('jobs', 'readonly');
    const store = tx.objectStore('jobs');
    const all = await idbGetAll<DownloadJob>(store);
    return all.filter((j) => j.status !== 'done');
  }

  async listByLanguage(langCode: string): Promise<DownloadJob[]> {
    const db = await this.db();
    const tx = db.transaction('jobs', 'readonly');
    const store = tx.objectStore('jobs');
    const idx = store.index('byLang');
    return idbGetAllIndex<DownloadJob>(idx, IDBKeyRange.only(langCode));
  }

  async clear(): Promise<void> {
    const db = await this.db();
    const tx = db.transaction('jobs', 'readwrite');
    const store = tx.objectStore('jobs');
    await new Promise<void>((res, rej) => {
      const r = store.clear();
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
    });
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  private async enqueueRaw(job: DownloadJob): Promise<void> {
    const db = await this.db();
    const tx = db.transaction('jobs', 'readwrite');
    const store = tx.objectStore('jobs');
    await idbPut(store, job);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  private async findExistingJob(
    db: IDBDatabase,
    repoId: string,
    releaseTag: string,
  ): Promise<DownloadJob | null> {
    const tx = db.transaction('jobs', 'readonly');
    const store = tx.objectStore('jobs');
    const all = await idbGetAll<DownloadJob>(store);
    const match = all.find(
      (j) => j.repoId === repoId && j.releaseTag === releaseTag && j.status !== 'done',
    );
    return match ?? null;
  }
}

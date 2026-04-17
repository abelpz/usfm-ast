/**
 * IndexedDB implementation of `SyncQueue`.
 *
 * Schema (within the existing project storage DB or a dedicated DB):
 *   sync_queue  – { id } key, indexed by (projectId, retryAfter)
 *
 * Exponential back-off schedule (retryCount → delay):
 *   0 → 30 s, 1 → 2 min, 2 → 10 min, 3 → 30 min, 4+ → 2 h
 */
import type { SyncOperation, SyncQueue } from '@usfm-tools/types';

const RETRY_DELAYS_MS = [
  30_000,       // 30 s
  120_000,      // 2 min
  600_000,      // 10 min
  1_800_000,    // 30 min
  7_200_000,    // 2 h
];

const DEFAULT_DB_NAME = 'usfm-sync-queue-v1';
const DB_VERSION = 1;

function openDb(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = (ev.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('sync_queue')) {
        const store = db.createObjectStore('sync_queue', { keyPath: 'id' });
        store.createIndex('byProject', 'projectId');
        store.createIndex('byProjectAndRetryAfter', ['projectId', 'retryAfter']);
        store.createIndex('byCreatedAt', 'createdAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  db: IDBDatabase,
  storeNames: string | string[],
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeNames, mode);
    const store = t.objectStore('sync_queue');
    work(store).then((result) => {
      t.oncomplete = () => resolve(result);
    });
    t.onerror = () => reject(t.error);
  });
}

function idbGet<T>(store: IDBObjectStore, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((res, rej) => {
    const r = store.get(key);
    r.onsuccess = () => res(r.result as T | undefined);
    r.onerror = () => rej(r.error);
  });
}

function idbGetAll<T>(store: IDBObjectStore, index?: string, query?: IDBKeyRange | IDBValidKey): Promise<T[]> {
  return new Promise((res, rej) => {
    const src = index ? store.index(index) : store;
    const r = query !== undefined ? src.getAll(query) : src.getAll();
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

function idbDeleteByIndex(index: IDBIndex, query: IDBKeyRange | IDBValidKey): Promise<void> {
  return new Promise((res, rej) => {
    const req = index.openCursor(query);
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) { res(); return; }
      cursor.delete();
      cursor.continue();
    };
    req.onerror = () => rej(req.error);
  });
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export class IndexedDbSyncQueue implements SyncQueue {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private readonly dbName: string;

  constructor(dbName?: string) {
    this.dbName = dbName ?? DEFAULT_DB_NAME;
  }

  private db(): Promise<IDBDatabase> {
    if (!this.dbPromise) this.dbPromise = openDb(this.dbName);
    return this.dbPromise;
  }

  async enqueue(
    op: Omit<SyncOperation, 'id' | 'createdAt' | 'retryCount' | 'retryAfter'>,
  ): Promise<string> {
    const db = await this.db();
    const full: SyncOperation = {
      ...op,
      id: uuid(),
      createdAt: new Date().toISOString(),
      retryCount: 0,
      retryAfter: null,
    };
    await tx(db, 'sync_queue', 'readwrite', async (store) => {
      await idbPut(store, full);
      return full.id;
    });
    return full.id;
  }

  async peek(): Promise<SyncOperation | null> {
    const db = await this.db();
    const now = new Date().toISOString();
    const all = await tx(db, 'sync_queue', 'readonly', (store) =>
      idbGetAll<SyncOperation>(store, 'byCreatedAt'),
    );
    // Return first op where retryAfter is null or in the past.
    return (
      all.find((op) => op.retryAfter === null || op.retryAfter <= now) ?? null
    );
  }

  async dequeue(id: string): Promise<void> {
    const db = await this.db();
    await tx(db, 'sync_queue', 'readwrite', async (store) => {
      await idbDelete(store, id);
    });
  }

  async listPending(projectId?: string): Promise<SyncOperation[]> {
    const db = await this.db();
    if (projectId) {
      return tx(db, 'sync_queue', 'readonly', (store) =>
        idbGetAll<SyncOperation>(store, 'byProject', IDBKeyRange.only(projectId)),
      );
    }
    return tx(db, 'sync_queue', 'readonly', (store) =>
      idbGetAll<SyncOperation>(store),
    );
  }

  async recordRetry(id: string): Promise<void> {
    const db = await this.db();
    await tx(db, 'sync_queue', 'readwrite', async (store) => {
      const op = await idbGet<SyncOperation>(store, id);
      if (!op) return;
      const delayMs = RETRY_DELAYS_MS[Math.min(op.retryCount, RETRY_DELAYS_MS.length - 1)]!;
      const retryAfter = new Date(Date.now() + delayMs).toISOString();
      await idbPut(store, { ...op, retryCount: op.retryCount + 1, retryAfter });
    });
  }

  async clearProject(projectId: string): Promise<void> {
    const db = await this.db();
    await tx(db, 'sync_queue', 'readwrite', async (store) => {
      const idx = store.index('byProject');
      await idbDeleteByIndex(idx, IDBKeyRange.only(projectId));
    });
  }
}

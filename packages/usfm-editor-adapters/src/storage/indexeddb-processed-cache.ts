/**
 * IndexedDB implementation of `ProcessedCacheStorage` (Layer 2: Processed Cache).
 *
 * Schema (DB: usfm-processed-cache-v1):
 *   entries – { repoId, releaseTag, path, cacheType } composite key
 *             Index: byLangBook  (langCode, bookCode, subject)
 *             Index: byRepoTag   (repoId, releaseTag)
 *             Index: byParserVer (parserVersion)
 */
import type {
  ProcessedCacheEntry,
  ProcessedCacheStorage,
  RepoId,
} from '@usfm-tools/types';

const DB_NAME = 'usfm-processed-cache-v1';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (ev) => {
      const db = (ev.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('entries')) {
        const store = db.createObjectStore('entries', {
          keyPath: ['repoId', 'releaseTag', 'path', 'cacheType'],
        });
        store.createIndex('byRepoTag', ['repoId', 'releaseTag']);
        store.createIndex('byParserVer', 'parserVersion');
        store.createIndex('byLangBook', ['langCode', 'bookCode', 'subject']);
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

function idbGetAllIndex<T>(
  index: IDBIndex,
  query: IDBKeyRange | IDBValidKey,
): Promise<T[]> {
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

function idbDeleteByIndex(
  index: IDBIndex,
  query: IDBKeyRange | IDBValidKey,
): Promise<void> {
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

function idbDeleteFiltered(
  store: IDBObjectStore,
  predicate: (entry: ProcessedCacheEntry) => boolean,
): Promise<number> {
  return new Promise((res, rej) => {
    let removed = 0;
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) { res(removed); return; }
      if (predicate(cursor.value as ProcessedCacheEntry)) {
        cursor.delete();
        removed++;
      }
      cursor.continue();
    };
    req.onerror = () => rej(req.error);
  });
}

export class IndexedDbProcessedCacheStorage implements ProcessedCacheStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private db(): Promise<IDBDatabase> {
    if (!this.dbPromise) this.dbPromise = openDb();
    return this.dbPromise;
  }

  async get(
    repoId: RepoId,
    releaseTag: string,
    path: string,
    cacheType: ProcessedCacheEntry['cacheType'],
    currentParserVersion: string,
  ): Promise<ProcessedCacheEntry | null> {
    const db = await this.db();
    const tx = db.transaction('entries', 'readonly');
    const store = tx.objectStore('entries');
    const entry = await idbGet<ProcessedCacheEntry>(store, [repoId, releaseTag, path, cacheType]);
    if (!entry) return null;
    // Treat version mismatches as cache misses so callers always receive valid data.
    if (entry.parserVersion !== currentParserVersion) return null;
    return entry;
  }

  async put(entry: ProcessedCacheEntry): Promise<void> {
    const db = await this.db();
    const tx = db.transaction('entries', 'readwrite');
    const store = tx.objectStore('entries');
    await idbPut(store, entry);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  async invalidateByParserVersion(currentVersion: string): Promise<number> {
    const db = await this.db();
    const tx = db.transaction('entries', 'readwrite');
    const store = tx.objectStore('entries');
    const removed = await idbDeleteFiltered(
      store,
      (e) => e.parserVersion !== currentVersion,
    );
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    return removed;
  }

  async invalidateRepo(repoId: RepoId, releaseTag: string): Promise<void> {
    const db = await this.db();
    const tx = db.transaction('entries', 'readwrite');
    const store = tx.objectStore('entries');
    const idx = store.index('byRepoTag');
    await idbDeleteByIndex(idx, IDBKeyRange.only([repoId, releaseTag]));
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  async estimateSize(): Promise<number> {
    const db = await this.db();
    const tx = db.transaction('entries', 'readonly');
    const store = tx.objectStore('entries');
    const all = await idbGetAll<ProcessedCacheEntry>(store);
    return all.reduce((sum, e) => sum + e.data.length * 2, 0); // UTF-16 bytes approx
  }

  async evictLRU(targetBytes: number): Promise<number> {
    const db = await this.db();
    const readTx = db.transaction('entries', 'readonly');
    const readStore = readTx.objectStore('entries');
    const all = await idbGetAll<ProcessedCacheEntry>(readStore);

    // Sort oldest-first (by builtAt ascending).
    all.sort((a, b) => a.builtAt.localeCompare(b.builtAt));

    let totalSize = all.reduce((sum, e) => sum + e.data.length * 2, 0);
    let removed = 0;

    const writeTx = db.transaction('entries', 'readwrite');
    const writeStore = writeTx.objectStore('entries');

    for (const entry of all) {
      if (totalSize <= targetBytes) break;
      await idbDelete(writeStore, [entry.repoId, entry.releaseTag, entry.path, entry.cacheType]);
      totalSize -= entry.data.length * 2;
      removed++;
    }

    await new Promise<void>((res, rej) => {
      writeTx.oncomplete = () => res();
      writeTx.onerror = () => rej(writeTx.error);
    });

    return removed;
  }

  async clear(): Promise<void> {
    const db = await this.db();
    const tx = db.transaction('entries', 'readwrite');
    const store = tx.objectStore('entries');
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
}

/**
 * IndexedDB implementation of `SourceCacheStorage`.
 *
 * Schema (DB: usfm-source-cache-v1):
 *   repos      – { repoId, releaseTag } composite key (repoId index)
 *   files      – { repoId, releaseTag, path } composite key (repoId+tag index)
 *   pins       – { projectId, repoId } composite key (projectId index)
 */
import type {
  CachedSourceFile,
  CachedSourceRepo,
  ProjectSourcePin,
  RepoId,
  SourceCacheStorage,
} from '@usfm-tools/types';

const DB_NAME = 'usfm-source-cache-v1';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (ev) => {
      const db = (ev.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('repos')) {
        const repos = db.createObjectStore('repos', { keyPath: ['repoId', 'releaseTag'] });
        repos.createIndex('byRepoId', 'repoId');
        repos.createIndex('byLang', 'langCode');
      }

      if (!db.objectStoreNames.contains('files')) {
        const files = db.createObjectStore('files', {
          keyPath: ['repoId', 'releaseTag', 'path'],
        });
        files.createIndex('byRepoTag', ['repoId', 'releaseTag']);
      }

      if (!db.objectStoreNames.contains('pins')) {
        const pins = db.createObjectStore('pins', { keyPath: ['projectId', 'repoId'] });
        pins.createIndex('byProject', 'projectId');
        pins.createIndex('byRepoTag', ['repoId', 'pinnedTag']);
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

export class IndexedDbSourceCacheStorage implements SourceCacheStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private db(): Promise<IDBDatabase> {
    if (!this.dbPromise) this.dbPromise = openDb();
    return this.dbPromise;
  }

  // ── Repo snapshots ─────────────────────────────────────────────────────

  async listLanguages(): Promise<string[]> {
    const repos = await this.listCachedRepos();
    const langs = new Set(repos.map((r) => r.langCode).filter(Boolean));
    return [...langs].sort();
  }

  async listCachedRepos(langCode?: string): Promise<CachedSourceRepo[]> {
    const db = await this.db();
    const tx = db.transaction('repos', 'readonly');
    const store = tx.objectStore('repos');
    if (langCode) {
      const idx = store.index('byLang');
      return idbGetAllIndex<CachedSourceRepo>(idx, IDBKeyRange.only(langCode));
    }
    return idbGetAll<CachedSourceRepo>(store);
  }

  async getCachedRepo(repoId: RepoId, releaseTag: string): Promise<CachedSourceRepo | null> {
    const db = await this.db();
    const tx = db.transaction('repos', 'readonly');
    const store = tx.objectStore('repos');
    const result = await idbGet<CachedSourceRepo>(store, [repoId, releaseTag]);
    return result ?? null;
  }

  async putCachedRepo(repo: CachedSourceRepo, files: CachedSourceFile[]): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(['repos', 'files'], 'readwrite');

    const repoStore = tx.objectStore('repos');
    const fileStore = tx.objectStore('files');

    // Delete existing files for this snapshot first.
    const fileIdx = fileStore.index('byRepoTag');
    await idbDeleteByIndex(fileIdx, IDBKeyRange.only([repo.repoId, repo.releaseTag]));

    await idbPut(repoStore, repo);
    for (const file of files) {
      await idbPut(fileStore, file);
    }

    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  async deleteCachedRepo(repoId: RepoId, releaseTag: string): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(['repos', 'files'], 'readwrite');

    const repoStore = tx.objectStore('repos');
    const fileStore = tx.objectStore('files');

    await idbDelete(repoStore, [repoId, releaseTag]);
    const fileIdx = fileStore.index('byRepoTag');
    await idbDeleteByIndex(fileIdx, IDBKeyRange.only([repoId, releaseTag]));

    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  // ── Files ──────────────────────────────────────────────────────────────

  async getCachedFile(
    repoId: RepoId,
    releaseTag: string,
    path: string,
  ): Promise<CachedSourceFile | null> {
    const db = await this.db();
    const tx = db.transaction('files', 'readonly');
    const store = tx.objectStore('files');
    const result = await idbGet<CachedSourceFile>(store, [repoId, releaseTag, path]);
    return result ?? null;
  }

  async listCachedFiles(repoId: RepoId, releaseTag: string): Promise<string[]> {
    const db = await this.db();
    const tx = db.transaction('files', 'readonly');
    const store = tx.objectStore('files');
    const idx = store.index('byRepoTag');
    const files = await idbGetAllIndex<CachedSourceFile>(
      idx,
      IDBKeyRange.only([repoId, releaseTag]),
    );
    return files.map((f) => f.path);
  }

  // ── Version pins ───────────────────────────────────────────────────────

  async getPin(projectId: string, repoId: RepoId): Promise<ProjectSourcePin | null> {
    const db = await this.db();
    const tx = db.transaction('pins', 'readonly');
    const store = tx.objectStore('pins');
    const result = await idbGet<ProjectSourcePin>(store, [projectId, repoId]);
    return result ?? null;
  }

  async listPins(projectId: string): Promise<ProjectSourcePin[]> {
    const db = await this.db();
    const tx = db.transaction('pins', 'readonly');
    const store = tx.objectStore('pins');
    const idx = store.index('byProject');
    return idbGetAllIndex<ProjectSourcePin>(idx, IDBKeyRange.only(projectId));
  }

  async listAllPins(): Promise<ProjectSourcePin[]> {
    const db = await this.db();
    const tx = db.transaction('pins', 'readonly');
    const store = tx.objectStore('pins');
    return idbGetAll<ProjectSourcePin>(store);
  }

  async setPin(pin: ProjectSourcePin): Promise<void> {
    const db = await this.db();
    const tx = db.transaction('pins', 'readwrite');
    const store = tx.objectStore('pins');
    await idbPut(store, pin);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  async removePin(projectId: string, repoId: RepoId): Promise<void> {
    const db = await this.db();
    const tx = db.transaction('pins', 'readwrite');
    const store = tx.objectStore('pins');
    await idbDelete(store, [projectId, repoId]);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  async getReferencedSnapshots(): Promise<Array<{ repoId: RepoId; releaseTag: string }>> {
    const db = await this.db();
    const tx = db.transaction('pins', 'readonly');
    const store = tx.objectStore('pins');
    const pins = await idbGetAll<ProjectSourcePin>(store);
    const seen = new Map<string, { repoId: RepoId; releaseTag: string }>();
    for (const pin of pins) {
      const k = `${pin.repoId}@${pin.pinnedTag}`;
      if (!seen.has(k)) seen.set(k, { repoId: pin.repoId, releaseTag: pin.pinnedTag });
    }
    return [...seen.values()];
  }

  async garbageCollect(): Promise<number> {
    const referenced = await this.getReferencedSnapshots();
    const refSet = new Set(referenced.map((r) => `${r.repoId}@${r.releaseTag}`));

    const allRepos = await this.listCachedRepos();
    let removed = 0;

    for (const repo of allRepos) {
      const key = `${repo.repoId}@${repo.releaseTag}`;
      if (!refSet.has(key)) {
        await this.deleteCachedRepo(repo.repoId, repo.releaseTag);
        removed++;
      }
    }

    return removed;
  }
}

import type { ProjectMeta, ProjectRelease, ProjectStorage } from '@usfm-tools/types';

export const DEFAULT_PROJECT_STORAGE_DB_NAME = 'usfm-projects-v1';
/** Bump when `ProjectMeta` shape needs migration (v3: lastRemoteCommit, pendingConflicts). */
const DB_VERSION = 3;
const STORE_PROJECTS = 'projects';
const STORE_FILES = 'files';
const STORE_RELEASES = 'releases';
const STORE_SYNC_SHAS = 'sync-shas';

type FileRow = { projectId: string; path: string; content: string; updated: string };
type ReleaseRow = ProjectRelease & { projectId: string };
type SyncShaRow = { projectId: string; path: string; sha: string };

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Local translation projects in IndexedDB: metadata, virtual files, releases.
 */
export class IndexedDbProjectStorage implements ProjectStorage {
  private readonly dbName: string;
  private db: IDBDatabase | null = null;
  private opening: Promise<IDBDatabase> | null = null;

  /**
   * @param dbName - Optional database name (default {@link DEFAULT_PROJECT_STORAGE_DB_NAME}).
   *   Tests should pass a unique name per suite to avoid `deleteDatabase` races with fake-indexeddb.
   */
  constructor(dbName: string = DEFAULT_PROJECT_STORAGE_DB_NAME) {
    this.dbName = dbName;
  }

  private openDb(): Promise<IDBDatabase> {
    if (this.db) return Promise.resolve(this.db);
    if (this.opening) return this.opening;
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(new Error('IndexedDB is not available in this environment'));
    }
    this.opening = new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, DB_VERSION);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
      req.onsuccess = () => {
        this.db = req.result;
        this.opening = null;
        resolve(this.db);
      };
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE_PROJECTS)) {
          d.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
        }
        if (!d.objectStoreNames.contains(STORE_FILES)) {
          d.createObjectStore(STORE_FILES, { keyPath: ['projectId', 'path'] });
        }
        if (!d.objectStoreNames.contains(STORE_RELEASES)) {
          d.createObjectStore(STORE_RELEASES, { keyPath: ['projectId', 'version'] });
        }
        if (!d.objectStoreNames.contains(STORE_SYNC_SHAS)) {
          d.createObjectStore(STORE_SYNC_SHAS, { keyPath: ['projectId', 'path'] });
        }
      };
    });
    return this.opening;
  }

  private async dbTx(
    storeNames: string[],
    mode: IDBTransactionMode,
    fn: (stores: Record<string, IDBObjectStore>) => void,
  ): Promise<void> {
    const db = await this.openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeNames, mode);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
      const stores: Record<string, IDBObjectStore> = {};
      for (const n of storeNames) {
        stores[n] = tx.objectStore(n);
      }
      fn(stores);
    });
  }

  async createProject(meta: ProjectMeta): Promise<string> {
    const db = await this.openDb();
    const existing = await new Promise<ProjectMeta | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readonly');
      tx.onerror = () => reject(tx.error);
      const r = tx.objectStore(STORE_PROJECTS).get(meta.id);
      r.onsuccess = () => resolve(r.result as ProjectMeta | undefined);
    });
    if (existing) throw new Error(`Project already exists: ${meta.id}`);
    await this.dbTx([STORE_PROJECTS], 'readwrite', (s) => {
      s[STORE_PROJECTS]!.put(meta);
    });
    return meta.id;
  }

  async listProjects(): Promise<ProjectMeta[]> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readonly');
      tx.onerror = () => reject(tx.error);
      const req = tx.objectStore(STORE_PROJECTS).getAll();
      req.onsuccess = () => resolve((req.result as ProjectMeta[]).sort((a, b) => b.updated.localeCompare(a.updated)));
    });
  }

  async getProject(id: string): Promise<ProjectMeta | null> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PROJECTS, 'readonly');
      tx.onerror = () => reject(tx.error);
      const r = tx.objectStore(STORE_PROJECTS).get(id);
      r.onsuccess = () => resolve((r.result as ProjectMeta | undefined) ?? null);
    });
  }

  async updateProject(id: string, patch: Partial<ProjectMeta>): Promise<void> {
    const cur = await this.getProject(id);
    if (!cur) throw new Error(`Project not found: ${id}`);
    const next: ProjectMeta = { ...cur, ...patch, id: cur.id };
    await this.dbTx([STORE_PROJECTS], 'readwrite', (s) => {
      s[STORE_PROJECTS]!.put(next);
    });
  }

  async deleteProject(id: string): Promise<void> {
    const db = await this.openDb();
    const range = IDBKeyRange.bound([id, ''], [id, '\uffff']);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(
        [STORE_PROJECTS, STORE_FILES, STORE_RELEASES, STORE_SYNC_SHAS],
        'readwrite',
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('deleteProject failed'));

      const files = tx.objectStore(STORE_FILES);
      const rel = tx.objectStore(STORE_RELEASES);
      const syncShas = tx.objectStore(STORE_SYNC_SHAS);
      const projects = tx.objectStore(STORE_PROJECTS);

      const drainFiles = () => {
        const c = files.openCursor(range);
        c.onerror = () => reject(c.error ?? new Error('deleteProject cursor'));
        c.onsuccess = () => {
          const cur = c.result;
          if (cur) {
            cur.delete();
            cur.continue();
          } else {
            drainReleases();
          }
        };
      };

      const drainReleases = () => {
        const c = rel.openCursor(range);
        c.onerror = () => reject(c.error ?? new Error('deleteProject cursor'));
        c.onsuccess = () => {
          const cur = c.result;
          if (cur) {
            cur.delete();
            cur.continue();
          } else {
            drainSyncShas();
          }
        };
      };

      const drainSyncShas = () => {
        const c = syncShas.openCursor(range);
        c.onerror = () => reject(c.error ?? new Error('deleteProject cursor'));
        c.onsuccess = () => {
          const cur = c.result;
          if (cur) {
            cur.delete();
            cur.continue();
          } else {
            projects.delete(id);
          }
        };
      };

      drainFiles();
    });
  }

  async writeFile(projectId: string, path: string, content: string): Promise<void> {
    const p = normalizePath(path);
    const now = new Date().toISOString();
    const row: FileRow = { projectId, path: p, content, updated: now };
    await this.dbTx([STORE_FILES, STORE_PROJECTS], 'readwrite', (s) => {
      s[STORE_FILES]!.put(row);
      const pr = s[STORE_PROJECTS]!.get(projectId);
      pr.onsuccess = () => {
        const meta = pr.result as ProjectMeta | undefined;
        if (meta) {
          s[STORE_PROJECTS]!.put({ ...meta, updated: now });
        }
      };
    });
  }

  async readFile(projectId: string, path: string): Promise<string | null> {
    const db = await this.openDb();
    const p = normalizePath(path);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_FILES, 'readonly');
      tx.onerror = () => reject(tx.error);
      const r = tx.objectStore(STORE_FILES).get([projectId, p]);
      r.onsuccess = () => {
        const row = r.result as FileRow | undefined;
        resolve(row?.content ?? null);
      };
    });
  }

  async deleteFile(projectId: string, path: string): Promise<void> {
    const p = normalizePath(path);
    await this.dbTx([STORE_FILES, STORE_PROJECTS], 'readwrite', (s) => {
      s[STORE_FILES]!.delete([projectId, p]);
      const now = new Date().toISOString();
      const pr = s[STORE_PROJECTS]!.get(projectId);
      pr.onsuccess = () => {
        const meta = pr.result as ProjectMeta | undefined;
        if (meta) s[STORE_PROJECTS]!.put({ ...meta, updated: now });
      };
    });
  }

  async listFiles(projectId: string, prefix?: string): Promise<string[]> {
    const db = await this.openDb();
    const pref = prefix ? normalizePath(prefix) : '';
    const range = pref
      ? IDBKeyRange.bound([projectId, pref], [projectId, `${pref}\uffff`], false, true)
      : IDBKeyRange.bound([projectId, ''], [projectId, '\uffff']);
    return new Promise((resolve, reject) => {
      const out: string[] = [];
      const tx = db.transaction(STORE_FILES, 'readonly');
      tx.onerror = () => reject(tx.error);
      const c = tx.objectStore(STORE_FILES).openCursor(range);
      c.onsuccess = () => {
        const cur = c.result;
        if (!cur) {
          resolve(out.sort());
          return;
        }
        const row = cur.value as FileRow;
        out.push(row.path);
        cur.continue();
      };
    });
  }

  async createRelease(projectId: string, release: ProjectRelease): Promise<void> {
    const row: ReleaseRow = { ...release, projectId };
    await this.dbTx([STORE_RELEASES], 'readwrite', (s) => {
      s[STORE_RELEASES]!.put(row);
    });
  }

  async updateRelease(
    projectId: string,
    version: string,
    patch: Partial<ProjectRelease>,
  ): Promise<void> {
    const db = await this.openDb();
    const key = [projectId, version];
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_RELEASES, 'readwrite');
      tx.onerror = () => reject(tx.error);
      tx.oncomplete = () => resolve();
      const store = tx.objectStore(STORE_RELEASES);
      const req = store.get(key);
      req.onsuccess = () => {
        const existing = req.result as ReleaseRow | undefined;
        if (!existing) {
          reject(new Error(`Release ${version} not found for project ${projectId}`));
          return;
        }
        store.put({ ...existing, ...patch, projectId, version });
      };
      req.onerror = () => reject(req.error);
    });
  }

  async listReleases(projectId: string): Promise<ProjectRelease[]> {
    const db = await this.openDb();
    const range = IDBKeyRange.bound([projectId, ''], [projectId, '\uffff']);
    return new Promise((resolve, reject) => {
      const out: ProjectRelease[] = [];
      const tx = db.transaction(STORE_RELEASES, 'readonly');
      tx.onerror = () => reject(tx.error);
      const c = tx.objectStore(STORE_RELEASES).openCursor(range);
      c.onsuccess = () => {
        const cur = c.result;
        if (!cur) {
          resolve(out.sort((a, b) => b.version.localeCompare(a.version)));
          return;
        }
        const row = cur.value as ReleaseRow;
        const { projectId: _pid, ...rest } = row;
        void _pid;
        out.push(rest);
        cur.continue();
      };
    });
  }

  async getSyncShas(projectId: string): Promise<Record<string, string>> {
    const db = await this.openDb();
    const range = IDBKeyRange.bound([projectId, ''], [projectId, '\uffff']);
    return new Promise((resolve, reject) => {
      const out: Record<string, string> = {};
      const tx = db.transaction(STORE_SYNC_SHAS, 'readonly');
      tx.onerror = () => reject(tx.error);
      const c = tx.objectStore(STORE_SYNC_SHAS).openCursor(range);
      c.onsuccess = () => {
        const cur = c.result;
        if (!cur) {
          resolve(out);
          return;
        }
        const row = cur.value as SyncShaRow;
        out[row.path] = row.sha;
        cur.continue();
      };
    });
  }

  async setSyncShas(projectId: string, shas: Record<string, string>): Promise<void> {
    const db = await this.openDb();
    const range = IDBKeyRange.bound([projectId, ''], [projectId, '\uffff']);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_SYNC_SHAS, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('setSyncShas failed'));
      const store = tx.objectStore(STORE_SYNC_SHAS);
      const c = store.openCursor(range);
      c.onerror = () => reject(c.error ?? new Error('setSyncShas cursor'));
      c.onsuccess = () => {
        const cur = c.result;
        if (cur) {
          cur.delete();
          cur.continue();
        } else {
          for (const [path, sha] of Object.entries(shas)) {
            const p = normalizePath(path);
            store.put({ projectId, path: p, sha } satisfies SyncShaRow);
          }
        }
      };
    });
  }
}

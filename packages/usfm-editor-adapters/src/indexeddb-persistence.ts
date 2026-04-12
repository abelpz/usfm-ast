import type { PersistenceAdapter } from '@usfm-tools/editor-core';

const DB_NAME = 'usfm-editor-ast';
const STORE = 'kv';
const VERSION = 1;

/**
 * Browser IndexedDB persistence (PWA / web). Opens lazily; `ready` is true after first successful open.
 */
export class IndexedDBPersistenceAdapter implements PersistenceAdapter {
  private db: IDBDatabase | null = null;
  private opening: Promise<void> | null = null;
  readonly ready: boolean;

  constructor() {
    this.ready = typeof indexedDB !== 'undefined';
    if (this.ready) {
      this.opening = this.open();
    }
  }

  private async open(): Promise<void> {
    if (this.db) return;
    this.db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE)) {
          d.createObjectStore(STORE);
        }
      };
    });
  }

  private async ensure(): Promise<IDBDatabase> {
    if (!this.ready) throw new Error('IndexedDB not available');
    await this.opening;
    if (!this.db) await this.open();
    return this.db!;
  }

  async save(key: string, data: Uint8Array | string): Promise<void> {
    const db = await this.ensure();
    const payload =
      typeof data === 'string' ? data : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).put(payload, key);
    });
  }

  async load(key: string): Promise<Uint8Array | string | null> {
    const db = await this.ensure();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      tx.onerror = () => reject(tx.error);
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => {
        const v = req.result;
        if (v === undefined) resolve(null);
        else if (typeof v === 'string') resolve(v);
        else if (v instanceof Uint8Array) resolve(v);
        else resolve(new Uint8Array(v as ArrayBuffer));
      };
    });
  }

  async delete(key: string): Promise<void> {
    const db = await this.ensure();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).delete(key);
    });
  }

  async list(prefix: string): Promise<string[]> {
    const db = await this.ensure();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      tx.onerror = () => reject(tx.error);
      const out: string[] = [];
      const req = tx.objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) {
          resolve(out);
          return;
        }
        const k = String(cur.key);
        if (k.startsWith(prefix)) out.push(k);
        cur.continue();
      };
    });
  }
}

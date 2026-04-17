/**
 * Filesystem-backed `SyncQueue` for the Tauri desktop shell.
 *
 * Each pending sync operation is stored as an individual JSON file:
 *
 *   {basePath}/
 *     {id}.json   – SyncOperation
 *
 * This makes each operation independently readable, writable, and deletable
 * without locking a shared database.
 *
 * Exponential back-off schedule (retryCount → delay):
 *   0 → 30 s, 1 → 2 min, 2 → 10 min, 3 → 30 min, 4+ → 2 h
 *
 * `basePath` defaults to `"usfm-editor/sync-queue"`.
 */
import type { SyncOperation, SyncQueue } from '@usfm-tools/types';
import type { FileSystemAdapter } from '../interfaces/fs-adapter';
import { readJsonOrNull, writeJson } from './fs-helpers';

export const RETRY_DELAYS_MS = [
  30_000,    // 30 s
  120_000,   // 2 min
  600_000,   // 10 min
  1_800_000, // 30 min
  7_200_000, // 2 h
];

function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export class FsSyncQueue implements SyncQueue {
  private readonly fs: FileSystemAdapter;
  private readonly base: string;

  /**
   * @param fs       `FileSystemAdapter` (paths relative to AppData).
   * @param basePath Root folder for the queue (default `"usfm-editor/sync-queue"`).
   */
  constructor(fs: FileSystemAdapter, basePath = 'usfm-editor/sync-queue') {
    this.fs = fs;
    this.base = basePath;
  }

  private opPath(id: string): string {
    return `${this.base}/${id}.json`;
  }

  /** Read all operations from disk, sorted by `createdAt` ascending. */
  private async readAll(): Promise<SyncOperation[]> {
    let entries: string[];
    try {
      entries = await this.fs.listDir(this.base);
    } catch {
      return [];
    }
    const ops: SyncOperation[] = [];
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      const op = await readJsonOrNull<SyncOperation>(this.fs, `${this.base}/${entry}`);
      if (op) ops.push(op);
    }
    return ops.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async enqueue(
    op: Omit<SyncOperation, 'id' | 'createdAt' | 'retryCount' | 'retryAfter'>,
  ): Promise<string> {
    const full: SyncOperation = {
      ...op,
      id: uuid(),
      createdAt: new Date().toISOString(),
      retryCount: 0,
      retryAfter: null,
    };
    await writeJson(this.fs, this.opPath(full.id), full);
    return full.id;
  }

  async peek(): Promise<SyncOperation | null> {
    const all = await this.readAll();
    const now = new Date().toISOString();
    return all.find((op) => op.retryAfter === null || op.retryAfter <= now) ?? null;
  }

  async dequeue(id: string): Promise<void> {
    try {
      await this.fs.remove(this.opPath(id));
    } catch {
      // Already removed — ignore.
    }
  }

  async listPending(projectId?: string): Promise<SyncOperation[]> {
    const all = await this.readAll();
    if (!projectId) return all;
    return all.filter((op) => op.projectId === projectId);
  }

  async recordRetry(id: string): Promise<void> {
    const op = await readJsonOrNull<SyncOperation>(this.fs, this.opPath(id));
    if (!op) return;
    const delayMs = RETRY_DELAYS_MS[Math.min(op.retryCount, RETRY_DELAYS_MS.length - 1)]!;
    const retryAfter = new Date(Date.now() + delayMs).toISOString();
    await writeJson(this.fs, this.opPath(id), {
      ...op,
      retryCount: op.retryCount + 1,
      retryAfter,
    });
  }

  async clearProject(projectId: string): Promise<void> {
    const all = await this.readAll();
    for (const op of all) {
      if (op.projectId === projectId) {
        await this.dequeue(op.id);
      }
    }
  }
}

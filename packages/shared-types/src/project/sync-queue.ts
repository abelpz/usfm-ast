/**
 * Offline sync queue contracts.
 *
 * All DCS mutations (file changes, release publishes, metadata updates) are
 * routed through a `SyncQueue` that persists across app restarts. A
 * `SyncScheduler` drains the queue when the device is online.
 *
 * This design allows translators to continue editing while offline; changes
 * are committed to the remote repository as soon as connectivity is restored.
 */

export type SyncOperationType = 'file-change' | 'release-publish' | 'meta-update';

/** A durable sync operation waiting to be applied to the remote. */
export interface SyncOperation {
  /** Unique identifier (UUID v4). */
  id: string;
  projectId: string;
  type: SyncOperationType;
  /** Arbitrary JSON payload specific to the operation type. */
  payload: unknown;
  /** ISO 8601 — when the operation was enqueued. */
  createdAt: string;
  /** Number of times delivery has been attempted (excluding current). */
  retryCount: number;
  /**
   * ISO 8601 — when the next attempt may be made.
   * Implements exponential back-off between retries.
   * `null` means it's eligible for immediate delivery.
   */
  retryAfter: string | null;
  /** Human-readable description for status UI. */
  description?: string;
}

/** Payload for a `file-change` operation. */
export interface FileChangeSyncPayload {
  path: string;
  /** Full UTF-8 file content. */
  content: string;
  /** Commit message. */
  message: string;
}

/** Payload for a `release-publish` operation. */
export interface ReleasePublishSyncPayload {
  version: string;
  title?: string;
}

/** Payload for a `meta-update` operation. */
export interface MetaUpdateSyncPayload {
  patch: Record<string, unknown>;
}

/**
 * Persistent FIFO queue for offline sync operations.
 *
 * Operations are stored in `ProjectStorage` (survives app restarts).
 * Implementations: IndexedDB on web, SQLite on Tauri/Capacitor.
 */
export interface SyncQueue {
  /** Add an operation to the tail of the queue. */
  enqueue(op: Omit<SyncOperation, 'id' | 'createdAt' | 'retryCount' | 'retryAfter'>): Promise<string>;

  /** Inspect the next eligible operation without removing it. */
  peek(): Promise<SyncOperation | null>;

  /** Remove a delivered (or permanently failed) operation. */
  dequeue(id: string): Promise<void>;

  /** List all pending operations for a project (or all projects). */
  listPending(projectId?: string): Promise<SyncOperation[]>;

  /** Increment retry count and set `retryAfter` (exponential back-off). */
  recordRetry(id: string): Promise<void>;

  /** Clear all operations for a project (e.g. on project delete). */
  clearProject(projectId: string): Promise<void>;
}

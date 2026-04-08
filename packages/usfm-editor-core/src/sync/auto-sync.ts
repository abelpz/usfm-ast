/**
 * Debounced + periodic sync scheduler (offline-safe).
 */

import type { SyncEngine, SyncResult } from './types';

export interface AutoSyncOptions {
  intervalMs?: number;
  debounceMs?: number;
  onConflict?: (result: SyncResult) => void;
  onError?: (error: unknown) => void;
}

export class AutoSyncScheduler {
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private unsub: (() => void) | null = null;

  constructor(
    private readonly engine: SyncEngine,
    private readonly options?: AutoSyncOptions
  ) {}

  start(): void {
    this.stop();
    const intervalMs = this.options?.intervalMs ?? 30_000;
    this.intervalTimer = setInterval(() => {
      void this.syncNow().catch((e) => this.options?.onError?.(e));
    }, intervalMs);
    this.unsub = this.engine.onConnectivityChange((online) => {
      if (online) void this.syncNow().catch((e) => this.options?.onError?.(e));
    });
  }

  stop(): void {
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    this.intervalTimer = null;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
    this.unsub?.();
    this.unsub = null;
  }

  notifyEdit(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    const debounceMs = this.options?.debounceMs ?? 5000;
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.syncNow().catch((e) => this.options?.onError?.(e));
    }, debounceMs);
  }

  async syncNow(): Promise<SyncResult> {
    const result = await this.engine.sync();
    if (result.conflicts.length > 0) {
      this.options?.onConflict?.(result);
    }
    return result;
  }
}

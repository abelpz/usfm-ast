/**
 * SyncScheduler — drains the `SyncQueue` when the device is online.
 *
 * Lifecycle:
 *   1. Call `start()` once (on app mount / PlatformProvider ready).
 *   2. The scheduler subscribes to the `NetworkAdapter` and polls the queue.
 *   3. Call `stop()` on unmount to clean up listeners.
 *
 * Delivery:
 *   - Operations are attempted in FIFO order.
 *   - On success, the operation is dequeued.
 *   - On failure, `recordRetry()` is called for exponential back-off.
 *   - Permanently failed operations (retryCount ≥ `maxRetries`) are moved
 *     to an error state and removed from the queue; the UI is notified via
 *     `onPermanentFailure`.
 */
import type { SyncOperation, SyncQueue } from '@usfm-tools/types';

/**
 * Minimal network-awareness interface (structurally compatible with
 * `NetworkAdapter` from `@usfm-tools/platform-adapters`).
 */
interface NetworkLike {
  isOnline(): boolean;
  onStatusChange(cb: (online: boolean) => void): () => void;
}

export type SyncDeliveryFn = (op: SyncOperation) => Promise<void>;

export interface SyncSchedulerOptions {
  queue: SyncQueue;
  network: NetworkLike;
  deliver: SyncDeliveryFn;
  /** Polling interval while online (ms). Default: 5 s. */
  pollIntervalMs?: number;
  /** Max delivery attempts before an operation is abandoned. Default: 10. */
  maxRetries?: number;
  /** Called when an operation permanently fails (retries exhausted). */
  onPermanentFailure?: (op: SyncOperation, error: Error) => void;
  /** Called after each successful delivery. */
  onDelivered?: (op: SyncOperation) => void;
}

export class SyncScheduler {
  private readonly opts: Required<
    Omit<SyncSchedulerOptions, 'onPermanentFailure' | 'onDelivered'>
  > &
    Pick<SyncSchedulerOptions, 'onPermanentFailure' | 'onDelivered'>;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribeNetwork: (() => void) | null = null;
  private running = false;
  private busy = false;

  constructor(opts: SyncSchedulerOptions) {
    this.opts = {
      pollIntervalMs: 5_000,
      maxRetries: 10,
      ...opts,
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    this.unsubscribeNetwork = this.opts.network.onStatusChange((online) => {
      if (online) {
        // Drain queue immediately on reconnect.
        void this.drain();
      }
    });

    // Initial drain if already online.
    if (this.opts.network.isOnline()) {
      void this.drain();
    }

    this.schedulePoll();
  }

  stop(): void {
    this.running = false;
    this.unsubscribeNetwork?.();
    this.unsubscribeNetwork = null;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** Manually trigger a drain (e.g. after the user saves a file). */
  async triggerDrain(): Promise<void> {
    if (!this.opts.network.isOnline()) return;
    await this.drain();
  }

  private schedulePoll(): void {
    if (!this.running) return;
    this.timer = setTimeout(() => {
      if (this.opts.network.isOnline()) void this.drain();
      this.schedulePoll();
    }, this.opts.pollIntervalMs);
  }

  private async drain(): Promise<void> {
    if (this.busy) return;
    this.busy = true;

    try {
      while (this.running && this.opts.network.isOnline()) {
        const op = await this.opts.queue.peek();
        if (!op) break;

        try {
          await this.opts.deliver(op);
          await this.opts.queue.dequeue(op.id);
          this.opts.onDelivered?.(op);
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          if (op.retryCount >= this.opts.maxRetries - 1) {
            await this.opts.queue.dequeue(op.id);
            this.opts.onPermanentFailure?.(op, error);
          } else {
            await this.opts.queue.recordRetry(op.id);
          }
          break; // Back off before retrying
        }
      }
    } finally {
      this.busy = false;
    }
  }
}

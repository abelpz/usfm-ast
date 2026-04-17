/**
 * Tests for SyncScheduler with fake timers and mock queue/network.
 */
import type { SyncOperation, SyncQueue } from '@usfm-tools/types';
import { SyncScheduler } from '../src/source-cache/sync-scheduler';

// ---------------------------------------------------------------------------
// Mock SyncQueue
// ---------------------------------------------------------------------------

class MockSyncQueue implements SyncQueue {
  ops: SyncOperation[] = [];
  retried = new Map<string, number>();

  async enqueue(op: Omit<SyncOperation, 'id' | 'createdAt' | 'retryCount' | 'retryAfter'>): Promise<string> {
    const id = `id-${this.ops.length + 1}`;
    this.ops.push({ ...op, id, createdAt: new Date().toISOString(), retryCount: 0, retryAfter: null });
    return id;
  }

  async peek(): Promise<SyncOperation | null> {
    const now = new Date().toISOString();
    return this.ops.find((op) => op.retryAfter === null || op.retryAfter <= now) ?? null;
  }

  async dequeue(id: string): Promise<void> {
    this.ops = this.ops.filter((op) => op.id !== id);
  }

  async listPending(projectId?: string): Promise<SyncOperation[]> {
    return projectId ? this.ops.filter((op) => op.projectId === projectId) : [...this.ops];
  }

  async recordRetry(id: string): Promise<void> {
    const op = this.ops.find((o) => o.id === id);
    if (op) {
      op.retryCount++;
      op.retryAfter = new Date(Date.now() + 30_000).toISOString();
      this.retried.set(id, (this.retried.get(id) ?? 0) + 1);
    }
  }

  async clearProject(projectId: string): Promise<void> {
    this.ops = this.ops.filter((op) => op.projectId !== projectId);
  }
}

// ---------------------------------------------------------------------------
// Mock NetworkAdapter
// ---------------------------------------------------------------------------

function makeNetwork(initialOnline = true) {
  let online = initialOnline;
  const listeners: Array<(online: boolean) => void> = [];

  return {
    isOnline: () => online,
    onStatusChange: (cb: (online: boolean) => void) => {
      listeners.push(cb);
      return () => {
        const i = listeners.indexOf(cb);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
    setOnline: (val: boolean) => {
      online = val;
      listeners.forEach((cb) => cb(val));
    },
    listenerCount: () => listeners.length,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('SyncScheduler — start + online', () => {
  it('drains the queue when started online, calls deliver and dequeues', async () => {
    const queue = new MockSyncQueue();
    await queue.enqueue({ projectId: 'p1', type: 'file-change', payload: {} });
    const network = makeNetwork(true);
    const deliver = jest.fn().mockResolvedValue(undefined);

    const scheduler = new SyncScheduler({ queue, network, deliver });
    scheduler.start();

    // Flush promises so drain() can run.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(deliver).toHaveBeenCalledTimes(1);
    expect(queue.ops).toHaveLength(0);

    scheduler.stop();
  });

  it('calls onDelivered after successful delivery', async () => {
    const queue = new MockSyncQueue();
    await queue.enqueue({ projectId: 'p1', type: 'file-change', payload: {} });
    const network = makeNetwork(true);
    const deliver = jest.fn().mockResolvedValue(undefined);
    const onDelivered = jest.fn();

    const scheduler = new SyncScheduler({ queue, network, deliver, onDelivered });
    scheduler.start();

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(onDelivered).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });
});

describe('SyncScheduler — delivery failure', () => {
  it('calls recordRetry on delivery failure', async () => {
    const queue = new MockSyncQueue();
    await queue.enqueue({ projectId: 'p1', type: 'file-change', payload: {} });
    const network = makeNetwork(true);
    const deliver = jest.fn().mockRejectedValue(new Error('network error'));

    const scheduler = new SyncScheduler({ queue, network, deliver, maxRetries: 5 });
    scheduler.start();

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(queue.retried.size).toBeGreaterThan(0);
    // Op should still be in the queue (not dequeued) after first failure.
    expect(queue.ops).toHaveLength(1);
    scheduler.stop();
  });

  it('calls onPermanentFailure and dequeues when retries are exhausted', async () => {
    const queue = new MockSyncQueue();
    const id = await queue.enqueue({ projectId: 'p1', type: 'file-change', payload: {} });
    // Set retryCount to maxRetries - 1 so next failure triggers permanent failure.
    const op = queue.ops.find((o) => o.id === id)!;
    op.retryCount = 9;

    const network = makeNetwork(true);
    const deliver = jest.fn().mockRejectedValue(new Error('permanent error'));
    const onPermanentFailure = jest.fn();

    const scheduler = new SyncScheduler({
      queue,
      network,
      deliver,
      maxRetries: 10,
      onPermanentFailure,
    });
    scheduler.start();

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(onPermanentFailure).toHaveBeenCalledTimes(1);
    expect(queue.ops).toHaveLength(0);
    scheduler.stop();
  });
});

describe('SyncScheduler — offline behaviour', () => {
  it('does not drain queue when offline', async () => {
    const queue = new MockSyncQueue();
    await queue.enqueue({ projectId: 'p1', type: 'file-change', payload: {} });
    const network = makeNetwork(false);
    const deliver = jest.fn().mockResolvedValue(undefined);

    const scheduler = new SyncScheduler({ queue, network, deliver });
    scheduler.start();

    await Promise.resolve();
    await Promise.resolve();

    expect(deliver).not.toHaveBeenCalled();
    scheduler.stop();
  });

  it('triggers drain when network comes back online', async () => {
    const queue = new MockSyncQueue();
    await queue.enqueue({ projectId: 'p1', type: 'file-change', payload: {} });
    const network = makeNetwork(false);
    const deliver = jest.fn().mockResolvedValue(undefined);

    const scheduler = new SyncScheduler({ queue, network, deliver });
    scheduler.start();

    await Promise.resolve();
    expect(deliver).not.toHaveBeenCalled();

    // Simulate going online.
    network.setOnline(true);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(deliver).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });
});

describe('SyncScheduler — stop', () => {
  it('clears timer and unsubscribes network listener', () => {
    const queue = new MockSyncQueue();
    const network = makeNetwork(false);
    const deliver = jest.fn();

    const scheduler = new SyncScheduler({ queue, network, deliver });
    scheduler.start();
    expect(network.listenerCount()).toBe(1);

    scheduler.stop();
    expect(network.listenerCount()).toBe(0);
  });
});

describe('SyncScheduler — triggerDrain', () => {
  it('drains immediately when online', async () => {
    const queue = new MockSyncQueue();
    await queue.enqueue({ projectId: 'p1', type: 'file-change', payload: {} });
    const network = makeNetwork(true);
    const deliver = jest.fn().mockResolvedValue(undefined);

    const scheduler = new SyncScheduler({ queue, network, deliver, pollIntervalMs: 60_000 });
    scheduler.start();

    // Consume the initial drain.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Add another op and trigger manually.
    await queue.enqueue({ projectId: 'p1', type: 'meta-update', payload: {} });
    await scheduler.triggerDrain();

    expect(deliver).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it('is a no-op when offline', async () => {
    const queue = new MockSyncQueue();
    await queue.enqueue({ projectId: 'p1', type: 'file-change', payload: {} });
    const network = makeNetwork(false);
    const deliver = jest.fn();

    const scheduler = new SyncScheduler({ queue, network, deliver });
    scheduler.start();

    await scheduler.triggerDrain();
    expect(deliver).not.toHaveBeenCalled();
    scheduler.stop();
  });
});

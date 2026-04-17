/**
 * Unit tests for FsSyncQueue using an in-memory FileSystemAdapter mock.
 */
import { FsSyncQueue, RETRY_DELAYS_MS } from '../src/tauri/fs-sync-queue';
import type { FileSystemAdapter } from '../src/interfaces/fs-adapter';

// ---------------------------------------------------------------------------
// In-memory FileSystemAdapter mock
// ---------------------------------------------------------------------------
class MemFs implements FileSystemAdapter {
  readonly store = new Map<string, string>();

  private norm(path: string) {
    return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
  }

  async readFile(path: string): Promise<Uint8Array> {
    return new TextEncoder().encode(await this.readText(path));
  }
  async writeFile(path: string, data: Uint8Array): Promise<void> {
    this.store.set(this.norm(path), new TextDecoder().decode(data));
  }
  async readText(path: string): Promise<string> {
    const v = this.store.get(this.norm(path));
    if (v === undefined) throw new Error(`ENOENT: ${path}`);
    return v;
  }
  async writeText(path: string, text: string): Promise<void> {
    this.store.set(this.norm(path), text);
  }
  async exists(path: string): Promise<boolean> {
    return this.store.has(this.norm(path));
  }
  async mkdir(): Promise<void> { /* no-op */ }
  async listDir(path: string): Promise<string[]> {
    const prefix = this.norm(path) + '/';
    const children = new Set<string>();
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        const segment = key.slice(prefix.length).split('/')[0];
        if (segment) children.add(segment);
      }
    }
    if (children.size === 0) throw new Error(`ENOENT: ${path}`);
    return [...children].sort();
  }
  async remove(path: string, recursive = false): Promise<void> {
    const norm = this.norm(path);
    if (recursive) {
      const prefix = norm + '/';
      for (const key of [...this.store.keys()]) {
        if (key === norm || key.startsWith(prefix)) this.store.delete(key);
      }
    } else {
      if (!this.store.has(norm)) throw new Error(`ENOENT: ${path}`);
      this.store.delete(norm);
    }
  }
  async copy(src: string, dest: string): Promise<void> {
    this.store.set(this.norm(dest), await this.readText(src));
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('FsSyncQueue', () => {
  let fs: MemFs;
  let queue: FsSyncQueue;

  beforeEach(() => {
    fs = new MemFs();
    queue = new FsSyncQueue(fs, 'sq');
  });

  it('enqueues an operation and returns an id', async () => {
    const id = await queue.enqueue({
      projectId: 'proj1',
      type: 'file-change',
      payload: { path: 'a.usfm' },
    });
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('peek returns null when queue is empty', async () => {
    expect(await queue.peek()).toBeNull();
  });

  it('peek returns the earliest eligible operation', async () => {
    await queue.enqueue({ projectId: 'p', type: 'file-change', payload: {} });
    const op = await queue.peek();
    expect(op).not.toBeNull();
    expect(op?.projectId).toBe('p');
    expect(op?.retryCount).toBe(0);
  });

  it('dequeue removes the operation', async () => {
    const id = await queue.enqueue({ projectId: 'p', type: 'file-change', payload: {} });
    await queue.dequeue(id);
    expect(await queue.peek()).toBeNull();
  });

  it('dequeue is idempotent (no-op when already removed)', async () => {
    const id = await queue.enqueue({ projectId: 'p', type: 'file-change', payload: {} });
    await queue.dequeue(id);
    await expect(queue.dequeue(id)).resolves.toBeUndefined();
  });

  it('listPending returns all operations', async () => {
    await queue.enqueue({ projectId: 'p1', type: 'file-change', payload: {} });
    await queue.enqueue({ projectId: 'p2', type: 'meta-update', payload: {} });
    const pending = await queue.listPending();
    expect(pending).toHaveLength(2);
  });

  it('listPending filters by projectId', async () => {
    await queue.enqueue({ projectId: 'p1', type: 'file-change', payload: {} });
    await queue.enqueue({ projectId: 'p2', type: 'meta-update', payload: {} });
    const p1 = await queue.listPending('p1');
    expect(p1).toHaveLength(1);
    expect(p1[0]?.projectId).toBe('p1');
  });

  it('listPending returns empty when queue is empty', async () => {
    expect(await queue.listPending()).toEqual([]);
  });

  it('recordRetry increments retryCount and sets retryAfter', async () => {
    const id = await queue.enqueue({ projectId: 'p', type: 'file-change', payload: {} });
    await queue.recordRetry(id);
    const ops = await queue.listPending('p');
    expect(ops[0]?.retryCount).toBe(1);
    expect(ops[0]?.retryAfter).not.toBeNull();
  });

  it('peek skips operations with future retryAfter', async () => {
    const id = await queue.enqueue({ projectId: 'p', type: 'file-change', payload: {} });
    await queue.recordRetry(id);
    // After recording retry, the op has a future retryAfter, so peek should skip it.
    const peeked = await queue.peek();
    expect(peeked).toBeNull();
  });

  it('peek returns operations with null retryAfter over deferred ones', async () => {
    const id1 = await queue.enqueue({ projectId: 'p', type: 'file-change', payload: { path: '1' } });
    await queue.enqueue({ projectId: 'p', type: 'file-change', payload: { path: '2' } });
    // Put id1 into back-off so id2 (null retryAfter) should be returned.
    await queue.recordRetry(id1);
    const peeked = await queue.peek();
    expect(peeked).not.toBeNull();
    expect(peeked?.id).not.toBe(id1);
  });

  it('clearProject removes all ops for a project', async () => {
    await queue.enqueue({ projectId: 'clear-me', type: 'file-change', payload: {} });
    await queue.enqueue({ projectId: 'clear-me', type: 'meta-update', payload: {} });
    await queue.enqueue({ projectId: 'keep', type: 'file-change', payload: {} });
    await queue.clearProject('clear-me');
    expect(await queue.listPending('clear-me')).toHaveLength(0);
    expect(await queue.listPending('keep')).toHaveLength(1);
  });

  it('peek returns the operation sorted by createdAt', async () => {
    const id1 = await queue.enqueue({ projectId: 'p', type: 'file-change', payload: { n: 1 } });
    // Small delay so the second operation gets a later createdAt timestamp.
    await new Promise((r) => setTimeout(r, 5));
    await queue.enqueue({ projectId: 'p', type: 'file-change', payload: { n: 2 } });
    const op = await queue.peek();
    expect(op?.id).toBe(id1);
  });

  it('recordRetry is a no-op for a missing operation', async () => {
    await expect(queue.recordRetry('no-such-id')).resolves.toBeUndefined();
  });

  it('recordRetry uses the correct back-off delays from the schedule', async () => {
    const id = await queue.enqueue({ projectId: 'p', type: 'file-change', payload: {} });

    for (let i = 0; i < RETRY_DELAYS_MS.length; i++) {
      const beforeMs = Date.now();
      await queue.recordRetry(id);
      const afterMs = Date.now();

      const op = (await queue.listPending('p'))[0];
      expect(op).not.toBeUndefined();
      const retryAfterMs = new Date(op!.retryAfter!).getTime();

      const expectedDelay = RETRY_DELAYS_MS[i]!;
      // Allow ±200 ms tolerance for test execution time.
      expect(retryAfterMs).toBeGreaterThanOrEqual(beforeMs + expectedDelay - 200);
      expect(retryAfterMs).toBeLessThanOrEqual(afterMs + expectedDelay + 200);
    }
  });

  it('retryCount delay caps at the last schedule entry (2 h)', async () => {
    const id = await queue.enqueue({ projectId: 'p', type: 'file-change', payload: {} });

    // Advance the retryCount past the end of the schedule.
    const overRetries = RETRY_DELAYS_MS.length + 3;
    for (let i = 0; i < overRetries; i++) {
      await queue.recordRetry(id);
    }

    const op = (await queue.listPending('p'))[0];
    expect(op).not.toBeUndefined();
    expect(op!.retryCount).toBe(overRetries);

    // The delay should be capped at the last entry (2 h = 7_200_000 ms).
    const maxDelay = RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]!;
    const retryAfterMs = new Date(op!.retryAfter!).getTime();
    // Verify it was scheduled at most (now + maxDelay + some tolerance).
    expect(retryAfterMs).toBeLessThanOrEqual(Date.now() + maxDelay + 500);
  });
});

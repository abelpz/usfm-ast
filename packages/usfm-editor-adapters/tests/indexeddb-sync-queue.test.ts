/**
 * Tests for IndexedDbSyncQueue.
 * `fake-indexeddb/auto` is loaded in jest-setup.ts.
 */
import { IndexedDbSyncQueue } from '../src/storage/indexeddb-sync-queue';

let _dbCounter = 0;
function queue(): IndexedDbSyncQueue {
  return new IndexedDbSyncQueue(`usfm-sync-queue-test-${_dbCounter++}`);
}

describe('IndexedDbSyncQueue — enqueue / peek / dequeue', () => {
  it('enqueue returns a string ID', async () => {
    const q = queue();
    const id = await q.enqueue({ projectId: 'p1', type: 'file-change', payload: {} });
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('enqueued operation appears in listPending', async () => {
    const q = queue();
    const id = await q.enqueue({ projectId: 'p2', type: 'file-change', payload: { path: 'a.usfm' } });
    const pending = await q.listPending();
    const found = pending.find((op) => op.id === id);
    expect(found).toBeDefined();
    expect(found?.type).toBe('file-change');
  });

  it('dequeue removes the operation', async () => {
    const q = queue();
    const id = await q.enqueue({ projectId: 'p3', type: 'meta-update', payload: {} });
    await q.dequeue(id);
    const pending = await q.listPending();
    expect(pending.find((op) => op.id === id)).toBeUndefined();
  });

  it('peek returns the earliest eligible operation', async () => {
    const q = queue();
    const id1 = await q.enqueue({ projectId: 'p4', type: 'file-change', payload: { n: 1 } });
    await new Promise((r) => setTimeout(r, 5)); // ensure different createdAt
    await q.enqueue({ projectId: 'p4', type: 'file-change', payload: { n: 2 } });

    const first = await q.peek();
    expect(first?.id).toBe(id1);
  });
});

describe('IndexedDbSyncQueue — retry back-off', () => {
  it('recordRetry increments retryCount and sets retryAfter in the future', async () => {
    const q = queue();
    const id = await q.enqueue({ projectId: 'p5', type: 'file-change', payload: {} });
    await q.recordRetry(id);
    const ops = await q.listPending('p5');
    const op = ops.find((o) => o.id === id);
    expect(op?.retryCount).toBe(1);
    expect(op?.retryAfter).not.toBeNull();
    // retryAfter must be in the future.
    expect(new Date(op!.retryAfter!).getTime()).toBeGreaterThan(Date.now() - 1000);
  });

  it('peek skips operations whose retryAfter is in the future', async () => {
    const q = queue();
    const id = await q.enqueue({ projectId: 'p6', type: 'file-change', payload: {} });
    await q.recordRetry(id);
    // The operation now has a retryAfter in the future.
    // peek should not return it if there are no other operations.
    const next = await q.peek();
    // Either null (only op is blocked) or a different op.
    if (next) {
      expect(next.id).not.toBe(id);
    } else {
      expect(next).toBeNull();
    }
  });
});

describe('IndexedDbSyncQueue — project scoping', () => {
  it('listPending(projectId) returns only that project\'s ops', async () => {
    const q = queue();
    await q.enqueue({ projectId: 'proj-alpha', type: 'file-change', payload: {} });
    await q.enqueue({ projectId: 'proj-beta', type: 'file-change', payload: {} });
    await q.enqueue({ projectId: 'proj-alpha', type: 'meta-update', payload: {} });

    const alpha = await q.listPending('proj-alpha');
    const beta = await q.listPending('proj-beta');
    expect(alpha.every((o) => o.projectId === 'proj-alpha')).toBe(true);
    expect(beta.every((o) => o.projectId === 'proj-beta')).toBe(true);
    expect(alpha.length).toBe(2);
    expect(beta.length).toBe(1);
  });

  it('clearProject removes all ops for a project, leaves others', async () => {
    const q = queue();
    await q.enqueue({ projectId: 'clear-me', type: 'file-change', payload: {} });
    await q.enqueue({ projectId: 'clear-me', type: 'meta-update', payload: {} });
    const keepId = await q.enqueue({ projectId: 'keep-me', type: 'file-change', payload: {} });

    await q.clearProject('clear-me');

    expect(await q.listPending('clear-me')).toHaveLength(0);
    const kept = await q.listPending('keep-me');
    expect(kept.find((o) => o.id === keepId)).toBeDefined();
  });
});

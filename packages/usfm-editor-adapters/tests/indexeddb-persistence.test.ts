import { IndexedDBPersistenceAdapter } from '../src/indexeddb-persistence';

describe('IndexedDBPersistenceAdapter', () => {
  it('save, load, list, delete round-trip', async () => {
    const db = new IndexedDBPersistenceAdapter();
    await db.save('doc/a', 'hello');
    expect(await db.load('doc/a')).toBe('hello');
    const keys = await db.list('doc/');
    expect(keys).toContain('doc/a');
    await db.delete('doc/a');
    expect(await db.load('doc/a')).toBeNull();
  });

  it('stores Uint8Array', async () => {
    const db = new IndexedDBPersistenceAdapter();
    const u8 = new Uint8Array([1, 2, 3]);
    await db.save('bin/x', u8);
    const out = await db.load('bin/x');
    expect(out).toBeInstanceOf(Uint8Array);
    expect([...(out as Uint8Array)]).toEqual([1, 2, 3]);
  });
});

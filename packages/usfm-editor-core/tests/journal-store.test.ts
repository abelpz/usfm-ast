import {
  DefaultJournalStore,
  DocumentStore,
  MemoryJournalStore,
  MemoryPersistenceAdapter,
  OperationJournal,
  type JournalEntry,
} from '../dist';
import { contentOpsForVerseEdit, SAMPLE_TWO_VERSE_USFM } from './test-merge-helpers';

describe('DefaultJournalStore', () => {
  it('round-trips entries, vector clock, meta, snapshots', async () => {
    const mem = new MemoryPersistenceAdapter();
    const store = new DefaultJournalStore(mem);
    const entries: JournalEntry[] = [
      {
        id: '1',
        userId: 'u',
        timestamp: 1,
        sequence: 1,
        vectorClock: { u: 1 },
        chapter: 1,
        layer: 'content',
        operations: [],
        baseSnapshotId: 'head',
      },
    ];
    await store.saveEntries(entries);
    await store.saveVectorClock({ u: 2 });
    await store.saveMeta({ baseSnapshotId: 'snap1' });
    await store.saveSnapshot('snap1', { type: 'USJ', version: '3.1', content: [] });

    expect(await store.loadEntries()).toEqual(entries);
    expect(await store.loadVectorClock()).toEqual({ u: 2 });
    expect(await store.loadMeta()).toEqual({ baseSnapshotId: 'snap1' });
    expect(await store.loadSnapshot('snap1')).toEqual({
      type: 'USJ',
      version: '3.1',
      content: [],
    });
  });

  it('uses journal/entries.json and journal/vector.json keys', async () => {
    const mem = new MemoryPersistenceAdapter();
    const store = new DefaultJournalStore(mem);
    await store.saveEntries([]);
    await store.saveVectorClock({});
    const keys = await mem.list('journal/');
    expect(keys.some((k) => k.includes('entries.json'))).toBe(true);
    expect(keys.some((k) => k.includes('vector.json'))).toBe(true);
  });
});

describe('OperationJournal + JournalStore', () => {
  it('append with mock store persists 5 entries', async () => {
    const backing = new MemoryJournalStore();
    const j = new OperationJournal(backing, 'me');
    for (let i = 0; i < 5; i++) {
      j.append(1, 'content', contentOpsForVerseEdit(1, 1, `t${i}`));
    }
    const loaded = await backing.loadEntries();
    expect(loaded.length).toBe(5);
  });

  it('append when saveEntries throws does not crash', async () => {
    const badStore = new MemoryJournalStore();
    badStore.saveEntries = async () => {
      throw new Error('disk full');
    };
    const j = new OperationJournal(badStore, 'me');
    expect(() => j.append(1, 'content', contentOpsForVerseEdit(1, 1, 'a'))).not.toThrow();
  });

  it('undefined backing uses in-memory journal without errors', () => {
    const j = new OperationJournal(undefined, 'me');
    j.append(1, 'content', []);
    expect(j.getAll().length).toBe(1);
  });

  it('hydrateDocumentStore round-trip with MemoryJournalStore', async () => {
    const backing = new MemoryJournalStore();
    const j = new OperationJournal(backing, 'me');
    const doc = new DocumentStore({ silentConsole: true });
    doc.loadUSFM(SAMPLE_TWO_VERSE_USFM);
    j.append(1, 'content', contentOpsForVerseEdit(1, 1, 'Bye.'));
    await backing.saveEntries(j.getAll());
    await backing.saveVectorClock(j.getVectorClock());

    const j2 = new OperationJournal(backing, 'me');
    await j2.loadFromDisk();
    const doc2 = new DocumentStore({ silentConsole: true });
    doc2.loadUSFM(SAMPLE_TWO_VERSE_USFM);
    await j2.hydrateDocumentStore(doc2);
    expect(doc2.toUSFM(1)).toContain('Bye.');
  });
});

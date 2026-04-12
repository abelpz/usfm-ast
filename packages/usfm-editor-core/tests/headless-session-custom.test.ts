import {
  DefaultSyncEngine,
  HeadlessCollabSession,
  MemoryJournalStore,
  OTMergeStrategy,
  RealtimeSyncEngine,
  type MergeStrategy,
  type Operation,
} from '../dist';
import { contentOpsForVerseEdit, SAMPLE_TWO_VERSE_USFM } from './test-merge-helpers';

class NoopMergeStrategy implements MergeStrategy {
  merge(localPending: Operation[], remoteOps: Operation[]) {
    return { serverPrime: remoteOps, clientPrime: localPending };
  }
}

describe('HeadlessCollabSession options', () => {
  it('uses custom syncEngine when provided', () => {
    const custom = new DefaultSyncEngine();
    const s = new HeadlessCollabSession({ userId: 'u', syncEngine: custom });
    expect(s.sync).toBe(custom);
    expect(s.sync instanceof RealtimeSyncEngine).toBe(false);
  });

  it('does not instantiate RealtimeSyncEngine when syncEngine is custom', () => {
    const s = new HeadlessCollabSession({
      userId: 'u',
      syncEngine: new DefaultSyncEngine(),
    });
    expect(s.sync).toBeInstanceOf(DefaultSyncEngine);
  });

  it('forwards mergeStrategy to RealtimeSyncEngine (noop: remote wins on concurrent setText)', () => {
    const s = new HeadlessCollabSession({
      userId: 'u',
      mergeStrategy: new NoopMergeStrategy(),
    });
    expect(s.sync).toBeInstanceOf(RealtimeSyncEngine);
    s.loadUSFM(SAMPLE_TWO_VERSE_USFM);
    const rt = s.sync as RealtimeSyncEngine;
    s.applyContentOperations(contentOpsForVerseEdit(1, 1, 'LOCAL'));
    const entry = {
      id: 'e1',
      userId: 'peer',
      timestamp: 1,
      sequence: 1,
      vectorClock: { peer: 1 },
      chapter: 1,
      layer: 'content' as const,
      operations: contentOpsForVerseEdit(1, 1, 'REMOTE'),
      baseSnapshotId: 'head',
    };
    rt.applyRemoteJournalEntry(entry);
    expect(s.store.toUSFM(1)).toContain('REMOTE');
  });

  it('forwards journalStore: writes go through store', async () => {
    const backing = new MemoryJournalStore();
    let saveCalls = 0;
    const origSave = backing.saveEntries.bind(backing);
    backing.saveEntries = async (entries) => {
      saveCalls++;
      return origSave(entries);
    };
    const s = new HeadlessCollabSession({ userId: 'u', journalStore: backing });
    s.loadUSFM(SAMPLE_TWO_VERSE_USFM);
    s.applyContentOperations(contentOpsForVerseEdit(1, 1, 'X'));
    await new Promise((r) => setTimeout(r, 10));
    expect(saveCalls).toBeGreaterThan(0);
  });

  it('defaults match OTMergeStrategy behavior for remote apply', () => {
    const withDefault = new HeadlessCollabSession({ userId: 'a' });
    const withOt = new HeadlessCollabSession({
      userId: 'b',
      mergeStrategy: new OTMergeStrategy(),
    });
    const usfm = SAMPLE_TWO_VERSE_USFM;
    withDefault.loadUSFM(usfm);
    withOt.loadUSFM(usfm);
    const entry = {
      id: 'e',
      userId: 'p',
      timestamp: 1,
      sequence: 1,
      vectorClock: { p: 1 },
      chapter: 1,
      layer: 'content' as const,
      operations: contentOpsForVerseEdit(1, 1, 'R'),
      baseSnapshotId: 'head',
    };
    const ra = (withDefault.sync as RealtimeSyncEngine).applyRemoteJournalEntry({ ...entry, id: 'e1' });
    const rb = (withOt.sync as RealtimeSyncEngine).applyRemoteJournalEntry({ ...entry, id: 'e2' });
    expect(ra.conflict).toEqual(rb.conflict);
    expect(JSON.stringify(withDefault.store.getFullUSJ())).toBe(JSON.stringify(withOt.store.getFullUSJ()));
  });
});

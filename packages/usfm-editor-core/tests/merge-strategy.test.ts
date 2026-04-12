import {
  DocumentStore,
  JournalMergeSyncEngine,
  OperationJournal,
  OTMergeStrategy,
  transformOpLists,
  contentOnly,
  type MergeStrategy,
  type Operation,
} from '../dist';
import { SAMPLE_TWO_VERSE_USFM, contentOpsForVerseEdit } from './test-merge-helpers';

class NoopMergeStrategy implements MergeStrategy {
  merge(localPending: Operation[], remoteOps: Operation[]) {
    return { serverPrime: remoteOps, clientPrime: localPending };
  }
}

class SpyMergeStrategy implements MergeStrategy {
  calls: { local: Operation[]; remote: Operation[] }[] = [];
  merge(localPending: Operation[], remoteOps: Operation[]) {
    this.calls.push({ local: [...localPending], remote: [...remoteOps] });
    return transformOpLists(localPending, remoteOps);
  }
}

describe('OTMergeStrategy', () => {
  it('matches transformOpLists for OT test vectors', () => {
    const strategy = new OTMergeStrategy();
    const server: Operation[] = [
      { type: 'insertNode', path: { chapter: 1, indices: [0, 0] }, node: { tag: 'a' } },
    ];
    const client: Operation[] = [
      { type: 'insertNode', path: { chapter: 1, indices: [0, 0] }, node: { tag: 'b' } },
    ];
    expect(strategy.merge(client, server)).toEqual(transformOpLists(client, server));
  });
});

describe('JournalMergeSyncEngine mergeStrategy', () => {
  it('NoopMergeStrategy applies remote ops unmodified; local pending unchanged', () => {
    const store = new DocumentStore({ silentConsole: true });
    store.loadUSFM(SAMPLE_TWO_VERSE_USFM);
    const journal = new OperationJournal(undefined, 'remote');
    const localPending = contentOpsForVerseEdit(1, 1, 'LOCAL');
    const remoteOps = contentOpsForVerseEdit(1, 1, 'REMOTE');
    const eng = new JournalMergeSyncEngine({
      journal,
      store,
      getLocalPending: () => localPending,
      mergeStrategy: new NoopMergeStrategy(),
    });
    const entry = {
      id: 'e1',
      userId: 'u',
      timestamp: 1,
      sequence: 1,
      vectorClock: { u: 1 },
      chapter: 1,
      layer: 'content' as const,
      operations: remoteOps,
      baseSnapshotId: 'head',
    };
    const { conflict, clientPrime } = eng.applyRemoteJournalEntry(entry);
    expect(conflict).toBeNull();
    expect(clientPrime).toEqual(localPending);
    expect(store.toUSFM(1)).toContain('REMOTE');
  });

  it('default undefined mergeStrategy behaves like OTMergeStrategy', () => {
    const remoteOps = contentOpsForVerseEdit(1, 1, 'R');
    const e1 = {
      id: 'a',
      userId: 'u',
      timestamp: 1,
      sequence: 1,
      vectorClock: { u: 1 },
      chapter: 1,
      layer: 'content' as const,
      operations: remoteOps,
      baseSnapshotId: 'head',
    };
    const e2 = { ...e1, id: 'b' };
    const sa = new DocumentStore({ silentConsole: true });
    sa.loadUSFM(SAMPLE_TWO_VERSE_USFM);
    const sb = new DocumentStore({ silentConsole: true });
    sb.loadUSFM(SAMPLE_TWO_VERSE_USFM);
    const ja = new JournalMergeSyncEngine({
      journal: new OperationJournal(undefined, 'ja'),
      store: sa,
      getLocalPending: () => [],
    });
    const jb = new JournalMergeSyncEngine({
      journal: new OperationJournal(undefined, 'jb'),
      store: sb,
      getLocalPending: () => [],
      mergeStrategy: new OTMergeStrategy(),
    });
    const ra = ja.applyRemoteJournalEntry(e1);
    const rb = jb.applyRemoteJournalEntry(e2);
    expect(ra.conflict).toEqual(rb.conflict);
    expect(ra.clientPrime).toEqual(rb.clientPrime);
    expect(JSON.stringify(sa.getFullUSJ())).toBe(JSON.stringify(sb.getFullUSJ()));
  });

  it('merge receives contentOnly-filtered ops', () => {
    const spy = new SpyMergeStrategy();
    const store = new DocumentStore({ silentConsole: true });
    store.loadUSFM(SAMPLE_TWO_VERSE_USFM);
    const alignA: Operation = {
      type: 'alignWord',
      verseRef: 'TIT 1:1',
      target: { word: 'a', occurrence: 1, occurrences: 1 },
      sources: [],
    };
    const alignB: Operation = {
      type: 'alignWord',
      verseRef: 'TIT 1:1',
      target: { word: 'b', occurrence: 1, occurrences: 1 },
      sources: [],
    };
    const eng = new JournalMergeSyncEngine({
      journal: new OperationJournal(undefined, 'x'),
      store,
      mergeStrategy: spy,
      getLocalPending: () => [...contentOpsForVerseEdit(1, 1, 'L'), alignA],
    });
    const entry = {
      id: 'align-remote',
      userId: 'u',
      timestamp: 1,
      sequence: 1,
      vectorClock: { u: 1 },
      chapter: 1,
      layer: 'content' as const,
      operations: [...contentOpsForVerseEdit(1, 1, 'R'), alignB],
      baseSnapshotId: 'head',
    };
    eng.applyRemoteJournalEntry(entry);
    expect(spy.calls.length).toBe(1);
    expect(spy.calls[0]!.local.every((o) => o.type !== 'alignWord')).toBe(true);
    expect(spy.calls[0]!.remote.every((o) => o.type !== 'alignWord')).toBe(true);
    expect(spy.calls[0]!.local).toEqual(contentOnly(spy.calls[0]!.local));
  });
});

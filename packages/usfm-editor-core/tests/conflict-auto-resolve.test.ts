import {
  DocumentStore,
  JournalMergeSyncEngine,
  OperationJournal,
  type ChapterConflict,
  type Operation,
} from '../dist';
import {
  contentOpsForVerseEdit,
  failApplyWhen,
  mergeFailServerPrimeOps,
  SAMPLE_TWO_VERSE_USFM,
  SAMPLE_V1_INITIAL_TEXT,
} from './test-merge-helpers';

function minimalEntry(id: string, chapter: number, operations: Operation[]) {
  return {
    id,
    userId: 'u',
    timestamp: 1,
    sequence: 1,
    vectorClock: { u: 1 },
    chapter,
    layer: 'content' as const,
    operations,
    baseSnapshotId: 'head',
  };
}

function mergeFailsApply(store: DocumentStore): void {
  failApplyWhen(
    store,
    (ops) => ops.some((o) => o.type === 'setText' && (o as { text?: string }).text === '__MERGE_FAIL__')
  );
}

describe('onConflict auto-resolve', () => {
  const usfm = SAMPLE_TWO_VERSE_USFM;

  it('accept-local keeps store unchanged; returns no conflict', () => {
    const store = new DocumentStore({ silentConsole: true });
    store.loadUSFM(usfm);
    mergeFailsApply(store);
    const localPending = contentOpsForVerseEdit(1, 1, 'LOCAL');
    const remoteOps = contentOpsForVerseEdit(1, 1, 'REMOTE');
    const eng = new JournalMergeSyncEngine({
      journal: new OperationJournal(undefined, 'j'),
      store,
      getLocalPending: () => localPending,
      mergeStrategy: {
        merge: () => ({
          serverPrime: mergeFailServerPrimeOps(),
          clientPrime: [],
        }),
      },
      onConflict: () => 'accept-local',
    });
    const { conflict, clientPrime } = eng.applyRemoteJournalEntry(
      minimalEntry('e1', 1, remoteOps)
    );
    expect(conflict).toBeNull();
    expect(clientPrime).toEqual(localPending);
    expect(store.toUSFM(1)).toContain(SAMPLE_V1_INITIAL_TEXT);
  });

  it('accept-remote applies remote ops when merge application fails', () => {
    const store = new DocumentStore({ silentConsole: true });
    store.loadUSFM(usfm);
    mergeFailsApply(store);
    const remoteOps = contentOpsForVerseEdit(1, 1, 'REMOTE');
    const eng = new JournalMergeSyncEngine({
      journal: new OperationJournal(undefined, 'j'),
      store,
      getLocalPending: () => [],
      mergeStrategy: {
        merge: () => ({
          serverPrime: mergeFailServerPrimeOps(),
          clientPrime: [],
        }),
      },
      onConflict: () => 'accept-remote',
    });
    const { conflict, clientPrime } = eng.applyRemoteJournalEntry(
      minimalEntry('e2', 1, remoteOps)
    );
    expect(conflict).toBeNull();
    expect(clientPrime).toEqual([]);
    expect(store.toUSFM(1)).toContain('REMOTE');
  });

  it('manual returns conflict like no callback', () => {
    const store = new DocumentStore({ silentConsole: true });
    store.loadUSFM(usfm);
    mergeFailsApply(store);
    const cp = contentOpsForVerseEdit(1, 1, 'c');
    const eng = new JournalMergeSyncEngine({
      journal: new OperationJournal(undefined, 'j'),
      store,
      getLocalPending: () => [],
      mergeStrategy: {
        merge: () => ({
          serverPrime: mergeFailServerPrimeOps(),
          clientPrime: cp,
        }),
      },
      onConflict: () => 'manual',
    });
    const remoteOps = contentOpsForVerseEdit(1, 1, 'R');
    const { conflict } = eng.applyRemoteJournalEntry(minimalEntry('e3', 1, remoteOps));
    expect(conflict).not.toBeNull();
    expect(conflict!.chapter).toBe(1);
    expect(conflict!.layer).toBe('content');
  });

  it('undefined onConflict returns conflict (backward compat)', () => {
    const store = new DocumentStore({ silentConsole: true });
    store.loadUSFM(usfm);
    mergeFailsApply(store);
    const eng = new JournalMergeSyncEngine({
      journal: new OperationJournal(undefined, 'j'),
      store,
      getLocalPending: () => [],
      mergeStrategy: {
        merge: () => ({
          serverPrime: mergeFailServerPrimeOps(),
          clientPrime: [],
        }),
      },
    });
    const remoteOps = contentOpsForVerseEdit(1, 1, 'R');
    expect(eng.applyRemoteJournalEntry(minimalEntry('e4', 1, remoteOps)).conflict).not.toBeNull();
  });

  it('callback receives ChapterConflict shape', () => {
    const received: ChapterConflict[] = [];
    const store = new DocumentStore({ silentConsole: true });
    store.loadUSFM(usfm);
    mergeFailsApply(store);
    const localPending = contentOpsForVerseEdit(1, 1, 'L');
    const remoteOps = contentOpsForVerseEdit(1, 1, 'R');
    const eng = new JournalMergeSyncEngine({
      journal: new OperationJournal(undefined, 'j'),
      store,
      getLocalPending: () => localPending,
      mergeStrategy: {
        merge: () => ({
          serverPrime: mergeFailServerPrimeOps(),
          clientPrime: [],
        }),
      },
      onConflict: (c) => {
        received.push(c);
        return 'manual';
      },
    });
    eng.applyRemoteJournalEntry(minimalEntry('e5', 1, remoteOps));
    expect(received.length).toBe(1);
    expect(received[0]!.localOps).toEqual(localPending);
    expect(received[0]!.remoteOps).toEqual(remoteOps);
  });

  it('callback not called when merge succeeds', () => {
    let calls = 0;
    const store = new DocumentStore({ silentConsole: true });
    store.loadUSFM(usfm);
    const eng = new JournalMergeSyncEngine({
      journal: new OperationJournal(undefined, 'j'),
      store,
      getLocalPending: () => [],
      onConflict: () => {
        calls++;
        return 'accept-local';
      },
    });
    const remoteOps = contentOpsForVerseEdit(1, 1, 'OK');
    eng.applyRemoteJournalEntry(minimalEntry('e6', 1, remoteOps));
    expect(calls).toBe(0);
  });

  it('onConflict called once per failing merge (two remote entries)', () => {
    let conflictCount = 0;
    const store = new DocumentStore({ silentConsole: true });
    store.loadUSFM(usfm);
    mergeFailsApply(store);
    const eng = new JournalMergeSyncEngine({
      journal: new OperationJournal(undefined, 'j'),
      store,
      getLocalPending: () => [],
      mergeStrategy: {
        merge: () => ({
          serverPrime: mergeFailServerPrimeOps(),
          clientPrime: [],
        }),
      },
      onConflict: () => {
        conflictCount++;
        return 'manual';
      },
    });
    eng.applyRemoteJournalEntry(minimalEntry('id1', 1, contentOpsForVerseEdit(1, 1, 'A')));
    eng.applyRemoteJournalEntry(minimalEntry('id2', 1, contentOpsForVerseEdit(1, 1, 'B')));
    expect(conflictCount).toBe(2);
  });
});

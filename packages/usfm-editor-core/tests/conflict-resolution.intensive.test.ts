/**
 * Intensive offline tests: conflict heuristics, journal merge engine, OT merge paths
 * (no Door43 network — see `tests/door43/*.integration.test.ts`).
 */

import type { Operation } from '../dist';
import {
  contentOnly,
  DocumentStore,
  filterResolvableConflicts,
  HeadlessCollabSession,
  JournalMergeSyncEngine,
  OperationJournal,
} from '../dist';
import type { ChapterConflict, JournalEntry } from '../dist';

const SAMPLE = String.raw`\id TIT EN_ULT
\h Titus
\c 1
\p
\v 1 First verse text.
\v 2 Second verse text.
`;

function makeEntry(
  journal: OperationJournal,
  userId: string,
  chapter: number,
  operations: Operation[],
  overrides: Partial<JournalEntry> = {}
): JournalEntry {
  return {
    id: overrides.id ?? `e-${Math.random().toString(36).slice(2)}`,
    userId,
    timestamp: overrides.timestamp ?? Date.now(),
    sequence: overrides.sequence ?? 1,
    vectorClock: overrides.vectorClock ?? { [userId]: 1 },
    chapter,
    layer: 'content',
    operations,
    baseSnapshotId: overrides.baseSnapshotId ?? 'head',
  };
}

describe('filterResolvableConflicts (intensive)', () => {
  it('empty list stays empty', () => {
    expect(filterResolvableConflicts([])).toEqual([]);
  });

  it('filters non-overlapping chapter conflicts', () => {
    const a: Operation = {
      type: 'setText',
      path: { chapter: 1, indices: [0, 1, 0] },
      text: 'a',
    };
    const b: Operation = {
      type: 'setText',
      path: { chapter: 2, indices: [0, 1, 0] },
      text: 'b',
    };
    const c: ChapterConflict = {
      chapter: 1,
      layer: 'content',
      localOps: [a],
      remoteOps: [b],
    };
    expect(filterResolvableConflicts([c])).toEqual([]);
  });

  it('keeps overlapping path conflicts', () => {
    const op: Operation = {
      type: 'setText',
      path: { chapter: 1, indices: [0, 1, 0] },
      text: 'x',
    };
    const c: ChapterConflict = {
      chapter: 1,
      layer: 'content',
      localOps: [op],
      remoteOps: [{ ...op, text: 'y' }],
    };
    expect(filterResolvableConflicts([c])).toHaveLength(1);
  });

  it('handles multiple conflicts mixed', () => {
    const c1: ChapterConflict = {
      chapter: 1,
      layer: 'content',
      localOps: [
        { type: 'setText', path: { chapter: 1, indices: [0, 1, 0] }, text: 'a' },
      ],
      remoteOps: [
        { type: 'setText', path: { chapter: 2, indices: [0, 1, 0] }, text: 'b' },
      ],
    };
    const c2: ChapterConflict = {
      chapter: 1,
      layer: 'content',
      localOps: [
        { type: 'setText', path: { chapter: 1, indices: [0, 1, 0] }, text: 'a' },
      ],
      remoteOps: [
        { type: 'setText', path: { chapter: 1, indices: [0, 1, 0] }, text: 'b' },
      ],
    };
    const out = filterResolvableConflicts([c1, c2]);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(c2);
  });
});

describe('JournalMergeSyncEngine.applyRemoteJournalEntry (intensive)', () => {
  function engineFor(userId: string) {
    const journal = new OperationJournal(undefined, userId);
    const store = new DocumentStore({ silentConsole: true });
    store.loadUSFM(SAMPLE);
    const pendingByChapter = new Map<number, Operation[]>();
    const eng = new JournalMergeSyncEngine({
      journal,
      store,
      transport: undefined,
      getLocalPending: (ch) => pendingByChapter.get(ch) ?? [],
    });
    return { journal, store, pendingByChapter, eng };
  }

  it('applies remote entry for verse 2 with empty local pending', () => {
    const { journal, store, eng } = engineFor('local');
    const probe = new HeadlessCollabSession({ userId: 'remote' });
    probe.loadUSFM(SAMPLE);
    probe.editVerse(1, 2, 'Remote v2.');
    const src = probe.journal.getAll()[0]!;
    probe.destroy();

    expect(src.layer).toBe('content');
    expect(contentOnly(src.operations).length).toBeGreaterThan(0);

    const remote: JournalEntry = { ...src, id: `intensive-remote-v2-${Date.now()}` };

    const { conflict } = eng.applyRemoteJournalEntry(remote);
    expect(conflict).toBeNull();
    expect(journal.getAll().some((e) => e.id === remote.id)).toBe(true);
    expect(store.toUSFM(1)).toContain('Remote v2.');
  });

  it('merges sequential remote entries on empty local pending', () => {
    const { journal, eng } = engineFor('u1');
    const e1 = makeEntry(journal, 'peer', 1, [
      {
        type: 'setText',
        path: { chapter: 1, indices: [0, 1, 0] },
        text: 'One.',
      },
    ]);
    e1.vectorClock = { peer: 1 };
    expect(eng.applyRemoteJournalEntry(e1).conflict).toBeNull();

    const e2 = makeEntry(journal, 'peer', 1, [
      {
        type: 'setText',
        path: { chapter: 1, indices: [0, 2, 0] },
        text: 'Two.',
      },
    ]);
    e2.vectorClock = { peer: 2 };
    expect(eng.applyRemoteJournalEntry(e2).conflict).toBeNull();
  });
});

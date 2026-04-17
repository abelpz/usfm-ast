import type { JournalEntry } from '@usfm-tools/editor-core';
import { mergeJournalJsonlThreeWay } from '../src/storage/journal-jsonl';

function entry(partial: Partial<JournalEntry> & Pick<JournalEntry, 'id' | 'sequence'>): JournalEntry {
  return {
    userId: 'u1',
    timestamp: 0,
    vectorClock: {},
    chapter: 1,
    layer: 'content',
    operations: [],
    baseSnapshotId: 'head',
    ...partial,
  };
}

describe('mergeJournalJsonlThreeWay', () => {
  it('merges independent edits (different entry ids)', () => {
    const base = '';
    const h =
      '{"_journalHeader":1,"vectorClock":{"u1":1},"meta":{}}\n' +
      `${JSON.stringify(entry({ id: 'a', sequence: 1 }))}\n`;
    const ours =
      '{"_journalHeader":1,"vectorClock":{"u1":2},"meta":{}}\n' +
      `${JSON.stringify(entry({ id: 'a', sequence: 1 }))}\n` +
      `${JSON.stringify(entry({ id: 'b', sequence: 2, userId: 'u1' }))}\n`;
    const theirs =
      '{"_journalHeader":1,"vectorClock":{"u2":1},"meta":{}}\n' +
      `${JSON.stringify(entry({ id: 'a', sequence: 1 }))}\n` +
      `${JSON.stringify(entry({ id: 'c', sequence: 3, userId: 'u2' }))}\n`;

    const r = mergeJournalJsonlThreeWay({ path: 'journal/TIT.jsonl', base, ours, theirs });
    expect(r.kind).toBe('merged');
    if (r.kind !== 'merged') return;
    expect(r.text).toContain('"id":"a"');
    expect(r.text).toContain('"id":"b"');
    expect(r.text).toContain('"id":"c"');
  });

  it('returns conflict when the same entry id diverges', () => {
    const base =
      '{"_journalHeader":1,"vectorClock":{},"meta":{}}\n' +
      `${JSON.stringify(entry({ id: 'x', sequence: 1, timestamp: 1 }))}\n`;
    const ours =
      '{"_journalHeader":1,"vectorClock":{},"meta":{}}\n' +
      `${JSON.stringify(entry({ id: 'x', sequence: 1, timestamp: 2 }))}\n`;
    const theirs =
      '{"_journalHeader":1,"vectorClock":{},"meta":{}}\n' +
      `${JSON.stringify(entry({ id: 'x', sequence: 1, timestamp: 3 }))}\n`;

    const r = mergeJournalJsonlThreeWay({ path: 'journal/TIT.jsonl', base, ours, theirs });
    expect(r.kind).toBe('conflict');
  });
});

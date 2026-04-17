/**
 * Parse / serialize / three-way merge for `journal/<BOOK>.jsonl` (OperationJournal lines).
 */

import type { JournalEntry } from '@usfm-tools/editor-core';
import type { FileConflict } from '@usfm-tools/types';

export type JournalJsonlHeader = {
  _journalHeader: 1;
  vectorClock: Record<string, number>;
  meta?: { baseSnapshotId?: string };
};

function mergeClocks(
  a: Record<string, number>,
  b: Record<string, number>,
): Record<string, number> {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = Math.max(out[k] ?? 0, v);
  }
  return out;
}

export function parseJournalJsonl(raw: string): {
  header: JournalJsonlHeader | null;
  entries: JournalEntry[];
} {
  const lines = raw.split('\n');
  const entries: JournalEntry[] = [];
  let header: JournalJsonlHeader | null = null;
  let start = 0;
  if (lines.length > 0 && lines[0]!.trim()) {
    try {
      const first = JSON.parse(lines[0]!.trim()) as Record<string, unknown>;
      if (first._journalHeader === 1) {
        header = {
          _journalHeader: 1,
          vectorClock:
            typeof first.vectorClock === 'object' && first.vectorClock !== null
              ? (first.vectorClock as Record<string, number>)
              : {},
          meta:
            typeof first.meta === 'object' && first.meta !== null
              ? (first.meta as { baseSnapshotId?: string })
              : undefined,
        };
        start = 1;
      }
    } catch {
      /* first line is an entry */
    }
  }
  for (let i = start; i < lines.length; i++) {
    const t = lines[i]!.trim();
    if (!t) continue;
    try {
      entries.push(JSON.parse(t) as JournalEntry);
    } catch {
      /* skip bad line */
    }
  }
  return { header, entries };
}

export function serializeJournalJsonl(opts: {
  header: JournalJsonlHeader | null;
  entries: JournalEntry[];
}): string {
  const parts: string[] = [];
  if (opts.header) {
    parts.push(JSON.stringify(opts.header));
  }
  for (const e of opts.entries) {
    parts.push(JSON.stringify(e));
  }
  return parts.length > 0 ? `${parts.join('\n')}\n` : '';
}

function entryMap(entries: JournalEntry[]): Map<string, JournalEntry> {
  const m = new Map<string, JournalEntry>();
  for (const e of entries) {
    m.set(e.id, e);
  }
  return m;
}

function hashShort(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

function journalConflict(path: string, base: string, ours: string, theirs: string): FileConflict {
  return {
    conflictId: `${path}#journal-${hashShort(ours)}-${hashShort(theirs)}`,
    path,
    chapterIndices: [],
    baseText: base,
    oursText: ours,
    theirsText: theirs,
  };
}

/**
 * Three-way merge of journal JSONL: union of entries by id with standard 3-way rules; merges vector clocks.
 */
export function mergeJournalJsonlThreeWay(opts: {
  path: string;
  base: string;
  ours: string;
  theirs: string;
}):
  | { kind: 'merged'; text: string }
  | { kind: 'conflict'; conflict: FileConflict } {
  const { path, base, ours, theirs } = opts;
  if (ours === theirs) {
    return { kind: 'merged', text: ours };
  }

  const pb = parseJournalJsonl(base);
  const po = parseJournalJsonl(ours);
  const pt = parseJournalJsonl(theirs);

  const baseM = entryMap(pb.entries);
  const oursM = entryMap(po.entries);
  const theirsM = entryMap(pt.entries);

  const ids = new Set<string>([...baseM.keys(), ...oursM.keys(), ...theirsM.keys()]);
  const mergedEntries: JournalEntry[] = [];

  const js = (e: JournalEntry | undefined) => (e ? JSON.stringify(e) : '');

  for (const id of ids) {
    const b = baseM.get(id);
    const o = oursM.get(id);
    const t = theirsM.get(id);

    if (js(o) === js(t)) {
      if (o) mergedEntries.push(o);
      continue;
    }
    if (js(o) === js(b)) {
      if (t) mergedEntries.push(t);
      continue;
    }
    if (js(t) === js(b)) {
      if (o) mergedEntries.push(o);
      continue;
    }
    return {
      kind: 'conflict',
      conflict: journalConflict(path, base, ours, theirs),
    };
  }

  mergedEntries.sort((a, b) => {
    if (a.sequence !== b.sequence) return a.sequence - b.sequence;
    return a.timestamp - b.timestamp;
  });

  let vector = pb.header?.vectorClock ?? {};
  vector = mergeClocks(vector, po.header?.vectorClock ?? {});
  vector = mergeClocks(vector, pt.header?.vectorClock ?? {});
  for (const e of mergedEntries) {
    vector = mergeClocks(vector, e.vectorClock);
  }

  let meta: { baseSnapshotId?: string } | undefined;
  const mb = pb.header?.meta?.baseSnapshotId;
  const mo = po.header?.meta?.baseSnapshotId;
  const mt = pt.header?.meta?.baseSnapshotId;
  if (mo === mt) {
    meta = mo !== undefined ? { baseSnapshotId: mo } : undefined;
  } else if (mo === mb && mt !== undefined) {
    meta = { baseSnapshotId: mt };
  } else if (mt === mb && mo !== undefined) {
    meta = { baseSnapshotId: mo };
  } else if (mo !== undefined || mt !== undefined) {
    return {
      kind: 'conflict',
      conflict: journalConflict(path, base, ours, theirs),
    };
  }

  const header: JournalJsonlHeader | null =
    mergedEntries.length > 0 || Object.keys(vector).length > 0 || meta
      ? {
          _journalHeader: 1,
          vectorClock: vector,
          meta,
        }
      : null;

  return {
    kind: 'merged',
    text: serializeJournalJsonl({ header, entries: mergedEntries }),
  };
}

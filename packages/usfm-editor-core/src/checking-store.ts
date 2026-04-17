/**
 * Append-only translation checking records per book (JSON files under `checking/`).
 */

import type { CheckingBookFile, CheckingEntry, CheckingEntryBase } from './project-format';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function parseEntryBase(o: Record<string, unknown>): CheckingEntryBase | null {
  const id = o.id;
  const ref = o.ref;
  const author = o.author;
  const timestamp = o.timestamp;
  if (typeof id !== 'string' || typeof ref !== 'string' || typeof author !== 'string' || typeof timestamp !== 'string') {
    return null;
  }
  const supersedes = o.supersedes;
  return {
    id,
    ref,
    author,
    timestamp,
    supersedes: supersedes === null || typeof supersedes === 'string' ? supersedes : null,
  };
}

/** Parse `checking/{BOOK}.checking.json` body. */
export function parseCheckingBookJson(json: string): CheckingBookFile {
  let v: unknown;
  try {
    v = JSON.parse(json) as unknown;
  } catch {
    throw new Error('checking: invalid JSON');
  }
  if (!isRecord(v)) throw new Error('checking: expected object');
  const meta = v.meta;
  if (!isRecord(meta)) throw new Error('checking: meta required');
  const book = meta.book;
  const schemaVersion = meta.schemaVersion;
  if (typeof book !== 'string' || typeof schemaVersion !== 'string') {
    throw new Error('checking: meta.book and meta.schemaVersion required');
  }
  const entriesRaw = v.entries;
  if (!Array.isArray(entriesRaw)) throw new Error('checking: entries must be array');
  const entries: CheckingEntry[] = [];
  for (const e of entriesRaw) {
    if (!isRecord(e)) continue;
    const base = parseEntryBase(e);
    if (!base) continue;
    const type = e.type;
    if (type === 'comment') {
      const body = e.body;
      const resolved = e.resolved;
      if (typeof body !== 'string' || typeof resolved !== 'boolean') continue;
      entries.push({ ...base, type: 'comment', body, resolved });
    } else if (type === 'decision') {
      const status = e.status;
      if (typeof status !== 'string') continue;
      const note = e.note;
      entries.push({
        ...base,
        type: 'decision',
        status,
        note: typeof note === 'string' ? note : undefined,
      });
    }
  }
  return { meta: { book, schemaVersion }, entries };
}

export function serializeCheckingBookJson(file: CheckingBookFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** Empty book file for a USFM book code. */
export function emptyCheckingBook(bookCode: string, schemaVersion = '1'): CheckingBookFile {
  return {
    meta: { book: bookCode.toUpperCase(), schemaVersion },
    entries: [],
  };
}

/**
 * Append a new entry (immutable log). If superseding, set `supersedes` on the new entry.
 */
export function appendCheckingEntry(file: CheckingBookFile, entry: CheckingEntry): CheckingBookFile {
  return {
    ...file,
    entries: [...file.entries, entry],
  };
}

/** Ids that have been superseded by a newer entry. */
export function supersededIds(entries: readonly CheckingEntry[]): Set<string> {
  const out = new Set<string>();
  for (const e of entries) {
    if (e.supersedes) out.add(e.supersedes);
  }
  return out;
}

/** Entries that are not superseded (latest in chain only). */
export function activeEntries(entries: readonly CheckingEntry[]): CheckingEntry[] {
  const dead = supersededIds(entries);
  return entries.filter((e) => !dead.has(e.id));
}

/** Filter by verse/ref string (exact match on `ref`). */
export function entriesForRef(entries: readonly CheckingEntry[], ref: string): CheckingEntry[] {
  const r = ref.trim();
  return activeEntries(entries).filter((e) => e.ref.trim() === r);
}

/** All active entries for a book file, optionally filtered by ref prefix. */
export function queryChecking(
  file: CheckingBookFile,
  options?: { refPrefix?: string },
): CheckingEntry[] {
  let list = activeEntries(file.entries);
  const prefix = options?.refPrefix?.trim();
  if (prefix) list = list.filter((e) => e.ref.startsWith(prefix));
  return list;
}

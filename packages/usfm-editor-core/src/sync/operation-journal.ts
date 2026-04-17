import type { DocumentStore, UsjDocument } from '../document-store';
import type { PersistenceAdapter } from '../persistence/persistence-adapter';
import type { Operation } from '../operations';
import {
  DefaultJournalStore,
  MemoryJournalStore,
  isJournalStore,
  type JournalStore,
} from './journal-store';
import type { JournalEntry, JournalLayer } from './types';

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function mergeClocks(
  a: Record<string, number>,
  b: Record<string, number>
): Record<string, number> {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = Math.max(out[k] ?? 0, v);
  }
  return out;
}

interface JournalMeta {
  /** Last folded snapshot id (journal entries cleared after fold; doc state is in snapshot). */
  baseSnapshotId?: string;
}

/**
 * Append-only operation journal with optional persistence, vector-clock merge, and compaction.
 * Pass a {@link PersistenceAdapter} (wrapped in {@link DefaultJournalStore}), a custom {@link JournalStore},
 * or `undefined` for in-memory-only journal (no disk I/O).
 */
export class OperationJournal {
  private entries: JournalEntry[] = [];
  private seq = 0;
  /** Merged view of all peers' clocks (including remote entries). */
  private vectorClock: Record<string, number> = {};
  /** Set when {@link maybeCompactAfterPush} folds the log into a USJ snapshot. */
  private baseSnapshotId: string | null = null;
  private readonly appendListeners = new Set<(entry: JournalEntry) => void>();
  private readonly store: JournalStore;

  constructor(
    storeOrAdapter: JournalStore | PersistenceAdapter | undefined,
    private readonly userId: string
  ) {
    if (storeOrAdapter === undefined) {
      this.store = new MemoryJournalStore();
    } else if (isJournalStore(storeOrAdapter)) {
      this.store = storeOrAdapter;
    } else {
      this.store = new DefaultJournalStore(storeOrAdapter);
    }
  }

  /** Fired after each local {@link append} (not {@link ingestRemote}). */
  onAppend(listener: (entry: JournalEntry) => void): () => void {
    this.appendListeners.add(listener);
    return () => this.appendListeners.delete(listener);
  }

  /** Active folded snapshot id, if any. */
  getBaseSnapshotId(): string | null {
    return this.baseSnapshotId;
  }

  /** Highest seen sequence per user id. */
  getVectorClock(): Record<string, number> {
    return { ...this.vectorClock };
  }

  getAll(): JournalEntry[] {
    return [...this.entries];
  }

  /** Count of in-memory entries — use as a watermark before a long async operation. */
  get entryCount(): number {
    return this.entries.length;
  }

  /**
   * Entries appended after `fromIndex` (exclusive).
   * Use with `entryCount` to detect ops written during an async sync window.
   */
  getEntriesAfter(fromIndex: number): JournalEntry[] {
    return this.entries.slice(fromIndex);
  }

  /** Entries for one chapter (any layer), in order. */
  getEntriesForChapter(chapter: number): JournalEntry[] {
    return this.entries.filter((e) => e.chapter === chapter);
  }

  private bumpClock(entry: JournalEntry): void {
    this.vectorClock = mergeClocks(this.vectorClock, entry.vectorClock);
  }

  append(
    chapter: number,
    layer: JournalLayer,
    operations: Operation[],
    baseSnapshotId = 'head'
  ): JournalEntry {
    this.seq++;
    const localTick = (this.vectorClock[this.userId] ?? 0) + 1;
    this.vectorClock[this.userId] = localTick;
    const entry: JournalEntry = {
      id: randomId(),
      userId: this.userId,
      timestamp: Date.now(),
      sequence: this.seq,
      vectorClock: { ...this.vectorClock },
      chapter,
      layer,
      operations,
      baseSnapshotId,
    };
    this.entries.push(entry);
    this.bumpClock(entry);
    for (const l of this.appendListeners) l(entry);
    void this.persist();
    return entry;
  }

  /** Ingest a remote journal entry (e.g. after sync). Skips duplicate ids. */
  ingestRemote(entry: JournalEntry): boolean {
    if (this.entries.some((e) => e.id === entry.id)) return false;
    this.entries.push(entry);
    this.bumpClock(entry);
    this.seq = Math.max(this.seq, entry.sequence);
    void this.persist();
    return true;
  }

  clear(): void {
    this.entries = [];
    this.vectorClock = {};
    this.baseSnapshotId = null;
    void this.persist();
    void this.persistMeta();
  }

  /**
   * After a successful remote push, fold the journal into a snapshot if it grows too large.
   * Saves full USJ, clears in-memory entries (vector clock preserved), and records {@link baseSnapshotId}.
   *
   * Triggers when either `maxEntries` (default 200) OR `maxBytes` (default 1 MiB) is exceeded.
   */
  async maybeCompactAfterPush(
    docStore: DocumentStore,
    options?: { maxEntries?: number; maxBytes?: number }
  ): Promise<void> {
    const maxEntries = options?.maxEntries ?? 200;
    const maxBytes = options?.maxBytes ?? 1_048_576; // 1 MiB
    const entryBytes = this.entries.reduce((sum, e) => sum + JSON.stringify(e).length, 0);
    const exceedsLimit = this.entries.length > maxEntries || entryBytes > maxBytes;
    if (!exceedsLimit || this.store.ready === false) return;
    const snapshotJson = JSON.stringify(docStore.getFullUSJ());
    const snapshotId = randomId();
    try {
      await this.store.saveSnapshot(snapshotId, JSON.parse(snapshotJson) as unknown);
    } catch {
      return;
    }
    this.entries = [];
    this.baseSnapshotId = snapshotId;
    await this.persistMeta();
    await this.persist();
  }

  /**
   * Drop oldest entries after writing a snapshot reference; keeps tail.
   * @returns snapshot id when compaction ran
   * @deprecated Prefer {@link maybeCompactAfterPush} for offline-first snapshot lifecycle.
   */
  async compact(options: { maxEntries: number; snapshotJson: string }): Promise<string | null> {
    if (this.entries.length <= options.maxEntries) return null;
    const snapshotId = randomId();
    try {
      await this.store.saveSnapshot(snapshotId, JSON.parse(options.snapshotJson) as unknown);
    } catch {
      return null;
    }
    const keep = Math.max(1, Math.floor(options.maxEntries / 2));
    this.entries = this.entries.slice(-keep);
    void this.persist();
    return snapshotId;
  }

  /**
   * Load folded USJ snapshot if the journal was compacted to a snapshot (entries may be empty).
   */
  async loadFoldedSnapshotUsj(): Promise<UsjDocument | null> {
    if (!this.baseSnapshotId) return null;
    const data = await this.store.loadSnapshot(this.baseSnapshotId);
    if (data === null || data === undefined) return null;
    if (typeof data === 'object' && data !== null && (data as UsjDocument).type === 'USJ') {
      return data as UsjDocument;
    }
    return null;
  }

  /**
   * After {@link loadFromDisk}, if a folded snapshot exists and you need a single USJ base:
   * load snapshot, then replay {@link getAll} in sequence order (content ops).
   */
  async hydrateDocumentStore(docStore: DocumentStore): Promise<void> {
    const folded = await this.loadFoldedSnapshotUsj();
    if (folded) {
      docStore.loadUSJ(folded);
    }
    const ordered = [...this.entries].sort((a, b) => a.sequence - b.sequence);
    for (const e of ordered) {
      if (e.layer === 'content' && e.operations.length > 0) {
        docStore.applyOperations(e.operations);
      }
    }
  }

  private async persistMeta(): Promise<void> {
    try {
      const meta: JournalMeta = {};
      if (this.baseSnapshotId) meta.baseSnapshotId = this.baseSnapshotId;
      await this.store.saveMeta(meta);
    } catch {
      /* ignore */
    }
  }

  private async persist(): Promise<void> {
    try {
      await this.store.saveEntries(this.entries);
      await this.store.saveVectorClock(this.vectorClock);
    } catch {
      /* ignore */
    }
  }

  async loadFromDisk(): Promise<void> {
    const meta = await this.store.loadMeta();
    if (meta?.baseSnapshotId) this.baseSnapshotId = meta.baseSnapshotId;

    const loadedEntries = await this.store.loadEntries();
    if (loadedEntries.length > 0) {
      this.entries = loadedEntries;
      for (const e of this.entries) {
        this.vectorClock = mergeClocks(this.vectorClock, e.vectorClock);
        this.seq = Math.max(this.seq, e.sequence);
      }
    }

    const fromStore = await this.store.loadVectorClock();
    if (Object.keys(fromStore).length > 0) {
      this.vectorClock = mergeClocks(this.vectorClock, fromStore);
    }
  }

  /** One JSON object per line — for offline bundles and optional `journal/*.jsonl` in repo. */
  serializeForExport(): string {
    return this.entries.map((e) => JSON.stringify(e)).join('\n');
  }

  /** Merge exported lines via {@link ingestRemote} (skips duplicate ids). */
  loadFromExport(jsonl: string): void {
    for (const line of jsonl.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      const entry = JSON.parse(t) as JournalEntry;
      this.ingestRemote(entry);
    }
  }
}

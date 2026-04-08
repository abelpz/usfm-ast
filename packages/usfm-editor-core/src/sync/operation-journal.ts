import type { DocumentStore, UsjDocument } from '../document-store';
import type { PersistenceAdapter } from '../persistence/persistence-adapter';
import type { Operation } from '../operations';
import type { JournalEntry, JournalLayer } from './types';

const KEY_PREFIX = 'journal/';
const SNAPSHOT_PREFIX = 'snapshots/';
const META_KEY = `${KEY_PREFIX}meta.json`;

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
 */
export class OperationJournal {
  private entries: JournalEntry[] = [];
  private seq = 0;
  /** Merged view of all peers' clocks (including remote entries). */
  private vectorClock: Record<string, number> = {};
  /** Set when {@link maybeCompactAfterPush} folds the log into a USJ snapshot. */
  private baseSnapshotId: string | null = null;
  private readonly appendListeners = new Set<(entry: JournalEntry) => void>();

  constructor(
    private readonly persistence: PersistenceAdapter | undefined,
    private readonly userId: string
  ) {}

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
   */
  async maybeCompactAfterPush(
    store: DocumentStore,
    options?: { maxEntries?: number }
  ): Promise<void> {
    const maxEntries = options?.maxEntries ?? 200;
    if (this.entries.length <= maxEntries || !this.persistence?.ready) return;
    const snapshotJson = JSON.stringify(store.getFullUSJ());
    const snapshotId = randomId();
    try {
      await this.persistence.save(`${SNAPSHOT_PREFIX}${snapshotId}.json`, snapshotJson);
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
    if (this.persistence?.ready) {
      try {
        await this.persistence.save(
          `${SNAPSHOT_PREFIX}${snapshotId}.json`,
          options.snapshotJson
        );
      } catch {
        return null;
      }
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
    if (!this.baseSnapshotId || !this.persistence?.ready) return null;
    const raw = await this.persistence.load(`${SNAPSHOT_PREFIX}${this.baseSnapshotId}.json`);
    if (typeof raw !== 'string') return null;
    try {
      return JSON.parse(raw) as UsjDocument;
    } catch {
      return null;
    }
  }

  /**
   * After {@link loadFromDisk}, if a folded snapshot exists and you need a single USJ base:
   * load snapshot, then replay {@link getAll} in sequence order (content ops).
   */
  async hydrateDocumentStore(store: DocumentStore): Promise<void> {
    const folded = await this.loadFoldedSnapshotUsj();
    if (folded) {
      store.loadUSJ(folded);
    }
    const ordered = [...this.entries].sort((a, b) => a.sequence - b.sequence);
    for (const e of ordered) {
      if (e.layer === 'content' && e.operations.length > 0) {
        store.applyOperations(e.operations);
      }
    }
  }

  private async persistMeta(): Promise<void> {
    if (!this.persistence?.ready) return;
    try {
      const meta: JournalMeta = {};
      if (this.baseSnapshotId) meta.baseSnapshotId = this.baseSnapshotId;
      await this.persistence.save(META_KEY, JSON.stringify(meta));
    } catch {
      /* ignore */
    }
  }

  private async persist(): Promise<void> {
    if (!this.persistence?.ready) return;
    try {
      await this.persistence.save(
        `${KEY_PREFIX}entries.json`,
        JSON.stringify(this.entries)
      );
      await this.persistence.save(
        `${KEY_PREFIX}vector.json`,
        JSON.stringify(this.vectorClock)
      );
    } catch {
      /* ignore */
    }
  }

  async loadFromDisk(): Promise<void> {
    if (!this.persistence?.ready) return;
    const metaRaw = await this.persistence.load(META_KEY);
    if (typeof metaRaw === 'string') {
      try {
        const meta = JSON.parse(metaRaw) as JournalMeta;
        if (meta.baseSnapshotId) this.baseSnapshotId = meta.baseSnapshotId;
      } catch {
        /* ignore */
      }
    }
    const raw = await this.persistence.load(`${KEY_PREFIX}entries.json`);
    if (typeof raw === 'string') {
      try {
        this.entries = JSON.parse(raw) as JournalEntry[];
        for (const e of this.entries) {
          this.vectorClock = mergeClocks(this.vectorClock, e.vectorClock);
          this.seq = Math.max(this.seq, e.sequence);
        }
      } catch {
        this.entries = [];
      }
    }
    const vraw = await this.persistence.load(`${KEY_PREFIX}vector.json`);
    if (typeof vraw === 'string') {
      try {
        this.vectorClock = mergeClocks(this.vectorClock, JSON.parse(vraw) as Record<string, number>);
      } catch {
        /* ignore */
      }
    }
  }
}

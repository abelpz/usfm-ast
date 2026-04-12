import type { PersistenceAdapter } from '../persistence/persistence-adapter';
import type { JournalEntry } from './types';

const KEY_PREFIX = 'journal/';
const SNAPSHOT_PREFIX = 'snapshots/';
const META_KEY = `${KEY_PREFIX}meta.json`;

/**
 * Pluggable persistence for {@link OperationJournal} (entries, vector clock, meta, snapshots).
 * {@link DefaultJournalStore} mirrors the on-disk layout used by the original journal.
 */
export interface JournalStore {
  /** When `false`, {@link DefaultJournalStore} skips I/O (matches adapter not ready). */
  readonly ready?: boolean;
  loadEntries(): Promise<JournalEntry[]>;
  saveEntries(entries: JournalEntry[]): Promise<void>;
  loadVectorClock(): Promise<Record<string, number>>;
  saveVectorClock(clock: Record<string, number>): Promise<void>;
  loadMeta(): Promise<{ baseSnapshotId?: string } | null>;
  saveMeta(meta: { baseSnapshotId?: string }): Promise<void>;
  loadSnapshot(id: string): Promise<unknown | null>;
  saveSnapshot(id: string, data: unknown): Promise<void>;
}

/** In-memory store (no I/O); useful when journal persistence is disabled. */
export class MemoryJournalStore implements JournalStore {
  readonly ready = true;
  private entries: JournalEntry[] = [];
  private vector: Record<string, number> = {};
  private meta: { baseSnapshotId?: string } | null = null;
  private readonly snapshots = new Map<string, unknown>();

  async loadEntries(): Promise<JournalEntry[]> {
    return [...this.entries];
  }

  async saveEntries(entries: JournalEntry[]): Promise<void> {
    this.entries = [...entries];
  }

  async loadVectorClock(): Promise<Record<string, number>> {
    return { ...this.vector };
  }

  async saveVectorClock(clock: Record<string, number>): Promise<void> {
    this.vector = { ...clock };
  }

  async loadMeta(): Promise<{ baseSnapshotId?: string } | null> {
    return this.meta ? { ...this.meta } : null;
  }

  async saveMeta(meta: { baseSnapshotId?: string }): Promise<void> {
    this.meta = { ...meta };
  }

  async loadSnapshot(id: string): Promise<unknown | null> {
    return this.snapshots.has(id) ? this.snapshots.get(id)! : null;
  }

  async saveSnapshot(id: string, data: unknown): Promise<void> {
    this.snapshots.set(id, data);
  }
}

/** Wraps {@link PersistenceAdapter} with the default `journal/*` and `snapshots/*` key layout. */
export class DefaultJournalStore implements JournalStore {
  constructor(private readonly adapter: PersistenceAdapter) {}

  get ready(): boolean {
    return this.adapter.ready;
  }

  async loadEntries(): Promise<JournalEntry[]> {
    if (!this.adapter.ready) return [];
    const raw = await this.adapter.load(`${KEY_PREFIX}entries.json`);
    if (typeof raw !== 'string') return [];
    try {
      return JSON.parse(raw) as JournalEntry[];
    } catch {
      return [];
    }
  }

  async saveEntries(entries: JournalEntry[]): Promise<void> {
    if (!this.adapter.ready) return;
    try {
      await this.adapter.save(`${KEY_PREFIX}entries.json`, JSON.stringify(entries));
    } catch {
      /* fire-and-forget */
    }
  }

  async loadVectorClock(): Promise<Record<string, number>> {
    if (!this.adapter.ready) return {};
    const vraw = await this.adapter.load(`${KEY_PREFIX}vector.json`);
    if (typeof vraw !== 'string') return {};
    try {
      return JSON.parse(vraw) as Record<string, number>;
    } catch {
      return {};
    }
  }

  async saveVectorClock(clock: Record<string, number>): Promise<void> {
    if (!this.adapter.ready) return;
    try {
      await this.adapter.save(`${KEY_PREFIX}vector.json`, JSON.stringify(clock));
    } catch {
      /* ignore */
    }
  }

  async loadMeta(): Promise<{ baseSnapshotId?: string } | null> {
    if (!this.adapter.ready) return null;
    const metaRaw = await this.adapter.load(META_KEY);
    if (typeof metaRaw !== 'string') return null;
    try {
      return JSON.parse(metaRaw) as { baseSnapshotId?: string };
    } catch {
      return null;
    }
  }

  async saveMeta(meta: { baseSnapshotId?: string }): Promise<void> {
    if (!this.adapter.ready) return;
    try {
      await this.adapter.save(META_KEY, JSON.stringify(meta));
    } catch {
      /* ignore */
    }
  }

  async loadSnapshot(id: string): Promise<unknown | null> {
    if (!this.adapter.ready) return null;
    const raw = await this.adapter.load(`${SNAPSHOT_PREFIX}${id}.json`);
    if (typeof raw !== 'string') return null;
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }

  async saveSnapshot(id: string, data: unknown): Promise<void> {
    if (!this.adapter.ready) return;
    try {
      await this.adapter.save(`${SNAPSHOT_PREFIX}${id}.json`, JSON.stringify(data));
    } catch {
      /* ignore */
    }
  }
}

export function isJournalStore(x: unknown): x is JournalStore {
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof (x as JournalStore).loadEntries === 'function' &&
    typeof (x as JournalStore).saveEntries === 'function'
  );
}

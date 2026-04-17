/**
 * {@link JournalStore} backed by {@link ProjectStorage} at `journal/<BOOK>.jsonl` + snapshot files.
 */

import type { ProjectStorage } from '@usfm-tools/types';
import type { JournalEntry } from '@usfm-tools/editor-core';
import type { JournalStore } from '@usfm-tools/editor-core';
import { journalRepoPathForBook, journalSnapshotPathForBook } from './journal-repo-store';
import { parseJournalJsonl, serializeJournalJsonl, type JournalJsonlHeader } from './journal-jsonl';

export type ProjectBookJournalStoreOptions = {
  storage: ProjectStorage;
  projectId: string;
  bookCode: string;
};

export class ProjectBookJournalStore implements JournalStore {
  readonly ready = true;

  private readonly storage: ProjectStorage;
  private readonly projectId: string;
  private readonly journalPath: string;
  private readonly bookCode: string;

  constructor(options: ProjectBookJournalStoreOptions) {
    this.storage = options.storage;
    this.projectId = options.projectId;
    this.bookCode = options.bookCode;
    this.journalPath = journalRepoPathForBook(options.bookCode);
  }

  async loadEntries(): Promise<JournalEntry[]> {
    const raw = await this.storage.readFile(this.projectId, this.journalPath);
    if (raw === null || raw === '') return [];
    return parseJournalJsonl(raw).entries;
  }

  async saveEntries(entries: JournalEntry[]): Promise<void> {
    const raw = await this.storage.readFile(this.projectId, this.journalPath);
    const parsed = raw ? parseJournalJsonl(raw) : { header: null as JournalJsonlHeader | null, entries: [] };
    await this.storage.writeFile(
      this.projectId,
      this.journalPath,
      serializeJournalJsonl({ header: parsed.header, entries }),
    );
  }

  async loadVectorClock(): Promise<Record<string, number>> {
    const raw = await this.storage.readFile(this.projectId, this.journalPath);
    if (raw === null || raw === '') return {};
    const { header } = parseJournalJsonl(raw);
    return header?.vectorClock ? { ...header.vectorClock } : {};
  }

  async saveVectorClock(clock: Record<string, number>): Promise<void> {
    const raw = await this.storage.readFile(this.projectId, this.journalPath);
    const parsed = raw
      ? parseJournalJsonl(raw)
      : { header: null as JournalJsonlHeader | null, entries: [] as JournalEntry[] };
    const header: JournalJsonlHeader = {
      _journalHeader: 1,
      vectorClock: { ...clock },
      meta: parsed.header?.meta,
    };
    await this.storage.writeFile(
      this.projectId,
      this.journalPath,
      serializeJournalJsonl({ header, entries: parsed.entries }),
    );
  }

  async loadMeta(): Promise<{ baseSnapshotId?: string } | null> {
    const raw = await this.storage.readFile(this.projectId, this.journalPath);
    if (raw === null || raw === '') return null;
    const { header } = parseJournalJsonl(raw);
    const id = header?.meta?.baseSnapshotId;
    return id ? { baseSnapshotId: id } : null;
  }

  async saveMeta(meta: { baseSnapshotId?: string }): Promise<void> {
    const raw = await this.storage.readFile(this.projectId, this.journalPath);
    const parsed = raw
      ? parseJournalJsonl(raw)
      : { header: null as JournalJsonlHeader | null, entries: [] as JournalEntry[] };
    const vc = parsed.header?.vectorClock ?? {};
    const header: JournalJsonlHeader = {
      _journalHeader: 1,
      vectorClock: vc,
      meta: meta.baseSnapshotId ? { baseSnapshotId: meta.baseSnapshotId } : undefined,
    };
    await this.storage.writeFile(
      this.projectId,
      this.journalPath,
      serializeJournalJsonl({ header, entries: parsed.entries }),
    );
  }

  async loadSnapshot(id: string): Promise<unknown | null> {
    const path = journalSnapshotPathForBook(this.bookCode, id);
    const raw = await this.storage.readFile(this.projectId, path);
    if (raw === null || raw === '') return null;
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }

  async saveSnapshot(id: string, data: unknown): Promise<void> {
    const path = journalSnapshotPathForBook(this.bookCode, id);
    await this.storage.writeFile(this.projectId, path, JSON.stringify(data));
  }
}

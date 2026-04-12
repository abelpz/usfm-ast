/**
 * DOM-free collaborative session: {@link DocumentStore} + {@link OperationJournal} + sync engine.
 */

import { diffUsjDocuments } from './document-diff';
import { DocumentStore, type UsjDocument } from './document-store';
import type { Operation } from './operations';
import { usfmRefToVerseSid } from './verse-ref';
import type { PersistenceAdapter } from './persistence/persistence-adapter';
import { OperationJournal } from './sync/operation-journal';
import { RealtimeSyncEngine } from './sync/realtime-sync-engine';
import type { JournalRemoteTransport } from './sync/merge-sync-engine';
import type { RealtimeTransport } from './sync/realtime-transport';
import type { MergeStrategy } from './sync/merge-strategy';
import type { JournalStore } from './sync/journal-store';
import type { ChapterConflict } from './sync/types';
import type { SyncEngine } from './sync/types';

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function chapterFromContentOp(op: Operation): number {
  if (op.type === 'moveNode') return op.from.chapter;
  if (
    op.type === 'insertNode' ||
    op.type === 'removeNode' ||
    op.type === 'replaceNode' ||
    op.type === 'setText' ||
    op.type === 'setAttr'
  ) {
    return op.path.chapter;
  }
  throw new Error(`chapterFromContentOp: not a content operation (${(op as Operation).type})`);
}

/** Replace inline nodes after a verse milestone in-place; returns true if sid was found. */
function replaceVerseInlineInRoot(rootContent: unknown[], targetSid: string, newVerseText: string): boolean {
  for (const n of rootContent) {
    if (!n || typeof n !== 'object') continue;
    const o = n as Record<string, unknown>;
    if (Array.isArray(o.content)) {
      const arr = o.content as unknown[];
      for (let i = 0; i < arr.length; i++) {
        const item = arr[i];
        if (
          item &&
          typeof item === 'object' &&
          (item as Record<string, unknown>).type === 'verse' &&
          (item as Record<string, unknown>).sid === targetSid
        ) {
          let j = i + 1;
          while (j < arr.length) {
            const x = arr[j];
            if (x && typeof x === 'object' && (x as Record<string, unknown>).type === 'verse') break;
            j++;
          }
          const removeCount = j - (i + 1);
          const insert = newVerseText ? [newVerseText] : [];
          arr.splice(i + 1, removeCount, ...insert);
          return true;
        }
      }
      for (const item of arr) {
        if (item && typeof item === 'object') {
          if (replaceVerseInlineInRoot([item], targetSid, newVerseText)) return true;
        }
      }
    }
  }
  return false;
}

function groupContentOpsByChapter(ops: Operation[]): Map<number, Operation[]> {
  const byChapter = new Map<number, Operation[]>();
  for (const op of ops) {
    if (
      op.type === 'alignWord' ||
      op.type === 'unalignWord' ||
      op.type === 'updateGroup'
    ) {
      continue;
    }
    const ch = chapterFromContentOp(op);
    const list = byChapter.get(ch);
    if (list) list.push(op);
    else byChapter.set(ch, [op]);
  }
  return byChapter;
}

export interface HeadlessCollabSessionOptions {
  userId: string;
  persistence?: PersistenceAdapter;
  /** When set, takes precedence over {@link persistence} for {@link OperationJournal} backing. */
  journalStore?: JournalStore;
  remoteTransport?: JournalRemoteTransport;
  realtimeTransport?: RealtimeTransport;
  roomId?: string;
  displayName?: string;
  /** Bypass {@link RealtimeSyncEngine}; you supply push/pull/realtime wiring. */
  syncEngine?: SyncEngine;
  mergeStrategy?: MergeStrategy;
  onConflict?: (conflict: ChapterConflict) => 'accept-local' | 'accept-remote' | 'manual';
}

/**
 * Headless collaboration: structured ops, journal, optional realtime + DCS transports.
 */
export class HeadlessCollabSession {
  readonly store: DocumentStore;
  readonly journal: OperationJournal;
  readonly sync: SyncEngine;

  private readonly changeListeners = new Set<(ops: Operation[]) => void>();
  private readonly pendingByChapter = new Map<number, Operation[]>();
  private room: string | null = null;

  constructor(private readonly opts: HeadlessCollabSessionOptions) {
    this.store = new DocumentStore({ silentConsole: true });
    this.journal = new OperationJournal(opts.journalStore ?? opts.persistence, opts.userId);
    this.sync =
      opts.syncEngine ??
      new RealtimeSyncEngine({
        journal: this.journal,
        store: this.store,
        remoteTransport: opts.remoteTransport,
        realtimeTransport: opts.realtimeTransport,
        userId: opts.userId,
        displayName: opts.displayName,
        getLocalPending: (chapter) => this.pendingByChapter.get(chapter) ?? [],
        onRemoteEntryApplied: (chapter, clientPrime) => {
          this.pendingByChapter.set(chapter, clientPrime);
        },
        mergeStrategy: opts.mergeStrategy,
        onConflict: opts.onConflict,
      });
  }

  loadUSFM(usfm: string): void {
    this.store.loadUSFM(usfm);
  }

  loadUSJ(usj: UsjDocument): void {
    this.store.loadUSJ(usj);
  }

  /**
   * Apply content ops to the store and append per-chapter journal entries.
   */
  applyContentOperations(ops: Operation[], options?: { skipJournal?: boolean }): void {
    const contentOps = ops.filter(
      (o) => o.type !== 'alignWord' && o.type !== 'unalignWord' && o.type !== 'updateGroup'
    );
    if (contentOps.length === 0) return;
    this.store.applyOperations(contentOps);
    if (options?.skipJournal) {
      for (const l of this.changeListeners) l(ops);
      return;
    }
    const byChapter = groupContentOpsByChapter(contentOps);
    for (const [chapter, list] of byChapter) {
      const prev = this.pendingByChapter.get(chapter) ?? [];
      this.pendingByChapter.set(chapter, [...prev, ...list]);
      this.journal.append(chapter, 'content', list);
    }
    for (const l of this.changeListeners) l(ops);
  }

  /**
   * Replace verse inline content by diffing a deep-cloned USJ with an edited verse paragraph.
   */
  editVerse(chapter: number, verse: number, newVerseText: string): void {
    const book = this.store.getBookCode();
    const sid = usfmRefToVerseSid(book, { book, chapter, verse });
    if (!sid) return;
    const before = this.store.getFullUSJ();
    const after = deepClone(before);
    if (!replaceVerseInlineInRoot(after.content as unknown[], sid, newVerseText)) return;
    const ops = diffUsjDocuments(before, after);
    this.applyContentOperations(ops);
  }

  toUSFM(chapter?: number): string {
    return this.store.toUSFM(chapter);
  }

  toUSJ(): UsjDocument {
    return this.store.getFullUSJ();
  }

  async connect(roomId?: string): Promise<void> {
    const id = roomId ?? this.opts.roomId ?? this.store.getBookCode();
    this.room = id;
    if (this.sync instanceof RealtimeSyncEngine) {
      await this.sync.connectRealtime(id);
    }
  }

  disconnect(): void {
    if (this.sync instanceof RealtimeSyncEngine) {
      this.sync.disconnectRealtime();
    }
    this.room = null;
  }

  onChange(fn: (ops: Operation[]) => void): () => void {
    this.changeListeners.add(fn);
    return () => this.changeListeners.delete(fn);
  }

  async loadJournalFromDisk(): Promise<void> {
    await this.journal.loadFromDisk();
  }

  async hydrateFromJournalSnapshot(): Promise<void> {
    await this.journal.hydrateDocumentStore(this.store);
  }

  destroy(): void {
    this.disconnect();
    this.changeListeners.clear();
  }
}

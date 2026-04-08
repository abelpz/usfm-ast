import type { DocumentStore } from '../document-store';
import type { Operation } from '../operations';
import { transformOpLists } from '../ot-transform';

import { OperationJournal } from './operation-journal';
import { DefaultSyncEngine } from './sync-engine';
import type { ChapterConflict, JournalEntry, SyncResult } from './types';

export interface JournalRemoteTransport {
  /** Fetch journal entries newer than the merged vector clock. */
  pullEntriesSince(clock: Record<string, number>): Promise<JournalEntry[]>;
  /** Push local journal entries to the remote (implementation defines deduping). */
  pushEntries(entries: JournalEntry[]): Promise<void>;
}

function isAlignmentOp(op: Operation): boolean {
  return op.type === 'alignWord' || op.type === 'unalignWord' || op.type === 'updateGroup';
}

export function contentOnly(ops: Operation[]): Operation[] {
  return ops.filter((o) => !isAlignmentOp(o));
}

/**
 * Sync engine that pushes / pulls {@link JournalEntry} batches and merges content operations with
 * {@link transformOpLists}. Alignment entries are recorded locally but not auto-merged (conflicts
 * surface via {@link ChapterConflict} when detection is added).
 */
export class JournalMergeSyncEngine extends DefaultSyncEngine {
  private lastPushFailed = false;

  constructor(
    private readonly ctx: {
      journal: OperationJournal;
      store: DocumentStore;
      transport?: JournalRemoteTransport;
      /** Uncommitted content ops per chapter (OT against remote). */
      getLocalPending?: (chapter: number) => Operation[];
    }
  ) {
    super();
    this.onConnectivityChange((online) => {
      if (online && this.lastPushFailed) {
        void this.push();
      }
    });
  }

  /**
   * Merge one remote journal entry (OT + apply). Used by {@link pull} and realtime transports.
   * @returns conflict when application fails; {@link clientPrime} updates pending local ops buffer.
   */
  applyRemoteJournalEntry(entry: JournalEntry): {
    conflict: ChapterConflict | null;
    clientPrime: Operation[];
  } {
    const added = this.ctx.journal.ingestRemote(entry);
    if (!added)
      return {
        conflict: null,
        clientPrime: contentOnly(this.ctx.getLocalPending?.(entry.chapter) ?? []),
      };

    if (entry.layer !== 'content') return { conflict: null, clientPrime: [] };

    const localPending = contentOnly(this.ctx.getLocalPending?.(entry.chapter) ?? []);
    const remoteOps = contentOnly(entry.operations);
    const { serverPrime, clientPrime } = transformOpLists(localPending, remoteOps);

    try {
      this.ctx.store.applyOperations(serverPrime);
    } catch {
      return {
        conflict: {
          chapter: entry.chapter,
          layer: 'content',
          localOps: localPending,
          remoteOps,
        },
        clientPrime,
      };
    }
    return { conflict: null, clientPrime };
  }

  override async pull(): Promise<SyncResult> {
    const base = await super.pull();
    const t = this.ctx.transport;
    if (!t || !this.isOnline) {
      return { ...base, status: this.isOnline ? base.status : 'offline' };
    }

    let remote: JournalEntry[];
    try {
      remote = await t.pullEntriesSince(this.ctx.journal.getVectorClock());
    } catch {
      return { pushed: 0, pulled: 0, conflicts: [], status: 'error' };
    }

    if (remote.length === 0) {
      return { pushed: 0, pulled: 0, conflicts: [], status: 'ok' };
    }

    const conflicts: ChapterConflict[] = [];
    let pulled = 0;

    for (const entry of remote) {
      const { conflict } = this.applyRemoteJournalEntry(entry);
      pulled++;
      if (conflict) conflicts.push(conflict);
    }

    return {
      pushed: 0,
      pulled,
      conflicts,
      status: conflicts.length > 0 ? 'conflicts' : 'ok',
    };
  }

  override async push(): Promise<SyncResult> {
    const base = await super.push();
    const t = this.ctx.transport;
    if (!t || !this.isOnline) {
      return { ...base, status: this.isOnline ? base.status : 'offline' };
    }
    const entries = this.ctx.journal.getAll();
    if (entries.length === 0) {
      return { pushed: 0, pulled: 0, conflicts: [], status: 'ok' };
    }
    try {
      await t.pushEntries(entries);
      this.lastPushFailed = false;
      await this.ctx.journal.maybeCompactAfterPush(this.ctx.store);
      return { pushed: entries.length, pulled: 0, conflicts: [], status: 'ok' };
    } catch {
      this.lastPushFailed = true;
      return { pushed: 0, pulled: 0, conflicts: [], status: 'error' };
    }
  }

  override async sync(): Promise<SyncResult> {
    const a = await this.pull();
    const b = await this.push();
    return {
      pushed: b.pushed,
      pulled: a.pulled,
      conflicts: [...a.conflicts, ...b.conflicts],
      status:
        a.status === 'error' || b.status === 'error'
          ? 'error'
          : a.conflicts.length + b.conflicts.length > 0
            ? 'conflicts'
            : 'ok',
    };
  }
}

/**
 * Live peer sync: journal + OT + optional DCS transport, plus {@link RealtimeTransport} for ops/awareness.
 */

import type { DocumentStore } from '../document-store';

import {
  JournalMergeSyncEngine,
  type JournalRemoteTransport,
} from './merge-sync-engine';
import type { MergeStrategy } from './merge-strategy';
import { OperationJournal } from './operation-journal';
import type { ChapterConflict, JournalEntry } from './types';
import type { RealtimeMessage, RealtimeTransport, PeerPresence } from './realtime-transport';

function hashColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  const colors = ['#c62828', '#1565c0', '#2e7d32', '#6a1b9a', '#ef6c00', '#00838f'];
  return colors[h % colors.length]!;
}

export interface RealtimeSyncEngineOptions {
  journal: OperationJournal;
  store: DocumentStore;
  remoteTransport?: JournalRemoteTransport;
  getLocalPending?: (chapter: number) => import('../operations').Operation[];
  /** Called after a remote journal entry is merged so pending buffers can be replaced with OT `clientPrime`. */
  onRemoteEntryApplied?: (chapter: number, clientPrime: import('../operations').Operation[]) => void;
  mergeStrategy?: MergeStrategy;
  onConflict?: (conflict: ChapterConflict) => 'accept-local' | 'accept-remote' | 'manual';
  realtimeTransport?: RealtimeTransport;
  userId: string;
  displayName?: string;
}

/**
 * Extends {@link JournalMergeSyncEngine} with a {@link RealtimeTransport} (BroadcastChannel, WebSocket, or in-process).
 */
export class RealtimeSyncEngine extends JournalMergeSyncEngine {
  private readonly rt: RealtimeTransport | undefined;
  private readonly uid: string;
  private readonly dname: string;
  private readonly peers = new Map<string, PeerPresence>();
  private unsub: Array<() => void> = [];
  private appendUnsub: (() => void) | undefined;

  constructor(private readonly opts: RealtimeSyncEngineOptions) {
    super({
      journal: opts.journal,
      store: opts.store,
      transport: opts.remoteTransport,
      getLocalPending: opts.getLocalPending,
      mergeStrategy: opts.mergeStrategy,
      onConflict: opts.onConflict,
    });
    this.rt = opts.realtimeTransport;
    this.uid = opts.userId;
    this.dname = opts.displayName ?? opts.userId;
  }

  /** Connect realtime channel and wire journal append → broadcast. */
  async connectRealtime(roomId: string): Promise<void> {
    if (!this.rt) return;
    await this.rt.connect(roomId, this.uid);
    this.unsub.push(
      this.rt.onMessage((msg) => {
        this.handleRealtimeMessage(msg);
      })
    );
    this.unsub.push(
      this.rt.onPeerJoin((p) => {
        this.peers.set(p.userId, p);
      })
    );
    this.unsub.push(
      this.rt.onPeerLeave((id) => {
        this.peers.delete(id);
      })
    );

    this.appendUnsub = this.opts.journal.onAppend((entry) => {
      this.rt?.send({
        type: 'ops',
        senderId: this.uid,
        payload: entry,
      });
    });
  }

  disconnectRealtime(): void {
    for (const u of this.unsub) u();
    this.unsub = [];
    this.appendUnsub?.();
    this.appendUnsub = undefined;
    this.rt?.disconnect();
  }

  private handleRealtimeMessage(msg: RealtimeMessage): void {
    if (msg.senderId === this.uid) return;
    if (msg.type === 'awareness' && msg.payload && typeof msg.payload === 'object') {
      const p = msg.payload as PeerPresence;
      this.peers.set(p.userId, { ...p, lastSeen: Date.now() });
      return;
    }
    if (msg.type === 'ops' && msg.payload) {
      const entry = msg.payload as JournalEntry;
      const { clientPrime } = this.applyRemoteJournalEntry(entry);
      this.opts.onRemoteEntryApplied?.(entry.chapter, clientPrime);
      return;
    }
    if (msg.type === 'sync-request') {
      const clock = this.opts.journal.getVectorClock();
      this.rt?.send({
        type: 'sync-response',
        senderId: this.uid,
        payload: { clock, entries: this.opts.journal.getAll() },
      });
      return;
    }
    if (msg.type === 'sync-response' && msg.payload && typeof msg.payload === 'object') {
      const data = msg.payload as { entries?: JournalEntry[] };
      const entries = data.entries ?? [];
      for (const e of entries) {
        const { clientPrime } = this.applyRemoteJournalEntry(e);
        this.opts.onRemoteEntryApplied?.(e.chapter, clientPrime);
      }
    }
  }

  getPeers(): PeerPresence[] {
    return [...this.peers.values()];
  }

  updateLocalPresence(cursor?: PeerPresence['cursor'], selection?: PeerPresence['selection']): void {
    const p: PeerPresence = {
      userId: this.uid,
      displayName: this.dname,
      color: hashColor(this.uid),
      cursor,
      selection,
      lastSeen: Date.now(),
    };
    this.rt?.send({ type: 'awareness', senderId: this.uid, payload: p });
  }

  requestSyncFromPeers(): void {
    this.rt?.send({
      type: 'sync-request',
      senderId: this.uid,
      payload: { clock: this.opts.journal.getVectorClock() },
    });
  }
}

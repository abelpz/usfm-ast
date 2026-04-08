/**
 * In-memory real-time transport for tests and multi-agent orchestration (same process).
 */

import type { PeerPresence, RealtimeMessage, RealtimeTransport } from './realtime-transport';

type RelayMember = {
  userId: string;
  transport: InProcessTransport;
  presence: PeerPresence;
};

/**
 * Creates paired {@link InProcessTransport} instances that relay messages to every other member in the same room.
 */
export class InProcessRelay {
  private readonly members = new Map<string, RelayMember>();

  /** @internal */
  _register(roomId: string, userId: string, transport: InProcessTransport, presence: PeerPresence): void {
    void roomId;
    const member: RelayMember = { userId, transport, presence };
    for (const [, m] of this.members) {
      m.transport._emitPeerJoin(presence);
      transport._emitPeerJoin({ ...m.presence });
    }
    this.members.set(userId, member);
  }

  /** @internal */
  _unregister(userId: string): void {
    this.members.delete(userId);
    for (const [, m] of this.members) {
      m.transport._emitPeerLeave(userId);
    }
  }

  /** @internal */
  _broadcast(fromUserId: string, message: RealtimeMessage): void {
    queueMicrotask(() => {
      for (const [uid, m] of this.members) {
        if (uid === fromUserId) continue;
        m.transport._deliver(message);
      }
    });
  }

  createTransport(initialPresence?: Partial<Pick<PeerPresence, 'displayName' | 'color'>>): InProcessTransport {
    return new InProcessTransport(this, initialPresence);
  }

  dispose(): void {
    for (const uid of [...this.members.keys()]) {
      this._unregister(uid);
    }
  }
}

export class InProcessTransport implements RealtimeTransport {
  private roomIdStr: string | null = null;
  private userIdStr: string | null = null;
  private connectedFlag = false;
  private readonly msgListeners = new Set<(m: RealtimeMessage) => void>();
  private readonly joinListeners = new Set<(p: PeerPresence) => void>();
  private readonly leaveListeners = new Set<(id: string) => void>();
  private readonly connListeners = new Set<(c: boolean) => void>();
  private presence: PeerPresence;

  constructor(
    private readonly relay: InProcessRelay,
    initial?: Partial<Pick<PeerPresence, 'displayName' | 'color'>>
  ) {
    this.presence = {
      userId: '',
      displayName: initial?.displayName ?? 'Peer',
      color: initial?.color ?? '#888',
      lastSeen: Date.now(),
    };
  }

  get connected(): boolean {
    return this.connectedFlag;
  }

  async connect(roomId: string, userId: string): Promise<void> {
    this.roomIdStr = roomId;
    this.userIdStr = userId;
    this.presence.userId = userId;
    this.presence.lastSeen = Date.now();
    this.connectedFlag = true;
    this.relay._register(roomId, userId, this, this.presence);
    queueMicrotask(() => {
      for (const l of this.connListeners) l(true);
    });
  }

  disconnect(): void {
    if (this.userIdStr) {
      this.relay._unregister(this.userIdStr);
    }
    this.connectedFlag = false;
    this.roomIdStr = null;
    this.userIdStr = null;
    for (const l of this.connListeners) l(false);
  }

  send(message: RealtimeMessage): void {
    if (!this.userIdStr) return;
    this.relay._broadcast(this.userIdStr, message);
  }

  onMessage(listener: (message: RealtimeMessage) => void): () => void {
    this.msgListeners.add(listener);
    return () => this.msgListeners.delete(listener);
  }

  onPeerJoin(listener: (peer: PeerPresence) => void): () => void {
    this.joinListeners.add(listener);
    return () => this.joinListeners.delete(listener);
  }

  onPeerLeave(listener: (userId: string) => void): () => void {
    this.leaveListeners.add(listener);
    return () => this.leaveListeners.delete(listener);
  }

  onConnectionChange(listener: (connected: boolean) => void): () => void {
    this.connListeners.add(listener);
    return () => this.connListeners.delete(listener);
  }

  updatePresence(patch: Partial<PeerPresence>): void {
    this.presence = { ...this.presence, ...patch, lastSeen: Date.now() };
  }

  /** @internal */
  _deliver(message: RealtimeMessage): void {
    for (const l of this.msgListeners) l(message);
  }

  /** @internal */
  _emitPeerJoin(peer: PeerPresence): void {
    for (const l of this.joinListeners) l(peer);
  }

  /** @internal */
  _emitPeerLeave(userId: string): void {
    for (const l of this.leaveListeners) l(userId);
  }
}

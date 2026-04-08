/**
 * Same-origin tab sync via BroadcastChannel (browser only).
 */

import type { PeerPresence, RealtimeMessage, RealtimeTransport } from './realtime-transport';

const CH_PREFIX = 'usfm-collab:';
const HEARTBEAT_MS = 2000;
const STALE_MS = 6000;

type WirePayload =
  | { kind: 'msg'; message: RealtimeMessage }
  | { kind: 'hello'; presence: PeerPresence }
  | { kind: 'bye'; userId: string };

export class BroadcastChannelTransport implements RealtimeTransport {
  private channel: BroadcastChannel | null = null;
  private connectedFlag = false;
  private roomIdStr: string | null = null;
  private userIdStr: string | null = null;
  private localPresence: PeerPresence;
  private readonly msgListeners = new Set<(m: RealtimeMessage) => void>();
  private readonly joinListeners = new Set<(p: PeerPresence) => void>();
  private readonly leaveListeners = new Set<(id: string) => void>();
  private readonly connListeners = new Set<(c: boolean) => void>();
  private readonly peers = new Map<string, PeerPresence>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private staleTimer: ReturnType<typeof setInterval> | null = null;

  constructor(initialPresence?: Partial<Pick<PeerPresence, 'displayName' | 'color'>>) {
    this.localPresence = {
      userId: '',
      displayName: initialPresence?.displayName ?? 'Peer',
      color: initialPresence?.color ?? '#888',
      lastSeen: Date.now(),
    };
  }

  get connected(): boolean {
    return this.connectedFlag;
  }

  async connect(roomId: string, userId: string): Promise<void> {
    if (typeof BroadcastChannel === 'undefined') {
      throw new Error('BroadcastChannel is not available in this environment');
    }
    this.roomIdStr = roomId;
    this.userIdStr = userId;
    this.localPresence.userId = userId;
    this.localPresence.lastSeen = Date.now();
    this.channel = new BroadcastChannel(`${CH_PREFIX}${roomId}`);
    this.channel.onmessage = (ev: MessageEvent) => {
      const data = ev.data as WirePayload;
      if (!data) return;
      if (data.kind === 'msg') {
        if (data.message.senderId === userId) return;
        for (const l of this.msgListeners) l(data.message);
      } else if (data.kind === 'hello') {
        if (data.presence.userId === userId) return;
        this.peers.set(data.presence.userId, { ...data.presence, lastSeen: Date.now() });
        for (const l of this.joinListeners) l(data.presence);
      } else if (data.kind === 'bye') {
        this.peers.delete(data.userId);
        for (const l of this.leaveListeners) l(data.userId);
      }
    };
    this.connectedFlag = true;
    this.post({ kind: 'hello', presence: { ...this.localPresence } });
    this.heartbeatTimer = setInterval(() => {
      this.localPresence.lastSeen = Date.now();
      this.post({ kind: 'hello', presence: { ...this.localPresence } });
    }, HEARTBEAT_MS);
    this.staleTimer = setInterval(() => {
      const now = Date.now();
      for (const [uid, p] of this.peers) {
        if (now - p.lastSeen > STALE_MS) {
          this.peers.delete(uid);
          for (const l of this.leaveListeners) l(uid);
        }
      }
    }, HEARTBEAT_MS);
    for (const l of this.connListeners) l(true);
  }

  disconnect(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.staleTimer) clearInterval(this.staleTimer);
    this.heartbeatTimer = null;
    this.staleTimer = null;
    if (this.userIdStr) {
      this.post({ kind: 'bye', userId: this.userIdStr });
    }
    this.channel?.close();
    this.channel = null;
    this.connectedFlag = false;
    this.peers.clear();
    for (const l of this.connListeners) l(false);
  }

  send(message: RealtimeMessage): void {
    this.post({ kind: 'msg', message });
  }

  private post(payload: WirePayload): void {
    try {
      this.channel?.postMessage(payload);
    } catch {
      /* ignore */
    }
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

  updateLocalPresence(patch: Partial<PeerPresence>): void {
    this.localPresence = { ...this.localPresence, ...patch, lastSeen: Date.now() };
    if (this.connectedFlag) {
      this.post({ kind: 'hello', presence: { ...this.localPresence } });
    }
  }
}

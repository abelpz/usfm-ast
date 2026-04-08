/**
 * WebSocket relay client (browser or Node with `WebSocket` global).
 */

import type { PeerPresence, RealtimeMessage, RealtimeTransport } from './realtime-transport';

const PING_MS = 15000;
const BACKOFF_START_MS = 1000;
const BACKOFF_MAX_MS = 30000;

type ServerMessage =
  | { type: 'relay'; message: RealtimeMessage }
  | { type: 'peer-join'; peer: PeerPresence }
  | { type: 'peer-leave'; userId: string }
  | { type: 'pong' };

export class WebSocketRelayTransport implements RealtimeTransport {
  private ws: WebSocket | null = null;
  private connectedFlag = false;
  private roomIdStr: string | null = null;
  private userIdStr: string | null = null;
  private readonly url: string;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffMs = BACKOFF_START_MS;
  private readonly msgListeners = new Set<(m: RealtimeMessage) => void>();
  private readonly joinListeners = new Set<(p: PeerPresence) => void>();
  private readonly leaveListeners = new Set<(id: string) => void>();
  private readonly connListeners = new Set<(c: boolean) => void>();
  private localPresence: PeerPresence;
  private shouldReconnect = false;

  constructor(
    relayUrl: string,
    initialPresence?: Partial<Pick<PeerPresence, 'displayName' | 'color'>>
  ) {
    this.url = relayUrl.replace(/\/$/, '');
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
    if (typeof WebSocket === 'undefined') {
      throw new Error('WebSocket is not available in this environment');
    }
    this.shouldReconnect = true;
    this.roomIdStr = roomId;
    this.userIdStr = userId;
    this.localPresence.userId = userId;
    await this.openSocket();
  }

  private async openSocket(): Promise<void> {
    const roomId = this.roomIdStr;
    const userId = this.userIdStr;
    if (!roomId || !userId) return;

    return new Promise((resolve, reject) => {
      let settled = false;
      try {
        const wsUrl = `${this.url}/rooms/${encodeURIComponent(roomId)}`;
        const ws = new WebSocket(wsUrl);
        this.ws = ws;
        ws.onopen = () => {
          this.backoffMs = BACKOFF_START_MS;
          ws.send(
            JSON.stringify({
              type: 'join',
              roomId,
              userId,
              presence: this.localPresence,
            })
          );
          this.connectedFlag = true;
          for (const l of this.connListeners) l(true);
          this.pingTimer = setInterval(() => {
            try {
              ws.send(JSON.stringify({ type: 'ping' }));
            } catch {
              /* ignore */
            }
          }, PING_MS);
          if (!settled) {
            settled = true;
            resolve();
          }
        };
        ws.onmessage = (ev) => {
          try {
            const data = JSON.parse(String(ev.data)) as ServerMessage;
            if (data.type === 'relay' && data.message) {
              for (const l of this.msgListeners) l(data.message);
            } else if (data.type === 'peer-join' && data.peer) {
              for (const l of this.joinListeners) l(data.peer);
            } else if (data.type === 'peer-leave' && data.userId) {
              for (const l of this.leaveListeners) l(data.userId);
            }
          } catch {
            /* ignore */
          }
        };
        ws.onerror = () => {
          if (!settled) {
            settled = true;
            reject(new Error('WebSocket error'));
          }
        };
        ws.onclose = () => {
          this.connectedFlag = false;
          if (this.pingTimer) clearInterval(this.pingTimer);
          this.pingTimer = null;
          for (const l of this.connListeners) l(false);
          if (this.shouldReconnect && this.roomIdStr && this.userIdStr) {
            this.reconnectTimer = setTimeout(() => {
              this.backoffMs = Math.min(this.backoffMs * 2, BACKOFF_MAX_MS);
              void this.openSocket();
            }, this.backoffMs);
          }
        };
      } catch (e) {
        if (!settled) reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
    this.connectedFlag = false;
  }

  send(message: RealtimeMessage): void {
    try {
      this.ws?.send(JSON.stringify({ type: 'relay', message }));
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
    try {
      this.ws?.send(JSON.stringify({ type: 'presence', presence: this.localPresence }));
    } catch {
      /* ignore */
    }
  }
}

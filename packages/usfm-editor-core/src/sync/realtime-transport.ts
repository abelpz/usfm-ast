/**
 * Browser / Node-agnostic real-time collaboration transport (ops + awareness).
 */

export interface PeerPresence {
  userId: string;
  displayName: string;
  color: string;
  cursor?: { chapter: number; pos: number };
  selection?: { chapter: number; from: number; to: number };
  lastSeen: number;
}

export interface RealtimeMessage {
  type: 'ops' | 'awareness' | 'sync-request' | 'sync-response';
  senderId: string;
  payload: unknown;
}

export interface RealtimeTransport {
  readonly connected: boolean;
  connect(roomId: string, userId: string): Promise<void>;
  disconnect(): void;
  send(message: RealtimeMessage): void;
  onMessage(listener: (message: RealtimeMessage) => void): () => void;
  onPeerJoin(listener: (peer: PeerPresence) => void): () => void;
  onPeerLeave(listener: (userId: string) => void): () => void;
  onConnectionChange(listener: (connected: boolean) => void): () => void;
}

/** Fan out a message to every transport (e.g. BroadcastChannel + WebSocket). */
export class CompositeRealtimeTransport implements RealtimeTransport {
  private _connected = false;

  constructor(private readonly transports: RealtimeTransport[]) {}

  get connected(): boolean {
    return this._connected;
  }

  async connect(roomId: string, userId: string): Promise<void> {
    await Promise.all(this.transports.map((t) => t.connect(roomId, userId)));
    this._connected = true;
  }

  disconnect(): void {
    for (const t of this.transports) t.disconnect();
    this._connected = false;
  }

  send(message: RealtimeMessage): void {
    for (const t of this.transports) t.send(message);
  }

  onMessage(listener: (message: RealtimeMessage) => void): () => void {
    const unsubs = this.transports.map((t) => t.onMessage(listener));
    return () => unsubs.forEach((u) => u());
  }

  onPeerJoin(listener: (peer: PeerPresence) => void): () => void {
    const unsubs = this.transports.map((t) => t.onPeerJoin(listener));
    return () => unsubs.forEach((u) => u());
  }

  onPeerLeave(listener: (userId: string) => void): () => void {
    const unsubs = this.transports.map((t) => t.onPeerLeave(listener));
    return () => unsubs.forEach((u) => u());
  }

  onConnectionChange(listener: (connected: boolean) => void): () => void {
    const unsubs = this.transports.map((t) => t.onConnectionChange(listener));
    return () => unsubs.forEach((u) => u());
  }
}

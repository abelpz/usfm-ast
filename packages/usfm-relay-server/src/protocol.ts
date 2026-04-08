/**
 * Wire protocol for the USFM collaboration WebSocket relay.
 * Kept in sync with @usfm-tools/editor-core WebSocketRelayTransport.
 */

export interface PeerPresenceWire {
  userId: string;
  displayName: string;
  color: string;
  cursor?: { chapter: number; pos: number };
  selection?: { chapter: number; from: number; to: number };
  lastSeen: number;
}

/** Client → server (JSON over WebSocket). */
export type ClientMessage =
  | { type: 'join'; roomId: string; userId: string; presence: PeerPresenceWire }
  | {
      type: 'relay';
      message: { type: string; senderId: string; payload: unknown };
    }
  | { type: 'presence'; presence: PeerPresenceWire }
  | { type: 'ping' };

/** Server → client (JSON over WebSocket). */
export type ServerMessage =
  | {
      type: 'relay';
      message: { type: string; senderId: string; payload: unknown };
    }
  | { type: 'peer-join'; peer: PeerPresenceWire }
  | { type: 'peer-leave'; userId: string }
  | { type: 'pong' };

export const PING_FRAME = '{"type":"ping"}';
export const PONG_FRAME = '{"type":"pong"}';

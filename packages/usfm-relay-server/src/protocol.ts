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
  /** What the person is on in an app that is not an editor (a note of a checklist), and whether they are writing. */
  focus?: { item: string; doing: 'viewing' | 'writing' };
  /** Set by the server when it receives the presence. */
  lastSeen: number;
}

/** Client → server (JSON over WebSocket). */
export type ClientMessage =
  | { type: 'join'; roomId: string; userId: string; presence: PeerPresenceWire; auth?: { token: string } }
  | {
      type: 'relay';
      message: { type: string; senderId: string; payload: unknown };
    }
  | { type: 'presence'; presence: PeerPresenceWire }
  | { type: 'ping' };

/** Why a join was refused: no valid sign-in, no access to the room's repository, a room it may not open, or full. */
export type DeniedReason = 'auth' | 'access' | 'room' | 'full';

/** Server → client (JSON over WebSocket). */
export type ServerMessage =
  | {
      type: 'relay';
      message: { type: string; senderId: string; payload: unknown };
    }
  | { type: 'peer-join'; peer: PeerPresenceWire }
  | { type: 'peer-leave'; userId: string }
  | { type: 'denied'; reason: DeniedReason }
  | { type: 'pong' };

export const PING_FRAME = '{"type":"ping"}';
export const PONG_FRAME = '{"type":"pong"}';

/** WebSocket close code after `denied`. */
export const DENIED_CLOSE = 4403;

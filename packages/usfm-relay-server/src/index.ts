/**
 * WebSocket relay: one Durable Object per room; forwards ops + awareness.
 *
 * Deployed for a Door43 app (AUTH_MODE=door43), a join must bring a Door43 token that can read the repository the
 * room names (`host|owner/repo|key`), and the person is known by their Door43 login, not by what the app says.
 */

import { DurableObject } from 'cloudflare:workers';
import { checkDoor43, hostAllowed, parseRoom } from './door43';
import type { ClientMessage, DeniedReason, PeerPresenceWire, ServerMessage } from './protocol';
import { DENIED_CLOSE, PING_FRAME, PONG_FRAME } from './protocol';

const DEFAULT_MAX_MESSAGE_BYTES = 65536;
const DEFAULT_MAX_PEERS = 50;
const ROOM_HEADER = 'X-Relay-Room';

/** What a socket carries across hibernation: its room from the start, who it is once joined. */
interface Attachment {
  room: string;
  userId?: string;
  presence?: PeerPresenceWire;
}

interface Joined extends Attachment {
  userId: string;
  presence: PeerPresenceWire;
}

function readAttachment(ws: WebSocket): Attachment | null {
  try {
    const raw = ws.deserializeAttachment();
    if (raw == null) return null;
    const s = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
    const o = JSON.parse(s) as Attachment;
    return o && typeof o === 'object' ? o : null;
  } catch {
    return null;
  }
}

function joinedOf(ws: WebSocket): Joined | null {
  const att = readAttachment(ws);
  return att && typeof att.userId === 'string' && att.presence && typeof att.presence.userId === 'string' ? (att as Joined) : null;
}

function setAttachment(ws: WebSocket, data: Attachment): void {
  ws.serializeAttachment(JSON.stringify(data));
}

function send(ws: WebSocket, msg: ServerMessage): void {
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    /* ignore */
  }
}

const numberOr = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const listOf = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map((one) => one.trim())
    .filter(Boolean);

export class RelayRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING_FRAME, PONG_FRAME));
  }

  async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get('Upgrade');
    if (upgrade?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket Upgrade', {
        status: 426,
        headers: { Connection: 'Upgrade', Upgrade: 'websocket' },
      });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    setAttachment(server, { room: request.headers.get(ROOM_HEADER) ?? '' });
    return new Response(null, { status: 101, webSocket: client });
  }

  /** The other joined sockets of the room. */
  private others(ws: WebSocket): { ws: WebSocket; peer: Joined }[] {
    return this.ctx
      .getWebSockets()
      .filter((w) => w !== ws)
      .map((w) => ({ ws: w, peer: joinedOf(w) }))
      .filter((row): row is { ws: WebSocket; peer: Joined } => Boolean(row.peer));
  }

  private deny(ws: WebSocket, reason: DeniedReason): void {
    send(ws, { type: 'denied', reason });
    try {
      ws.close(DENIED_CLOSE, reason);
    } catch {
      /* ignore */
    }
  }

  /** Who joins: their Door43 login when the relay asks for it, else who they say they are. */
  private async whoJoins(ws: WebSocket, data: Extract<ClientMessage, { type: 'join' }>): Promise<{ userId: string; name?: string } | DeniedReason> {
    if (this.env.AUTH_MODE !== 'door43') return { userId: data.userId };
    const room = parseRoom(readAttachment(ws)?.room || data.roomId);
    if (!room || !hostAllowed(room.host, this.env.ALLOWED_HOSTS)) return 'room';
    const token = data.auth?.token?.trim();
    if (!token) return 'auth';
    const checked = await checkDoor43({ host: room.host, owner: room.owner, repo: room.repo, token });
    if ('denied' in checked) return checked.denied;
    return { userId: checked.login, name: checked.name };
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const size = typeof message === 'string' ? new TextEncoder().encode(message).byteLength : message.byteLength;
    if (size > numberOr(this.env.MAX_MESSAGE_BYTES, DEFAULT_MAX_MESSAGE_BYTES)) return;
    const text = typeof message === 'string' ? message : new TextDecoder().decode(message);
    let data: ClientMessage;
    try {
      data = JSON.parse(text) as ClientMessage;
    } catch {
      return;
    }

    if (data.type === 'ping') {
      return;
    }

    if (data.type === 'join') {
      // Without sign-in a join is answered at once, as before: awaiting nothing still lets another message in first.
      const who = this.env.AUTH_MODE === 'door43' ? await this.whoJoins(ws, data) : { userId: data.userId };
      if (typeof who === 'string') return this.deny(ws, who);
      const people = new Set(this.others(ws).map((row) => row.peer.userId));
      people.delete(who.userId);
      if (people.size >= numberOr(this.env.MAX_PEERS, DEFAULT_MAX_PEERS)) return this.deny(ws, 'full');

      const presence: PeerPresenceWire = {
        ...data.presence,
        userId: who.userId,
        displayName: who.name ?? data.presence?.displayName ?? who.userId,
        lastSeen: Date.now(),
      };
      setAttachment(ws, { room: readAttachment(ws)?.room ?? '', userId: who.userId, presence });

      const others = this.others(ws);
      for (const other of others) send(ws, { type: 'peer-join', peer: other.peer.presence });
      for (const other of others) send(other.ws, { type: 'peer-join', peer: presence });
      return;
    }

    const self = joinedOf(ws);
    if (!self) {
      return;
    }

    if (data.type === 'relay') {
      for (const other of this.others(ws)) send(other.ws, { type: 'relay', message: data.message });
      return;
    }

    if (data.type === 'presence') {
      // Who it is stays what the join said (with sign-in, also the name Door43 gave); the time is the server's.
      const presence: PeerPresenceWire = {
        ...data.presence,
        userId: self.userId,
        ...(this.env.AUTH_MODE === 'door43' ? { displayName: self.presence.displayName } : {}),
        lastSeen: Date.now(),
      };
      setAttachment(ws, { ...self, presence });
      for (const other of this.others(ws)) send(other.ws, { type: 'peer-join', peer: presence });
    }
  }

  /** A person leaves when their last socket in the room goes: closing a phone does not take them off a laptop. */
  private left(ws: WebSocket): void {
    const self = joinedOf(ws);
    if (!self) return;
    const others = this.others(ws);
    if (others.some((row) => row.peer.userId === self.userId)) return;
    for (const other of others) send(other.ws, { type: 'peer-leave', userId: self.userId });
  }

  async webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {
    this.left(ws);
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    this.left(ws);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const m = /^\/rooms\/([^/]+)\/?$/.exec(url.pathname);
    if (!m) {
      return new Response('Not Found', { status: 404 });
    }
    const origins = listOf(env.ALLOWED_ORIGINS);
    if (origins.length && !origins.includes(request.headers.get('Origin') ?? '')) {
      return new Response('Forbidden', { status: 403 });
    }
    const roomId = decodeURIComponent(m[1]!);
    const id = env.RELAY_ROOM.idFromName(roomId);
    const forwarded = new Request(request);
    forwarded.headers.set(ROOM_HEADER, roomId);
    return env.RELAY_ROOM.get(id).fetch(forwarded);
  },
};

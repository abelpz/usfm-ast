/**
 * WebSocket relay: one Durable Object per room; forwards ops + awareness.
 */

import { DurableObject } from 'cloudflare:workers';
import type { ClientMessage, PeerPresenceWire, ServerMessage } from './protocol';
import { PING_FRAME, PONG_FRAME } from './protocol';

interface Attachment {
  userId: string;
  presence: PeerPresenceWire;
}

function parseAttachment(ws: WebSocket): Attachment | null {
  try {
    const raw = ws.deserializeAttachment();
    if (raw == null) return null;
    const s = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
    const o = JSON.parse(s) as Attachment;
    if (o && typeof o.userId === 'string' && o.presence && typeof o.presence.userId === 'string') {
      return o;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function setAttachment(ws: WebSocket, data: Attachment): void {
  const s = JSON.stringify(data);
  ws.serializeAttachment(s);
}

function send(ws: WebSocket, msg: ServerMessage): void {
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    /* ignore */
  }
}

export class RelayRoom extends DurableObject {
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
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
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
      const presence: PeerPresenceWire = {
        ...data.presence,
        userId: data.userId,
        lastSeen: data.presence.lastSeen ?? Date.now(),
      };
      const att: Attachment = { userId: data.userId, presence };
      setAttachment(ws, att);

      const others = this.ctx.getWebSockets().filter((w) => w !== ws);
      for (const other of others) {
        const peer = parseAttachment(other);
        if (peer) {
          send(ws, { type: 'peer-join', peer: peer.presence });
        }
      }
      for (const other of others) {
        if (parseAttachment(other)) {
          send(other, { type: 'peer-join', peer: presence });
        }
      }
      return;
    }

    const self = parseAttachment(ws);
    if (!self) {
      return;
    }

    if (data.type === 'relay') {
      for (const other of this.ctx.getWebSockets()) {
        if (other === ws) continue;
        if (!parseAttachment(other)) continue;
        send(other, { type: 'relay', message: data.message });
      }
      return;
    }

    if (data.type === 'presence') {
      const presence: PeerPresenceWire = {
        ...data.presence,
        userId: self.userId,
        lastSeen: data.presence.lastSeen ?? Date.now(),
      };
      setAttachment(ws, { userId: self.userId, presence });
      for (const other of this.ctx.getWebSockets()) {
        if (other === ws) continue;
        if (!parseAttachment(other)) continue;
        send(other, { type: 'peer-join', peer: presence });
      }
    }
  }

  async webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {
    const att = parseAttachment(ws);
    if (!att) return;
    for (const other of this.ctx.getWebSockets()) {
      if (other === ws) continue;
      if (!parseAttachment(other)) continue;
      send(other, { type: 'peer-leave', userId: att.userId });
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const m = /^\/rooms\/([^/]+)\/?$/.exec(url.pathname);
    if (!m) {
      return new Response('Not Found', { status: 404 });
    }
    const roomId = decodeURIComponent(m[1]!);
    const id = env.RELAY_ROOM.idFromName(roomId);
    return env.RELAY_ROOM.get(id).fetch(request);
  },
};

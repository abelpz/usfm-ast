import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { ServerMessage } from '../src/protocol';

/**
 * Vitest pool workers run inside workerd; `CI` is not always visible here — use an explicit flag.
 * - GitHub Actions Test step sets `RUN_RELAY_POOL_TESTS=1` (Linux).
 * - Locally: `RUN_RELAY_POOL_TESTS=1 bun run test` in this package, or rely on `protocol.test.ts` only.
 */
const runRelayPoolTests = process.env.RUN_RELAY_POOL_TESTS === '1';

const BASE = 'http://relay.test';

function connectRoom(room: string) {
  return SELF.fetch(`${BASE}/rooms/${encodeURIComponent(room)}`, {
    headers: { Upgrade: 'websocket' },
  });
}

function presence(userId: string, displayName: string, color: string) {
  return {
    userId,
    displayName,
    color,
    lastSeen: Date.now(),
  };
}

async function openClient(room: string) {
  const res = await connectRoom(room);
  expect(res.status).toBe(101);
  const ws = res.webSocket;
  expect(ws).toBeTruthy();
  ws!.accept();
  return ws!;
}

function nextJson(ws: WebSocket, timeoutMs = 5000): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting for message')), timeoutMs);
    ws.addEventListener('message', (ev) => {
      clearTimeout(t);
      try {
        resolve(JSON.parse(String(ev.data)) as ServerMessage);
      } catch (e) {
        reject(e);
      }
    });
  });
}

describe.skipIf(!runRelayPoolTests)('RelayRoom', () => {
  it('returns 404 for unknown path', async () => {
    const res = await SELF.fetch(`${BASE}/nope`, { headers: { Upgrade: 'websocket' } });
    expect(res.status).toBe(404);
  });

  it('returns 426 without WebSocket upgrade', async () => {
    const res = await SELF.fetch(`${BASE}/rooms/r1`);
    expect(res.status).toBe(426);
  });

  it('peer-join when second client joins', async () => {
    const wsA = await openClient('iso-room-a');
    wsA.send(
      JSON.stringify({
        type: 'join',
        roomId: 'iso-room-a',
        userId: 'a',
        presence: presence('a', 'A', '#111'),
      })
    );

    const wsB = await openClient('iso-room-a');
    const bJoinPromise = nextJson(wsB);
    wsB.send(
      JSON.stringify({
        type: 'join',
        roomId: 'iso-room-a',
        userId: 'b',
        presence: presence('b', 'B', '#222'),
      })
    );

    const fromA = await nextJson(wsA);
    const forB = await bJoinPromise;

    expect(fromA.type).toBe('peer-join');
    if (fromA.type === 'peer-join') {
      expect(fromA.peer.userId).toBe('b');
    }
    expect(forB.type).toBe('peer-join');
    if (forB.type === 'peer-join') {
      expect(forB.peer.userId).toBe('a');
    }

    wsA.close();
    wsB.close();
  });

  it('relays messages between peers', async () => {
    const wsA = await openClient('relay-msg');
    const wsB = await openClient('relay-msg');
    wsA.send(
      JSON.stringify({
        type: 'join',
        roomId: 'relay-msg',
        userId: 'a',
        presence: presence('a', 'A', '#111'),
      })
    );
    wsB.send(
      JSON.stringify({
        type: 'join',
        roomId: 'relay-msg',
        userId: 'b',
        presence: presence('b', 'B', '#222'),
      })
    );
    await nextJson(wsA);
    await nextJson(wsB);

    const gotB = nextJson(wsB);
    wsA.send(
      JSON.stringify({
        type: 'relay',
        message: { type: 'ops', senderId: 'a', payload: { x: 1 } },
      })
    );
    const msg = await gotB;
    expect(msg.type).toBe('relay');
    if (msg.type === 'relay') {
      expect(msg.message.senderId).toBe('a');
      expect((msg.message.payload as { x: number }).x).toBe(1);
    }

    wsA.close();
    wsB.close();
  });

  it('presence update broadcasts peer-join', async () => {
    const wsA = await openClient('presence-room');
    const wsB = await openClient('presence-room');
    wsA.send(
      JSON.stringify({
        type: 'join',
        roomId: 'presence-room',
        userId: 'a',
        presence: presence('a', 'A', '#111'),
      })
    );
    wsB.send(
      JSON.stringify({
        type: 'join',
        roomId: 'presence-room',
        userId: 'b',
        presence: presence('b', 'B', '#222'),
      })
    );
    await nextJson(wsA);
    await nextJson(wsB);

    const upd = nextJson(wsB);
    wsA.send(
      JSON.stringify({
        type: 'presence',
        presence: { ...presence('a', 'A2', '#999'), cursor: { chapter: 1, pos: 3 } },
      })
    );
    const m = await upd;
    expect(m.type).toBe('peer-join');
    if (m.type === 'peer-join') {
      expect(m.peer.displayName).toBe('A2');
      expect(m.peer.cursor).toEqual({ chapter: 1, pos: 3 });
    }

    wsA.close();
    wsB.close();
  });

  it('peer-leave on disconnect', async () => {
    const wsA = await openClient('leave-room');
    const wsB = await openClient('leave-room');
    wsA.send(
      JSON.stringify({
        type: 'join',
        roomId: 'leave-room',
        userId: 'a',
        presence: presence('a', 'A', '#111'),
      })
    );
    wsB.send(
      JSON.stringify({
        type: 'join',
        roomId: 'leave-room',
        userId: 'b',
        presence: presence('b', 'B', '#222'),
      })
    );
    await nextJson(wsA);
    await nextJson(wsB);

    const leave = nextJson(wsB);
    wsA.close(1000, 'bye');
    const m = await leave;
    expect(m.type).toBe('peer-leave');
    if (m.type === 'peer-leave') {
      expect(m.userId).toBe('a');
    }

    wsB.close();
  });

  it('ping receives pong via auto-response', async () => {
    const ws = await openClient('ping-room');
    ws.send(JSON.stringify({ type: 'ping' }));
    const pong = await new Promise<string>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('pong timeout')), 3000);
      ws.addEventListener('message', (ev) => {
        clearTimeout(t);
        resolve(String(ev.data));
      });
    });
    expect(pong).toBe('{"type":"pong"}');
    ws.close();
  });

  it('isolates different rooms', async () => {
    const wsA1 = await openClient('room-1');
    const wsA2 = await openClient('room-2');
    wsA1.send(
      JSON.stringify({
        type: 'join',
        roomId: 'room-1',
        userId: 'a',
        presence: presence('a', 'A', '#111'),
      })
    );
    wsA2.send(
      JSON.stringify({
        type: 'join',
        roomId: 'room-2',
        userId: 'a',
        presence: presence('a', 'A', '#111'),
      })
    );

    const wsB1 = await openClient('room-1');
    wsB1.send(
      JSON.stringify({
        type: 'join',
        roomId: 'room-1',
        userId: 'b',
        presence: presence('b', 'B', '#222'),
      })
    );

    const isolated = new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('unexpected message')), 400);
      wsA2.addEventListener('message', () => reject(new Error('should not receive')));
      setTimeout(() => {
        clearTimeout(t);
        resolve();
      }, 350);
    });
    await isolated;

    await nextJson(wsA1);

    wsA1.close();
    wsA2.close();
    wsB1.close();
  });
});

import { SELF, env, fetchMock } from 'cloudflare:test';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ServerMessage } from '../src/protocol';

/**
 * The relay as a Door43 app deploys it (vitest.auth.config.ts): AUTH_MODE=door43, ALLOWED_HOSTS=door43.test,
 * ALLOWED_ORIGINS=https://taller.test, MAX_MESSAGE_BYTES=4096, MAX_PEERS=2. Door43 is mocked with `fetchMock`.
 */
const runRelayPoolTests = env.RUN_RELAY_POOL_TESTS === '1';
const BASE = 'http://relay.test';
const DOOR43 = 'https://door43.test';
const ROOM = 'door43.test|es-419_gl/es-419_tn|EST.97.notas-textos';
const ORIGIN = 'https://taller.test';

function door43User(token: string, login: string, fullName = '') {
  fetchMock
    .get(DOOR43)
    .intercept({ path: '/api/v1/user', headers: { authorization: `token ${token}` } })
    .reply(200, JSON.stringify({ login, full_name: fullName }), { headers: { 'content-type': 'application/json' } })
    .persist();
}

function door43Repo(token: string, status: number) {
  fetchMock
    .get(DOOR43)
    .intercept({ path: '/api/v1/repos/es-419_gl/es-419_tn', headers: { authorization: `token ${token}` } })
    .reply(status, JSON.stringify(status === 200 ? { full_name: 'es-419_gl/es-419_tn' } : { message: 'not found' }), { headers: { 'content-type': 'application/json' } })
    .persist();
}

async function openClient(room: string, origin = ORIGIN) {
  const res = await SELF.fetch(`${BASE}/rooms/${encodeURIComponent(room)}`, { headers: { Upgrade: 'websocket', Origin: origin } });
  expect(res.status).toBe(101);
  const ws = res.webSocket!;
  ws.accept();
  return ws;
}

function messages(ws: WebSocket) {
  const got: ServerMessage[] = [];
  const closed = { code: 0 };
  ws.addEventListener('message', (ev) => got.push(JSON.parse(String(ev.data)) as ServerMessage));
  ws.addEventListener('close', (ev) => (closed.code = ev.code));
  return {
    got,
    closed,
    next: async (type: ServerMessage['type'], timeoutMs = 3000) => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const found = got.find((m) => m.type === type);
        if (found) {
          got.splice(got.indexOf(found), 1);
          return found;
        }
        await new Promise((r) => setTimeout(r, 20));
      }
      throw new Error(`timeout waiting for ${type}`);
    },
  };
}

const join = (room: string, token?: string, userId = 'whoever') =>
  JSON.stringify({ type: 'join', roomId: room, userId, presence: { userId, displayName: userId, color: '#111', lastSeen: 0 }, ...(token ? { auth: { token } } : {}) });

describe.skipIf(!runRelayPoolTests)('relay with Door43 sign-in', () => {
  beforeAll(() => {
    fetchMock.activate();
    fetchMock.disableNetConnect();
    door43User('ana-token', 'Ana', 'Ana Pérez');
    door43Repo('ana-token', 200);
    door43User('bea-token', 'bea');
    door43Repo('bea-token', 200);
    door43User('carla-token', 'carla');
    door43Repo('carla-token', 200);
    door43User('dina-token', 'dina');
    door43Repo('dina-token', 404);
    fetchMock
      .get(DOOR43)
      .intercept({ path: '/api/v1/user', headers: { authorization: 'token bad-token' } })
      .reply(401, '{}')
      .persist();
  });
  afterEach(() => undefined);

  it('denies join without token when AUTH_MODE=door43', async () => {
    const ws = await openClient(ROOM);
    const box = messages(ws);
    ws.send(join(ROOM));
    const denied = await box.next('denied');
    expect(denied).toEqual({ type: 'denied', reason: 'auth' });
  });

  it('denies an expired token', async () => {
    const ws = await openClient(ROOM);
    const box = messages(ws);
    ws.send(join(ROOM, 'bad-token'));
    expect(await box.next('denied')).toEqual({ type: 'denied', reason: 'auth' });
  });

  it('denies a host not in ALLOWED_HOSTS', async () => {
    const room = 'evil.example|es-419_gl/es-419_tn|EST.97.notas-textos';
    const ws = await openClient(room);
    const box = messages(ws);
    ws.send(join(room, 'ana-token'));
    expect(await box.next('denied')).toEqual({ type: 'denied', reason: 'room' });
  });

  it('denies a room that is not host|owner/repo|key', async () => {
    const ws = await openClient('just-a-name');
    const box = messages(ws);
    ws.send(join('just-a-name', 'ana-token'));
    expect(await box.next('denied')).toEqual({ type: 'denied', reason: 'room' });
  });

  it('denies a user who cannot read the repository', async () => {
    const ws = await openClient(ROOM);
    const box = messages(ws);
    ws.send(join(ROOM, 'dina-token'));
    expect(await box.next('denied')).toEqual({ type: 'denied', reason: 'access' });
  });

  it('rejects a connection from another origin', async () => {
    const res = await SELF.fetch(`${BASE}/rooms/${encodeURIComponent(ROOM)}`, { headers: { Upgrade: 'websocket', Origin: 'https://evil.example' } });
    expect(res.status).toBe(403);
  });

  it('uses the Door43 login, not the client userId', async () => {
    const room = `${ROOM}.login`;
    const a = await openClient(room);
    const boxA = messages(a);
    a.send(join(room, 'ana-token', 'bea'));
    const b = await openClient(room);
    const boxB = messages(b);
    b.send(join(room, 'bea-token', 'bea'));
    const seenByB = await boxB.next('peer-join');
    expect(seenByB.type === 'peer-join' && seenByB.peer.userId).toBe('ana');
    expect(seenByB.type === 'peer-join' && seenByB.peer.displayName).toBe('Ana Pérez');
    const seenByA = await boxA.next('peer-join');
    expect(seenByA.type === 'peer-join' && seenByA.peer.userId).toBe('bea');
    a.close();
    b.close();
  });

  it('drops messages over MAX_MESSAGE_BYTES', async () => {
    const room = `${ROOM}.big`;
    const a = await openClient(room);
    a.send(join(room, 'ana-token'));
    const b = await openClient(room);
    const boxB = messages(b);
    b.send(join(room, 'bea-token'));
    await boxB.next('peer-join');
    a.send(JSON.stringify({ type: 'relay', message: { type: 'big', senderId: 'ana', payload: 'x'.repeat(5000) } }));
    a.send(JSON.stringify({ type: 'relay', message: { type: 'small', senderId: 'ana', payload: 'ok' } }));
    const relayed = await boxB.next('relay');
    expect(relayed.type === 'relay' && relayed.message.type).toBe('small');
    a.close();
    b.close();
  });

  it('denies join when the room is full', async () => {
    const room = `${ROOM}.full`;
    const a = await openClient(room);
    a.send(join(room, 'ana-token'));
    const b = await openClient(room);
    const boxB = messages(b);
    b.send(join(room, 'bea-token'));
    await boxB.next('peer-join');
    const c = await openClient(room);
    const boxC = messages(c);
    c.send(join(room, 'carla-token'));
    expect(await boxC.next('denied')).toEqual({ type: 'denied', reason: 'full' });
    a.close();
    b.close();
  });
});

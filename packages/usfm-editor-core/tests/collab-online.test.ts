/**
 * End-to-end: HeadlessCollabSession + WebSocketRelayTransport against a running relay.
 * Requires `RELAY_URL` (e.g. ws://127.0.0.1:8787) and a global WebSocket (Node 22+ or polyfill via `ws`).
 *
 * Local: start relay (`cd packages/usfm-relay-server && bun run dev`), then:
 *   RELAY_URL=ws://127.0.0.1:8787 bun run test -- tests/collab-online.test.ts
 *
 * CI: skipped unless RELAY_URL is set (optional job).
 */

import WebSocketImpl from 'ws';

import { HeadlessCollabSession, WebSocketRelayTransport } from '../dist';

const RELAY_URL = process.env.RELAY_URL;

if (!globalThis.WebSocket) {
  (globalThis as unknown as { WebSocket: typeof WebSocketImpl }).WebSocket =
    WebSocketImpl as unknown as typeof globalThis.WebSocket;
}

const SAMPLE = String.raw`\id TIT EN_ULT
\h Titus
\c 1
\p
\v 1 Paul, a servant of God,
\v 2 In hope of eternal life.
`;

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const runOnline = !!RELAY_URL && typeof globalThis.WebSocket !== 'undefined';

const describeOnline = runOnline ? describe : describe.skip;

function baseUrl(): string {
  const u = process.env.RELAY_URL;
  if (!u) throw new Error('RELAY_URL is required for online collab tests');
  return u.replace(/\/$/, '');
}

describeOnline('HeadlessCollabSession online (WebSocketRelayTransport)', () => {
  it('converges after edits on different verses', async () => {
    const url = baseUrl();
    const a = new HeadlessCollabSession({
      userId: 'a',
      realtimeTransport: new WebSocketRelayTransport(url, { displayName: 'A' }),
    });
    const b = new HeadlessCollabSession({
      userId: 'b',
      realtimeTransport: new WebSocketRelayTransport(url, { displayName: 'B' }),
    });
    try {
      a.loadUSFM(SAMPLE);
      b.loadUSFM(SAMPLE);
      await a.connect('online-room-1');
      await b.connect('online-room-1');
      a.editVerse(1, 1, 'Online A.');
      await wait(80);
      b.editVerse(1, 2, 'Online B.');
      await wait(200);
      expect(JSON.stringify(a.toUSJ())).toBe(JSON.stringify(b.toUSJ()));
    } finally {
      a.destroy();
      b.destroy();
    }
  });

  it('isolates different rooms', async () => {
    const url = baseUrl();
    const a1 = new HeadlessCollabSession({
      userId: 'a',
      realtimeTransport: new WebSocketRelayTransport(url, { displayName: 'A1' }),
    });
    const a2 = new HeadlessCollabSession({
      userId: 'a',
      realtimeTransport: new WebSocketRelayTransport(url, { displayName: 'A2' }),
    });
    try {
      a1.loadUSFM(SAMPLE);
      a2.loadUSFM(SAMPLE);
      await a1.connect('online-isolated-1');
      await a2.connect('online-isolated-2');
      a1.editVerse(1, 1, 'Only room 1.');
      await wait(150);
      const j1 = JSON.stringify(a1.toUSJ());
      const j2 = JSON.stringify(a2.toUSJ());
      expect(j1).not.toBe(j2);
    } finally {
      a1.destroy();
      a2.destroy();
    }
  });

  it('tracks peer join via transport callbacks', async () => {
    const url = baseUrl();
    const joins: string[] = [];
    const rtA = new WebSocketRelayTransport(url, { displayName: 'PA' });
    const rtB = new WebSocketRelayTransport(url, { displayName: 'PB' });
    const unsub = rtA.onPeerJoin((p) => joins.push(p.userId));
    const a = new HeadlessCollabSession({ userId: 'a', realtimeTransport: rtA });
    const b = new HeadlessCollabSession({ userId: 'b', realtimeTransport: rtB });
    try {
      a.loadUSFM(SAMPLE);
      b.loadUSFM(SAMPLE);
      await a.connect('online-peers');
      await b.connect('online-peers');
      await wait(200);
      expect(joins).toContain('b');
    } finally {
      unsub();
      a.destroy();
      b.destroy();
    }
  });
});

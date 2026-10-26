# `@usfm-tools/relay-server`

Stateless **WebSocket relay** for real-time USFM/USJ collaboration. It forwards operational messages and awareness between peers in a **room**. Convergence and OT live in [`@usfm-tools/editor-core`](../usfm-editor-core) (`HeadlessCollabSession`, `WebSocketRelayTransport`); this Worker only routes traffic.

## Architecture

- **Cloudflare Worker** receives HTTP requests at `/rooms/:roomId`.
- **One Durable Object per room** (`RelayRoom`) holds WebSocket connections for that room.
- **WebSocket Hibernation API** (`acceptWebSocket`, `setWebSocketAutoResponse`) keeps idle rooms cheap.
- **No persistence**: disconnect and reconnect are handled by clients and the journal/sync layer.

## Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/) (free tier is enough for small teams)
- Node 18+ and `bun` or `npm` (this repo uses Bun)
- [`wrangler` CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (`bunx wrangler` or global `wrangler`)

## Local development

From the monorepo root:

```bash
bun install
cd packages/usfm-relay-server
bun run dev
```

Wrangler prints a local URL (often `http://127.0.0.1:8787`). WebSocket URL for clients:

```text
ws://127.0.0.1:8787
```

The client (`WebSocketRelayTransport`) connects to:

```text
ws://127.0.0.1:8787/rooms/<roomId>
```

(`roomId` is URL-encoded in the path.)

### Editor-core integration tests (optional)

With the dev server running:

```bash
cd packages/usfm-editor-core
RELAY_URL=ws://127.0.0.1:8787 bun run build && bunx jest tests/collab-online.test.ts
```

On Windows, use PowerShell: `$env:RELAY_URL="ws://127.0.0.1:8787"`.

## Deploy to Cloudflare

1. **Login**

   ```bash
   cd packages/usfm-relay-server
   bunx wrangler login
   ```

2. **Create / select account** in the Wrangler prompts if asked.

3. **Deploy**

   ```bash
   bun run deploy
   ```

4. **Note the printed `*.workers.dev` URL.** Use `wss://<your-worker>.<subdomain>.workers.dev` (HTTPS pages must use `wss:`).

5. **Custom domain (optional)**  
   Cloudflare dashboard → Workers & Pages → your worker → Triggers → Custom Domains.

### First-time Durable Objects

The first deploy applies the `migrations` entry in [`wrangler.jsonc`](./wrangler.jsonc). If you rename the Worker or class, follow [Durable Objects migrations](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/).

## Connecting your app

```typescript
import { HeadlessCollabSession, WebSocketRelayTransport } from '@usfm-tools/editor-core';

const relayBase = 'wss://your-worker.your-subdomain.workers.dev'; // no trailing slash
const session = new HeadlessCollabSession({
  userId: 'user-1',
  displayName: 'Translator',
  realtimeTransport: new WebSocketRelayTransport(relayBase, {
    displayName: 'Translator',
    color: '#4a90d9',
  }),
});

await session.connect('my-room-id'); // opens wss://.../rooms/my-room-id
```

Use a stable `roomId` per shared document (e.g. repo + file path).

## Wire protocol

Messages are JSON text frames.

### Client → server

| Type        | Purpose |
|------------|---------|
| `join`     | `{ type: 'join', roomId, userId, presence, auth? }` — after WebSocket open; `auth: { token }` when the relay asks for Door43 sign-in |
| `relay`    | `{ type: 'relay', message: RealtimeMessage }` — forward to other peers |
| `presence` | `{ type: 'presence', presence: PeerPresence }` — update awareness |
| `ping`     | `{ type: 'ping' }` — keepalive (auto-answered with `pong` at the edge when frames match) |

### Server → client

| Type         | Purpose |
|--------------|---------|
| `relay`      | `{ type: 'relay', message: RealtimeMessage }` |
| `peer-join`  | `{ type: 'peer-join', peer: PeerPresence }` |
| `peer-leave` | `{ type: 'peer-leave', userId }` — when the person's last socket in the room closes |
| `denied`     | `{ type: 'denied', reason: 'auth' \| 'access' \| 'room' \| 'full' }` — the join was refused; the socket closes with 4403 |
| `pong`       | `{ type: 'pong' }` — response to `ping` |

`PeerPresence` / `RealtimeMessage` match [`realtime-transport.ts`](../usfm-editor-core/src/sync/realtime-transport.ts). A presence may also carry `focus: { item, doing: 'viewing' | 'writing' }` (an app that is not an editor: the note a person is on). `lastSeen` is set by the server.

## Door43 sign-in and limits

All optional; without them the relay behaves as before (anyone may join any room).

| Variable | Meaning |
|---|---|
| `AUTH_MODE` | `door43`: a room is `host\|owner/repo\|key`; the join must bring a Door43 token (`auth.token`) that can read `owner/repo` on `host`. The person is known by their Door43 login and full name, not by what the app sends. |
| `ALLOWED_HOSTS` | Door43 hosts a room may name, comma separated: `git.door43.org,qa.door43.org`. `localhost:PORT` is spoken to over http (a local mock). |
| `ALLOWED_ORIGINS` | Pages that may connect, comma separated (exact `Origin`); others get 403. |
| `MAX_MESSAGE_BYTES` | Larger messages are dropped (default 65536). |
| `MAX_PEERS` | People in one room at most (default 50); one more gets `denied: full`. |

Taller (gateway-tasks) deploys it with `AUTH_MODE=door43`, its hosts and its origin, and `MAX_MESSAGE_BYTES=4096`.

## Tests (this package)

- **`tests/protocol.test.ts`** — always runs (ping/pong frame strings).
- **`tests/relay.test.ts`** — full Durable Object + WebSocket tests via `@cloudflare/vitest-pool-workers`.
- **`tests/door43-auth.test.ts`** — the same with Door43 sign-in (`vitest.auth.config.ts` sets the variables; Door43 is mocked with `fetchMock`).

The pool tests run when **`RUN_RELAY_POOL_TESTS=1`**, which reaches the Worker runtime as a binding: `RUN_RELAY_POOL_TESTS=1 bun run test`. Storage is not isolated per test (each test uses rooms of its own), which keeps them working on Windows.

## Cost (rough)

| Resource | Typical use |
|----------|-------------|
| Worker requests | One per WebSocket upgrade + HTTP |
| Durable Object | One instance per active `roomId`; messages bill as DO requests |
| WebSocket idle | Hibernation reduces duration charges |

Small translation teams usually stay within Cloudflare free tiers; see [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

## Troubleshooting

- **`426 Upgrade Required`** — client must use WebSocket (`Upgrade: websocket`). Browsers do this automatically; Node tests need a `WebSocket` implementation (e.g. `ws` + assign to `globalThis.WebSocket`).
- **CORS** — WebSockets are not subject to same-origin CORS the same way as XHR; ensure your page uses `wss:` when the page is `https:`.
- **Wrong room** — `roomId` is taken from the URL path `/rooms/:roomId` and must match what clients pass to `connect(roomId)`.

## License

MIT (same as the monorepo).

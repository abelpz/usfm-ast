# Collaboration WebSocket relay (Cloudflare)

Real-time peer messaging for the editor stack uses a small **WebSocket relay** (ops + awareness). The relay is **not** part of OT or persistence — it only forwards JSON messages between clients in a **room**.

**Full guide (deploy, wire protocol, troubleshooting):** [`packages/usfm-relay-server/README.md`](../packages/usfm-relay-server/README.md)

**Client transport:** `WebSocketRelayTransport` in `@usfm-tools/editor-core` (`src/sync/websocket-transport.ts`) — connects to `wss://<host>/rooms/<roomId>`.

**Local dev:** from the repo root, `bun run relay:dev` (Wrangler dev). **Online integration tests:** set `RELAY_URL` and run `packages/usfm-editor-core` Jest `tests/collab-online.test.ts`.

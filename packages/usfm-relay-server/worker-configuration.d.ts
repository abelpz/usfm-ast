// Generated-style env for RelayRoom; extend when adding bindings.
interface Env {
  RELAY_ROOM: DurableObjectNamespace;
  /** "door43": a join must bring a Door43 token that can read the room's repository. Unset: anyone may join. */
  AUTH_MODE?: string;
  /** Door43 hosts a room may name, comma separated (`git.door43.org,qa.door43.org`); `localhost:*` is http. */
  ALLOWED_HOSTS?: string;
  /** Pages that may connect, comma separated; unset: any. */
  ALLOWED_ORIGINS?: string;
  /** Messages larger than this are dropped (default 65536). */
  MAX_MESSAGE_BYTES?: string;
  /** People in one room at most (default 50). */
  MAX_PEERS?: string;
  /**
   * A socket whose presence is older than this (ms) is taken as gone: not handed to newcomers, not counted, closed.
   * For clients that say their presence again regularly (Taller: every 20 s, 50000 here). Unset: off.
   */
  PRESENCE_STALE_MS?: string;
  /** Tests only: run the Worker pool tests. */
  RUN_RELAY_POOL_TESTS?: string;
}

declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {}
}

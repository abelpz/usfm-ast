// Generated-style env for RelayRoom; extend when adding bindings.
interface Env {
  RELAY_ROOM: DurableObjectNamespace;
}

declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {}
}

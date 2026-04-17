/**
 * Tauri network adapter with active reachability checks.
 *
 * `navigator.onLine` is a coarse signal — it can be `true` even behind a
 * captive portal or a link-local network with no internet. This adapter
 * supplements it with periodic HEAD requests to the Door43 host, updating a
 * `reachable` flag that `isOnline()` returns instead of the raw browser value.
 *
 * Reachability check schedule:
 *  - On `online` browser event: immediate check.
 *  - When currently "online": every 60 s.
 *  - When currently "offline": every 15 s (faster reconnect detection).
 *
 * The check uses `fetch` with a 5-second timeout and `mode: 'no-cors'`
 * (required because DCS does not send `Access-Control-Allow-Origin: *` for
 * HEAD requests). A completed fetch (even opaque) indicates the host is up.
 */
import type { NetworkAdapter } from '../interfaces/network-adapter';

const CHECK_HOST = 'https://git.door43.org';
const FETCH_TIMEOUT_MS = 5_000;
const POLL_ONLINE_MS = 60_000;
const POLL_OFFLINE_MS = 15_000;

async function checkReachable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    await fetch(CHECK_HOST, { method: 'HEAD', mode: 'no-cors', signal: controller.signal });
    clearTimeout(id);
    return true;
  } catch {
    return false;
  }
}

export class TauriNetworkAdapter implements NetworkAdapter {
  /** Current reachability state — initialised from `navigator.onLine`. */
  private _reachable: boolean =
    typeof navigator !== 'undefined' ? navigator.onLine : true;

  private _listeners: Array<(online: boolean) => void> = [];
  private _pollTimer: ReturnType<typeof setTimeout> | undefined;
  private _started = false;

  /** Start the background polling loop (called lazily on first subscriber). */
  private _start(): void {
    if (this._started) return;
    this._started = true;

    const poll = async () => {
      const wasReachable = this._reachable;
      // Only do a network probe when the browser believes we're online.
      const browserOnline =
        typeof navigator !== 'undefined' ? navigator.onLine : true;
      const nowReachable = browserOnline ? await checkReachable() : false;

      if (nowReachable !== wasReachable) {
        this._reachable = nowReachable;
        for (const cb of this._listeners) cb(nowReachable);
      }

      const delay = nowReachable ? POLL_ONLINE_MS : POLL_OFFLINE_MS;
      this._pollTimer = setTimeout(() => void poll(), delay);
    };

    // Kick off immediately.
    void poll();
  }

  private _stop(): void {
    if (this._pollTimer !== undefined) {
      clearTimeout(this._pollTimer);
      this._pollTimer = undefined;
    }
    this._started = false;
  }

  isOnline(): boolean {
    return this._reachable;
  }

  onStatusChange(cb: (online: boolean) => void): () => void {
    if (typeof window === 'undefined') return () => {};

    this._listeners.push(cb);
    this._start();

    // Also respond immediately to browser online/offline events so the UI
    // reacts quickly (the poll then confirms the actual state).
    const onOnline = async () => {
      const reachable = await checkReachable();
      if (reachable !== this._reachable) {
        this._reachable = reachable;
        for (const listener of this._listeners) listener(reachable);
      }
    };
    const onOffline = () => {
      if (this._reachable) {
        this._reachable = false;
        for (const listener of this._listeners) listener(false);
      }
    };

    window.addEventListener('online', () => void onOnline());
    window.addEventListener('offline', onOffline);

    return () => {
      this._listeners = this._listeners.filter((l) => l !== cb);
      window.removeEventListener('online', () => void onOnline());
      window.removeEventListener('offline', onOffline);
      if (this._listeners.length === 0) this._stop();
    };
  }
}

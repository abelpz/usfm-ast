/**
 * Capacitor network adapter backed by `@capacitor/network`.
 *
 * Significantly more accurate than `navigator.onLine` on mobile:
 * - Distinguishes WiFi vs. cellular.
 * - Detects captive portals (portal state reported as offline until login).
 * - Fires `statusChange` events when switching network types.
 *
 * NOTE: Only available inside a Capacitor runtime.
 */
import type { NetworkAdapter } from '../interfaces/network-adapter';

export class CapacitorNetworkAdapter implements NetworkAdapter {
  private _online = true;
  private _ready = false;

  private async ensureReady(): Promise<void> {
    if (this._ready) return;
    const { Network } = await import('@capacitor/network');
    const status = await Network.getStatus();
    this._online = status.connected;
    this._ready = true;
  }

  isOnline(): boolean {
    // Sync snapshot — may be slightly stale before first `onStatusChange` call.
    return this._online;
  }

  onStatusChange(cb: (online: boolean) => void): () => void {
    let handle: { remove: () => void } | null = null;

    void (async () => {
      const { Network } = await import('@capacitor/network');

      // Sync initial state.
      const status = await Network.getStatus();
      this._online = status.connected;
      this._ready = true;
      cb(status.connected);

      // Subscribe to changes.
      handle = await Network.addListener('networkStatusChange', (s: { connected: boolean }) => {
        this._online = s.connected;
        cb(s.connected);
      });
    })();

    return () => {
      void handle?.remove();
    };
  }

  async getStatus(): Promise<{ connected: boolean; connectionType: string }> {
    await this.ensureReady();
    const { Network } = await import('@capacitor/network');
    return Network.getStatus();
  }
}

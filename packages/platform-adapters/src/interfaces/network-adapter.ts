/**
 * Network connectivity awareness — decouples `navigator.onLine` /
 * `window.addEventListener('online')` so mobile shells (Capacitor) can
 * use richer native APIs that distinguish WiFi, cellular, and captive portals.
 */
export interface NetworkAdapter {
  /** Current online state (synchronous snapshot). */
  isOnline(): boolean;

  /**
   * Subscribe to connectivity changes. Returns an unsubscribe function.
   * The callback is called whenever the online/offline state changes.
   */
  onStatusChange(cb: (online: boolean) => void): () => void;
}

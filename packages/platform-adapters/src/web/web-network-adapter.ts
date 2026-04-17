import type { NetworkAdapter } from '../interfaces/network-adapter';

/**
 * Browser `navigator.onLine` / window online/offline events adapter.
 *
 * On mobile web or PWA the browser's online detection is coarse (it can
 * report "online" when behind a captive portal). Capacitor shells override
 * this with `@capacitor/network` which is more accurate.
 */
export class WebNetworkAdapter implements NetworkAdapter {
  isOnline(): boolean {
    if (typeof navigator === 'undefined') return true;
    return navigator.onLine;
  }

  onStatusChange(cb: (online: boolean) => void): () => void {
    if (typeof window === 'undefined') return () => {};

    const onOnline = () => cb(true);
    const onOffline = () => cb(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }
}

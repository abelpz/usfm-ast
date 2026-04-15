import { useCallback, useEffect, useState } from 'react';

export type SyncStatusState = 'synced' | 'syncing' | 'offline' | 'conflict';

export type SyncStatusSnapshot = {
  state: SyncStatusState;
  peerCount?: number;
  detail?: string;
};

export function useSyncStatus(getSnapshot: () => SyncStatusSnapshot, pollMs = 2000) {
  const [snap, setSnap] = useState<SyncStatusSnapshot>(() => getSnapshot());

  const update = useCallback(() => {
    setSnap((prev) => {
      const next = getSnapshot();
      if (
        prev.state === next.state &&
        prev.peerCount === next.peerCount &&
        prev.detail === next.detail
      )
        return prev;
      return next;
    });
  }, [getSnapshot]);

  useEffect(() => {
    update();
    const id = window.setInterval(update, pollMs);
    const onLine = () => update();
    window.addEventListener('online', onLine);
    window.addEventListener('offline', onLine);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('online', onLine);
      window.removeEventListener('offline', onLine);
    };
  }, [update]);

  return { ...snap, update };
}

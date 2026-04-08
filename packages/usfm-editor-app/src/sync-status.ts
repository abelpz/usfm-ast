/**
 * Topbar sync / collaboration status pill.
 */

export type SyncPillState = 'synced' | 'syncing' | 'offline' | 'conflict';

export interface SyncStatusSnapshot {
  state: SyncPillState;
  peerCount?: number;
  detail?: string;
}

export function mountSyncStatus(
  host: HTMLElement,
  getSnapshot: () => SyncStatusSnapshot
): { update: () => void; destroy: () => void } {
  host.classList.add('sync-status');
  const dot = document.createElement('span');
  dot.className = 'sync-status__dot';
  const label = document.createElement('span');
  label.className = 'sync-status__label';
  const peers = document.createElement('span');
  peers.className = 'sync-status__peers';
  host.appendChild(dot);
  host.appendChild(label);
  host.appendChild(peers);

  function paint() {
    const s = getSnapshot();
    host.dataset.state = s.state;
    label.textContent =
      s.state === 'synced'
        ? 'Synced'
        : s.state === 'syncing'
          ? 'Syncing…'
          : s.state === 'offline'
            ? 'Offline'
            : 'Conflict';
    if (s.detail) host.title = s.detail;
    if (s.peerCount !== undefined && s.peerCount > 0) {
      peers.textContent = `${s.peerCount} editor${s.peerCount === 1 ? '' : 's'}`;
      peers.hidden = false;
    } else {
      peers.textContent = '';
      peers.hidden = true;
    }
  }

  paint();
  const id = window.setInterval(paint, 2000);
  return {
    update: paint,
    destroy: () => {
      clearInterval(id);
      host.innerHTML = '';
      host.classList.remove('sync-status');
    },
  };
}

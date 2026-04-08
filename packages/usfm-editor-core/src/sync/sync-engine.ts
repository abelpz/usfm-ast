import type { SyncEngine, SyncResult, JournalEntry } from './types';

/**
 * Default sync engine: tracks online/offline; push/pull are no-ops until a remote transport is wired.
 */
export class DefaultSyncEngine implements SyncEngine {
  private online = typeof navigator === 'undefined' ? true : navigator.onLine;
  private readonly connectivityListeners = new Set<(online: boolean) => void>();
  private readonly remoteListeners = new Set<(entries: JournalEntry[]) => void>();

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.setOnline(true));
      window.addEventListener('offline', () => this.setOnline(false));
    }
  }

  get isOnline(): boolean {
    return this.online;
  }

  private setOnline(v: boolean): void {
    this.online = v;
    for (const l of this.connectivityListeners) l(v);
  }

  async push(): Promise<SyncResult> {
    return {
      pushed: 0,
      pulled: 0,
      conflicts: [],
      status: this.online ? 'ok' : 'offline',
    };
  }

  async pull(): Promise<SyncResult> {
    return {
      pushed: 0,
      pulled: 0,
      conflicts: [],
      status: this.online ? 'ok' : 'offline',
    };
  }

  async sync(): Promise<SyncResult> {
    const a = await this.pull();
    const b = await this.push();
    return {
      pushed: b.pushed,
      pulled: a.pulled,
      conflicts: [...a.conflicts, ...b.conflicts],
      status: a.status === 'offline' || b.status === 'offline' ? 'offline' : 'ok',
    };
  }

  onConnectivityChange(listener: (online: boolean) => void): () => void {
    this.connectivityListeners.add(listener);
    return () => this.connectivityListeners.delete(listener);
  }

  onRemoteChanges(listener: (entries: JournalEntry[]) => void): () => void {
    this.remoteListeners.add(listener);
    return () => this.remoteListeners.delete(listener);
  }
}

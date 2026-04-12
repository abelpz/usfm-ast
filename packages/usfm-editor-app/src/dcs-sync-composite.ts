import type { JournalEntry, SyncEngine, SyncResult } from '@usfm-tools/editor-core';

/**
 * After journal push/pull via {@link inner}, runs {@link git} {@link SyncEngine.push} for DCS snapshot commits.
 */
export class JournalPlusGitSyncEngine implements SyncEngine {
  constructor(
    private readonly inner: SyncEngine,
    private readonly git: SyncEngine,
  ) {}

  get isOnline(): boolean {
    return this.inner.isOnline;
  }

  async pull(): Promise<SyncResult> {
    return this.inner.pull();
  }

  async push(): Promise<SyncResult> {
    const j = await this.inner.push();
    if (j.status === 'error') return j;
    const g = await this.git.push();
    return {
      pushed: j.pushed + g.pushed,
      pulled: j.pulled + g.pulled,
      conflicts: [...j.conflicts, ...g.conflicts],
      status:
        g.status === 'error'
          ? 'error'
          : j.conflicts.length + g.conflicts.length > 0
            ? 'conflicts'
            : 'ok',
    };
  }

  async sync(): Promise<SyncResult> {
    const j = await this.inner.sync();
    if (j.status === 'error') return j;
    const g = await this.git.push();
    return {
      pushed: j.pushed + g.pushed,
      pulled: j.pulled + g.pulled,
      conflicts: [...j.conflicts, ...g.conflicts],
      status:
        g.status === 'error'
          ? 'error'
          : j.conflicts.length + g.conflicts.length > 0
            ? 'conflicts'
            : 'ok',
    };
  }

  onConnectivityChange(listener: (online: boolean) => void): () => void {
    return this.inner.onConnectivityChange(listener);
  }

  onRemoteChanges(listener: (entries: JournalEntry[]) => void): () => void {
    return this.inner.onRemoteChanges(listener);
  }
}

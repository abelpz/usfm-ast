import type { DocumentStore } from '../document-store';
import type { GitSyncAdapter } from '../git-sync-adapter';
import type { OperationJournal } from './operation-journal';
import { DefaultSyncEngine } from './sync-engine';
import type { SyncResult } from './types';

export interface DcsSyncOptions {
  /** Optional real {@link GitSyncAdapter} (DCS/Gitea API, isomorphic-git bridge, etc.). */
  adapter?: GitSyncAdapter;
  store?: DocumentStore;
  /** When set, {@link push} includes journal operations in the Git commit payload. */
  journal?: OperationJournal;
}

/**
 * DCS-oriented sync: extends {@link DefaultSyncEngine}; wire `adapter` + `store` (+ optional
 * `journal`) so {@link push} creates a commit via {@link GitSyncAdapter.commit}.
 */
export class DcsSyncEngine extends DefaultSyncEngine {
  constructor(private readonly _options: DcsSyncOptions = {}) {
    super();
  }

  override async push(): Promise<SyncResult> {
    const base = await super.push();
    const { adapter, store, journal } = this._options;
    if (!adapter || !store) return base;
    if (!this.isOnline) {
      return { ...base, status: 'offline' };
    }
    const entries = journal?.getAll() ?? [];
    const ops = entries.flatMap((e) => e.operations);
    const message =
      entries.length > 0
        ? `USFM-AST sync: ${entries.length} journal entr${entries.length === 1 ? 'y' : 'ies'}`
        : 'USFM-AST sync (snapshot)';
    try {
      await adapter.commit(store, message, ops);
      return {
        ...base,
        pushed: entries.length > 0 ? entries.length : 1,
        status: 'ok',
      };
    } catch {
      return { ...base, status: 'error' };
    }
  }
}

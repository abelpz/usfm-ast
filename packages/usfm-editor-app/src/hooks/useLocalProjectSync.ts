import { useCallback, useEffect, useRef, useState } from 'react';
import { getProjectStorage } from '@/lib/project-storage';
import { getOfflineSyncQueue } from '@/lib/offline-sync-queue';
import { loadDcsCredentials } from '@/lib/dcs-storage';
import {
  publishPendingReleasesToDcs,
  hasLocalChanges,
  autoMergeToDcs,
  workingBranchName,
  syncLocalProjectWithDcs,
  type SyncLocalProjectWithDcsResult,
  SyncConflictsError,
  StalePushError,
} from '@/lib/dcs-project-sync';
import {
  notifySyncSuccess,
  notifySyncConflict,
  notifySyncFailure,
} from '@/lib/tauri-notifications';
import type { FileConflict, ProjectSyncConfig } from '@usfm-tools/types';

/** How long after a save (ms) before we attempt an auto-push to DCS. */
const AUTO_PUSH_DEBOUNCE_MS = 15_000;

export type LocalProjectSyncState = {
  /** Whether any local files differ from the last recorded remote state. */
  isDirty: boolean;
  /** Whether a push is currently in progress. */
  isSyncing: boolean;
  /** Whether auto-sync is enabled for this project (default: true). */
  autoSync: boolean;
  /** Human-readable status line for the topbar. */
  detail: string | undefined;
  /** ISO 8601 timestamp of the last successful push. */
  lastSyncAt: string | undefined;
  /** Number of local releases not yet published to DCS. */
  pendingReleaseCount: number;
  /**
   * URL of the first PR that could not be automatically merged (conflict).
   * When set, the user must resolve the conflict on DCS before further
   * auto-merges will proceed.
   */
  conflictPrUrl: string | undefined;
  /** File-level merge conflicts (three-way); resolve via {@link resolveConflict}. */
  pendingFileConflicts: FileConflict[];
  resolveConflict: (path: string, choice: 'ours' | 'theirs') => Promise<void>;
  /** Enable or disable auto-sync (persists to project meta). */
  setAutoSync: (enabled: boolean) => void;
  /** Immediately trigger a push regardless of the debounce or toggle. */
  forceSync: () => Promise<void>;
  /**
   * Call this whenever the session content changes (e.g. from `session.onChange`).
   * Resets the debounce timer that triggers the next auto-push.
   */
  notifyChange: () => void;
};

/**
 * Manages auto-sync of a local translation project to Door43 using a
 * 3-tier branch strategy with pull/merge before push.
 */
export function useLocalProjectSync(
  projectId: string | undefined,
  bookCode?: string,
  options?: {
    /** After IndexedDB was updated by a successful merge+push (not no-op). */
    onProjectSyncSucceeded?: (
      result: Extract<SyncLocalProjectWithDcsResult, { kind: 'synced' }>,
      /** Journal entry watermark captured just before sync started (for race replay). */
      journalWatermark: number,
    ) => void | Promise<void>;
    /**
     * Called once per sync attempt immediately before `syncLocalProjectWithDcs` is
     * invoked.  Return an opaque watermark that is forwarded to `onProjectSyncSucceeded`
     * so the caller can replay edits made during the sync window.
     */
    getSyncWatermark?: () => number;
  },
): LocalProjectSyncState {
  const storage = getProjectStorage();

  const [isDirty, setIsDirty] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [autoSync, setAutoSyncState] = useState(true);
  const [detail, setDetail] = useState<string | undefined>();
  const [lastSyncAt, setLastSyncAt] = useState<string | undefined>();
  const [pendingReleaseCount, setPendingReleaseCount] = useState(0);
  const [conflictPrUrl, setConflictPrUrl] = useState<string | undefined>();
  const [pendingFileConflicts, setPendingFileConflicts] = useState<FileConflict[]>([]);

  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const autoSyncRef = useRef(autoSync);
  autoSyncRef.current = autoSync;
  const isSyncingRef = useRef(isSyncing);
  isSyncingRef.current = isSyncing;
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const syncInFlightRef = useRef(false);
  const dirtyDuringSyncRef = useRef(false);
  const onProjectSyncSucceededRef = useRef(options?.onProjectSyncSucceeded);
  onProjectSyncSucceededRef.current = options?.onProjectSyncSucceeded;
  const getSyncWatermarkRef = useRef(options?.getSyncWatermark);
  getSyncWatermarkRef.current = options?.getSyncWatermark;

  useEffect(() => {
    if (!projectId) return;
    void (async () => {
      const meta = await storage.getProject(projectId);
      if (!meta) return;
      setAutoSyncState(meta.autoSync !== false);
      setLastSyncAt(meta.lastRemoteSyncAt);
      setPendingFileConflicts(meta.pendingConflicts ?? []);
      const releases = await storage.listReleases(projectId);
      setPendingReleaseCount(releases.filter((r) => !r.publishedAt).length);
    })();
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const resolveConflict = useCallback(
    async (path: string, choice: 'ours' | 'theirs') => {
      if (!projectId) return;
      const meta = await storage.getProject(projectId);
      const list = meta?.pendingConflicts ?? [];
      const c = list.find((x) => x.path === path);
      if (!c) return;
      const text = choice === 'ours' ? c.oursText : c.theirsText;
      // An empty string means the chosen side deleted the file.
      if (text === '') {
        await storage.deleteFile(projectId, path);
      } else {
        await storage.writeFile(projectId, path, text);
      }
      const next = list.filter((x) => x.path !== path);
      await storage.updateProject(projectId, {
        pendingConflicts: next.length > 0 ? next : undefined,
      });
      setPendingFileConflicts(next);
      void hasLocalChanges(storage, projectId).then(setIsDirty);
    },
    [projectId, storage],
  );

  const runSync = useCallback(
    async (sync: ProjectSyncConfig, token: string, username: string) => {
      if (isSyncingRef.current) return;
      setIsSyncing(true);
      isSyncingRef.current = true;
      syncInFlightRef.current = true;
      setConflictPrUrl(undefined);

      const wb = bookCode ? workingBranchName(username, bookCode) : undefined;
      const branchLabel = wb ?? sync.branch;

      setDetail(`Local project: syncing with Door43 (${branchLabel})…`);
      try {
        const journalWatermark = getSyncWatermarkRef.current?.() ?? 0;
        const syncResult = await syncLocalProjectWithDcs({
          storage,
          projectId: projectId!,
          token,
          sync,
          username,
          bookCode,
        });

        if (syncResult.kind === 'synced') {
          await onProjectSyncSucceededRef.current?.(syncResult, journalWatermark);
        }

        const now = new Date().toISOString();
        await storage.updateProject(projectId!, {
          lastRemoteSyncAt: now,
          pendingSyncAt: undefined,
        });
        await getOfflineSyncQueue().clearProject(projectId!);
        setLastSyncAt(now);
        setIsDirty(false);
        isDirtyRef.current = false;
        setPendingFileConflicts([]);

        const projectMeta = await storage.getProject(projectId!);
        const projectLabel = projectMeta?.name ?? projectId!;

        if (wb && bookCode) {
          setDetail(`Local project: pushed to ${branchLabel} — merging PRs…`);
          const mergeResult = await autoMergeToDcs({ token, sync, username, bookCode });
          if (mergeResult.merged) {
            setDetail(`Local project: merged → ${sync.owner}/${sync.repo} (${sync.branch})`);
            notifySyncSuccess(projectLabel, `${sync.owner}/${sync.repo}`);
            await publishPendingReleasesToDcs({ storage, projectId: projectId!, token, sync });
            const releases = await storage.listReleases(projectId!);
            setPendingReleaseCount(releases.filter((r) => !r.publishedAt).length);
          } else {
            setConflictPrUrl(mergeResult.conflictPrUrl);
            setDetail(`Local project: pushed to ${branchLabel} — merge conflict, resolve on DCS`);
            if (mergeResult.conflictPrUrl) {
              notifySyncConflict(projectLabel, mergeResult.conflictPrUrl);
            }
          }
        } else {
          setDetail(`Local project: synced → ${sync.owner}/${sync.repo}`);
          notifySyncSuccess(projectLabel, `${sync.owner}/${sync.repo}`);
          await publishPendingReleasesToDcs({ storage, projectId: projectId!, token, sync });
          const releases = await storage.listReleases(projectId!);
          setPendingReleaseCount(releases.filter((r) => !r.publishedAt).length);
        }
      } catch (err) {
        if (err instanceof SyncConflictsError) {
          setPendingFileConflicts(err.conflicts);
          await storage.updateProject(projectId!, { pendingConflicts: err.conflicts });
          setDetail('Local project: merge conflicts — choose which version to keep');
          return;
        }
        if (err instanceof StalePushError) {
          setDetail('Local project: remote changed during sync — try again');
          await storage.updateProject(projectId!, { pendingSyncAt: new Date().toISOString() });
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        setDetail(`Local project: Door43 sync failed — ${msg}`);
        await storage.updateProject(projectId!, { pendingSyncAt: new Date().toISOString() });
        if (projectId) {
          notifySyncFailure(projectId, msg);
        }
      } finally {
        setIsSyncing(false);
        isSyncingRef.current = false;
        syncInFlightRef.current = false;
        if (dirtyDuringSyncRef.current) {
          dirtyDuringSyncRef.current = false;
          void hasLocalChanges(storage, projectId!).then(setIsDirty);
        }
      }
    },
    [bookCode, projectId, storage],
  );

  const tryPush = useCallback(async () => {
    if (!projectId) return;
    const meta = await storage.getProject(projectId);
    if (!meta?.syncConfig) return;
    const creds = loadDcsCredentials();
    if (!creds?.token) return;
    if (!navigator.onLine) {
      setDetail('Local project: offline — will retry on reconnect');
      return;
    }
    await runSync(meta.syncConfig, creds.token, creds.username);
  }, [projectId, runSync, storage]);

  const notifyChange = useCallback(() => {
    if (!projectId) return;

    if (syncInFlightRef.current) {
      dirtyDuringSyncRef.current = true;
    }

    void hasLocalChanges(storage, projectId).then(setIsDirty);

    if (!autoSyncRef.current) return;

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      void tryPush();
    }, AUTO_PUSH_DEBOUNCE_MS);
  }, [projectId, storage, tryPush]);

  useEffect(() => {
    const onOnline = () => {
      if (!isDirtyRef.current || !autoSyncRef.current) return;
      void tryPush();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [tryPush]);

  useEffect(() => {
    if (!projectId) return;
    void (async () => {
      const meta = await storage.getProject(projectId);
      if (!meta) return;
      const dirty = await hasLocalChanges(storage, projectId);
      setIsDirty(dirty);
      if (dirty) {
        setDetail(
          meta.pendingSyncAt
            ? 'Local project: sync pending — will retry on reconnect'
            : undefined,
        );
        if (navigator.onLine && meta.autoSync !== false && meta.syncConfig) {
          void tryPush();
        }
      }
    })();
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  const setAutoSync = useCallback(
    (enabled: boolean) => {
      setAutoSyncState(enabled);
      autoSyncRef.current = enabled;
      if (projectId) {
        void storage.updateProject(projectId, { autoSync: enabled });
      }
    },
    [projectId, storage],
  );

  const forceSync = useCallback(async () => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = undefined;
    }
    await tryPush();
  }, [tryPush]);

  return {
    isDirty,
    isSyncing,
    autoSync,
    detail,
    lastSyncAt,
    pendingReleaseCount,
    conflictPrUrl,
    pendingFileConflicts,
    resolveConflict,
    setAutoSync,
    forceSync,
    notifyChange,
  };
}

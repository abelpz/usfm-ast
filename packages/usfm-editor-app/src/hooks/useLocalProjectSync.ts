import { useCallback, useEffect, useRef, useState } from 'react';
import { getProjectStorage } from '@/lib/project-storage';
import { loadDcsCredentials } from '@/lib/dcs-storage';
import {
  pushLocalProjectToDcs,
  publishPendingReleasesToDcs,
  hasLocalChanges,
  autoMergeToDcs,
  workingBranchName,
} from '@/lib/dcs-project-sync';
import type { ProjectSyncConfig } from '@usfm-tools/types';

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
 * 3-tier branch strategy:
 *
 *   {username}/{bookCode}  →  {bookCode}  →  main
 *
 * - When `bookCode` is provided, pushes land on `{username}/{bookCode}` and
 *   auto-merge PRs are opened up the chain.
 * - When `bookCode` is absent (e.g. project dashboard), falls back to pushing
 *   directly to `sync.branch` (main) without branching.
 * - Debounces pushes 15 s after any change notification.
 * - Re-triggers on `window: online` event when there are pending local changes.
 * - Persists `pendingSyncAt` on failure so reconnect retries automatically.
 * - Publishes any un-pushed releases after every successful sync to main.
 * - Respects the `autoSync` preference stored on `ProjectMeta`.
 */
export function useLocalProjectSync(
  projectId: string | undefined,
  bookCode?: string,
): LocalProjectSyncState {
  const storage = getProjectStorage();

  const [isDirty, setIsDirty] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [autoSync, setAutoSyncState] = useState(true);
  const [detail, setDetail] = useState<string | undefined>();
  const [lastSyncAt, setLastSyncAt] = useState<string | undefined>();
  const [pendingReleaseCount, setPendingReleaseCount] = useState(0);
  const [conflictPrUrl, setConflictPrUrl] = useState<string | undefined>();

  // Refs so callbacks always see current values without re-creating effects.
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const autoSyncRef = useRef(autoSync);
  autoSyncRef.current = autoSync;
  const isSyncingRef = useRef(isSyncing);
  isSyncingRef.current = isSyncing;
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Load initial meta values.
  useEffect(() => {
    if (!projectId) return;
    void (async () => {
      const meta = await storage.getProject(projectId);
      if (!meta) return;
      setAutoSyncState(meta.autoSync !== false);
      setLastSyncAt(meta.lastRemoteSyncAt);
      const releases = await storage.listReleases(projectId);
      setPendingReleaseCount(releases.filter((r) => !r.publishedAt).length);
    })();
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Core push logic — shared by auto and force paths.
  const runPush = useCallback(
    async (sync: ProjectSyncConfig, token: string, username: string) => {
      if (isSyncingRef.current) return;
      setIsSyncing(true);
      isSyncingRef.current = true;
      setConflictPrUrl(undefined);

      // Determine which branch this session writes to.
      const wb = bookCode ? workingBranchName(username, bookCode) : undefined;
      const branchLabel = wb ?? sync.branch;

      setDetail(`Local project: pushing to ${branchLabel}…`);
      try {
        await pushLocalProjectToDcs({
          storage,
          projectId: projectId!,
          token,
          sync,
          workingBranch: wb,
        });

        const now = new Date().toISOString();
        await storage.updateProject(projectId!, {
          lastRemoteSyncAt: now,
          pendingSyncAt: undefined,
        });
        setLastSyncAt(now);
        setIsDirty(false);
        isDirtyRef.current = false;

        if (wb && bookCode) {
          // Attempt the 3-tier auto-merge chain.
          setDetail(`Local project: pushed to ${branchLabel} — merging…`);
          const mergeResult = await autoMergeToDcs({ token, sync, username, bookCode });
          if (mergeResult.merged) {
            setDetail(`Local project: merged → ${sync.owner}/${sync.repo} (${sync.branch})`);
            // Publish pending releases now that main is up to date.
            await publishPendingReleasesToDcs({ storage, projectId: projectId!, token, sync });
            const releases = await storage.listReleases(projectId!);
            setPendingReleaseCount(releases.filter((r) => !r.publishedAt).length);
          } else {
            setConflictPrUrl(mergeResult.conflictPrUrl);
            setDetail(`Local project: pushed to ${branchLabel} — merge conflict, resolve on DCS`);
          }
        } else {
          // No branching — direct push to main; publish releases immediately.
          setDetail(`Local project: pushed → ${sync.owner}/${sync.repo}`);
          await publishPendingReleasesToDcs({ storage, projectId: projectId!, token, sync });
          const releases = await storage.listReleases(projectId!);
          setPendingReleaseCount(releases.filter((r) => !r.publishedAt).length);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setDetail(`Local project: Door43 push failed — ${msg}`);
        await storage.updateProject(projectId!, { pendingSyncAt: new Date().toISOString() });
      } finally {
        setIsSyncing(false);
        isSyncingRef.current = false;
      }
    },
    [bookCode, projectId, storage],
  );

  // Attempt a push if conditions are met (online, meta has syncConfig, token present).
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
    await runPush(meta.syncConfig, creds.token, creds.username);
  }, [projectId, runPush, storage]);

  // Re-check dirty state after each change and schedule a debounced auto-push.
  const notifyChange = useCallback(() => {
    if (!projectId) return;

    void hasLocalChanges(storage, projectId).then(setIsDirty);

    if (!autoSyncRef.current) return;

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      void tryPush();
    }, AUTO_PUSH_DEBOUNCE_MS);
  }, [projectId, storage, tryPush]);

  // Reconnect handler: push immediately when coming back online if there are pending changes.
  useEffect(() => {
    const onOnline = () => {
      if (!isDirtyRef.current || !autoSyncRef.current) return;
      void tryPush();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [tryPush]);

  // On mount (or project change), check whether there is already a pending sync to retry.
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

  // Cleanup debounce on unmount.
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
    setAutoSync,
    forceSync,
    notifyChange,
  };
}

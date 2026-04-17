import { AlignmentPanel } from '@/components/AlignmentPanel';
import { MarkerShortcutsDialog } from '@/components/MarkerShortcutsDialog';
import { CheckingPanel } from '@/components/CheckingPanel';
import { ExportUsfmDialog } from '@/components/ExportUsfmDialog';
import { CollaborateModal } from '@/components/CollaborateModal';
import { DcsLoginDialog } from '@/components/DcsLoginDialog';
import { DcsModal } from '@/components/DcsModal';
import { DcsSyncButton } from '@/components/DcsSyncButton';
import { SyncConflictDialog } from '@/components/SyncConflictDialog';
import { EditorPanel } from '@/components/EditorPanel';
import { SectionPicker } from '@/components/SectionPicker';
import { ReferenceColumn } from '@/components/ReferenceColumn';
import { Topbar } from '@/components/Topbar';
import { UsfmSourcePane } from '@/components/UsfmSourcePane';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { fetchAuthenticatedUser, getFileContent, type Door43UserInfo } from '@/dcs-client';
import { loadDcsCredentials, loadDcsTarget, type DcsStoredCredentials, type DcsStoredTarget } from '@/lib/dcs-storage';
import { getOfflineSyncQueue } from '@/lib/offline-sync-queue';
import { bookBranchName, syncLocalProjectWithDcs } from '@/lib/dcs-project-sync';
import { syncAlignmentsToProject, loadAlignmentLayersForBook } from '@/lib/alignment-layer-persistence';
import { useKV } from '@/platform/PlatformContext';
import type { SyncStatusSnapshot } from '@/hooks/useSyncStatus';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import { useLocalProjectSync } from '@/hooks/useLocalProjectSync';
import { useTauriMenuEvents } from '@/hooks/useTauriMenuEvents';
import { useTauriCloseGuard } from '@/hooks/useTauriCloseGuard';
import { useTauriFileDrop } from '@/hooks/useTauriFileDrop';
import { ProjectBookJournalStore, SyncScheduler } from '@usfm-tools/editor-adapters';
import type { ScriptureSessionController } from '@/hooks/useScriptureSession';
import {
  formatMarkerPaletteTriggerForHelp,
  getStoredMarkerPaletteTrigger,
  MARKER_PALETTE_TRIGGER_PRESETS,
  setStoredMarkerPaletteTrigger,
} from '@/marker-palette-trigger';
import type { UsjDocument } from '@usfm-tools/editor-core';
import type { EditorMode, SourceTextSession } from '@usfm-tools/editor';
import { mountConflictReview, readEditorMode, writeEditorMode } from '@usfm-tools/editor-ui';
import { isProjectLaunchConfig } from '@/lib/project-launch';
import { getProjectStorage } from '@/lib/project-storage';
import { nativeOpenFile, nativeSaveFile } from '@/lib/tauri-file-dialog';
import { notifySyncFailure } from '@/lib/tauri-notifications';
import { usePlatform } from '@/platform/PlatformContext';
import { blankUsfmForBook } from '@/lib/usfm-project';
import {
  makeSyncSidecar,
  serializeSyncSidecar,
  syncSidecarPathForBook,
} from '@/lib/sync-sidecar';
import { cn } from '@/lib/utils';
import { listRCBooks, parseResourceContainer } from '@usfm-tools/project-formats';
import { USFM_BOOK_CODES } from '@usfm-tools/editor';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent,
} from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

const DCS_INITIAL_FETCH_MS = 18_000;

const SAMPLE_USFM = String.raw`\id TIT EN_ULT
\h Titus
\mt Titus

\c 1
\p
\v 1 Paul, a servant of God and an apostle of Jesus Christ,
\v 2 In hope of eternal life, which God promised before time began.
`;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = window.setTimeout(() => reject(new Error('DCS file request timed out')), ms);
    p.then(
      (v) => {
        window.clearTimeout(id);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(id);
        reject(e);
      },
    );
  });
}

export function EditorPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const launch = isProjectLaunchConfig(location.state) ? location.state : null;
  const kv = useKV();
  const { platform } = usePlatform();

  const [dcsCreds, setDcsCreds] = useState<DcsStoredCredentials | null>(() => loadDcsCredentials());
  const [dcsTarget] = useState<DcsStoredTarget | null>(() => loadDcsTarget());
  const [editorLoginOpen, setEditorLoginOpen] = useState(false);
  const [loginContext, setLoginContext] = useState<string | undefined>();
  const [postEditorLogin, setPostEditorLogin] = useState<null | 'dcs' | 'sync'>(null);
  const [pendingSyncAfterLogin, setPendingSyncAfterLogin] = useState(false);
  const [editorUser, setEditorUser] = useState<Door43UserInfo | null>(null);
  const [initialUsfm, setInitialUsfm] = useState(() => {
    if (launch?.localProject) {
      const bc = launch.localProject.bookCode;
      const row = USFM_BOOK_CODES.find(([c]) => c === bc);
      return blankUsfmForBook(bc, row?.[1] ?? bc);
    }
    return launch?.initialUsfm ?? SAMPLE_USFM;
  });
  const [ctrl, setCtrl] = useState<ScriptureSessionController | null>(null);
  const ctrlRef = useRef<ScriptureSessionController | null>(null);
  ctrlRef.current = ctrl;
  const onController = useCallback((c: ScriptureSessionController | null) => {
    setCtrl(c);
  }, []);

  const [collabActive] = useState(() => sessionStorage.getItem('usfm-collab') === '1');
  const [wsRelay] = useState(() => kv.getSync('usfm-ws-relay') ?? '');

  const [dcsOpen, setDcsOpen] = useState(false);
  const [collabOpen, setCollabOpen] = useState(false);

  useEffect(() => {
    if (!dcsCreds?.token) {
      setEditorUser(null);
      return;
    }
    let cancelled = false;
    void fetchAuthenticatedUser({ host: dcsCreds.host, token: dcsCreds.token })
      .then((u) => {
        if (!cancelled) setEditorUser(u);
      })
      .catch(() => {
        if (!cancelled) setEditorUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, [dcsCreds?.token, dcsCreds?.host]);
  const [helpOpen, setHelpOpen] = useState(false);
  const [referencePanel, setReferencePanel] = useState(() => Boolean(launch?.openReferencePanel));
  const [usfmSource, setUsfmSource] = useState(false);
  const [alignmentOpen, setAlignmentOpen] = useState(false);
  const [checkingOpen, setCheckingOpen] = useState(false);
  const [exportUsfmOpen, setExportUsfmOpen] = useState(false);
  const [sourceTextSession, setSourceTextSession] = useState<SourceTextSession | null>(null);
  const [allSourceSlots, setAllSourceSlots] = useState<ReadonlyArray<{ id: string; label: string; session: SourceTextSession | null }>>([]);
  const referenceColumnRef = useRef<import('@/components/ReferenceColumn').ReferenceColumnHandle>(null);

  const [usfmTheme, setUsfmTheme] = useState<'document' | 'document-dark'>('document');
  const [editorMode, setEditorMode] = useState<EditorMode>(() => readEditorMode());
  const [paletteValue, setPaletteValue] = useState(() => getStoredMarkerPaletteTrigger());

  const fileInputRef = useRef<HTMLInputElement>(null);
  const conflictHostRef = useRef<HTMLDivElement>(null);
  const focusedOnceRef = useRef(false);
  // Ref to the active save timer so it can be flushed before window close.
  const pendingSaveRef = useRef<{ timer: ReturnType<typeof setTimeout>; run: () => Promise<void> } | null>(null);

  const [hasLocalProjectDcs, setHasLocalProjectDcs] = useState(false);
  const [localProjectMeta, setLocalProjectMeta] = useState<import('@usfm-tools/types').ProjectMeta | null>(null);
  const localProjectStorage = useMemo(() => launch?.localProject ? getProjectStorage() : null, [launch?.localProject]);

  /** OT journal persisted to `journal/<BOOK>.jsonl` and synced with the rest of the project. */
  const projectBookJournalStore = useMemo(
    () =>
      launch?.localProject
        ? new ProjectBookJournalStore({
            storage: getProjectStorage(),
            projectId: launch.localProject.projectId,
            bookCode: launch.localProject.bookCode,
          })
        : undefined,
    [launch?.localProject?.projectId, launch?.localProject?.bookCode],
  );

  const offlineSyncQueue = useMemo(() => getOfflineSyncQueue(), []);

  const onProjectSyncSucceeded = useCallback(async (_result: unknown, journalWatermark = 0) => {
    const session = ctrlRef.current?.session;
    const lp = launch?.localProject;
    if (!session || !lp) return;
    const storage = getProjectStorage();
    const manifest = await storage.readFile(lp.projectId, 'manifest.yaml');
    if (!manifest) return;
    const rc = parseResourceContainer(manifest);
    const book = listRCBooks(rc).find((b) => b.code === lp.bookCode);
    if (!book) return;
    const rel = book.path.replace(/^\.\//, '');
    const usfm = await storage.readFile(lp.projectId, rel);
    if (!usfm) return;
    session.loadUSFM(usfm);
    // Re-apply any edits that the user made during the sync window so they are
    // not silently discarded by the loadUSFM call above.
    session.replayJournalEntriesAfter(journalWatermark);
    await session.reloadJournalFromDisk();
    await loadAlignmentLayersForBook({ storage, projectId: lp.projectId, bookCode: lp.bookCode, session });
    await session.maybeCompactJournalAfterPush();
  }, [launch?.localProject]);

  const getSyncWatermark = useCallback(
    () => ctrlRef.current?.session.journalEntryWatermark() ?? 0,
    [],
  );

  const localSync = useLocalProjectSync(launch?.localProject?.projectId, launch?.localProject?.bookCode, {
    onProjectSyncSucceeded,
    getSyncWatermark,
  });

  const { network } = usePlatform();

  // Start the offline sync scheduler so queued file-change operations are
  // delivered when the device comes back online.
  useEffect(() => {
    const scheduler = new SyncScheduler({
      queue: offlineSyncQueue,
      // Use the platform network adapter (Tauri: HEAD-probe-backed;
      // web: navigator.onLine) so the scheduler responds to actual
      // reachability, not just link-level events.
      network,
      deliver: async (op) => {
        if (op.type === 'file-change') {
          const creds = loadDcsCredentials();
          if (!creds?.token) throw new Error('No DCS credentials for queued sync');
          const meta = await getProjectStorage().getProject(op.projectId);
          if (!meta?.syncConfig) throw new Error('No sync config for queued project');
          const payload = op.payload as { bookCode?: string } | undefined;
          await syncLocalProjectWithDcs({
            storage: getProjectStorage(),
            projectId: op.projectId,
            token: creds.token,
            sync: meta.syncConfig,
            username: creds.username,
            bookCode: typeof payload?.bookCode === 'string' ? payload.bookCode : undefined,
          });
        }
      },
      onPermanentFailure: (op, error) => {
        console.warn('[SyncScheduler] Permanent failure for op', op.id, error.message);
        notifySyncFailure(op.projectId, error.message);
      },
    });
    scheduler.start();
    return () => scheduler.stop();
  }, [offlineSyncQueue]);

  const dcsSyncEnabled = Boolean(dcsCreds && dcsTarget?.syncEnabled);

  const getSyncSnapshot = useCallback((): SyncStatusSnapshot => {
    try {
      const online = navigator.onLine;
      let peers = 0;
      try {
        peers = ctrl?.collabRealtimeEngine?.getPeers().length ?? 0;
      } catch {
        peers = 0;
      }
      const dcsDetail =
        dcsSyncEnabled && dcsTarget
          ? `DCS sync: ${dcsTarget.owner}/${dcsTarget.repo} (${dcsTarget.usfmPath})`
          : undefined;
      const localDcsDetail =
        launch?.localProject && hasLocalProjectDcs
          ? localSync.detail ??
            (localSync.autoSync
              ? 'Local project: DCS auto-push after save (idle)'
              : 'Local project: auto-sync paused')
          : launch?.localProject
            ? 'Local project: connect Door43 on the project dashboard to enable push'
            : undefined;
      const collabDetail = collabActive
        ? 'Collaboration (BroadcastChannel + optional relay)'
        : undefined;
      const localConflict =
        (localSync.pendingFileConflicts?.length ?? 0) > 0 || Boolean(localSync.conflictPrUrl);
      return {
        state: !online
          ? 'offline'
          : localConflict
            ? 'conflict'
            : localSync.isSyncing
              ? 'syncing'
              : 'synced',
        peerCount: collabActive ? peers : undefined,
        detail: [dcsDetail, localDcsDetail, collabDetail].filter(Boolean).join(' · ') || undefined,
      };
    } catch {
      return { state: 'offline', detail: 'Status unavailable' };
    }
  }, [
    ctrl?.collabRealtimeEngine,
    collabActive,
    dcsSyncEnabled,
    dcsTarget,
    launch?.localProject,
    hasLocalProjectDcs,
    localSync.detail,
    localSync.isSyncing,
    localSync.autoSync,
    localSync.pendingFileConflicts,
    localSync.conflictPrUrl,
  ]);

  const {
    state: syncState,
    peerCount: syncPeers,
    detail: syncDetail,
    update: syncUpdate,
  } = useSyncStatus(getSyncSnapshot);

  useEffect(() => {
    if (launch?.localProject) return;
    if (launch?.skipPersistedDcsInitialFetch) return;
    if (!dcsCreds || !dcsTarget?.usfmPath) return;
    let cancelled = false;
    void (async () => {
      try {
        const file = await withTimeout(
          getFileContent({
            host: dcsCreds.host,
            token: dcsCreds.token,
            owner: dcsTarget.owner,
            repo: dcsTarget.repo,
            path: dcsTarget.usfmPath,
            ref: dcsTarget.branch,
          }),
          DCS_INITIAL_FETCH_MS,
        );
        if (!cancelled) setInitialUsfm(file.content);
      } catch (e) {
        console.warn('DCS: could not load initial USFM from repo', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dcsCreds, dcsTarget, launch?.localProject, launch?.skipPersistedDcsInitialFetch]);

  useEffect(() => {
    if (!launch?.localProject) {
      setHasLocalProjectDcs(false);
      return;
    }
    const { projectId, bookCode } = launch.localProject;
    let cancelled = false;
    void (async () => {
      const storage = getProjectStorage();
      const meta = await storage.getProject(projectId);
      if (!cancelled) {
        setHasLocalProjectDcs(Boolean(meta?.syncConfig));
        setLocalProjectMeta(meta);
      }
      const manifest = await storage.readFile(projectId, 'manifest.yaml');
      if (!manifest || cancelled) return;
      const rc = parseResourceContainer(manifest);
      const book = listRCBooks(rc).find((b) => b.code === bookCode);
      if (!book) return;
      let usfm = await storage.readFile(projectId, book.path);
      if (!usfm && meta?.syncConfig) {
        const creds = loadDcsCredentials();
        if (creds?.token) {
          try {
            const rel = book.path.replace(/^\.\//, '');
            const file = await getFileContent({
              host: meta.syncConfig.host,
              token: creds.token,
              owner: meta.syncConfig.owner,
              repo: meta.syncConfig.repo,
              path: rel,
              ref: meta.syncConfig.branch,
            });
            usfm = file.content;
            await storage.writeFile(projectId, rel, file.content);
          } catch (e) {
            console.warn('DCS: could not fetch book USFM for local project', e);
          }
        }
      }
      if (usfm && !cancelled) setInitialUsfm(usfm);
      // Alignment layers are loaded separately once the session is mounted (see below).
    })();
    return () => {
      cancelled = true;
    };
  }, [launch?.localProject?.projectId, launch?.localProject?.bookCode]);

  // Load alignment sidecar files and restore active layer once the session is ready.
  useEffect(() => {
    if (!launch?.localProject || !ctrl?.session) return;
    const { projectId, bookCode } = launch.localProject;
    const storage = getProjectStorage();
    void loadAlignmentLayersForBook({ storage, projectId, bookCode, session: ctrl.session });
  }, [ctrl?.session, launch?.localProject?.projectId, launch?.localProject?.bookCode]);

  useEffect(() => {
    if (!launch?.localProject || !ctrl?.session) return;
    const { projectId, bookCode } = launch.localProject;
    const storage = getProjectStorage();
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    const session = ctrl.session;

    const doSave = async () => {
      const usfm = session.toUSFM();
      const manifest = await storage.readFile(projectId, 'manifest.yaml');
      if (!manifest) return;
      const rc = parseResourceContainer(manifest);
      const book = listRCBooks(rc).find((b) => b.code === bookCode);
      if (!book) return;
      await storage.writeFile(projectId, book.path, usfm);
      const pm = await storage.getProject(projectId);
      const tier2Branch = bookBranchName(bookCode);
      const baseCommit = pm?.lastRemoteCommit?.[tier2Branch];
      const syncShas = await storage.getSyncShas(projectId);
      const bookRel = book.path.replace(/^\.\//, '');
      const baseBlobSha = syncShas[bookRel];
      await storage.writeFile(
        projectId,
        syncSidecarPathForBook(bookCode),
        serializeSyncSidecar(
          makeSyncSidecar({
            docId: `${projectId}:${bookCode}`,
            baseCommit,
            baseBlobSha,
            vectorClock: session.getJournalVectorClock(),
            journalId: session.getJournalBaseSnapshotId() || undefined,
          }),
        ),
      );
      // Persist any non-embedded alignment layers to sidecar JSON files
      await syncAlignmentsToProject({ storage, projectId, bookCode, session });
      await offlineSyncQueue.enqueue({
        type: 'file-change',
        projectId,
        payload: { bookCode },
      });
    };

    const scheduleDoSave = () => {
      // 2 s debounce: persist current book USFM to storage, then enqueue a
      // file-change operation so the intent survives an app restart.
      if (saveTimer) clearTimeout(saveTimer);
      const run = doSave;
      saveTimer = setTimeout(() => { pendingSaveRef.current = null; void run(); }, 2000);
      // Register the flush function so the close guard can flush before exit.
      pendingSaveRef.current = { timer: saveTimer, run };
      // Notify the sync hook so it can update dirty state and schedule an auto-push.
      localSync.notifyChange();
    };

    const unsub = session.onChange(scheduleDoSave);
    // Also save when new alignment layers are created or removed
    const unsubAlign = session.onAlignmentDocumentsChange(scheduleDoSave);

    return () => {
      unsub();
      unsubAlign();
      if (saveTimer) clearTimeout(saveTimer);
    };
  }, [launch?.localProject, ctrl?.session, localSync.notifyChange]);

  // Keep the topbar status indicator in sync with localSync state changes.
  useEffect(() => {
    syncUpdate();
  }, [
    localSync.isSyncing,
    localSync.detail,
    localSync.pendingFileConflicts,
    localSync.conflictPrUrl,
    syncUpdate,
  ]);

  useEffect(() => {
    document.body.setAttribute('data-usfm-theme', usfmTheme);
    document.documentElement.classList.toggle('dark', usfmTheme === 'document-dark');
    const apply = (dom: HTMLElement | undefined) => {
      if (dom) dom.setAttribute('data-usfm-theme', usfmTheme);
    };
    apply(ctrl?.session.contentView.dom);
    apply(sourceTextSession?.contentView.dom);
  }, [ctrl, sourceTextSession, usfmTheme]);

  useEffect(() => {
    writeEditorMode(editorMode);
    const apply = (dom: HTMLElement | undefined) => {
      if (dom) dom.setAttribute('data-usfm-mode', editorMode);
    };
    apply(ctrl?.session.contentView.dom);
    apply(sourceTextSession?.contentView.dom);
  }, [ctrl, sourceTextSession, editorMode]);

  useEffect(() => {
    if (ctrl && !focusedOnceRef.current) {
      focusedOnceRef.current = true;
      ctrl.session.contentView.focus();
    }
  }, [ctrl]);

  const paletteOptions = useMemo(() => {
    const stored = getStoredMarkerPaletteTrigger();
    const base = [...MARKER_PALETTE_TRIGGER_PRESETS];
    if (!base.some((p) => p.value === stored)) {
      base.push({ value: stored, label: `Custom (${stored})` });
    }
    return base;
  }, [paletteValue]);

  const onShellMouseDown = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement | null;
    if (t?.closest('select')) return;
    if (
      t?.closest(
        'button, [role="menuitem"], [role="menuitemcheckbox"], [data-slot="dropdown-menu-trigger"], [data-radix-collection-item]',
      )
    ) {
      e.preventDefault();
    }
  }, []);

  /** Load text content into the editor (shared by file-input and native dialog paths). */
  const loadFileContent = useCallback((name: string, text: string) => {
    if (!ctrl) return;
    const lower = name.toLowerCase();
    try {
      if (lower.endsWith('.alignment.json') || (lower.endsWith('.json') && text.includes('"usfm-alignment"'))) {
        ctrl.session.loadAlignmentDocumentFromJson(text);
      } else if (lower.endsWith('.usx') || lower.endsWith('.xml')) {
        ctrl.session.loadUSX(text);
      } else if (lower.endsWith('.usj') || (lower.endsWith('.json') && text.trim().startsWith('{'))) {
        ctrl.session.loadUSJ(JSON.parse(text) as UsjDocument);
      } else {
        ctrl.session.loadUSFM(text);
      }
      ctrl.session.contentView.focus();
    } catch {
      /* ignore */
    }
  }, [ctrl]);

  const onFileInputChange = useCallback(async (ev: ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      loadFileContent(f.name, text);
    } catch {
      /* ignore */
    }
  }, [loadFileContent]);

  const onExportUsx = useCallback(async () => {
    if (!ctrl) return;
    const content = ctrl.session.toUSX();
    if (platform === 'tauri') {
      await nativeSaveFile(content, {
        defaultPath: 'export.usx',
        filters: [{ name: 'USX', extensions: ['usx', 'xml'] }],
      });
    } else {
      const blob = new Blob([content], { type: 'application/xml;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'edited.usx';
      a.click();
      URL.revokeObjectURL(a.href);
    }
  }, [ctrl, platform]);

  const onSyncNow = useCallback(async () => {
    if (!ctrl) return;
    syncUpdate();
    const r = await ctrl.session.runSync();
    syncUpdate();
    const host = conflictHostRef.current;
    if (!host) return;
    host.innerHTML = '';
    if (r.conflicts.length > 0) {
      mountConflictReview(host, r, { onDismiss: () => { host.innerHTML = ''; } });
    }
  }, [ctrl, syncUpdate]);

  useEffect(() => {
    if (!pendingSyncAfterLogin || !dcsCreds?.token || !ctrl) return;
    setPendingSyncAfterLogin(false);
    void onSyncNow();
  }, [pendingSyncAfterLogin, dcsCreds?.token, ctrl, onSyncNow]);

  const onPaletteChange = useCallback((v: string) => {
    setPaletteValue(v);
    setStoredMarkerPaletteTrigger(v);
  }, []);

  const onSignInClick = useCallback(() => {
    setLoginContext(undefined);
    setPostEditorLogin(null);
    setEditorLoginOpen(true);
  }, []);

  const onDcs = useCallback(() => {
    if (!dcsCreds?.token) {
      setLoginContext('Sign in to configure Door43 sync and repositories.');
      setPostEditorLogin('dcs');
      setEditorLoginOpen(true);
      return;
    }
    setDcsOpen(true);
  }, [dcsCreds?.token]);

  const onCollaborate = useCallback(() => setCollabOpen(true), []);
  const onOpenExportUsfm = useCallback(() => setExportUsfmOpen(true), []);
  const onToggleReference = useCallback(() => setReferencePanel((v: boolean) => !v), []);
  const onToggleUsfmSource = useCallback(() => setUsfmSource((v: boolean) => !v), []);
  const onAlignment = useCallback(() => setAlignmentOpen(true), []);
  const onCloseAlignment = useCallback(() => setAlignmentOpen(false), []);
  const onChecking = useCallback(() => setCheckingOpen((v) => !v), []);
  const onHelp = useCallback(() => setHelpOpen(true), []);
  const [markerShortcutsOpen, setMarkerShortcutsOpen] = useState(false);
  const onMarkerShortcuts = useCallback(() => setMarkerShortcutsOpen(true), []);
  const onTopbarSyncNow = useCallback(() => {
    if (dcsTarget?.syncEnabled && !dcsCreds?.token) {
      setLoginContext('Sign in to sync changes with Door43.');
      setPostEditorLogin('sync');
      setEditorLoginOpen(true);
      return;
    }
    void onSyncNow();
  }, [dcsTarget?.syncEnabled, dcsCreds?.token, onSyncNow]);

  const onSourceLanguageChange = useCallback((lc: string | null) => {
    const projectId = launch?.localProject?.projectId;
    if (!projectId || !localProjectStorage) return;
    void localProjectStorage.updateProject(projectId, {
      sourceRefLanguage: lc ?? undefined,
    });
  }, [launch?.localProject?.projectId, localProjectStorage]);

  const onLocalProjectUpdated = useCallback(() => {
    void getProjectStorage().getProject(launch!.localProject!.projectId).then((m) => {
      if (m) setLocalProjectMeta(m);
      setHasLocalProjectDcs(Boolean(m?.syncConfig));
    });
  }, [launch?.localProject?.projectId]);

  const navigationSlot = useMemo(() => ctrl ? (
    <SectionPicker
      inline
      session={ctrl.session}
      referenceSession={sourceTextSession ?? undefined}
      onWindowNotice={(msg) => console.info(msg)}
    />
  ) : undefined, [ctrl, sourceTextSession]);

  const localSyncSlot = useMemo(() => localProjectMeta && localProjectStorage ? (
    <DcsSyncButton
      meta={localProjectMeta}
      storage={localProjectStorage}
      localSync={localSync}
      onUpdated={onLocalProjectUpdated}
    />
  ) : undefined, [localProjectMeta, localProjectStorage, localSync, onLocalProjectUpdated]);

  const onMenuNewProject = useCallback(() => navigate('/'), [navigate]);
  const onMenuOpenFile = useCallback(async () => {
    if (platform === 'tauri') {
      const result = await nativeOpenFile();
      if (result) {
        const parts = result.path.split(/[\\/]/);
        loadFileContent(parts[parts.length - 1] ?? 'file', result.content);
      }
    } else {
      fileInputRef.current?.click();
    }
  }, [platform, loadFileContent]);
  const onMenuExportUsfm = useCallback(() => setExportUsfmOpen(true), []);
  const onMenuOpenSourceCache = useCallback(() => navigate('/source-cache'), [navigate]);
  const onMenuHelpDocs = useCallback(() => {
    void import('@tauri-apps/plugin-shell').then(({ open }) =>
      open('https://github.com/usfm-tools/usfm-ast/wiki'),
    );
  }, []);

  // Intercept window close: flush pending save and confirm if dirty.
  useTauriCloseGuard({
    flushPendingSave: useCallback(async () => {
      const pending = pendingSaveRef.current;
      if (!pending) return;
      clearTimeout(pending.timer);
      pendingSaveRef.current = null;
      await pending.run();
    }, []),
    isDirty: useCallback(() => localSync.isDirty, [localSync.isDirty]),
  });

  // Handle file drop: load the first dropped file into the editor.
  useTauriFileDrop(useCallback((files) => {
    const first = files[0];
    if (first) loadFileContent(first.name, first.content);
  }, [loadFileContent]));

  // Wire native application menu events to editor actions.
  useTauriMenuEvents({
    onNewProject: onMenuNewProject,
    onOpenFile: onMenuOpenFile,
    onExportUsfm: onMenuExportUsfm,
    onToggleReference,
    onToggleUsfmSource,
    onOpenSourceCache: onMenuOpenSourceCache,
    onHelp,
    onHelpDocs: onMenuHelpDocs,
  });

  return (
    <div
      className="bg-background text-foreground flex h-dvh max-h-dvh min-h-0 w-full flex-col overflow-hidden antialiased"
      onMouseDown={onShellMouseDown}
    >
      <div className="border-border flex shrink-0 flex-wrap items-center gap-3 border-b px-3 py-1 text-sm">
        <Link to="/" className="text-muted-foreground hover:text-foreground shrink-0 underline-offset-4 hover:underline">
          Home
        </Link>
        {launch?.localProject ? (
          <Link
            to={`/project/${launch.localProject.projectId}`}
            className="text-muted-foreground hover:text-foreground shrink-0 underline-offset-4 hover:underline"
          >
            Back to project
          </Link>
        ) : null}
      </div>

      <Topbar
        fileInputRef={fileInputRef}
        onFileInputChange={onFileInputChange}
        door43User={editorUser}
        onSignInClick={onSignInClick}
        onDcs={onDcs}
        onCollaborate={onCollaborate}
        syncState={syncState}
        syncPeerCount={syncPeers}
        syncDetail={syncDetail}
        syncConnected={dcsSyncEnabled || collabActive}
        onOpenExportUsfm={onOpenExportUsfm}
        onExportUsx={onExportUsx}
        referencePanel={referencePanel}
        onToggleReference={onToggleReference}
        usfmSource={usfmSource}
        onToggleUsfmSource={onToggleUsfmSource}
        onSyncNow={onTopbarSyncNow}
        usfmTheme={usfmTheme}
        onUsfmTheme={setUsfmTheme}
        editorMode={editorMode}
        onEditorMode={setEditorMode}
        markerPaletteValue={paletteValue}
        onMarkerPaletteValue={onPaletteChange}
        markerPaletteOptions={paletteOptions}
        onAlignment={onAlignment}
        onChecking={onChecking}
        checkingOpen={checkingOpen}
        onHelp={onHelp}
        onMarkerShortcuts={onMarkerShortcuts}
        navigationSlot={navigationSlot}
        localSyncSlot={localSyncSlot}
      />

      {launch?.localProject && localSync.pendingFileConflicts.length > 0 ? (
        <SyncConflictDialog
          open
          conflicts={localSync.pendingFileConflicts}
          onClose={() => {}}
          onResolve={(path, choice) => void localSync.resolveConflict(path, choice)}
        />
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div ref={conflictHostRef} className="conflict-host" />

        <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4 pb-4">
          <div
            className={cn(
              'flex min-h-0 min-w-0 flex-1 gap-4 overflow-hidden',
              referencePanel
                ? 'flex-col landscape:flex-row landscape:items-stretch'
                : 'flex-col',
            )}
          >
            {referencePanel && ctrl ? (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <ReferenceColumn
                  ref={referenceColumnRef}
                  session={ctrl.session}
                  onSourceSession={setSourceTextSession}
                  onSourceSessionsChange={setAllSourceSlots}
                  prefillSourceUsfm={launch?.sourceReferenceUsfm}
                  targetSession={ctrl.session}
                  dcsAuth={dcsCreds ? { host: dcsCreds.host, token: dcsCreds.token } : null}
                  sourceLanguage={launch?.sourceLanguage}
                  launchBookCode={launch?.projectMeta?.bookCode}
                  onSourceLanguageChange={onSourceLanguageChange}
                />
              </div>
            ) : null}

            <div
              className={cn(
                'flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden md:flex-row',
                referencePanel && 'min-h-0 min-w-0 flex-1',
              )}
            >
              <EditorPanel
                initialUsfm={initialUsfm}
                collabActive={collabActive}
                wsRelay={wsRelay}
                dcsCreds={dcsCreds}
                dcsTarget={dcsTarget}
                targetLanguage={localProjectMeta?.language}
                projectBookJournalStore={projectBookJournalStore}
                localBookCode={launch?.localProject?.bookCode}
                onController={onController}
                className="min-w-0"
              />
              {ctrl ? <UsfmSourcePane session={ctrl.session} visible={usfmSource} /> : null}
            </div>
          </div>

          {checkingOpen ? (
            <div className="border-border max-h-[min(40vh,22rem)] w-full max-w-4xl shrink-0 overflow-y-auto border-t pt-3">
              <CheckingPanel />
            </div>
          ) : null}
        </main>
      </div>

      {ctrl ? (
        <AlignmentPanel
          open={alignmentOpen}
          onClose={onCloseAlignment}
          session={ctrl.session}
          sourceSlots={allSourceSlots}
          dcsAuth={dcsCreds ? { host: dcsCreds.host, token: dcsCreds.token } : null}
          onRequestAddDcsLanguage={(lang) => {
            setReferencePanel(true);
            referenceColumnRef.current?.addDcsLanguage(lang);
          }}
          usfmTheme={usfmTheme}
        />
      ) : null}

      <ExportUsfmDialog
        open={exportUsfmOpen}
        onOpenChange={setExportUsfmOpen}
        session={ctrl?.session ?? null}
      />

      <DcsLoginDialog
        open={editorLoginOpen}
        onOpenChange={setEditorLoginOpen}
        defaultHost={dcsCreds?.host ?? 'git.door43.org'}
        contextMessage={loginContext}
        onSuccess={() => {
          const next = loadDcsCredentials();
          setDcsCreds(next);
          const action = postEditorLogin;
          setPostEditorLogin(null);
          if (action === 'dcs') setDcsOpen(true);
          if (action === 'sync') setPendingSyncAfterLogin(true);
        }}
      />
      <DcsModal open={dcsOpen} onOpenChange={setDcsOpen} />
      <CollaborateModal open={collabOpen} onOpenChange={setCollabOpen} />

      <MarkerShortcutsDialog open={markerShortcutsOpen} onOpenChange={setMarkerShortcutsOpen} />

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Help &amp; shortcuts</DialogTitle>
          </DialogHeader>
          <div className="text-muted-foreground space-y-3 text-sm">
            <p>
              <strong className="text-foreground">Hover a paragraph</strong> to see the{' '}
              <span className="bg-muted rounded px-1">+</span> insert button and marker picker on the left.
            </p>
            <p>
              <strong className="text-foreground">Select text or place the caret</strong> for the floating toolbar
              (bold, italic, verse, chapter).
            </p>
            <p className="text-foreground flex flex-wrap items-center gap-1 text-sm">
              <kbd className="bg-muted rounded border px-1.5 py-0.5 font-mono text-xs">
                {formatMarkerPaletteTriggerForHelp(getStoredMarkerPaletteTrigger())}
              </kbd>
              <span>marker palette</span>
              <span className="text-muted-foreground">·</span>
              <kbd className="bg-muted rounded border px-1.5 py-0.5 font-mono text-xs">Ctrl+/</kbd>
              <span>add block</span>
              <span className="text-muted-foreground">·</span>
              <kbd className="bg-muted rounded border px-1.5 py-0.5 font-mono text-xs">Ctrl+Shift+V</kbd>
              <span>verse</span>
              <span className="text-muted-foreground">·</span>
              <kbd className="bg-muted rounded border px-1.5 py-0.5 font-mono text-xs">Ctrl+Shift+C</kbd>
              <span>chapter</span>
            </p>
          </div>
          <Button type="button" className="w-full sm:w-auto" onClick={() => setHelpOpen(false)}>
            Close
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

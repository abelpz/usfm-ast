import { AlignmentPanel } from '@/components/AlignmentPanel';
import { MarkerShortcutsDialog } from '@/components/MarkerShortcutsDialog';
import { CheckingPanel } from '@/components/CheckingPanel';
import { ExportUsfmDialog } from '@/components/ExportUsfmDialog';
import { CollaborateModal } from '@/components/CollaborateModal';
import { DcsLoginDialog } from '@/components/DcsLoginDialog';
import { DcsModal } from '@/components/DcsModal';
import { DcsSyncButton } from '@/components/DcsSyncButton';
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
import type { SyncStatusSnapshot } from '@/hooks/useSyncStatus';
import { useSyncStatus } from '@/hooks/useSyncStatus';
import { useLocalProjectSync } from '@/hooks/useLocalProjectSync';
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
import { blankUsfmForBook } from '@/lib/usfm-project';
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
import { Link, useLocation } from 'react-router-dom';

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
  const launch = isProjectLaunchConfig(location.state) ? location.state : null;

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
  const onController = useCallback((c: ScriptureSessionController | null) => {
    setCtrl(c);
  }, []);

  const [collabActive] = useState(() => sessionStorage.getItem('usfm-collab') === '1');
  const [wsRelay] = useState(() => localStorage.getItem('usfm-ws-relay') ?? '');

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

  const [usfmTheme, setUsfmTheme] = useState<'document' | 'document-dark'>('document');
  const [editorMode, setEditorMode] = useState<EditorMode>(() => readEditorMode());
  const [paletteValue, setPaletteValue] = useState(() => getStoredMarkerPaletteTrigger());

  const fileInputRef = useRef<HTMLInputElement>(null);
  const conflictHostRef = useRef<HTMLDivElement>(null);
  const focusedOnceRef = useRef(false);

  const [hasLocalProjectDcs, setHasLocalProjectDcs] = useState(false);
  const [localProjectMeta, setLocalProjectMeta] = useState<import('@usfm-tools/types').ProjectMeta | null>(null);
  const localProjectStorage = useMemo(() => launch?.localProject ? getProjectStorage() : null, [launch?.localProject]);

  const localSync = useLocalProjectSync(
    launch?.localProject?.projectId,
    launch?.localProject?.bookCode,
  );

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
      return {
        state: !online ? 'offline' : localSync.isSyncing ? 'syncing' : 'synced',
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
      const usfm = await storage.readFile(projectId, book.path);
      if (usfm && !cancelled) setInitialUsfm(usfm);
    })();
    return () => {
      cancelled = true;
    };
  }, [launch?.localProject?.projectId, launch?.localProject?.bookCode]);

  useEffect(() => {
    if (!launch?.localProject || !ctrl?.session) return;
    const { projectId, bookCode } = launch.localProject;
    const storage = getProjectStorage();
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    const session = ctrl.session;

    const unsub = session.onChange(() => {
      // 2 s debounce: persist current book USFM to IndexedDB.
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        void (async () => {
          const usfm = session.toUSFM();
          const manifest = await storage.readFile(projectId, 'manifest.yaml');
          if (!manifest) return;
          const rc = parseResourceContainer(manifest);
          const book = listRCBooks(rc).find((b) => b.code === bookCode);
          if (book) await storage.writeFile(projectId, book.path, usfm);
        })();
      }, 2000);

      // Notify the sync hook so it can update dirty state and schedule an auto-push.
      localSync.notifyChange();
    });

    return () => {
      unsub();
      if (saveTimer) clearTimeout(saveTimer);
    };
  }, [launch?.localProject, ctrl?.session, localSync.notifyChange]);

  // Keep the topbar status indicator in sync with localSync state changes.
  useEffect(() => {
    syncUpdate();
  }, [localSync.isSyncing, localSync.detail, syncUpdate]);

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

  const onFileInputChange = useCallback(async (ev: ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files?.[0];
    if (!f || !ctrl) return;
    const name = f.name.toLowerCase();
    try {
      const text = await f.text();
      if (name.endsWith('.alignment.json') || (name.endsWith('.json') && text.includes('"usfm-alignment"'))) {
        ctrl.session.loadAlignmentDocumentFromJson(text);
      } else if (name.endsWith('.usx') || name.endsWith('.xml')) {
        ctrl.session.loadUSX(text);
      } else if (name.endsWith('.usj') || (name.endsWith('.json') && text.trim().startsWith('{'))) {
        ctrl.session.loadUSJ(JSON.parse(text) as UsjDocument);
      } else {
        ctrl.session.loadUSFM(text);
      }
      ctrl.session.contentView.focus();
    } catch {
      /* ignore */
    }
  }, [ctrl]);

  const onExportUsx = useCallback(() => {
    if (!ctrl) return;
    const blob = new Blob([ctrl.session.toUSX()], { type: 'application/xml;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'edited.usx';
    a.click();
    URL.revokeObjectURL(a.href);
  }, [ctrl]);

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
                  session={ctrl.session}
                  onSourceSession={setSourceTextSession}
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
          sourceTextSession={sourceTextSession}
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

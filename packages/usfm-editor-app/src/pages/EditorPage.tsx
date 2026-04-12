import { AlignmentPanel } from '@/components/AlignmentPanel';
import { ExportUsfmDialog } from '@/components/ExportUsfmDialog';
import { CollaborateModal } from '@/components/CollaborateModal';
import { DcsLoginDialog } from '@/components/DcsLoginDialog';
import { DcsModal } from '@/components/DcsModal';
import { EditorPanel } from '@/components/EditorPanel';
import { SectionPicker } from '@/components/SectionPicker';
import { SourcePanel } from '@/components/SourcePanel';
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
import { cn } from '@/lib/utils';
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
  const [initialUsfm, setInitialUsfm] = useState(() => launch?.initialUsfm ?? SAMPLE_USFM);
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
  const [exportUsfmOpen, setExportUsfmOpen] = useState(false);
  const [sourceTextSession, setSourceTextSession] = useState<SourceTextSession | null>(null);

  const [usfmTheme, setUsfmTheme] = useState<'document' | 'document-dark'>('document');
  const [editorMode, setEditorMode] = useState<EditorMode>(() => readEditorMode());
  const [paletteValue, setPaletteValue] = useState(() => getStoredMarkerPaletteTrigger());

  const fileInputRef = useRef<HTMLInputElement>(null);
  const conflictHostRef = useRef<HTMLDivElement>(null);
  const focusedOnceRef = useRef(false);

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
      const collabDetail = collabActive
        ? 'Collaboration (BroadcastChannel + optional relay)'
        : undefined;
      return {
        state: !online ? 'offline' : 'synced',
        peerCount: collabActive ? peers : undefined,
        detail: [dcsDetail, collabDetail].filter(Boolean).join(' · ') || undefined,
      };
    } catch {
      return { state: 'offline', detail: 'Status unavailable' };
    }
  }, [ctrl?.collabRealtimeEngine, collabActive, dcsSyncEnabled, dcsTarget]);

  const {
    state: syncState,
    peerCount: syncPeers,
    detail: syncDetail,
    update: syncUpdate,
  } = useSyncStatus(getSyncSnapshot);

  useEffect(() => {
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
  }, [dcsCreds, dcsTarget, launch?.skipPersistedDcsInitialFetch]);

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

  function onShellMouseDown(e: MouseEvent<HTMLDivElement>) {
    const t = e.target as HTMLElement | null;
    if (t?.closest('select')) return;
    if (
      t?.closest(
        'button, [role="menuitem"], [role="menuitemcheckbox"], [data-slot="dropdown-menu-trigger"], [data-radix-collection-item]',
      )
    ) {
      e.preventDefault();
    }
  }

  async function onFileInputChange(ev: ChangeEvent<HTMLInputElement>) {
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
  }

  function onExportUsx() {
    if (!ctrl) return;
    const blob = new Blob([ctrl.session.toUSX()], { type: 'application/xml;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'edited.usx';
    a.click();
    URL.revokeObjectURL(a.href);
  }

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

  function onPaletteChange(v: string) {
    setPaletteValue(v);
    setStoredMarkerPaletteTrigger(v);
  }

  return (
    <div
      className="bg-background text-foreground flex min-h-dvh w-full flex-1 flex-col antialiased"
      onMouseDown={onShellMouseDown}
    >
      <div className="border-border flex items-center gap-2 border-b px-3 py-1 text-sm">
        <Link to="/" className="text-muted-foreground hover:text-foreground shrink-0 underline-offset-4 hover:underline">
          Home
        </Link>
      </div>

      <Topbar
        fileInputRef={fileInputRef}
        onFileInputChange={onFileInputChange}
        door43User={editorUser}
        onSignInClick={() => {
          setLoginContext(undefined);
          setPostEditorLogin(null);
          setEditorLoginOpen(true);
        }}
        onDcs={() => {
          if (!dcsCreds?.token) {
            setLoginContext('Sign in to configure Door43 sync and repositories.');
            setPostEditorLogin('dcs');
            setEditorLoginOpen(true);
            return;
          }
          setDcsOpen(true);
        }}
        onCollaborate={() => setCollabOpen(true)}
        syncState={syncState}
        syncPeerCount={syncPeers}
        syncDetail={syncDetail}
        syncConnected={dcsSyncEnabled || collabActive}
        onOpenExportUsfm={() => setExportUsfmOpen(true)}
        onExportUsx={onExportUsx}
        referencePanel={referencePanel}
        onToggleReference={() => setReferencePanel((v: boolean) => !v)}
        usfmSource={usfmSource}
        onToggleUsfmSource={() => setUsfmSource((v: boolean) => !v)}
        onSyncNow={() => {
          if (dcsTarget?.syncEnabled && !dcsCreds?.token) {
            setLoginContext('Sign in to sync changes with Door43.');
            setPostEditorLogin('sync');
            setEditorLoginOpen(true);
            return;
          }
          void onSyncNow();
        }}
        usfmTheme={usfmTheme}
        onUsfmTheme={setUsfmTheme}
        editorMode={editorMode}
        onEditorMode={setEditorMode}
        markerPaletteValue={paletteValue}
        onMarkerPaletteValue={onPaletteChange}
        markerPaletteOptions={paletteOptions}
        onAlignment={() => setAlignmentOpen(true)}
        onHelp={() => setHelpOpen(true)}
        navigationSlot={
          ctrl ? (
            <SectionPicker
              inline
              session={ctrl.session}
              referenceSession={sourceTextSession ?? undefined}
              onWindowNotice={(msg) => console.info(msg)}
            />
          ) : undefined
        }
      />

      <div className="flex min-h-0 flex-1 flex-col">
        <div ref={conflictHostRef} className="conflict-host" />

        <main className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-8">
          <div
            className={cn(
              'flex min-h-0 flex-1 gap-4',
              referencePanel
                ? 'flex-col landscape:flex-row landscape:items-stretch'
                : 'flex-col',
            )}
          >
            {referencePanel && ctrl ? (
              <div
                className={cn(
                  'flex min-h-0 min-w-0 flex-col',
                  'landscape:flex-1 landscape:overflow-hidden',
                  'portrait:flex-1 portrait:min-h-0 portrait:overflow-hidden',
                )}
              >
                <SourcePanel
                  session={ctrl.session}
                  onSourceSession={setSourceTextSession}
                  prefillSourceUsfm={launch?.sourceReferenceUsfm}
                />
              </div>
            ) : null}

            <div
              className={cn(
                'flex min-h-0 min-w-0 flex-1 flex-col gap-0 md:flex-row',
                referencePanel && 'min-h-0 min-w-0 flex-1 overflow-hidden',
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
        </main>
      </div>

      {ctrl ? (
        <AlignmentPanel
          open={alignmentOpen}
          onClose={() => setAlignmentOpen(false)}
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

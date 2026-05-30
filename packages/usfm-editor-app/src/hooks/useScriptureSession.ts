import {
  convertUSJDocumentToUSFM,
  createDcsJournalTransport,
  DcsGitSyncAdapter,
} from '@usfm-tools/editor-adapters';
import {
  AutoSyncScheduler,
  BroadcastChannelTransport,
  CompositeRealtimeTransport,
  DcsSyncEngine,
  HeadlessCollabSession,
  RealtimeSyncEngine,
  WebSocketRelayTransport,
  type JournalStore,
  type UsjDocument,
} from '@usfm-tools/editor-core';
import type { EditorView } from 'prosemirror-view';
import { markerPaletteKeymap, markerShortcutKeymap, ScriptureSession, serializeToUSJ } from '@usfm-tools/editor';
import {
  attachWysiwygChrome,
  readEditorMode,
  type WysiwygBubbleAction,
} from '@usfm-tools/editor-ui';
import { useLayoutEffect, useEffect, useRef, useState } from 'react';
import { JournalPlusGitSyncEngine } from '@/dcs-sync-composite';
import {
  getStoredMarkerPaletteTrigger,
  MARKER_PALETTE_TRIGGER_PRESETS,
  setStoredMarkerPaletteTrigger,
} from '@/marker-palette-trigger';
import { getStoredMarkerShortcuts } from '@/marker-shortcuts';
import { directionForLang } from '@/lib/lang-direction';
import type { DcsStoredCredentials, DcsStoredTarget } from '@/lib/dcs-storage';
import { getLocalJournalActorId } from '@/lib/local-actor-id';

export type UseScriptureSessionArgs = {
  mountRef: React.RefObject<HTMLDivElement | null>;
  initialUsfm: string;
  collabActive: boolean;
  wsRelay: string;
  dcsCreds: DcsStoredCredentials | null;
  dcsTarget: DcsStoredTarget | null;
  /** Fired after local document edits (same timing as vanilla `session.onChange`). */
  onEditorChange?: () => void;
  /** Project target language (BCP-47) — sets ProseMirror `dir` / `lang` for RTL layout. */
  targetLanguage?: string;
  /**
   * When editing a local translation project, persists {@link OperationJournal} to `journal/<BOOK>.jsonl`.
   * Takes precedence over single-file DCS journal + git sync when both are configured.
   */
  projectBookJournalStore?: JournalStore;
  /** Realtime room id for collab (defaults to `TIT` when omitted). */
  localBookCode?: string;
};

export type ScriptureSessionController = {
  session: ScriptureSession;
  openMarkerPalette: (v: EditorView) => void;
  notifyEdit: () => void;
  collabRealtimeEngine: RealtimeSyncEngine | null;
  autoSync: AutoSyncScheduler;
};

export function useScriptureSession({
  mountRef,
  initialUsfm,
  collabActive,
  wsRelay,
  dcsCreds,
  dcsTarget,
  onEditorChange,
  targetLanguage,
  projectBookJournalStore,
  localBookCode,
}: UseScriptureSessionArgs): ScriptureSessionController | null {
  const [ctrl, setCtrl] = useState<ScriptureSessionController | null>(null);
  const onEditorChangeRef = useRef(onEditorChange);
  useEffect(() => {
    onEditorChangeRef.current = onEditorChange;
  }, [onEditorChange]);

  /**
   * Track the latest `initialUsfm` value via a ref so the session-creation
   * `useLayoutEffect` can read it without having `initialUsfm` in its own
   * dependency array (which would unnecessarily destroy/recreate the whole
   * session every time the USFM content changes).
   */
  const pendingUsfmRef = useRef(initialUsfm);
  pendingUsfmRef.current = initialUsfm;
  /** The USFM that was loaded when the current session was created. */
  const sessionCreatedWithUsfmRef = useRef('');

  useEffect(() => {
    const s = ctrl?.session;
    if (!s) return;
    const lang = targetLanguage?.trim();
    if (!lang) {
      s.applyLanguage({ dir: 'ltr' });
      return;
    }
    let cancelled = false;
    void directionForLang(lang, dcsCreds?.host).then((dir) => {
      if (!cancelled) s.applyLanguage({ lang, dir });
    });
    return () => {
      cancelled = true;
    };
  }, [ctrl, targetLanguage, dcsCreds?.host]);

  useLayoutEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const paletteOpener: { current: (v: EditorView) => void } = {
      current: () => {},
    };

    const dcsSyncEnabled = Boolean(dcsCreds && dcsTarget?.syncEnabled);

    const extraPm = [
      markerPaletteKeymap((v) => paletteOpener.current(v), {
        getTriggerKey: getStoredMarkerPaletteTrigger,
      }),
      markerShortcutKeymap(getStoredMarkerShortcuts),
    ];

    function buildCollabTransport(): CompositeRealtimeTransport {
      return new CompositeRealtimeTransport([
        new BroadcastChannelTransport({ displayName: 'Editor' }),
        ...(wsRelay.trim() ? [new WebSocketRelayTransport(wsRelay.trim())] : []),
      ]);
    }

    const sessionOptions: ConstructorParameters<typeof ScriptureSession>[1] = {
      chrome: { preset: 'minimal' },
      maxVisibleChapters: 1,
      contextChapters: 0,
      paginatedEditor: true,
      extraProseMirrorPlugins: extraPm,
    };

    let headlessForConnect: HeadlessCollabSession | null = null;
    let collabRealtimeEngine: RealtimeSyncEngine | null = null;

    const getSnapshotUsjRef = {
      current: null as null | (() => UsjDocument),
    };
    const displayName = dcsCreds?.username?.trim() || 'local';
    const localActorId = getLocalJournalActorId(displayName);

    if (projectBookJournalStore) {
      const headless = new HeadlessCollabSession({
        userId: localActorId,
        displayName,
        journalStore: projectBookJournalStore,
        realtimeTransport: collabActive ? buildCollabTransport() : undefined,
      });
      headlessForConnect = headless;
      sessionOptions.headlessSession = headless;
      if (collabActive && headless.sync instanceof RealtimeSyncEngine) {
        collabRealtimeEngine = headless.sync;
      }
    } else if (dcsSyncEnabled && dcsCreds && dcsTarget) {
      const baseUrl = `https://${dcsCreds.host}`;
      const remoteTransport = createDcsJournalTransport({
        baseUrl,
        token: dcsCreds.token,
        owner: dcsTarget.owner,
        repo: dcsTarget.repo,
        path: dcsTarget.journalPath,
        branch: dcsTarget.branch,
      });
      const headless = new HeadlessCollabSession({
        userId: localActorId,
        displayName,
        remoteTransport,
        realtimeTransport: collabActive ? buildCollabTransport() : undefined,
      });
      headlessForConnect = headless;
      const gitAdapter = new DcsGitSyncAdapter({
        baseUrl,
        token: dcsCreds.token,
        owner: dcsTarget.owner,
        repo: dcsTarget.repo,
        path: dcsTarget.usfmPath,
        branch: dcsTarget.branch,
      });
      const gitEngine = new DcsSyncEngine({
        adapter: gitAdapter,
        store: headless.store,
        journal: headless.journal,
        getSnapshotUsj: () => getSnapshotUsjRef.current?.() ?? headless.store.getFullUSJ(),
      });
      sessionOptions.headlessSession = headless;
      sessionOptions.syncEngine = new JournalPlusGitSyncEngine(headless.sync, gitEngine);
      if (collabActive && headless.sync instanceof RealtimeSyncEngine) {
        collabRealtimeEngine = headless.sync;
      }
    } else if (collabActive) {
      sessionOptions.realtime = {
        transport: buildCollabTransport(),
        roomId: 'TIT',
      };
    }

    const session = new ScriptureSession(el, sessionOptions);
    getSnapshotUsjRef.current = () => session.toUSJWithAlignments();
    if (collabActive && !collabRealtimeEngine && session.sync instanceof RealtimeSyncEngine) {
      collabRealtimeEngine = session.sync;
    }
    // Load with the latest pending USFM (may already be the real content if the
    // async storage read completed before the session was created).
    session.loadUSFM(pendingUsfmRef.current);
    sessionCreatedWithUsfmRef.current = pendingUsfmRef.current;

    let cancelled = false;
    void (async () => {
      if (headlessForConnect) {
        await session.connectHeadlessCollaboration(
          collabActive ? (localBookCode?.trim() || 'TIT') : undefined,
        );
      }
      if (cancelled) return;
      const view = session.contentView;
      const wysiwygChrome = attachWysiwygChrome(el, view, {
        session,
        bubble: {
          resolveActions: (_ctx, _v, defaults) => {
            const mode = readEditorMode();
            const chapterBubbleAction: WysiwygBubbleAction = {
              id: 'chapter',
              label: mode === 'advanced' ? '+Ch' : '',
              title:
                mode === 'advanced' ? 'Insert next chapter (\\c)' : 'Insert next chapter',
              toolbarIcon: mode === 'advanced' ? undefined : 'chapter',
              visible: (_ctx, v) => {
                const section = session.markers.getSectionAtPos(
                  v.state,
                  v.state.selection.$head.pos,
                );
                return (
                  session.markers.canInsertChapter(section) && session.canInsertNextChapter()
                );
              },
              run: (v) => {
                void session.tryInsertNextChapter();
              },
            };
            return [...defaults, chapterBubbleAction];
          },
        },
        markerPalette: { getTriggerKey: getStoredMarkerPaletteTrigger },
      });
      paletteOpener.current = wysiwygChrome.openMarkerPalette;
    })();

    const autoSync = new AutoSyncScheduler(session.sync, {});
    autoSync.start();

    const offDocChange = session.onChange(() => {
      autoSync.notifyEdit();
      onEditorChangeRef.current?.();
    });

    const next: ScriptureSessionController = {
      session,
      openMarkerPalette: (v) => paletteOpener.current(v),
      notifyEdit: () => autoSync.notifyEdit(),
      collabRealtimeEngine,
      autoSync,
    };

    setCtrl(next);

    return () => {
      cancelled = true;
      offDocChange();
      autoSync.stop();
      session.destroy();
      setCtrl(null);
    };
  }, [
    mountRef,
    // NOTE: initialUsfm is intentionally NOT here — USFM content changes are
    // handled by the separate useEffect below so the session is not destroyed
    // and recreated every time the USFM source content updates.
    collabActive,
    wsRelay,
    dcsCreds?.host,
    dcsCreds?.token,
    dcsCreds?.username,
    dcsTarget?.owner,
    dcsTarget?.repo,
    dcsTarget?.branch,
    dcsTarget?.usfmPath,
    dcsTarget?.journalPath,
    dcsTarget?.syncEnabled,
    projectBookJournalStore,
    localBookCode,
  ]);

  /**
   * When `initialUsfm` changes after the session is already live (e.g. the
   * async project storage read completing after the editor has mounted with a
   * blank placeholder), reload the session content in-place instead of
   * destroying and recreating the whole session.  Recreating the session would
   * unmount `ReferenceColumn` (because `ctrl` briefly becomes `null`), causing
   * it to lose its source-language state and trigger a full scripture reload.
   */
  useEffect(() => {
    if (!ctrl) return;
    if (initialUsfm === sessionCreatedWithUsfmRef.current) return;
    sessionCreatedWithUsfmRef.current = initialUsfm;
    ctrl.session.loadUSFM(initialUsfm);
  }, [ctrl, initialUsfm]);

  return ctrl;
}

export { MARKER_PALETTE_TRIGGER_PRESETS, setStoredMarkerPaletteTrigger, getStoredMarkerPaletteTrigger };
export { serializeToUSJ, convertUSJDocumentToUSFM };

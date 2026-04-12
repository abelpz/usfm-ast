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
  type UsjDocument,
} from '@usfm-tools/editor-core';
import type { EditorView } from 'prosemirror-view';
import { markerPaletteKeymap, ScriptureSession, serializeToUSJ } from '@usfm-tools/editor';
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
import type { DcsStoredCredentials, DcsStoredTarget } from '@/lib/dcs-storage';

export type UseScriptureSessionArgs = {
  mountRef: React.RefObject<HTMLDivElement | null>;
  initialUsfm: string;
  collabActive: boolean;
  wsRelay: string;
  dcsCreds: DcsStoredCredentials | null;
  dcsTarget: DcsStoredTarget | null;
  /** Fired after local document edits (same timing as vanilla `session.onChange`). */
  onEditorChange?: () => void;
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
}: UseScriptureSessionArgs): ScriptureSessionController | null {
  const [ctrl, setCtrl] = useState<ScriptureSessionController | null>(null);
  const onEditorChangeRef = useRef(onEditorChange);
  useEffect(() => {
    onEditorChangeRef.current = onEditorChange;
  }, [onEditorChange]);

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

    if (dcsSyncEnabled && dcsCreds && dcsTarget) {
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
        userId: dcsCreds.username,
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
    session.loadUSFM(initialUsfm);

    let cancelled = false;
    void (async () => {
      if (headlessForConnect) {
        await session.connectHeadlessCollaboration(collabActive ? 'TIT' : undefined);
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
    initialUsfm,
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
  ]);

  return ctrl;
}

export { MARKER_PALETTE_TRIGGER_PRESETS, setStoredMarkerPaletteTrigger, getStoredMarkerPaletteTrigger };
export { serializeToUSJ, convertUSJDocumentToUSFM };

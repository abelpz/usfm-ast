import { convertUSJDocumentToUSFM } from '@usfm-tools/adapters';
import {
  AutoSyncScheduler,
  BroadcastChannelTransport,
  CompositeRealtimeTransport,
  RealtimeSyncEngine,
  WebSocketRelayTransport,
} from '@usfm-tools/editor-core';
import type { UsjDocument } from '@usfm-tools/editor-core';
import type { EditorView } from 'prosemirror-view';
import {
  canInsertChapterMarkerInSection,
  getEditorSectionAtPos,
  type EditorMode,
  insertNextChapter,
  insertNextVerse,
  markerPaletteKeymap,
  ScriptureSession,
  serializeToUSJ,
  toggleCharMarker,
} from '@usfm-tools/editor';
import { mountAlignmentEditor } from './alignment-editor';
import { mountConflictReview } from './conflict-review';
import { mountSectionPicker } from './section-picker';
import { mountSourcePanel } from './source-panel';
import {
  formatMarkerPaletteTriggerForHelp,
  getStoredMarkerPaletteTrigger,
  MARKER_PALETTE_TRIGGER_PRESETS,
  setStoredMarkerPaletteTrigger,
} from './marker-palette-trigger';
import { attachWysiwygChrome, readEditorMode, writeEditorMode } from './wysiwyg-ui';
import type { WysiwygBubbleAction } from './wysiwyg-ui';
import { mountSyncStatus } from './sync-status';
import '@usfm-tools/editor/chrome.css';
import './style.css';

const SAMPLE_USFM = String.raw`\id TIT EN_ULT
\h Titus
\mt Titus

\c 1
\p
\v 1 Paul, a servant of God and an apostle of Jesus Christ,
\v 2 In hope of eternal life, which God promised before time began.
`;

function mount() {
  const root = document.getElementById('app');
  if (!root) throw new Error('#app missing');

  root.innerHTML = `
    <div class="shell">
      <!-- ── Top bar ────────────────────────────────────────────────────── -->
      <header class="topbar">
        <div class="topbar-brand">
          <span class="topbar-brandname">Scripture Editor</span>
        </div>
        <div id="sync-status-host" class="sync-status-host" aria-live="polite"></div>
        <div class="topbar-actions">
          <button type="button" id="btn-collaborate" class="topbar-btn" title="Real-time collaboration">
            Collaborate
          </button>
          <label class="topbar-btn topbar-open-label" title="Open USFM, USJ, or USX file">
            <input type="file" id="file-open"
              accept=".usfm,.usj,.usx,.txt,.sfm,.xml,.json,text/plain,*/*" />
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M2 3.5A1.5 1.5 0 013.5 2H7l1 1.5H13A1.5 1.5 0 0114.5 5v7A1.5 1.5 0 0113 13.5H3a1.5 1.5 0 01-1.5-1.5v-8.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" fill="none"/>
            </svg>
            Open
          </label>

          <div class="overflow-wrap" id="overflow-wrap">
            <button type="button" id="btn-overflow" class="topbar-btn topbar-overflow-btn"
              title="More options" aria-haspopup="true" aria-expanded="false">
              <svg width="16" height="4" viewBox="0 0 16 4" fill="currentColor" aria-hidden="true">
                <circle cx="2" cy="2" r="1.5"/>
                <circle cx="8" cy="2" r="1.5"/>
                <circle cx="14" cy="2" r="1.5"/>
              </svg>
            </button>
            <div id="overflow-menu" class="overflow-menu" hidden role="menu">
              <div class="overflow-group">
                <button type="button" id="btn-export" class="overflow-item" role="menuitem">
                  <span class="overflow-item-icon">⬇</span> Export USFM
                </button>
                <button type="button" id="btn-export-usx" class="overflow-item" role="menuitem">
                  <span class="overflow-item-icon">⬇</span> Export USX
                </button>
              </div>
              <div class="overflow-divider" role="separator"></div>
              <div class="overflow-group">
                <button type="button" id="btn-toggle-source-text"
                  class="overflow-item overflow-toggle" role="menuitemcheckbox" aria-checked="false">
                  <span class="overflow-item-icon overflow-check">✓</span> Reference panel
                </button>
                <button type="button" id="btn-toggle-src"
                  class="overflow-item overflow-toggle" role="menuitemcheckbox" aria-checked="false">
                  <span class="overflow-item-icon overflow-check">✓</span> USFM source
                </button>
              </div>
              <div class="overflow-divider" role="separator"></div>
              <div class="overflow-group">
                <button type="button" id="btn-sync" class="overflow-item" role="menuitem">
                  <span class="overflow-item-icon">↻</span> Sync
                </button>
              </div>
              <div class="overflow-divider" role="separator"></div>
              <div class="overflow-group">
                <label class="overflow-item overflow-theme-row">
                  <span class="overflow-item-icon">◑</span> Theme
                  <select id="theme-select" class="overflow-theme-select">
                    <option value="document">Light</option>
                    <option value="document-dark">Dark</option>
                  </select>
                </label>
                <label class="overflow-item overflow-theme-row">
                  <span class="overflow-item-icon">⌨</span> Marker palette
                  <select id="palette-trigger-select" class="overflow-theme-select"
                    aria-label="Keyboard shortcut for marker palette"></select>
                </label>
              </div>
              <div class="overflow-divider" role="separator"></div>
              <div class="overflow-group">
                <label class="overflow-item overflow-mode-row">
                  <span class="overflow-item-icon">✎</span> Marker mode
                  <select id="mode-select" class="overflow-mode-select" aria-label="Marker mode">
                    <option value="basic">Basic (draft)</option>
                    <option value="medium">Medium</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </label>
              </div>
              <div class="overflow-divider" role="separator"></div>
              <div class="overflow-group">
                <button type="button" id="btn-show-alignment" class="overflow-item" role="menuitem">
                  <span class="overflow-item-icon">⇌</span> Word alignment
                </button>
              </div>
              <div class="overflow-divider" role="separator"></div>
              <div class="overflow-group">
                <button type="button" id="btn-help" class="overflow-item" role="menuitem">
                  <span class="overflow-item-icon">?</span> Help &amp; shortcuts
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <!-- ── Help popover ─────────────────────────────────────────────── -->
      <div id="help-popover" class="help-popover" hidden role="region" aria-label="Help">
        <button type="button" id="btn-close-help" class="help-close" aria-label="Close help">✕</button>
        <p><strong>Hover a paragraph</strong> to see the <span class="help-badge">+</span> insert button and marker picker on the left.</p>
        <p><strong>Select text or place the caret</strong> to get the floating toolbar with Bold, Italic, verse, and chapter actions.</p>
        <p class="help-popover-shortcuts">
          <kbd id="help-palette-kbd"></kbd> marker palette &nbsp;·&nbsp;
          <kbd>Ctrl+/</kbd> add block menu &nbsp;·&nbsp;
          <kbd>Ctrl+Shift+V</kbd> insert verse &nbsp;·&nbsp;
          <kbd>Ctrl+Shift+C</kbd> insert chapter &nbsp;·&nbsp;
          <kbd>Ctrl+Shift+P</kbd> new paragraph
        </p>
      </div>

      <!-- ── Chapter navigation ───────────────────────────────────────── -->
      <div id="section-picker-host" class="section-picker-host"></div>

      <!-- ── Content editor panel ─────────────────────────────────────── -->
      <div id="panel-content" class="panel">
        <div id="conflict-host" class="conflict-host"></div>
        <div id="content-area" class="content-area">
          <div id="source-panel-host" class="source-panel-host" hidden></div>
          <div id="content-split" class="content-split">
            <div id="pm-mount" class="pm"></div>
            <div id="usfm-src-wrap" class="usfm-src-wrap hidden">
              <div class="usfm-src-bar">
                <span class="usfm-src-label">USFM source (live)</span>
              </div>
              <textarea id="usfm-src" class="usfm-src" spellcheck="false"
                aria-label="USFM source"></textarea>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Alignment panel (hidden, activated from overflow menu) ────── -->
      <div id="panel-alignment" class="panel" hidden>
        <div class="alignment-back">
          <button type="button" id="btn-close-alignment" class="btn-back">
            ← Back to editor
          </button>
        </div>
        <div id="align-session-host" class="align-session"></div>
      </div>
    </div>
  `;

  // ── Refs ──────────────────────────────────────────────────────────────────
  const usfmTa = document.getElementById('usfm-src') as HTMLTextAreaElement;
  const usfmWrap = document.getElementById('usfm-src-wrap') as HTMLElement;
  const btnToggleSrc = document.getElementById('btn-toggle-src') as HTMLButtonElement;
  const panelContent = document.getElementById('panel-content') as HTMLElement;
  const panelAlignment = document.getElementById('panel-alignment') as HTMLElement;

  usfmTa.value = SAMPLE_USFM;
  btnToggleSrc.setAttribute('aria-checked', 'false');

  // ── Session ───────────────────────────────────────────────────────────────
  let openMarkerPalette: (v: EditorView) => void = () => {};
  const collabActive = sessionStorage.getItem('usfm-collab') === '1';
  const wsRelay = localStorage.getItem('usfm-ws-relay') ?? '';

  const extraPm = [
    markerPaletteKeymap((v) => openMarkerPalette(v), {
      getTriggerKey: getStoredMarkerPaletteTrigger,
    }),
  ];

  const realtimeOpts = collabActive
    ? {
        transport: new CompositeRealtimeTransport([
          new BroadcastChannelTransport({ displayName: 'Editor' }),
          ...(wsRelay.trim() ? [new WebSocketRelayTransport(wsRelay.trim())] : []),
        ]),
        roomId: 'TIT',
      }
    : undefined;

  const session = new ScriptureSession(document.getElementById('pm-mount')!, {
    chrome: { preset: 'minimal' },
    maxVisibleChapters: 8,
    contextChapters: 1,
    extraProseMirrorPlugins: extraPm,
    ...(realtimeOpts ? { realtime: realtimeOpts } : {}),
  });
  session.loadUSFM(SAMPLE_USFM);

  const autoSync = new AutoSyncScheduler(session.sync, {});
  autoSync.start();

  const syncStatusEl = document.getElementById('sync-status-host')!;
  const syncStatusUi = mountSyncStatus(syncStatusEl, () => {
    const online = navigator.onLine;
    const peers =
      session.sync instanceof RealtimeSyncEngine ? session.sync.getPeers().length : 0;
    return {
      state: !online ? 'offline' : 'synced',
      peerCount: collabActive ? peers : undefined,
      detail: collabActive ? 'Collaboration active (BroadcastChannel + optional relay)' : undefined,
    };
  });

  document.getElementById('btn-collaborate')!.addEventListener('click', () => {
    const repo = window.prompt(
      'DCS / Gitea repo URL (stored locally, optional)',
      localStorage.getItem('usfm-dcs-repo') ?? ''
    );
    const token = window.prompt('Access token (optional, stored locally)', '');
    const ws = window.prompt(
      'WebSocket relay URL (optional; leave empty for same-device tabs only)',
      localStorage.getItem('usfm-ws-relay') ?? ''
    );
    if (repo !== null) localStorage.setItem('usfm-dcs-repo', repo);
    if (token !== null && token !== '') localStorage.setItem('usfm-dcs-token', token);
    if (ws !== null) localStorage.setItem('usfm-ws-relay', ws);
    sessionStorage.setItem('usfm-collab', '1');
    window.location.reload();
  });

  window.addEventListener('online', () => syncStatusUi.update());
  window.addEventListener('offline', () => syncStatusUi.update());

  const view = session.contentView;
  const pmShell = document.getElementById('pm-mount') as HTMLElement;

  // ── Floating bubble: add Bold, Italic, Verse (defaults) + Chapter ─────────
  const wysiwygChrome = attachWysiwygChrome(pmShell, view, {
    bubble: {
      resolveActions: (_ctx, _v, defaults) => {
        const mode = readEditorMode();
        const chapterBubbleAction: WysiwygBubbleAction = {
          id: 'chapter',
          label: mode === 'advanced' ? '+Ch' : 'Chapter',
          title: mode === 'advanced' ? 'Insert next chapter (\\c)' : 'Insert next chapter',
          toolbarIcon: mode === 'advanced' ? undefined : 'chapter',
          visible: (_ctx, v) => {
            const section = getEditorSectionAtPos(v.state, v.state.selection.$head.pos);
            return canInsertChapterMarkerInSection(section);
          },
          run: (v) => insertNextChapter()(v.state, v.dispatch),
        };
        return [...defaults, chapterBubbleAction];
      },
    },
    markerPalette: { getTriggerKey: getStoredMarkerPaletteTrigger },
  });
  openMarkerPalette = wysiwygChrome.openMarkerPalette;

  // ── Source text panel ─────────────────────────────────────────────────────
  const sourcePanelHost = document.getElementById('source-panel-host') as HTMLElement;
  const btnToggleSourceText = document.getElementById('btn-toggle-source-text') as HTMLButtonElement;
  let destroySourcePanel: (() => void) | null = null;
  let sourcePanelMounted = false;

  btnToggleSourceText.addEventListener('click', () => {
    closeOverflow();
    const nowVisible = !sourcePanelHost.hidden;
    sourcePanelHost.hidden = nowVisible;
    btnToggleSourceText.setAttribute('aria-checked', nowVisible ? 'false' : 'true');
    if (!nowVisible && !sourcePanelMounted) {
      sourcePanelMounted = true;
      destroySourcePanel = mountSourcePanel(sourcePanelHost, session, {
        onError: (err) => console.warn('Source panel error:', err),
      });
    }
  });

  // ── Section picker ────────────────────────────────────────────────────────
  mountSectionPicker(document.getElementById('section-picker-host')!, session, {
    onWindowNotice: (msg) => console.info(msg),
  });

  // ── Alignment panel ───────────────────────────────────────────────────────
  let destroyAlign: (() => void) | null = null;

  function mountAlignSession() {
    if (destroyAlign) return;
    const host = document.getElementById('align-session-host')!;
    destroyAlign = mountAlignmentEditor(host, session);
  }

  const btnShowAlignment = document.getElementById('btn-show-alignment') as HTMLButtonElement;
  const btnCloseAlignment = document.getElementById('btn-close-alignment') as HTMLButtonElement;

  btnShowAlignment.addEventListener('click', () => {
    closeOverflow();
    panelContent.hidden = true;
    panelContent.classList.add('hidden');
    panelAlignment.hidden = false;
    panelAlignment.classList.remove('hidden');
    mountAlignSession();
  });

  btnCloseAlignment.addEventListener('click', () => {
    panelContent.hidden = false;
    panelContent.classList.remove('hidden');
    panelAlignment.hidden = true;
    panelAlignment.classList.add('hidden');
  });

  // ── Overflow menu ─────────────────────────────────────────────────────────
  const btnOverflow = document.getElementById('btn-overflow') as HTMLButtonElement;
  const overflowMenu = document.getElementById('overflow-menu') as HTMLElement;

  function closeOverflow() {
    overflowMenu.hidden = true;
    btnOverflow.setAttribute('aria-expanded', 'false');
  }

  btnOverflow.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = overflowMenu.hidden;
    overflowMenu.hidden = !open;
    btnOverflow.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  document.addEventListener('click', (e) => {
    if (!overflowMenu.hidden && !overflowMenu.contains(e.target as Node) && e.target !== btnOverflow) {
      closeOverflow();
    }
  });

  const modeSelect = document.getElementById('mode-select') as HTMLSelectElement;

  function applyEditorModeUi() {
    const mode = readEditorMode();
    if (modeSelect.querySelector(`option[value="${mode}"]`)) {
      modeSelect.value = mode;
    } else {
      modeSelect.value = 'medium';
    }
    view.dom.setAttribute('data-usfm-mode', mode);
  }

  modeSelect.addEventListener('change', () => {
    closeOverflow();
    const v = modeSelect.value;
    if (v === 'basic' || v === 'medium' || v === 'advanced') {
      writeEditorMode(v as EditorMode);
    }
    applyEditorModeUi();
  });

  applyEditorModeUi();

  // Prevent focus loss from toolbar buttons stealing from editor
  document.querySelector('.shell')!.addEventListener('mousedown', (e) => {
    const t = e.target as HTMLElement | null;
    // Do not cancel mousedown on <select> or theme/palette rows: .overflow-item matches the
    // <label> and preventDefault() stops the native dropdown from opening.
    if (t?.closest('.overflow-theme-row') || t?.closest('.overflow-mode-row') || t?.closest('select'))
      return;
    if (t?.closest('.topbar-btn, .overflow-item')) e.preventDefault();
  });

  // ── Help popover ──────────────────────────────────────────────────────────
  const helpBtn = document.getElementById('btn-help') as HTMLButtonElement;
  const helpPopover = document.getElementById('help-popover') as HTMLElement;
  const btnCloseHelp = document.getElementById('btn-close-help') as HTMLButtonElement;

  helpBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeOverflow();
    helpPopover.hidden = false;
  });

  btnCloseHelp.addEventListener('click', () => {
    helpPopover.hidden = true;
  });

  document.addEventListener('click', (e) => {
    if (
      !helpPopover.hidden &&
      !helpPopover.contains(e.target as Node) &&
      e.target !== helpBtn
    ) {
      helpPopover.hidden = true;
    }
  });

  // ── USFM source sync ──────────────────────────────────────────────────────
  let usfmPushTimer: ReturnType<typeof setTimeout> | null = null;
  let syncingFromEditor = false;

  function schedulePushUsfmFromEditor() {
    if (usfmPushTimer) clearTimeout(usfmPushTimer);
    usfmPushTimer = setTimeout(() => {
      usfmPushTimer = null;
      if (document.activeElement === usfmTa) return;
      syncingFromEditor = true;
      try {
        const next = convertUSJDocumentToUSFM(serializeToUSJ(view.state));
        if (usfmTa.value !== next) {
          usfmTa.value = next;
          usfmTa.classList.remove('usfm-src--error');
        }
      } finally {
        syncingFromEditor = false;
      }
    }, 140);
  }

  session.onChange(() => {
    autoSync.notifyEdit();
    schedulePushUsfmFromEditor();
  });

  function debounce(fn: () => void, ms: number) {
    let t: ReturnType<typeof setTimeout> | null = null;
    return () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => { t = null; fn(); }, ms);
    };
  }

  const debouncedApplySource = debounce(() => {
    if (syncingFromEditor) return;
    try {
      session.loadUSFM(usfmTa.value);
      usfmTa.classList.remove('usfm-src--error');
    } catch {
      usfmTa.classList.add('usfm-src--error');
    }
  }, 320);

  usfmTa.addEventListener('input', debouncedApplySource);

  btnToggleSrc.addEventListener('click', () => {
    closeOverflow();
    const nowHiding = !usfmWrap.classList.contains('hidden');
    usfmWrap.classList.toggle('hidden', nowHiding);
    btnToggleSrc.setAttribute('aria-checked', nowHiding ? 'false' : 'true');
    if (!nowHiding) schedulePushUsfmFromEditor();
  });

  // ── Export ────────────────────────────────────────────────────────────────
  document.getElementById('btn-export')!.addEventListener('click', () => {
    closeOverflow();
    const blob = new Blob([convertUSJDocumentToUSFM(serializeToUSJ(view.state))], {
      type: 'text/plain;charset=utf-8',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'edited.usfm';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  document.getElementById('btn-export-usx')!.addEventListener('click', () => {
    closeOverflow();
    const blob = new Blob([session.toUSX()], { type: 'application/xml;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'edited.usx';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // ── Sync ──────────────────────────────────────────────────────────────────
  document.getElementById('btn-sync')!.addEventListener('click', async () => {
    closeOverflow();
    syncStatusUi.update();
    const r = await session.runSync();
    syncStatusUi.update();
    const host = document.getElementById('conflict-host')!;
    host.innerHTML = '';
    if (r.conflicts.length > 0) {
      mountConflictReview(host, r, { onDismiss: () => { host.innerHTML = ''; } });
    }
  });

  // ── Theme ─────────────────────────────────────────────────────────────────
  const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;

  function applyTheme(theme: string) {
    view.dom.setAttribute('data-usfm-theme', theme);
    document.body.setAttribute('data-usfm-theme', theme);
  }

  const initialTheme = (view.dom.getAttribute('data-usfm-theme') as string) ?? 'document';
  themeSelect.value =
    initialTheme === 'dark' || !themeSelect.querySelector(`option[value="${initialTheme}"]`)
      ? 'document'
      : initialTheme;
  applyTheme(themeSelect.value);

  themeSelect.addEventListener('change', () => {
    applyTheme(themeSelect.value);
  });

  const paletteTriggerSelect = document.getElementById('palette-trigger-select') as HTMLSelectElement;

  function syncPaletteTriggerSelect() {
    const stored = getStoredMarkerPaletteTrigger();
    paletteTriggerSelect.replaceChildren();
    for (const p of MARKER_PALETTE_TRIGGER_PRESETS) {
      const opt = document.createElement('option');
      opt.value = p.value;
      opt.textContent = p.label;
      paletteTriggerSelect.appendChild(opt);
    }
    if (!MARKER_PALETTE_TRIGGER_PRESETS.some((p) => p.value === stored)) {
      const opt = document.createElement('option');
      opt.value = stored;
      opt.textContent = `Custom (${stored})`;
      paletteTriggerSelect.appendChild(opt);
    }
    paletteTriggerSelect.value = stored;
  }

  function updateHelpMarkerPaletteShortcut() {
    const kbd = document.getElementById('help-palette-kbd');
    if (kbd) kbd.textContent = formatMarkerPaletteTriggerForHelp(getStoredMarkerPaletteTrigger());
  }

  syncPaletteTriggerSelect();
  updateHelpMarkerPaletteShortcut();

  paletteTriggerSelect.addEventListener('change', () => {
    setStoredMarkerPaletteTrigger(paletteTriggerSelect.value);
    updateHelpMarkerPaletteShortcut();
  });

  // ── File open ─────────────────────────────────────────────────────────────
  const fileOpenInput = document.getElementById('file-open') as HTMLInputElement;
  fileOpenInput.addEventListener('click', () => { fileOpenInput.value = ''; });
  fileOpenInput.addEventListener('change', async (ev) => {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (!f) return;
    const name = f.name.toLowerCase();
    try {
      const text = await f.text();
      if (name.endsWith('.usx') || name.endsWith('.xml')) {
        session.loadUSX(text);
      } else if (name.endsWith('.usj') || (name.endsWith('.json') && text.trim().startsWith('{'))) {
        session.loadUSJ(JSON.parse(text) as UsjDocument);
      } else {
        session.loadUSFM(text);
      }
      usfmTa.value = convertUSJDocumentToUSFM(serializeToUSJ(view.state));
      usfmTa.classList.remove('usfm-src--error');
    } catch {
      usfmTa.classList.add('usfm-src--error');
    }
    view.focus();
  });

  // ── Initial state ─────────────────────────────────────────────────────────
  schedulePushUsfmFromEditor();
  view.focus();

  window.addEventListener('beforeunload', () => {
    autoSync.stop();
    syncStatusUi.destroy();
    session.destroy();
    destroyAlign?.();
    destroySourcePanel?.();
  });
}

mount();

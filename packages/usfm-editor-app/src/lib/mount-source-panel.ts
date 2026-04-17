/**
 * Reference-text panel mount (vanilla DOM). Styles: `legacy-panels.css`.
 */

import { SourceTextSession } from '@usfm-tools/editor';
import type { ScriptureSession, SourceTextProvider } from '@usfm-tools/editor';
import {
  CacheFirstSourceTextProvider,
  DcsSourceTextProvider,
  FileSourceTextProvider,
} from '@usfm-tools/editor-adapters';
import type { ProcessedCacheStorage, SourceCacheStorage } from '@usfm-tools/types';
import { directionForLang } from '@/lib/lang-direction';

export interface SourcePanelMountOptions {
  onLoad?: (provider: SourceTextProvider) => void;
  onError?: (error: Error) => void;
  /** Called when the read-only reference session is created; `null` on teardown. */
  onSourceSession?: (session: SourceTextSession | null) => void;
  /** When set, immediately load this USFM string as the reference (in-memory file). */
  prefillSourceUsfm?: string;
  /** Open the settings drawer once right after mount (e.g. "Add source" tab). */
  openDrawerOnMount?: boolean;
  /**
   * When provided, DCS source loading uses `CacheFirstSourceTextProvider`:
   * processed cache → raw storage → network (write-through).
   */
  cacheStorage?: SourceCacheStorage;
  /** Processed (Layer 2) cache. Used alongside `cacheStorage` for cache-first reads. */
  processedCache?: ProcessedCacheStorage;
}

async function resolveDcsProvider(opts: {
  baseUrl: string;
  owner: string;
  repo: string;
  filePath: string;
  ref?: string;
  token?: string;
  cacheStorage?: SourceCacheStorage;
  processedCache?: ProcessedCacheStorage;
}): Promise<SourceTextProvider> {
  if (opts.cacheStorage && opts.processedCache) {
    const repoId = `${opts.owner}/${opts.repo}`;
    // Look up the cached snapshot to get the releaseTag (needed for cache key).
    let releaseTag = opts.ref ?? 'master';
    let langCode = '';
    try {
      const cachedRepos = await opts.cacheStorage.listCachedRepos();
      const match = cachedRepos.find((r) => r.repoId === repoId);
      if (match) {
        releaseTag = match.releaseTag;
        langCode = match.langCode;
      }
    } catch {
      /* continue with ref as releaseTag */
    }
    return new CacheFirstSourceTextProvider({
      rawStorage: opts.cacheStorage,
      processedCache: opts.processedCache,
      repoId,
      releaseTag,
      ingredientPath: opts.filePath,
      langCode,
      displayName: `${opts.repo} (${releaseTag})`,
      baseUrl: opts.baseUrl,
      owner: opts.owner,
      repo: opts.repo,
      ref: opts.ref,
      token: opts.token,
    });
  }
  return new DcsSourceTextProvider({
    baseUrl: opts.baseUrl,
    owner: opts.owner,
    repo: opts.repo,
    filePath: opts.filePath,
    ref: opts.ref,
    token: opts.token,
  });
}

export function mountSourcePanel(
  container: HTMLElement,
  targetSession: ScriptureSession,
  options: SourcePanelMountOptions = {},
): () => void {
  container.innerHTML = `
    <div class="source-panel">

      <!-- Collapsible settings drawer (hidden by default) -->
      <div class="source-panel-drawer" hidden>

        <!-- Source tabs -->
        <div class="src-tabs" role="tablist">
          <button type="button" class="src-tab src-tab--active" data-tab="file" role="tab" aria-selected="true">This device</button>
          <button type="button" class="src-tab" data-tab="dcs" role="tab" aria-selected="false">Web (DCS)</button>
        </div>

        <!-- File panel -->
        <div class="src-tab-panel" data-panel="file">
          <label class="src-file-label">
            <input type="file" class="src-file-input"
              accept=".usfm,.sfm,.usj,.usx,.txt,.xml,.json,*/*" />
            <span>Choose file...</span>
          </label>
        </div>

        <!-- DCS panel -->
        <div class="src-tab-panel" data-panel="dcs" hidden>
          <div class="src-dcs-step1">
            <input type="text" class="src-dcs-owner" placeholder="Owner (e.g. unfoldingWord)" />
            <input type="text" class="src-dcs-repo"  placeholder="Repository (e.g. en_ult)" />
            <details class="src-dcs-advanced">
              <summary>Advanced</summary>
              <input type="url" class="src-dcs-url" placeholder="Server URL"
                value="https://git.door43.org" />
              <input type="password" class="src-dcs-token" placeholder="Access token (optional)" />
            </details>
            <button type="button" class="src-dcs-continue src-btn-primary">Next</button>
          </div>
          <div class="src-dcs-step2" hidden>
            <input type="text" class="src-dcs-path" placeholder="File path (e.g. 42-LUK.usfm)" />
            <input type="text" class="src-dcs-ref"  placeholder="Branch or tag (optional)" />
            <div class="src-dcs-row">
              <button type="button" class="src-dcs-back src-btn-ghost">Back</button>
              <button type="button" class="src-dcs-load src-btn-primary">Load</button>
            </div>
          </div>
        </div>

        <!-- Options row -->
        <div class="src-options-row">
          <label class="src-sync-label" title="Keep reference on the same chapter as the editor">
            <input type="checkbox" class="src-sync-chapters" checked />
            Sync chapters
          </label>
          <button type="button" class="src-remove-btn" hidden>Remove</button>
        </div>

        <div class="src-status" aria-live="polite"></div>
      </div>

      <!-- Content area -->
      <div class="src-body">
        <div class="src-empty-hint">
          <p>No reference text loaded.</p>
          <p class="src-empty-sub">Open a file or load from the web to compare with your translation.</p>
          <button type="button" class="src-open-btn">Open file</button>
        </div>
        <div class="src-pm-mount pm" hidden></div>
      </div>
    </div>
  `;

  /* -- Element refs -------------------------------------------------------- */
  const drawer        = container.querySelector('.source-panel-drawer') as HTMLElement;
  const tabs          = container.querySelectorAll<HTMLButtonElement>('.src-tab');
  const filePanelEl   = container.querySelector<HTMLElement>('[data-panel="file"]')!;
  const dcsPanelEl    = container.querySelector<HTMLElement>('[data-panel="dcs"]')!;
  const fileInput     = container.querySelector('.src-file-input') as HTMLInputElement;
  const dcsStep1      = container.querySelector('.src-dcs-step1') as HTMLElement;
  const dcsStep2      = container.querySelector('.src-dcs-step2') as HTMLElement;
  const dcsUrlInput   = container.querySelector('.src-dcs-url') as HTMLInputElement;
  const dcsOwnerInput = container.querySelector('.src-dcs-owner') as HTMLInputElement;
  const dcsRepoInput  = container.querySelector('.src-dcs-repo') as HTMLInputElement;
  const dcsContinueBtn = container.querySelector('.src-dcs-continue') as HTMLButtonElement;
  const dcsBackBtn    = container.querySelector('.src-dcs-back') as HTMLButtonElement;
  const dcsPathInput  = container.querySelector('.src-dcs-path') as HTMLInputElement;
  const dcsRefInput   = container.querySelector('.src-dcs-ref') as HTMLInputElement;
  const dcsTokenInput = container.querySelector('.src-dcs-token') as HTMLInputElement;
  const dcsLoadBtn    = container.querySelector('.src-dcs-load') as HTMLButtonElement;
  const syncCheckbox  = container.querySelector('.src-sync-chapters') as HTMLInputElement;
  const removeBtn     = container.querySelector('.src-remove-btn') as HTMLButtonElement;
  const statusEl      = container.querySelector('.src-status') as HTMLElement;
  const emptyHint     = container.querySelector('.src-empty-hint') as HTMLElement;
  const openBtn       = container.querySelector('.src-open-btn') as HTMLButtonElement;
  const pmMount       = container.querySelector('.src-pm-mount') as HTMLElement;

  /* -- Session ------------------------------------------------------------- */
  const sourceSession = new SourceTextSession(pmMount, {
    chrome: { preset: 'minimal' },
    contextChapters: targetSession.getContextChapterRadius(),
  });

  // Subscribe BEFORE notifying the parent (which may immediately call session.load()),
  // so showView() is guaranteed to fire no matter how quickly the load resolves.
  const unsubLoad = sourceSession.onLoad(() => {
    showView();
    setIdentity(true, sourceSession.getProvider()?.displayName);
    if (syncCheckbox.checked) applyTargetWindow();
    const p = sourceSession.getProvider();
    const lc = p?.langCode?.trim();
    const explicit = p && 'direction' in p ? p.direction : undefined;
    void (async () => {
      const dir =
        explicit ?? (lc ? await directionForLang(lc) : 'ltr');
      sourceSession.applyLanguage({ lang: lc || undefined, dir });
    })();
  });

  options.onSourceSession?.(sourceSession);

  /* -- Settings drawer toggle ---------------------------------------------- */
  let drawerOpen = false;

  function setDrawerOpen(open: boolean) {
    drawerOpen = open;
    drawer.hidden = !open;
  }

  /* -- Tabs ----------------------------------------------------------------- */
  let activeTab: 'file' | 'dcs' = 'file';

  function switchTab(tab: 'file' | 'dcs') {
    activeTab = tab;
    tabs.forEach((btn) => {
      const isActive = btn.dataset.tab === tab;
      btn.classList.toggle('src-tab--active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
    });
    filePanelEl.hidden = tab !== 'file';
    dcsPanelEl.hidden = tab !== 'dcs';
  }

  tabs.forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab as 'file' | 'dcs'));
  });

  /* -- Status --------------------------------------------------------------- */
  function setStatus(msg: string, type: 'ok' | 'error' | 'loading' = 'ok') {
    statusEl.textContent = msg;
    statusEl.className = `src-status src-status--${type}`;
  }

  /* -- Identity ------------------------------------------------------------- */
  function setIdentity(loaded: boolean, _name?: string) {
    emptyHint.style.display = loaded ? 'none' : '';
    removeBtn.hidden = !loaded;
  }

  /* -- Load ----------------------------------------------------------------- */
  function showView() {
    emptyHint.style.display = 'none';
    pmMount.removeAttribute('hidden');
  }

  async function handleLoad(provider: SourceTextProvider) {
    setStatus('Loading...', 'loading');
    try {
      await sourceSession.load(provider);
      showView();
      setIdentity(true, provider.displayName);
      setStatus('');
      setDrawerOpen(false);
      options.onLoad?.(provider);
      if (syncCheckbox.checked) applyTargetWindow();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setStatus(`Error: ${error.message}`, 'error');
      options.onError?.(error);
    }
  }

  /* -- File source ---------------------------------------------------------- */
  function triggerFilePick() {
    switchTab('file');
    setDrawerOpen(true);
    fileInput.click();
  }

  openBtn.addEventListener('click', triggerFilePick);

  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    fileInput.value = '';
    await handleLoad(new FileSourceTextProvider(f));
  });

  /* -- DCS source ----------------------------------------------------------- */
  dcsContinueBtn.addEventListener('click', () => {
    const owner = dcsOwnerInput.value.trim();
    const repo  = dcsRepoInput.value.trim();
    if (!owner || !repo) {
      setStatus('Enter owner and repository name.', 'error');
      return;
    }
    dcsStep1.hidden = true;
    dcsStep2.hidden = false;
    setStatus('');
  });

  dcsBackBtn.addEventListener('click', () => {
    dcsStep2.hidden = true;
    dcsStep1.hidden = false;
    setStatus('');
  });

  dcsLoadBtn.addEventListener('click', async () => {
    const baseUrl  = (dcsUrlInput.value.trim() || 'https://git.door43.org').replace(/\/$/, '');
    const owner    = dcsOwnerInput.value.trim();
    const repo     = dcsRepoInput.value.trim();
    const filePath = dcsPathInput.value.trim();
    const ref      = dcsRefInput.value.trim() || undefined;
    const token    = dcsTokenInput.value.trim() || undefined;

    if (!owner || !repo || !filePath) {
      setStatus('Fill in owner, repo, and file path.', 'error');
      return;
    }

    const provider = await resolveDcsProvider({
      baseUrl,
      owner,
      repo,
      filePath,
      ref,
      token,
      cacheStorage: options.cacheStorage,
      processedCache: options.processedCache,
    });
    await handleLoad(provider);
  });

  /* -- Remove --------------------------------------------------------------- */
  removeBtn.addEventListener('click', () => {
    pmMount.setAttribute('hidden', '');
    emptyHint.style.display = '';
    setIdentity(false);
    setStatus('');
    setDrawerOpen(false);
    dcsStep1.hidden = false;
    dcsStep2.hidden = true;
  });

  /* -- Sync ----------------------------------------------------------------- */
  function applyTargetWindow() {
    if (!sourceSession.isLoaded()) return;
    sourceSession.syncSubsetFromTarget(targetSession);
  }

  let unsubSections: (() => void) | null = null;

  function startSync() {
    unsubSections?.();
    unsubSections = targetSession.onVisibleSectionsChange(() => {
      if (syncCheckbox.checked) applyTargetWindow();
    });
  }

  function stopSync() {
    unsubSections?.();
    unsubSections = null;
  }

  syncCheckbox.addEventListener('change', () => {
    if (syncCheckbox.checked) { startSync(); applyTargetWindow(); }
    else stopSync();
  });

  startSync();
  setIdentity(false);

  if (options.openDrawerOnMount) {
    setDrawerOpen(true);
  }

  if (options.prefillSourceUsfm?.trim()) {
    const f = new File([options.prefillSourceUsfm], 'reference.usfm', { type: 'text/plain' });
    void handleLoad(new FileSourceTextProvider(f));
  }

  return () => {
    stopSync();
    unsubLoad();
    options.onSourceSession?.(null);
    sourceSession.destroy();
  };
}

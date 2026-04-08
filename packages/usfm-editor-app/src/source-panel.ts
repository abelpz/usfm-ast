/**
 * Reference-text panel: a read-only scripture view placed side-by-side with the
 * content editor for translation reference.
 *
 * Features:
 * - Provider picker: local file (USFM / USJ / USX) and DCS repository.
 * - Extensible: any SourceTextProvider can be used programmatically.
 * - Automatic chapter-window sync with the paired target ScriptureSession.
 * - Text is fully selectable / copyable, but not editable.
 */

import { SourceTextSession } from '@usfm-tools/editor';
import type { ScriptureSession, SourceTextProvider } from '@usfm-tools/editor';
import { DcsSourceTextProvider, FileSourceTextProvider } from './source-providers';

export interface SourcePanelOptions {
  /** Called after a source document loads successfully. */
  onLoad?: (provider: SourceTextProvider) => void;
  /** Called when loading fails. */
  onError?: (error: Error) => void;
}

/**
 * Mounts a reference-text panel inside `container` and binds it to
 * `targetSession` for automatic chapter-window synchronisation.
 *
 * @returns An unmount / cleanup function.
 */
export function mountSourcePanel(
  container: HTMLElement,
  targetSession: ScriptureSession,
  options: SourcePanelOptions = {}
): () => void {
  container.innerHTML = `
    <div class="source-panel">
      <div class="source-panel-identity" aria-live="polite">
        <span class="source-panel-identity-line">
          <strong>Reference text</strong>
          <span class="source-panel-identity-status">— none loaded</span>
        </span>
        <button type="button" class="source-panel-cta-open" title="Choose a file on this device">Open…</button>
      </div>

      <div class="source-panel-header">
        <div class="source-panel-controls">
          <select class="src-provider-select" aria-label="Reference text source">
            <option value="">— add reference —</option>
            <option value="file">This device</option>
            <option value="dcs">Door43 / DCS</option>
          </select>

          <label class="file src-file-label" hidden title="Open a local USFM, USJ or USX file">
            <input type="file" class="src-file-input"
              accept=".usfm,.sfm,.usj,.usx,.txt,.xml,.json,*/*" />
            Choose file
          </label>

          <div class="src-dcs-step1" hidden>
            <input type="url"  class="src-dcs-url"   placeholder="https://git.door43.org"
              value="https://git.door43.org" />
            <input type="text" class="src-dcs-owner" placeholder="owner" />
            <input type="text" class="src-dcs-repo"  placeholder="repo" />
            <button type="button" class="src-dcs-continue">Continue</button>
          </div>

          <div class="src-dcs-step2" hidden>
            <input type="text" class="src-dcs-path"  placeholder="42-LUK.usfm" />
            <input type="text" class="src-dcs-ref"   placeholder="branch / tag (optional)" />
            <input type="password" class="src-dcs-token" placeholder="token (optional)" />
            <button type="button" class="src-dcs-load">Load from DCS</button>
            <button type="button" class="src-dcs-back">Back</button>
          </div>

          <label class="src-sync-label" title="Mirror the editor's chapter window in the reference column">
            <input type="checkbox" class="src-sync-chapters" checked />
            Sync chapters
          </label>
        </div>

        <div class="src-status" aria-live="polite"></div>
      </div>

      <div class="src-body">
        <div class="src-empty-hint">
          <p>No reference text loaded.</p>
          <p class="src-empty-sub">Load a gateway or original-language text to compare with your translation.</p>
        </div>
        <div class="src-pm-mount" hidden></div>
      </div>
    </div>
  `;

  const identityStatus = container.querySelector('.source-panel-identity-status') as HTMLElement;
  const ctaOpen = container.querySelector('.source-panel-cta-open') as HTMLButtonElement;
  const providerSelect = container.querySelector('.src-provider-select') as HTMLSelectElement;
  const fileLabel = container.querySelector('.src-file-label') as HTMLElement;
  const fileInput = container.querySelector('.src-file-input') as HTMLInputElement;
  const dcsStep1 = container.querySelector('.src-dcs-step1') as HTMLElement;
  const dcsStep2 = container.querySelector('.src-dcs-step2') as HTMLElement;
  const dcsUrlInput = container.querySelector('.src-dcs-url') as HTMLInputElement;
  const dcsOwnerInput = container.querySelector('.src-dcs-owner') as HTMLInputElement;
  const dcsRepoInput = container.querySelector('.src-dcs-repo') as HTMLInputElement;
  const dcsContinueBtn = container.querySelector('.src-dcs-continue') as HTMLButtonElement;
  const dcsBackBtn = container.querySelector('.src-dcs-back') as HTMLButtonElement;
  const dcsPathInput = container.querySelector('.src-dcs-path') as HTMLInputElement;
  const dcsRefInput = container.querySelector('.src-dcs-ref') as HTMLInputElement;
  const dcsTokenInput = container.querySelector('.src-dcs-token') as HTMLInputElement;
  const dcsLoadBtn = container.querySelector('.src-dcs-load') as HTMLButtonElement;
  const syncCheckbox = container.querySelector('.src-sync-chapters') as HTMLInputElement;
  const statusEl = container.querySelector('.src-status') as HTMLElement;
  const emptyHint = container.querySelector('.src-empty-hint') as HTMLElement;
  const pmMount = container.querySelector('.src-pm-mount') as HTMLElement;

  const sourceSession = new SourceTextSession(pmMount, {
    chrome: { preset: 'minimal' },
    contextChapters: targetSession.getContextChapterRadius(),
  });

  let dcsConnected = false;

  function setStatus(msg: string, type: 'ok' | 'error' | 'loading' = 'ok') {
    statusEl.textContent = msg;
    statusEl.className = `src-status src-status--${type}`;
  }

  function setIdentity(loaded: boolean, name?: string) {
    identityStatus.textContent = loaded && name ? `— ${name}` : '— none loaded';
    ctaOpen.hidden = loaded;
    emptyHint.style.display = loaded ? 'none' : '';
  }

  function showView() {
    emptyHint.style.display = 'none';
    pmMount.removeAttribute('hidden');
  }

  async function handleLoad(provider: SourceTextProvider) {
    setStatus('Loading…', 'loading');
    try {
      await sourceSession.load(provider);
      showView();
      setIdentity(true, provider.displayName);
      setStatus(`Loaded ${provider.displayName}`, 'ok');
      options.onLoad?.(provider);

      if (syncCheckbox.checked) {
        applyTargetWindow();
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setStatus(`Error: ${error.message}`, 'error');
      options.onError?.(error);
    }
  }

  function applyTargetWindow() {
    if (!sourceSession.isLoaded()) return;
    const chapters = targetSession.getVisibleChapterNumbers();
    const ctx = targetSession.getContextChapterRadius();
    sourceSession.setVisibleChapters(chapters, ctx);
  }

  providerSelect.addEventListener('change', () => {
    const val = providerSelect.value;
    fileLabel.toggleAttribute('hidden', val !== 'file');
    if (val === 'dcs') {
      dcsConnected = false;
      dcsStep1.removeAttribute('hidden');
      dcsStep2.setAttribute('hidden', '');
    } else {
      dcsConnected = false;
      dcsStep1.setAttribute('hidden', '');
      dcsStep2.setAttribute('hidden', '');
    }
  });

  ctaOpen.addEventListener('click', () => {
    providerSelect.value = 'file';
    providerSelect.dispatchEvent(new Event('change'));
    fileInput.click();
  });

  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    fileInput.value = '';
    await handleLoad(new FileSourceTextProvider(f));
  });

  dcsContinueBtn.addEventListener('click', () => {
    const baseUrl = dcsUrlInput.value.trim().replace(/\/$/, '');
    const owner = dcsOwnerInput.value.trim();
    const repo = dcsRepoInput.value.trim();
    if (!baseUrl || !owner || !repo) {
      setStatus('Enter the site URL, owner, and repository name.', 'error');
      return;
    }
    dcsConnected = true;
    dcsStep1.setAttribute('hidden', '');
    dcsStep2.removeAttribute('hidden');
    setStatus(`Connected to ${owner}/${repo}. Choose a file path and load.`, 'ok');
  });

  dcsBackBtn.addEventListener('click', () => {
    dcsConnected = false;
    dcsStep2.setAttribute('hidden', '');
    dcsStep1.removeAttribute('hidden');
    setStatus('', 'ok');
  });

  dcsLoadBtn.addEventListener('click', async () => {
    const baseUrl = dcsUrlInput.value.trim().replace(/\/$/, '');
    const owner = dcsOwnerInput.value.trim();
    const repo = dcsRepoInput.value.trim();
    const filePath = dcsPathInput.value.trim();
    const ref = dcsRefInput.value.trim() || undefined;
    const token = dcsTokenInput.value.trim() || undefined;

    if (!baseUrl || !owner || !repo || !filePath) {
      setStatus('Fill in URL, owner, repo, and file path.', 'error');
      return;
    }
    await handleLoad(new DcsSourceTextProvider({ baseUrl, owner, repo, filePath, ref, token }));
  });

  let unsubSections: (() => void) | null = null;

  function startSync() {
    unsubSections?.();
    unsubSections = targetSession.onVisibleSectionsChange((sections) => {
      const chapters = sections
        .filter((s): s is { type: 'chapter'; chapter: number } => s.type === 'chapter')
        .map((s) => s.chapter);
      if (chapters.length > 0) {
        sourceSession.setVisibleChapters(chapters, targetSession.getContextChapterRadius());
      }
    });
  }

  function stopSync() {
    unsubSections?.();
    unsubSections = null;
  }

  syncCheckbox.addEventListener('change', () => {
    if (syncCheckbox.checked) {
      startSync();
      applyTargetWindow();
    } else {
      stopSync();
    }
  });

  startSync();
  setIdentity(false);

  return () => {
    stopSync();
    sourceSession.destroy();
  };
}

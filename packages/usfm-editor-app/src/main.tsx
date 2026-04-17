import App from '@/App';
import { AppErrorBoundary } from '@/AppErrorBoundary';
import { prefetchCatalogLanguages, prefetchLangnames } from '@/lib/dcs-langnames-cache';
import { initKvCatalogCache } from '@/lib/kv-catalog-cache';
import '@/globals.css';
import '@/legacy-panels.css';
import '@usfm-tools/editor/chrome.css';
import '@usfm-tools/editor-ui/chrome-ui.css';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PlatformProvider } from '@/platform/PlatformContext';
import { initProjectStorage } from '@/lib/project-storage';
import { initOfflineSyncQueue } from '@/lib/offline-sync-queue';
import { initSourceCacheStorage, initProcessedCacheStorage } from '@/hooks/useSourceCache';
import { initDownloadQueue } from '@/hooks/useDownloadQueue';
import { loadDcsCredentials } from '@/lib/dcs-storage';
import { IndexedDbProjectStorage } from '@usfm-tools/editor-adapters';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root missing');

/**
 * Detect Tauri v2 runtime by presence of `__TAURI_INTERNALS__`.
 * This is the canonical Tauri v2 detection pattern — it is injected by the
 * WebView before any JS runs, so it is synchronously available here.
 */
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// For web, warm the in-memory cache early (before the async adapter creation).
// On Tauri, initKvCatalogCache (called below) handles priming from the native
// KV store with a background network refresh when stale.
if (!isTauri) {
  prefetchLangnames();
  prefetchCatalogLanguages();
}

async function createAdapter() {
  if (isTauri) {
    const { createTauriPlatformAdapter } = await import('@usfm-tools/platform-adapters/tauri');
    return createTauriPlatformAdapter({});
  }
  const { createWebPlatformAdapter } = await import('@usfm-tools/platform-adapters/web');
  return createWebPlatformAdapter({
    storage: new IndexedDbProjectStorage(),
    kvPrefix: 'usfm-app:',
  });
}

// Use MemoryRouter on Tauri: the custom-protocol URL (tauri://localhost) makes
// BrowserRouter history unreliable — back/forward buttons and deep-links would
// try to navigate the WebView's URL instead of the React router stack.
const Router = isTauri ? MemoryRouter : BrowserRouter;

createAdapter().then(async (adapter) => {
  // Wire up platform-provided storage backends before the React tree mounts.
  initProjectStorage(adapter);
  initOfflineSyncQueue(adapter);
  if (adapter.sourceCache) {
    initSourceCacheStorage(adapter.sourceCache);
  }
  if (adapter.processedCache) {
    initProcessedCacheStorage(adapter.processedCache);
  }
  if (adapter.downloadQueue) {
    initDownloadQueue(adapter.downloadQueue);
  }

  // On Tauri, prime the catalog/langnames cache from native KV store so the
  // language pickers work immediately on offline boot. Pass the stored DCS host
  // so custom servers (qa.door43.org, self-hosted) get their own KV slot.
  if (isTauri) {
    const savedHost = loadDcsCredentials()?.host ?? 'git.door43.org';
    await initKvCatalogCache(adapter.kv, savedHost);
  }

  /* StrictMode disabled: double mount destroys ProseMirror while chrome still handles events → posFromDOM on null docView. */
  createRoot(rootEl).render(
    <AppErrorBoundary>
      <Router>
        <PlatformProvider adapter={adapter}>
          <TooltipProvider delayDuration={300}>
            <App />
          </TooltipProvider>
        </PlatformProvider>
      </Router>
    </AppErrorBoundary>,
  );
});

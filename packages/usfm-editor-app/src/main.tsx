import App from '@/App';
import { AppErrorBoundary } from '@/AppErrorBoundary';
import { prefetchCatalogLanguages, prefetchLangnames } from '@/lib/dcs-langnames-cache';
import '@/globals.css';
import '@/legacy-panels.css';
import '@usfm-tools/editor/chrome.css';
import '@usfm-tools/editor-ui/chrome-ui.css';
import { TooltipProvider } from '@/components/ui/tooltip';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root missing');

prefetchLangnames();
prefetchCatalogLanguages();

/* StrictMode disabled: double mount destroys ProseMirror while chrome still handles events → posFromDOM on null docView. */
createRoot(rootEl).render(
  <AppErrorBoundary>
    <BrowserRouter>
      <TooltipProvider delayDuration={300}>
        <App />
      </TooltipProvider>
    </BrowserRouter>
  </AppErrorBoundary>,
);

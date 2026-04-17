import { EditorPage } from '@/pages/EditorPage';
import { HomePage } from '@/pages/HomePage';
import { LocalProjectPage } from '@/pages/LocalProjectPage';
import { SourceCachePage } from '@/pages/SourceCachePage';
import { UpdateBanner } from '@/components/UpdateBanner';
import { DownloadProgressIndicator } from '@/components/DownloadProgressIndicator';
import { Navigate, Route, Routes } from 'react-router-dom';

/** Old DCS dashboard used `/project?owner=…`; projects now import from Home → `/project/:id`. */
function LegacyDcsProjectRedirect() {
  return <Navigate to="/" replace />;
}

export default function App() {
  return (
    <>
      <UpdateBanner />
      <div className="fixed bottom-2 right-2 z-50">
        <DownloadProgressIndicator />
      </div>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/dcs-project" element={<Navigate to="/" replace />} />
        <Route path="/project/:id" element={<LocalProjectPage />} />
        <Route path="/project/:id/editor" element={<EditorPage />} />
        <Route path="/project" element={<LegacyDcsProjectRedirect />} />
        <Route path="/editor" element={<EditorPage />} />
        <Route path="/source-cache" element={<SourceCachePage />} />
      </Routes>
    </>
  );
}

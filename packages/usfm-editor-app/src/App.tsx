import { EditorPage } from '@/pages/EditorPage';
import { HomePage } from '@/pages/HomePage';
import { LocalProjectPage } from '@/pages/LocalProjectPage';
import { ProjectPage } from '@/pages/ProjectPage';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

/** Old DCS dashboard used `/project?owner=…`; local projects use `/project/:id`. */
function LegacyDcsProjectRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/dcs-project${search}`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/dcs-project" element={<ProjectPage />} />
      <Route path="/project/:id" element={<LocalProjectPage />} />
      <Route path="/project/:id/editor" element={<EditorPage />} />
      <Route path="/project" element={<LegacyDcsProjectRedirect />} />
      <Route path="/editor" element={<EditorPage />} />
    </Routes>
  );
}

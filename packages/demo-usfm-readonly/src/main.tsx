import '@usfm-tools/editor-themes/base.css';
import '@usfm-tools/editor-themes/markers.css';
import '@usfm-tools/usfm-readonly-react/styles.css';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

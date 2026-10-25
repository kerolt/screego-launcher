import React from 'react';
import { createRoot } from 'react-dom/client';

// Locally bundled mono font (no remote font loading; CSP stays default-src 'self').
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';
import './styles/global.css';

import App from './App';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

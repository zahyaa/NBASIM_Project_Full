import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { installFetchBase } from './api';

// Rewrite /api/... fetches to REACT_APP_API_URL (Netlify front-end + Ubuntu API).
// No-op in dev when the env var is unset.
installFetchBase();

// Kill any service worker registered by an older deployed build of this app.
// Old SWs were caching stale chunks (e.g. an obsolete "Player already
// drafted (by you or a CPU team)" rule) and serving them in place of the
// dev server's fresh code. Unregistering here is idempotent.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(r => r.unregister());
  }).catch(() => {});
  if (window.caches && caches.keys) {
    caches.keys().then(keys => keys.forEach(k => caches.delete(k))).catch(() => {});
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);

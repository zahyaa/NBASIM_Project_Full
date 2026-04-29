// Centralizes the API base URL so the same React build can run against any backend.
//
// Why this file exists: the frontend is hosted on Netlify and the backend runs
// on a separate Ubuntu host (e.g. https://api.bballsim.app). Production builds
// can't rely on CRA's dev proxy, so every `/api/...` call must be rewritten to
// the absolute API origin. Rather than touching ~80 fetch sites, we install a
// tiny wrapper around the global fetch that prefixes `/api/...` paths with the
// configured base URL. In dev (no env var) the original same-origin path is
// preserved so CRA's proxy keeps working.
//
// Configure by setting `REACT_APP_API_URL` at build time:
//   REACT_APP_API_URL=https://api.bballsim.app
//
// Same-origin paths and absolute URLs are passed through untouched.

const API_BASE = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');

export function apiUrl(path) {
  if (!path || typeof path !== 'string') return path;
  if (/^https?:\/\//i.test(path)) return path;
  if (!API_BASE) return path;
  if (path.startsWith('/api/') || path === '/api') return API_BASE + path;
  return path;
}

export function installFetchBase() {
  if (typeof window === 'undefined' || !window.fetch || window.__NBASIM_FETCH_PATCHED__) return;
  const orig = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (typeof input === 'string') {
      return orig(apiUrl(input), init);
    }
    if (input && typeof input === 'object' && 'url' in input && typeof input.url === 'string') {
      const rewritten = apiUrl(input.url);
      if (rewritten !== input.url) {
        return orig(new Request(rewritten, input), init);
      }
    }
    return orig(input, init);
  };
  window.__NBASIM_FETCH_PATCHED__ = true;
}

// Optional helper for new code: api('/api/foo', { method: 'POST', body: ... })
// Auto-attaches Authorization from localStorage 'token' and JSON content-type
// when a body is present. Existing fetch() call sites continue to work via the
// global patch above and don't need to migrate.
export async function api(path, options = {}) {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  const hasBody = options.body !== undefined && options.body !== null;
  const headers = {
    ...(hasBody && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  return fetch(apiUrl(path), { ...options, headers });
}

export default api;

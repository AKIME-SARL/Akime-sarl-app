/**
 * api.js — authenticated fetch wrapper with silent token refresh
 *
 * Usage (in admin.js or any admin page script):
 *
 *   import { apiFetch } from '/js/api.js';                 // if using ES modules
 *   // — or include this file with <script src="/js/api.js"> and use window.apiFetch —
 *
 *   const data = await apiFetch('/api/content/projects');
 *   const created = await apiFetch('/api/content/projects', {
 *     method: 'POST',
 *     body: formData,   // FormData or JSON string — Content-Type set automatically
 *   });
 */

(function (global) {
  // ── Token storage helpers ──────────────────────────────────────────────────
  function getAccessToken()  { return sessionStorage.getItem('accessToken');  }
  function setAccessToken(t) { sessionStorage.setItem('accessToken', t);      }

  function redirectToLogin() {
    sessionStorage.clear();
    window.location.replace('/admin/login');
  }

  // ── Decode JWT payload (no crypto verification — server does that) ─────────
  function tokenExpiresAt(token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp ? payload.exp * 1000 : 0;
    } catch { return 0; }
  }

  // ── Silent refresh ─────────────────────────────────────────────────────────
  let _refreshPromise = null; // de-duplicate concurrent refresh calls

  async function refreshAccessToken() {
    if (_refreshPromise) return _refreshPromise;

    _refreshPromise = (async () => {
      try {
        const res  = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'same-origin',
        });
        const data = await res.json();

        if (data.success && data.data.accessToken) {
          setAccessToken(data.data.accessToken);
          return data.data.accessToken;
        }
        redirectToLogin();
        return null;
      } catch {
        redirectToLogin();
        return null;
      } finally {
        _refreshPromise = null;
      }
    })();

    return _refreshPromise;
  }

  // ── Core fetch wrapper ─────────────────────────────────────────────────────
  /**
   * apiFetch(url, options)
   *
   * Behaves like fetch() but:
   *  - Attaches Bearer token automatically
   *  - Silently refreshes if the access token is expired (or a 401 comes back)
   *  - Redirects to /admin/login if refresh also fails
   *  - Parses JSON and throws on non-2xx responses
   *
   * @param  {string} url
   * @param  {RequestInit} [options]
   * @returns {Promise<any>}  parsed JSON body
   */
  async function apiFetch(url, options = {}) {
    let token = getAccessToken();

    // Pre-emptive refresh if token expires within the next 30 seconds
    if (token && tokenExpiresAt(token) - Date.now() < 30_000) {
      token = await refreshAccessToken();
      if (!token) return; // redirectToLogin already called
    }

    const headers = new Headers(options.headers || {});

    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    // Only set Content-Type to JSON if body is a plain object / string
    // (leave FormData alone so the browser sets the correct multipart boundary)
    if (
      options.body &&
      !(options.body instanceof FormData) &&
      !headers.has('Content-Type')
    ) {
      headers.set('Content-Type', 'application/json');
      if (typeof options.body === 'object') {
        options.body = JSON.stringify(options.body);
      }
    }

    let response = await fetch(url, { ...options, headers });

    // One automatic retry on 401 — access token might have been revoked server-side
    if (response.status === 401) {
      const newToken = await refreshAccessToken();
      if (!newToken) return;

      headers.set('Authorization', `Bearer ${newToken}`);
      response = await fetch(url, { ...options, headers });
    }

    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try { const err = await response.json(); message = err.message || message; } catch {}
      throw new Error(message);
    }

    // Return parsed JSON, or null for 204 No Content
    if (response.status === 204) return null;
    return response.json();
  }

  // ── Logout helper ──────────────────────────────────────────────────────────
  async function logout() {
    try {
      await apiFetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });
    } catch { /* ignore — clear anyway */ }
    sessionStorage.clear();
    window.location.replace('/admin/login');
  }

  // ── Expose globally (also supports ES module import) ──────────────────────
  global.apiFetch = apiFetch;
  global.logout   = logout;

})(window);

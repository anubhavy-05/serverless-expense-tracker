// ════════════════════════════════════════════════════════════
// Auth module: Cognito Hosted UI with PKCE
// ════════════════════════════════════════════════════════════
const Auth = (() => {
  const cfg = () => window.APP_CONFIG;
  const STORE = 'et_tokens';

  function randomString(len = 64) {
    const bytes = crypto.getRandomValues(new Uint8Array(len));
    return Array.from(bytes, b => ('0' + b.toString(16)).slice(-2)).join('').slice(0, len);
  }

  function base64Url(buffer) {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async function challengeFrom(verifier) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return base64Url(digest);
  }

  function saveTokens(tokens) {
    tokens.expires_at = Date.now() + (tokens.expires_in || 3600) * 1000;
    sessionStorage.setItem(STORE, JSON.stringify(tokens));
  }

  function readTokens() {
    try { return JSON.parse(sessionStorage.getItem(STORE) || 'null'); } catch { return null; }
  }

  function clearTokens() { sessionStorage.removeItem(STORE); }

  function decodeJwt(token) {
    try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { return {}; }
  }

  async function login() {
    const verifier = randomString();
    sessionStorage.setItem('et_pkce_verifier', verifier);
    const challenge = await challengeFrom(verifier);
    const url = new URL(cfg().COGNITO_DOMAIN + '/oauth2/authorize');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', cfg().CLIENT_ID);
    url.searchParams.set('redirect_uri', cfg().REDIRECT_URI);
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('code_challenge', challenge);
    window.location.assign(url.toString());
  }

  function logout() {
    clearTokens();
    const url = new URL(cfg().COGNITO_DOMAIN + '/logout');
    url.searchParams.set('client_id', cfg().CLIENT_ID);
    url.searchParams.set('logout_uri', cfg().REDIRECT_URI);
    window.location.assign(url.toString());
  }

  async function exchangeCode(code) {
    const verifier = sessionStorage.getItem('et_pkce_verifier') || '';
    const res = await fetch(cfg().COGNITO_DOMAIN + '/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: cfg().CLIENT_ID,
        code,
        redirect_uri: cfg().REDIRECT_URI,
        code_verifier: verifier,
      }),
    });
    if (!res.ok) throw new Error('Token exchange failed: ' + res.status);
    saveTokens(await res.json());
    sessionStorage.removeItem('et_pkce_verifier');
  }

  async function refresh() {
    const tokens = readTokens();
    if (!tokens?.refresh_token) return false;
    const res = await fetch(cfg().COGNITO_DOMAIN + '/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: cfg().CLIENT_ID,
        refresh_token: tokens.refresh_token,
      }),
    });
    if (!res.ok) return false;
    const fresh = await res.json();
    saveTokens({ ...tokens, ...fresh });
    return true;
  }

  async function init() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      await exchangeCode(code);
      window.history.replaceState({}, '', cfg().REDIRECT_URI);
    }
    const tokens = readTokens();
    if (!tokens) return false;
    if (Date.now() > tokens.expires_at - 60000) return await refresh();
    return true;
  }

  function getIdToken() { return readTokens()?.id_token || null; }

  function getUserEmail() {
    const t = getIdToken();
    return t ? decodeJwt(t).email : null;
  }

  return { init, login, logout, getIdToken, getUserEmail };
})();

// ── Authenticated fetch wrapper ──────────────────────────────
async function apiFetch(path = '', options = {}) {
  const token = Auth.getIdToken();
  if (!token) { Auth.login(); throw new Error('Not authenticated'); }
  const res = await fetch(window.APP_CONFIG.API_URL + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) { Auth.login(); throw new Error('Session expired'); }
  return res;
}

window.Auth = Auth;
window.apiFetch = apiFetch;
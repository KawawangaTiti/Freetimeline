/* FreeTimeline — account client (Level 2). Thin wrapper over the Cloudflare Worker API.
 *
 * INERT until you set API below to your deployed Worker URL, and it is NOT loaded by
 * the site yet (no <script> tag) — so it can't affect production. When the backend is
 * live: set API, add the <script> tag to universe.html + biography.html, and add the
 * API origin to the meta-CSP connect-src.
 *
 * Token is kept in localStorage and sent as `Authorization: Bearer`. The timeline JSON
 * is the same shape the app already exports/imports, so save/load reuse that plumbing.
 */
(function () {
  var API = 'https://freetimeline-api.break0utphp.workers.dev'; // live Cloudflare Worker (D1 in EU)
  var KEY = 'ft_token', UKEY = 'ft_user';

  function token() { try { return localStorage.getItem(KEY) || ''; } catch (_) { return ''; } }
  function setSession(t, u) {
    try { if (t) localStorage.setItem(KEY, t); if (u) localStorage.setItem(UKEY, JSON.stringify(u)); } catch (_) {}
  }
  function clearSession() { try { localStorage.removeItem(KEY); localStorage.removeItem(UKEY); } catch (_) {} }
  function currentUser() { try { return JSON.parse(localStorage.getItem(UKEY) || 'null'); } catch (_) { return null; } }
  function isSignedIn() { return !!token(); }
  function configured() { return !!API; }

  async function api(path, method, body) {
    if (!API) throw new Error('Accounts are not enabled yet.');
    var headers = { 'Content-Type': 'application/json' };
    var t = token(); if (t) headers['Authorization'] = 'Bearer ' + t;
    var res = await fetch(API + path, { method: method || 'GET', headers: headers, body: body ? JSON.stringify(body) : undefined });
    var data = null; try { data = await res.json(); } catch (_) {}
    if (!res.ok) { if (res.status === 401) clearSession(); throw new Error((data && data.error) || ('Request failed (' + res.status + ')')); }
    return data;
  }

  async function register(email, password, displayName) {
    var r = await api('/api/register', 'POST', { email: email, password: password, displayName: displayName });
    setSession(r.token, r.user); return r.user;
  }
  async function login(email, password) {
    var r = await api('/api/login', 'POST', { email: email, password: password });
    setSession(r.token, r.user); return r.user;
  }
  function logout() { clearSession(); }

  // timelines
  function list() { return api('/api/timelines', 'GET'); }
  function create(title, app, data, visibility) { return api('/api/timelines', 'POST', { title: title, app: app, data: data, visibility: visibility || 'private' }); }
  function load(id) { return api('/api/timelines/' + id, 'GET'); }
  function loadPublic(id) { return api('/api/public/' + id, 'GET'); }
  function save(id, patch) { return api('/api/timelines/' + id, 'PUT', patch); }        // patch: {data?, title?, visibility?}
  function remove(id) { return api('/api/timelines/' + id, 'DELETE'); }
  function setVisibility(id, visibility) { return save(id, { visibility: visibility }); }
  function share(id, email, permission) { return api('/api/timelines/' + id + '/share', 'POST', { email: email, permission: permission || 'view' }); }

  window.ftAccount = {
    configured: configured, isSignedIn: isSignedIn, currentUser: currentUser,
    register: register, login: login, logout: logout,
    list: list, create: create, load: load, loadPublic: loadPublic,
    save: save, remove: remove, setVisibility: setVisibility, share: share
  };
})();

/* FreeTimeline — account client (Level 2). Thin wrapper over the Cloudflare Worker API.
 *
 * LIVE IN PRODUCTION. Accounts are active: API below points at the deployed Cloudflare
 * Worker (D1 in EU), and this script IS loaded via <script> tag in universe.html and
 * biography.html, with the API origin whitelisted in the meta-CSP connect-src.
 * Exposing sign in / sign up to visitors is intentional — the cloud is opt-in and the
 * app stays local-first by default (see ft-account-ui.js).
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
  function save(id, patch) { return api('/api/timelines/' + id, 'PUT', patch); }        // patch: {data?, title?, visibility?, description?, tags?, cover?}
  function remove(id) { return api('/api/timelines/' + id, 'DELETE'); }
  function setVisibility(id, visibility) { return save(id, { visibility: visibility }); }
  function share(id, email, permission) { return api('/api/timelines/' + id + '/share', 'POST', { email: email, permission: permission || 'view' }); }

  // social (Level 3) — public feed, profiles, likes/favs, follows, comments, notifications
  function qstr(params) {
    var out = [];
    for (var k in params) if (params[k] !== undefined && params[k] !== null && params[k] !== '') out.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
    return out.length ? '?' + out.join('&') : '';
  }
  function feed(params) { return api('/api/public' + qstr(params || {}), 'GET'); }       // {sort, app, tag, q, limit, offset}
  function feedFollowing() { return api('/api/feed/following', 'GET'); }
  function profile(username) { return api('/api/users/' + encodeURIComponent(username), 'GET'); }
  function updateProfile(patch) { return api('/api/me/profile', 'PUT', patch); }        // {username?, displayName?, bio?, avatar?, bannerColor?}
  function changeEmail(password, newEmail) { return api('/api/change-email', 'POST', { password: password, newEmail: newEmail }); }
  function changePassword(cur, next) { return api('/api/change-password', 'POST', { currentPassword: cur, newPassword: next }); }
  function like(id) { return api('/api/timelines/' + id + '/like', 'POST'); }
  function unlike(id) { return api('/api/timelines/' + id + '/like', 'DELETE'); }
  function favorite(id) { return api('/api/timelines/' + id + '/favorite', 'POST'); }
  function unfavorite(id) { return api('/api/timelines/' + id + '/favorite', 'DELETE'); }
  function follow(username) { return api('/api/users/' + encodeURIComponent(username) + '/follow', 'POST'); }
  function unfollow(username) { return api('/api/users/' + encodeURIComponent(username) + '/follow', 'DELETE'); }
  function comments(id) { return api('/api/public/' + id + '/comments', 'GET'); }
  function comment(id, body, parentId) { return api('/api/public/' + id + '/comments', 'POST', { body: body, parentId: parentId || null }); }
  function deleteComment(cid) { return api('/api/comments/' + cid, 'DELETE'); }
  function notifications() { return api('/api/me/notifications', 'GET'); }
  function readNotifications() { return api('/api/me/notifications/read', 'POST'); }
  function library() { return api('/api/me/library', 'GET'); }
  function report(targetType, targetId, reason) { return api('/api/report', 'POST', { targetType: targetType, targetId: targetId, reason: reason }); }
  function countView(id) { return api('/api/public/' + id + '/view', 'POST'); }
  function refreshMe() { return api('/api/me', 'GET').then(function (r) { setSession(null, r.user); return r.user; }); }

  window.ftAccount = {
    configured: configured, isSignedIn: isSignedIn, currentUser: currentUser,
    register: register, login: login, logout: logout,
    list: list, create: create, load: load, loadPublic: loadPublic,
    save: save, remove: remove, setVisibility: setVisibility, share: share,
    feed: feed, feedFollowing: feedFollowing, profile: profile, updateProfile: updateProfile,
    changeEmail: changeEmail, changePassword: changePassword, refreshMe: refreshMe,
    like: like, unlike: unlike, favorite: favorite, unfavorite: unfavorite,
    follow: follow, unfollow: unfollow,
    comments: comments, comment: comment, deleteComment: deleteComment,
    notifications: notifications, readNotifications: readNotifications,
    library: library, report: report, countView: countView
  };
})();

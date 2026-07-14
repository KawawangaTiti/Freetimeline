/* FreeTimeline — account UI (Level 2). A floating chip + panel that drives window.ftAccount:
   sign up / sign in, save the current timeline to the cloud, open "My timelines", publish
   (public link) and share with a person. Local-first stays the default; the cloud is opt-in.
   Requires: window.ftAccount (client) and the engine's Store.cloudExport()/cloudOpen(). */
(function () {
  if (!window.ftAccount || !window.ftAccount.configured || !window.ftAccount.configured()) return;
  var A = window.ftAccount;

  function appKey() { try { return (window.Store && Store.cloudExport && Store.cloudExport().app) || 'universe'; } catch (_) { return 'universe'; } }
  function curId() { try { return localStorage.getItem('ft_cloud_' + appKey()) || ''; } catch (_) { return ''; } }
  function setCurId(id) { try { if (id) localStorage.setItem('ft_cloud_' + appKey(), id); else localStorage.removeItem('ft_cloud_' + appKey()); } catch (_) {} }
  function note(m, t) { try { (window.notify || function () {})(m, t || 'success'); } catch (_) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var dark, T;
  function theme() {
    var m = (getComputedStyle(document.body).backgroundColor || '').match(/\d+/g);
    dark = m ? (0.299 * +m[0] + 0.587 * +m[1] + 0.114 * +m[2]) < 128 : true;
    T = dark
      ? { panel: '#141d33', line: '#28365c', ink: '#e7ecf7', sub: '#9fb0cf', field: '#0e1830', chip: '#16223e' }
      : { panel: '#fffdf8', line: '#e6dac6', ink: '#3d2b1f', sub: '#7a6a55', field: '#fff', chip: '#fffdf8' };
  }
  var acc = '#2f7cf6';

  function ensureCss() {
    if (document.getElementById('ftac-css')) return;
    var s = document.createElement('style'); s.id = 'ftac-css';
    s.textContent =
      '.ftac-chip{position:fixed;top:96px;right:14px;z-index:200;display:inline-flex;align-items:center;gap:7px;' +
        'border-radius:999px;padding:7px 13px;cursor:pointer;font:600 12.5px/1 inherit;border:1px solid;box-shadow:0 6px 18px rgba(0,0,0,.22)}' +
      '.ftac-ov{position:fixed;inset:0;z-index:9200;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);padding:16px}' +
      '.ftac-card{width:min(440px,96vw);max-height:88vh;overflow:auto;border-radius:16px;padding:20px 22px;border:1px solid;box-shadow:0 24px 60px rgba(0,0,0,.5)}' +
      '.ftac-card h3{margin:0 0 4px;font-size:17px}.ftac-card .sub{font-size:12.5px;margin:0 0 14px}' +
      '.ftac-row{display:flex;gap:8px;align-items:center}' +
      '.ftac-in{width:100%;padding:10px 12px;border-radius:9px;border:1px solid;font:inherit;font-size:13.5px;margin:6px 0}' +
      '.ftac-btn{border:0;border-radius:9px;padding:10px 14px;cursor:pointer;font:700 13px inherit;background:' + acc + ';color:#fff}' +
      '.ftac-btn.ghost{background:transparent;border:1px solid}' +
      '.ftac-btn.sm{padding:6px 10px;font-size:12px}' +
      '.ftac-btn.danger{background:transparent;border:1px solid #d06666;color:#d06666}' +
      '.ftac-tabs{display:flex;gap:6px;margin-bottom:12px}' +
      '.ftac-tab{flex:1;text-align:center;padding:8px;border-radius:9px;cursor:pointer;font-weight:700;font-size:13px;border:1px solid}' +
      '.ftac-list{display:flex;flex-direction:column;gap:8px;margin-top:6px}' +
      '.ftac-item{border:1px solid;border-radius:11px;padding:11px 12px}' +
      '.ftac-item .t{font-weight:700;font-size:13.5px;display:flex;align-items:center;gap:8px}' +
      '.ftac-vis{font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:999px;border:1px solid;opacity:.85}' +
      '.ftac-item .acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}' +
      '.ftac-err{color:#e06767;font-size:12.5px;margin:4px 0;min-height:16px}' +
      '.ftac-x{float:right;cursor:pointer;opacity:.6;font-size:18px;line-height:1;border:0;background:transparent}';
    document.head.appendChild(s);
  }

  var chip, ov;
  function refreshChip() {
    var u = A.currentUser();
    chip.innerHTML = u ? '☁ ' + esc((u.email || '').split('@')[0]) : '☁ Sign in';
  }

  function openModal(html) {
    close();
    ov = document.createElement('div'); ov.className = 'ftac-ov';
    var card = document.createElement('div'); card.className = 'ftac-card';
    card.style.background = T.panel; card.style.borderColor = T.line; card.style.color = T.ink;
    card.innerHTML = html;
    ov.appendChild(card); document.body.appendChild(ov);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    var x = card.querySelector('.ftac-x'); if (x) x.onclick = close;
    return card;
  }
  function close() { if (ov && ov.parentNode) ov.parentNode.removeChild(ov); ov = null; }

  /* ---- signed-out: login / register ---- */
  function authForm() {
    var card = openModal(
      '<button class="ftac-x">×</button><h3>Your account</h3>' +
      '<p class="sub" style="color:' + T.sub + '">Save timelines to the cloud, publish, and share. Your data stays local by default — this is opt-in.</p>' +
      '<div class="ftac-tabs"><div class="ftac-tab" data-t="login">Sign in</div><div class="ftac-tab" data-t="register">Create account</div></div>' +
      '<div id="ftac-body"></div>');
    var body = card.querySelector('#ftac-body'), mode = 'login';
    function paint() {
      card.querySelectorAll('.ftac-tab').forEach(function (t) {
        var on = t.dataset.t === mode; t.style.background = on ? acc : 'transparent'; t.style.color = on ? '#fff' : T.ink; t.style.borderColor = on ? acc : T.line;
      });
      body.innerHTML =
        (mode === 'register' ? fld('ftac-name', 'text', 'Display name (optional)') : '') +
        fld('ftac-email', 'email', 'Email') + fld('ftac-pw', 'password', 'Password (min 8 chars)') +
        '<div class="ftac-err" id="ftac-err"></div>' +
        '<button class="ftac-btn" id="ftac-go" style="width:100%">' + (mode === 'login' ? 'Sign in' : 'Create account') + '</button>';
      card.querySelector('#ftac-go').onclick = submit;
      body.querySelectorAll('.ftac-in').forEach(function (i) { i.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); }); });
    }
    function submit() {
      var email = (card.querySelector('#ftac-email') || {}).value, pw = (card.querySelector('#ftac-pw') || {}).value;
      var name = (card.querySelector('#ftac-name') || {}).value;
      var errEl = card.querySelector('#ftac-err'), go = card.querySelector('#ftac-go');
      errEl.textContent = '';
      // Client-side guard (backend stays the source of truth): fail fast, no round-trip.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) { errEl.textContent = 'Enter a valid email address.'; return; }
      if ((pw || '').length < 8) { errEl.textContent = 'Password must be at least 8 characters.'; return; }
      go.disabled = true; go.textContent = '…';
      var p = mode === 'login' ? A.login(email, pw) : A.register(email, pw, name);
      p.then(function () { close(); refreshChip(); note('Signed in ✓'); dashboard(); },
        function (e) { errEl.textContent = e.message || 'Failed.'; go.disabled = false; go.textContent = mode === 'login' ? 'Sign in' : 'Create account'; });
    }
    card.querySelectorAll('.ftac-tab').forEach(function (t) { t.onclick = function () { mode = t.dataset.t; paint(); }; });
    paint();
  }
  function fld(id, type, ph) { return '<input class="ftac-in" id="' + id + '" type="' + type + '" placeholder="' + ph + '" style="background:' + T.field + ';border-color:' + T.line + ';color:' + T.ink + '">'; }

  /* ---- signed-in: dashboard ---- */
  function dashboard() {
    var u = A.currentUser(); if (!u) return authForm();
    var card = openModal(
      '<button class="ftac-x">×</button><h3>My timelines</h3>' +
      '<p class="sub" style="color:' + T.sub + '">Signed in as <b>' + esc(u.email) + '</b> · <a href="#" id="ftac-out" style="color:' + acc + '">sign out</a></p>' +
      '<div class="ftac-row"><button class="ftac-btn" id="ftac-save" style="flex:1">☁ Save this timeline to cloud</button></div>' +
      '<div class="ftac-list" id="ftac-list"><p class="sub" style="color:' + T.sub + '">Loading…</p></div>');
    card.querySelector('#ftac-out').onclick = function (e) { e.preventDefault(); A.logout(); refreshChip(); close(); note('Signed out ✓'); };
    card.querySelector('#ftac-save').onclick = saveToCloud;
    loadList(card);
  }

  function saveToCloud() {
    var ex = Store.cloudExport(), id = curId(), btn = ov && ov.querySelector('#ftac-save');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    var p = id ? A.save(id, { data: ex.data, title: ex.title }).then(function () { return { id: id }; })
      : A.create(ex.title, ex.app, ex.data, 'private');
    p.then(function (r) { setCurId(r.id); note('Saved to cloud ✓'); dashboard(); },
      function (e) { note(e.message || 'Save failed', 'error'); if (btn) { btn.disabled = false; btn.textContent = '☁ Save this timeline to cloud'; } });
  }

  function loadList(card) {
    A.list().then(function (r) {
      var host = card.querySelector('#ftac-list'); host.innerHTML = '';
      var mine = r.mine || [], shared = r.sharedWithMe || [];
      if (!mine.length && !shared.length) { host.innerHTML = '<p class="sub" style="color:' + T.sub + '">No cloud timelines yet — hit “Save this timeline to cloud”.</p>'; return; }
      mine.forEach(function (t) { host.appendChild(itemEl(t, true)); });
      if (shared.length) { var h = document.createElement('div'); h.className = 'sub'; h.style.cssText = 'color:' + T.sub + ';margin-top:10px;font-weight:700'; h.textContent = 'Shared with me'; host.appendChild(h); shared.forEach(function (t) { host.appendChild(itemEl(t, false)); }); }
    }, function (e) { card.querySelector('#ftac-list').innerHTML = '<p class="ftac-err">' + esc(e.message || 'Could not load') + '</p>'; });
  }

  function itemEl(t, owned) {
    var el = document.createElement('div'); el.className = 'ftac-item'; el.style.borderColor = T.line;
    var visColor = t.visibility === 'public' ? '#3f9d63' : t.visibility === 'shared' ? '#b7791f' : T.sub;
    el.innerHTML = '<div class="t">' + esc(t.title || 'Untitled') +
      '<span class="ftac-vis" style="border-color:' + visColor + ';color:' + visColor + '">' + esc(t.visibility) + '</span></div>' +
      '<div class="acts"></div>';
    var acts = el.querySelector('.acts');
    acts.appendChild(btn('Open', 'sm', function () { openCloud(t.id); }));
    if (owned) {
      acts.appendChild(btn(t.visibility === 'public' ? 'Unpublish' : 'Publish', 'sm ghost', function () { publish(t.id, t.visibility !== 'public'); }));
      if (t.visibility === 'public') acts.appendChild(btn('Copy link', 'sm ghost', function () { copyPublic(t.id); }));
      acts.appendChild(btn('Share…', 'sm ghost', function () { shareWith(t.id); }));
      acts.appendChild(btn('Delete', 'sm danger', function () { del(t.id); }));
    }
    return el;
  }
  function btn(label, cls, fn) { var b = document.createElement('button'); b.className = 'ftac-btn ' + cls; b.textContent = label; if (b.classList.contains('ghost')) b.style.borderColor = T.line; if (b.classList.contains('ghost')) b.style.color = T.ink; b.onclick = fn; return b; }

  function openCloud(id) {
    A.load(id).then(function (r) { close(); setCurId(id); Store.cloudOpen(r.timeline.data); },
      function (e) { note(e.message || 'Could not open', 'error'); });
  }
  function publish(id, makePublic) {
    A.setVisibility(id, makePublic ? 'public' : 'private').then(function () { note(makePublic ? 'Published — anyone with the link can view ✓' : 'Set to private ✓'); if (makePublic) copyPublic(id); dashboard(); },
      function (e) { note(e.message || 'Failed', 'error'); });
  }
  function publicUrl(id) { return location.origin + location.pathname + '?cloud=' + id; }
  function copyPublic(id) {
    var url = publicUrl(id);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { note('Public link copied ✓'); }, function () { prompt('Public link:', url); });
    else prompt('Public link:', url);
  }
  function shareWith(id) {
    var email = prompt('Share with which email? (they must have an account)'); if (!email) return;
    var edit = confirm('Allow them to EDIT? (OK = edit, Cancel = view only)');
    A.share(id, email, edit ? 'edit' : 'view').then(function () { note('Shared with ' + email + ' ✓'); dashboard(); },
      function (e) { note(e.message || 'Share failed', 'error'); });
  }
  function del(id) {
    if (!confirm('Delete this cloud timeline? This cannot be undone.')) return;
    A.remove(id).then(function () { if (curId() === id) setCurId(''); note('Deleted ✓'); dashboard(); },
      function (e) { note(e.message || 'Delete failed', 'error'); });
  }

  function boot() {
    theme(); ensureCss();
    chip = document.createElement('button'); chip.className = 'ftac-chip';
    chip.style.background = T.chip; chip.style.borderColor = T.line; chip.style.color = T.ink;
    chip.onclick = function () { A.isSignedIn() ? dashboard() : authForm(); };
    document.body.appendChild(chip); refreshChip();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

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
    chip.innerHTML = u ? '☁ ' + esc(u.username ? '@' + u.username : (u.email || '').split('@')[0]) : '☁ Sign in';
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
    var who = u.username ? '@' + esc(u.username) : esc(u.email);
    var card = openModal(
      '<button class="ftac-x">×</button><h3>My timelines</h3>' +
      '<p class="sub" style="color:' + T.sub + '">Signed in as <b>' + who + '</b> · <a href="#" id="ftac-prof" style="color:' + acc + '">profile</a> · <a href="#" id="ftac-out" style="color:' + acc + '">sign out</a></p>' +
      '<div class="ftac-row">' +
        (window.Store && Store.cloudExport ? '<button class="ftac-btn" id="ftac-save" style="flex:1">☁ Save this timeline to cloud</button>' : '') +
        '<button class="ftac-btn ghost" id="ftac-bell" style="flex:1;border-color:' + T.line + ';color:' + T.ink + '">🔔 Notifications<span id="ftac-bell-n"></span></button>' +
      '</div>' +
      '<p class="sub" style="color:' + T.sub + ';margin:10px 0 0">' +
        '<a href="discover.html" style="color:' + acc + '">🧭 Discover public timelines</a>' +
        (u.username ? ' · <a href="profile.html?u=' + encodeURIComponent(u.username) + '" style="color:' + acc + '">my public page</a>' : '') + '</p>' +
      '<div class="ftac-list" id="ftac-list"><p class="sub" style="color:' + T.sub + '">Loading…</p></div>');
    card.querySelector('#ftac-out').onclick = function (e) { e.preventDefault(); A.logout(); refreshChip(); close(); note('Signed out ✓'); };
    card.querySelector('#ftac-prof').onclick = function (e) { e.preventDefault(); profileEditor(); };
    var saveBtn = card.querySelector('#ftac-save'); if (saveBtn) saveBtn.onclick = saveToCloud;
    card.querySelector('#ftac-bell').onclick = notifPanel;
    A.notifications().then(function (r) {
      var n = card.querySelector('#ftac-bell-n');
      if (n && r.unread) { n.textContent = ' ' + r.unread; n.style.fontWeight = '800'; }
    }, function () {});
    loadList(card);
  }

  /* ---- profile editor (username, display name, bio, avatar) ---- */
  function profileEditor() {
    var u = A.currentUser() || {};
    var av = u.avatar || {};
    var card = openModal(
      '<button class="ftac-x">×</button><h3>Your profile</h3>' +
      '<p class="sub" style="color:' + T.sub + '">This is what other people see on your public page and comments.</p>' +
      '<label class="sub" style="color:' + T.sub + '">Username (3-20: a-z, 0-9, _)</label>' + fld('ftp-un', 'text', 'username') +
      '<label class="sub" style="color:' + T.sub + '">Display name</label>' + fld('ftp-dn', 'text', 'Display name') +
      '<label class="sub" style="color:' + T.sub + '">Bio</label>' +
      '<textarea class="ftac-in" id="ftp-bio" rows="3" maxlength="500" placeholder="A line about you" style="background:' + T.field + ';border-color:' + T.line + ';color:' + T.ink + ';resize:vertical"></textarea>' +
      '<div class="ftac-row"><div style="flex:1"><label class="sub" style="color:' + T.sub + '">Avatar emoji</label>' + fld('ftp-em', 'text', '🙂') + '</div>' +
      '<div><label class="sub" style="color:' + T.sub + '">Colour</label><br><input type="color" id="ftp-col" value="#4a8fde" style="width:52px;height:38px;border:1px solid ' + T.line + ';border-radius:9px;background:' + T.field + '"></div></div>' +
      '<div class="ftac-err" id="ftp-err"></div>' +
      '<button class="ftac-btn" id="ftp-save" style="width:100%">Save profile</button>');
    card.querySelector('#ftp-un').value = u.username || '';
    card.querySelector('#ftp-dn').value = u.displayName || '';
    card.querySelector('#ftp-bio').value = u.bio || '';
    card.querySelector('#ftp-em').value = av.emoji || '';
    if (av.color) card.querySelector('#ftp-col').value = av.color;
    card.querySelector('#ftp-save').onclick = function () {
      var b = card.querySelector('#ftp-save'); b.disabled = true; b.textContent = '…';
      A.updateProfile({
        username: card.querySelector('#ftp-un').value.trim(),
        displayName: card.querySelector('#ftp-dn').value.trim(),
        bio: card.querySelector('#ftp-bio').value.trim(),
        avatar: { emoji: card.querySelector('#ftp-em').value.trim(), color: card.querySelector('#ftp-col').value }
      }).then(function () { note('Profile saved ✓'); refreshChip(); dashboard(); },
        function (e) { card.querySelector('#ftp-err').textContent = e.message || 'Failed.'; b.disabled = false; b.textContent = 'Save profile'; });
    };
  }

  /* ---- notifications ---- */
  function notifPanel() {
    var card = openModal('<button class="ftac-x">×</button><h3>Notifications</h3><div class="ftac-list" id="ftn-list"><p class="sub" style="color:' + T.sub + '">Loading…</p></div>');
    A.notifications().then(function (r) {
      var host = card.querySelector('#ftn-list'); host.innerHTML = '';
      if (!(r.items || []).length) { host.innerHTML = '<p class="sub" style="color:' + T.sub + '">Nothing yet — publish a timeline and the likes will come.</p>'; return; }
      r.items.forEach(function (n) {
        var who = n.actor_username ? '@' + n.actor_username : 'Someone';
        var what = n.type === 'like' ? 'liked' : n.type === 'comment' ? 'commented on' : n.type === 'reply' ? 'replied to your comment on' : n.type === 'follow' ? 'followed you' : 'shared';
        var el = document.createElement('div'); el.className = 'ftac-item'; el.style.borderColor = T.line;
        if (!n.read_at) el.style.background = dark ? 'rgba(47,124,246,.08)' : 'rgba(47,124,246,.06)';
        el.innerHTML = '<div class="t" style="font-weight:600">' + esc(who) + ' ' + what +
          (n.timeline_title ? ' “' + esc(n.timeline_title) + '”' : '') + '</div>' +
          '<div class="sub" style="color:' + T.sub + '">' + new Date(n.created_at).toLocaleString() + '</div>';
        if (n.timeline_id) { el.style.cursor = 'pointer'; el.onclick = function () { location.href = 'view.html?id=' + n.timeline_id; }; }
        host.appendChild(el);
      });
      A.readNotifications().then(function () {}, function () {});
    }, function (e) { card.querySelector('#ftn-list').innerHTML = '<p class="ftac-err">' + esc(e.message || 'Could not load') + '</p>'; });
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
    var visColor = t.visibility === 'public' ? '#3f9d63' : t.visibility === 'unlisted' ? '#7c6bd6' : t.visibility === 'shared' ? '#b7791f' : T.sub;
    var listed = t.visibility === 'public' || t.visibility === 'unlisted';
    var stats = listed && (t.like_count || t.view_count || t.comment_count)
      ? '<div class="sub" style="color:' + T.sub + ';margin-top:4px">♥ ' + (t.like_count | 0) + ' · 💬 ' + (t.comment_count | 0) + ' · 👁 ' + (t.view_count | 0) + '</div>' : '';
    el.innerHTML = '<div class="t">' + esc(t.title || 'Untitled') +
      '<span class="ftac-vis" style="border-color:' + visColor + ';color:' + visColor + '">' + esc(t.visibility) + '</span></div>' +
      stats + '<div class="acts"></div>';
    var acts = el.querySelector('.acts');
    acts.appendChild(btn('Open', 'sm', function () { openCloud(t.id); }));
    if (owned) {
      acts.appendChild(btn('Publish…', 'sm ghost', function () { publishModal(t); }));
      if (listed) acts.appendChild(btn('Copy link', 'sm ghost', function () { copyPublic(t.id); }));
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
  /* Publish flow: pick visibility + describe the timeline for the Discover gallery. */
  function publishModal(t) {
    var vis = t.visibility || 'private';
    var card = openModal(
      '<button class="ftac-x">×</button><h3>Publish “' + esc(t.title || 'Untitled') + '”</h3>' +
      '<p class="sub" style="color:' + T.sub + '">Public = listed on Discover. Unlisted = only people with the link. Private = only you.</p>' +
      '<div class="ftac-tabs" id="ftpb-vis">' +
        ['private', 'unlisted', 'public'].map(function (v) { return '<div class="ftac-tab" data-v="' + v + '">' + v + '</div>'; }).join('') + '</div>' +
      '<label class="sub" style="color:' + T.sub + '">Description (shown on Discover)</label>' +
      '<textarea class="ftac-in" id="ftpb-desc" rows="3" maxlength="1000" placeholder="What is this timeline about?" style="background:' + T.field + ';border-color:' + T.line + ';color:' + T.ink + ';resize:vertical"></textarea>' +
      '<label class="sub" style="color:' + T.sub + '">Tags (comma-separated, up to 8)</label>' + fld('ftpb-tags', 'text', 'fantasy, worldbuilding, history') +
      '<div class="ftac-err" id="ftpb-err"></div>' +
      '<button class="ftac-btn" id="ftpb-go" style="width:100%">Save</button>');
    card.querySelector('#ftpb-desc').value = t.description || '';
    card.querySelector('#ftpb-tags').value = (t.tags && t.tags.length) ? t.tags.join(', ') : '';
    function paintVis() {
      card.querySelectorAll('#ftpb-vis .ftac-tab').forEach(function (el) {
        var on = el.dataset.v === vis;
        el.style.background = on ? acc : 'transparent'; el.style.color = on ? '#fff' : T.ink; el.style.borderColor = on ? acc : T.line;
      });
    }
    card.querySelectorAll('#ftpb-vis .ftac-tab').forEach(function (el) { el.onclick = function () { vis = el.dataset.v; paintVis(); }; });
    paintVis();
    card.querySelector('#ftpb-go').onclick = function () {
      var b = card.querySelector('#ftpb-go'); b.disabled = true; b.textContent = '…';
      var tags = card.querySelector('#ftpb-tags').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      A.save(t.id, { visibility: vis, description: card.querySelector('#ftpb-desc').value.trim(), tags: tags })
        .then(function () {
          note(vis === 'public' ? 'Published on Discover ✓' : vis === 'unlisted' ? 'Unlisted — anyone with the link can view ✓' : 'Set to private ✓');
          if (vis !== 'private') copyPublic(t.id);
          dashboard();
        }, function (e) { card.querySelector('#ftpb-err').textContent = e.message || 'Failed.'; b.disabled = false; b.textContent = 'Save'; });
    };
  }
  /* Share target is the detail page (title, author, likes, comments, open-in-app). */
  function publicUrl(id) { return location.origin + location.pathname.replace(/[^/]*$/, '') + 'view.html?id=' + id; }
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
    // refresh the cached user once per load so profile fields (username…) stay current
    if (A.isSignedIn() && A.refreshMe) A.refreshMe().then(refreshChip, function () {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

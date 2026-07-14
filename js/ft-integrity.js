/* =====================================================================
   ft-integrity.js — "Continuity check" integrity verifier
   ---------------------------------------------------------------------
   A read-only data-coherence checker for the FreeTimeline apps
   (Universe + Biography). Reads the app state straight from
   localStorage and flags orphan references, impossible dates and
   missing required fields. It NEVER writes or mutates state.

   Autonomous IIFE: injects its own <style>, waits for DOMContentLoaded,
   and drops a discreet shield button into the page. Everything is
   wrapped in try/catch so a missing/corrupt save degrades to an empty
   "No issues found" state instead of throwing.
   ===================================================================== */
(function () {
  'use strict';

  /* ---- Which app are we in? ------------------------------------- */
  /* Universe state key: inf_universe_v4  |  Biography: inf_biography_v1
     We detect by which key holds data; fall back to the document title
     so the button still renders even before anything is saved. */
  var APPS = {
    universe:  { key: 'inf_universe_v4',  container: 'universes',  containerLabel: 'universe',   entities: 'characters', entityLabel: 'character' },
    biography: { key: 'inf_biography_v1', container: 'lifeTracks', containerLabel: 'life track', entities: 'people',     entityLabel: 'person' }
  };

  function detectApp() {
    try {
      if (localStorage.getItem(APPS.universe.key))  return APPS.universe;
      if (localStorage.getItem(APPS.biography.key)) return APPS.biography;
    } catch (_) {}
    var t = (document.title || '').toLowerCase();
    var p = (location.pathname || '').toLowerCase();
    if (t.indexOf('biograph') !== -1 || p.indexOf('biograph') !== -1) return APPS.biography;
    return APPS.universe;
  }

  /* ---- Date helpers (independent re-implementation) ------------- */
  /* Mirrors the app's parseDate contract: "dd/mm/yyyy", 'x' marks an
     unknown part, unknown YEAR => null (that is legal, not an error).
     dateStatus() additionally tells malformed apart from unknown. */
  function isX(s) { return String(s).toLowerCase().indexOf('x') !== -1; }

  function dateStatus(d) {
    // Returns { present, valid, knownYear, dec }
    if (d === undefined || d === null || String(d).trim() === '') {
      return { present: false, valid: true, knownYear: false, dec: null };
    }
    var p = String(d).split('/');
    if (p.length !== 3) return { present: true, valid: false, knownYear: false, dec: null };

    var dayS = p[0].trim(), moS = p[1].trim(), yrS = p[2].trim();

    // Day 1..31
    if (!isX(dayS)) {
      var day = parseInt(dayS, 10);
      if (isNaN(day) || day < 1 || day > 31) return { present: true, valid: false, knownYear: false, dec: null };
    }
    // Month 1..12
    if (!isX(moS)) {
      var mo = parseInt(moS, 10);
      if (isNaN(mo) || mo < 1 || mo > 12) return { present: true, valid: false, knownYear: false, dec: null };
    }
    // Year
    var knownYear = false, dec = null;
    if (isX(yrS) || yrS === '') {
      knownYear = false;
    } else {
      var yr = parseInt(yrS, 10);
      if (isNaN(yr)) return { present: true, valid: false, knownYear: false, dec: null };
      knownYear = true;
      var moN = isX(moS) ? 6  : Math.min(12, Math.max(1, parseInt(moS, 10) || 6));
      var daN = isX(dayS) ? 15 : Math.min(31, Math.max(1, parseInt(dayS, 10) || 15));
      dec = yr + (moN - 1) / 12 + (daN - 1) / 365;
    }
    return { present: true, valid: true, knownYear: knownYear, dec: dec };
  }

  /* ---- Read state (read-only) ---------------------------------- */
  function readState(app) {
    var raw = null;
    try { raw = localStorage.getItem(app.key); } catch (_) { raw = null; }
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (_) { return null; }
  }

  function asArray(x) { return Array.isArray(x) ? x : []; }

  /* ---- The actual checks --------------------------------------- */
  function runChecks(app) {
    var groups = {
      refs:    { title: 'Broken references', icon: '🔗', items: [] }, // 🔗
      dates:   { title: 'Impossible dates',  icon: '📅', items: [] }, // 📅
      missing: { title: 'Missing fields',    icon: '⚠️', items: [] }  // ⚠️
    };

    var S = readState(app);
    if (!S || typeof S !== 'object') {
      return { groups: groups, total: 0, empty: true };
    }

    var containers = asArray(S[app.container]);
    var entities   = asArray(S[app.entities]);
    var events     = asArray(S.events);
    var connections = asArray(S.connections);
    var categories = (S.categories && typeof S.categories === 'object') ? S.categories : {};

    var containerIds = {};
    containers.forEach(function (c) { if (c && c.id != null) containerIds[c.id] = true; });
    var entityIds = {};
    entities.forEach(function (e) { if (e && e.id != null) entityIds[e.id] = true; });
    var eventIds = {};
    events.forEach(function (e) { if (e && e.id != null) eventIds[e.id] = true; });

    function evLabel(ev, i) {
      var t = ev && ev.title ? String(ev.title) : '';
      if (t) return '"' + t + '"';
      return 'Event #' + (i + 1) + (ev && ev.id != null ? ' (id ' + ev.id + ')' : '');
    }

    /* 1 + 2 + 3 — iterate events */
    events.forEach(function (ev, i) {
      if (!ev || typeof ev !== 'object') return;
      var label = evLabel(ev, i);

      /* --- 3. Missing title --- */
      if (!ev.title || String(ev.title).trim() === '') {
        groups.missing.items.push({
          name: label,
          detail: 'Event has no title.'
        });
      }

      /* --- 1. Orphan container reference --- */
      if (ev.universeId != null && !containerIds[ev.universeId]) {
        groups.refs.items.push({
          name: label,
          detail: 'Points to a ' + app.containerLabel + ' that no longer exists (id ' + ev.universeId + ').'
        });
      }

      /* --- 1. Orphan entity references --- */
      var chIds = asArray(ev.characterIds);
      chIds.forEach(function (cid) {
        if (cid != null && !entityIds[cid]) {
          groups.refs.items.push({
            name: label,
            detail: 'References a ' + app.entityLabel + ' that no longer exists (id ' + cid + ').'
          });
        }
      });

      /* --- 1. Orphan category --- */
      if (ev.category && !Object.prototype.hasOwnProperty.call(categories, ev.category)) {
        groups.refs.items.push({
          name: label,
          detail: 'Uses a category that no longer exists ("' + ev.category + '").'
        });
      }

      /* --- 2. Invalid own date --- */
      var st = dateStatus(ev.date);
      if (st.present && !st.valid) {
        groups.dates.items.push({
          name: label,
          detail: 'Has an invalid date ("' + ev.date + '") — expected dd/mm/yyyy with numbers or "x".'
        });
      }

      /* --- 2. Sub-events: invalid date + ordering --- */
      var subs = asArray(ev.subEvents);
      subs.forEach(function (se, j) {
        if (!se || typeof se !== 'object') return;
        var seLabel = (se.title ? '"' + se.title + '"' : 'Sub-event #' + (j + 1)) + ' (in ' + label + ')';
        var sst = dateStatus(se.date);
        if (sst.present && !sst.valid) {
          groups.dates.items.push({
            name: seLabel,
            detail: 'Sub-event has an invalid date ("' + se.date + '").'
          });
        }
        // Ordering: only when both dates have a known year.
        if (sst.valid && sst.knownYear && st.valid && st.knownYear &&
            sst.dec != null && st.dec != null && sst.dec < st.dec) {
          groups.dates.items.push({
            name: seLabel,
            detail: 'Sub-event is dated before its parent event (' + se.date + ' < ' + ev.date + ').'
          });
        }
      });
    });

    /* --- 3. Containers without a name --- */
    containers.forEach(function (c, i) {
      if (!c || typeof c !== 'object') return;
      if (!c.name || String(c.name).trim() === '') {
        groups.missing.items.push({
          name: (app.containerLabel.charAt(0).toUpperCase() + app.containerLabel.slice(1)) +
                ' #' + (i + 1) + (c.id != null ? ' (id ' + c.id + ')' : ''),
          detail: 'This ' + app.containerLabel + ' has no name.'
        });
      }
    });

    /* --- 1. Connections pointing to missing events --- */
    connections.forEach(function (conn, i) {
      if (!conn || typeof conn !== 'object') return;
      var name = 'Connection #' + (i + 1);
      if (conn.fromEventId != null && !eventIds[conn.fromEventId]) {
        groups.refs.items.push({ name: name, detail: 'Starts at an event that no longer exists (id ' + conn.fromEventId + ').' });
      }
      if (conn.toEventId != null && !eventIds[conn.toEventId]) {
        groups.refs.items.push({ name: name, detail: 'Ends at an event that no longer exists (id ' + conn.toEventId + ').' });
      }
    });

    var total = groups.refs.items.length + groups.dates.items.length + groups.missing.items.length;
    return { groups: groups, total: total, empty: false };
  }

  /* ---- Styles --------------------------------------------------- */
  function injectStyle() {
    if (document.getElementById('ft-integrity-style')) return;
    var css =
      '#ft-integrity-btn{position:fixed;left:12px;bottom:104px;z-index:9998;' +
      'display:inline-flex;align-items:center;gap:6px;padding:7px 11px;' +
      'font:600 13px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;' +
      'color:var(--v-ink,#e8e8ef);background:var(--v-panel,#1c1c24);' +
      'border:1px solid rgba(128,128,140,.4);border-radius:8px;cursor:pointer;' +
      'box-shadow:0 2px 8px rgba(0,0,0,.25);opacity:.82;transition:opacity .15s}' +
      '#ft-integrity-btn:hover{opacity:1}' +
      '#ft-integrity-btn:focus-visible{outline:2px solid #6ea8ff;outline-offset:2px}' +
      '#ft-integrity-btn .ftic-count{min-width:16px;height:16px;padding:0 4px;border-radius:8px;' +
      'font-size:11px;display:inline-flex;align-items:center;justify-content:center;' +
      'background:#c0392b;color:#fff}' +
      '#ft-integrity-btn .ftic-count.ok{background:#2e8b57}' +
      '#ft-integrity-overlay{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.5);' +
      'display:flex;align-items:center;justify-content:center;padding:16px}' +
      '#ft-integrity-panel{width:min(560px,100%);max-height:82vh;overflow:auto;' +
      'background:var(--v-panel,#1c1c24);color:var(--v-ink,#e8e8ef);' +
      'border:1px solid rgba(128,128,140,.4);border-radius:12px;' +
      'box-shadow:0 12px 40px rgba(0,0,0,.5);' +
      'font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}' +
      '#ft-integrity-panel .ftic-head{display:flex;align-items:center;justify-content:space-between;' +
      'gap:12px;padding:14px 16px;border-bottom:1px solid rgba(128,128,140,.25);' +
      'position:sticky;top:0;background:var(--v-panel,#1c1c24)}' +
      '#ft-integrity-panel .ftic-head h2{margin:0;font-size:15px;font-weight:700;display:flex;align-items:center;gap:8px}' +
      '#ft-integrity-panel .ftic-close{background:none;border:none;color:inherit;font-size:20px;' +
      'line-height:1;cursor:pointer;padding:4px 8px;border-radius:6px;opacity:.7}' +
      '#ft-integrity-panel .ftic-close:hover{opacity:1;background:rgba(128,128,140,.15)}' +
      '#ft-integrity-panel .ftic-close:focus-visible{outline:2px solid #6ea8ff;outline-offset:2px}' +
      '#ft-integrity-panel .ftic-body{padding:8px 16px 18px}' +
      '#ft-integrity-panel .ftic-empty{padding:28px 8px;text-align:center;font-size:15px;color:#2e8b57;font-weight:600}' +
      '#ft-integrity-panel .ftic-group{margin-top:14px}' +
      '#ft-integrity-panel .ftic-group h3{margin:0 0 6px;font-size:13px;font-weight:700;' +
      'text-transform:uppercase;letter-spacing:.04em;opacity:.85;display:flex;align-items:center;gap:7px}' +
      '#ft-integrity-panel .ftic-group h3 .n{opacity:.6;font-weight:600}' +
      '#ft-integrity-panel ul{list-style:none;margin:0;padding:0}' +
      '#ft-integrity-panel li{padding:8px 10px;margin:5px 0;border-radius:8px;' +
      'background:rgba(128,128,140,.10);border:1px solid rgba(128,128,140,.18)}' +
      '#ft-integrity-panel li .nm{font-weight:600;display:block;margin-bottom:2px}' +
      '#ft-integrity-panel li .dt{opacity:.82;font-size:13px}' +
      '#ft-integrity-panel .ftic-foot{padding:2px 16px 14px;font-size:12px;opacity:.6}';
    var st = document.createElement('style');
    st.id = 'ft-integrity-style';
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }

  /* ---- Rendering ------------------------------------------------ */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  var lastFocused = null;

  function closePanel() {
    var ov = document.getElementById('ft-integrity-overlay');
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    document.removeEventListener('keydown', onKeydown, true);
    if (lastFocused && typeof lastFocused.focus === 'function') {
      try { lastFocused.focus(); } catch (_) {}
    }
  }

  function onKeydown(e) {
    if (e.key === 'Escape') { e.preventDefault(); closePanel(); return; }
    if (e.key === 'Tab') {
      // Simple focus trap within the panel.
      var panel = document.getElementById('ft-integrity-panel');
      if (!panel) return;
      var focusables = panel.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])');
      if (!focusables.length) return;
      var first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  function openPanel() {
    var app = detectApp();
    var result;
    try { result = runChecks(app); }
    catch (_) { result = { groups: {}, total: 0, empty: true }; }

    lastFocused = document.activeElement;

    var overlay = document.createElement('div');
    overlay.id = 'ft-integrity-overlay';
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) closePanel(); });

    var panel = document.createElement('div');
    panel.id = 'ft-integrity-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'ftic-title');

    var html = '';
    html += '<div class="ftic-head">';
    html += '<h2 id="ftic-title">🛡️ Continuity check</h2>';
    html += '<button type="button" class="ftic-close" aria-label="Close continuity check">×</button>';
    html += '</div>';
    html += '<div class="ftic-body">';

    if (result.total === 0) {
      html += '<div class="ftic-empty">No issues found ✓</div>';
    } else {
      html += '<p style="margin:8px 0 4px;opacity:.85">Found <strong>' + result.total + '</strong> issue' +
              (result.total === 1 ? '' : 's') + '. This is read-only — nothing was changed.</p>';
      ['refs', 'dates', 'missing'].forEach(function (gk) {
        var g = result.groups[gk];
        if (!g || !g.items.length) return;
        html += '<div class="ftic-group"><h3>' + g.icon + ' ' + esc(g.title) +
                ' <span class="n">(' + g.items.length + ')</span></h3><ul>';
        g.items.forEach(function (it) {
          html += '<li><span class="nm">' + esc(it.name) + '</span>' +
                  '<span class="dt">' + esc(it.detail) + '</span></li>';
        });
        html += '</ul></div>';
      });
    }
    html += '</div>';
    html += '<div class="ftic-foot">Checks references, dates and required fields. Read-only.</div>';

    panel.innerHTML = html;
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    var closeBtn = panel.querySelector('.ftic-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', closePanel);
      try { closeBtn.focus(); } catch (_) {}
    }
    document.addEventListener('keydown', onKeydown, true);

    // Refresh the button badge to match the fresh read.
    updateBadge(result.total);
  }

  /* ---- Button --------------------------------------------------- */
  function updateBadge(total) {
    var btn = document.getElementById('ft-integrity-btn');
    if (!btn) return;
    var span = btn.querySelector('.ftic-count');
    if (!span) return;
    if (total > 0) {
      span.textContent = String(total);
      span.classList.remove('ok');
      btn.setAttribute('aria-label', 'Continuity check — ' + total + ' issue' + (total === 1 ? '' : 's') + ' found');
    } else {
      span.textContent = '✓';
      span.classList.add('ok');
      btn.setAttribute('aria-label', 'Continuity check — no issues found');
    }
  }

  function initialCount() {
    try { return runChecks(detectApp()).total; } catch (_) { return 0; }
  }

  function mountButton() {
    if (document.getElementById('ft-integrity-btn')) return;
    var btn = document.createElement('button');
    btn.id = 'ft-integrity-btn';
    btn.type = 'button';
    btn.innerHTML = '🛡️ <span>Check</span> <span class="ftic-count" aria-hidden="true">✓</span>';
    btn.addEventListener('click', openPanel);
    document.body.appendChild(btn);
    updateBadge(initialCount());
  }

  /* ---- Boot ----------------------------------------------------- */
  function boot() {
    try {
      injectStyle();
      mountButton();
    } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

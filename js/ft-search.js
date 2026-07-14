/* ============================================================================
 * ft-search.js — Global full-text search for FreeTimeline (Universe & Biography)
 * ----------------------------------------------------------------------------
 * Autonomous, dependency-free module. Drop-in via a single <script> tag.
 *   - Press "/" (when not typing in a field) to open an instant search overlay.
 *   - Or click the small floating magnifier button (bottom-left, above the
 *     existing ⚙ / Print / 🛡️ buttons).
 *   - Search runs offline over the localStorage save; strictly READ-ONLY.
 *   - Results are grouped by type, matches are highlighted, arrow keys + Enter
 *     navigate, Escape closes.
 *   - "Jump" opens the built-in List view and scrolls/highlights the matching
 *     row (best-effort; degrades gracefully to just opening the List view).
 *
 * The module never mutates app state and never calls private app internals it
 * cannot see — it only reads localStorage and pokes public, discoverable DOM
 * (the #tab-list / ftListView List view and the #ft-list-view rows).
 * ==========================================================================*/
(function () {
  'use strict';

  // Guard against double-injection.
  if (window.__ftSearchInit) return;
  window.__ftSearchInit = true;

  /* ---------------------------------------------------------------------- *
   * App detection — decide by PAGE, never by which localStorage key exists
   * (a user may have both apps saved in the same browser).
   * ---------------------------------------------------------------------- */
  function detectApp() {
    var hay = ((location.pathname || '') + ' ' + (document.title || '')).toLowerCase();
    return /biograph/.test(hay) ? 'biography' : 'universe';
  }

  var APP = detectApp();

  var CONFIG = APP === 'biography'
    ? {
        key: 'inf_biography_v1',
        tracksKey: 'lifeTracks',
        peopleKey: 'people',
        tracksLabel: 'Life Tracks',
        peopleLabel: 'People'
      }
    : {
        key: 'inf_universe_v4',
        tracksKey: 'universes',
        peopleKey: 'characters',
        tracksLabel: 'Universes',
        peopleLabel: 'Characters'
      };

  /* ---------------------------------------------------------------------- *
   * Data access — always fresh from localStorage, fully guarded.
   * ---------------------------------------------------------------------- */
  function loadState() {
    try {
      var raw = localStorage.getItem(CONFIG.key);
      if (!raw) return null;
      var d = JSON.parse(raw);
      return (d && typeof d === 'object') ? d : null;
    } catch (_) {
      return null;
    }
  }

  function asArray(v) { return Array.isArray(v) ? v : []; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // Collect searchable strings from an event, including nested sub-events.
  function eventText(ev) {
    var parts = [];
    function push(v) { if (v != null && v !== '') parts.push(String(v)); }
    push(ev.title); push(ev.name); push(ev.description);
    push(ev.notes); push(ev.date);
    var subs = asArray(ev.subEvents);
    for (var i = 0; i < subs.length; i++) {
      var s = subs[i] || {};
      push(s.title); push(s.name); push(s.description); push(s.notes); push(s.date);
    }
    return parts;
  }

  function eventDate(ev) {
    if (ev.date != null && ev.date !== '') return String(ev.date);
    if (ev.year != null && ev.year !== '') return String(ev.year);
    return '';
  }

  // Build a flat list of searchable records from the current state.
  function buildRecords() {
    var st = loadState();
    if (!st) return null; // signal "no data"
    var recs = [];

    asArray(st.events).forEach(function (ev) {
      if (!ev) return;
      recs.push({
        type: 'event',
        typeLabel: 'Events',
        title: ev.title || ev.name || '(untitled event)',
        date: eventDate(ev),
        fields: eventText(ev)
      });
    });

    asArray(st[CONFIG.peopleKey]).forEach(function (p) {
      if (!p) return;
      var f = [];
      if (p.name) f.push(String(p.name));
      if (p.description) f.push(String(p.description));
      if (p.aliases) f.push(String(p.aliases));
      if (p.notes) f.push(String(p.notes));
      recs.push({
        type: 'person',
        typeLabel: CONFIG.peopleLabel,
        title: p.name || '(unnamed)',
        date: '',
        fields: f
      });
    });

    asArray(st[CONFIG.tracksKey]).forEach(function (u) {
      if (!u) return;
      var f = [];
      if (u.name) f.push(String(u.name));
      if (u.description) f.push(String(u.description));
      recs.push({
        type: 'track',
        typeLabel: CONFIG.tracksLabel,
        title: u.name || '(unnamed)',
        date: '',
        fields: f
      });
    });

    // Optional: places, if the save carries them.
    asArray(st.places).forEach(function (pl) {
      if (!pl) return;
      var f = [];
      if (pl.name) f.push(String(pl.name));
      if (pl.description) f.push(String(pl.description));
      if (pl.notes) f.push(String(pl.notes));
      recs.push({
        type: 'place',
        typeLabel: 'Places',
        title: pl.name || '(unnamed place)',
        date: '',
        fields: f
      });
    });

    return recs;
  }

  /* ---------------------------------------------------------------------- *
   * Matching + snippet building.
   * ---------------------------------------------------------------------- */
  var TYPE_ORDER = ['event', 'person', 'track', 'place'];

  function highlight(text, q) {
    if (!q) return esc(text);
    // Escape the text first, then match the (escaped) query against it so any
    // HTML entities produced by escaping line up with the search term.
    return esc(text).replace(new RegExp(escRe(esc(q)), 'ig'), function (m) {
      return '<mark class="fts-mark">' + m + '</mark>';
    });
  }

  // Return {snippet} HTML for the first field that matches, windowed around it.
  function snippetFor(fields, q, title) {
    var lq = q.toLowerCase();
    for (var i = 0; i < fields.length; i++) {
      var val = fields[i];
      var idx = val.toLowerCase().indexOf(lq);
      if (idx === -1) continue;
      // Skip if this field IS the title (title shown separately) unless it's
      // the only match — handled by caller checking title first.
      var start = Math.max(0, idx - 40);
      var end = Math.min(val.length, idx + q.length + 60);
      var frag = (start > 0 ? '…' : '') + val.slice(start, end) + (end < val.length ? '…' : '');
      // Don't repeat the title verbatim as a snippet.
      if (title && frag.replace(/^…|…$/g, '').trim() === String(title).trim()) continue;
      return highlight(frag, q);
    }
    return '';
  }

  function search(records, q) {
    q = (q || '').trim();
    if (!q) return [];
    var lq = q.toLowerCase();
    var hits = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      var matched = false;
      for (var j = 0; j < r.fields.length; j++) {
        if (r.fields[j].toLowerCase().indexOf(lq) !== -1) { matched = true; break; }
      }
      if (!matched) continue;
      hits.push({
        rec: r,
        titleHtml: highlight(r.title, q),
        snippetHtml: snippetFor(r.fields, q, r.title)
      });
    }
    // Stable sort by type order.
    hits.sort(function (a, b) {
      return TYPE_ORDER.indexOf(a.rec.type) - TYPE_ORDER.indexOf(b.rec.type);
    });
    return hits;
  }

  /* ---------------------------------------------------------------------- *
   * "Jump" — open the List view and highlight the matching row.
   * Best-effort, read-only. Never throws to the caller.
   * ---------------------------------------------------------------------- */
  function openListView() {
    try {
      if (window.ftListView && typeof window.ftListView.open === 'function') {
        window.ftListView.open();
        return true;
      }
    } catch (_) {}
    // Fallback: click the List tab (by id, then by textContent).
    try {
      var tab = document.getElementById('tab-list');
      if (!tab) {
        var tabs = document.querySelectorAll('.view-tab');
        for (var i = 0; i < tabs.length; i++) {
          if ((tabs[i].textContent || '').trim().toLowerCase() === 'list') { tab = tabs[i]; break; }
        }
      }
      if (tab) {
        // Only click to OPEN — avoid toggling an already-open view shut.
        var lv = document.getElementById('ft-list-view');
        if (!lv || !lv.classList.contains('open')) tab.click();
        return true;
      }
    } catch (_) {}
    return false;
  }

  function highlightRow(title) {
    var lv = document.getElementById('ft-list-view');
    if (!lv) return false;
    var titles = lv.querySelectorAll('.ft-list-title');
    var want = String(title).trim().toLowerCase();
    var target = null;
    for (var i = 0; i < titles.length; i++) {
      if ((titles[i].textContent || '').trim().toLowerCase() === want) { target = titles[i]; break; }
    }
    if (!target) { // loose contains match as a second pass
      for (var k = 0; k < titles.length; k++) {
        if ((titles[k].textContent || '').trim().toLowerCase().indexOf(want) !== -1) { target = titles[k]; break; }
      }
    }
    if (!target) return false;
    var row = target.closest ? (target.closest('li') || target) : target;
    try { row.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) { try { row.scrollIntoView(); } catch (__) {} }
    row.classList.add('fts-hit-row');
    setTimeout(function () { try { row.classList.remove('fts-hit-row'); } catch (_) {} }, 2600);
    return true;
  }

  function jumpTo(rec) {
    closeOverlay();
    var opened = openListView();
    if (!opened) return; // graceful: nothing else we can safely do
    // Give the List view a tick to render, then try to locate the row.
    var tries = 0;
    (function attempt() {
      tries++;
      if (highlightRow(rec.title)) return;
      if (tries < 12) setTimeout(attempt, 90); // ~1s of retries while it renders
    })();
  }

  /* ---------------------------------------------------------------------- *
   * Styles — injected once.
   * ---------------------------------------------------------------------- */
  function injectStyles() {
    if (document.getElementById('fts-styles')) return;
    var css = [
      '.fts-fab{position:fixed;left:12px;bottom:150px;z-index:99998;width:40px;height:40px;',
      'border-radius:50%;border:1px solid var(--v-bd,rgba(255,255,255,.18));',
      'background:var(--v-panel,#1b1e30);color:var(--v-ink,#e4e8f5);font-size:17px;line-height:1;',
      'cursor:pointer;opacity:.72;box-shadow:0 2px 10px rgba(0,0,0,.35);transition:opacity .15s,transform .15s;}',
      '.fts-fab:hover{opacity:1;transform:translateY(-1px);}',
      '.fts-fab:focus-visible{outline:2px solid #4a8fde;outline-offset:2px;opacity:1;}',
      '.fts-overlay{position:fixed;inset:0;z-index:99999;display:none;background:rgba(4,6,16,.62);',
      'backdrop-filter:blur(2px);padding:8vh 16px 16px;box-sizing:border-box;}',
      '.fts-overlay.open{display:block;}',
      '.fts-panel{max-width:680px;margin:0 auto;background:var(--v-panel,#14162a);',
      'color:var(--v-ink,#e4e8f5);border:1px solid var(--v-bd,rgba(255,255,255,.14));',
      'border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.55);overflow:hidden;',
      'display:flex;flex-direction:column;max-height:84vh;}',
      '.fts-inputwrap{display:flex;align-items:center;gap:10px;padding:14px 16px;',
      'border-bottom:1px solid var(--v-bd,rgba(255,255,255,.1));}',
      '.fts-inputwrap .fts-ic{font-size:17px;opacity:.7;}',
      '.fts-input{flex:1;background:transparent;border:0;outline:0;color:var(--v-ink,#e4e8f5);',
      'font-size:1.05rem;font-family:inherit;padding:4px 0;}',
      '.fts-input::placeholder{color:var(--v-ink,#e4e8f5);opacity:.45;}',
      '.fts-hint{font-size:.72rem;opacity:.5;white-space:nowrap;}',
      '.fts-results{overflow-y:auto;padding:6px 0 8px;}',
      '.fts-group{padding:10px 16px 2px;font-size:.7rem;letter-spacing:.08em;text-transform:uppercase;',
      'opacity:.55;font-weight:700;}',
      '.fts-item{padding:9px 16px;cursor:pointer;border-left:3px solid transparent;}',
      '.fts-item:hover{background:rgba(255,255,255,.05);}',
      '.fts-item.sel{background:rgba(74,143,222,.16);border-left-color:#4a8fde;}',
      '.fts-item-title{font-weight:600;font-size:.98rem;}',
      '.fts-item-meta{font-size:.78rem;opacity:.6;margin-left:8px;font-variant-numeric:tabular-nums;}',
      '.fts-item-snip{font-size:.82rem;opacity:.72;margin-top:2px;line-height:1.35;}',
      '.fts-mark{background:rgba(255,214,102,.32);color:inherit;border-radius:2px;padding:0 1px;}',
      '.fts-empty{padding:26px 16px;text-align:center;opacity:.6;font-size:.92rem;}',
      '.fts-hit-row{animation:ftsFlash 2.4s ease-out;border-radius:6px;}',
      '@keyframes ftsFlash{0%,40%{background:rgba(255,214,102,.28);}100%{background:transparent;}}',
      '@media (max-width:520px){.fts-fab{bottom:150px;}.fts-overlay{padding:5vh 8px 8px;}}'
    ].join('');
    var style = document.createElement('style');
    style.id = 'fts-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ---------------------------------------------------------------------- *
   * Overlay UI.
   * ---------------------------------------------------------------------- */
  var overlay, panel, input, resultsEl, records = null;
  var flatItems = [];   // [{el, rec}] in DOM order for keyboard nav
  var selIndex = -1;
  var lastFocused = null;
  var debounceTimer = null;

  function buildOverlay() {
    overlay = document.createElement('div');
    overlay.className = 'fts-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Search your timeline');

    panel = document.createElement('div');
    panel.className = 'fts-panel';

    var iw = document.createElement('div');
    iw.className = 'fts-inputwrap';
    iw.innerHTML = '<span class="fts-ic" aria-hidden="true">🔍</span>';

    input = document.createElement('input');
    input.className = 'fts-input';
    input.type = 'text';
    input.setAttribute('placeholder', 'Search events, ' + CONFIG.peopleLabel.toLowerCase() + ', ' + CONFIG.tracksLabel.toLowerCase() + '…');
    input.setAttribute('aria-label', 'Search query');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');

    var hint = document.createElement('span');
    hint.className = 'fts-hint';
    hint.textContent = '↑↓ Enter · Esc';

    iw.appendChild(input);
    iw.appendChild(hint);

    resultsEl = document.createElement('div');
    resultsEl.className = 'fts-results';
    resultsEl.setAttribute('role', 'listbox');
    resultsEl.setAttribute('aria-label', 'Search results');

    panel.appendChild(iw);
    panel.appendChild(resultsEl);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    // Interactions
    input.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(runQuery, 120);
    });
    input.addEventListener('keydown', onInputKey);
    overlay.addEventListener('mousedown', function (e) {
      if (e.target === overlay) closeOverlay(); // click on backdrop closes
    });
  }

  function renderResults(q) {
    resultsEl.innerHTML = '';
    flatItems = [];
    selIndex = -1;

    if (records === null) {
      resultsEl.innerHTML = '<div class="fts-empty">No data yet — nothing saved in this browser to search.</div>';
      return;
    }
    if (!q) {
      resultsEl.innerHTML = '<div class="fts-empty">Type to search across every event, ' +
        esc(CONFIG.peopleLabel.toLowerCase()) + ' and ' + esc(CONFIG.tracksLabel.toLowerCase()) + '.</div>';
      return;
    }

    var hits = search(records, q);
    if (!hits.length) {
      resultsEl.innerHTML = '<div class="fts-empty">No matches for “' + esc(q) + '”.</div>';
      return;
    }

    var lastType = null;
    hits.forEach(function (h) {
      if (h.rec.type !== lastType) {
        lastType = h.rec.type;
        var g = document.createElement('div');
        g.className = 'fts-group';
        g.textContent = h.rec.typeLabel;
        resultsEl.appendChild(g);
      }
      var item = document.createElement('div');
      item.className = 'fts-item';
      item.setAttribute('role', 'option');
      var meta = h.rec.date ? '<span class="fts-item-meta">' + esc(h.rec.date) + '</span>' : '';
      item.innerHTML =
        '<div class="fts-item-title">' + h.titleHtml + meta + '</div>' +
        (h.snippetHtml ? '<div class="fts-item-snip">' + h.snippetHtml + '</div>' : '');
      var recRef = h.rec;
      item.addEventListener('click', function () { jumpTo(recRef); });
      item.addEventListener('mousemove', function () { setSel(flatItems.indexOf(pair)); });
      resultsEl.appendChild(item);
      var pair = { el: item, rec: recRef };
      flatItems.push(pair);
    });

    if (flatItems.length) setSel(0);
  }

  function setSel(i) {
    if (i < 0 || i >= flatItems.length) return;
    if (selIndex >= 0 && flatItems[selIndex]) {
      flatItems[selIndex].el.classList.remove('sel');
      flatItems[selIndex].el.setAttribute('aria-selected', 'false');
    }
    selIndex = i;
    var it = flatItems[selIndex].el;
    it.classList.add('sel');
    it.setAttribute('aria-selected', 'true');
    try { it.scrollIntoView({ block: 'nearest' }); } catch (_) {}
  }

  function runQuery() {
    renderResults(input.value || '');
  }

  function onInputKey(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (flatItems.length) setSel(selIndex < flatItems.length - 1 ? selIndex + 1 : 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (flatItems.length) setSel(selIndex > 0 ? selIndex - 1 : flatItems.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selIndex >= 0 && flatItems[selIndex]) jumpTo(flatItems[selIndex].rec);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeOverlay();
    }
  }

  function openOverlay() {
    if (!overlay) buildOverlay();
    lastFocused = document.activeElement;
    records = buildRecords();      // rebuild index fresh each open
    overlay.classList.add('open');
    input.value = '';
    renderResults('');
    // focus after paint so the browser doesn't scroll oddly
    setTimeout(function () { try { input.focus(); } catch (_) {} }, 0);
  }

  function closeOverlay() {
    if (!overlay || !overlay.classList.contains('open')) return;
    overlay.classList.remove('open');
    clearTimeout(debounceTimer);
    if (lastFocused && lastFocused.focus && document.contains(lastFocused)) {
      try { lastFocused.focus(); } catch (_) {}
    }
  }

  function isTypingTarget(el) {
    if (!el) return false;
    var tag = (el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (el.isContentEditable) return true;
    return false;
  }

  /* ---------------------------------------------------------------------- *
   * Global wiring.
   * ---------------------------------------------------------------------- */
  function init() {
    try {
      injectStyles();

      // Floating button
      var fab = document.createElement('button');
      fab.type = 'button';
      fab.className = 'fts-fab';
      fab.title = 'Search (press /)';
      fab.setAttribute('aria-label', 'Open search');
      fab.innerHTML = '🔍';
      fab.addEventListener('click', openOverlay);
      document.body.appendChild(fab);

      // "/" shortcut
      document.addEventListener('keydown', function (e) {
        if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          if (isTypingTarget(e.target || document.activeElement)) return;
          if (overlay && overlay.classList.contains('open')) return;
          e.preventDefault();
          openOverlay();
        }
      });
    } catch (err) {
      // Never break the host app.
      try { console && console.warn && console.warn('[ft-search] init failed', err); } catch (_) {}
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/* =====================================================================
 * ft-print.js — Print / Export-to-PDF for the FreeTimeline apps
 * ---------------------------------------------------------------------
 * Self-contained module (IIFE). Works on both universe.html and
 * biography.html. It:
 *
 *   1. Injects an @media print stylesheet that strips all chrome
 *      (toolbar, filter bar, minimap, zoom, HUD, ads, consent/onboarding
 *      banners, modals, toasts, scrollbars, and this module's own button)
 *      and produces a clean, ink-friendly page — white background, dark
 *      text, sensible @page margins.
 *
 *   2. Prioritises the apps' accessible "List view" (#ft-list-view) for
 *      printing when it is available, because the on-screen canvas is a
 *      dark bitmap that reflows poorly. A canvas fallback is styled too,
 *      so printing still works if the list view is absent.
 *
 *   3. Adds a discreet floating "Print / PDF" button that opens the list
 *      view (if present) and calls window.print(). A one-time, dismissable
 *      tip nudges the user to pick "Save as PDF" as the destination.
 *
 * No dependency on app internals beyond the optional window.ftListView
 * helper, which is feature-detected. Everything degrades gracefully.
 * =================================================================== */
(function () {
  'use strict';

  if (window.__ftPrintInit) return;
  window.__ftPrintInit = true;

  var STYLE_ID = 'ft-print-style';
  var BTN_ID = 'ftp-print-btn';
  var MENU_ID = 'ftp-menu';
  var TIP_ID = 'ftp-tip';
  var TIP_SEEN_KEY = 'ftp_tip_seen';

  /* Tracks whether *we* opened the list view for a print run, so we can
   * put it back the way we found it once printing finishes. */
  var openedListByUs = false;

  /* ---------------------------------------------------------------
   * 1. PRINT STYLESHEET
   * ------------------------------------------------------------- */
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      '@media screen {',
      /* Floating trigger button (screen only) */
      '  #' + BTN_ID + '{',
      '    position:fixed; left:12px; bottom:58px; z-index:320;',
      '    display:inline-flex; align-items:center; gap:7px;',
      '    padding:8px 14px; min-height:38px;',
      '    border-radius:10px; cursor:pointer;',
      "    font:600 13px/1 -apple-system,'Segoe UI',system-ui,Arial,sans-serif;",
      '    color:var(--v-ink,#e4e8f5);',
      '    background:var(--v-panel,rgba(26,29,47,0.92));',
      '    border:1px solid var(--v-bd,rgba(140,160,220,0.28));',
      '    box-shadow:0 4px 16px rgba(0,0,0,0.4);',
      '    -webkit-backdrop-filter:blur(8px); backdrop-filter:blur(8px);',
      '    transition:transform .12s ease, background .15s ease, box-shadow .15s ease;',
      '  }',
      '  #' + BTN_ID + ':hover{',
      '    background:var(--v-panel-2,rgba(48,54,92,0.95));',
      '    transform:translateY(-1px);',
      '    box-shadow:0 6px 20px rgba(0,0,0,0.5);',
      '  }',
      '  #' + BTN_ID + ':active{ transform:translateY(0); }',
      '  #' + BTN_ID + ':focus-visible{',
      '    outline:3px solid var(--v-accent,#8fd3ff); outline-offset:3px;',
      '  }',
      '  #' + BTN_ID + ' .ftp-ico{ font-size:15px; line-height:1; }',
      '  @media (max-width:560px){',
      '    #' + BTN_ID + ' .ftp-label{',
      '      position:absolute; width:1px; height:1px; padding:0; margin:-1px;',
      '      overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0;',
      '    }',
      '    #' + BTN_ID + '{ padding:9px; }',
      '  }',
      '  #' + BTN_ID + ' .ftp-caret{ font-size:11px; line-height:1; opacity:.85; }',
      /* Export dropdown menu (opens above the button) */
      '  #' + MENU_ID + '{',
      '    position:fixed; z-index:322; min-width:194px; padding:6px;',
      '    border-radius:12px;',
      '    background:var(--v-panel,#1c1f38);',
      '    border:1px solid var(--v-bd,rgba(140,160,220,0.3));',
      '    box-shadow:0 12px 34px rgba(0,0,0,0.5);',
      '    -webkit-backdrop-filter:blur(8px); backdrop-filter:blur(8px);',
      '    display:flex; flex-direction:column; gap:4px;',
      '  }',
      '  #' + MENU_ID + '[hidden]{ display:none; }',
      '  #' + MENU_ID + ' .ftp-mi{',
      '    display:flex; align-items:center; gap:9px;',
      '    width:100%; text-align:left; padding:9px 12px; min-height:38px;',
      '    border-radius:8px; cursor:pointer; border:1px solid transparent;',
      '    background:transparent; color:var(--v-ink,#e4e8f5);',
      "    font:600 13px/1.1 -apple-system,'Segoe UI',system-ui,Arial,sans-serif;",
      '  }',
      '  #' + MENU_ID + ' .ftp-mi:hover, #' + MENU_ID + ' .ftp-mi:focus{',
      '    background:var(--v-panel-2,rgba(48,54,92,0.95));',
      '  }',
      '  #' + MENU_ID + ' .ftp-mi:focus-visible{ outline:3px solid var(--v-accent,#8fd3ff); outline-offset:2px; }',
      '  #' + MENU_ID + ' .ftp-mi-ico{ font-size:15px; line-height:1; width:18px; text-align:center; }',
      /* One-time tip popover */
      '  #' + TIP_ID + '{',
      '    position:fixed; left:12px; bottom:104px; z-index:321;',
      '    width:264px; max-width:calc(100vw - 24px);',
      '    padding:14px 16px 13px; border-radius:12px;',
      '    color:var(--v-ink,#e4e8f5);',
      '    background:var(--v-panel,#1c1f38);',
      '    border:1px solid var(--v-bd,rgba(140,160,220,0.3));',
      '    box-shadow:0 12px 34px rgba(0,0,0,0.5);',
      "    font:13px/1.55 -apple-system,'Segoe UI',system-ui,Arial,sans-serif;",
      '  }',
      '  #' + TIP_ID + '[hidden]{ display:none; }',
      '  #' + TIP_ID + ' .ftp-tip-title{ font-weight:800; margin:0 0 6px; font-size:13px; }',
      '  #' + TIP_ID + ' p{ margin:0 0 12px; color:var(--v-ink-dim,#aab3cc); }',
      '  #' + TIP_ID + ' .ftp-tip-btns{ display:flex; gap:8px; justify-content:flex-end; }',
      '  #' + TIP_ID + ' button{',
      "    font:700 12px/1 inherit; padding:8px 13px; min-height:34px;",
      '    border-radius:8px; cursor:pointer; border:1px solid transparent;',
      '  }',
      '  #' + TIP_ID + ' .ftp-tip-go{',
      '    color:#fff;',
      '    background:linear-gradient(135deg,var(--v-accent,#3d82ff),var(--v-accent-2,#6aa6ff));',
      '  }',
      '  #' + TIP_ID + ' .ftp-tip-cancel{',
      '    color:var(--v-ink,#e4e8f5); background:transparent;',
      '    border-color:var(--v-bd,rgba(140,160,220,0.3));',
      '  }',
      '  #' + TIP_ID + ' button:focus-visible{ outline:3px solid var(--v-accent,#8fd3ff); outline-offset:2px; }',
      '}',

      /* ============================ PRINT ============================ */
      '@media print {',
      '  @page { margin:16mm; }',
      '  html, body {',
      '    background:#fff !important; color:#111 !important;',
      '    height:auto !important; min-height:0 !important;',
      '    overflow:visible !important;',
      '    -webkit-print-color-adjust:exact; print-color-adjust:exact;',
      '  }',
      '  body { -webkit-user-select:auto !important; user-select:auto !important; }',
      '  #app { display:block !important; height:auto !important; overflow:visible !important; }',

      /* Hide every piece of interactive chrome / advertising / overlay */
      '  #toolbar, #ft-tabsrow,',
      '  #filter-panel, #filter-panel-rows, #filter-panel-toggle, #compact-filter-bar,',
      '  #uni-toggle-bar,',
      '  #zoom-ctrl, #zoom-pct,',
      '  #minimap, #minimap-canvas, #minimap-toggle, #minimap-show, #minimap-jump,',
      '  #kbd-hint, #stats-panel, #uni-scrollbar, #uni-scrollbar-thumb,',
      '  #modal-bg, #lightbox, #tip, #notif, #empty-state,',
      '  #ft-consent-root, #ft-onboarding-root,',
      '  #ft-hud-btn, #ft-hud-panel,',
      '  .ft-dd-menu, .cm-legend-panel, .map-tip,',
      '  ins.adsbygoogle, .adsbygoogle,',
      '  #' + BTN_ID + ', #' + MENU_ID + ', #' + TIP_ID + ' {',
      '    display:none !important;',
      '  }',

      /* -------- Preferred: print the accessible List view -------- */
      '  body.ftp-print-list #canvas-wrap { display:none !important; }',
      '  body.ftp-print-list #ft-list-view {',
      '    display:block !important; position:static !important; inset:auto !important;',
      '    background:#fff !important; color:#111 !important;',
      '    overflow:visible !important; padding:0 !important; z-index:auto !important;',
      '    font-size:12pt;',
      '  }',
      '  body.ftp-print-list #ft-list-view .ft-list-close { display:none !important; }',
      '  #ft-list-view, #ft-list-view * { color:#111 !important; }',
      '  #ft-list-view h1 { font-size:20pt; margin:0 0 6px; }',
      '  #ft-list-view .ft-list-sub { color:#444 !important; }',
      '  #ft-list-view .ft-list-year {',
      '    font-size:14pt; color:#000 !important;',
      '    border-bottom:1px solid #999 !important;',
      '    break-after:avoid; page-break-after:avoid;',
      '    margin-top:20px;',
      '  }',
      '  #ft-list-view li {',
      '    border-bottom:1px solid #ccc !important;',
      '    break-inside:avoid; page-break-inside:avoid;',
      '  }',
      '  #ft-list-view li .ft-list-date,',
      '  #ft-list-view li .ft-list-track { color:#444 !important; }',
      '  #ft-list-view li .ft-list-title { color:#000 !important; }',

      /* -------- Fallback: print the on-screen canvas -------- */
      '  body.ftp-print-canvas #canvas-wrap {',
      '    position:static !important; height:auto !important;',
      '    overflow:visible !important; background:#fff !important;',
      '  }',
      '  body.ftp-print-canvas #tl-canvas {',
      '    max-width:100% !important; height:auto !important;',
      '  }',
      '}'
    ].join('\n');

    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }

  /* ---------------------------------------------------------------
   * 2. PRINT ORCHESTRATION
   * ------------------------------------------------------------- */
  function listView() {
    return document.getElementById('ft-list-view');
  }
  function listIsOpen() {
    var v = listView();
    return !!(v && v.classList.contains('open'));
  }

  /* beforeprint fires for BOTH our button and the browser's native Ctrl+P,
   * so we always tag <body> to reflect what is actually on screen. */
  function onBeforePrint() {
    document.body.classList.remove('ftp-print-list', 'ftp-print-canvas');
    document.body.classList.add(listIsOpen() ? 'ftp-print-list' : 'ftp-print-canvas');
  }
  function onAfterPrint() {
    document.body.classList.remove('ftp-print-list', 'ftp-print-canvas');
    if (openedListByUs) {
      openedListByUs = false;
      try {
        if (window.ftListView && typeof window.ftListView.close === 'function') {
          window.ftListView.close();
        }
      } catch (e) { /* no-op */ }
    }
  }

  function doPrint() {
    /* Open the accessible list view for a clean, reflowable printout when
     * the app provides one and it isn't already showing. */
    try {
      if (window.ftListView && typeof window.ftListView.open === 'function' &&
          listView() && !listIsOpen()) {
        window.ftListView.open();
        openedListByUs = true;
      }
    } catch (e) { /* fall through to whatever is on screen */ }

    // Give the list view a tick to render before the print snapshot.
    window.setTimeout(function () {
      try { window.print(); } catch (e) { /* no-op */ }
    }, openedListByUs ? 60 : 0);
  }

  /* ---------------------------------------------------------------
   * 3. TIP POPOVER (shown once)
   * ------------------------------------------------------------- */
  function tipSeen() {
    try { return localStorage.getItem(TIP_SEEN_KEY) === '1'; } catch (e) { return false; }
  }
  function markTipSeen() {
    try { localStorage.setItem(TIP_SEEN_KEY, '1'); } catch (e) { /* no-op */ }
  }

  var lastFocus = null;

  function hideTip() {
    var tip = document.getElementById(TIP_ID);
    if (tip) tip.setAttribute('hidden', '');
    var btn = document.getElementById(BTN_ID);
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
    else if (btn) btn.focus();
  }

  function buildTip() {
    var tip = document.createElement('div');
    tip.id = TIP_ID;
    tip.setAttribute('role', 'dialog');
    tip.setAttribute('aria-modal', 'false');
    tip.setAttribute('aria-labelledby', 'ftp-tip-title');
    tip.setAttribute('hidden', '');
    tip.innerHTML =
      '<p class="ftp-tip-title" id="ftp-tip-title">Export as PDF</p>' +
      '<p>In the print dialog, choose <strong>"Save as PDF"</strong> as the destination to export your timeline as a document.</p>' +
      '<div class="ftp-tip-btns">' +
        '<button type="button" class="ftp-tip-cancel" data-ftp="cancel">Cancel</button>' +
        '<button type="button" class="ftp-tip-go" data-ftp="go">Print / Save PDF</button>' +
      '</div>';

    tip.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.getAttribute) return;
      var act = t.getAttribute('data-ftp');
      if (act === 'go') {
        markTipSeen();
        tip.setAttribute('hidden', '');
        doPrint();
      } else if (act === 'cancel') {
        hideTip();
      }
    });
    tip.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { ev.stopPropagation(); hideTip(); }
    });
    return tip;
  }

  function showTip() {
    var tip = document.getElementById(TIP_ID);
    if (!tip) { tip = buildTip(); document.body.appendChild(tip); }
    lastFocus = document.activeElement;
    tip.removeAttribute('hidden');
    var go = tip.querySelector('.ftp-tip-go');
    if (go) go.focus();
  }

  /* ---------------------------------------------------------------
   * 4. MARKDOWN / OBSIDIAN EXPORT (read-only)
   * ------------------------------------------------------------- */

  /* Detect the current app by the PAGE (title/pathname), never by the
   * storage key. 'biograph' anywhere => biography, otherwise universe. */
  function detectApp() {
    var hay = ((document.title || '') + ' ' + ((location && location.pathname) || '')).toLowerCase();
    return hay.indexOf('biograph') !== -1 ? 'biography' : 'universe';
  }

  function readState(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      return (obj && typeof obj === 'object') ? obj : null;
    } catch (e) { return null; }
  }

  /* Collapse a value to a single, heading-safe inline string. */
  function mdInline(v) {
    return String(v == null ? '' : v).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  /* Preserve paragraph structure for block text; trim runaway blank lines. */
  function mdBlock(v) {
    return String(v == null ? '' : v).replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function slugify(v) {
    var s = String(v == null ? '' : v).toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return s || 'freetimeline-export';
  }

  /* Best-effort chronological key from free-form date strings. Values with
   * no 4-digit year sort last; ties keep their original (stable) order. */
  function dateNum(d) {
    var s = String(d == null ? '' : d);
    var ym = s.match(/(\d{4})/);
    if (!ym) return Number.POSITIVE_INFINITY;
    var year = parseInt(ym[1], 10);
    var dm = s.match(/^\s*(\d{1,2})\D+(\d{1,2})\D+\d{2,4}/); // dd/mm/yyyy-ish
    var mo = dm ? parseInt(dm[2], 10) : 0;
    var day = dm ? parseInt(dm[1], 10) : 0;
    return (year * 10000) + (mo * 100) + day;
  }
  function byDate(a, b) { return dateNum(a && a.date) - dateNum(b && b.date); }

  function pushSubs(out, subs, depth) {
    var pad = new Array(depth * 2 + 1).join(' '); // 2 spaces per nesting level
    for (var i = 0; i < subs.length; i++) {
      var se = subs[i];
      if (!se) continue;
      var when = mdInline(se.date) ? ' (' + mdInline(se.date) + ')' : '';
      var desc = mdInline(se.description) ? ' — ' + mdInline(se.description) : '';
      out.push(pad + '- **' + mdInline(se.title || 'Untitled sub-event') + '**' + when + desc);
      if (se.subEvents && se.subEvents.length) pushSubs(out, se.subEvents, depth + 1);
    }
  }

  function pushEvent(out, ev) {
    var when = mdInline(ev.date) ? ' (' + mdInline(ev.date) + ')' : '';
    out.push('### ' + mdInline(ev.title || 'Untitled event') + when);
    out.push('');
    if (mdBlock(ev.description)) { out.push(mdBlock(ev.description)); out.push(''); }
    if (mdBlock(ev.notes)) {
      out.push('> ' + mdBlock(ev.notes).replace(/\n/g, '\n> '));
      out.push('');
    }
    var subs = ev.subEvents || [];
    if (subs.length) { pushSubs(out, subs, 0); out.push(''); }
  }

  /* Build the whole Markdown document. Returns { text, name } or null when
   * there is nothing to export. NEVER mutates state. */
  function buildMarkdown() {
    var app = detectApp();
    var key = app === 'biography' ? 'inf_biography_v1' : 'inf_universe_v4';
    var S = readState(key);
    if (!S) return null;

    var tracks = (app === 'biography' ? S.lifeTracks : S.universes) || [];
    var events = S.events || [];
    var people = (app === 'biography' ? S.people : S.characters) || [];
    if (!tracks.length && !events.length && !people.length) return null;

    var titleName = (tracks[0] && tracks[0].name) ||
      (app === 'biography' ? 'FreeTimeline biography' : 'FreeTimeline export');

    var out = [];
    // YAML frontmatter (no date: Date.now is intentionally not used).
    out.push('---');
    out.push('app: ' + app);
    out.push('---');
    out.push('');
    out.push('# ' + mdInline(titleName));
    out.push('');

    var assigned = {};
    tracks.forEach(function (t) {
      assigned[t.id] = true;
      out.push('## ' + mdInline(t.name || 'Untitled'));
      out.push('');
      if (mdBlock(t.description)) { out.push(mdBlock(t.description)); out.push(''); }
      var evs = events.filter(function (e) { return e && e.universeId === t.id; }).slice().sort(byDate);
      if (!evs.length) { out.push('_No events yet._'); out.push(''); }
      evs.forEach(function (ev) { pushEvent(out, ev); });
    });

    // Any events whose track is missing are still worth exporting.
    var orphans = events.filter(function (e) { return e && !assigned[e.universeId]; }).slice().sort(byDate);
    if (orphans.length) {
      out.push('## (Unassigned events)');
      out.push('');
      orphans.forEach(function (ev) { pushEvent(out, ev); });
    }

    if (people.length) {
      out.push('## ' + (app === 'biography' ? 'People' : 'Characters'));
      out.push('');
      people.forEach(function (p) {
        if (!p) return;
        out.push('### ' + mdInline(p.name || 'Unnamed'));
        out.push('');
        if (mdBlock(p.biography)) { out.push(mdBlock(p.biography)); out.push(''); }
      });
    }

    var text = out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '') + '\n';
    return { text: text, name: slugify(titleName) + '.md' };
  }

  function exportMarkdown() {
    var doc = buildMarkdown();
    if (!doc) { toast('Nothing to export yet'); return; }
    try {
      var blob = new Blob([doc.text], { type: 'text/markdown;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = doc.name;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) {} }, 4000);
    } catch (e) {
      toast('Export failed');
    }
  }

  function toast(msg) {
    try {
      if (window.ftNotify && typeof window.ftNotify === 'function') { window.ftNotify(msg); return; }
    } catch (e) { /* fall through */ }
    try { window.alert(msg); } catch (e) { /* no-op */ }
  }

  /* ---------------------------------------------------------------
   * 5. EXPORT MENU + FLOATING BUTTON
   * ------------------------------------------------------------- */
  var menuOpen = false;
  var outsideHandler = null;

  function menuEl() { return document.getElementById(MENU_ID); }

  function onMenuKeydown(ev) {
    var menu = menuEl();
    if (!menu) return;
    var items = Array.prototype.slice.call(menu.querySelectorAll('.ftp-mi'));
    if (!items.length) return;
    var idx = items.indexOf(document.activeElement);
    if (ev.key === 'Escape') {
      ev.preventDefault(); ev.stopPropagation(); closeMenu(true);
    } else if (ev.key === 'ArrowDown') {
      ev.preventDefault(); items[(idx + 1 + items.length) % items.length].focus();
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault(); items[(idx - 1 + items.length) % items.length].focus();
    } else if (ev.key === 'Home') {
      ev.preventDefault(); items[0].focus();
    } else if (ev.key === 'End') {
      ev.preventDefault(); items[items.length - 1].focus();
    } else if (ev.key === 'Tab') {
      closeMenu(false);
    }
  }

  function buildMenu() {
    var menu = document.createElement('div');
    menu.id = MENU_ID;
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Export options');
    menu.setAttribute('aria-orientation', 'vertical');
    menu.setAttribute('hidden', '');
    menu.innerHTML =
      '<button type="button" role="menuitem" class="ftp-mi" data-ftp="print">' +
        '<span class="ftp-mi-ico" aria-hidden="true">&#128424;</span>Print / PDF</button>' +
      '<button type="button" role="menuitem" class="ftp-mi" data-ftp="md">' +
        '<span class="ftp-mi-ico" aria-hidden="true">&#128221;</span>Markdown (.md)</button>';
    menu.addEventListener('click', function (ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest('[data-ftp]') : null;
      if (!t) return;
      var act = t.getAttribute('data-ftp');
      closeMenu(false);
      if (act === 'print') { if (tipSeen()) doPrint(); else showTip(); }
      else if (act === 'md') { exportMarkdown(); }
    });
    menu.addEventListener('keydown', onMenuKeydown);
    return menu;
  }

  function openMenu() {
    var btn = document.getElementById(BTN_ID);
    if (!btn) return;
    var menu = menuEl() || (function () { var m = buildMenu(); document.body.appendChild(m); return m; })();
    // Anchor the menu directly above the button.
    var r = btn.getBoundingClientRect();
    menu.style.left = Math.round(r.left) + 'px';
    menu.style.bottom = Math.round(window.innerHeight - r.top + 8) + 'px';
    menu.removeAttribute('hidden');
    btn.setAttribute('aria-expanded', 'true');
    menuOpen = true;
    var first = menu.querySelector('.ftp-mi');
    if (first) first.focus();
    outsideHandler = function (e) {
      if (menu.contains(e.target) || e.target === btn) return;
      closeMenu(false);
    };
    // Defer so this very click doesn't immediately close the menu.
    window.setTimeout(function () {
      document.addEventListener('mousedown', outsideHandler, true);
    }, 0);
  }

  function closeMenu(focusBtn) {
    var menu = menuEl();
    if (menu) menu.setAttribute('hidden', '');
    var btn = document.getElementById(BTN_ID);
    if (btn) btn.setAttribute('aria-expanded', 'false');
    menuOpen = false;
    if (outsideHandler) {
      document.removeEventListener('mousedown', outsideHandler, true);
      outsideHandler = null;
    }
    if (focusBtn && btn) { try { btn.focus(); } catch (e) {} }
  }

  function buildButton() {
    var btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Export the timeline (Print / PDF or Markdown)');
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.title = 'Export (Print / PDF or Markdown)';
    btn.innerHTML =
      '<span class="ftp-ico" aria-hidden="true">&#128228;</span>' +
      '<span class="ftp-label">Export</span>' +
      '<span class="ftp-caret" aria-hidden="true">&#9662;</span>';
    btn.addEventListener('click', function () {
      if (menuOpen) closeMenu(true);
      else openMenu();
    });
    document.body.appendChild(btn);
  }

  /* ---------------------------------------------------------------
   * INIT
   * ------------------------------------------------------------- */
  function init() {
    // Only mount inside the actual timeline apps.
    if (!document.getElementById('canvas-wrap') && !document.getElementById('tl-canvas')) return;
    injectStyle();
    buildButton();
    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('afterprint', onAfterPrint);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

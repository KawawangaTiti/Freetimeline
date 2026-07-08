/* FreeTimeline — toolbar de-clutter.
   Non-invasive: reorganises the EXISTING #toolbar by moving the real buttons (handlers
   intact) into grouped dropdowns, so the wall of ~28 controls becomes one calm row:
   [Home] [∞] [＋Event] [+Track] [view tabs]  Data▾ Organise▾ View▾  ↩ ↪   (right) Help▾
   Works for both apps (matches by onclick substring); anything unmatched stays visible.
   If anything is missing it's a silent no-op and the toolbar stays as-is. */
(function () {
  var tb = document.getElementById('toolbar');
  if (!tb || tb.getAttribute('data-ft-grouped')) return;

  // Flatten: Universe wraps buttons in .tb-group divs; lift them to direct children so both
  // apps share one flat structure before we regroup. (Leaves empty wrappers removed.)
  Array.prototype.slice.call(tb.querySelectorAll('.tb-group')).forEach(function (g) {
    while (g.firstChild) tb.insertBefore(g.firstChild, g);
    g.remove();
  });

  function lum(c) { var m = (c || '').match(/\d+/g); return m ? (0.299 * +m[0] + 0.587 * +m[1] + 0.114 * +m[2]) : 255; }
  var dark = lum(getComputedStyle(document.body).backgroundColor) < 128;
  var T = dark
    ? { panel: '#111a31', line: '#26365c', ink: '#e7ecf7', hover: 'rgba(255,255,255,0.08)' }
    : { panel: '#fffdf8', line: '#e6dac6', ink: '#3d2b1f', hover: 'rgba(120,80,30,0.08)' };

  var st = document.createElement('style');
  st.textContent =
    '.ft-dd{position:relative;display:inline-flex}' +
    '.ft-dd-caret{opacity:.55;font-size:.78em;margin-left:3px}' +
    '.ft-dd-menu{position:absolute;top:calc(100% + 6px);left:0;min-width:190px;z-index:300;' +
      'background:' + T.panel + ';border:1px solid ' + T.line + ';border-radius:11px;padding:6px;' +
      'box-shadow:0 14px 36px rgba(0,0,0,.34);display:flex;flex-direction:column;gap:2px}' +
    '.ft-dd-menu[hidden]{display:none}' +
    '.ft-dd-menu>*{display:flex!important;align-items:center;justify-content:flex-start!important;' +
      'width:100%;min-width:0;background:transparent!important;border:0!important;border-radius:7px!important;' +
      'padding:9px 11px!important;margin:0!important;color:' + T.ink + '!important;font-weight:600!important;' +
      'font-size:13px!important;text-align:left;white-space:nowrap;opacity:1!important;cursor:pointer}' +
    '.ft-dd-menu>*:hover{background:' + T.hover + '!important}' +
    '.ft-dd-menu label{gap:9px;cursor:default}' +
    '.ft-dd-spacer{flex:1 1 auto}' +
    '@media(max-width:820px){.ft-dd-menu{left:auto;right:0}}';
  document.head.appendChild(st);

  function find(sub) {
    return Array.prototype.slice.call(tb.querySelectorAll('[onclick],label'))
      .filter(function (b) { return (b.getAttribute && b.getAttribute('onclick') || '').indexOf(sub) !== -1; });
  }
  var picked = [];
  function group(subs) {
    var nodes = [];
    subs.forEach(function (s) { find(s).forEach(function (n) { if (nodes.indexOf(n) < 0 && picked.indexOf(n) < 0) { nodes.push(n); picked.push(n); } }); });
    return nodes;
  }

  function closeAll() {
    tb.querySelectorAll('.ft-dd-menu').forEach(function (m) { m.hidden = true; });
    tb.querySelectorAll('.ft-dd-trigger').forEach(function (t) { t.setAttribute('aria-expanded', 'false'); });
  }
  document.addEventListener('click', closeAll);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(); });

  function menu(label, nodes) {
    if (!nodes.length) return null;
    var wrap = document.createElement('div'); wrap.className = 'ft-dd';
    var trg = document.createElement('button');
    trg.type = 'button'; trg.className = 'ft-dd-trigger btn tb-secondary';
    trg.setAttribute('aria-haspopup', 'true'); trg.setAttribute('aria-expanded', 'false');
    trg.innerHTML = label + '<span class="ft-dd-caret">▾</span>';
    var m = document.createElement('div'); m.className = 'ft-dd-menu'; m.setAttribute('role', 'menu'); m.hidden = true;
    nodes.forEach(function (n) { n.classList.remove('tb-secondary'); m.appendChild(n); });
    trg.addEventListener('click', function (e) {
      e.stopPropagation();
      var wasOpen = !m.hidden; closeAll();
      if (!wasOpen) { m.hidden = false; trg.setAttribute('aria-expanded', 'true'); }
    });
    wrap.appendChild(trg); wrap.appendChild(m);
    return wrap;
  }

  // --- collect groups (order of preference; first match wins, no dupes) ---
  var dataM = group(['saveHTML', 'saveJSON', 'importClick', 'blankTimeline']);
  var orgM = group(['catEditor', 'affiliationEditor', 'organizationEditor', 'continuityEditor']);
  var viewM = group(['jumpToYear', 'toggleStoryLine', 'resetView', 'toggleStats', 'ContinuityTour', 'MemoryTour', 'toggleReadingMode', 'openRangeConfig', 'track-h', 'TRACK_H']);
  var helpM = group(['toggleKbd', 'UI.help(', 'openSettings', 'UI.settings']);

  // keep-visible anchors (Tier 1: Today + Fit cover most navigation, so they stay out)
  var home = tb.querySelector('[onclick*="goBackToMenu"], .back-btn, .menu-btn');
  var logo = tb.querySelector('.logo');
  var primary = tb.querySelector('[onclick*="addEvent"]');
  var track = tb.querySelector('[onclick*="addUniverse"]');
  var tabs = tb.querySelector('.view-tabs');
  var undo = tb.querySelector('#undo-btn');
  var redo = tb.querySelector('#redo-btn');
  var today = tb.querySelector('[onclick*="goToToday"]');
  var fit = tb.querySelector('[onclick*="fitToData"]');
  if (today) picked.push(today);
  if (fit) picked.push(fit);
  var anchors = [home, logo, primary, track, tabs, undo, redo, today, fit];

  // the track-height slider label has no onclick -> attach it to View explicitly
  var thS = tb.querySelector('#track-h-slider'), thL = thS && thS.closest('label');
  if (thL && picked.indexOf(thL) < 0) { viewM.push(thL); picked.push(thL); }

  // sweep any remaining loose top-level button/label (e.g. engine-injected Settings / minimap toggle) -> Help
  Array.prototype.slice.call(tb.children).forEach(function (n) {
    if ((n.tagName === 'BUTTON' || n.tagName === 'LABEL') && anchors.indexOf(n) < 0 && picked.indexOf(n) < 0) {
      helpM.push(n); picked.push(n);
    }
  });

  var ddData = menu('Data', dataM);
  var ddOrg = menu('Organise', orgM);
  var ddView = menu('View', viewM);
  var ddHelp = menu('Help', helpM);

  // strip the old separators + mini-labels (Add / Save / Nav / History ...)
  // (Biography uses .tb-label, Universe uses .tb-group-label)
  tb.querySelectorAll('.tb-label, .tb-group-label, .sep, .tb-help-group').forEach(function (n) { n.remove(); });

  // re-append in a clean, deliberate order (appendChild moves nodes).
  // Unlisted children would be stranded at the toolbar start, so the save-status
  // chip and the hidden #file-in (clicked by Store.importClick) ride along too.
  var spacer = document.createElement('div'); spacer.className = 'ft-dd-spacer';
  var saveStatus = tb.querySelector('.tb-save-status');
  var fileIn = tb.querySelector('#file-in');
  [home, logo, primary, track, tabs, ddData, ddOrg, ddView, today, fit, undo, redo, spacer, saveStatus, ddHelp, fileIn].forEach(function (n) { if (n) tb.appendChild(n); });

  tb.setAttribute('data-ft-grouped', '1');

  /* One-time coachmark so nobody hunts for their "disappeared" Save/Load buttons.
     Dismiss persists via localStorage (sessionStorage fallback for private mode). */
  (function coachmark() {
    var KEY = 'ft_tb_hint_v1';
    function seen() { try { if (localStorage.getItem(KEY)) return true; } catch (_) {} try { return !!sessionStorage.getItem(KEY); } catch (_) {} return false; }
    function markSeen() { try { localStorage.setItem(KEY, '1'); } catch (_) {} try { sessionStorage.setItem(KEY, '1'); } catch (_) {} }
    if (seen() || !ddData) return;
    var trg = ddData.querySelector('.ft-dd-trigger');
    if (!trg) return;
    var tip = document.createElement('div');
    tip.setAttribute('role', 'status');
    tip.style.cssText = 'position:absolute;z-index:350;top:calc(100% + 10px);left:0;width:max-content;max-width:240px;' +
      'background:' + T.panel + ';border:1px solid ' + T.line + ';border-radius:11px;padding:10px 12px;' +
      'box-shadow:0 14px 36px rgba(0,0,0,.34);color:' + T.ink + ';font-size:12.5px;line-height:1.45';
    tip.innerHTML = 'Your <b>Save / Load</b> buttons now live in the <b>Data ▾</b> menu. ' +
      'Tip: press <b>Ctrl+K</b> to search every action. ' +
      '<button type="button" style="display:block;margin-top:8px;border:1px solid ' + T.line + ';background:transparent;' +
      'color:' + T.ink + ';border-radius:7px;padding:4px 10px;cursor:pointer;font-weight:600">Got it</button>';
    tip.querySelector('button').addEventListener('click', function () { markSeen(); tip.remove(); });
    ddData.appendChild(tip);
    setTimeout(function () { markSeen(); if (tip.parentNode) tip.remove(); }, 15000);
  })();
})();

/* ============================================================================
 * ft-hud.js  —  Layout aligner for the FreeTimeline HUD
 * ----------------------------------------------------------------------------
 * Autonomous, self-contained module (IIFE). Lets the user ALIGN the HUD:
 *   - Toolbar alignment (start / center / end) on #toolbar
 *   - Corner (TL/TR/BL/BR) for each floating widget present on the page
 *     (#minimap, #zoom-ctrl, #current-track-banner)
 *
 * Design rules honoured:
 *  1. DEFAULT-INERT: with no saved config it touches NOTHING (zero regression).
 *  2. Opt-in panel behind a discreet ⚙ button (fixed, below modal layers).
 *  3. Persists to localStorage under a VERSIONED key ('ft_hud_layout_v1').
 *  4. Desktop-only: overrides apply only on (min-width:768px) AND (pointer:fine).
 *     On mobile/touch the default responsive layout is left untouched and the
 *     button/panel are hidden. Re-evaluated live on media-query changes.
 *  5. Accessible: focus-visible, Escape closes, aria wiring, focus restore.
 *
 * No dependencies. No external assets. Injects its own <style>.
 * Safe to load on any page — it no-ops where the elements do not exist.
 * ==========================================================================*/
(function () {
  'use strict';

  if (window.__ftHudInit) return;      // idempotent guard
  window.__ftHudInit = true;

  var LS_KEY = 'ft_hud_layout_v1';
  var DESKTOP_MQ = '(min-width: 768px) and (pointer: fine)';
  var CORNER_GAP = '14px';

  // Widgets we know how to reposition. `label` is user-facing (PT-PT).
  var WIDGETS = [
    { id: 'minimap',              label: 'Minimap' },
    { id: 'zoom-ctrl',            label: 'Zoom control' },
    { id: 'current-track-banner', label: 'Current track' }
  ];
  var CORNERS = [
    { v: 'TL', label: 'Top-left' },
    { v: 'TR', label: 'Top-right' },
    { v: 'BL', label: 'Bottom-left' },
    { v: 'BR', label: 'Bottom-right' }
  ];
  var ALIGNS = [
    { v: 'start',  label: 'Start' },
    { v: 'center', label: 'Center' },
    { v: 'end',    label: 'End' }
  ];

  // ---- state ---------------------------------------------------------------
  var cfg = loadCfg();
  var mql = window.matchMedia ? window.matchMedia(DESKTOP_MQ) : null;
  var btn = null, panel = null, styleEl = null, lastFocus = null;

  function isDesktop() { return mql ? mql.matches : true; }

  // ---- persistence ---------------------------------------------------------
  function loadCfg() {
    try {
      var raw = window.localStorage.getItem(LS_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || typeof o !== 'object') return null;
      return o;
    } catch (e) { return null; }
  }
  function saveCfg() {
    try {
      if (!cfg || (cfg.toolbar == null && (!cfg.widgets || !Object.keys(cfg.widgets).length))) {
        window.localStorage.removeItem(LS_KEY);
      } else {
        window.localStorage.setItem(LS_KEY, JSON.stringify(cfg));
      }
    } catch (e) { /* storage may be blocked; ignore */ }
  }
  function ensureCfg() {
    if (!cfg) cfg = {};
    if (!cfg.widgets) cfg.widgets = {};
    return cfg;
  }

  // ---- DOM helpers ---------------------------------------------------------
  function $(id) { return document.getElementById(id); }
  function isVisible(el) {
    // Present AND actually rendered (excludes display:none widgets such as the
    // desktop-hidden #current-track-banner, or a collapsed minimap).
    return !!(el && (el.offsetParent !== null || el.getClientRects().length));
  }

  // ---- appliers ------------------------------------------------------------
  function applyToolbar(align) {
    var tb = $('toolbar');
    if (!tb) return;
    if (!align || !isDesktop()) { tb.style.justifyContent = ''; return; }
    tb.style.justifyContent =
      align === 'center' ? 'center' : align === 'end' ? 'flex-end' : 'flex-start';
  }

  function clearWidget(el) {
    if (!el) return;
    el.style.top = el.style.right = el.style.bottom = el.style.left = '';
    el.style.width = '';
  }

  function applyWidget(id, corner) {
    var el = $(id);
    if (!el) return;
    if (!corner || !isDesktop() || !isVisible(el)) { clearWidget(el); return; }
    // Preserve current rendered width so full-width widgets (e.g. the minimap,
    // anchored via left+right) do not collapse when we release one side.
    var w = Math.round(el.getBoundingClientRect().width);
    clearWidget(el);
    if (w > 0) el.style.width = w + 'px';
    var top = corner.charAt(0) === 'T';
    var left = corner.charAt(1) === 'L';
    el.style.top    = top  ? CORNER_GAP : 'auto';
    el.style.bottom = top  ? 'auto' : CORNER_GAP;
    el.style.left   = left ? CORNER_GAP : 'auto';
    el.style.right  = left ? 'auto' : CORNER_GAP;
  }

  // Apply the whole saved config (or clear everything when inert / on mobile).
  function applyAll() {
    applyToolbar(cfg && cfg.toolbar);
    for (var i = 0; i < WIDGETS.length; i++) {
      var id = WIDGETS[i].id;
      applyWidget(id, cfg && cfg.widgets ? cfg.widgets[id] : null);
    }
  }

  function resetAll() {
    // Clear every override and forget the saved config.
    var tb = $('toolbar'); if (tb) tb.style.justifyContent = '';
    for (var i = 0; i < WIDGETS.length; i++) clearWidget($(WIDGETS[i].id));
    cfg = null;
    saveCfg();
    if (panel) buildPanelBody();   // refresh selected states
  }

  // ---- styles --------------------------------------------------------------
  function injectStyle() {
    if (styleEl) return;
    styleEl = document.createElement('style');
    styleEl.id = 'ft-hud-style';
    styleEl.textContent = [
      '#ft-hud-btn{position:fixed;left:12px;bottom:12px;z-index:300;width:38px;height:38px;',
      'border-radius:10px;border:1px solid var(--v-bd,rgba(255,255,255,0.14));',
      'background:var(--v-panel,#12162b);color:var(--v-ink,#eaf0ff);font-size:18px;line-height:1;',
      'cursor:pointer;display:flex;align-items:center;justify-content:center;',
      'box-shadow:0 2px 12px rgba(0,0,0,0.4);backdrop-filter:blur(8px);opacity:.72;',
      'transition:opacity .15s,transform .1s;font-family:inherit;}',
      '#ft-hud-btn:hover{opacity:1;}',
      '#ft-hud-btn:active{transform:scale(.95);}',
      '#ft-hud-btn:focus-visible,#ft-hud-panel :focus-visible{outline:3px solid #8fd3ff;outline-offset:2px;}',
      '#ft-hud-panel{position:fixed;left:12px;bottom:58px;z-index:305;width:260px;max-width:calc(100vw - 24px);',
      'max-height:calc(100vh - 90px);overflow:auto;padding:14px;border-radius:14px;',
      'border:1px solid var(--v-bd,rgba(255,255,255,0.14));background:var(--v-panel,#12162b);',
      'color:var(--v-ink,#eaf0ff);box-shadow:0 12px 40px rgba(0,0,0,0.55);',
      'font-family:inherit;font-size:13px;}',
      '#ft-hud-panel[hidden]{display:none;}',
      '#ft-hud-panel h2{font-size:13px;font-weight:800;margin:0 0 4px;letter-spacing:.3px;}',
      '#ft-hud-panel .ft-hud-sub{font-size:11px;color:var(--v-ink-dim,#b6c0e0);margin:0 0 12px;}',
      '#ft-hud-panel .ft-hud-sec{margin:0 0 12px;}',
      '#ft-hud-panel .ft-hud-sec > .ft-hud-lbl{display:block;font-size:11px;font-weight:700;',
      'text-transform:uppercase;letter-spacing:.6px;color:var(--v-ink-dim,#b6c0e0);margin:0 0 6px;}',
      '#ft-hud-panel .ft-hud-row{display:flex;flex-wrap:wrap;gap:5px;}',
      '#ft-hud-panel .ft-hud-opt{flex:1 1 auto;min-width:56px;padding:6px 8px;border-radius:8px;',
      'border:1px solid var(--v-bd,rgba(255,255,255,0.14));background:rgba(255,255,255,0.04);',
      'color:var(--v-ink,#eaf0ff);font:600 12px/1 inherit;cursor:pointer;text-align:center;',
      'transition:background .12s,border-color .12s;}',
      '#ft-hud-panel .ft-hud-opt:hover{background:rgba(255,255,255,0.1);}',
      '#ft-hud-panel .ft-hud-opt[aria-pressed="true"]{background:var(--v-accent,#3d82ff);',
      'border-color:var(--v-accent,#3d82ff);color:#fff;}',
      '#ft-hud-panel .ft-hud-foot{display:flex;justify-content:space-between;align-items:center;',
      'gap:8px;margin-top:4px;padding-top:10px;border-top:1px solid var(--v-bd,rgba(255,255,255,0.1));}',
      '#ft-hud-panel .ft-hud-reset{padding:6px 12px;border-radius:8px;border:1px solid var(--v-bd,rgba(255,255,255,0.16));',
      'background:transparent;color:var(--v-ink,#eaf0ff);font:600 12px/1 inherit;cursor:pointer;}',
      '#ft-hud-panel .ft-hud-reset:hover{background:rgba(255,255,255,0.08);}',
      '#ft-hud-panel .ft-hud-close{background:transparent;border:0;color:var(--v-ink-dim,#b6c0e0);',
      'font:700 12px/1 inherit;cursor:pointer;padding:6px;}',
      '#ft-hud-panel .ft-hud-empty{font-size:11px;color:var(--v-ink-dim,#b6c0e0);font-style:italic;}',
      /* Hard safety net: never let this UI show on non-desktop. */
      '@media (max-width:767px),(pointer:coarse){#ft-hud-btn,#ft-hud-panel{display:none !important;}}'
    ].join('');
    (document.head || document.documentElement).appendChild(styleEl);
  }

  // ---- panel UI ------------------------------------------------------------
  function makeOptRow(labelText, options, currentVal, onPick) {
    var sec = document.createElement('div');
    sec.className = 'ft-hud-sec';
    var lbl = document.createElement('span');
    lbl.className = 'ft-hud-lbl';
    lbl.textContent = labelText;
    sec.appendChild(lbl);
    var row = document.createElement('div');
    row.className = 'ft-hud-row';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', labelText);
    options.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ft-hud-opt';
      b.textContent = o.label;
      b.setAttribute('aria-pressed', String(currentVal === o.v));
      b.addEventListener('click', function () {
        var isOn = b.getAttribute('aria-pressed') === 'true';
        var next = isOn ? null : o.v;   // click active option again = clear it
        // reflect within this row
        Array.prototype.forEach.call(row.children, function (c) {
          c.setAttribute('aria-pressed', 'false');
        });
        if (next) b.setAttribute('aria-pressed', 'true');
        onPick(next);
      });
      row.appendChild(b);
    });
    sec.appendChild(row);
    return sec;
  }

  function buildPanelBody() {
    if (!panel) return;
    panel.innerHTML = '';

    var h = document.createElement('h2');
    h.id = 'ft-hud-title';
    h.textContent = 'HUD alignment';
    panel.appendChild(h);
    var sub = document.createElement('p');
    sub.className = 'ft-hud-sub';
    sub.textContent = 'Align the toolbar and floating widgets. Applies on this screen only (desktop).';
    panel.appendChild(sub);

    // Toolbar alignment (only if the toolbar exists)
    if ($('toolbar')) {
      panel.appendChild(makeOptRow('Toolbar', ALIGNS,
        cfg && cfg.toolbar, function (val) {
          ensureCfg();
          if (val) cfg.toolbar = val; else delete cfg.toolbar;
          applyToolbar(cfg.toolbar);
          saveCfg();
        }));
    }

    // Floating widgets — only those actually present & visible right now.
    var shown = 0;
    WIDGETS.forEach(function (w) {
      var el = $(w.id);
      if (!isVisible(el)) return;
      shown++;
      panel.appendChild(makeOptRow(w.label, CORNERS,
        cfg && cfg.widgets ? cfg.widgets[w.id] : null, function (val) {
          ensureCfg();
          if (val) cfg.widgets[w.id] = val; else delete cfg.widgets[w.id];
          applyWidget(w.id, val);
          saveCfg();
        }));
    });
    if (!shown) {
      var e = document.createElement('p');
      e.className = 'ft-hud-empty';
      e.textContent = 'No floating widgets in this view.';
      panel.appendChild(e);
    }

    // Footer: reset + close
    var foot = document.createElement('div');
    foot.className = 'ft-hud-foot';
    var reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'ft-hud-reset';
    reset.textContent = 'Reset to default';
    reset.addEventListener('click', resetAll);
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'ft-hud-close';
    close.textContent = 'Close';
    close.addEventListener('click', closePanel);
    foot.appendChild(reset);
    foot.appendChild(close);
    panel.appendChild(foot);
  }

  function openPanel() {
    if (!isDesktop()) return;
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'ft-hud-panel';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-labelledby', 'ft-hud-title');
      panel.hidden = true;
      document.body.appendChild(panel);
    }
    buildPanelBody();
    panel.hidden = false;
    if (btn) btn.setAttribute('aria-expanded', 'true');
    lastFocus = document.activeElement;
    var first = panel.querySelector('.ft-hud-opt, button');
    if (first) first.focus();
    document.addEventListener('keydown', onKeydown, true);
    document.addEventListener('mousedown', onOutside, true);
  }

  function closePanel() {
    if (panel) panel.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', onKeydown, true);
    document.removeEventListener('mousedown', onOutside, true);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    else if (btn) btn.focus();
  }

  function isOpen() { return panel && !panel.hidden; }

  function onKeydown(e) {
    if (e.key === 'Escape' || e.key === 'Esc') { e.stopPropagation(); closePanel(); }
  }
  function onOutside(e) {
    if (!isOpen()) return;
    if (panel.contains(e.target) || (btn && btn.contains(e.target))) return;
    closePanel();
  }

  // ---- button --------------------------------------------------------------
  function ensureButton() {
    if (btn || !isDesktop()) return;
    injectStyle();
    btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'ft-hud-btn';
    btn.textContent = '⚙';                 // ⚙
    btn.setAttribute('aria-label', 'HUD layout');
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', function () {
      if (isOpen()) closePanel(); else openPanel();
    });
    document.body.appendChild(btn);
  }

  function removeButtonAndPanel() {
    if (isOpen()) closePanel();
    if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    btn = null; panel = null;
  }

  // ---- media-query reactivity ---------------------------------------------
  function onMediaChange() {
    if (isDesktop()) {
      ensureButton();
      applyAll();               // re-apply saved overrides
    } else {
      removeButtonAndPanel();   // hide the UI…
      applyAll();               // …and drop overrides so mobile stays default
    }
  }

  // ---- boot ----------------------------------------------------------------
  function boot() {
    injectStyle();
    ensureButton();
    applyAll();   // if cfg is null this is a no-op → default-inert
    if (mql) {
      if (mql.addEventListener) mql.addEventListener('change', onMediaChange);
      else if (mql.addListener) mql.addListener(onMediaChange);   // Safari <14
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  // Small public surface for debugging / external hooks (optional).
  window.FTHud = {
    open: openPanel,
    close: closePanel,
    reset: resetAll,
    reapply: applyAll,
    get config() { return cfg ? JSON.parse(JSON.stringify(cfg)) : null; }
  };
})();

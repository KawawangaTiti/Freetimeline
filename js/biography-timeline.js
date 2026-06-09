'use strict';

/* =====================================================
   CONSTANTS
   ===================================================== */
const LEFT_W  = 170;   // universe label panel width (px) — slightly wider for bigger buttons
const RULER_H = 54;    // time ruler height (px)
/* =====================================================
   FT_BIO NAMESPACE (soft extract — Prompt 2.4.A)
   Reserves window.FT_BIO as the future module surface for the
   timeline engine. Live state, view, modal stack, persistence and
   render entry points are registered at the bottom of this script
   inside the "TIMELINE ENGINE EXPORTS" block. When the file is
   eventually split into js/biography-timeline.js, every consumer
   already references FT_BIO.x instead of bare globals — making the
   final extraction a pure mechanical move with no callsite changes.
   ===================================================== */
window.FT_BIO = window.FT_BIO || {};

/* SUP-01 — failsafe gate for destructive actions.
   Every delete/import call site uses the bare global ftConfirmGate(), defined
   in js/ft-confirm.js. If that support file fails to load (network blip, blocked
   script, cache miss) the symbol is undefined and EVERY delete/import throws a
   ReferenceError and silently no-ops — the app looks frozen. ft-confirm.js is a
   `defer` script loaded before this engine (also `defer`), so when present it has
   already installed the real dialog and the `||` keeps it; only when it is missing
   does this native-confirm fallback take over (uglier on mobile, but functional). */
window.ftConfirmGate = window.ftConfirmGate || function (msg, onConfirm) {
  if (window.confirm(msg)) onConfirm();
};

/* === TIMELINE ENGINE STATE START === */
let   TRACK_H = 100;   // height per life track (px) — user-configurable
const EV_R    = 13;    // event circle radius (px)
const OY      = 2000;  // origin year (world x = 0)
const BPPY    = 110;   // base pixels per year at scale=1
let YEAR_MIN = -200000;
let YEAR_MAX = 20000;
const MAX_SC  = 350;
function getMinScale() {
  const c = CV();
  if (!c || !c.width) return 0.00012;
  const visibleW = isVerticalTimelineLayout() ? c.height - RULER_H : c.width - LEFT_W;
  const totalWorldW = (YEAR_MAX - YEAR_MIN) * BPPY;
  return Math.max(0.00001, visibleW / totalWorldW);
}
const MIN_SC  = 0.00012;
const PALETTE = [
  '#b07942','#8b6e4e','#c4956a','#a67b5b','#d4a574',
  '#7a6652','#c08552','#9e7c5a','#b5916c','#8c7060'
];
const MONTHS  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/* ---- EVENT CATEGORIES (dynamic — editable by user) ---- */
const DEFAULT_CATEGORIES = {
    'Birth & Early Years':         { color: '#5a9e6a', icon: '👶' },
    'Education & Learning':        { color: '#4a78b8', icon: '🎓' },
    'Career & Achievement':        { color: '#b8882a', icon: '💼' },
    'Relationships & Family':      { color: '#b84848', icon: '❤️' },
    'Health & Wellbeing':          { color: '#7e52a0', icon: '🏥' },
    'Travel & Adventure':          { color: '#2e8c80', icon: '✈️' },
    'Challenges & Turning Points': { color: '#b86830', icon: '⚡' },
    'Personal Growth & Identity':  { color: '#4a8a58', icon: '🌱' },
    'Legacy & Reflection':         { color: '#4a5870', icon: '🕊️' },
    'Other':                       { color: '#8a8078', icon: '📌' },
  };
let CATEGORIES = Object.assign({}, DEFAULT_CATEGORIES);
const BIO_STATUSES = ['Upcoming','Ongoing','Completed','Missed','Cancelled'];
const BIO_STATUS_COLORS = { Upcoming:'#4a78b8', Ongoing:'#b8882a', Completed:'#4a8a58', Missed:'#b84848', Cancelled:'#8a8078' };
function statusColor(st) { return BIO_STATUS_COLORS[st] || '#888'; }
function catColor(cat) { return CATEGORIES[cat] ? CATEGORIES[cat].color : '#888'; }
function catIcon(cat)  { return CATEGORIES[cat] ? CATEGORIES[cat].icon : '📌'; }
function syncCategoriesFromState() {
  if (S.categories && Object.keys(S.categories).length > 0) {
    CATEGORIES = {};
    for (const k in S.categories) CATEGORIES[k] = Object.assign({}, S.categories[k]);
  }
}
function syncCategoriesToState() {
  S.categories = {};
  for (const k in CATEGORIES) S.categories[k] = Object.assign({}, CATEGORIES[k]);
}

/* =====================================================
   STATE
   ===================================================== */
/*STATE_START*/let S = { lifeTracks: [], events: [], connections: [], people: [], categories: {}, affiliations: [] };/*STATE_END*/

// View transform
let V = { panX: 0, panY: 0, scale: 1 };

// Interaction
let drag   = { on: false, sx: 0, sy: 0, px: 0, py: 0, moved: false };
let hits   = [];   // hit targets rebuilt every render
let _lblSuppressedIds = new Set(); // 2.4.D: label ids hidden by de-collision sweep

// Modal stack — each entry describes what to show
let MS = [];
/* === TIMELINE ENGINE STATE END === */

// Working media list during form editing
let _editMediaList = [];
let _charPhoto = null;  // base64 photo for character being edited
let _meanwhileMode = false; // toggle meanwhile context in char timeline
let _blankTemplateMode = false;

/* =====================================================
   UTILITY HELPERS
   ===================================================== */
function uid() {
  return '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function isBlankTemplateState(d) {
  const tracks = d.lifeTracks || d.universes || [];
  const events = d.events || [];
  const connections = d.connections || [];
  const people = d.people || d.characters || [];
  const affiliations = d.affiliations || [];
  const hasNoContent = events.length === 0 && connections.length === 0 && people.length === 0 && affiliations.length === 0;
  const hasNoTracks = tracks.length === 0;
  const hasOnlyDefaultBlankTrack = tracks.length === 1 && String(tracks[0].name || '').trim().toLowerCase() === 'untitled';
  return hasNoContent && (hasNoTracks || hasOnlyDefaultBlankTrack);
}

let _notifTimer;
function notify(msg, type) {
  const el = document.getElementById('notif');
  const normalizedType = normalizeNotifyType(type, msg);
  const urgent = normalizedType === 'error' || normalizedType === 'warning';
  el.setAttribute('role', urgent ? 'alert' : 'status');
  el.setAttribute('aria-live', urgent ? 'assertive' : 'polite');
  el.textContent = msg;
  el.className = normalizedType + ' show';
  announceA11y(msg, urgent ? 'assertive' : 'polite');
  clearTimeout(_notifTimer);
  _notifTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function normalizeNotifyType(type, msg) {
  type = (type || '').toLowerCase();
  if (type === 'ok') type = 'success';
  if (type === 'warn') type = 'warning';
  if (['success','error','warning','info'].includes(type)) return type;
  const text = String(msg || '').toLowerCase();
  if (/(required|please enter|please select|must be|too large|could not|failed|invalid|duplicate|already exists|nothing to undo|nothing to redo)/.test(text)) return 'error';
  if (/(deleted|removed|reset|replace all|cannot be undone|lost|overwrite|irreversible)/.test(text)) return 'warning';
  if (/(saved|exported|loaded|created|added|updated|linked|imported|✓|changes)/.test(text)) return 'success';
  return 'info';
}

function announceA11y(msg, priority) {
  const el = document.getElementById('a11y-status');
  if (!el) return;
  el.setAttribute('aria-live', priority || 'polite');
  el.textContent = '';
  setTimeout(function() { el.textContent = msg; }, 20);
}

function ensureControlId(el, prefix) {
  if (!el) return '';
  if (!el.id) el.id = (prefix || 'bio-field') + '-' + Math.random().toString(36).slice(2, 9);
  return el.id;
}

function clearFieldError(fieldId) {
  const field = document.getElementById(fieldId);
  if (!field) return;
  field.removeAttribute('aria-invalid');
  const errId = fieldId + '-error';
  const err = document.getElementById(errId);
  if (err) err.remove();
  const describedBy = (field.getAttribute('aria-describedby') || '')
    .split(/\s+/)
    .filter(Boolean)
    .filter(id => id !== errId);
  if (describedBy.length) field.setAttribute('aria-describedby', describedBy.join(' '));
  else field.removeAttribute('aria-describedby');
}

function showFieldError(fieldId, message) {
  const field = document.getElementById(fieldId);
  if (!field) return;
  clearFieldError(fieldId);
  field.setAttribute('aria-invalid', 'true');
  const err = document.createElement('div');
  err.id = fieldId + '-error';
  err.className = 'field-error';
  err.textContent = message;
  field.insertAdjacentElement('afterend', err);
  const describedBy = (field.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
  describedBy.push(err.id);
  field.setAttribute('aria-describedby', Array.from(new Set(describedBy)).join(' '));
  try { field.focus(); } catch (_) {}
}

function bindFormLabels(root) {
  if (!root) return;
  root.querySelectorAll('label').forEach(function(label) {
    const existingFor = label.getAttribute('for');
    if (existingFor) return;
    const control = label.nextElementSibling && /^(INPUT|SELECT|TEXTAREA)$/.test(label.nextElementSibling.tagName)
      ? label.nextElementSibling
      : label.parentElement && label.parentElement.querySelector('input, select, textarea');
    if (!control) return;
    label.setAttribute('for', ensureControlId(control, 'bio-field'));
  });
}

function describeInteractiveElements(root) {
  if (!root) return;
  root.querySelectorAll('button, [role="button"]').forEach(function(btn) {
    if (!btn.getAttribute('aria-label') && !btn.textContent.trim()) {
      btn.setAttribute('aria-label', 'Action');
    }
  });
  root.querySelectorAll('input, select, textarea').forEach(function(field) {
    ensureControlId(field, 'bio-field');
  });
}

function getFocusable(root) {
  if (!root) return [];
  return Array.from(root.querySelectorAll('a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'))
    .filter(function(el) {
      return !el.hidden && el.offsetParent !== null;
    });
}

/* =====================================================
   DATA HELPERS
   ===================================================== */
function getU(id)      { return S.lifeTracks.find(u => u.id === id); }
function getVisIdx(id) {
  let vi = 0;
  for (const u of S.lifeTracks) {
    if (u.visible === false) continue;
    if (u.id === id) return vi;
    vi++;
  }
  return -1;
}
function visCount() { return S.lifeTracks.filter(u => u.visible !== false).length; }

/**
 * Parse "dd/mm/yyyy" -> decimal year. 'X' allowed for unknown parts.
 * Supports negative years (e.g. xx/xx/-50000 for BCE).
 * Supports large years (e.g. xx/xx/100000).
 * Optional time parameter adds sub-day precision.
 * Returns null if year is unknown.
 */
function parseDate(d, time) {
  if (!d) return null;
  const p = d.split('/');
  if (p.length !== 3) return null;
  const ys = p[2].trim();
  if (!ys || ys.toLowerCase().includes('x')) return null;
  const yr = parseInt(ys);
  if (isNaN(yr)) return null;
  const mo = p[1].toLowerCase().includes('x') ? 6  : clamp(parseInt(p[1]) || 6,  1, 12);
  const da = p[0].toLowerCase().includes('x') ? 15 : clamp(parseInt(p[0]) || 15, 1, 31);
  let dec = yr + (mo - 1) / 12 + (da - 1) / 365;
  if (time) {
    const tp = time.split(':');
    const h = parseInt(tp[0]) || 0;
    const m = parseInt(tp[1]) || 0;
    dec += (h + m / 60) / 8760;
  }
  return dec;
}

function parseDateParts(d) {
  if (!d) return null;
  const p = d.split('/');
  if (p.length !== 3) return null;
  const ys = p[2].trim();
  if (!ys || ys.toLowerCase().includes('x')) return null;
  const year = parseInt(ys);
  if (isNaN(year)) return null;
  const month = p[1].toLowerCase().includes('x') ? 6 : clamp(parseInt(p[1]) || 6, 1, 12);
  const day = p[0].toLowerCase().includes('x') ? 15 : clamp(parseInt(p[0]) || 15, 1, 31);
  return { day, month, year };
}

function formatDateParts(parts) {
  const dd = String(parts.day).padStart(2, '0');
  const mm = String(parts.month).padStart(2, '0');
  return dd + '/' + mm + '/' + parts.year;
}

function addRecurrenceStep(parts, freq) {
  if (freq === 'weekly') {
    const dt = new Date(Date.UTC(2000, 0, 1));
    dt.setUTCFullYear(parts.year, parts.month - 1, parts.day);
    dt.setUTCDate(dt.getUTCDate() + 7);
    return { day: dt.getUTCDate(), month: dt.getUTCMonth() + 1, year: dt.getUTCFullYear() };
  }
  if (freq === 'monthly') {
    const monthIndex = parts.month;
    const nextYear = parts.year + Math.floor(monthIndex / 12);
    const nextMonth = (monthIndex % 12) + 1;
    return { day: Math.min(parts.day, 28), month: nextMonth, year: nextYear };
  }
  if (freq === 'yearly') {
    return { day: parts.day, month: parts.month, year: parts.year + 1 };
  }
  /* A-9: century-based recurrence (ported from Universe). */
  if (freq === 'century') {
    return { day: parts.day, month: parts.month, year: parts.year + 100 };
  }
  return null;
}

function expandRecurringEvents() {
  const phantoms = [];
  const LIMIT = 500;
  const maxYear = new Date().getFullYear() + 2;
  S.events.forEach(function(ev) {
    if (!ev.recurring || !ev.recurring.frequency) return;
    let cur = parseDateParts(ev.date);
    if (!cur) return;
    const freq = ev.recurring.frequency;
    cur = addRecurrenceStep(cur, freq);
    while (cur && phantoms.length < LIMIT && cur.year <= maxYear) {
      const date = formatDateParts(cur);
      phantoms.push(Object.assign({}, ev, {
        id: ev.id + '_p_' + date,
        date,
        isPhantom: true,
        parentId: ev.id,
        subEvents: [],
        media: []
      }));
      cur = addRecurrenceStep(cur, freq);
    }
  });
  return phantoms;
}

/* =====================================================
   COORDINATE TRANSFORMS
   ===================================================== */
const CV  = () => document.getElementById('tl-canvas');
const CTX = () => CV().getContext('2d');

/* =====================================================
   ORIENTATION MODE SWITCH (Phase 2)
   -----------------------------------------------------
   Single source of truth for the timeline's layout
   orientation. All future mobile-only logic must be
   gated behind `ORIENTATION === 'vertical'`.

   - 'horizontal'  -> desktop (time = X axis, universes stacked as rows)
   - 'vertical'    -> mobile  (time = Y axis, universes laid out as columns)

   `isVerticalTimelineLayout()` is kept as a backward-
   compatible alias so existing call sites (drag, draw,
   touch, hit-test, clamp) keep working unchanged.
   ===================================================== */
const _orientationMQ =
  window.matchMedia('(max-width: 820px) and (pointer: coarse)');

function _detectIsMobile() { return _orientationMQ.matches; }
let isMobile = _detectIsMobile();
let ORIENTATION = isMobile ? 'vertical' : 'horizontal';

function setOrientation(o) {
  if (o !== 'horizontal' && o !== 'vertical') return;
  if (o === ORIENTATION) return;
  ORIENTATION = o;
  isMobile = (o === 'vertical');
  /* Re-measure the canvas (DPR + new plot area) and repaint.
     `_tlResize` is exposed by initCanvas() once it runs;
     fall back to render() before that. */
  if (typeof window._tlResize === 'function') window._tlResize();
  else if (typeof render === 'function') render();
}

function _reevaluateOrientation() {
  setOrientation(_detectIsMobile() ? 'vertical' : 'horizontal');
}

/* Listen for layout-mode flips (rotation, browser resize,
   plugging in a mouse on a hybrid device, etc.). */
if (typeof _orientationMQ.addEventListener === 'function') {
  _orientationMQ.addEventListener('change', _reevaluateOrientation);
} else if (typeof _orientationMQ.addListener === 'function') {
  /* Safari < 14 */
  _orientationMQ.addListener(_reevaluateOrientation);
}
window.addEventListener('resize', _reevaluateOrientation);
window.addEventListener('orientationchange', _reevaluateOrientation);

function isVerticalTimelineLayout() {
  return ORIENTATION === 'vertical';
}

function timeAxisStart() { return isVerticalTimelineLayout() ? RULER_H : LEFT_W; }
function trackAxisStart() { return isVerticalTimelineLayout() ? LEFT_W : RULER_H; }
function timeAxisLength() {
  const c = CV();
  return Math.max(0, isVerticalTimelineLayout() ? c.height - RULER_H : c.width - LEFT_W);
}
function trackAxisLength() {
  const c = CV();
  return Math.max(0, isVerticalTimelineLayout() ? c.width - LEFT_W : c.height - RULER_H);
}

// Center of the timeline scroll axis
function centerX() { return timeAxisStart() + timeAxisLength() / 2; }

// Year (decimal) -> world X
function yw(yr) { return (yr - OY) * BPPY; }
// World X -> screen X
function ws(wx) { return wx * V.scale + centerX() + V.panX; }
// Screen X -> world X
function sw(sx) { return (sx - centerX() - V.panX) / V.scale; }
// Screen X -> decimal year
function sy2yr(sx) { return OY + sw(sx) / BPPY; }

/* =====================================================
   AXIS MAPPING ABSTRACTION (Phase 3.1)
   -----------------------------------------------------
   The timeline has two logical axes:
     - MAIN  axis = the time axis the user scrolls along
     - CROSS axis = the universe / life-track lane axis

   On desktop  (ORIENTATION === 'horizontal'):
     MAIN  = X (left -> right, time)
     CROSS = Y (top  -> bottom, one ROW per universe)
   On mobile   (ORIENTATION === 'vertical'):
     MAIN  = Y (top  -> bottom, time, Instagram-style scroll)
     CROSS = X (left -> right, one COLUMN per universe)

   Every site that needs a screen coordinate for an event
   or a track lane goes through these two helpers.
   ===================================================== */

// MAIN axis: decimal year -> screen pixel along the time axis
function timeToMain(decYear) { return ws(yw(decYear)); }

// CROSS axis: visible-track index -> screen pixel along the lane axis
function universeToCross(vIdx) {
  return trackAxisStart() + vIdx * TRACK_H + TRACK_H / 2 + V.panY;
}

// Backward-compatible alias used throughout the renderer.
function trackY(vIdx) { return universeToCross(vIdx); }

// Composite screen coordinates for an event (delegates to the two helpers).
function eventScreenX(decYear, vIdx) {
  return isVerticalTimelineLayout() ? universeToCross(vIdx) : timeToMain(decYear);
}
function eventScreenY(decYear, vIdx) {
  return isVerticalTimelineLayout() ? timeToMain(decYear) : universeToCross(vIdx);
}

// Pointer/touch coordinate projected onto the MAIN / CROSS axis.
function primaryScreenCoord(mx, my) { return isVerticalTimelineLayout() ? my : mx; }
function crossScreenCoord(mx, my)   { return isVerticalTimelineLayout() ? mx : my; }
function isInPlotArea(mx, my) {
  return isVerticalTimelineLayout()
    ? (mx >= RULER_H && my >= LEFT_W)
    : (mx >= LEFT_W && my >= RULER_H);
}

/* =====================================================
   UNIVERSE PILL BAR (Phase 3.2) — mobile only
   -----------------------------------------------------
   Renders a sticky top bar inside #canvas-wrap that lists
   every visible universe as a horizontally-scrollable
   pill. Tapping a pill scrolls the canvas so that
   universe's COLUMN is centered on screen. Whichever
   column is currently centered is highlighted as active.
   On desktop the bar is hidden and the original left-side
   universe labels remain in charge.
   ===================================================== */
(function setupUniversePillBar() {
  function tracksArr() {
    if (typeof S === 'undefined' || !S) return [];
    return S.lifeTracks || S.universes || [];
  }
  function visibleTracks() { return tracksArr().filter(u => u.visible !== false); }
  function escapeHTML(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* One-time stylesheet injection (mobile-only via media query). */
  function injectStyles() {
    if (document.getElementById('upb-styles')) return;
    const s = document.createElement('style');
    s.id = 'upb-styles';
    s.textContent = [
      '#universe-pill-bar { display: none; }',
      '@media (max-width: 820px) and (pointer: coarse) {',
      '  #universe-pill-bar {',
      '    display: flex; gap: 6px;',
      '    position: absolute; top: 0; left: 0; right: 0;',
      '    z-index: 7; padding: 8px 10px;',
      '    background: linear-gradient(180deg, rgba(28,16,8,0.96) 0%, rgba(28,16,8,0.78) 80%, rgba(28,16,8,0) 100%);',
      '    overflow-x: auto; overflow-y: hidden;',
      '    scroll-snap-type: x mandatory;',
      '    -webkit-overflow-scrolling: touch;',
      '    scrollbar-width: none;',
      '    padding-top: calc(8px + env(safe-area-inset-top, 0px));',
      '  }',
      '  #universe-pill-bar::-webkit-scrollbar { display: none; }',
      '  .upb-pill {',
      '    flex: 0 0 auto; scroll-snap-align: center;',
      '    display: inline-flex; align-items: center; gap: 7px;',
      '    padding: 7px 14px; border-radius: 999px;',
      '    background: rgba(255,255,255,0.08);',
      '    color: #d8c8b0; font: 600 12.5px/1 inherit;',
      '    border: 1px solid rgba(255,255,255,0.16);',
      '    cursor: pointer; opacity: 0.6;',
      '    transition: opacity .18s, background .18s, border-color .18s, transform .12s;',
      '    white-space: nowrap; max-width: 50vw;',
      '    min-height: 36px;',
      '  }',
      '  .upb-pill:active { transform: scale(0.96); }',
      '  .upb-pill.is-active {',
      '    opacity: 1; font-weight: 700;',
      '    background: rgba(255,255,255,0.16);',
      '    border-color: rgba(255,255,255,0.34);',
      '    text-decoration: underline; text-underline-offset: 4px;',
      '  }',
      '  .upb-dot {',
      '    width: 10px; height: 10px; border-radius: 50%;',
      '    box-shadow: 0 0 0 1px rgba(0,0,0,0.25) inset;',
      '    flex-shrink: 0;',
      '  }',
      '  .upb-name {',
      '    overflow: hidden; text-overflow: ellipsis; max-width: 40vw;',
      '  }',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function ensureBar() {
    let bar = document.getElementById('universe-pill-bar');
    if (bar) return bar;
    const wrap = document.getElementById('canvas-wrap');
    if (!wrap) return null;
    bar = document.createElement('div');
    bar.id = 'universe-pill-bar';
    bar.setAttribute('role', 'tablist');
    bar.setAttribute('aria-label', 'Universe selector');
    /* Insert as the first child so it overlays the top of the canvas. */
    wrap.insertBefore(bar, wrap.firstChild);
    return bar;
  }

  function currentCenteredVIdx() {
    if (!isVerticalTimelineLayout()) return -1;
    const c = CV(); if (!c || !c.width) return -1;
    const vis = visibleTracks();
    if (vis.length === 0) return -1;
    const centerCross = c.width / 2;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < vis.length; i++) {
      const x = universeToCross(i);
      const d = Math.abs(x - centerCross);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function renderPillBar() {
    const bar = ensureBar(); if (!bar) return;
    if (!isVerticalTimelineLayout()) {
      if (bar.style.display !== 'none') {
        bar.style.display = 'none'; bar.innerHTML = ''; bar._sig = '';
      }
      return;
    }
    bar.style.display = '';
    const vis = visibleTracks();
    const sig = vis.map(u => u.id + '|' + (u.name||'') + '|' + (u.color||'')).join('§');
    if (bar._sig !== sig) {
      bar._sig = sig;
      bar._lastActive = -1;
      bar.innerHTML = vis.map((u, i) =>
        '<button type="button" class="upb-pill" role="tab" data-uid="' +
        escapeHTML(u.id) + '" data-vidx="' + i + '" aria-selected="false">' +
          '<span class="upb-dot" style="background:' + escapeHTML(u.color || '#888') + '"></span>' +
          '<span class="upb-name">' + escapeHTML(u.name || 'Untitled') + '</span>' +
        '</button>'
      ).join('');
      bar.querySelectorAll('.upb-pill').forEach(btn => {
        btn.addEventListener('click', () => {
          const uid = btn.getAttribute('data-uid');
          centerUniverseColumn(uid, true);
        });
      });
    }
    /* Active highlight — driven by S.activeUniverseId (source of truth on
       mobile). Falls back to the geometrically centered column when the
       state hasn't been seeded yet. */
    let activeIdx = -1;
    if (typeof S === 'object' && S && S.activeUniverseId) {
      activeIdx = vis.findIndex(u => u.id === S.activeUniverseId);
    }
    if (activeIdx < 0) {
      activeIdx = currentCenteredVIdx();
      if (activeIdx >= 0 && S) S.activeUniverseId = vis[activeIdx].id;
    }
    const pills = bar.querySelectorAll('.upb-pill');
    pills.forEach((btn, i) => {
      const isActive = (i === activeIdx);
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    if (activeIdx >= 0 && activeIdx !== bar._lastActive) {
      bar._lastActive = activeIdx;
      const btn = pills[activeIdx];
      if (btn) {
        const target = btn.offsetLeft - bar.clientWidth / 2 + btn.clientWidth / 2;
        const reduce = window.matchMedia &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        bar.scrollTo({ left: Math.max(0, target), behavior: reduce ? 'auto' : 'smooth' });
      }
    }
  }

  /* Per-universe time-axis scroll memory. Mobile-only: we save V.panX
     (the primary/time-axis pan in vertical layout) when leaving a
     universe column and restore it when returning, so the user lands
     back on the same point in time they left. */
  const _timeScrollByUniverse = Object.create(null);
  function _saveTimeScrollFor(uid) {
    if (!uid || typeof V !== 'object' || !V) return;
    _timeScrollByUniverse[uid] = V.panX;
  }
  function _restoreTimeScrollFor(uid) {
    if (!uid || typeof V !== 'object' || !V) return false;
    if (!Object.prototype.hasOwnProperty.call(_timeScrollByUniverse, uid)) return false;
    V.panX = _timeScrollByUniverse[uid];
    if (typeof clampPanX === 'function') clampPanX();
    return true;
  }

  function centerUniverseColumn(uId, animated) {
    const vis = visibleTracks();
    const i = vis.findIndex(u => u.id === uId);
    if (i < 0) return;

    const verticalMode = isVerticalTimelineLayout();

    /* Update the source of truth + per-universe time-scroll memory.
       On desktop the state is recorded but never affects rendering. */
    if (verticalMode && typeof S === 'object' && S
        && S.activeUniverseId && S.activeUniverseId !== uId) {
      _saveTimeScrollFor(S.activeUniverseId);
    }
    if (typeof S === 'object' && S) S.activeUniverseId = uId;

    if (!verticalMode) return; /* desktop: no visual change */

    _restoreTimeScrollFor(uId);

    const c = CV(); if (!c || !c.width) { renderPillBar(); return; }
    const targetPanY = c.width / 2 - trackAxisStart() - i * TRACK_H - TRACK_H / 2;
    const reduce = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!animated || reduce) {
      V.panY = targetPanY;
      if (typeof clampPanY === 'function') clampPanY();
      if (typeof render === 'function') render();
      renderPillBar();
      return;
    }
    const startPan = V.panY;
    const t0 = performance.now();
    const dur = 300; /* 300ms ease-out per spec */
    (function step(now) {
      const t = Math.min(1, ((now || performance.now()) - t0) / dur);
      const e = 1 - Math.pow(1 - t, 3); /* ease-out cubic */
      V.panY = startPan + (targetPanY - startPan) * e;
      if (typeof clampPanY === 'function') clampPanY();
      if (typeof render === 'function') render();
      if (t < 1) requestAnimationFrame(step);
      else renderPillBar();
    })(t0);
  }
  window.centerUniverseColumn = centerUniverseColumn;
  window._renderUniversePillBar = renderPillBar;

  /* Lightweight rAF watcher: keeps active highlight in sync as the user
     pans/swipes between universe columns, without monkey-patching render(). */
  let lastPanY = NaN, lastVisCount = -1, lastOrient = '';
  (function tick() {
    const orient = ORIENTATION;
    const panY = V ? V.panY : 0;
    const vc = visibleTracks().length;
    if (orient !== lastOrient || panY !== lastPanY || vc !== lastVisCount) {
      lastOrient = orient; lastPanY = panY; lastVisCount = vc;
      try { renderPillBar(); } catch (_) {}
    }
    requestAnimationFrame(tick);
  })();

  function init() {
    injectStyles();
    ensureBar();
    renderPillBar();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  window.addEventListener('resize', renderPillBar);
  window.addEventListener('orientationchange', renderPillBar);
})();

/* ============================================================
   MOBILE UNIVERSE FEED — Instagram-style vertical card list.
   Replaces the rotated-canvas event rendering for the active
   universe column on mobile (vertical layout). Desktop and
   horizontal layout are completely unaffected; this overlay
   stays display:none unless mobile + vertical timeline.
   ============================================================ */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  const FEED_ID = 'mob-uni-feed';
  const _scrollByUniverse = Object.create(null);

  function escapeHTML(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function injectStyles() {
    if (document.getElementById('muf-styles')) return;
    const s = document.createElement('style');
    s.id = 'muf-styles';
    s.textContent = [
      '#mob-uni-feed { display: none; }',
      '@media (max-width: 820px) and (pointer: coarse) {',
      '  #mob-uni-feed {',
      '    position: absolute; left: 0; right: 0; top: 0; bottom: 0;',
      '    z-index: 5; background: #f5efe6;',
      '    overflow-y: auto; overflow-x: hidden;',
      '    -webkit-overflow-scrolling: touch; touch-action: pan-y;',
      '    padding: calc(60px + env(safe-area-inset-top, 0px)) 0 24px;',
      '    box-sizing: border-box;',
      '  }',
      '  #mob-uni-feed.is-empty { display: flex; align-items: center; justify-content: center; }',
      '  .muf-empty { color: #9a8570; font: 500 14px/1.4 inherit; text-align: center; padding: 40px 24px; }',
      '  .muf-stack { display: flex; flex-direction: column; gap: 14px; padding: 0 8px; }',
      '  .muf-row { display: flex; gap: 10px; padding: 0 8px; align-items: stretch; }',
      '  .muf-rail {',
      '    flex: 0 0 56px; min-width: 56px; padding-top: 10px; position: relative;',
      '    display: flex; flex-direction: column; align-items: center;',
      '    color: #9a8570; font: 600 11px/1.2 inherit; text-align: center;',
      '  }',
      '  .muf-rail::before {',
      '    content: ""; position: absolute; top: 0; bottom: 0;',
      '    left: 50%; width: 2px; transform: translateX(-50%);',
      '    background: rgba(176,121,66,0.22);',
      '  }',
      '  .muf-rail-dot {',
      '    width: 10px; height: 10px; border-radius: 50%;',
      '    background: var(--muf-accent, #b07942); position: relative; z-index: 1;',
      '    box-shadow: 0 0 0 3px #f5efe6;',
      '  }',
      '  .muf-rail-date { margin-top: 6px; position: relative; z-index: 1; background: #f5efe6; padding: 2px 0; }',
      '  .muf-card {',
      '    flex: 1 1 auto; min-width: 0;',
      '    background: linear-gradient(180deg, rgba(255,253,248,0.97), rgba(250,244,233,0.97));',
      '    border: 1px solid rgba(176,121,66,0.22);',
      '    border-left: 3px solid var(--muf-accent, #b07942);',
      '    border-radius: 14px; padding: 12px 14px; color: #3a2415;',
      '    cursor: pointer; transition: transform .12s, background .18s, border-color .18s;',
      '    display: flex; flex-direction: column; gap: 8px;',
      '  }',
      '  .muf-card:active { transform: scale(0.985); background: #f3ead9; }',
      '  .muf-card-head { display: flex; align-items: flex-start; gap: 10px; justify-content: space-between; }',
      '  .muf-card-title {',
      '    font: 700 15px/1.3 inherit; color: #2d1a0e;',
      '    overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;',
      '    word-break: break-word; flex: 1 1 auto; min-width: 0;',
      '  }',
      '  .muf-card-date {',
      '    flex: 0 0 auto; font: 600 11px/1 inherit; color: #8b6a47;',
      '    background: rgba(176,121,66,0.12); border: 1px solid rgba(176,121,66,0.3);',
      '    padding: 4px 8px; border-radius: 999px; white-space: nowrap;',
      '  }',
      '  .muf-card-desc {',
      '    font: 400 13px/1.45 inherit; color: #6b5640;',
      '    overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;',
      '    word-break: break-word;',
      '  }',
      '  .muf-card-thumb {',
      '    width: 100%; max-height: 180px; object-fit: cover; border-radius: 10px;',
      '    background: rgba(120,80,40,0.12);',
      '  }',
      '  .muf-card-meta {',
      '    display: flex; gap: 10px; align-items: center; flex-wrap: wrap;',
      '    font: 500 11px/1 inherit; color: #9a8570;',
      '  }',
      '  .muf-sub-list {',
      '    display: flex; flex-direction: column; gap: 8px; margin-top: 4px;',
      '    padding-left: 14px; border-left: 2px dashed rgba(176,121,66,0.3);',
      '  }',
      '  .muf-sub-card {',
      '    background: rgba(176,121,66,0.06);',
      '    border: 1px solid rgba(176,121,66,0.2);',
      '    border-radius: 10px; padding: 8px 10px;',
      '    font: 600 12.5px/1.3 inherit; color: #4a3422;',
      '    display: flex; gap: 8px; align-items: center; justify-content: space-between;',
      '    cursor: pointer; transition: background .18s, transform .12s;',
      '  }',
      '  .muf-sub-card:active { transform: scale(0.985); background: #f0e6d3; }',
      '  .muf-sub-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1 1 auto; }',
      '  .muf-sub-date {',
      '    flex: 0 0 auto; color: #8b6a47; font: 500 10.5px/1 inherit;',
      '    background: rgba(176,121,66,0.12); padding: 3px 7px; border-radius: 999px;',
      '  }',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function ensureFeed() {
    let feed = document.getElementById(FEED_ID);
    if (feed) return feed;
    const wrap = document.getElementById('canvas-wrap');
    if (!wrap) return null;
    feed = document.createElement('div');
    feed.id = FEED_ID;
    feed.setAttribute('role', 'region');
    feed.setAttribute('aria-label', 'Universe events feed');
    const pill = document.getElementById('universe-pill-bar');
    if (pill && pill.nextSibling) wrap.insertBefore(feed, pill.nextSibling);
    else wrap.appendChild(feed);
    feed.addEventListener('scroll', function () {
      const uid = (typeof S === 'object' && S) ? S.activeUniverseId : null;
      if (uid) _scrollByUniverse[uid] = feed.scrollTop;
    }, { passive: true });
    return feed;
  }

  function isVertical() {
    return typeof isVerticalTimelineLayout === 'function' && isVerticalTimelineLayout();
  }

  function visibleUniverses() {
    if (typeof S !== 'object' || !S) return [];
    const arr = (S.universes || S.lifeTracks || []);
    return arr.filter(u => u.visible !== false);
  }

  function activeUniverse() {
    if (typeof S !== 'object' || !S) return null;
    const arr = (S.universes || S.lifeTracks || []);
    if (S.activeUniverseId) {
      const u = arr.find(x => x.id === S.activeUniverseId);
      if (u) return u;
    }
    return arr.find(x => x.visible !== false) || null;
  }

  function eventDateMs(ev) {
    if (typeof parseDate === 'function') {
      const v = parseDate(ev.date, ev.time);
      if (typeof v === 'number') return v;
    }
    return 0;
  }

  function firstImage(ev) {
    if (!ev || !Array.isArray(ev.media)) return null;
    for (const m of ev.media) {
      if (m && m.type === 'image' && m.src) return m;
    }
    return null;
  }

  function shortDesc(ev) {
    const raw = ((ev && (ev.description || ev.notes)) || '').trim();
    if (!raw) return '';
    return raw.length > 180 ? raw.slice(0, 177) + '\u2026' : raw;
  }

  function cardHTML(ev, accent) {
    const img = firstImage(ev);
    const desc = shortDesc(ev);
    const subCount = (ev.subEvents && ev.subEvents.length) || 0;
    return (
      '<div class="muf-card" data-evid="' + escapeHTML(ev.id) + '" ' +
        'style="--muf-accent:' + escapeHTML(accent || '#4a8fde') + '" ' +
        'role="button" tabindex="0" aria-label="' + escapeHTML(ev.title || 'Untitled event') + '">' +
        '<div class="muf-card-head">' +
          '<div class="muf-card-title">' + escapeHTML(ev.title || 'Untitled event') + '</div>' +
          '<div class="muf-card-date">' + escapeHTML(ev.date || '\u2014') +
            (ev.time ? ' \u00b7 ' + escapeHTML(ev.time) : '') +
          '</div>' +
        '</div>' +
        (img ? '<img class="muf-card-thumb" src="' + escapeHTML(img.src) + '" alt="" loading="lazy">' : '') +
        (desc ? '<div class="muf-card-desc">' + escapeHTML(desc) + '</div>' : '') +
        (subCount > 0
          ? '<div class="muf-card-meta"><span>\u21b3 ' + subCount + ' sub-event' + (subCount !== 1 ? 's' : '') + '</span></div>'
          : '') +
      '</div>'
    );
  }

  function subListHTML(parent) {
    const subs = parent.subEvents || [];
    if (!subs.length) return '';
    return '<div class="muf-sub-list">' +
      subs.map((se, i) => (
        '<div class="muf-sub-card" data-parent-evid="' + escapeHTML(parent.id) +
          '" data-sub-idx="' + i + '" role="button" tabindex="0">' +
          '<span class="muf-sub-title">' + escapeHTML(se.title || 'Untitled sub-event') + '</span>' +
          '<span class="muf-sub-date">' + escapeHTML(se.date || '\u2014') + '</span>' +
        '</div>'
      )).join('') +
    '</div>';
  }

  function rowHTML(ev, accent) {
    const dateText = ev.date ? escapeHTML(ev.date) : '\u2014';
    return (
      '<div class="muf-row">' +
        '<div class="muf-rail" style="--muf-accent:' + escapeHTML(accent || '#4a8fde') + '">' +
          '<div class="muf-rail-dot"></div>' +
          '<div class="muf-rail-date">' + dateText + '</div>' +
        '</div>' +
        '<div style="flex:1 1 auto; min-width:0; display:flex; flex-direction:column; gap:8px;">' +
          cardHTML(ev, accent) +
          subListHTML(ev) +
        '</div>' +
      '</div>'
    );
  }

  let _lastSig = '', _lastUid = '';

  function render() {
    const feed = ensureFeed(); if (!feed) return;
    if (!isVertical()) {
      if (feed.style.display !== 'none') {
        feed.style.display = 'none';
        feed.innerHTML = '';
        _lastSig = ''; _lastUid = '';
      }
      return;
    }
    feed.style.display = '';
    const u = activeUniverse();
    if (!u) {
      if (_lastSig !== '\u2205') {
        feed.classList.add('is-empty');
        feed.innerHTML = '<div class="muf-empty">No universe selected.</div>';
        _lastSig = '\u2205'; _lastUid = '';
      }
      return;
    }
    const accent = u.color || '#4a8fde';
    const evs = ((typeof S === 'object' && S && S.events) ? S.events : [])
      .filter(e => e.universeId === u.id);
    evs.sort((a, b) => (eventDateMs(a) || 0) - (eventDateMs(b) || 0));
    const sig = u.id + '|' + accent + '|' + evs.length + '|' +
      evs.map(e => e.id + ':' + (e.title||'') + ':' + (e.date||'') + ':' +
        ((e.subEvents||[]).length) + ':' + ((e.media||[]).length)).join('\u00a7');
    if (sig === _lastSig) return;
    _lastSig = sig;
    if (evs.length === 0) {
      feed.classList.add('is-empty');
      feed.innerHTML = '<div class="muf-empty">No events yet in <strong>' +
        escapeHTML(u.name || 'this universe') + '</strong>.<br>Long-press the timeline to add one.</div>';
    } else {
      feed.classList.remove('is-empty');
      feed.innerHTML = '<div class="muf-stack">' +
        evs.map(e => rowHTML(e, accent)).join('') +
      '</div>';
    }
    if (_lastUid !== u.id) {
      _lastUid = u.id;
      const sv = _scrollByUniverse[u.id];
      feed.scrollTop = (typeof sv === 'number') ? sv : 0;
    }
  }

  function bindTaps() {
    const feed = ensureFeed(); if (!feed || feed._mufBound) return;
    feed._mufBound = true;
    feed.addEventListener('click', function (e) {
      const sub = e.target.closest && e.target.closest('.muf-sub-card');
      if (sub) {
        const pid = sub.getAttribute('data-parent-evid');
        const sidx = parseInt(sub.getAttribute('data-sub-idx'), 10);
        if (pid && isFinite(sidx) && typeof M === 'object' && M && typeof M.push === 'function') {
          // Open the tapped SUB-event (mirroring the desktop seDetail drill-in),
          // not its parent — sub-events were previously unreachable here. (Fix BE-7)
          M.push({ t: 'seDetail', evId: pid, path: [sidx] });
        } else if (pid && typeof M === 'object' && M && typeof M.openEvDetail === 'function') {
          M.openEvDetail(pid); // fallback to parent if the sub index is missing
        }
        e.stopPropagation();
        return;
      }
      const card = e.target.closest && e.target.closest('.muf-card');
      if (card) {
        const id = card.getAttribute('data-evid');
        if (id && typeof M === 'object' && M && typeof M.openEvDetail === 'function') {
          M.openEvDetail(id);
        }
      }
    });
    feed.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const target = e.target.closest && (e.target.closest('.muf-sub-card') || e.target.closest('.muf-card'));
      if (target) { e.preventDefault(); target.click(); }
    });
  }

  function bindSwipe() {
    const feed = ensureFeed(); if (!feed || feed._mufSwipe) return;
    feed._mufSwipe = true;
    let sx = 0, sy = 0, st = 0, locked = '', activePid = -1;
    const LOCK = 10, COMMIT_RATIO = 0.35, COMMIT_VEL = 0.4;
    feed.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'touch') return;
      sx = e.clientX; sy = e.clientY;
      st = e.timeStamp || performance.now();
      locked = ''; activePid = e.pointerId;
    }, { passive: true });
    feed.addEventListener('pointermove', function (e) {
      if (e.pointerId !== activePid || e.pointerType !== 'touch') return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!locked) {
        if (Math.abs(dx) > LOCK && Math.abs(dx) > Math.abs(dy) * 1.2) {
          locked = 'x';
          try { feed.setPointerCapture(e.pointerId); } catch (_) {}
        } else if (Math.abs(dy) > LOCK) {
          locked = 'y';
        }
      }
      if (locked === 'x' && e.cancelable) e.preventDefault();
    }, { passive: false });
    function endHandler(e) {
      if (e.pointerId !== activePid) return;
      activePid = -1;
      if (locked !== 'x') return;
      const dx = e.clientX - sx;
      const dt = Math.max(1, (e.timeStamp || performance.now()) - st);
      const vel = Math.abs(dx) / dt;
      const w = feed.clientWidth || 1;
      const commit = Math.abs(dx) > w * COMMIT_RATIO || vel > COMMIT_VEL;
      if (!commit) return;
      const dir = dx < 0 ? 1 : -1;
      const vis = visibleUniverses();
      if (!vis.length) return;
      const cur = (typeof S === 'object' && S && S.activeUniverseId) ? S.activeUniverseId : vis[0].id;
      let idx = vis.findIndex(u => u.id === cur);
      if (idx < 0) idx = 0;
      const next = vis[Math.max(0, Math.min(vis.length - 1, idx + dir))];
      if (next && next.id !== cur && typeof window.centerUniverseColumn === 'function') {
        window.centerUniverseColumn(next.id, true);
      }
    }
    feed.addEventListener('pointerup', endHandler);
    feed.addEventListener('pointercancel', endHandler);
  }

  let lastOrient = '', lastActive = '', lastEvLen = -1, lastUniLen = -1;
  (function tick() {
    try {
      const orient = (typeof ORIENTATION !== 'undefined') ? ORIENTATION : '';
      const active = (typeof S === 'object' && S) ? (S.activeUniverseId || '') : '';
      const evLen = (typeof S === 'object' && S && S.events) ? S.events.length : -1;
      const uniLen = visibleUniverses().length;
      if (orient !== lastOrient || active !== lastActive || evLen !== lastEvLen || uniLen !== lastUniLen) {
        lastOrient = orient; lastActive = active; lastEvLen = evLen; lastUniLen = uniLen;
        render();
      } else if (orient === 'vertical') {
        render();
      }
    } catch (_) {}
    requestAnimationFrame(tick);
  })();

  function init() {
    injectStyles();
    ensureFeed();
    bindTaps();
    bindSwipe();
    render();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  window.addEventListener('resize', render);
  window.addEventListener('orientationchange', render);
  window._renderMobileUniverseFeed = render;
})();

// Clamp vertical pan so tracks stay reachable
function clampPanY() {
  /* Vertical (mobile) mode: V.panY drives the CROSS axis (universe columns).
     Allow the cross-pan to range so that the FIRST and LAST columns can be
     centered on screen — otherwise tap-to-center on edge universes would be
     pinned by the desktop clamp. */
  if (isVerticalTimelineLayout()) {
    const c = CV(); if (!c || !c.width) return;
    const total = visCount();
    if (total === 0) { V.panY = 0; return; }
    const centerCross  = c.width / 2;
    const firstCenterPY = centerCross - trackAxisStart() - TRACK_H / 2;
    const lastCenterPY  = centerCross - trackAxisStart() - (total - 1) * TRACK_H - TRACK_H / 2;
    const lo = Math.min(firstCenterPY, lastCenterPY);
    const hi = Math.max(firstCenterPY, lastCenterPY);
    V.panY = clamp(V.panY, lo, hi);
    return;
  }
  /* Horizontal (desktop) mode — original behavior preserved. */
  const total = visCount() * TRACK_H;
  const minPY = Math.min(0, trackAxisLength() - total - 24);
  V.panY = clamp(V.panY, minPY, 0);
}

function clampPanX() {
  const c = CV();
  if (!c || !c.width) return;
  const wxMin = (YEAR_MIN - OY) * BPPY;
  const wxMax = (YEAR_MAX - OY) * BPPY;
  const sxMinDesired = timeAxisStart();
  const sxMaxDesired = isVerticalTimelineLayout() ? c.height : c.width;
  const maxPanX = sxMinDesired - centerX() - wxMin * V.scale;
  const minPanX = sxMaxDesired - centerX() - wxMax * V.scale;
  if (maxPanX >= minPanX) V.panX = clamp(V.panX, minPanX, maxPanX);
}

/* =====================================================
   RENDER ENGINE
   ===================================================== */
/* === TIMELINE ENGINE RENDER START === */
function render() {
  const c = CV(), g = CTX();
  if (!c || !g) return;
  hits = [];

  const W = c.width, H = c.height;
  g.clearRect(0, 0, W, H);

  // --- background ---
  g.fillStyle = '#f8f9fa';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#ffffff';
  if (isVerticalTimelineLayout()) g.fillRect(RULER_H, LEFT_W, W - RULER_H, H - LEFT_W);
  else g.fillRect(LEFT_W, 0, W - LEFT_W, H);

  // --- clip to content zone (excludes sticky header panels) ---
  g.save();
  g.beginPath();
  if (isVerticalTimelineLayout()) g.rect(RULER_H, LEFT_W, W - RULER_H, H - LEFT_W);
  else g.rect(LEFT_W, RULER_H, W - LEFT_W, H - RULER_H);
  g.clip();
  drawTracks(c, g);
  drawConnections(c, g);
  if (typeof _storyLineVisible !== 'undefined' && _storyLineVisible) drawStoryLine(c, g);
  drawEvents(c, g);
  g.restore();

  // --- sticky track headers (on top of events, unclipped) ---
  drawTrackHeaders(c, g);

  // --- ruler drawn on top (unclipped) ---
  drawRuler(c, g);
}

/* ---- TIME RULER ---- */
function drawRuler(c, g) {
  if (isVerticalTimelineLayout()) {
    drawRulerVertical(c, g);
    return;
  }
  const W = c.width;

  // Ruler bar — warm parchment gradient
  const rulerGrad = g.createLinearGradient(0, 0, 0, RULER_H);
  rulerGrad.addColorStop(0, '#f0ede7');
  rulerGrad.addColorStop(1, '#f6f3ee');
  g.fillStyle = rulerGrad;
  g.fillRect(LEFT_W, 0, W - LEFT_W, RULER_H);
  g.strokeStyle = '#ccc0ae'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(LEFT_W, RULER_H); g.lineTo(W, RULER_H); g.stroke();

  const pxPerYr = BPPY * V.scale;
  const pxPerDay = pxPerYr / 365.25;
  let maj, isMon = false, isDay = false;
  // Spec 2.4.C: pxPerDay breakpoints → tick granularity
  if      (pxPerDay < 0.001) maj = 1000;                   // millennium
  else if (pxPerDay < 0.01)  maj = 100;                    // century
  else if (pxPerDay < 0.1)   maj = 10;                     // decade
  else if (pxPerDay < 1)     maj = 1;                      // year
  else if (pxPerDay < 8)   { maj = 1/12;    isMon = true; } // month
  else                     { maj = 1/365.25; isDay = true; } // day
  const lyear = sy2yr(LEFT_W), ryear = sy2yr(W);
  // Safety: cap major ticks to 200 on huge ranges
  { const visTicks = Math.abs(ryear - lyear) / maj;
    if (isFinite(visTicks) && visTicks > 200) {
      const rawM = Math.abs(ryear - lyear) / 200;
      const p = Math.pow(10, Math.floor(Math.log10(rawM)));
      maj = Math.ceil(rawM / p) * p;
      isMon = false; isDay = false;
    }
  }
  const minor = maj / 5;

  const maxTicks = 600;
  const tickCount = Math.abs(ryear - lyear) / minor;
  const skipMinor = tickCount > maxTicks;

  if (!skipMinor) {
    const ms = Math.floor(lyear / minor) * minor;
    for (let y = ms; y <= ryear + minor; y += minor) {
      const sx = ws(yw(y));
      if (sx < LEFT_W || sx > W) continue;
      g.strokeStyle = 'rgba(215,205,188,0.6)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(sx, RULER_H); g.lineTo(sx, c.height); g.stroke();
      g.strokeStyle = '#c4b89e'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(sx, RULER_H - 6); g.lineTo(sx, RULER_H); g.stroke();
    }
  }

  const majs = Math.floor(lyear / maj) * maj;
  g.font = '11px Georgia, "Cambria", serif';
  g.textAlign = 'center';
  // Spec 2.4.C: measureText collision avoidance — label every Nth tick (min 80px gap)
  { const _midY = (lyear + ryear) / 2;
    const _dSmp = (isMon || isDay) ? decYearToDate(_midY) : null;
    const _sampleLbl = isDay ? '15 Jun 2000'
                     : isMon ? (MONTHS[(_dSmp && _dSmp.m) || 5] + ' 2000')
                     : formatCalendarYear(Math.round(_midY));
    const _lw = g.measureText(_sampleLbl).width;
    const _tickPx = Math.max(1, Math.abs(ws(yw(majs + maj)) - ws(yw(majs))));
    const _labelN = Math.max(1, Math.ceil(Math.max(80, _lw + 8) / _tickPx));
    let _idx = 0;
    for (let y = majs; y <= ryear + maj; y += maj) {
      const sx = ws(yw(y));
      if (sx < LEFT_W - 80 || sx > W + 80) { _idx++; continue; }
      g.strokeStyle = '#a8987e'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(sx, RULER_H - 16); g.lineTo(sx, RULER_H); g.stroke();
      g.strokeStyle = 'rgba(210,200,180,0.5)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(sx, RULER_H); g.lineTo(sx, c.height); g.stroke();
      if (sx > LEFT_W + 4 && _idx % _labelN === 0) {
        let lbl;
        if (isDay) {
          const d = decYearToDate(y);
          lbl = d.d + ' ' + MONTHS[d.m] + ' ' + d.y;
        } else if (isMon) {
          const d = decYearToDate(y);
          lbl = MONTHS[d.m] + ' ' + d.y;
        } else {
          const rv = Math.round(y);
          lbl = formatCalendarYear(rv);
        }
        g.fillStyle = '#7a6250';
        g.fillText(lbl, sx, RULER_H - 20);
      }
      _idx++;
    }
  }

  /* A-13: BC/AD-aware ruler endpoint pills (ported from Universe). */
  drawRangeEndpointLabel(g, YEAR_MIN, LEFT_W + 6, 'left');
  drawRangeEndpointLabel(g, YEAR_MAX, W - 6, 'right');

  // TODAY line — elegant archival marker
  const now = new Date();
  const todayDec = now.getFullYear() + now.getMonth() / 12 + now.getDate() / 365;
  const tx = ws(yw(todayDec));
  if (tx >= LEFT_W && tx <= W) {
    g.save();
    // Warm glow underlay
    g.strokeStyle = 'rgba(175,88,55,0.16)'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(tx, RULER_H); g.lineTo(tx, c.height); g.stroke();
    // Refined dashed line
    g.strokeStyle = '#b86040'; g.lineWidth = 1.5;
    g.setLineDash([5, 4]);
    g.beginPath(); g.moveTo(tx, 0); g.lineTo(tx, c.height); g.stroke();
    g.setLineDash([]);
    // Badge label pill
    const badgeW = 44, badgeH = 16;
    rRect(g, tx - badgeW / 2, 2, badgeW, badgeH, 5);
    g.fillStyle = '#b86040'; g.fill();
    g.fillStyle = '#fff8f0';
    g.font = 'bold 9px Georgia, "Cambria", serif';
    g.textAlign = 'center';
    g.fillText('TODAY', tx, 14);
    // Tick mark at ruler bottom
    g.strokeStyle = '#b86040'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(tx, RULER_H - 10); g.lineTo(tx, RULER_H); g.stroke();
    g.restore();
  }

  // Left panel header (drawn over track area)
  g.fillStyle = '#352218';
  g.fillRect(0, 0, LEFT_W, RULER_H);
  // Warm gradient overlay
  const hdrGrad = g.createLinearGradient(0, 0, LEFT_W, 0);
  hdrGrad.addColorStop(0, 'rgba(160,90,40,0.22)');
  hdrGrad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = hdrGrad;
  g.fillRect(0, 0, LEFT_W, RULER_H);
  g.strokeStyle = 'rgba(240,220,195,0.10)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(LEFT_W, 0); g.lineTo(LEFT_W, RULER_H); g.stroke();
  g.fillStyle = 'rgba(238,218,192,0.80)';
  g.font = 'bold 10px Georgia, "Cambria", serif';
  g.textAlign = 'center';
  g.fillText('LIFE TRACKS', LEFT_W / 2, RULER_H / 2 + 4);
}

function drawRulerVertical(c, g) {
  const W = c.width, H = c.height;

  const rulerGrad = g.createLinearGradient(0, 0, RULER_H, 0);
  rulerGrad.addColorStop(0, '#f0ede7');
  rulerGrad.addColorStop(1, '#f6f3ee');
  g.fillStyle = rulerGrad;
  g.fillRect(0, LEFT_W, RULER_H, H - LEFT_W);
  g.strokeStyle = '#ccc0ae'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(RULER_H, LEFT_W); g.lineTo(RULER_H, H); g.stroke();

  g.fillStyle = '#352218';
  g.fillRect(0, 0, W, LEFT_W);
  const hdrGrad = g.createLinearGradient(0, 0, 0, LEFT_W);
  hdrGrad.addColorStop(0, 'rgba(160,90,40,0.22)');
  hdrGrad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = hdrGrad;
  g.fillRect(0, 0, W, LEFT_W);
  g.strokeStyle = 'rgba(240,220,195,0.10)';
  g.beginPath(); g.moveTo(0, LEFT_W); g.lineTo(W, LEFT_W); g.stroke();

  const pxPerYr = BPPY * V.scale;
  const pxPerDay = pxPerYr / 365.25;
  let maj, isMon = false, isDay = false;
  // Spec 2.4.C: pxPerDay breakpoints → tick granularity
  if      (pxPerDay < 0.001) maj = 1000;
  else if (pxPerDay < 0.01)  maj = 100;
  else if (pxPerDay < 0.1)   maj = 10;
  else if (pxPerDay < 1)     maj = 1;
  else if (pxPerDay < 8)   { maj = 1/12;    isMon = true; }
  else                     { maj = 1/365.25; isDay = true; }
  const topYear = sy2yr(LEFT_W), bottomYear = sy2yr(H);
  // Safety: cap major ticks to 200 on huge ranges
  { const visTicks = Math.abs(bottomYear - topYear) / maj;
    if (isFinite(visTicks) && visTicks > 200) {
      const rawM = Math.abs(bottomYear - topYear) / 200;
      const p = Math.pow(10, Math.floor(Math.log10(rawM)));
      maj = Math.ceil(rawM / p) * p;
      isMon = false; isDay = false;
    }
  }
  const minor = maj / 5;

  const ms = Math.floor(topYear / minor) * minor;
  for (let y = ms; y <= bottomYear + minor; y += minor) {
    const sy = ws(yw(y));
    if (sy < LEFT_W || sy > H) continue;
    g.strokeStyle = 'rgba(215,205,188,0.6)';
    g.beginPath(); g.moveTo(RULER_H, sy); g.lineTo(c.width, sy); g.stroke();
    g.strokeStyle = '#c4b89e';
    g.beginPath(); g.moveTo(RULER_H - 6, sy); g.lineTo(RULER_H, sy); g.stroke();
  }

  const majs = Math.floor(topYear / maj) * maj;
  g.font = '11px Georgia, "Cambria", serif';
  g.textAlign = 'left';
  // Spec 2.4.C: measureText collision avoidance — label every Nth tick (min 80px vertical gap)
  { const _midY = (topYear + bottomYear) / 2;
    const _dSmp = (isMon || isDay) ? decYearToDate(_midY) : null;
    const _sampleLbl = isDay ? '15 Jun 2000'
                     : isMon ? (MONTHS[(_dSmp && _dSmp.m) || 5] + ' 2000')
                     : formatCalendarYear(Math.round(_midY));
    const _lh = 14;
    const _tickPx = Math.max(1, Math.abs(ws(yw(majs + maj)) - ws(yw(majs))));
    const _labelN = Math.max(1, Math.ceil(Math.max(80, _lh + 4) / _tickPx));
    let _idx = 0;
    for (let y = majs; y <= bottomYear + maj; y += maj) {
      const sy = ws(yw(y));
      if (sy < LEFT_W - 20 || sy > H + 20) { _idx++; continue; }
      g.strokeStyle = '#a8987e';
      g.beginPath(); g.moveTo(RULER_H - 16, sy); g.lineTo(RULER_H, sy); g.stroke();
      if (_idx % _labelN === 0) {
        let lbl;
        if (isDay) {
          const d = decYearToDate(y);
          lbl = d.d + ' ' + MONTHS[d.m] + ' ' + d.y;
        } else if (isMon) {
          const d = decYearToDate(y);
          lbl = MONTHS[d.m] + ' ' + d.y;
        } else {
          lbl = formatCalendarYear(Math.round(y));
        }
        g.fillStyle = '#7a6250';
        g.fillText(lbl, 8, sy - 6);
      }
      _idx++;
    }
  }

  const now = new Date();
  const todayDec = now.getFullYear() + now.getMonth() / 12 + now.getDate() / 365;
  const ty = ws(yw(todayDec));
  if (ty >= LEFT_W && ty <= H) {
    g.save();
    g.strokeStyle = 'rgba(175,88,55,0.16)'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(RULER_H, ty); g.lineTo(c.width, ty); g.stroke();
    g.strokeStyle = '#b86040'; g.lineWidth = 1.5;
    g.setLineDash([5, 4]);
    g.beginPath(); g.moveTo(0, ty); g.lineTo(c.width, ty); g.stroke();
    g.setLineDash([]);
    rRect(g, 6, ty - 10, 44, 16, 5);
    g.fillStyle = '#b86040'; g.fill();
    g.fillStyle = '#fff8f0';
    g.font = 'bold 9px Georgia, "Cambria", serif';
    g.textAlign = 'center';
    g.fillText('TODAY', 28, ty + 2.5);
    g.restore();
  }

  g.fillStyle = 'rgba(238,218,192,0.80)';
  g.font = 'bold 10px Georgia, "Cambria", serif';
  g.textAlign = 'left';
  g.fillText('TIMELINE', 10, 18);
}

function decYearToDate(dec) {
  const y = Math.floor(dec);
  const frac = dec - y;
  const dayOfYear = Math.round(frac * 365);
  const m = Math.floor(dayOfYear / 30.44);
  const d = dayOfYear - Math.floor(m * 30.44) + 1;
  return { y: y, m: clamp(m, 0, 11), d: clamp(d, 1, 31) };
}

/* === BC/AD-aware ruler endpoint labels (ported from Universe — A-13) ===
   formatCalendarYear + drawRangeEndpointLabel replace the legacy
   formatLargeYear helper so ruler labels and endpoint pills share a
   consistent BCE/CE vocabulary across both apps. */
function formatCalendarYear(yr) {
    const abs = Math.abs(yr);
    const neg = yr < 0;
    const suf = neg ? ' BC' : ' AD';
    if (abs >= 1e9) {
      const v = abs / 1e9;
      const str = Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1);
      return str + ' Bn' + suf;
    }
    if (abs >= 1e6) {
      const v = abs / 1e6;
      const str = Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1);
      return str + ' M' + suf;
    }
    if (abs >= 1000) {
      return String(Math.round(abs)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + suf;
    }
    return String(Math.round(abs)) + suf;
  }

function drawRangeEndpointLabel(g, year, fallbackX, align) {
  const sx = ws(yw(year));
  const x = clamp(sx, LEFT_W + 6, CV().width - 6);
  if (sx < LEFT_W - 4 || sx > CV().width + 4) return;
  const label = formatCalendarYear(year);
  g.save();
  g.font = 'bold 11px Georgia, "Cambria", serif';
  g.textAlign = align;
  const textW = g.measureText(label).width;
  const pad = 7;
  const boxX = align === 'left' ? x - pad : x - textW - pad;
  rRect(g, boxX, 3, textW + pad * 2, 18, 5);
  g.fillStyle = 'rgba(53,34,24,0.9)';
  g.fill();
  g.fillStyle = '#fff8f0';
  g.fillText(label, x, 16);
  g.restore();
}

/* ---- STICKY TRACK HEADERS (drawn after events, always on top) ---- */
function drawTrackHeaders(c, g) {
  if (isVerticalTimelineLayout()) { drawTrackHeadersVertical(c, g); return; }
  const vc = visCount();
  if (vc === 0) return;

  const c_ = CV();
  g.save();
  g.beginPath();
  g.rect(0, RULER_H, LEFT_W, c_.height - RULER_H);
  g.clip();

  let vi = 0;
  S.lifeTracks.forEach(u => {
    if (u.visible === false) return;
    const ty  = trackY(vi);
    const top = ty - TRACK_H / 2;
    const bot = ty + TRACK_H / 2;
    const isDimmed = !!u.dimmed;
    if (isDimmed) g.save(), g.globalAlpha = 0.25;

    // Panel background — warm tinted
    const panelGrad = g.createLinearGradient(0, top, LEFT_W, top);
    panelGrad.addColorStop(0, u.color + '30');
    panelGrad.addColorStop(1, u.color + '10');
    g.fillStyle = panelGrad;
    g.fillRect(0, top, LEFT_W, TRACK_H);

    // Color accent stripe
    g.fillStyle = u.color;
    g.fillRect(LEFT_W - 5, top, 5, TRACK_H);
    g.save();
    const stripeGrad = g.createLinearGradient(LEFT_W - 14, top, LEFT_W - 5, top);
    stripeGrad.addColorStop(0, u.color + '00');
    stripeGrad.addColorStop(1, u.color + '50');
    g.fillStyle = stripeGrad;
    g.fillRect(LEFT_W - 14, top, 9, TRACK_H);
    g.restore();

    // Track bottom separator (left panel portion)
    g.strokeStyle = 'rgba(190,175,148,0.6)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, bot); g.lineTo(LEFT_W, bot); g.stroke();

    // Life track name
    g.fillStyle = '#3a2015';
    g.font = 'bold 12px Georgia, "Cambria", serif';
    g.textAlign = 'left';
    const disp = u.name.length > 16 ? u.name.slice(0, 15) + '\u2026' : u.name;
    g.fillText(disp, 10, ty - 18);

    // Memory count
    const evCnt = S.events.filter(e => e.universeId === u.id).length;
    g.fillStyle = '#9a8570';
    g.font = '10px Georgia, "Cambria", serif';
    g.fillText(evCnt + ' memor' + (evCnt !== 1 ? 'ies' : 'y'), 10, ty - 4);

    if (isDimmed) g.restore();

    // Action buttons (visual only — hits already registered by drawTracks)
    const btnW = 37, btnH = 26, btnR = 5;
    const hideX = 4, editX = 45, infoX = 86, delX = 127;
    const btnY2 = ty + 18;
    rRect(g, hideX, btnY2 - btnH / 2, btnW, btnH, btnR);
    g.fillStyle = u.dimmed ? u.color + '55' : '#dde0e8'; g.fill();
    g.strokeStyle = '#c8ccda'; g.lineWidth = 0.7; g.stroke();
    rRect(g, editX, btnY2 - btnH / 2, btnW, btnH, btnR);
    g.fillStyle = '#dde0e8'; g.fill(); g.strokeStyle = '#c8ccda'; g.lineWidth = 0.7; g.stroke();
    rRect(g, infoX, btnY2 - btnH / 2, btnW, btnH, btnR);
    g.fillStyle = '#f0e8d8'; g.fill(); g.strokeStyle = '#c4a882'; g.lineWidth = 0.7; g.stroke();
    rRect(g, delX, btnY2 - btnH / 2, btnW, btnH, btnR);
    g.fillStyle = '#ffe8e8'; g.fill(); g.strokeStyle = '#e8b0b0'; g.lineWidth = 0.7; g.stroke();
    g.fillStyle = '#5c4030';
    g.font = 'bold 10px Georgia, "Cambria", serif';
    g.textAlign = 'center';
    g.fillText(u.dimmed ? 'show' : 'hide', hideX + btnW / 2, btnY2 + 3.5);
    g.fillText('edit', editX + btnW / 2, btnY2 + 3.5);
    g.fillStyle = '#8b6e4e';
    g.fillText('info', infoX + btnW / 2, btnY2 + 3.5);
    g.fillStyle = '#c03030';
    g.fillText('del', delX + btnW / 2, btnY2 + 3.5);

    vi++;
  });

  g.restore();

  // Sticky shadow — right edge of left panel
  g.save();
  const shadow = g.createLinearGradient(LEFT_W, 0, LEFT_W + 10, 0);
  shadow.addColorStop(0, 'rgba(40,20,5,0.09)');
  shadow.addColorStop(1, 'rgba(40,20,5,0.00)');
  g.fillStyle = shadow;
  g.fillRect(LEFT_W, RULER_H, 10, c_.height - RULER_H);
  g.restore();
}

function drawTrackHeadersVertical(c, g) {
  const vc = visCount();
  if (vc === 0) return;
  const c_ = CV();

  g.save();
  g.beginPath();
  g.rect(RULER_H, 0, c_.width - RULER_H, LEFT_W);
  g.clip();

  let vi = 0;
  S.lifeTracks.forEach(u => {
    if (u.visible === false) return;
    const tx   = trackY(vi);
    const left  = tx - TRACK_H / 2;
    const right = tx + TRACK_H / 2;
    const isDimmed = !!u.dimmed;
    if (isDimmed) g.save(), g.globalAlpha = 0.25;

    // Column header background — warm tinted
    const panelGrad = g.createLinearGradient(left, 0, left, LEFT_W);
    panelGrad.addColorStop(0, u.color + '30');
    panelGrad.addColorStop(1, u.color + '10');
    g.fillStyle = panelGrad;
    g.fillRect(left, 0, TRACK_H, LEFT_W);

    // Bottom accent stripe
    g.fillStyle = u.color;
    g.fillRect(left, LEFT_W - 5, TRACK_H, 5);

    // Column separator
    g.strokeStyle = 'rgba(190,175,148,0.6)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(right, 0); g.lineTo(right, LEFT_W); g.stroke();

    // Name
    g.fillStyle = '#3a2015';
    g.font = 'bold 11px Georgia, "Cambria", serif';
    g.textAlign = 'center';
    const disp = u.name.length > 12 ? u.name.slice(0, 11) + '\u2026' : u.name;
    g.fillText(disp, tx, 22);

    // Memory count
    const evCnt = S.events.filter(e => e.universeId === u.id).length;
    g.fillStyle = '#9a8570';
    g.font = '10px Georgia, "Cambria", serif';
    g.fillText(evCnt + ' memor' + (evCnt !== 1 ? 'ies' : 'y'), tx, 38);

    if (isDimmed) g.restore();

    // Buttons (visual only — hits already registered by drawTracksVertical)
    const btnW = 34, btnH = 24;
    const col1 = left + 8, col2 = right - btnW - 8;
    const row1 = 56, row2 = 86;
    [['u-hide', col1, row1, u.dimmed ? 'show' : 'hide', '#dde0e8', '#5c4030'],
     ['u-edit', col2, row1, 'edit', '#dde0e8', '#5c4030'],
     ['u-info', col1, row2, 'info', '#f0e8d8', '#8b6e4e'],
     ['u-del',  col2, row2, 'del',  '#ffe8e8', '#c03030']].forEach(function(btn) {
      rRect(g, btn[1], btn[2], btnW, btnH, 5);
      g.fillStyle = btn[4]; g.fill();
      g.strokeStyle = '#c8ccda'; g.lineWidth = 0.7; g.stroke();
      g.fillStyle = btn[5];
      g.font = 'bold 9px Georgia, "Cambria", serif';
      g.textAlign = 'center';
      g.fillText(btn[3], btn[1] + btnW / 2, btn[2] + 15);
    });

    vi++;
  });

  g.restore();

  // Sticky shadow — bottom edge of header band
  g.save();
  const shadow = g.createLinearGradient(0, LEFT_W, 0, LEFT_W + 10);
  shadow.addColorStop(0, 'rgba(40,20,5,0.09)');
  shadow.addColorStop(1, 'rgba(40,20,5,0.00)');
  g.fillStyle = shadow;
  g.fillRect(RULER_H, LEFT_W, c_.width - RULER_H, 10);
  g.restore();
}

/* ---- UNIVERSE TRACKS ---- */
function drawTracks(c, g) {
  if (isVerticalTimelineLayout()) {
    drawTracksVertical(c, g);
    return;
  }
  const vc = visCount();
  if (vc === 0) {
    g.save();
    g.textAlign = 'center';
    // Archival seal emblem
    g.beginPath(); g.arc(c.width / 2, c.height / 2 - 52, 28, 0, Math.PI * 2);
    g.strokeStyle = 'rgba(160,100,50,0.18)'; g.lineWidth = 2; g.stroke();
    g.beginPath(); g.arc(c.width / 2, c.height / 2 - 52, 20, 0, Math.PI * 2);
    g.fillStyle = 'rgba(160,100,50,0.05)'; g.fill();
    g.strokeStyle = 'rgba(160,100,50,0.32)'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = 'rgba(160,100,60,0.65)';
    g.font = '20px Georgia, serif';
    g.fillText('◈', c.width / 2, c.height / 2 - 44);
    // Headline
    g.fillStyle = 'rgba(100,62,30,0.75)';
    g.font = 'bold 17px Georgia, "Cambria", serif';
    g.fillText('Preserve the first memory', c.width / 2, c.height / 2 - 10);
    // Sub text
    g.font = '13px Georgia, "Cambria", serif';
    g.fillStyle = 'rgba(130,85,45,0.58)';
    g.fillText('Open  ＋ Life Track  to create a chapter, then  ＋ Event  to record its first memory.', c.width / 2, c.height / 2 + 16);
    g.fillStyle = 'rgba(120,80,40,0.38)';
    g.fillText('Need guidance? The  📖 Help  guide is in the toolbar.', c.width / 2, c.height / 2 + 38);
    g.restore();
    return;
  }

  let vi = 0;
  S.lifeTracks.forEach(u => {
    if (u.visible === false) return;
    const ty  = trackY(vi);
    const top = ty - TRACK_H / 2;
    const bot = ty + TRACK_H / 2;

    const isDimmed = !!u.dimmed;
    if (isDimmed) g.save(), g.globalAlpha = 0.25;

    // Track background — warm parchment band
    const trackGrad = g.createLinearGradient(LEFT_W, top, LEFT_W, bot);
    trackGrad.addColorStop(0, vi % 2 === 0 ? 'rgba(120,80,30,0.012)' : 'rgba(120,80,30,0.024)');
    trackGrad.addColorStop(0.5, vi % 2 === 0 ? 'rgba(120,80,30,0.022)' : 'rgba(120,80,30,0.038)');
    trackGrad.addColorStop(1, vi % 2 === 0 ? 'rgba(120,80,30,0.012)' : 'rgba(120,80,30,0.024)');
    g.fillStyle = trackGrad;
    g.fillRect(LEFT_W, top, c.width - LEFT_W, TRACK_H);

    // Left panel background — warm tinted with gradient
    const panelGrad = g.createLinearGradient(0, top, LEFT_W, top);
    panelGrad.addColorStop(0, u.color + '30');
    panelGrad.addColorStop(1, u.color + '10');
    g.fillStyle = panelGrad;
    g.fillRect(0, top, LEFT_W, TRACK_H);

    // Left color accent stripe — chapter band with glow
    g.fillStyle = u.color;
    g.fillRect(LEFT_W - 5, top, 5, TRACK_H);
    g.save();
    const stripeGrad = g.createLinearGradient(LEFT_W - 14, top, LEFT_W - 5, top);
    stripeGrad.addColorStop(0, u.color + '00');
    stripeGrad.addColorStop(1, u.color + '50');
    g.fillStyle = stripeGrad;
    g.fillRect(LEFT_W - 14, top, 9, TRACK_H);
    g.restore();

    // Track bottom separator — faint guide confined to the content strip (starts at
    // LEFT_W, not x=0). Skipped on a blank timeline (one default track, no memories)
    // so a lone centred track no longer paints a stray full-width line across the
    // middle of the screen. (Fix BS-1)
    if (!(vc === 1 && S.events.length === 0)) {
      g.strokeStyle = 'rgba(190,175,148,0.35)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(LEFT_W, bot); g.lineTo(c.width, bot); g.stroke();
    }

    // Left panel right border
    g.strokeStyle = 'rgba(185,165,135,0.5)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(LEFT_W - 5, top); g.lineTo(LEFT_W - 5, bot); g.stroke();

    // Life track name
    g.fillStyle = '#3a2015';
    g.font = 'bold 12px Georgia, "Cambria", serif';
    g.textAlign = 'left';
    const disp = u.name.length > 16 ? u.name.slice(0, 15) + '\u2026' : u.name;
    g.fillText(disp, 10, ty - 18);

    // Memory count
    const evCnt = S.events.filter(e => e.universeId === u.id).length;
    g.fillStyle = '#9a8570';
    g.font = '10px Georgia, "Cambria", serif';
    g.fillText(evCnt + ' memor' + (evCnt !== 1 ? 'ies' : 'y'), 10, ty - 4);

    if (isDimmed) g.restore();

    // ---- ACTION BUTTONS: [hide] [edit] [info] ----
    const btnW = 37, btnH = 26, btnR = 5;
    const hideX = 4, editX = 45, infoX = 86, delX = 127;
    const btnY2 = ty + 18;

    // HIDE (dim) button
    rRect(g, hideX, btnY2 - btnH / 2, btnW, btnH, btnR);
    g.fillStyle = u.dimmed ? u.color + '55' : '#dde0e8';
    g.fill();
    g.strokeStyle = '#c8ccda'; g.lineWidth = 0.7; g.stroke();

    // EDIT button
    rRect(g, editX, btnY2 - btnH / 2, btnW, btnH, btnR);
    g.fillStyle = '#dde0e8';
    g.fill();
    g.strokeStyle = '#c8ccda'; g.lineWidth = 0.7; g.stroke();

    // INFO button
    rRect(g, infoX, btnY2 - btnH / 2, btnW, btnH, btnR);
    g.fillStyle = '#f0e8d8';
    g.fill();
    g.strokeStyle = '#c4a882'; g.lineWidth = 0.7; g.stroke();

    // DEL button
      rRect(g, delX, btnY2 - btnH / 2, btnW, btnH, btnR);
      g.fillStyle = '#ffe8e8';
      g.fill();
      g.strokeStyle = '#e8b0b0'; g.lineWidth = 0.7; g.stroke();

    // Button labels
    g.fillStyle = '#5c4030';
    g.font = 'bold 10px Georgia, "Cambria", serif';
    g.textAlign = 'center';
    g.fillText(u.dimmed ? 'show' : 'hide', hideX + btnW / 2, btnY2 + 3.5);
    g.fillText('edit', editX + btnW / 2, btnY2 + 3.5);
    g.fillStyle = '#8b6e4e';
    g.fillText('info', infoX + btnW / 2, btnY2 + 3.5);
    g.fillStyle = '#c03030';
    g.fillText('del', delX + btnW / 2, btnY2 + 3.5);

    // Register hit targets
    hits.push({ type: 'u-hide', id: u.id, x: hideX, y: btnY2 - btnH / 2, w: btnW, h: btnH });
    hits.push({ type: 'u-edit', id: u.id, x: editX, y: btnY2 - btnH / 2, w: btnW, h: btnH });
    hits.push({ type: 'u-info', id: u.id, x: infoX, y: btnY2 - btnH / 2, w: btnW, h: btnH });
    hits.push({ type: 'u-del',  id: u.id, x: delX,  y: btnY2 - btnH / 2, w: btnW, h: btnH });

    // Track axis centre line — warm chapter line with glow
    g.save();
    if (isDimmed) g.globalAlpha = 0.25;
    g.strokeStyle = u.color + '2e'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(LEFT_W, ty); g.lineTo(c.width, ty); g.stroke();
    g.strokeStyle = u.color + '60'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(LEFT_W, ty); g.lineTo(c.width, ty); g.stroke();
    g.restore();

    vi++;
  });
}

function drawTracksVertical(c, g) {
  const vc = visCount();
  if (vc === 0) return;

  let vi = 0;
  S.lifeTracks.forEach(u => {
    if (u.visible === false) return;
    const tx = trackY(vi);
    const left = tx - TRACK_H / 2;
    const right = tx + TRACK_H / 2;
    const isDimmed = !!u.dimmed;
    if (isDimmed) g.save(), g.globalAlpha = 0.25;

    const colGrad = g.createLinearGradient(left, LEFT_W, right, LEFT_W);
    colGrad.addColorStop(0, vi % 2 === 0 ? 'rgba(120,80,30,0.012)' : 'rgba(120,80,30,0.024)');
    colGrad.addColorStop(0.5, vi % 2 === 0 ? 'rgba(120,80,30,0.022)' : 'rgba(120,80,30,0.038)');
    colGrad.addColorStop(1, vi % 2 === 0 ? 'rgba(120,80,30,0.012)' : 'rgba(120,80,30,0.024)');
    g.fillStyle = colGrad;
    g.fillRect(left, LEFT_W, TRACK_H, c.height - LEFT_W);

    const panelGrad = g.createLinearGradient(left, 0, left, LEFT_W);
    panelGrad.addColorStop(0, u.color + '30');
    panelGrad.addColorStop(1, u.color + '10');
    g.fillStyle = panelGrad;
    g.fillRect(left, 0, TRACK_H, LEFT_W);

    g.fillStyle = u.color;
    g.fillRect(left, LEFT_W - 5, TRACK_H, 5);

    g.strokeStyle = 'rgba(190,175,148,0.6)';
    g.beginPath(); g.moveTo(right, 0); g.lineTo(right, c.height); g.stroke();

    g.fillStyle = '#3a2015';
    g.font = 'bold 11px Georgia, "Cambria", serif';
    g.textAlign = 'center';
    const disp = u.name.length > 12 ? u.name.slice(0, 11) + '\u2026' : u.name;
    g.fillText(disp, tx, 22);

    const evCnt = S.events.filter(e => e.universeId === u.id).length;
    g.fillStyle = '#9a8570';
    g.font = '10px Georgia, "Cambria", serif';
    g.fillText(evCnt + ' memor' + (evCnt !== 1 ? 'ies' : 'y'), tx, 38);

    if (isDimmed) g.restore();

    const btnW = 34, btnH = 24;
    const col1 = left + 8, col2 = right - btnW - 8;
    const row1 = 56, row2 = 86;
    [['u-hide', col1, row1, u.dimmed ? 'show' : 'hide', '#dde0e8', '#5c4030'],
     ['u-edit', col2, row1, 'edit', '#dde0e8', '#5c4030'],
     ['u-info', col1, row2, 'info', '#f0e8d8', '#8b6e4e'],
     ['u-del',  col2, row2, 'del',  '#ffe8e8', '#c03030']].forEach(function(btn) {
      rRect(g, btn[1], btn[2], btnW, btnH, 5);
      g.fillStyle = btn[4]; g.fill();
      g.strokeStyle = '#c8ccda'; g.lineWidth = 0.7; g.stroke();
      g.fillStyle = btn[5];
      g.font = 'bold 9px Georgia, "Cambria", serif';
      g.textAlign = 'center';
      g.fillText(btn[3], btn[1] + btnW / 2, btn[2] + 15);
      hits.push({ type: btn[0], id: u.id, x: btn[1], y: btn[2], w: btnW, h: btnH });
    });

    g.save();
    if (isDimmed) g.globalAlpha = 0.25;
    g.strokeStyle = u.color + '2e'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(tx, LEFT_W); g.lineTo(tx, c.height); g.stroke();
    g.strokeStyle = u.color + '60'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(tx, LEFT_W); g.lineTo(tx, c.height); g.stroke();
    g.restore();

    vi++;
  });
}

/* ---- CONNECTIONS (curves between events) ---- */
function drawConnections(c, g) {
  S.connections.forEach(conn => {
    const fe = S.events.find(e => e.id === conn.fromEventId);
    const te = S.events.find(e => e.id === conn.toEventId);
    if (!fe || !te) return;
    const fu = getU(fe.universeId), tu = getU(te.universeId);
    if (!fu || !tu || fu.visible === false || tu.visible === false) return;
    const fd = parseDate(fe.date, fe.time), td = parseDate(te.date, te.time);
    if (fd === null || td === null) return;

    const fvi = getVisIdx(fe.universeId), tvi = getVisIdx(te.universeId);
    const fx = eventScreenX(fd, fvi), fy = eventScreenY(fd, fvi);
    const tx = eventScreenX(td, tvi), ty2 = eventScreenY(td, tvi);
    const fTime = isVerticalTimelineLayout() ? fy : fx;
    const tTime = isVerticalTimelineLayout() ? ty2 : tx;
    const maxTime = isVerticalTimelineLayout() ? c.height + 300 : c.width + 300;
    if ((fTime < LEFT_W - 300 && tTime < LEFT_W - 300) || (fTime > maxTime && tTime > maxTime)) return;

    const my = (fy + ty2) / 2;
    const mx = (fx + tx) / 2;
    g.save();
    const _connDimmed = !!fu.dimmed || !!tu.dimmed;
    const _connAlpha = _connDimmed ? 0.08 : 0.40;
    // Warm glow underlay
    g.strokeStyle = fu.color; g.lineWidth = 5;
    g.globalAlpha = _connAlpha * 0.15;
    g.beginPath(); g.moveTo(fx, fy);
    if (isVerticalTimelineLayout()) g.bezierCurveTo(mx, fy, mx, ty2, tx, ty2);
    else g.bezierCurveTo(fx, my, tx, my, tx, ty2);
    g.stroke();
    // Main warm dashed line
    g.lineWidth = 1.5;
    g.setLineDash([6, 4]); g.globalAlpha = _connAlpha;
    g.beginPath(); g.moveTo(fx, fy);
    if (isVerticalTimelineLayout()) g.bezierCurveTo(mx, fy, mx, ty2, tx, ty2);
    else g.bezierCurveTo(fx, my, tx, my, tx, ty2);
    g.stroke();
    g.setLineDash([]); g.globalAlpha = 1;
    if (conn.label) {
      g.globalAlpha = 0.62; g.fillStyle = '#6a4828';
      g.font = '9px Georgia, sans-serif'; g.textAlign = 'center';
      g.fillText(conn.label, mx, my - 5);
      g.globalAlpha = 1;
    }
    g.restore();
  });
}

/* ---- CLUSTER HELPERS ---- */
const CLUSTER_PX_THRESHOLD = 18;
const CLUSTER_SCALE_THRESHOLD = 0.5;

function buildEventClusters(events, c) {
  const sorted = [...events].sort((a, b) => {
    const da = parseDate(a.date, a.time), db = parseDate(b.date, b.time);
    return (da || 0) - (db || 0);
  });
  const byTrack = {};
  sorted.forEach(ev => {
    const vi = getVisIdx(ev.universeId);
    if (vi < 0) return;
    if (!byTrack[vi]) byTrack[vi] = [];
    byTrack[vi].push(ev);
  });
  const allClusters = [];
  Object.keys(byTrack).forEach(viKey => {
    const vi = +viKey;
    const trackEvs = byTrack[vi];
    const clusters = [];
    trackEvs.forEach(ev => {
      const dec = parseDate(ev.date, ev.time);
      if (dec === null) return;
      const sx = ws(yw(dec));
      const last = clusters[clusters.length - 1];
      if (last && Math.abs(sx - last.x) < CLUSTER_PX_THRESHOLD) {
        last.events.push(ev);
        last.timeCoord = (last.timeCoord * (last.events.length - 1) + sx) / last.events.length;
      } else {
        clusters.push({ timeCoord: sx, vi: vi, events: [ev] });
      }
    });
    allClusters.push(...clusters);
  });
  return allClusters;
}

/* =====================================================
   2.4.D: Label cluster popover
   ===================================================== */
function showLblClusterPop(events, canvasX, canvasY) {
  let pop = document.getElementById('lbl-cluster-pop');
  if (!pop) {
    pop = document.createElement('div');
    pop.id = 'lbl-cluster-pop';
    pop.style.cssText = 'position:fixed;z-index:9200;background:#fff8f0;border:1px solid #ccc0ae;border-radius:9px;box-shadow:0 6px 24px rgba(60,30,10,0.14);padding:0;min-width:190px;max-width:270px;max-height:280px;overflow:hidden;display:none;font-family:Georgia,"Cambria",serif;';
    pop.innerHTML = '<div style="padding:8px 12px 6px;border-bottom:1px solid #e8ddc8;font-size:11px;font-weight:700;color:#7a6250;display:flex;justify-content:space-between;align-items:center"><span id="lbl-pop-title">Events</span><span id="lbl-pop-close" style="cursor:pointer;font-size:16px;color:#b8987e;line-height:1">&times;</span></div><div id="lbl-cluster-pop-list" style="overflow-y:auto;max-height:236px;"></div>';
    document.body.appendChild(pop);
    pop.querySelector('#lbl-pop-close').addEventListener('click', () => { pop.style.display = 'none'; });
    document.addEventListener('pointerdown', e => {
      if (pop.style.display !== 'none' && !pop.contains(e.target)) pop.style.display = 'none';
    }, true);
  }
  const list = pop.querySelector('#lbl-cluster-pop-list');
  pop.querySelector('#lbl-pop-title').textContent = events.length + ' events here';
  list.innerHTML = events.map(ev =>
    '<div data-evid="' + esc(ev.id) + '" style="padding:7px 12px;cursor:pointer;border-bottom:1px solid #ede4d4;font-size:12px;" onmouseenter="this.style.background=\'#faf4e8\'" onmouseleave="this.style.background=\'\'">' +
    '<div style="font-weight:600;color:#352218;line-height:1.3">' + esc(ev.title || 'Untitled') + '</div>' +
    '<div style="font-size:10px;color:#9a8570;margin-top:2px">' + esc(ev.date || '') + (ev.time ? ' · ' + esc(ev.time) : '') + '</div>' +
    '</div>'
  ).join('');
  list.querySelectorAll('[data-evid]').forEach(el => {
    el.addEventListener('click', () => {
      pop.style.display = 'none';
      setTimeout(() => M.openEvDetail(el.dataset.evid), 60);
    });
  });
  const c = CV();
  const cRect = c.getBoundingClientRect();
  let left = cRect.left + canvasX + 16;
  let top  = cRect.top  + canvasY - 10;
  const popW = 220, popH = Math.min(events.length * 52 + 42, 280);
  if (left + popW > window.innerWidth - 8) left = cRect.left + canvasX - popW - 8;
  if (top + popH > window.innerHeight - 8) top = window.innerHeight - popH - 8;
  pop.style.left = left + 'px';
  pop.style.top  = top  + 'px';
  pop.style.display = 'block';
}

function drawClusterBubble(g, x, y, count, sampleEv) {
  const u = getU(sampleEv.universeId);
  const col = u ? u.color : '#8a6040';
  const r = 12 + Math.min(count, 30) * 0.4;

  // Shadow
  g.beginPath(); g.arc(x, y + 2.5, r, 0, Math.PI * 2);
  g.fillStyle = 'rgba(80,40,10,0.10)'; g.fill();

  // Warm glow aura
  const clusterAura = g.createRadialGradient(x, y, r * 0.6, x, y, r + 5);
  clusterAura.addColorStop(0, col + '28');
  clusterAura.addColorStop(1, col + '00');
  g.beginPath(); g.arc(x, y, r + 5, 0, Math.PI * 2);
  g.fillStyle = clusterAura; g.fill();

  // Ring
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = col + '18'; g.fill();
  g.strokeStyle = col; g.lineWidth = 1.8; g.stroke();

  // Inner warm white
  g.beginPath(); g.arc(x, y, r - 3, 0, Math.PI * 2);
  g.fillStyle = 'rgba(255,252,245,0.90)'; g.fill();

  g.font = 'bold 11px Georgia, "Cambria", serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = col;
  g.fillText(count > 99 ? '99+' : String(count), x, y);
  g.textBaseline = 'alphabetic';

  hits.push({ type: 'cluster', x: x, y: y, r: r + 4, events: sampleEv });
}

/* ---- EVENT DOTS ---- */
function drawEvents(c, g) {
  _lblSuppressedIds = new Set();
  const visYearLeft = sy2yr(LEFT_W - 200);
  const visYearRight = sy2yr((isVerticalTimelineLayout() ? c.height : c.width) + 200);

  // Friendly empty-state guidance when tracks exist but no events have been added yet
  if (S.events.length === 0 && S.lifeTracks.length > 0) {
    g.save();
    g.textAlign = 'center';
    g.fillStyle = 'rgba(120,72,30,0.65)';
    g.font = 'bold 14px Georgia, "Cambria", serif';
    g.fillText('◈  Chapter open — press  ＋ Event  to record the first memory.', c.width / 2, RULER_H + 46);
    g.font = '12px Georgia, "Cambria", serif';
    g.fillStyle = 'rgba(140,90,45,0.48)';
    g.fillText('Click  ＋ Event  in the toolbar, or double-click anywhere in a life track row.', c.width / 2, RULER_H + 66);
    g.restore();
  }

  const allEvs = S.events.concat(expandRecurringEvents());

  const culled = allEvs.filter(ev => {
    const u = getU(ev.universeId);
    if (!u || u.visible === false) return false;
    const dec = parseDate(ev.date, ev.time);
    if (dec === null) return false;
    if (dec < visYearLeft || dec > visYearRight) return false;
    const vi = getVisIdx(ev.universeId);
    if (vi < 0) return false;
    const cross = trackY(vi);
    const time = ws(yw(dec));
    if (cross < trackAxisStart() - TRACK_H || cross > (isVerticalTimelineLayout() ? c.width : c.height) + TRACK_H) return false;
    if (time < LEFT_W - TRACK_H || time > (isVerticalTimelineLayout() ? c.height : c.width) + TRACK_H) return false;
    return true;
  });

  if (V.scale < CLUSTER_SCALE_THRESHOLD) {
    const clusters = buildEventClusters(culled, c);
    clusters.forEach(cluster => {
      const cross = trackY(cluster.vi);
      const sx = isVerticalTimelineLayout() ? cross : cluster.timeCoord;
      const sy = isVerticalTimelineLayout() ? cluster.timeCoord : cross;
      const time = cluster.timeCoord;
      if (time < LEFT_W - 30 || time > (isVerticalTimelineLayout() ? c.height : c.width) + 30) return;
      if (cluster.events.length === 1) {
        drawSingleEvent(c, g, cluster.events[0]);
      } else {
        drawClusterBubble(g, sx, sy, cluster.events.length, cluster.events[0]);
      }
    });
    return;
  }

  // 2.4.D: Label de-collision sweep (horizontal layout only)
  const _lblPills = [];
  if (!isVerticalTimelineLayout()) {
    g.font = 'bold 10px Georgia, "Cambria", serif';
    const _boxes = [];
    culled.forEach(ev => {
      if (ev.isPhantom) return;
      const u = getU(ev.universeId);
      if (!u || u.visible === false) return;
      const dec = parseDate(ev.date, ev.time);
      if (dec === null) return;
      if (_catFilter  && ev.category !== _catFilter) return;
      if (_tagFilter  && !(ev.tags||[]).includes(_tagFilter)) return;
      if (_statusFilter && (ev.status||'') !== _statusFilter) return;
      if (_toneFilter && ev.emotionalTone !== _toneFilter) return;
      const vi = getVisIdx(ev.universeId);
      if (vi < 0) return;
      const sx = eventScreenX(dec, vi);
      const sy = eventScreenY(dec, vi);
      const lbl = ev.title.length > 16 ? ev.title.slice(0, 15) + '\u2026' : ev.title;
      const lw = g.measureText(lbl).width;
      _boxes.push({ ev, sx, sy, left: sx - lw / 2 - 2, right: sx + lw / 2 + 2 });
    });
    _boxes.sort((a, b) => a.sx - b.sx);
    const _consumed = new Set();
    for (let i = 0; i < _boxes.length; i++) {
      if (_consumed.has(i)) continue;
      const anchor = _boxes[i];
      let clusterRight = anchor.right;
      const group = [anchor.ev];
      for (let j = i + 1; j < _boxes.length; j++) {
        if (_consumed.has(j)) continue;
        if (_boxes[j].left < clusterRight + 6) {
          _consumed.add(j);
          _lblSuppressedIds.add(_boxes[j].ev.id);
          group.push(_boxes[j].ev);
          clusterRight = Math.max(clusterRight, _boxes[j].right);
        }
      }
      if (group.length > 1) {
        _lblPills.push({ x: anchor.sx, y: anchor.sy + EV_R + 36, count: group.length - 1, events: group });
      }
    }
  }

  culled.forEach(ev => drawSingleEvent(c, g, ev));

  // Draw label cluster '+N' pills
  _lblPills.forEach(pill => {
    const pillLbl = '+' + pill.count;
    g.font = 'bold 9px Georgia, "Cambria", serif';
    const pw = g.measureText(pillLbl).width + 10;
    const ph = 14;
    const px = pill.x - pw / 2, py = pill.y - ph + 2;
    g.beginPath();
    if (g.roundRect) g.roundRect(px, py, pw, ph, 7);
    else g.rect(px, py, pw, ph);
    g.fillStyle = 'rgba(120,72,30,0.84)'; g.fill();
    g.fillStyle = '#fff8f0'; g.textAlign = 'center';
    g.fillText(pillLbl, pill.x, pill.y - 2);
    hits.push({ type: 'lbl_cluster', x: px, y: py, w: pw, h: ph, cx: pill.x, cy: pill.y, events: pill.events });
  });
}

function drawSingleEvent(c, g, ev) {
    const u = getU(ev.universeId);
    if (!u || u.visible === false) return;
    const dec = parseDate(ev.date, ev.time);
    if (dec === null) return;
    const vi = getVisIdx(ev.universeId);
    if (vi < 0) return;
    const sx = eventScreenX(dec, vi);
    const sy = eventScreenY(dec, vi);
    const timeCoord = isVerticalTimelineLayout() ? sy : sx;
    const crossCoord = isVerticalTimelineLayout() ? sx : sy;
    if (timeCoord < LEFT_W - 70 || timeCoord > (isVerticalTimelineLayout() ? c.height : c.width) + 70) return;
    if (crossCoord < trackAxisStart() - TRACK_H || crossCoord > (isVerticalTimelineLayout() ? c.width : c.height) + TRACK_H) return;

    const _uDimmed = !!u.dimmed;
    if (_uDimmed) { g.save(); g.globalAlpha = 0.2; }

    if (_catFilter && ev.category !== _catFilter) {
      g.save(); g.globalAlpha = _uDimmed ? 0.08 : 0.12;
      g.beginPath(); g.arc(sx, sy, EV_R, 0, Math.PI * 2);
      g.fillStyle = u.color; g.fill();
      g.restore();
      if (_uDimmed) g.restore();
      return;
    }

    if (_toneFilter && ev.emotionalTone !== _toneFilter) {
      g.save(); g.globalAlpha = _uDimmed ? 0.08 : 0.12;
      g.beginPath(); g.arc(sx, sy, EV_R, 0, Math.PI * 2);
      g.fillStyle = u.color; g.fill();
      g.restore();
      if (_uDimmed) g.restore();
      return;
    }

    if (_tagFilter && !(ev.tags||[]).includes(_tagFilter)) {
      /* BE-11: draw the same faint ghost dot as the cat/tone/status filters
         above, so all four filter chips respond identically (was a bare
         return, making tag-filtered events vanish while the others dimmed). */
      g.save(); g.globalAlpha = _uDimmed ? 0.08 : 0.12;
      g.beginPath(); g.arc(sx, sy, EV_R, 0, Math.PI * 2);
      g.fillStyle = u.color; g.fill();
      g.restore();
      if (_uDimmed) g.restore();
      return;
    }

    if (_statusFilter && (ev.status || '') !== _statusFilter) {
      g.save(); g.globalAlpha = _uDimmed ? 0.08 : 0.12;
      g.beginPath(); g.arc(sx, sy, EV_R, 0, Math.PI * 2);
      g.fillStyle = u.color; g.fill();
      g.restore();
      if (_uDimmed) g.restore();
      return;
    }

    if (ev.isPhantom) {
      hits.push({ type: 'event', id: ev.parentId, x: sx, y: sy, r: EV_R });
      g.save();
      g.globalAlpha = _uDimmed ? 0.12 : 0.34;
      g.beginPath(); g.arc(sx, sy, EV_R * 0.62, 0, Math.PI * 2);
      g.fillStyle = u.color; g.fill();
      g.strokeStyle = catColor(ev.category || '') || u.color;
      g.lineWidth = 1.5; g.stroke();
      g.restore();
      if (_uDimmed) g.restore();
      return;
    }

    hits.push({ type: 'event', id: ev.id, x: sx, y: sy, r: EV_R + 5 });

    // Warm outer aura — memory seal halo
    g.beginPath(); g.arc(sx, sy, EV_R + 8, 0, Math.PI * 2);
    const auraGrad = g.createRadialGradient(sx, sy, EV_R - 1, sx, sy, EV_R + 8);
    auraGrad.addColorStop(0, u.color + '22');
    auraGrad.addColorStop(1, u.color + '00');
    g.fillStyle = auraGrad; g.fill();

    // Drop shadow (warm brown)
    g.beginPath(); g.arc(sx, sy + 2.5, EV_R + 1, 0, Math.PI * 2);
    g.fillStyle = 'rgba(60,30,10,0.12)'; g.fill();

    // Warm backing ring (parchment white)
    g.beginPath(); g.arc(sx, sy, EV_R + 2, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255,252,245,0.92)'; g.fill();

    // Main colored fill — warm radial gradient
    g.beginPath(); g.arc(sx, sy, EV_R, 0, Math.PI * 2);
    const dotGrad = g.createRadialGradient(sx - 2, sy - 2, 0, sx, sy, EV_R);
    dotGrad.addColorStop(0, u.color + 'ff');
    dotGrad.addColorStop(1, u.color + 'c0');
    g.fillStyle = dotGrad; g.fill();
    g.strokeStyle = 'rgba(255,248,235,0.6)'; g.lineWidth = 1.5; g.stroke();

    // Inner highlight gleam
    g.beginPath(); g.arc(sx - 3, sy - 3, EV_R * 0.28, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255,250,235,0.48)'; g.fill();

    if (ev.category && CATEGORIES[ev.category]) {
      g.save();
      g.beginPath();
      g.arc(sx, sy, EV_R + 4, Math.PI * (3/4), Math.PI * (9/4), false);
      g.strokeStyle = catColor(ev.category);
      g.lineWidth = 2.5; g.lineCap = 'round';
      g.stroke();
      g.restore();
    }

    if (ev.status) {
      g.save();
      g.beginPath(); g.arc(sx, sy, EV_R + 7.5, 0, Math.PI * 2);
      g.strokeStyle = statusColor(ev.status);
      g.lineWidth = 1.5; g.globalAlpha = 0.78;
      if (ev.status === 'Cancelled' || ev.status === 'Missed') { g.setLineDash([3,3]); }
      g.stroke();
      g.setLineDash([]);
      g.restore();
    }

    if (ev.subEvents && ev.subEvents.length > 0) {
      const bx = sx + EV_R - 1, by2 = sy - EV_R + 1;
      g.beginPath(); g.arc(bx, by2, 7, 0, Math.PI * 2);
      g.fillStyle = '#3c2010'; g.fill();
      g.strokeStyle = 'rgba(255,248,230,0.5)'; g.lineWidth = 1; g.stroke();
      g.fillStyle = '#fff8f0';
      g.font = 'bold 7px Georgia, sans-serif'; g.textAlign = 'center';
      g.fillText(ev.subEvents.length > 9 ? '9+' : String(ev.subEvents.length), bx, by2 + 2.5);
    }

    if (ev.media && ev.media.length > 0) {
      const mx2 = sx - EV_R + 1, my2 = sy - EV_R + 1;
      g.beginPath(); g.arc(mx2, my2, 6, 0, Math.PI * 2);
      g.fillStyle = '#c88020'; g.fill();
      g.strokeStyle = 'rgba(255,248,230,0.5)'; g.lineWidth = 1; g.stroke();
      g.fillStyle = '#fff8f0';
      g.font = 'bold 7px Georgia, sans-serif'; g.textAlign = 'center';
      g.fillText('\uD83D\uDCCE', mx2, my2 + 2.5);
    }

    if (!_lblSuppressedIds.has(ev.id)) {
      g.save();
      g.beginPath();
      if (isVerticalTimelineLayout()) g.rect(RULER_H, LEFT_W, c.width - RULER_H, c.height - LEFT_W);
      else g.rect(LEFT_W, RULER_H, c.width - LEFT_W, c.height - RULER_H);
      g.clip();
      const label = ev.title.length > 16 ? ev.title.slice(0, 15) + '\u2026' : ev.title;
      const ly = isVerticalTimelineLayout() ? sy + 4 : sy + EV_R + 15;
      const lx = isVerticalTimelineLayout() ? sx + EV_R + 10 : sx;
      g.fillStyle = '#3a2015';
      g.font = 'bold 10px Georgia, "Cambria", serif';
      g.textAlign = isVerticalTimelineLayout() ? 'left' : 'center';
      g.fillText(label, lx, ly);
      g.fillStyle = '#9a8570';
      g.font = '9px Georgia, "Cambria", serif';
      const dateLabel = (ev.date || '?') + (ev.time ? ' ' + ev.time : '');
      g.fillText(dateLabel, lx, ly + 12);

      const _chIds = ev.characterIds || [];
      if (_chIds.length > 0) {
        const maxD = Math.min(_chIds.length, 6);
        const dotR = 6, dotSp = 14;
        const totalDW = (maxD - 1) * dotSp;
        const dotY = ly + 28;
        for (let di = 0; di < maxD; di++) {
          const chd = S.people.find(cc => cc.id === _chIds[di]);
          const col2 = chd ? (chd.color || charHashColor(chd.id)) : '#aaa';
          const cx2 = sx - totalDW/2 + di*dotSp;
          g.beginPath(); g.arc(cx2, dotY+1.5, dotR, 0, Math.PI*2);
          g.fillStyle = 'rgba(60,30,10,0.14)'; g.fill();
          g.beginPath(); g.arc(cx2, dotY, dotR, 0, Math.PI*2);
          g.fillStyle = col2; g.fill();
          g.strokeStyle = '#fff8f0'; g.lineWidth = 1.5; g.stroke();
          if (chd && chd.name) {
            const init = chd.name.charAt(0).toUpperCase();
            g.fillStyle = 'rgba(255,252,240,0.92)';
            g.font = 'bold 6px Georgia,serif';
            g.textAlign = 'center';
            g.fillText(init, cx2, dotY + 2.5);
          }
        }
        if (_chIds.length > 6) {
          g.fillStyle = '#8b6040';
          g.font = 'bold 8px Georgia,serif'; g.textAlign = 'center';
          g.fillText('+' + (_chIds.length - 6), sx + totalDW/2 + 11, dotY + 3);
        }
      }
      g.restore();
    }

    const _hasCharFilter = _charFilterIds.length > 0;
    const _hasSearch = _searchText.length > 0;
    let _evMatchesChar = false, _evMatchesSearch = false;

    if (_hasCharFilter) {
      const evChIds2 = ev.characterIds || [];
      _evMatchesChar = _filterMode === 'all'
        ? _charFilterIds.every(fid => evChIds2.includes(fid))
        : _charFilterIds.some(fid => evChIds2.includes(fid));
    }

    if (_hasSearch) {
      const haystack = (ev.title + ' ' + (ev.description||'') + ' ' + (ev.date||'') + ' ' + (ev.tags||[]).join(' ')).toLowerCase();
      _evMatchesSearch = haystack.includes(_searchText);
    }

    if (_hasCharFilter || _hasSearch) {
      const _matches = (!_hasCharFilter || _evMatchesChar) && (!_hasSearch || _evMatchesSearch);
      if (_matches) {
        g.save();
        if (_hasCharFilter && _evMatchesChar) {
          g.beginPath(); g.arc(sx, sy, EV_R + 9, 0, Math.PI*2);
          g.strokeStyle = 'rgba(255,200,20,0.9)'; g.lineWidth = 3;
          g.setLineDash([4,3]); g.stroke(); g.setLineDash([]);
        }
        if (_hasSearch && _evMatchesSearch) {
          g.beginPath(); g.arc(sx, sy, EV_R + 13, 0, Math.PI*2);
          g.strokeStyle = 'rgba(0,200,220,0.75)'; g.lineWidth = 2;
          g.stroke();
        }
        g.restore();
      } else {
        g.save();
        g.globalAlpha = 0.25;
        g.beginPath(); g.arc(sx, sy, EV_R + 22, 0, Math.PI*2);
        g.fillStyle = 'rgba(248,250,255,0.95)'; g.fill();
        g.restore();
      }
    }

    if (_uDimmed) g.restore();
}

/* ---- ROUNDED RECT HELPER ---- */
function rRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y);
  g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

/* =====================================================
   CANVAS INTERACTION
   ===================================================== */
function initCanvas() {
  const c = CV();
  const wrap = document.getElementById('canvas-wrap');

  function resize() {
    var w = wrap.clientWidth;
    var h = wrap.clientHeight;
    if (w === 0 && h === 0) return;
    c.width  = w;
    c.height = h;
    clampPanY();
    render();
  }

  /* Debounced resize — coalesces rapid mobile viewport/orientation events */
  var _resizeTimer = null;
  function scheduleResize() {
    if (_resizeTimer) return;
    _resizeTimer = setTimeout(function() { _resizeTimer = null; resize(); }, 80);
  }

  /* Expose globally so mobile controls (filter toggle, drawer) can trigger it */
  window._tlResize = resize;

  /* Primary: ResizeObserver fires on any size change (address bar, rotation, filters) */
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(scheduleResize).observe(wrap);
  }

  /* Secondary: standard resize event (desktop, orientation on some browsers) */
  window.addEventListener('resize', scheduleResize);

  /* Tertiary: visualViewport fires when mobile browser chrome shows/hides */
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', scheduleResize);
    /* Some browsers fire 'scroll' instead of 'resize' when address bar shows/hides */
    window.visualViewport.addEventListener('scroll', scheduleResize);
  }

  /* Orientation change — single debounced call covers all settle delays */
  window.addEventListener('orientationchange', scheduleResize);

  resize();

  /* A-12: auto-frame the full timeline on first load (ported from Universe). */
  try { fitFullTimeline(); render(); } catch (_) {}

  // ---- Wheel: unified preventDefault policy ----
  // Only intercept the wheel when the cursor is inside the canvas AND the user
  // is signalling an explicit timeline gesture (modifier or dominant horizontal
  // trackpad swipe). Otherwise the page scrolls naturally.
  c.addEventListener('wheel', e => {
    const r  = c.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const inside = mx >= 0 && my >= 0 && mx <= r.width && my <= r.height;
    const horizDominant = Math.abs(e.deltaX) > Math.abs(e.deltaY) * 2;
    const wantsZoom = e.ctrlKey || e.metaKey;
    const wantsVPan = e.shiftKey;
    if (!inside || !(wantsZoom || wantsVPan || horizDominant)) return;

    e.preventDefault();

    if (wantsZoom) {
      const fac = e.deltaY < 0 ? 1.1 : 0.909;
      doZoom(fac, primaryScreenCoord(mx, my));
    } else if (wantsVPan) {
      V.panY -= e.deltaY;
      clampPanY();
      render();
    } else {
      // horizontal-dominant trackpad swipe → pan horizontally
      const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
      V.panX -= delta;
      clampPanX();
      render();
    }
  }, { passive: false });

  // ---- Pointer Events: unified mouse + touch + pen ----
  // Single Pointer Events implementation handles all input types. Mouse pan,
  // touch pan, two-finger pinch, click hit-test and hover tooltips all flow
  // through this block.
  (function() {
    const TAP_SLOP    = 4;      // px: matches "movement >4px → pan / <4px → click"
    const TAP_TIME    = 300;    // ms: max duration for a tap gesture
    const LPRESS_MS   = 500;    // ms: hold time to trigger long-press → add event
    const AXIS_LOCK   = 8;      // px movement before pan axis is locked
    const FLING_VEL   = 0.4;    // px/ms threshold to commit a paging fling
    const PAGE_RATIO  = 0.35;   // fraction of viewport width to commit a page
    const MOMENTUM_DECAY = 0.94;
    const MOMENTUM_MIN   = 0.02;

    const pointers = new Map();   // pointerId -> {cx,cy,clientX,clientY}
    let drag       = null;        // {pointerId,sx,sy,px,py,cx,cy,t,moved,axis,recent}
    let pinch      = null;        // {dist}
    let longTimer  = null;
    let longFired  = false;
    let momentumRAF = null;

    function applyTouchAction() {
      // Always disable native touch gestures on the canvas — pan/zoom/pinch
      // are fully owned by this Pointer Events implementation. Page wheel
      // scrolling still works because the wheel handler only preventDefaults
      // when an explicit timeline gesture is detected.
      c.style.touchAction = 'none';
    }
    applyTouchAction();
    /* Re-apply when orientation flips (rotation, mouse plugged in, etc.). */
    if (typeof setOrientation === 'function' && !setOrientation.__patched) {
      const _origSO = setOrientation;
      window.setOrientation = function(o) {
        const r = _origSO(o);
        applyTouchAction();
        return r;
      };
      window.setOrientation.__patched = true;
    }
    window.addEventListener('resize', applyTouchAction);
    window.addEventListener('orientationchange', applyTouchAction);

    function isTouch(e) { return e.pointerType === 'touch' || e.pointerType === 'pen'; }
    function cancelLong() { if (longTimer) { clearTimeout(longTimer); longTimer = null; } }
    function cancelMomentum() { if (momentumRAF) { cancelAnimationFrame(momentumRAF); momentumRAF = null; } }

    function pinchDist(p1, p2) { return Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY); }
    function pinchMidPrimary(p1, p2) {
      const r = c.getBoundingClientRect();
      const mx = (p1.clientX + p2.clientX) / 2 - r.left;
      const my = (p1.clientY + p2.clientY) / 2 - r.top;
      return primaryScreenCoord(mx, my);
    }

    c.addEventListener('pointerdown', e => {
      // Mouse: only the primary button starts a gesture. Touch/pen: always.
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      cancelMomentum();
      const r = c.getBoundingClientRect();
      pointers.set(e.pointerId, {
        cx: e.clientX - r.left, cy: e.clientY - r.top,
        clientX: e.clientX,     clientY: e.clientY
      });
      try { c.setPointerCapture(e.pointerId); } catch(_) {}
      e.preventDefault();
      c.classList.add('dragging');

      if (pointers.size === 1) {
        const p = pointers.get(e.pointerId);
        pinch = null; longFired = false;

        /* A-6: life-track row reorder drag from the left panel. */
        const tRow = (typeof getLifeTrackRowAt === 'function') ? getLifeTrackRowAt(p.cx, p.cy) : null;
        if (tRow && (typeof isLifeTrackActionTarget !== 'function' || !isLifeTrackActionTarget(p.cx, p.cy))) {
          startLifeTrackDrag(tRow.id, e.clientY);
          drag = { pointerId: e.pointerId, reorder: true };
          return;
        }

        drag = {
          pointerId: e.pointerId,
          sx: e.clientX, sy: e.clientY,
          px: V.panX,    py: V.panY,
          cx: p.cx,      cy: p.cy,
          t: Date.now(), moved: false, axis: null, recent: []
        };
        // Long-press → add event is a touch/pen affordance only.
        if (isTouch(e)) {
          cancelLong();
          longTimer = setTimeout(() => {
            if (!drag || drag.moved) return;
            longFired = true; cancelLong();
            if (isInPlotArea(drag.cx, drag.cy)) {
              let bestId = null, bestDist = Infinity, vi = 0;
              S.lifeTracks.forEach(u => {
                if (u.visible === false) return;
                const d = Math.abs(crossScreenCoord(drag.cx, drag.cy) - trackY(vi));
                if (d < TRACK_H / 2 && d < bestDist) { bestDist = d; bestId = u.id; }
                vi++;
              });
              UI.addEvent(bestId, String(Math.round(sy2yr(primaryScreenCoord(drag.cx, drag.cy)))));
            }
          }, LPRESS_MS);
        }
      } else if (pointers.size === 2) {
        cancelLong();
        if (drag && drag.reorder && typeof finishLifeTrackDrag === 'function') finishLifeTrackDrag();
        drag = null;
        const [a, b] = [...pointers.values()];
        pinch = { dist: pinchDist(a, b) };
      }
    });

    c.addEventListener('pointermove', e => {
      const r = c.getBoundingClientRect();
      // Hover tooltip for non-pressed mouse movement (no captured pointer).
      if (!pointers.has(e.pointerId)) {
        if (e.pointerType === 'mouse' && typeof updateTip === 'function') {
          updateTip(e.clientX - r.left, e.clientY - r.top);
        }
        return;
      }
      const p = pointers.get(e.pointerId);
      p.cx = e.clientX - r.left; p.cy = e.clientY - r.top;
      p.clientX = e.clientX;     p.clientY = e.clientY;

      /* A-6: life-track row drag takes priority while active. */
      if (drag && drag.reorder && drag.pointerId === e.pointerId && pointers.size === 1) {
        if (typeof updateLifeTrackDrag === 'function') updateLifeTrackDrag(e.clientY);
        e.preventDefault();
        return;
      }

      if (pointers.size >= 2 && pinch) {
        const [a, b] = [...pointers.values()];
        const newDist = pinchDist(a, b);
        const midPrimary = pinchMidPrimary(a, b);
        /* Pinch zooms only the time (primary) axis, anchored at the midpoint. */
        if (pinch.dist > 1 && newDist > 1) doZoom(newDist / pinch.dist, midPrimary);
        pinch.dist = newDist;
        e.preventDefault();
        return;
      }

      if (pointers.size === 1 && drag && drag.pointerId === e.pointerId) {
        const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
        const adx = Math.abs(dx), ady = Math.abs(dy);
        if (!drag.moved && (adx > TAP_SLOP || ady > TAP_SLOP)) drag.moved = true;
        if (drag.moved) cancelLong();

        const now = Date.now();
        drag.recent.push({ x: e.clientX, y: e.clientY, t: now });
        while (drag.recent.length > 1 && now - drag.recent[0].t > 100) drag.recent.shift();

        if (isVerticalTimelineLayout()) {
          if (!drag.axis && (adx > AXIS_LOCK || ady > AXIS_LOCK)) {
            drag.axis = (ady >= adx) ? 'time' : 'universe';
          }
          if (drag.axis === 'time') {
            /* Vertical drag scrolls the time axis (panX is the primary/time pan). */
            V.panX = drag.px + dy;
            clampPanX();
            render();
          } else if (drag.axis === 'universe') {
            /* Horizontal drag previews paging across universe columns. */
            V.panY = drag.py + dx;
            clampPanY();
            render();
          }
        } else {
          /* Should not run on desktop (mouse goes through mousedown handler),
             but if a touch device is in horizontal layout, fall back to free pan. */
          V.panX = drag.px + dx;
          V.panY = drag.py + dy;
          clampPanX(); clampPanY();
          render();
        }
        e.preventDefault();
      }
    });

    function endPointer(e) {
      const wasReorder = !!(drag && drag.reorder && drag.pointerId === e.pointerId);
      if (pointers.has(e.pointerId)) {
        try { c.releasePointerCapture(e.pointerId); } catch(_) {}
        pointers.delete(e.pointerId);
      }
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) c.classList.remove('dragging');
      if (pointers.size > 0 || !drag) {
        if (wasReorder && pointers.size === 0 && typeof finishLifeTrackDrag === 'function') finishLifeTrackDrag();
        if (pointers.size === 0) drag = null;
        return;
      }

      cancelLong();

      /* A-6: life-track row reorder drag end. */
      if (drag.reorder) {
        if (typeof finishLifeTrackDrag === 'function') finishLifeTrackDrag();
        drag = null; longFired = false;
        return;
      }

      // Click: total movement under TAP_SLOP and no long-press fired.
      // pointerup with movement <4px → click → hit test → open detail modal.
      if (!drag.moved && !longFired) {
        handleClick(drag.cx, drag.cy);
        drag = null; longFired = false;
        return;
      }

      if (drag.moved && !longFired && isVerticalTimelineLayout()) {
        const samples = drag.recent || [];
        let velX = 0, velY = 0;
        if (samples.length >= 2) {
          const a = samples[0], b = samples[samples.length - 1];
          const dt = Math.max(1, b.t - a.t);
          velX = (b.x - a.x) / dt;
          velY = (b.y - a.y) / dt;
        }

        if (drag.axis === 'universe') {
          /* Paged snap to nearest universe column with 35%/0.4px·ms commit. */
          const tracks = (S.lifeTracks || S.universes || [])
            .filter(u => u.visible !== false);
          const cnv = CV();
          if (tracks.length > 0 && cnv && cnv.width) {
            const centerCross = cnv.width / 2;
            let curIdx = 0, bestD = Infinity;
            for (let i = 0; i < tracks.length; i++) {
              const d = Math.abs(universeToCross(i) - centerCross);
              if (d < bestD) { bestD = d; curIdx = i; }
            }
            const totalDx = e.clientX - drag.sx;
            const ratio = Math.abs(totalDx) / Math.max(1, cnv.width);
            let targetIdx = curIdx;
            if (velX > FLING_VEL || (totalDx > 0 && ratio > PAGE_RATIO)) targetIdx = curIdx - 1;
            else if (velX < -FLING_VEL || (totalDx < 0 && ratio > PAGE_RATIO)) targetIdx = curIdx + 1;
            targetIdx = Math.max(0, Math.min(tracks.length - 1, targetIdx));
            if (typeof window.centerUniverseColumn === 'function') {
              window.centerUniverseColumn(tracks[targetIdx].id, true);
            }
          }
        } else if (drag.axis === 'time') {
          /* Inertial scroll on the time axis after a flick. */
          let v = velY;
          if (Math.abs(v) > 0.05) {
            const step = () => {
              V.panX += v * 16;
              v *= MOMENTUM_DECAY;
              clampPanX();
              render();
              if (Math.abs(v) > MOMENTUM_MIN) momentumRAF = requestAnimationFrame(step);
              else momentumRAF = null;
            };
            momentumRAF = requestAnimationFrame(step);
          }
        }
      }

      drag = null; longFired = false;
    }

    c.addEventListener('pointerup',     endPointer);
    c.addEventListener('pointercancel', endPointer);
  })();

  // ---- Double-click: add event at that position ----
  c.addEventListener('dblclick', e => {
    const r  = c.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    if (!isInPlotArea(mx, my)) return;

    // Find nearest visible universe track
    let bestId = null, bestDist = Infinity;
    let vi = 0;
    S.lifeTracks.forEach(u => {
      if (u.visible === false) return;
      const d = Math.abs(crossScreenCoord(mx, my) - trackY(vi));
      if (d < TRACK_H / 2 && d < bestDist) { bestDist = d; bestId = u.id; }
      vi++;
    });
    const yr = Math.round(sy2yr(primaryScreenCoord(mx, my)));
    UI.addEvent(bestId, String(yr));
  });
}

/* ---- Tooltip ---- */
function updateTip(mx, my) {
  const tip = document.getElementById('tip');
  let found = false;
  for (const t of [...hits].reverse()) {
    if (t.type === 'lbl_cluster') {
      if (!isInPlotArea(mx, my)) continue;
      if (mx >= t.x && mx <= t.x + t.w && my >= t.y && my <= t.y + t.h) {
        const tbH = document.getElementById('toolbar').clientHeight;
        tip.style.display = 'block';
        tip.style.left    = (t.cx + 16) + 'px';
        tip.style.top     = (t.cy + tbH - 28) + 'px';
        tip.innerHTML     = '<strong>+' + (t.events.length - 1) + ' more events</strong><br>Click to see list';
        CV().style.cursor = 'pointer';
        found = true; break;
      }
    }
    if (t.type === 'cluster') {
      if (!isInPlotArea(mx, my)) continue;
      const dx = mx - t.x, dy = my - t.y;
      if (dx * dx + dy * dy < t.r * t.r) {
        const tbH = document.getElementById('toolbar').clientHeight;
        tip.style.display = 'block';
        tip.style.left    = (t.x + 22) + 'px';
        tip.style.top     = (t.y + tbH - 28) + 'px';
        tip.innerHTML     = '<strong>Cluster</strong><br>Click to zoom in';
        CV().style.cursor = 'pointer';
        found = true; break;
      }
    }
    if (t.type === 'event') {
      if (!isInPlotArea(mx, my)) continue;
      const dx = mx - t.x, dy = my - t.y;
      if (dx * dx + dy * dy < t.r * t.r) {
        const ev = S.events.find(e => e.id === t.id);
        if (ev) {
          const u = getU(ev.universeId);
          const tbH = document.getElementById('toolbar').clientHeight;
          tip.style.display = 'block';
          tip.style.left    = (t.x + 22) + 'px';
          tip.style.top     = (t.y + tbH - 28) + 'px';
          tip.innerHTML     = '<strong>' + esc(ev.title) + '</strong><br>' +
            (ev.date || '?') + (u ? ' &middot; <span style="color:' + u.color + '">' + esc(u.name) + '</span>' : '');
          CV().style.cursor = 'pointer';
          found = true; break;
        }
      }
    }
  }
  if (!found) {
    tip.style.display = 'none';
    if (!drag.on) CV().style.cursor = 'grab';
  }
}

/* ---- Click handler ---- */
function handleClick(mx, my) {
  for (const t of [...hits].reverse()) {
    if (t.type === 'lbl_cluster') {
      if (!isInPlotArea(mx, my)) continue;
      if (mx >= t.x && mx <= t.x + t.w && my >= t.y && my <= t.y + t.h) {
        showLblClusterPop(t.events, t.cx, t.cy);
        return;
      }
    }
    if (t.type === 'cluster') {
      if (!isInPlotArea(mx, my)) continue;
      const dx = mx - t.x, dy = my - t.y;
      if (dx * dx + dy * dy < t.r * t.r) {
        doZoom(2.5, isVerticalTimelineLayout() ? t.y : t.x);
        return;
      }
    }
    if (t.type === 'event') {
      if (!isInPlotArea(mx, my)) continue;
      const dx = mx - t.x, dy = my - t.y;
      if (dx * dx + dy * dy < t.r * t.r) { M.openEvDetail(t.id); return; }
    }
    if (t.type === 'u-hide' || t.type === 'u-edit' || t.type === 'u-info' || t.type === 'u-del') {
      if (mx >= t.x && mx <= t.x + t.w && my >= t.y && my <= t.y + t.h) {
        if (t.type === 'u-hide') toggleVis(t.id);
        else if (t.type === 'u-edit') M.openEditUni(t.id);
        else if (t.type === 'u-info') M.openUniInfo(t.id);
        else if (t.type === 'u-del') {
          const u = getU(t.id);
          const evCnt = S.events.filter(e => e.universeId === t.id).length;
          const msg = evCnt > 0
            ? `Delete "${u ? u.name : 'life track'}" and its ${evCnt} event${evCnt !== 1 ? 's' : ''}?`
            : `Delete "${u ? u.name : 'life track'}"?`;
          delUni(t.id); // ftConfirmGate is invoked inside delUni — no outer confirm needed
        }
        return;
      }
    }
  }
}

/* =====================================================
   ZOOM
   ===================================================== */
function doZoom(factor, mouseX) {
  const mxF = mouseX != null ? mouseX : centerX();
  const wx0 = sw(mxF);
  const minSc = getMinScale();
  V.scale = clamp(V.scale * factor, minSc, MAX_SC);
  V.panX  = mxF - centerX() - wx0 * V.scale;
  clampPanX();
  document.getElementById('zoom-pct').textContent = Math.round(V.scale * 100) + '%';
  render();
}

function resetView() {
  V.panX = 0; V.panY = 0;
  /* BE-18: clamp the reset scale to the same floor/ceiling doZoom uses. A
     hardcoded 1 can be below getMinScale() for very wide year ranges (or above
     it on a tiny canvas), so the next doZoom would re-clamp and snap the view.
     Report the real zoom via formatZoomPercent() instead of a literal '100%'. */
  const minSc = (typeof getMinScale === 'function') ? getMinScale() : 1;
  V.scale = clamp(1, minSc, MAX_SC);
  const z = document.getElementById('zoom-pct');
  if (z) z.textContent = (typeof formatZoomPercent === 'function')
    ? formatZoomPercent() : Math.round(V.scale * 100) + '%';
  render();
}

/* === Fit-to-data (ported from Universe — A-4) ============
   fitFullTimeline: zoom out to the minimum scale and recenter.
   See UI.fitToData (appended at EOF) for the data-bounded fit
   that the #fit-btn toolbar button calls.
   ======================================================== */
function fitFullTimeline() {
  V.scale = (typeof getMinScale === 'function') ? getMinScale() : V.scale;
  V.panX = 0;
  if (typeof clampPanX === 'function') clampPanX();
  const z = document.getElementById('zoom-pct');
  if (z) z.textContent = (typeof formatZoomPercent === 'function')
    ? formatZoomPercent() : Math.round(V.scale * 100) + '%';
}

function formatZoomPercent() {
  const pct = V.scale * 100;
  if (pct < 0.01) return pct.toFixed(4) + '%';
  if (pct < 1)    return pct.toFixed(2) + '%';
  return Math.round(pct) + '%';
}

function goToToday() {
  const now = new Date();
  const todayDec = now.getFullYear() + now.getMonth() / 12 + now.getDate() / 365;
  const targetPanX = -yw(todayDec) * V.scale;
  const startPanX = V.panX;

  // Temporarily set target to check clamped value
  const savedPanX = V.panX;
  V.panX = targetPanX;
  clampPanX();
  const clampedTarget = V.panX;
  V.panX = savedPanX;

  const diff = clampedTarget - startPanX;
  if (Math.abs(diff) < 0.5) { render(); return; }

  const duration = 420;
  const startTime = performance.now();
  function ease(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

  function step(now) {
    const t = Math.min((now - startTime) / duration, 1);
    V.panX = startPanX + diff * ease(t);
    clampPanX();
    render();
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

const MemoryTour = {
  active: false,
  paused: false,
  items: [],
  idx: 0,
  snapshot: null,
  reducedMotion: false,
  _timer: null,
  _raf: null,

  start() {
    const switched = _currentView !== 'timeline';
    if (switched) switchView('timeline');
    this.items = this._buildItems();
    if (!this.items.length) {
      notify('Add at least one dated or ordered event before starting Memory Tour.', 'info');
      return;
    }
    if (typeof ContinuityTour !== 'undefined' && ContinuityTour.active) ContinuityTour.stop(false);
    if (this.active) {
      this.idx = 0;
      this.paused = false;
      this.focusCurrent(true);
      return;
    }
    this.snapshot = { panX: V.panX, panY: V.panY, scale: V.scale };
    this.active = true;
    this.paused = false;
    this.idx = 0;
    this.reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    this._overlay().classList.add('active');
    this._overlay().setAttribute('aria-hidden', 'false');
    this.focusCurrent(true);
    if (switched) setTimeout(() => { if (this.active) this.focusCurrent(true); }, 80);
  },

  stop(restoreView) {
    this._clearTimers();
    if (!this.active && !restoreView) return;
    const shouldRestore = restoreView && this.snapshot;
    this.active = false;
    this.paused = false;
    this.items = [];
    this.idx = 0;
    this._overlay().classList.remove('active');
    this._overlay().setAttribute('aria-hidden', 'true');
    if (shouldRestore) this._applyView(this.snapshot, this.reducedMotion);
    this.snapshot = null;
  },

  next() {
    if (!this.active || !this.items.length) return;
    this.idx = (this.idx + 1) % this.items.length;
    this.focusCurrent();
  },

  prev() {
    if (!this.active || !this.items.length) return;
    this.idx = (this.idx - 1 + this.items.length) % this.items.length;
    this.focusCurrent();
  },

  togglePause() {
    if (!this.active) return;
    this.paused = !this.paused;
    this._pauseBtn().textContent = this.paused ? 'Resume' : 'Pause';
    if (this.paused) this._clearTimerOnly();
    else this._scheduleAdvance();
  },

  focusCurrent(instant) {
    if (!this.active || !this.items.length) return;
    const item = this.items[this.idx];
    this._renderCard(item);
    this._renderSpotlight(item);
    this._applyView(this._targetFor(item), !!instant || this.reducedMotion);
    this._pauseBtn().textContent = this.paused ? 'Resume' : 'Pause';
    this._progress().textContent = (this.idx + 1) + ' / ' + this.items.length;
    if (!this.paused) this._scheduleAdvance();
  },

  _buildItems() {
    const all = S.events.map((ev, index) => {
      const parsed = parseDate(ev.date, ev.time);
      return { ev, index, parsed };
    }).filter(item => getVisIdx(item.ev.universeId) !== -1);
    if (!all.length) return [];
    const withDates = all.filter(item => item.parsed !== null).sort((a, b) => a.parsed - b.parsed || a.index - b.index);
    const withoutDates = all.filter(item => item.parsed === null).sort((a, b) => a.index - b.index);
    const currentYear = sy2yr(CV().width * 0.5);
    let lastKnownYear = withDates.length ? withDates[0].parsed : currentYear;
    const ordered = withDates.concat(withoutDates);
    return ordered.map(item => {
      const focusYear = item.parsed != null ? item.parsed : lastKnownYear;
      if (item.parsed != null) lastKnownYear = item.parsed;
      return {
        ev: item.ev,
        focusYear,
        dateLabel: item.ev.date || 'Date not set',
        desc: ((item.ev.description || item.ev.notes || '').trim() || 'No extra notes for this moment yet.').slice(0, 220)
      };
    });
  },

  _targetFor(item) {
    const c = CV();
    const vi = Math.max(0, getVisIdx(item.ev.universeId));
    const desiredScale = clamp(Math.max(this.snapshot ? this.snapshot.scale : V.scale, 1.08), MIN_SC, MAX_SC);
    const targetX = Math.max(LEFT_W + 130, c.width * 0.6);
    const targetY = Math.min(c.height - 120, Math.max(RULER_H + 100, c.height * 0.5));
    const panX = targetX - centerX() - yw(item.focusYear) * desiredScale;
    const panY = targetY - (RULER_H + vi * TRACK_H + TRACK_H / 2);
    return { panX, panY, scale: desiredScale };
  },

  _applyView(target, instant) {
    this._clearAnimOnly();
    if (instant) {
      V.panX = target.panX;
      V.panY = target.panY;
      V.scale = target.scale;
      clampPanX();
      clampPanY();
      render();
      this._renderSpotlight(this.items[this.idx]);
      return;
    }
    const start = { panX: V.panX, panY: V.panY, scale: V.scale };
    const startTime = performance.now();
    const duration = 850;
    const ease = t => 1 - Math.pow(1 - t, 3);
    const tick = now => {
      const t = Math.min(1, (now - startTime) / duration);
      const k = ease(t);
      V.panX = start.panX + (target.panX - start.panX) * k;
      V.panY = start.panY + (target.panY - start.panY) * k;
      V.scale = start.scale + (target.scale - start.scale) * k;
      clampPanX();
      clampPanY();
      render();
      this._renderSpotlight(this.items[this.idx]);
      if (t < 1 && this.active) this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  },

  _renderCard(item) {
    const title = document.getElementById('memory-tour-title');
    const meta = document.getElementById('memory-tour-meta');
    const desc = document.getElementById('memory-tour-desc');
    const track = getU(item.ev.universeId);
    if (title) title.textContent = item.ev.title || 'Untitled memory';
    if (meta) meta.textContent = (item.dateLabel || 'Date not set') + (track ? '  •  ' + track.name : '');
    if (desc) desc.textContent = item.desc;
  },

  _renderSpotlight(item) {
    const spot = document.getElementById('memory-tour-spotlight');
    if (!spot || !item) return;
    const vi = Math.max(0, getVisIdx(item.ev.universeId));
    spot.style.left = ws(yw(item.focusYear)) + 'px';
    spot.style.top = trackY(vi) + 'px';
    spot.style.opacity = this.active ? '1' : '0';
  },

  _scheduleAdvance() {
    this._clearTimerOnly();
    this._timer = setTimeout(() => {
      if (!this.active || this.paused) return;
      this.next();
    }, this.reducedMotion ? 5200 : 4600);
  },

  _clearTimerOnly() {
    if (this._timer) clearTimeout(this._timer);
    this._timer = null;
  },

  _clearAnimOnly() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  },

  _clearTimers() {
    this._clearTimerOnly();
    this._clearAnimOnly();
  },

  _overlay() { return document.getElementById('memory-tour-overlay'); },
  _pauseBtn() { return document.getElementById('memory-tour-pause'); },
  _progress() { return document.getElementById('memory-tour-progress'); }
};

document.addEventListener('keydown', function(e) {
  if (MemoryTour.active && e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    MemoryTour.stop(true);
  }
}, true);

window.addEventListener('resize', function() {
  if (MemoryTour.active) {
    setTimeout(function() { MemoryTour.focusCurrent(true); }, 80);
  }
});

/* =====================================================
   #020: CONTINUITY TOUR (ported from Universe)
   Faster, tighter-zoom sibling to MemoryTour — both walk
   the timeline chronologically; Continuity is the brisk
   "highlight reel" pass. Reuses the shared .tour-* CSS.
   ===================================================== */
const ContinuityTour = {
  active: false,
  paused: false,
  items: [],
  idx: 0,
  snapshot: null,
  reducedMotion: false,
  _timer: null,
  _raf: null,

  start() {
    const switched = _currentView !== 'timeline';
    if (switched) switchView('timeline');
    this.items = this._buildItems();
    if (!this.items.length) {
      notify('Add at least one visible event before starting Continuity Tour.', 'info');
      return;
    }
    if (MemoryTour.active) MemoryTour.stop(false);
    if (this.active) {
      this.idx = 0;
      this.paused = false;
      this.focusCurrent(true);
      return;
    }
    this.snapshot = { panX: V.panX, panY: V.panY, scale: V.scale };
    this.active = true;
    this.paused = false;
    this.idx = 0;
    this.reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    this._overlay().classList.add('active');
    this._overlay().setAttribute('aria-hidden', 'false');
    this.focusCurrent(true);
    if (switched) setTimeout(() => { if (this.active) this.focusCurrent(true); }, 80);
  },

  stop(restoreView) {
    this._clearTimers();
    if (!this.active && !restoreView) return;
    const shouldRestore = restoreView && this.snapshot;
    this.active = false;
    this.paused = false;
    this.items = [];
    this.idx = 0;
    this._overlay().classList.remove('active');
    this._overlay().setAttribute('aria-hidden', 'true');
    if (shouldRestore) this._applyView(this.snapshot, this.reducedMotion);
    this.snapshot = null;
  },

  next() {
    if (!this.active || !this.items.length) return;
    this.idx = (this.idx + 1) % this.items.length;
    this.focusCurrent();
  },

  prev() {
    if (!this.active || !this.items.length) return;
    this.idx = (this.idx - 1 + this.items.length) % this.items.length;
    this.focusCurrent();
  },

  togglePause() {
    if (!this.active) return;
    this.paused = !this.paused;
    this._pauseBtn().textContent = this.paused ? 'Resume' : 'Pause';
    if (this.paused) this._clearTimerOnly();
    else this._scheduleAdvance();
  },

  focusCurrent(instant) {
    if (!this.active || !this.items.length) return;
    const item = this.items[this.idx];
    this._renderCard(item);
    this._renderSpotlight(item);
    this._applyView(this._targetFor(item), !!instant || this.reducedMotion);
    this._pauseBtn().textContent = this.paused ? 'Resume' : 'Pause';
    this._progress().textContent = (this.idx + 1) + ' / ' + this.items.length;
    if (!this.paused) this._scheduleAdvance();
  },

  _buildItems() {
    const all = S.events.map((ev, index) => {
      const parsed = parseDate(ev.date, ev.time);
      return { ev, index, parsed };
    }).filter(item => getVisIdx(item.ev.universeId) !== -1);
    if (!all.length) return [];
    const withDates = all.filter(item => item.parsed !== null).sort((a, b) => a.parsed - b.parsed || a.index - b.index);
    const withoutDates = all.filter(item => item.parsed === null).sort((a, b) => a.index - b.index);
    const currentYear = sy2yr(CV().width * 0.5);
    let lastKnownYear = withDates.length ? withDates[0].parsed : currentYear;
    return withDates.concat(withoutDates).map(item => {
      const focusYear = item.parsed != null ? item.parsed : lastKnownYear;
      if (item.parsed != null) lastKnownYear = item.parsed;
      return {
        ev: item.ev,
        focusYear,
        dateLabel: item.ev.date || 'Date not set',
        desc: ((item.ev.description || item.ev.notes || '').trim() || 'No summary has been written for this event yet.').slice(0, 220)
      };
    });
  },

  _targetFor(item) {
    const c = CV();
    const vi = Math.max(0, getVisIdx(item.ev.universeId));
    const desiredScale = clamp(Math.max(this.snapshot ? this.snapshot.scale : V.scale, 1.12), MIN_SC, MAX_SC);
    const targetX = Math.max(LEFT_W + 150, c.width * 0.62);
    const targetY = Math.min(c.height - 120, Math.max(RULER_H + 100, c.height * 0.52));
    const panX = targetX - centerX() - yw(item.focusYear) * desiredScale;
    const panY = targetY - (RULER_H + vi * TRACK_H + TRACK_H / 2);
    return { panX, panY, scale: desiredScale };
  },

  _applyView(target, instant) {
    this._clearAnimOnly();
    if (instant) {
      V.panX = target.panX;
      V.panY = target.panY;
      V.scale = target.scale;
      clampPanX();
      clampPanY();
      render();
      this._renderSpotlight(this.items[this.idx]);
      return;
    }
    const start = { panX: V.panX, panY: V.panY, scale: V.scale };
    const startTime = performance.now();
    const duration = 950;
    const ease = t => 1 - Math.pow(1 - t, 3);
    const tick = now => {
      const t = Math.min(1, (now - startTime) / duration);
      const k = ease(t);
      V.panX = start.panX + (target.panX - start.panX) * k;
      V.panY = start.panY + (target.panY - start.panY) * k;
      V.scale = start.scale + (target.scale - start.scale) * k;
      clampPanX();
      clampPanY();
      render();
      this._renderSpotlight(this.items[this.idx]);
      if (t < 1 && this.active) this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  },

  _renderCard(item) {
    const title = document.getElementById('continuity-tour-title');
    const meta = document.getElementById('continuity-tour-meta');
    const desc = document.getElementById('continuity-tour-desc');
    const track = getU(item.ev.universeId);
    if (title) title.textContent = item.ev.title || 'Untitled event';
    if (meta) meta.textContent = (item.dateLabel || 'Date not set') + (track ? '  •  ' + track.name : '');
    if (desc) desc.textContent = item.desc;
  },

  _renderSpotlight(item) {
    const spot = document.getElementById('continuity-tour-spotlight');
    if (!spot || !item) return;
    const vi = Math.max(0, getVisIdx(item.ev.universeId));
    spot.style.left = ws(yw(item.focusYear)) + 'px';
    spot.style.top = trackY(vi) + 'px';
    spot.style.opacity = this.active ? '1' : '0';
  },

  _scheduleAdvance() {
    this._clearTimerOnly();
    this._timer = setTimeout(() => {
      if (!this.active || this.paused) return;
      this.next();
    }, this.reducedMotion ? 5400 : 4400);
  },

  _clearTimerOnly() {
    if (this._timer) clearTimeout(this._timer);
    this._timer = null;
  },

  _clearAnimOnly() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  },

  _clearTimers() {
    this._clearTimerOnly();
    this._clearAnimOnly();
  },

  _overlay() { return document.getElementById('continuity-tour-overlay'); },
  _pauseBtn() { return document.getElementById('continuity-tour-pause'); },
  _progress() { return document.getElementById('continuity-tour-progress'); }
};

document.addEventListener('keydown', function(e) {
  if (ContinuityTour.active && e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    ContinuityTour.stop(true);
  }
}, true);

window.addEventListener('resize', function() {
  if (ContinuityTour.active) {
    setTimeout(function() { ContinuityTour.focusCurrent(true); }, 80);
  }
});

function toggleVis(id) {
  const u = getU(id);
  if (!u) return;
  u.dimmed = !u.dimmed;
  render(); Store.autosave();
}

/* =====================================================
   LIGHTBOX
   ===================================================== */
function openLightbox(src) {
  const lb = document.getElementById('lightbox');
  var _lbi = document.getElementById('lb-img');
  _lbi.src = src;
  _lbi.alt = 'Enlarged image'; // announce a photo is shown rather than empty/decorative (BS-9)
  lb.style.display = 'flex';
}
function closeLightbox() {
  document.getElementById('lightbox').style.display = 'none';
}

/* =====================================================
   MEDIA HELPERS
   ===================================================== */
function getYTVideoId(url) {
  const m = (url || '').match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}
function isYouTubeUrl(url) {
  return /(?:youtube\.com|youtu\.be)/.test(url || '');
}

/** Rebuild the media list inside the edit form */
function rebuildMediaList() {
  const el = document.getElementById('ml-display');
  if (!el) return;
  if (_editMediaList.length === 0) {
    el.innerHTML = '<div style="font-size:12px;color:#bbb;padding:3px 0 6px">No attachments yet — consider adding a photo, scanned document, certificate, or link to help tell this story.</div>';
    return;
  }
  el.innerHTML = _editMediaList.map((m, i) => {
    const icon = m.type === 'image' ? '\uD83D\uDDBC' : m.type === 'youtube' ? '\u25B6\uFE0F' : '\uD83D\uDD17';
    const name = m.name || m.src.substring(0, 50);
    return '<div class="media-edit-item">' +
      '<span class="med-icon">' + icon + '</span>' +
      '<span class="med-name">' + esc(name) + '</span>' +
      '<button class="btn danger sm" onclick="removeMedia(' + i + ')">&#10005;</button></div>';
  }).join('');
}

function addImageMedia(e) {
  const f = e.target.files[0]; if (!f) return;
  if (f.size > 5 * 1024 * 1024) { notify('Image too large (max 5 MB for localStorage).', 'error'); e.target.value=''; return; }
  const reader = new FileReader();
  reader.onload = ev => {
    _editMediaList.push({ id: uid(), type: 'image', name: f.name, src: ev.target.result });
    rebuildMediaList();
    notify('Image added \u2713', 'success');
  };
  reader.readAsDataURL(f);
  e.target.value = '';
}

function addLinkMedia() {
  const urlEl  = document.getElementById('yt-input');
  const nameEl = document.getElementById('yt-name');
  const url  = (urlEl  ? urlEl.value  : '').trim();
  const name = (nameEl ? nameEl.value : '').trim();
  if (!url) { notify('Please enter a URL.', 'error'); return; }
  const type = isYouTubeUrl(url) ? 'youtube' : 'link';
  _editMediaList.push({ id: uid(), type, name: name || url, src: url });
  if (urlEl)  urlEl.value  = '';
  if (nameEl) nameEl.value = '';
  rebuildMediaList();
  notify((type === 'youtube' ? 'YouTube video' : 'Link') + ' added \u2713', 'success');
}

function removeMedia(idx) {
  _editMediaList.splice(idx, 1);
  rebuildMediaList();
}

/** HTML for the media attachment editor block (used inside forms) */
function buildMediaForm() {
  return '<div class="fg" style="border-top:1px solid #eee;padding-top:14px;margin-top:4px">' +
    '<div class="sec-hd" style="margin-bottom:8px"><h3>\uD83D\uDCCE Attachments &amp; Media</h3></div>' +
    '<div style="font-size:11px;color:#999;margin-bottom:8px;line-height:1.6">Attach anything that brings this moment to life — scanned documents (birth certificates, diplomas, contracts), certificates &amp; awards, personal photos, home videos, newspaper clippings, letters, or academic transcripts.</div>' +
    '<div id="ml-display"></div>' +
    '<div class="media-add-area">' +
    '<div class="media-row">' +
    '<button type="button" class="btn light sm" onclick="document.getElementById(\'media-file-in\').click()">\uD83D\uDDBC Add Photo or Document</button>' +
    '<input type="file" id="media-file-in" accept="image/*" style="display:none" onchange="addImageMedia(event)">' +
    '<span style="font-size:11px;color:#bbb">(photo, scanned doc, certificate &mdash; max 5 MB)</span>' +
    '</div>' +
    '<div class="media-row">' +
    '<input id="yt-input" class="mi" placeholder="LinkedIn, published work, recorded interview, voice memo, YouTube, or any URL\u2026" style="flex:1">' +
    '<input id="yt-name" class="mi" placeholder="Label (optional)" style="width:130px">' +
    '<button type="button" class="btn accent sm" onclick="addLinkMedia()">&#65291; Add</button>' +
    '</div>' +
    '</div></div>';
}

/** Render media items in detail (read-only) view */
function buildMediaDisplay(media) {
  if (!media || media.length === 0) return '';
  let html = '<div class="media-section"><div class="media-section-title">\uD83D\uDCCE MEDIA &amp; ATTACHMENTS</div><div class="media-gallery">';
  for (const m of media) {
    if (m.type === 'image') {
      html += '<div class="media-img-item">' +
        (m.name ? '<div class="media-img-name">\uD83D\uDDBC ' + esc(m.name) + '</div>' : '') +
        '<img src="' + esc(m.src) + '" alt="' + esc(m.name || 'image') + '" onclick="openLightbox(this.src)" title="Click to enlarge"></div>';
    } else if (m.type === 'youtube') {
      const vid = getYTVideoId(m.src);
      if (vid) {
        html += '<div>' +
          (m.name && m.name !== m.src ? '<div style="font-size:11px;color:#aaa;margin-bottom:4px">\u25B6\uFE0F ' + esc(m.name) + '</div>' : '') +
          '<div class="media-yt-wrap"><iframe src="https://www.youtube.com/embed/' + encodeURIComponent(vid) +
          '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div></div>';
      } else {
        html += '<div class="media-link-item"><span>\uD83D\uDD17</span><a href="' + esc(m.src) + '" target="_blank" rel="noopener">' + esc(m.name || m.src) + '</a></div>';
      }
    } else {
      html += '<div class="media-link-item"><span>\uD83D\uDD17</span><a href="' + esc(m.src) + '" target="_blank" rel="noopener">' + esc(m.name || m.src) + '</a></div>';
    }
  }
  html += '</div></div>';
  return html;
}

/** Render notes block in detail (read-only) view */
function buildNotesDisplay(notes) {
  if (!notes || !notes.trim()) return '';
  return '<div><div class="notes-label">\uD83D\uDCDD NOTES</div>' +
    '<div class="notes-display">' + esc(notes) + '</div></div>';
}

/* =====================================================
   MODAL ENGINE
   ===================================================== */
let _modalReturnFocus = null;

const M = {
  bg:   () => document.getElementById('modal-bg'),
  crumb:() => document.getElementById('m-crumb'),
  ttl:  () => document.getElementById('m-title'),
  btns: () => document.getElementById('m-btns'),
  body: () => document.getElementById('m-body'),
  foot: () => document.getElementById('m-foot'),

  open()  {
    if (!this.bg().classList.contains('open')) {
      const active = document.activeElement;
      _modalReturnFocus = active && typeof active.focus === 'function' ? active : null;
    }
    this.bg().classList.add('open');
    document.body.classList.add('modal-open');
  },
  /* Hardened close: idempotent, never throws, runs registered cleanups.
     Fixes Help-modal crash when clicking Got it / Cancel / X / Esc / outside. */
  _cleanups: [],
  _closing: false,
  onClose(fn) { if (typeof fn === 'function') this._cleanups.push(fn); },
  close() {
    if (this._closing) return;                                /* re-entry guard */
    const bg = this.bg();
    if (!bg || !bg.classList.contains('open')) {              /* already closed: no-op */
      MS = [];
      return;
    }
    this._closing = true;
    try {
      /* 1. Run cleanups registered by active screen */
      const queue = this._cleanups.splice(0, this._cleanups.length);
      queue.forEach(fn => { try { fn(); } catch(_){} });
      /* 2. Drop open class + clear stack */
      try { bg.classList.remove('open'); } catch(_){}
      try { document.body.classList.remove('modal-open'); } catch(_){}
      try { bg.setAttribute('aria-hidden','true'); } catch(_){}
      MS = [];
      /* 3. Restore focus safely */
      const toFocus = _modalReturnFocus;
      _modalReturnFocus = null;
      if (toFocus && document.contains(toFocus)) {
        setTimeout(() => { try { toFocus.focus(); } catch (_) {} }, 0);
      }
    } catch (err) {
      /* Hard fallback: never crash the page */
      try { bg.classList.remove('open'); } catch(_){}
      try { MS = []; } catch(_){}
      try { if (typeof notify === 'function') notify('Closed the panel (recovered from a hiccup).'); } catch(_){}
    } finally {
      this._closing = false;
    }
  },
  back()  {
    MS.pop();
    if (MS.length === 0) this.close(); else this.render();
  },
  /* Continued below — UI overlay helper installed after the M literal */

  /* Re-draw top of modal stack */
  render() {
    if (!MS.length) { this.close(); return; }
    const top = MS[MS.length - 1];
    this.btns().innerHTML = '';

    const mkBtn = (lbl, cls, fn, ariaLabel) => {
      const b = document.createElement('button');
      b.className = 'btn light ' + (cls || '');
      b.type = 'button';
      b.innerHTML = lbl; b.onclick = fn;
      if (ariaLabel) b.setAttribute('aria-label', ariaLabel);
      this.btns().appendChild(b);
    };
    if (MS.length > 1) mkBtn('&#8592; Back', '', () => M.back(), 'Go back');
    mkBtn('&#10005;', '', () => M.close(), 'Close');

    switch (top.t) {
      case 'evDetail':    this._evDetail(top);     break;
      case 'seDetail':    this._seDetail(top);     break;
      case 'addEv':       this._addEv(top);        break;
      case 'editEv':      this._editEv(top);       break;
      case 'addSE':       this._addSE(top);        break;
      case 'editSE':      this._editSE(top);       break;
      case 'conns':       this._conns(top);        break;
      case 'addUni':      this._addUni(top);       break;
      case 'editUni':     this._editUni(top);      break;
      case 'uniInfo':     this._uniInfo(top);      break;
      case 'charList':   this._charList(top);    break;
      case 'charDetail': this._charDetail(top);  break;
      case 'addChar':    this._addChar(top);     break;
      case 'editChar':   this._editChar(top);    break;
      case 'charEvLink': this._charEvLink(top);  break;
      case 'connectionMap': this._connectionMap(top); break;
      case 'catEditor':  this._catEditor(top);   break;
      case 'affiliationEditor': this._affiliationEditor(top); break;
      case 'help':       this._help();           break;
    }
  },

  /* -- push helper -- */
  push(frame) { if (typeof MemoryTour !== 'undefined' && MemoryTour.active) MemoryTour.stop(false); if (typeof ContinuityTour !== 'undefined' && ContinuityTour.active) ContinuityTour.stop(false); MS.push(frame); this.open(); this.render(); },
  openEvDetail(id) { MS = [{ t: 'evDetail', evId: id }]; this.open(); this.render(); },
  openEditUni(id)  { MS = [{ t: 'editUni',  uId:  id }]; this.open(); this.render(); },
  openUniInfo(id)  { MS = [{ t: 'uniInfo',  uId:  id }]; this.open(); this.render(); },

  /* ================== SCREEN RENDERERS ================== */

  /* ---- Event Detail ---- */
  _evDetail(top) {
    const ev = S.events.find(e => e.id === top.evId); if (!ev) return;
    const u   = getU(ev.universeId);
    const col = u ? u.color : '#888';
    const conns = evConns(ev.id);

    this.crumb().textContent = '';
    this.ttl().textContent   = ev.title;

    const eb = document.createElement('button');
    eb.className = 'btn light'; eb.innerHTML = '&#9998; Edit';
    eb.onclick = () => { MS.push({ t: 'editEv', evId: ev.id }); M.render(); };
    this.btns().insertBefore(eb, this.btns().firstChild);

    const catBadge = ev.category
      ? '<span class="cat-badge" style="background:' + catColor(ev.category) + ';margin-left:8px">' +
        catIcon(ev.category) + ' ' + esc(ev.category) + '</span>'
      : '';

    const stBadge = ev.status
      ? '<span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:10px;background:' + statusColor(ev.status) + '22;color:' + statusColor(ev.status) + ';font-size:12px;font-weight:700;border:1px solid ' + statusColor(ev.status) + '55;margin-left:6px">' + esc(ev.status) + '</span>'
      : '';

    const recBadge = ev.recurring && ev.recurring.frequency
      ? '<span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:10px;background:#fff4d8;color:#9a6a1e;font-size:12px;font-weight:700;border:1px solid #e6c37a;margin-left:6px">&#128257; ' + esc(ev.recurring.frequency === 'century' ? 'century-based' : ev.recurring.frequency) + '</span>'
      : '';

    /* Age at event: auto-calculated if the life track has a birthDate */
    let ageBadge = '';
    if (u && u.birthDate && ev.date) {
      const birthYear = parseDate(u.birthDate);
      const evYear    = parseDate(ev.date);
      if (birthYear !== null && evYear !== null) {
        const age = Math.floor(evYear - birthYear);
        if (age >= 0 && age < 150) {
          ageBadge = '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:10px;background:#e8f4f8;color:#1a6a8a;font-size:12px;font-weight:700;margin-left:6px">Age ' + age + '</span>';
        }
      }
    }

    /* Date display: start → end if end date set */
    const dateDisplay = ev.date ? esc(ev.date) + (ev.dateEnd ? ' \u2192 ' + esc(ev.dateEnd) : '') : '??/??/????';

    /* Emotional tone colour — A-8: single source of truth via TONE_COLORS / toneColor(). */
    const toneColors = (typeof TONE_COLORS !== 'undefined') ? TONE_COLORS : {};
    const toneColor  = (typeof window !== 'undefined' && typeof window.toneColor === 'function')
      ? window.toneColor(ev.emotionalTone) : (toneColors[ev.emotionalTone] || '#888');
    const toneIco    = (typeof window !== 'undefined' && typeof window.toneIcon === 'function')
      ? window.toneIcon(ev.emotionalTone) : '';

    /* Build the human narrative snapshot */
    const hasNarrative = ev.emotionalTone || ev.lifeSituation || ev.roleStatus || ev.internalChange || ev.location || ageBadge;
    let narrativeHTML = '';
    if (hasNarrative) {
      const chips = [];
      if (ageBadge) chips.push(ageBadge);
      if (ev.location) chips.push('<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:10px;background:#f0f0f5;color:#555;font-size:12px">\uD83D\uDCCD ' + esc(ev.location) + '</span>');
      if (ev.emotionalTone) chips.push('<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:10px;background:' + toneColor + '22;color:' + toneColor + ';font-size:12px;font-weight:700;border:1px solid ' + toneColor + '44">' + (toneIco || '\u2764\uFE0F') + ' ' + esc(ev.emotionalTone) + '</span>');
      if (ev.lifeSituation) chips.push('<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:10px;background:#f5f0ff;color:#6b3fa0;font-size:12px">\uD83D\uDCCA ' + esc(ev.lifeSituation) + '</span>');
      if (ev.roleStatus) chips.push('<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:10px;background:#f0f5f0;color:#2d6a2d;font-size:12px">\uD83C\uDFAD ' + esc(ev.roleStatus) + '</span>');

      narrativeHTML =
        '<div style="background:linear-gradient(135deg,#fdf8f0,#fef9f3);border:1px solid #e8d9b8;border-radius:10px;padding:12px 14px;margin-bottom:14px">' +
        '<div style="font-size:10px;font-weight:900;letter-spacing:.7px;color:#8b6e4e;margin-bottom:8px">\u2728 THE HUMAN NARRATIVE</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:' + (ev.internalChange ? '10px' : '0') + '">' + chips.join('') + '</div>' +
        (ev.internalChange
          ? '<div style="border-top:1px solid #e8d9b8;padding-top:9px;margin-top:3px">' +
            '<span style="font-size:10px;font-weight:700;color:#8b6e4e;letter-spacing:.5px">INTERNAL SHIFT \u2192 </span>' +
            '<span style="font-size:13px;color:#4a3728;font-style:italic">' + esc(ev.internalChange) + '</span>' +
            '</div>'
          : '') +
        '</div>';
    }

    this.body().innerHTML =
      '<div class="ev-date">&#128197; ' + dateDisplay + (ev.time ? ' at ' + esc(ev.time) : '') + '</div>' +
      '<div style="margin-bottom:10px;display:flex;flex-wrap:wrap;align-items:center;gap:4px">' +
        '<span class="ev-badge" style="background:' + col + '">' + esc(u ? u.name : '?') + '</span>' +
        catBadge +
        ageBadge +
        stBadge +
        recBadge +
      '</div>' +
      narrativeHTML +
      (ev.tags && ev.tags.length ? '<div class="ev-tags">' + ev.tags.map(function(t){return '<span class="ev-tag">' + esc(t) + '</span>';}).join('') + '</div>' : '') +
      buildEventCharsSection(ev) +
      '<div class="ev-desc">' + (ev.description ? esc(ev.description) : '<em style="color:#ccc">No description.</em>') + '</div>' +
      buildNotesDisplay(ev.notes) +
      buildMediaDisplay(ev.media) +
      (conns.length ? buildConnsSection(conns) : '') +
      buildSESection(ev.id, ev.subEvents || [], []);

    this.foot().innerHTML =
      '<button class="btn light" onclick="M.push({t:\'conns\',evId:\'' + ev.id + '\'})">&#128279; Life Links</button>' +
      '<button class="btn danger" onclick="delEvent(\'' + ev.id + '\')">&#128465; Delete Event</button>' +
      '<button class="btn light" onclick="M.close()">Close</button>';
  },

  /* ---- Sub-event Detail ---- */
  /* Improvement #1: fully recursive — works at any depth, shows sub-events of sub-events */
  _seDetail(top) {
    const ev = S.events.find(e => e.id === top.evId); if (!ev) return;
    let node = ev; const crumbs = [ev.title];
    for (const i of top.path) {
      if (!node.subEvents) return;
      node = node.subEvents[i]; if (!node) return;
      crumbs.push(node.title);
    }
    const se = node;
    const pathJson = JSON.stringify(top.path);
    const depthLabel = top.path.length === 1 ? 'Sub-event' :
                       top.path.length === 2 ? 'Sub-sub-event' :
                       'Level ' + top.path.length + ' sub-event';

    this.crumb().textContent = crumbs.slice(0, -1).join(' \u203a ');
    this.ttl().textContent   = se.title;

    const eb = document.createElement('button');
    eb.className = 'btn light'; eb.innerHTML = '&#9998; Edit';
    eb.onclick = () => { MS.push({ t: 'editSE', evId: top.evId, path: top.path }); M.render(); };
    this.btns().insertBefore(eb, this.btns().firstChild);

    this.body().innerHTML =
      '<div style="display:inline-block;padding:2px 9px;border-radius:10px;background:#f0f2f5;font-size:11px;color:#888;margin-bottom:8px">' + esc(depthLabel) + '</div>' +
      (se.date ? '<div class="ev-date">&#128197; ' + esc(se.date) + (se.time ? ' at ' + esc(se.time) : '') + '</div>' : '') +
      '<div class="ev-desc">' + (se.description ? esc(se.description) : '<em style="color:#ccc">No description.</em>') + '</div>' +
      buildNotesDisplay(se.notes) +
      buildMediaDisplay(se.media) +
      buildSESection(top.evId, se.subEvents || [], top.path);

    this.foot().innerHTML =
      '<button class="btn danger" onclick="delSE(\'' + top.evId + '\',' + pathJson + ')">&#128465; Delete</button>' +
      '<button class="btn light" onclick="M.back()">Back</button>';
  },

  /* ---- Add Event ---- */
  _addEv(top) {
    _editMediaList = [];
    this.crumb().textContent = '';
    this.ttl().textContent   = '+ New Event';
    const uOpts = S.lifeTracks.map(u =>
      '<option value="' + u.id + '"' + (u.id === top.uId ? ' selected' : '') + '>' + esc(u.name) + '</option>'
    ).join('');
    this.body().innerHTML =
      '<div class="fg"><label>Title <span style="color:#e74c3c">*</span></label>' +
      '<input id="ae-t" placeholder="e.g. Started university, Met grandmother, First job" value="' + esc(top.title || '') + '"></div>' +
      '<div style="display:flex;gap:10px">' +
      '<div class="fg" style="flex:1"><label>Start Date <span style="color:#e74c3c">*</span> &nbsp;<span style="font-weight:400;color:#999">(dd/mm/yyyy)</span></label>' +
      '<input id="ae-d" placeholder="xx/xx/2006" value="' + esc(top.date || '') + '">' +
      '<div class="hint">Use X for unknown parts</div></div>' +
      '<div class="fg" style="flex:1"><label>End Date <span style="font-weight:400;color:#aaa">(if event spans time)</span></label>' +
      '<input id="ae-dend" placeholder="xx/xx/2008 (optional)">' +
      '<div class="hint">Leave blank for single-day events</div></div>' +
      '</div>' +
      '<div style="display:flex;gap:10px">' +
      '<div class="fg" style="flex:1"><label>Time <span style="font-weight:400;color:#aaa">(optional, HH:MM)</span></label>' +
      '<input id="ae-time" type="time" value="" style="width:100%"></div>' +
      '<div class="fg" style="flex:1"><label>Location <span style="font-weight:400;color:#aaa">(where it happened)</span></label>' +
      '<input id="ae-location" placeholder="e.g. Porto \u2192 Lisbon, New York"></div>' +
      '</div>' +
      '<div class="fg"><label>Life Track <span style="color:#e74c3c">*</span></label>' +
      '<select id="ae-u">' + (uOpts || '<option value="">\u2014 Create a life track first \u2014</option>') + '</select></div>' +
      '<div class="fg"><label>Category</label>' +
      '<select id="ae-cat"><option value="">— None —</option>' +
      Object.keys(CATEGORIES).map(c => '<option value="' + c + '">' + CATEGORIES[c].icon + ' ' + c + '</option>').join('') +
      '</select></div>' +
      '<div class="fg"><label>Status <span style="font-weight:400;color:#aaa">(optional)</span></label>' +
      '<select id="ae-status"><option value="">— None —</option>' +
      BIO_STATUSES.map(s => '<option value="' + s + '">' + s + '</option>').join('') +
      '</select></div>' +
      '<div class="fg"><label>Recurrence <span style="font-weight:400;color:#aaa">(optional)</span></label>' +
      '<select id="ae-recurring"><option value="">— None —</option>' +
      '<option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="century">Century-based</option>' +
      '</select><div class="hint">Creates semi-transparent repeat dots on the canvas, capped at 500.</div></div>' +
      '<div style="border-top:1px solid #f0ebe0;padding-top:14px;margin-top:2px;margin-bottom:12px">' +
      '<div style="font-size:11px;font-weight:900;color:#8b6e4e;letter-spacing:.6px;margin-bottom:10px">\u2728 HOW IT FELT \u2014 The Human Narrative</div>' +
      '<div style="display:flex;gap:10px">' +
      '<div class="fg" style="flex:1"><label>Emotional Tone</label>' +
      '<select id="ae-tone"><option value="">— How did it feel? —</option>' +
      ['Exciting','Difficult','Transformative','Peaceful','Bittersweet','Proud','Anxious','Hopeful','Confusing','Liberating','Painful','Joyful','Overwhelming','Grateful','Uncertain'].map(t => '<option value="' + t + '">' + t + '</option>').join('') +
      '</select></div>' +
      '<div class="fg" style="flex:1"><label>Life Situation</label>' +
      '<select id="ae-situation"><option value="">— What was life like? —</option>' +
      ['Broke','Stable','Thriving','Grieving','In transition','Starting over','Building','Struggling','Uncertain','Settled','Rebuilding','Growing'].map(s => '<option value="' + s + '">' + s + '</option>').join('') +
      '</select></div>' +
      '</div>' +
      '<div class="fg"><label>Role / Status at the Time</label>' +
      '<input id="ae-role" placeholder="e.g. Student, New Parent, CEO, Unemployed, Caregiver, Newlywed"></div>' +
      '<div class="fg"><label>Internal Change <span style="font-weight:400;color:#aaa">(what shifted inside?)</span></label>' +
      '<input id="ae-internal" placeholder="e.g. Gained confidence, Found purpose, Lost direction, Rebuilt identity"></div>' +
      '</div>' +
      '<div class="fg"><label>Tags <span style="font-weight:400;color:#aaa">(comma separated)</span></label>' +
      '<input id="ae-tags" type="text" placeholder="e.g. milestone, turning point, family, travel"></div>' +
      '<div class="fg"><label>Description</label>' +
      '<textarea id="ae-dc" placeholder="Describe this event...">' + esc(top.desc || '') + '</textarea></div>' +
      '<div class="fg"><label>\uD83D\uDCDD Notes <span style="font-weight:400;color:#aaa">(extra info, personal annotations...)</span></label>' +
      '<textarea id="ae-notes" placeholder="Additional notes..." style="min-height:60px"></textarea></div>' +
      buildMediaForm();
    setTimeout(() => rebuildMediaList(), 0);
    this.foot().innerHTML =
      '<button class="btn light" onclick="M.close()">Cancel</button>' +
      '<button class="btn accent" onclick="submitAddEv()">Create Event</button>';
  },

  /* ---- Edit Event ---- */
  _editEv(top) {
    const ev = S.events.find(e => e.id === top.evId); if (!ev) return;
    _editMediaList = ev.media ? ev.media.map(m => Object.assign({}, m)) : [];
    this.crumb().textContent = 'Editing';
    this.ttl().textContent   = ev.title;
    const uOpts = S.lifeTracks.map(u =>
      '<option value="' + u.id + '"' + (u.id === ev.universeId ? ' selected' : '') + '>' + esc(u.name) + '</option>'
    ).join('');
    const catOpts = '<option value="">— None —</option>' +
      Object.keys(CATEGORIES).map(c =>
        '<option value="' + c + '"' + (ev.category === c ? ' selected' : '') + '>' + CATEGORIES[c].icon + ' ' + c + '</option>'
      ).join('');
    /* A-9: include century-based recurrence as a fourth option. */
    const recOpts = '<option value="">— None —</option>' +
      [['weekly','Weekly'],['monthly','Monthly'],['yearly','Yearly'],['century','Century-based']].map(function(pair) {
        return '<option value="' + pair[0] + '"' + ((ev.recurring && ev.recurring.frequency) === pair[0] ? ' selected' : '') + '>' + pair[1] + '</option>';
      }).join('');
    /* A-8: tone vocabulary now sourced from TONE_OPTIONS, with TONE_ICONS prefixed. */
    const _toneList = (typeof TONE_OPTIONS !== 'undefined') ? TONE_OPTIONS
      : ['Exciting','Difficult','Transformative','Peaceful','Bittersweet','Proud','Anxious','Hopeful','Confusing','Liberating','Painful','Joyful','Overwhelming','Grateful','Uncertain'];
    const toneOpts = '<option value="">— How did it feel? —</option>' +
      _toneList.map(function(t) {
        var ico = (typeof toneIcon === 'function') ? toneIcon(t) : '';
        return '<option value="' + t + '"' + (ev.emotionalTone === t ? ' selected' : '') + '>' + (ico ? ico + ' ' : '') + t + '</option>';
      }).join('');
    const sitOpts = '<option value="">— What was life like? —</option>' +
      ['Broke','Stable','Thriving','Grieving','In transition','Starting over','Building','Struggling','Uncertain','Settled','Rebuilding','Growing'].map(s =>
        '<option value="' + s + '"' + (ev.lifeSituation === s ? ' selected' : '') + '>' + s + '</option>'
      ).join('');
    this.body().innerHTML =
      '<div class="fg"><label>Title *</label><input id="ee-t" value="' + esc(ev.title) + '"></div>' +
      '<div style="display:flex;gap:10px">' +
      '<div class="fg" style="flex:1"><label>Start Date (dd/mm/yyyy \u2014 X for unknown)</label>' +
      '<input id="ee-d" value="' + esc(ev.date || '') + '"></div>' +
      '<div class="fg" style="flex:1"><label>End Date <span style="font-weight:400;color:#aaa">(if spans time)</span></label>' +
      '<input id="ee-dend" placeholder="optional" value="' + esc(ev.dateEnd || '') + '"></div>' +
      '</div>' +
      '<div style="display:flex;gap:10px">' +
      '<div class="fg" style="flex:1"><label>Time <span style="font-weight:400;color:#aaa">(optional)</span></label>' +
      '<input id="ee-time" type="time" value="' + esc(ev.time || '') + '" style="width:100%"></div>' +
      '<div class="fg" style="flex:1"><label>Location</label>' +
      '<input id="ee-location" placeholder="e.g. Porto \u2192 Lisbon" value="' + esc(ev.location || '') + '"></div>' +
      '</div>' +
      '<div class="fg"><label>Life Track</label><select id="ee-u">' + uOpts + '</select></div>' +
      '<div class="fg"><label>Category</label><select id="ee-cat">' + catOpts + '</select></div>' +
      '<div class="fg"><label>Status <span style="font-weight:400;color:#aaa">(optional)</span></label>' +
      '<select id="ee-status"><option value="">— None —</option>' +
      BIO_STATUSES.map(s => '<option value="' + s + '"' + (ev.status === s ? ' selected' : '') + '>' + s + '</option>').join('') +
      '</select></div>' +
      '<div class="fg"><label>Recurrence <span style="font-weight:400;color:#aaa">(optional)</span></label>' +
      '<select id="ee-recurring">' + recOpts + '</select>' +
      '<div class="hint">Creates semi-transparent repeat dots on the canvas, capped at 500.</div></div>' +
      '<div style="border-top:1px solid #f0ebe0;padding-top:14px;margin-top:2px;margin-bottom:12px">' +
      '<div style="font-size:11px;font-weight:900;color:#8b6e4e;letter-spacing:.6px;margin-bottom:10px">\u2728 HOW IT FELT \u2014 The Human Narrative</div>' +
      '<div style="display:flex;gap:10px">' +
      '<div class="fg" style="flex:1"><label>Emotional Tone</label><select id="ee-tone">' + toneOpts + '</select></div>' +
      '<div class="fg" style="flex:1"><label>Life Situation</label><select id="ee-situation">' + sitOpts + '</select></div>' +
      '</div>' +
      '<div class="fg"><label>Role / Status at the Time</label>' +
      '<input id="ee-role" placeholder="e.g. Student, New Parent, CEO, Unemployed" value="' + esc(ev.roleStatus || '') + '"></div>' +
      '<div class="fg"><label>Internal Change <span style="font-weight:400;color:#aaa">(what shifted inside?)</span></label>' +
      '<input id="ee-internal" placeholder="e.g. Gained confidence, Found purpose, Rebuilt identity" value="' + esc(ev.internalChange || '') + '"></div>' +
      '</div>' +
      '<div class="fg"><label>Tags <span style="font-weight:400;color:#aaa">(comma separated)</span></label>' +
      '<input id="ee-tags" type="text" value="' + esc((ev.tags||[]).join(', ')) + '" placeholder="e.g. milestone, turning point, family, travel"></div>' +
      '<div class="fg"><label>Description</label>' +
      '<textarea id="ee-dc">' + esc(ev.description || '') + '</textarea></div>' +
      '<div class="fg"><label>\uD83D\uDCDD Notes</label>' +
      '<textarea id="ee-notes" style="min-height:60px">' + esc(ev.notes || '') + '</textarea></div>' +
      buildMediaForm();
    setTimeout(() => rebuildMediaList(), 0);
    this.foot().innerHTML =
      '<button class="btn light" onclick="M.back()">Cancel</button>' +
      '<button class="btn accent" onclick="saveEv(\'' + ev.id + '\')">Save Changes</button>';
  },

  /* ---- Add Sub-event (works at ANY depth — Improvement #1) ---- */
  _addSE(top) {
    _editMediaList = [];
    const depthStr = top.path.length === 0 ? 'to this event' :
                     'inside \u201c' + (getNodeAtPath(top.evId, top.path) || {title:'?'}).title + '\u201d';
    this.crumb().textContent = 'New sub-event ' + depthStr;
    this.ttl().textContent   = '+ Add Sub-event';
    const pathJson = JSON.stringify(top.path);
    this.body().innerHTML =
      '<div class="fg"><label>Title *</label><input id="as-t" placeholder="Sub-event title"></div>' +
      '<div class="fg"><label>Date (optional, dd/mm/yyyy)</label>' +
      '<input id="as-d" placeholder="xx/xx/2006"></div>' +
      '<div class="fg"><label>Time <span style="font-weight:400;color:#aaa">(optional, HH:MM)</span></label>' +
      '<input id="as-time" type="time" value="" style="width:140px"></div>' +
      '<div class="fg"><label>Description</label>' +
      '<textarea id="as-dc" placeholder="Describe this sub-event..."></textarea></div>' +
      '<div class="fg"><label>\uD83D\uDCDD Notes</label>' +
      '<textarea id="as-notes" style="min-height:60px" placeholder="Additional notes..."></textarea></div>' +
      buildMediaForm();
    setTimeout(() => rebuildMediaList(), 0);
    this.foot().innerHTML =
      '<button class="btn light" onclick="M.back()">Cancel</button>' +
      '<button class="btn accent" onclick="submitAddSE(\'' + top.evId + '\',' + pathJson + ')">Add Sub-event</button>';
  },

  /* ---- Edit Sub-event ---- */
  _editSE(top) {
    const ev = S.events.find(e => e.id === top.evId); if (!ev) return;
    let node = ev;
    for (const i of top.path) { if (!node.subEvents) return; node = node.subEvents[i]; if (!node) return; }
    const se = node;
    _editMediaList = se.media ? se.media.map(m => Object.assign({}, m)) : [];
    const pathJson = JSON.stringify(top.path);
    this.crumb().textContent = 'Editing sub-event';
    this.ttl().textContent   = se.title;
    this.body().innerHTML =
      '<div class="fg"><label>Title *</label><input id="es-t" value="' + esc(se.title) + '"></div>' +
      '<div class="fg"><label>Date (optional)</label><input id="es-d" value="' + esc(se.date || '') + '"></div>' +
      '<div class="fg"><label>Time <span style="font-weight:400;color:#aaa">(optional, HH:MM)</span></label>' +
      '<input id="es-time" type="time" value="' + esc(se.time || '') + '" style="width:140px"></div>' +
      '<div class="fg"><label>Description</label><textarea id="es-dc">' + esc(se.description || '') + '</textarea></div>' +
      '<div class="fg"><label>\uD83D\uDCDD Notes</label>' +
      '<textarea id="es-notes" style="min-height:60px">' + esc(se.notes || '') + '</textarea></div>' +
      buildMediaForm();
    setTimeout(() => rebuildMediaList(), 0);
    this.foot().innerHTML =
      '<button class="btn light" onclick="M.back()">Cancel</button>' +
      '<button class="btn accent" onclick="saveSE(\'' + top.evId + '\',' + pathJson + ')">Save</button>';
  },

  /* ---- Connections ---- */
  _conns(top) {
    const ev = S.events.find(e => e.id === top.evId); if (!ev) return;
    this.crumb().textContent = esc(ev.title);
    this.ttl().textContent   = '\uD83D\uDD17 Life Links';
    const existing = S.connections.filter(c => c.fromEventId === ev.id || c.toEventId === ev.id);
    const others   = S.events.filter(e => e.id !== ev.id);
    const opts = others.map(e => {
      const u = getU(e.universeId);
      return '<option value="' + e.id + '">[' + esc(u ? u.name : '?') + '] ' + esc(e.title) + '</option>';
    }).join('');
    const existingHTML = existing.length === 0
      ? '<div style="color:#ccc;font-size:12px;padding:4px 0">No life links yet.</div>'
      : existing.map(cn => {
          const isFrom = cn.fromEventId === ev.id;
          const othId  = isFrom ? cn.toEventId : cn.fromEventId;
          const oe = S.events.find(e => e.id === othId);
          const ou = oe ? getU(oe.universeId) : null;
          return '<div class="conn-item">' +
            '<span class="conn-dot" style="background:' + (ou ? ou.color : '#aaa') + '"></span>' +
            '<span style="flex:1;line-height:1.3">' +
              (cn.label ? '<span style="font-size:11px;font-weight:700;color:#8b6e4e;display:block;margin-bottom:1px">' + esc(cn.label) + '</span>' : '') +
              '<span style="font-size:13px;color:#333">' + esc(oe ? oe.title : 'Unknown') + '</span>' +
            '</span>' +
            '<button class="btn danger sm" onclick="delConn(\'' + cn.id + '\',\'' + ev.id + '\')">&#10005;</button></div>';
        }).join('');
    const suggestionOpts =
      '<option value="">— Choose a relationship type —</option>' +
      '<option value="Led to \u2192">Led to \u2192 &nbsp;&nbsp; (e.g. Lost job \u2192 Started own business)</option>' +
      '<option value="Inspired by \u2190">Inspired by \u2190 &nbsp;&nbsp; (e.g. Read this book \u2190 Changed career)</option>' +
      '<option value="Ended because of \u2190">Ended because of \u2190 &nbsp;&nbsp; (e.g. Relationship ended \u2190 Moved city)</option>' +
      '<option value="Triggered by \u2190">Triggered by \u2190 &nbsp;&nbsp; (e.g. Health crisis \u2190 Lifestyle change)</option>' +
      '<option value="Coincided with \u2194">Coincided with \u2194 &nbsp;&nbsp; (happened at the same time)</option>' +
      '<option value="Followed by \u2192">Followed by \u2192</option>' +
      '<option value="Caused by \u2190">Caused by \u2190</option>' +
      '<option value="Part of \u2194">Part of \u2194</option>' +
      '<option value="Contradicted by \u2194">Contradicted by \u2194</option>';
    this.body().innerHTML =
      '<div style="margin-bottom:18px"><div class="sec-hd"><h3>Existing (' + existing.length + ')</h3></div>' + existingHTML + '</div>' +
      '<div style="border-top:1px solid #eee;padding-top:16px"><div class="sec-hd"><h3>Add Life Link</h3></div>' +
      '<div class="fg"><label>Link to Event</label><select id="cn-to">' + (opts || '<option>No other events yet</option>') + '</select></div>' +
      '<div class="fg"><label>Relationship <span style="font-weight:400;color:#aaa">(pick a suggestion or type freely)</span></label>' +
      '<select id="cn-suggest" onchange="(function(s){var inp=document.getElementById(\'cn-lb\');if(s.value){inp.value=s.value;}s.value=\'\';})(this)" style="margin-bottom:6px">' + suggestionOpts + '</select>' +
      '<input id="cn-lb" placeholder="e.g. Led to \u2192, Inspired by \u2190, or write anything..." style="margin-top:4px">' +
      '<div class="hint">The suggestion above fills the field \u2014 you can then edit it freely before saving.</div>' +
      '</div></div>';
    this.foot().innerHTML =
      '<button class="btn light" onclick="M.back()">Back</button>' +
      '<button class="btn accent" onclick="addConn(\'' + ev.id + '\')">Add Life Link</button>';
  },

  /* ---- Add Universe ---- */
  _addUni(top) {
    const col = top.color || PALETTE[S.lifeTracks.length % PALETTE.length];
    this.crumb().textContent = '';
    this.ttl().textContent   = '+ New Life Track';
    this.body().innerHTML =
      '<div class="fg"><label>Name *</label>' +
      '<input id="au-n" placeholder="e.g. Career & Work, Family Life, Education..." value="' + esc(top.name || '') + '"></div>' +
      '<div class="fg"><label>Birth Date <span style="font-weight:400;color:#aaa">(optional \u2014 enables Age at Event on all events in this track)</span></label>' +
      '<input id="au-birth" placeholder="e.g. xx/xx/1985 or 15/06/1990" style="width:240px">' +
      '<div class="hint">If set, age will be auto-calculated and shown on every event in this life track.</div></div>' +
      '<div class="fg"><label>Colour</label>' +
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:4px">' +
      '<input type="color" id="au-c" value="' + col + '"></div>' +
      '<div class="swatches">' + PALETTE.map(c2 =>
        '<div class="swatch" style="background:' + c2 + '" onclick="document.getElementById(\'au-c\').value=\'' + c2 + '\'"></div>'
      ).join('') + '</div></div>' +
      '<div class="fg"><label>Description <span style="font-weight:400;color:#aaa">(what is this life track about?)</span></label>' +
      '<textarea id="au-desc" placeholder="e.g. My professional journey — jobs, projects, achievements, career changes..." style="min-height:72px"></textarea></div>' +
      '<div class="fg"><label>\uD83D\uDCDD Observations &amp; Notes <span style="font-weight:400;color:#aaa">(personal notes, themes, comparisons...)</span></label>' +
      '<textarea id="au-notes" placeholder="Personal reflections about this chapter of life..." style="min-height:58px"></textarea></div>';
    this.foot().innerHTML =
      '<button class="btn light" onclick="M.close()">Cancel</button>' +
      '<button class="btn accent" onclick="submitAddUni()">Create Life Track</button>';
  },

  /* ---- Edit Universe ---- */
  _editUni(top) {
    const u = getU(top.uId); if (!u) return;
    this.crumb().textContent = '';
    this.ttl().textContent   = '&#9998; Edit Life Track';
    this.body().innerHTML =
      '<div class="fg"><label>Name *</label><input id="eu-n" value="' + esc(u.name) + '"></div>' +
      '<div class="fg"><label>Birth Date <span style="font-weight:400;color:#aaa">(enables Age at Event auto-calculation)</span></label>' +
      '<input id="eu-birth" placeholder="e.g. xx/xx/1985 or 15/06/1990" value="' + esc(u.birthDate || '') + '" style="width:240px">' +
      '<div class="hint">Age at each event will be calculated automatically from this date.</div></div>' +
      '<div class="fg"><label>Colour</label>' +
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:4px">' +
      '<input type="color" id="eu-c" value="' + u.color + '"></div>' +
      '<div class="swatches">' + PALETTE.map(c2 =>
        '<div class="swatch" style="background:' + c2 + '" onclick="document.getElementById(\'eu-c\').value=\'' + c2 + '\'"></div>'
      ).join('') + '</div></div>' +
      '<div class="fg"><label>Description</label>' +
      '<textarea id="eu-desc" placeholder="Describe this life track..." style="min-height:72px">' + esc(u.description || '') + '</textarea></div>' +
      '<div class="fg"><label>\uD83D\uDCDD Observations &amp; Notes</label>' +
      '<textarea id="eu-notes" placeholder="Personal observations and notes..." style="min-height:58px">' + esc(u.notes || '') + '</textarea></div>';
    this.foot().innerHTML =
      '<button class="btn danger" onclick="delUni(\'' + u.id + '\')">&#128465; Delete</button>' +
      '<button class="btn light" onclick="M.close()">Cancel</button>' +
      '<button class="btn accent" onclick="saveUni(\'' + u.id + '\')">Save</button>';
  },

  /* ---- Universe Info ---- */
  _uniInfo(top) {
    const u = getU(top.uId); if (!u) return;
    this.crumb().textContent = 'Life Tracks';
    this.ttl().textContent   = u.name;

    const eb = document.createElement('button');
    eb.className = 'btn light'; eb.innerHTML = '&#9998; Edit';
    eb.onclick = () => { MS[MS.length-1] = { t:'editUni', uId:u.id }; M.render(); };
    this.btns().insertBefore(eb, this.btns().firstChild);

    const stats = buildUniStats(u.id);
    const evs = S.events.filter(e => e.universeId === u.id);
    const charIds = new Set(evs.flatMap(e => e.characterIds || []));

    let dateRange = '—';
    const dates = evs.map(e => parseDate(e.date)).filter(d => d !== null).sort((a,b)=>a-b);
    if (dates.length >= 2) {
      dateRange = Math.floor(dates[0]) + ' → ' + Math.floor(dates[dates.length-1]);
    } else if (dates.length === 1) {
      dateRange = String(Math.floor(dates[0]));
    }

    this.body().innerHTML =
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:18px">' +
        '<div style="width:44px;height:44px;border-radius:50%;background:' + u.color + ';flex-shrink:0;box-shadow:0 3px 10px ' + u.color + '55"></div>' +
        '<div>' +
          '<div style="font-size:20px;font-weight:900;color:#1a1a2e">' + esc(u.name) + '</div>' +
          (u.birthDate ? '<div style="font-size:12px;color:#888;margin-top:3px">\uD83C\uDF82 Born ' + esc(u.birthDate) + ' &mdash; age auto-calculated on events</div>' : '') +
        '</div>' +
      '</div>' +

      '<div class="uni-stat-row">' +
        '<div class="uni-stat-card"><div class="uni-stat-val">' + evs.length + '</div><div class="uni-stat-label">EVENTS</div></div>' +
        '<div class="uni-stat-card"><div class="uni-stat-val">' + charIds.size + '</div><div class="uni-stat-label">PEOPLE</div></div>' +
        '<div class="uni-stat-card"><div class="uni-stat-val" style="font-size:14px">' + esc(dateRange) + '</div><div class="uni-stat-label">DATE RANGE</div></div>' +
      '</div>' +

      (u.description
        ? '<div style="margin-bottom:6px"><div class="notes-label" style="color:#3a5a9a">\uD83C\uDF0D DESCRIPTION</div>' +
          '<div class="uni-desc-box">' + esc(u.description) + '</div></div>'
        : '<div style="background:#f8f8fb;border:1px dashed #d0d8f0;border-radius:8px;padding:12px 16px;font-size:13px;color:#bbb;margin-bottom:14px">' +
          'No description yet. Click <strong>&#9998; Edit</strong> to add one.</div>') +

      (u.notes
        ? '<div><div class="notes-label">\uD83D\uDCDD OBSERVATIONS &amp; NOTES</div>' +
          '<div class="notes-display">' + esc(u.notes) + '</div></div>'
        : '') +

      '<div style="border-top:1px solid #f0f0f0;padding-top:14px;margin-top:4px">' +
        '<div class="sec-hd" style="margin-bottom:8px"><h3>\u26A1 Recent Events</h3></div>' +
        (evs.length === 0
          ? '<div style="color:#ccc;font-size:13px">No events yet.</div>'
          : evs.slice(0,6).sort((a,b) => (parseDate(b.date)||0)-(parseDate(a.date)||0)).map(e =>
              '<div class="se-item" onclick="M.close();setTimeout(()=>M.openEvDetail(\'' + e.id + '\'),80)" style="margin-bottom:6px">' +
                '<div class="se-item-body"><h4>' + esc(e.title) + '</h4>' +
                '<p>' + esc(e.date||'?') + '</p></div>' +
                '<span class="se-arrow">&#8250;</span>' +
              '</div>'
            ).join('') +
          (evs.length > 6 ? '<div style="font-size:12px;color:#a0a8c0;padding:4px 0">\u2026 and ' + (evs.length-6) + ' more event' + (evs.length-6!==1?'s':'') + '</div>' : '')
        ) +
      '</div>';

    this.foot().innerHTML =
      '<button class="btn light" onclick="M.close()">Close</button>';
  },

  /* ---- Category Editor ---- */
  _catEditor(top) {
    this.crumb().textContent = '';
    this.ttl().textContent   = '🏷 Category Editor';
    const cats = Object.keys(CATEGORIES);
    const catRows = cats.map((cat, idx) => {
      const info = CATEGORIES[cat];
      const evCount = S.events.filter(e => e.category === cat).length;
      return '<div style="display:flex;align-items:center;gap:8px;padding:9px 12px;border:1px solid #ebebeb;border-radius:8px;margin-bottom:7px;background:#fafbfd">' +
        '<input type="color" value="' + info.color + '" id="ce-col-' + idx + '" style="width:32px;height:28px;padding:1px;border:1px solid #d0d0d0;border-radius:4px;cursor:pointer;flex-shrink:0">' +
        '<input id="ce-icon-' + idx + '" value="' + esc(info.icon) + '" style="width:38px;padding:4px 5px;border:1px solid #d6d6d6;border-radius:4px;font-size:14px;text-align:center;flex-shrink:0" title="Icon (emoji)">' +
        '<input id="ce-name-' + idx + '" value="' + esc(cat) + '" style="flex:1;padding:5px 9px;border:1px solid #d6d6d6;border-radius:5px;font-size:13px;font-family:inherit" placeholder="Category name">' +
        '<span style="font-size:10px;color:#aaa;white-space:nowrap;min-width:50px;text-align:right" title="Events using this category">' + evCount + ' event' + (evCount !== 1 ? 's' : '') + '</span>' +
        '<button class="btn danger sm" onclick="catEditorRemove(' + idx + ')" title="Delete category">&#10005;</button>' +
      '</div>';
    }).join('');
    this.body().innerHTML =
      '<div style="margin-bottom:14px;font-size:13px;color:#666;line-height:1.6">' +
        'Customize event categories for your timeline. Rename, recolor, change icons, add new ones, or remove categories you don\'t need. ' +
        'Changes apply to all events immediately.' +
      '</div>' +
      '<div id="ce-list">' + (catRows || '<div style="color:#ccc;font-size:13px;padding:12px 0">No categories yet.</div>') + '</div>' +
      '<div style="border-top:1px solid #eee;padding-top:14px;margin-top:8px">' +
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
          '<input type="color" id="ce-new-col" value="#888888" style="width:32px;height:28px;padding:1px;border:1px solid #d0d0d0;border-radius:4px;cursor:pointer">' +
          '<input id="ce-new-icon" placeholder="Icon" value="📌" style="width:38px;padding:4px 5px;border:1px solid #d6d6d6;border-radius:4px;font-size:14px;text-align:center">' +
          '<input id="ce-new-name" placeholder="New category name..." style="flex:1;padding:5px 9px;border:1px solid #d6d6d6;border-radius:5px;font-size:13px;font-family:inherit">' +
          '<button class="btn accent sm" onclick="catEditorAdd()">&#65291; Add</button>' +
        '</div>' +
      '</div>' +
      '<div style="border-top:1px solid #eee;padding-top:12px;margin-top:14px">' +
        '<button class="btn sm" onclick="catEditorResetDefaults()" style="color:#999;border-color:#ddd">Reset to defaults</button>' +
        '<span style="font-size:11px;color:#bbb;margin-left:8px">Restores the original 9 biography categories</span>' +
      '</div>';
    this.foot().innerHTML =
      '<button class="btn light" onclick="M.close()">Cancel</button>' +
      '<button class="btn accent" onclick="catEditorSave()">Save Changes</button>';
  },

  /* ---- Organizations & Groups ---- */
  _affiliationEditor(top) {
    this.crumb().textContent = '';
    this.ttl().textContent   = '\uD83C\uDFE2 Organization Editor';
    const affs = S.affiliations || [];
    const affRows = affs.map((aff, idx) =>
      '<div style="display:flex;align-items:center;gap:8px;padding:9px 12px;border:1px solid #ebebeb;border-radius:8px;margin-bottom:7px;background:#fafbfd">' +
        '<input id="aff-name-' + idx + '" value="' + esc(aff) + '" style="flex:1;padding:5px 9px;border:1px solid #d6d6d6;border-radius:5px;font-size:13px;font-family:inherit" placeholder="Affiliation name">' +
        '<span style="font-size:10px;color:#aaa;white-space:nowrap;min-width:60px;text-align:right">' +
          S.people.filter(c => c.affiliation === aff).length + ' person/people' +
        '</span>' +
        '<button class="btn danger sm" onclick="affiliationEditorRemove(' + idx + ')" title="Delete affiliation">&times;</button>' +
      '</div>'
    ).join('');
    this.body().innerHTML =
      '<div style="margin-bottom:14px;font-size:13px;color:#666;line-height:1.6">' +
        'Manage the list of organizations and groups that can be selected on a person. Add, rename, or remove entries here.' +
      '</div>' +
      '<div id="aff-list">' + (affRows || '<div style="color:#ccc;font-size:13px;padding:12px 0">No organizations yet. Add one below.</div>') + '</div>' +
      '<div style="border-top:1px solid #eee;padding-top:14px;margin-top:8px">' +
        '<div style="display:flex;gap:8px;align-items:center">' +
          '<input id="aff-new-name" placeholder="New affiliation name..." style="flex:1;padding:5px 9px;border:1px solid #d6d6d6;border-radius:5px;font-size:13px;font-family:inherit">' +
          '<button class="btn accent sm" onclick="affiliationEditorAdd()">&#65291; Add</button>' +
        '</div>' +
      '</div>';
    this.foot().innerHTML =
      '<button class="btn light" onclick="M.close()">Cancel</button>' +
      '<button class="btn accent" onclick="affiliationEditorSave()">Save Changes</button>';
  },

  /* ---- Help (searchable archive guide) ---- */
  _help() {
    this.crumb().textContent = '';
    this.ttl().textContent   = '\u{1F4D6} Free Timeline Biography Guide';
    this.body().innerHTML = buildHelpGuide();
    this.foot().innerHTML = '<button class="btn light" onclick="M.close()">Close</button>';
    initHelpGuide();
  },

  /* ---- Character List ---- */
  _charList(top) {
    const q = (top.q || '').toLowerCase();
    this.crumb().textContent = '';
    this.ttl().textContent   = '\u{1F464} People \u0026 Key Persons';
    const eb = document.createElement('button');
    eb.className = 'btn accent'; eb.innerHTML = '&#65291; New Person';
    eb.onclick = () => { MS.push({ t: 'addChar' }); M.render(); };
    this.btns().insertBefore(eb, this.btns().firstChild);
    let chars = S.people.filter(c =>
      !q || c.name.toLowerCase().includes(q) ||
      (c.aliases || '').toLowerCase().includes(q) ||
      (c.species || '').toLowerCase().includes(q) ||
      (c.occupation || '').toLowerCase().includes(q) ||
      (c.affiliation || '').toLowerCase().includes(q)
    );
    
    /* Apply sorting */
    if (_charSortOrder === 'a-z') {
      chars.sort((a, b) => a.name.localeCompare(b.name));
    } else if (_charSortOrder === 'events') {
      const eventCounts = {};
      S.people.forEach(ch => {
        eventCounts[ch.id] = S.events.filter(e => (e.characterIds||[]).includes(ch.id)).length;
      });
      chars.sort((a, b) => (eventCounts[b.id] || 0) - (eventCounts[a.id] || 0));
    } else if (_charSortOrder === 'universe') {
      chars.sort((a, b) => {
        const aUnis = getCharUniverseIds(a).join(',');
        const bUnis = getCharUniverseIds(b).join(',');
        return aUnis.localeCompare(bUnis);
      });
    }
    
    const sortBtnA = '<button class="btn sm ' + (_charSortOrder==='a-z'?'accent':'light') + '" onclick="_setSortOrder(\'a-z\');M.render()">A-Z</button>';
    const sortBtnE = '<button class="btn sm ' + (_charSortOrder==='events'?'accent':'light') + '" onclick="_setSortOrder(\'events\');M.render()">Most Events</button>';
    const sortBtnU = '<button class="btn sm ' + (_charSortOrder==='universe'?'accent':'light') + '" onclick="_setSortOrder(\'universe\');M.render()">Life Track</button>';
    
    this.body().innerHTML =
      '<div style="margin-bottom:10px;display:flex;gap:5px;align-items:center"><span style="font-size:11px;color:#999;white-space:nowrap">Sort by:</span>' + sortBtnA + sortBtnE + sortBtnU + '</div>' +
      '<input class="char-search" id="char-search-q" placeholder="\uD83D\uDD0D Search people\u2026" value="' + esc(top.q || '') + '" oninput="_charSearchUpdate()">' +
      (chars.length === 0
        ? '<div style="color:#ccc;font-size:13px;padding:12px 2px">' +
          (S.people.length === 0
            ? 'No people yet. Click <strong>+ New Person</strong> to add one.'
            : 'No matches found.') + '</div>'
        : '<div><div style="font-size:11px;color:#999;margin:8px 0 6px;padding:0 2px"><strong>' + chars.length + '</strong> person' + (chars.length!==1?'s':'') + '</div>' +
          chars.map(c => buildCharCard(c)).join('') + '</div>'
      ) +
      (S.people.length > 0 ? '<div style="border-top:1px solid #eee;margin-top:12px;padding-top:12px">' + buildCharStats() + '</div>' : '');
    this.foot().innerHTML = '<button class="btn light" onclick="M.close()">Close</button>';
  },

  /* ---- Character Detail ---- */
  _charDetail(top) {
    const ch = S.people.find(c => c.id === top.charId); if (!ch) return;
    this.crumb().textContent = 'People';
    this.ttl().textContent   = ch.name;
    const eb = document.createElement('button');
    eb.className = 'btn light'; eb.innerHTML = '&#9998; Edit';
    eb.onclick = () => { MS.push({ t: 'editChar', charId: ch.id }); M.render(); };
    this.btns().insertBefore(eb, this.btns().firstChild);

    const uniIds = getCharUniverseIds(ch);
    const uniTagsHTML = uniIds.map(uid => {
      const u = getU(uid);
      return u ? '<span class="char-uni-tag" style="background:' + u.color + '">' + esc(u.name) + '</span>' : '';
    }).join('');

    const statusColors = { 'Living': '#2ecc71', 'Passed Away': '#e74c3c', 'Lost Touch': '#f39c12', 'Unknown': '#95a5a6' };
    const sCol = statusColors[ch.status] || '#95a5a6';

    const photoHTML = ch.photo
      ? '<img class="char-profile-photo" src="' + esc(ch.photo) + '" onclick="openLightbox(this.src)" title="Click to enlarge">'
      : '<div class="char-photo-placeholder">\u{1F464}</div>';

    const charEvCount = S.events.filter(e => (e.characterIds||[]).includes(ch.id)).length;

    const relationshipColors = { 'Family': '#b05070', 'Partner': '#9b59b6', 'Friend': '#3498db', 'Mentor': '#e09a3c', 'Colleague': '#4a9375', 'Other': '#95867a' };
    const relCol = relationshipColors[ch.alignment] || '#95867a';
    const _hdAccent = relCol;

    this.body().innerHTML =
      '<div class="char-profile-hd" style="--pv-accent:' + _hdAccent + '">' +
        '<div class="char-photo-wrap">' + photoHTML + '</div>' +
        '<div class="char-profile-meta">' +
          '<div class="char-profile-name">' + esc(ch.name) + '</div>' +
          (ch.aliases ? '<div class="char-profile-aliases">aka ' + esc(ch.aliases) + '</div>' : '') +
          '<div style="margin-bottom:6px;">' +
            (ch.status ? '<span class="char-status-badge" style="background:' + sCol + '">' + esc(ch.status) + '</span>' : '') +
            (ch.alignment ? '<span class="char-status-badge" style="background:' + relCol + '">' + esc(ch.alignment) + '</span>' : '') +
            (ch.species ? '<span style="display:inline-block;padding:2px 9px;border-radius:10px;font-size:10px;background:#f0f2f5;color:#555;font-weight:600">' + esc(ch.species) + '</span>' : '') +
          '</div>' +
          (ch.birthDate ? '<div style="font-size:12px;color:#666;margin-bottom:4px"><strong style="color:#333">Born:</strong> ' + esc(ch.birthDate) + '</div>' : '') +
          (ch.occupation ? '<div style="font-size:12px;color:#666;margin-bottom:4px"><strong style="color:#333">Occupation:</strong> ' + esc(ch.occupation) + '</div>' : '') +
          (ch.affiliation ? '<div style="font-size:12px;color:#666;margin-bottom:4px"><strong style="color:#333">Organization:</strong> ' + esc(ch.affiliation) + '</div>' : '') +
          (uniTagsHTML ? '<div style="display:flex;flex-wrap:wrap;gap:4px">' + uniTagsHTML + '</div>' : '') +
        '</div>' +
      '</div>' +
      ((ch.yearsKnown || ch.howWeMet)
        ? '<div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap">' +
            (ch.yearsKnown ? '<div style="flex:0 0 auto;min-width:80px;background:#e8f5e9;border-radius:10px;padding:10px 14px;text-align:center"><div style="font-size:20px;font-weight:800;color:#2e7d32">' + esc(String(ch.yearsKnown)) + '</div><div style="font-size:10px;font-weight:700;color:#388e3c;text-transform:uppercase;letter-spacing:1px">Years Known</div></div>' : '') +
            (ch.howWeMet ? '<div style="flex:1;min-width:120px;background:#e3f2fd;border-radius:10px;padding:10px 14px"><div style="font-size:10px;font-weight:700;color:#1565c0;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">How We Met</div><div style="font-size:13px;color:#1a237e">' + esc(ch.howWeMet) + '</div></div>' : '') +
          '</div>'
        : '') +
      (ch.locations ? '<div style="margin-bottom:14px"><div class="notes-label" style="color:#5a6a7a">\uD83D\uDCCD SHARED PLACES</div><div class="ev-desc" style="margin-bottom:0">' + esc(ch.locations) + '</div></div>' : '') +
      (ch.powers ? '<div class="powers-block"><div class="powers-label">\u26A1 SKILLS &amp; QUALITIES</div><div class="powers-text">' + esc(ch.powers) + '</div></div>' : '') +
      (ch.biography ? '<div style="margin-bottom:14px"><div class="notes-label" style="color:#5a6a7a">\uD83D\uDCD6 ABOUT THIS PERSON</div><div class="ev-desc" style="margin-bottom:0">' + esc(ch.biography) + '</div></div>' : '') +
      (ch.relationshipNotes ? '<div style="margin-bottom:14px"><div class="notes-label" style="color:#8b6e4e">\uD83D\uDCDD RELATIONSHIP NOTES</div><div class="notes-display">' + esc(ch.relationshipNotes) + '</div></div>' : '') +
      buildNotesDisplay(ch.notes) +
      buildMediaDisplay(ch.media) +
      '<div style="border-top:1px solid #f0f0f0;padding-top:14px;margin-bottom:14px">' +
        '<div class="sec-hd" style="margin-bottom:8px">' +
          '<h3>\u{1F5D3} Timeline Path (' + charEvCount + ' event' + (charEvCount!==1?'s':'') + ')</h3>' +
          '<button class="btn sm light" id="meanwhile-btn" onclick="_toggleMeanwhile(\'' + ch.id + '\')" title="Show background events from their life track(s)">\uD83C\uDF0D Life Track Context</button>' +
        ' <button class="btn sm ' + (_charFilterIds.includes(ch.id) ? 'accent' : 'light') + '" onclick="toggleCharFilter(\'' + ch.id + '\');MS.pop();M.push({t:\'charDetail\',charId:\'' + ch.id + '\'})">\uD83D\uDCCD ' + (_charFilterIds.includes(ch.id) ? 'Unpin Filter' : 'Pin Filter') + '</button>' +
        ' <button class="btn sm light" onclick="UI.connectionMap()" title="Open connection map">\uD83D\uDD78\uFE0F Map</button>' +
        '</div>' +
        '<div id="char-tl-container">' + buildCharTimeline(ch, _meanwhileMode) + '</div>' +
      '</div>' +
      (S.people.length > 1 ? '<div style="border-top:1px solid #f0f0f0;padding-top:14px"><div class="sec-hd" style="margin-bottom:8px"><h3>\uD83C\uDFAD Shared Events</h3></div>' + buildSharedEventsHTML(ch.id) + '</div>' : '');

    this.foot().innerHTML =
      '<button class="btn danger" onclick="delChar(\'' + ch.id + '\')">&#128465; Delete</button>' +
      '<button class="btn light" onclick="M.close()">Close</button>';
  },

  /* ---- Add Character ---- */
  _addChar(top) {
    _charPhoto = null;
    _editMediaList = [];
    this.crumb().textContent = '';
    this.ttl().textContent   = '+ New Person';
    this.body().innerHTML =
      '<div class="char-photo-upload-area">' +
        '<div id="char-photo-preview" class="char-photo-placeholder" style="width:72px;height:72px;font-size:30px;border-radius:9px;margin-bottom:0;flex-shrink:0">\u{1F464}</div>' +
        '<div>' +
          '<button type="button" class="btn light sm" onclick="document.getElementById(\'char-photo-in\').click()">\uD83D\uDDBC Upload Photo</button>' +
          '<input type="file" id="char-photo-in" accept="image/*" style="display:none" onchange="setCharPhoto(event)">' +
          '<button type="button" class="btn sm" style="margin-left:5px" onclick="clearCharPhoto()">&#10005; Clear</button>' +
          '<div style="font-size:10px;color:#bbb;margin-top:5px">Square image recommended &bull; max 5 MB</div>' +
        '</div>' +
      '</div>' +
      '<div class="fg"><label>Full Name <span style="color:#e74c3c">*</span></label><input id="ac-name" placeholder="e.g. Maria, Uncle Tom, Dr. Chen"></div>' +
      '<div class="fg"><label>Nickname / Known As</label><input id="ac-aliases" placeholder="e.g. Mom, Coach Williams, Big Dave"></div>' +
      '<div class="fg" style="display:flex;gap:10px">' +
        '<div style="flex:1"><label>Status</label><select id="ac-status"><option value="">Unknown</option><option value="Living">Living</option><option value="Passed Away">Passed Away</option><option value="Lost Touch">Lost Touch</option><option value="Unknown">Unknown</option></select></div>' +
        '<div style="flex:1"><label>Relationship Type</label><select id="ac-alignment"><option value="">None</option><option value="Family">Family</option><option value="Partner">Partner</option><option value="Friend">Friend</option><option value="Mentor">Mentor</option><option value="Colleague">Colleague</option><option value="Other">Other</option></select></div>' +
      '</div>' +
      '<div class="fg" style="display:flex;gap:10px">' +
        '<div style="flex:1"><label>Role</label><input id="ac-species" placeholder="e.g. Parent, Sibling, Teacher, Boss, Therapist"></div>' +
        '<div style="flex:1"><label>Occupation / Profession</label><input id="ac-occupation" placeholder="e.g. Teacher, Doctor, Artist"></div>' +
      '</div>' +
      '<div class="fg" style="display:flex;gap:10px">' +
        '<div style="flex:1"><label>Birth Date</label><input id="ac-birthdate" placeholder="e.g. 03/15/1965"></div>' +
        '<div style="flex:1"><label>Organization / Group</label><select id="ac-affiliation"><option value="">— None —</option>' + (S.affiliations||[]).map(a => '<option value="' + esc(a) + '">' + esc(a) + '</option>').join('') + '</select></div>' +
      '</div>' +
      '<div class="fg" style="display:flex;gap:10px">' +
        '<div style="flex:1"><label>Years Known</label><input id="ac-yearsknown" type="number" min="0" placeholder="0"></div>' +
        '<div style="flex:1"><label>How We Met</label><input id="ac-howwemet" placeholder="e.g. College roommate, Childhood neighbour"></div>' +
      '</div>' +
      '<div class="fg"><label>Shared Places <span style="font-weight:400;color:#aaa">(cities, schools, workplaces)</span></label>' +
        '<textarea id="ac-locations" placeholder="e.g. London, Harvard University, The Corner Café..." style="min-height:60px"></textarea></div>' +
      '<div class="fg"><label>Accent Colour</label>' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:4px"><input type="color" id="ac-color" value="#4a8fde"></div>' +
        '<div class="swatches">' + PALETTE.map(c2 => '<div class="swatch" style="background:' + c2 + '" onclick="document.getElementById(\'ac-color\').value=\'' + c2 + '\'" ></div>').join('') + '</div>' +
      '</div>' +
      '<div class="fg"><label>&#9889; Skills &amp; Qualities</label>' +
        '<textarea id="ac-powers" placeholder="e.g.\nPatient listener\nCreative problem-solver\nSense of humour\u2026" style="min-height:80px"></textarea></div>' +
      '<div class="fg"><label>&#128218; About This Person</label><textarea id="ac-bio" placeholder="Who are they? How did they shape your life? What do you remember most?\u2026" style="min-height:90px"></textarea></div>' +
      '<div class="fg"><label>\uD83D\uDCDD Relationship Notes</label><textarea id="ac-relnotes" placeholder="Private notes on this relationship\u2026 how it evolved, key moments, feelings\u2026" style="min-height:70px"></textarea></div>' +
      '<div class="fg"><label>\uD83D\uDCDD Notes</label><textarea id="ac-notes" placeholder="Extra notes\u2026" style="min-height:60px"></textarea></div>' +
      buildMediaForm();
    setTimeout(() => rebuildMediaList(), 0);
    this.foot().innerHTML =
      '<button class="btn light" onclick="M.back()">Cancel</button>' +
      '<button class="btn accent" onclick="submitAddChar()">Create Person</button>';
  },

  /* ---- Edit Character ---- */
  _editChar(top) {
    const ch = S.people.find(c => c.id === top.charId); if (!ch) return;
    _charPhoto = ch.photo || null;
    _editMediaList = ch.media ? ch.media.map(m => Object.assign({}, m)) : [];
    this.crumb().textContent = 'Editing';
    this.ttl().textContent   = ch.name;
    const photoPreviewHTML = _charPhoto
      ? '<img id="char-photo-preview" src="' + _charPhoto + '" style="width:72px;height:72px;border-radius:9px;object-fit:cover;border:3px solid #eee;flex-shrink:0">'
      : '<div id="char-photo-preview" class="char-photo-placeholder" style="width:72px;height:72px;font-size:30px;border-radius:9px;margin-bottom:0;flex-shrink:0">\u{1F464}</div>';
    const sel = (v) => ch.status === v ? ' selected' : '';

    this.body().innerHTML =
      '<div class="char-photo-upload-area">' +
        photoPreviewHTML +
        '<div>' +
          '<button type="button" class="btn light sm" onclick="document.getElementById(\'char-photo-in\').click()">\uD83D\uDDBC Change Photo</button>' +
          '<input type="file" id="char-photo-in" accept="image/*" style="display:none" onchange="setCharPhoto(event)">' +
          '<button type="button" class="btn sm" style="margin-left:5px" onclick="clearCharPhoto()">&#10005; Clear</button>' +
        '</div>' +
      '</div>' +
      '<div class="fg"><label>Full Name *</label><input id="ec-name" value="' + esc(ch.name) + '"></div>' +
      '<div class="fg"><label>Nickname / Known As</label><input id="ec-aliases" value="' + esc(ch.aliases || '') + '"></div>' +
      '<div class="fg" style="display:flex;gap:10px">' +
        '<div style="flex:1"><label>Status</label><select id="ec-status"><option value=""' + (ch.status?'':' selected') + '>Unknown</option><option value="Living"' + sel('Living') + '>Living</option><option value="Passed Away"' + sel('Passed Away') + '>Passed Away</option><option value="Lost Touch"' + sel('Lost Touch') + '>Lost Touch</option><option value="Unknown"' + sel('Unknown') + '>Unknown</option></select></div>' +
        '<div style="flex:1"><label>Relationship Type</label><select id="ec-alignment"><option value=""' + (ch.alignment?'':' selected') + '>None</option><option value="Family"' + (ch.alignment==='Family'?' selected':'') + '>Family</option><option value="Partner"' + (ch.alignment==='Partner'?' selected':'') + '>Partner</option><option value="Friend"' + (ch.alignment==='Friend'?' selected':'') + '>Friend</option><option value="Mentor"' + (ch.alignment==='Mentor'?' selected':'') + '>Mentor</option><option value="Colleague"' + (ch.alignment==='Colleague'?' selected':'') + '>Colleague</option><option value="Other"' + (ch.alignment==='Other'?' selected':'') + '>Other</option></select></div>' +
      '</div>' +
      '<div class="fg" style="display:flex;gap:10px">' +
        '<div style="flex:1"><label>Role</label><input id="ec-species" value="' + esc(ch.species || '') + '"></div>' +
        '<div style="flex:1"><label>Occupation / Profession</label><input id="ec-occupation" value="' + esc(ch.occupation || '') + '"></div>' +
      '</div>' +
      '<div class="fg" style="display:flex;gap:10px">' +
        '<div style="flex:1"><label>Birth Date</label><input id="ec-birthdate" value="' + esc(ch.birthDate || '') + '"></div>' +
        '<div style="flex:1"><label>Organization / Group</label><select id="ec-affiliation"><option value="">— None —</option>' + (S.affiliations||[]).map(a => '<option value="' + esc(a) + '"' + (ch.affiliation === a ? ' selected' : '') + '>' + esc(a) + '</option>').join('') + '</select></div>' +
      '</div>' +
      '<div class="fg" style="display:flex;gap:10px">' +
        '<div style="flex:1"><label>Years Known</label><input id="ec-yearsknown" type="number" min="0" value="' + (ch.yearsKnown || 0) + '"></div>' +
        '<div style="flex:1"><label>How We Met</label><input id="ec-howwemet" value="' + esc(ch.howWeMet || '') + '"></div>' +
      '</div>' +
      '<div class="fg"><label>Shared Places <span style="font-weight:400;color:#aaa">(cities, schools, workplaces)</span></label>' +
        '<textarea id="ec-locations" style="min-height:60px">' + esc(ch.locations || '') + '</textarea></div>' +
      '<div class="fg"><label>Accent Colour</label>' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:4px"><input type="color" id="ec-color" value="' + (ch.color || '#4a8fde') + '"></div>' +
        '<div class="swatches">' + PALETTE.map(c2 => '<div class="swatch" style="background:' + c2 + '" onclick="document.getElementById(\'ec-color\').value=\'' + c2 + '\'" ></div>').join('') + '</div>' +
      '</div>' +
      '<div class="fg"><label>&#9889; Skills &amp; Qualities</label><textarea id="ec-powers" style="min-height:80px">' + esc(ch.powers || '') + '</textarea></div>' +
      '<div class="fg"><label>&#128218; About This Person</label><textarea id="ec-bio" style="min-height:90px">' + esc(ch.biography || '') + '</textarea></div>' +
      '<div class="fg"><label>\uD83D\uDCDD Relationship Notes</label><textarea id="ec-relnotes" style="min-height:70px">' + esc(ch.relationshipNotes || '') + '</textarea></div>' +
      '<div class="fg"><label>\uD83D\uDCDD Notes</label><textarea id="ec-notes" style="min-height:60px">' + esc(ch.notes || '') + '</textarea></div>' +
      buildMediaForm();
    setTimeout(() => rebuildMediaList(), 0);
    this.foot().innerHTML =
      '<button class="btn light" onclick="M.back()">Cancel</button>' +
      '<button class="btn accent" onclick="saveChar(\'' + ch.id + '\')">Save Changes</button>';
  },

  /* ---- Event Character Linking ---- */
  _connectionMap(top) {
    document.getElementById('m-title').textContent = '\u{1F578}\uFE0F Relationship Web';
    document.getElementById('m-crumb').textContent = '';
    document.getElementById('m-btns').innerHTML = '';
    document.getElementById('m-foot').innerHTML = '';
    ConnectionMap.build(top);
  },

    _charEvLink(top) {
    const ev = S.events.find(e => e.id === top.evId); if (!ev) return;
    if (!ev.characterIds) ev.characterIds = [];
    const linked   = ev.characterIds.map(cid => S.people.find(c => c.id === cid)).filter(Boolean);
    const unlinked = S.people.filter(c => !ev.characterIds.includes(c.id));
    const opts = unlinked.map(c =>
      '<option value="' + c.id + '">' + esc(c.name) + (c.aliases ? '  (' + esc(c.aliases) + ')' : '') + '</option>'
    ).join('');
    const linkedHTML = linked.length === 0
      ? '<div style="color:#ccc;font-size:12px;padding:4px 0 6px">No characters linked yet.</div>'
      : linked.map(ch => {
          const av = ch.photo
            ? '<img style="width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid #eee" src="' + esc(ch.photo) + '">'
            : '<div class="char-avatar" style="width:28px;height:28px;font-size:13px;flex-shrink:0">' + charInitials(ch.name) + '</div>';
          return '<div class="conn-item">' + av +
            '<span style="flex:1">' + esc(ch.name) +
              (ch.aliases ? '<span style="font-size:10px;color:#aaa;margin-left:6px">' + esc(ch.aliases) + '</span>' : '') +
            '</span>' +
            '<button class="btn danger sm" data-evid="' + ev.id + '" data-chid="' + ch.id + '" onclick="unlinkCharFromEvent(this.dataset.evid,this.dataset.chid)">&#10005;</button></div>';
        }).join('');
    this.crumb().textContent = esc(ev.title);
    this.ttl().textContent   = '\u{1F464} People in this Event';
    this.body().innerHTML =
      '<div style="margin-bottom:18px"><div class="sec-hd"><h3>People in this Event (' + linked.length + ')</h3></div>' + linkedHTML + '</div>' +
      (S.people.length === 0
        ? '<div style="border-top:1px solid #eee;padding-top:14px;color:#ccc;font-size:12px">No people yet. Click <strong>&#128100; People</strong> in the toolbar to create some.</div>'
        : unlinked.length > 0
          ? '<div style="border-top:1px solid #eee;padding-top:16px"><div class="sec-hd"><h3>Link a Person</h3></div>' +
            '<div class="fg"><label>Select person</label><select id="ch-add-sel">' + opts + '</select></div></div>'
          : '<div style="border-top:1px solid #eee;padding-top:14px;font-size:12px;color:#aaa">All people are already linked to this event.</div>'
      );
    this.foot().innerHTML =
      '<button class="btn light" onclick="M.back()">Back</button>' +
      (S.people.length > 0 && unlinked.length > 0
        ? '<button class="btn accent" data-evid="' + ev.id + '" onclick="linkCharToEvent(this.dataset.evid)">Add to Event</button>'
        : '');
  }
};

function syncModalAccessibility() {
  const bg = document.getElementById('modal-bg');
  const modal = document.getElementById('main-modal');
  const title = document.getElementById('m-title');
  if (!bg || !modal) return;
  bg.setAttribute('aria-hidden', bg.classList.contains('open') ? 'false' : 'true');
  if (title) {
    title.setAttribute('role', 'heading');
    title.setAttribute('aria-level', '2');
  }
  bindFormLabels(modal);
  describeInteractiveElements(modal);
  if (bg.classList.contains('open') && !modal.contains(document.activeElement)) {
    const focusable = getFocusable(modal);
    (focusable[0] || modal).focus();
  }
}

const _mOpen = M.open.bind(M);
M.open = function() {
  _mOpen();
  requestAnimationFrame(syncModalAccessibility);
};

const _mClose = M.close.bind(M);
M.close = function() {
  _mClose();
  syncModalAccessibility();
};

const _mRender = M.render.bind(M);
M.render = function() {
  _mRender();
  requestAnimationFrame(syncModalAccessibility);
};

/* =====================================================
   UI overlay helper (Prompt 1.2)
   Generic, idempotent open/close for every secondary overlay
   (range-cfg-overlay, fp-mobile-bar, bio-fp-overlay,
    bio-mobile-more-drawer, bio-mobile-scrim, bio-mob-blank-confirm,
    tlb-sheet, tlb-sheet-scrim, …).
   Every helper is wrapped in try/catch and never throws.
   ===================================================== */
(function(){ /* FIX: isolate bare UI refs from later `const UI` (TDZ) */
var UI = window.UI = window.UI || {};
UI._closing = UI._closing || {};
UI.openOverlay = function(id, opts) {
  try {
    var el = (typeof id === 'string') ? document.getElementById(id) : id;
    if (!el) return false;
    if (el.classList.contains('open')) return true;          /* idempotent */
    el.classList.add('open');
    if (opts && opts.ariaHidden === false) el.removeAttribute('aria-hidden');
    return true;
  } catch (_) { return false; }
};
UI.closeOverlay = function(id) {
  try {
    var el = (typeof id === 'string') ? document.getElementById(id) : id;
    if (!el) return false;
    if (UI._closing[el.id]) return true;                     /* re-entry guard */
    if (!el.classList.contains('open')) return true;         /* already closed */
    UI._closing[el.id] = true;
    try { el.classList.remove('open'); } catch(_){}
    try { el.setAttribute('aria-hidden', 'true'); } catch(_){}
    UI._closing[el.id] = false;
    return true;
  } catch (_) {
    try { UI._closing[id] = false; } catch(__){}
    try { if (typeof notify === 'function') notify('Closed (recovered).'); } catch(__){}
    return false;
  }
};
UI.closeAllOverlays = function(ids) {
  try { (ids || []).forEach(function(i){ UI.closeOverlay(i); }); } catch(_){}
};

/* =====================================================
   GLOBAL ERROR TRAP (Prompt 1.3)
   Last line of defence so a single uncaught error or rejected
   promise can NEVER white-screen the page. Logs full details to the
   console, shows a non-blocking toast, and force-closes any stuck
   overlay so the user can keep working.
   ===================================================== */
(function installGlobalErrorTrap() {
  if (window.__ftlErrorTrapInstalled) return;
  window.__ftlErrorTrapInstalled = true;

  var KNOWN_OVERLAYS = [
    'modal-bg', 'range-cfg-overlay',
    'fp-mobile-bar', 'bio-fp-overlay',
    'bio-mobile-more-drawer', 'bio-mobile-scrim',
    'bio-mob-blank-confirm',
    'tlb-sheet', 'tlb-sheet-scrim'
  ];
  var _lastToast = 0;
  function _safeToast(msg) {
    try {
      var now = Date.now();
      if (now - _lastToast < 1500) return;                   /* throttle */
      _lastToast = now;
      if (typeof notify === 'function') notify(msg, 'error');
    } catch (_) {}
  }
  function _recover() {
    try { UI.closeAllOverlays(KNOWN_OVERLAYS); } catch(_){}
    try {
      var bg = document.getElementById('modal-bg');
      if (bg && bg.classList.contains('open')) {
        bg.classList.remove('open');
        bg.style.display = '';
        bg.setAttribute('aria-hidden', 'true');
      }
    } catch(_){}
    try { document.body && document.body.classList.remove('modal-open'); } catch(_){}
  }

  window.addEventListener('error', function(ev) {
    try {
      console.error('[FTL global error]', ev && (ev.error || ev.message), ev);
      _recover();
      _safeToast('Something glitched — recovered. Your data is safe.');
    } catch (_) {}
  });

  window.addEventListener('unhandledrejection', function(ev) {
    try {
      console.error('[FTL unhandled promise]', ev && ev.reason, ev);
      _recover();
      _safeToast('A background task failed — recovered. Your data is safe.');
    } catch (_) {}
  });
})();
})(); /* /FIX: end UI-overlay IIFE */

document.addEventListener('keydown', function(e) {
  const bg = document.getElementById('modal-bg');
  const modal = document.getElementById('main-modal');
  if (!bg || !modal || !bg.classList.contains('open') || e.key !== 'Tab') return;
  const focusable = getFocusable(modal);
  if (!focusable.length) {
    e.preventDefault();
    modal.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}, true);

/* =====================================================
   HTML BUILDERS
   ===================================================== */
function buildConnsSection(conns) {
  return '<div style="margin-bottom:16px"><div class="sec-hd"><h3>&#128279; Life Links (' + conns.length + ')</h3></div>' +
    '<div style="display:flex;flex-direction:column;gap:6px">' +
    conns.map(cn =>
      '<span style="display:inline-flex;align-items:center;gap:8px;padding:6px 12px;' +
      'background:#faf8f5;border:1px solid #e8e0d0;border-radius:10px;font-size:12px;cursor:pointer;' +
      'border-left:3px solid ' + cn.col + '" ' +
      'onclick="M.openEvDetail(\'' + cn.ev.id + '\')">' +
      '<span style="width:8px;height:8px;border-radius:50%;background:' + cn.col + ';flex-shrink:0;display:inline-block"></span>' +
      '<span style="flex:1;line-height:1.3">' +
        (cn.lbl ? '<span style="font-size:10px;font-weight:800;color:#8b6e4e;display:block;letter-spacing:.3px">' + esc(cn.lbl) + '</span>' : '') +
        '<span style="color:#333">' + esc(cn.ev.title) + '</span>' +
      '</span>' +
      '<span style="color:#bbb;font-size:11px">&#8250;</span>' +
      '</span>'
    ).join('') + '</div></div>';
}

/**
 * Build the sub-events section — works at ANY depth.
 * parentPath is the path array leading to the current node.
 * Improvement #1: clicking the arrow of any sub-event drills into it,
 * and the "+ Add" button at every level lets you add sub-sub-events.
 */
function buildSESection(evId, ses, parentPath) {
  const pathJson = JSON.stringify(parentPath);
  const depthLabel = parentPath.length === 0 ? 'Sub-events' :
                     parentPath.length === 1 ? 'Sub-sub-events' :
                     'Level-' + (parentPath.length + 1) + ' events';
  return '<div style="border-top:1px solid #f0f0f0;padding-top:14px">' +
    '<div class="sec-hd"><h3>&#9889; ' + depthLabel + ' (' + ses.length + ')</h3>' +
    '<button class="btn accent sm" onclick="M.push({t:\'addSE\',evId:\'' + evId + '\',path:' + pathJson + '})">&#65291; Add</button></div>' +
    (ses.length === 0
      ? '<div style="color:#ccc;font-size:12px;padding:4px 0 8px">No ' + depthLabel.toLowerCase() + ' yet. Click <strong>+ Add</strong> to create one.</div>'
      : ses.map((se, i) => {
          const newPath = JSON.stringify([...parentPath, i]);
          const subCount  = (se.subEvents && se.subEvents.length) || 0;
          const mediaCount = (se.media && se.media.length) || 0;
          const hasMeta = subCount > 0 || mediaCount > 0;
          return '<div class="se-item" onclick="M.push({t:\'seDetail\',evId:\'' + evId + '\',path:' + newPath + '})">' +
            '<div class="se-item-body"><h4>' + esc(se.title) + '</h4>' +
            '<p>' + esc(se.description || se.notes || '(no description)') + '</p></div>' +
            (hasMeta ? '<div class="se-meta">' +
              (subCount  > 0 ? '<span class="se-count">&#9889; ' + subCount  + '</span>' : '') +
              (mediaCount > 0 ? '<span class="se-count">\uD83D\uDCCE ' + mediaCount + '</span>' : '') +
              '</div>' : '') +
            '<span class="se-arrow">&#8250;</span></div>';
        }).join('')
    ) + '</div>';
}

/** Get the node (event or sub-event) at a given path */
function getNodeAtPath(evId, path) {
  const ev = S.events.find(e => e.id === evId);
  if (!ev) return null;
  let node = ev;
  for (const i of path) {
    if (!node.subEvents) return null;
    node = node.subEvents[i];
    if (!node) return null;
  }
  return node;
}

function evConns(evId) {
  const res = [];
  for (const c of S.connections) {
    let othId = null;
    if (c.fromEventId === evId) othId = c.toEventId;
    else if (c.toEventId === evId) othId = c.fromEventId;
    if (!othId) continue;
    const oe = S.events.find(e => e.id === othId);
    const ou = oe ? getU(oe.universeId) : null;
    if (oe) res.push({ ev: oe, col: ou ? ou.color : '#aaa', lbl: c.label });
  }
  return res;
}

/* =====================================================
   CHARACTER HELPERS
   ===================================================== */

function charInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getCharUniverseIds(ch) {
  // derive from events — union of universeIds of events this char is in
  const fromEvents = S.events
    .filter(e => (e.characterIds || []).includes(ch.id))
    .map(e => e.universeId);
  const manual = ch.universeIds || [];
  return [...new Set([...manual, ...fromEvents])];
}

function buildCharCard(ch) {
  const uniIds = getCharUniverseIds(ch);
  const tags = uniIds.map(uid => {
    const u = getU(uid);
    return u ? '<span class="char-uni-tag" style="background:' + u.color + '">' + esc(u.name) + '</span>' : '';
  }).join('');
  const statusColors = { 'Living':'#2ecc71','Passed Away':'#e74c3c','Lost Touch':'#f39c12','Unknown':'#95a5a6' };
  const evCount = S.events.filter(e => (e.characterIds||[]).includes(ch.id)).length;
  const avatarHTML = ch.photo
    ? '<div class="char-avatar"><img src="' + esc(ch.photo) + '" alt="' + esc(ch.name) + '"></div>'
    : '<div class="char-avatar">' + charInitials(ch.name) + '</div>';
  return '<div class="char-card" data-id="' + ch.id + '" onclick="_openCharDetail(this.dataset.id)">' +
    avatarHTML +
    '<div class="char-info">' +
      '<div class="char-name-sm">' + esc(ch.name) +
        (ch.status ? ' <span style="display:inline-block;padding:1px 6px;border-radius:8px;font-size:9px;background:' + (statusColors[ch.status]||'#95a5a6') + ';color:#fff;font-weight:700">' + esc(ch.status) + '</span>' : '') +
      '</div>' +
      (ch.aliases ? '<div class="char-aliases-sm">' + esc(ch.aliases) + '</div>' : '') +
      '<div class="char-uni-tags">' + (tags || '<span style="font-size:10px;color:#ccc">No life track links yet</span>') + '</div>' +
    '</div>' +
    '<div style="font-size:10px;color:#bbb;flex-shrink:0;text-align:right">' + evCount + ' event' + (evCount!==1?'s':'') + '</div>' +
  '</div>';
}

function buildCharTimeline(ch, showMeanwhile) {
  const charEvIds = new Set(
    S.events.filter(e => (e.characterIds||[]).includes(ch.id)).map(e => e.id)
  );
  const uniIds = getCharUniverseIds(ch);

  let pool;
  if (showMeanwhile) {
    pool = S.events.filter(e => uniIds.includes(e.universeId) && parseDate(e.date));
  } else {
    pool = S.events.filter(e => charEvIds.has(e.id) && parseDate(e.date));
  }
  pool.sort((a,b) => parseDate(a.date) - parseDate(b.date));

  if (pool.length === 0) {
    return '<div style="color:#ccc;font-size:12px;padding:4px 0 6px">' +
      (charEvIds.size === 0
        ? 'No events linked yet. Open an event and click <strong>\u{1F464} Characters</strong> to link this character.'
        : 'No events with known dates.') + '</div>';
  }

  let html = '<div class="char-tl-outer">';
  for (let i = 0; i < pool.length; i++) {
    const ev = pool[i];
    const u  = getU(ev.universeId);
    const col = u ? u.color : '#888';
    const isChar = charEvIds.has(ev.id);
    const isLast = i === pool.length - 1;
    const opacity = (!isChar && showMeanwhile) ? 'opacity:0.45;' : '';
    html += '<div class="char-tl-item' + (isChar?' is-char':'') + '" style="' + opacity + 'border-left-color:' + col + '" data-evid="' + ev.id + '" onclick="_openEvDetail(this.dataset.evid)">' +
      '<div class="char-tl-dot" style="background:' + col + ';color:' + col + '"></div>' +
      (!isLast ? '<div style="position:absolute;left:7px;top:18px;bottom:-5px;width:2px;background:#e8eaef"></div>' : '') +
      '<div class="char-tl-body" style="border-left-color:' + (isChar?col:'transparent') + '">' +
        '<div class="char-tl-date">' + esc(ev.date || '?') + '</div>' +
        '<div class="char-tl-title">' +
          (!isChar && showMeanwhile ? '<span class="meanwhile-badge">meanwhile &mdash; </span>' : '') +
          esc(ev.title) +
        '</div>' +
        '<div><span class="char-tl-uni-tag" style="background:' + col + '">' + esc(u ? u.name : '?') + '</span></div>' +
      '</div>' +
    '</div>';
  }
  html += '</div>';
  return html;
}

function buildEventCharsSection(ev) {
  if (!ev.characterIds || ev.characterIds.length === 0) return '';
  const chars = ev.characterIds.map(cid => S.people.find(c => c.id === cid)).filter(Boolean);
  if (chars.length === 0) return '';
  const chips = chars.map(ch => {
    const av = ch.photo
      ? '<img class="char-in-event-photo" src="' + esc(ch.photo) + '">'
      : '<span>' + charInitials(ch.name) + '</span>';
    return '<span class="char-in-event" data-id="' + ch.id + '" onclick="_openCharDetail(this.dataset.id)">' + av + esc(ch.name) + '</span>';
  }).join('');
  return '<div style="margin-bottom:14px"><div class="notes-label" style="color:#6a78a0">\u{1F464} PEOPLE IN THIS EVENT</div><div style="display:flex;flex-wrap:wrap;gap:0">' + chips + '</div></div>';
}

/* global nav helpers (avoid nested quote hell in onclick attributes) */
function _openCharDetail(id) { M.push({t:'charDetail',charId:id}); }
function _openEvDetail(id) { M.openEvDetail(id); }
function _charSearchUpdate() {
  const q = (document.getElementById('char-search-q')||{}).value||'';
  if (MS.length > 0) MS[MS.length-1].q = q;
  M.render();
}
function _toggleMeanwhile(charId) {
  _meanwhileMode = !_meanwhileMode;
  const btn = document.getElementById('meanwhile-btn');
  if (btn) { btn.style.background = _meanwhileMode ? '#1a1a2e' : ''; btn.style.color = _meanwhileMode ? '#fff' : ''; }
  const ch = S.people.find(c => c.id === charId);
  if (!ch) return;
  const container = document.getElementById('char-tl-container');
  if (container) container.innerHTML = buildCharTimeline(ch, _meanwhileMode);
}

/* Sort helper */
function _setSortOrder(order) {
  _charSortOrder = order;
}

/* Character Statistics Summary */
function buildCharStats() {
  if (S.people.length === 0) return '';
  
  const totalChars = S.people.length;
  const familyCount = S.people.filter(c => c.alignment === 'Family').length;
  const friendCount = S.people.filter(c => c.alignment === 'Friend').length;
  const partnerCount = S.people.filter(c => c.alignment === 'Partner').length;
  const mentorCount = S.people.filter(c => c.alignment === 'Mentor').length;
  const colleagueCount = S.people.filter(c => c.alignment === 'Colleague').length;
  
  const livingCount = S.people.filter(c => c.status === 'Living').length;
  const passedCount = S.people.filter(c => c.status === 'Passed Away').length;
  const lostTouchCount = S.people.filter(c => c.status === 'Lost Touch').length;
  
  const withAffiliation = S.people.filter(c => c.affiliation).length;
  const withOccupation = S.people.filter(c => c.occupation).length;
  
  const avgEvents = totalChars > 0 ? (S.events.reduce((sum, e) => sum + (e.characterIds?.length || 0), 0) / totalChars).toFixed(1) : 0;
  
  return '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:11px">' +
    '<div style="background:#f0f2f5;padding:8px;border-radius:5px"><strong>' + totalChars + '</strong><br>Total People</div>' +
    '<div style="background:#f0f2f5;padding:8px;border-radius:5px"><strong>' + (familyCount + friendCount + partnerCount + mentorCount + colleagueCount) + '</strong><br>By Type (' + (familyCount ? '<span style="color:#e91e63">Fam:' + familyCount + '</span> ' : '') + (friendCount ? '<span style="color:#3498db">Fr:' + friendCount + '</span> ' : '') + (partnerCount ? '<span style="color:#9b59b6">Par:' + partnerCount + '</span> ' : '') + (mentorCount ? '<span style="color:#f39c12">Men:' + mentorCount + '</span> ' : '') + (colleagueCount ? '<span style="color:#27ae60">Col:' + colleagueCount + '</span>' : '') + ')</div>' +
    '<div style="background:#f0f2f5;padding:8px;border-radius:5px"><strong>' + livingCount + '</strong><br>Living (' + passedCount + ' passed' + (lostTouchCount ? ', ' + lostTouchCount + ' lost touch' : '') + ')</div>' +
    '<div style="background:#f0f2f5;padding:8px;border-radius:5px"><strong>' + withOccupation + '</strong><br>With Occupation</div>' +
    '<div style="background:#f0f2f5;padding:8px;border-radius:5px"><strong>' + withAffiliation + '</strong><br>Org. / Group</div>' +
    '<div style="background:#f0f2f5;padding:8px;border-radius:5px"><strong>' + avgEvents + '</strong><br>Avg Events/Person</div>' +
  '</div>';
}

/* =====================================================
   CHARACTER CRUD
   ===================================================== */

function setCharPhoto(e) {
  const f = e.target.files[0]; if (!f) return;
  if (f.size > 5 * 1024 * 1024) { notify('Image too large (max 5 MB).', 'error'); e.target.value=''; return; }
  const reader = new FileReader();
  reader.onload = ev2 => {
    _charPhoto = ev2.target.result;
    const prev = document.getElementById('char-photo-preview');
    if (prev) {
      prev.outerHTML = '<img id="char-photo-preview" src="' + _charPhoto + '" style="width:72px;height:72px;border-radius:9px;object-fit:cover;border:3px solid #eee;flex-shrink:0">';
    }
    notify('Photo added \u2713', 'success');
  };
  reader.readAsDataURL(f);
  e.target.value = '';
}

function clearCharPhoto() {
  _charPhoto = null;
  const prev = document.getElementById('char-photo-preview');
  if (prev) {
    prev.outerHTML = '<div id="char-photo-preview" class="char-photo-placeholder" style="width:72px;height:72px;font-size:30px;border-radius:9px;margin-bottom:0;flex-shrink:0">\u{1F464}</div>';
  }
}

function submitAddChar() {
  const name = (document.getElementById('ac-name')||{value:''}).value.trim();
  clearFieldError('ac-name');
  if (!name) {
    showFieldError('ac-name', 'Enter a person name.');
    notify('Please enter a name.', 'error');
    return;
  }
  const ch = {
    id: uid(),
    name,
    aliases:   (document.getElementById('ac-aliases')||{value:''}).value.trim(),
    status:    (document.getElementById('ac-status')||{value:''}).value,
    alignment: (document.getElementById('ac-alignment')||{value:''}).value,
    species:   (document.getElementById('ac-species')||{value:''}).value.trim(),
    occupation: (document.getElementById('ac-occupation')||{value:''}).value.trim(),
    affiliation: (document.getElementById('ac-affiliation')||{value:''}).value.trim(),
    birthDate: (document.getElementById('ac-birthdate')||{value:''}).value.trim(),
    yearsKnown: parseInt((document.getElementById('ac-yearsknown')||{value:'0'}).value) || 0,
    howWeMet:  (document.getElementById('ac-howwemet')||{value:''}).value.trim(),
    locations: (document.getElementById('ac-locations')||{value:''}).value.trim(),
    color:     (document.getElementById('ac-color')||{value:'#4a8fde'}).value,
    powers:    (document.getElementById('ac-powers')||{value:''}).value.trim(),
    biography: (document.getElementById('ac-bio')||{value:''}).value.trim(),
    relationshipNotes: (document.getElementById('ac-relnotes')||{value:''}).value.trim(),
    notes:     (document.getElementById('ac-notes')||{value:''}).value.trim(),
    photo:     _charPhoto || null,
    media:     [..._editMediaList],
    universeIds: []
  };
  S.people.push(ch);
  Store.autosave(); M.close(); notify('Character created! \u2713', 'success');
}

function saveChar(charId) {
  const ch = S.people.find(c => c.id === charId); if (!ch) return;
  const name = (document.getElementById('ec-name')||{value:''}).value.trim();
  clearFieldError('ec-name');
  if (!name) {
    showFieldError('ec-name', 'Name is required.');
    notify('Name is required.', 'error');
    return;
  }
  ch.name      = name;
  ch.aliases   = (document.getElementById('ec-aliases')||{value:''}).value.trim();
  ch.status    = (document.getElementById('ec-status')||{value:''}).value;
  ch.alignment = (document.getElementById('ec-alignment')||{value:''}).value;
  ch.species   = (document.getElementById('ec-species')||{value:''}).value.trim();
  ch.occupation = (document.getElementById('ec-occupation')||{value:''}).value.trim();
  ch.affiliation = (document.getElementById('ec-affiliation')||{value:''}).value.trim();
  ch.birthDate = (document.getElementById('ec-birthdate')||{value:''}).value.trim();
  ch.yearsKnown = parseInt((document.getElementById('ec-yearsknown')||{value:'0'}).value) || 0;
  ch.howWeMet  = (document.getElementById('ec-howwemet')||{value:''}).value.trim();
  ch.locations = (document.getElementById('ec-locations')||{value:''}).value.trim();
  ch.color     = (document.getElementById('ec-color')||{value:'#4a8fde'}).value;
  ch.powers    = (document.getElementById('ec-powers')||{value:''}).value.trim();
  ch.biography = (document.getElementById('ec-bio')||{value:''}).value.trim();
  ch.relationshipNotes = (document.getElementById('ec-relnotes')||{value:''}).value.trim();
  ch.notes     = (document.getElementById('ec-notes')||{value:''}).value.trim();
  ch.photo     = _charPhoto;
  ch.media     = [..._editMediaList];
  Store.autosave(); MS.pop(); M.render(); notify('Saved \u2713', 'success');
}

function delChar(charId) {
  const ch = S.people.find(c => c.id === charId);
  ftConfirmGate('Delete "' + (ch?ch.name:'this person') + '"? This will also remove all links to events.', function () {
  S.people = S.people.filter(c => c.id !== charId);
  S.events.forEach(e => { if (e.characterIds) e.characterIds = e.characterIds.filter(id => id !== charId); });
  Store.autosave(); M.close(); notify('Person deleted.', 'warning');
  }, { title: 'Delete person?', confirmLabel: 'Delete', danger: true });
}

function linkCharToEvent(evId) {
  const ev = S.events.find(e => e.id === evId); if (!ev) return;
  const sel = document.getElementById('ch-add-sel'); if (!sel) return;
  const charId = sel.value; if (!charId) return;
  if (!ev.characterIds) ev.characterIds = [];
  if (!ev.characterIds.includes(charId)) ev.characterIds.push(charId);
  Store.autosave(); M.render(); notify('Character linked \u2713', 'success');
}

function unlinkCharFromEvent(evId, charId) {
  const ev = S.events.find(e => e.id === evId); if (!ev) return;
  ev.characterIds = (ev.characterIds||[]).filter(id => id !== charId);
  Store.autosave(); M.render(); notify('Person unlinked.', 'warning');
}


/* =====================================================
   CRUD ACTIONS
   ===================================================== */
function submitAddEv() {
  const title = document.getElementById('ae-t').value.trim();
  const date  = document.getElementById('ae-d').value.trim();
  const uId   = document.getElementById('ae-u').value;
  const desc  = document.getElementById('ae-dc').value.trim();
  const notes = document.getElementById('ae-notes').value.trim();
  const time  = (document.getElementById('ae-time')||{value:''}).value.trim();
  const dateEnd = (document.getElementById('ae-dend')||{value:''}).value.trim();
  const location = (document.getElementById('ae-location')||{value:''}).value.trim();
  const emotionalTone = (document.getElementById('ae-tone')||{value:''}).value;
  const lifeSituation = (document.getElementById('ae-situation')||{value:''}).value;
  const roleStatus = (document.getElementById('ae-role')||{value:''}).value.trim();
  const internalChange = (document.getElementById('ae-internal')||{value:''}).value.trim();
  const status = (document.getElementById('ae-status')||{value:''}).value || null;
  const recFreq = (document.getElementById('ae-recurring')||{value:''}).value;
  clearFieldError('ae-t');
  clearFieldError('ae-d');
  clearFieldError('ae-u');
  if (!title) {
    showFieldError('ae-t', 'Enter an event title.');
    notify('Please enter a title.', 'error');
    return;
  }
  if (!date) {
    showFieldError('ae-d', 'Enter a date in dd/mm/yyyy format.');
    notify('Please enter a date.', 'error');
    return;
  }
  if (!uId) {
    showFieldError('ae-u', 'Select a life track before creating the event.');
    notify('Please select a life track (create one first).', 'error');
    return;
  }
  if (parseDate(date) === null){
    showFieldError('ae-d', 'Year must be numeric, for example xx/xx/2006 or xx/xx/-50000.');
    notify('Year must be a number (e.g. xx/xx/2006, xx/xx/-50000).', 'error');
    return;
  }
  const cat = document.getElementById('ae-cat').value;
  const tags = (document.getElementById('ae-tags')||{value:''}).value.split(',').map(t=>t.trim()).filter(Boolean);
  S.events.push({ id: uid(), universeId: uId, date, dateEnd: dateEnd || null, time: time || null,
    location: location || null, title, description: desc, notes,
    emotionalTone: emotionalTone || null, lifeSituation: lifeSituation || null,
    roleStatus: roleStatus || null, internalChange: internalChange || null,
    media: [..._editMediaList], subEvents: [], category: cat || null, status, tags,
    recurring: recFreq ? { frequency: recFreq } : null });
  Store.autosave(); render(); updateCatFilterBar(); updateStatusFilterBar(); updateTagFilterBar(); updateStatsPanel(); M.close(); notify('Event created! \u2713', 'success');
}

function saveEv(evId) {
  const ev = S.events.find(e => e.id === evId); if (!ev) return;
  const title = document.getElementById('ee-t').value.trim();
  const date  = document.getElementById('ee-d').value.trim();
  const time  = (document.getElementById('ee-time')||{value:''}).value.trim();
  clearFieldError('ee-t');
  clearFieldError('ee-d');
  clearFieldError('ee-u');
  if (!title) {
    showFieldError('ee-t', 'Title is required.');
    notify('Title is required.', 'error');
    return;
  }
  if (!date) {
    showFieldError('ee-d', 'Enter a date in dd/mm/yyyy format.');
    notify('Please enter a date.', 'error');
    return;
  }
  if (parseDate(date) === null){
    showFieldError('ee-d', 'Year must be numeric.');
    notify('Year must be a number.', 'error');
    return;
  }
  if (!document.getElementById('ee-u').value) {
    showFieldError('ee-u', 'Select a life track for this event.');
    notify('Please select a life track.', 'error');
    return;
  }
  ev.title          = title;
  ev.date           = date;
  ev.dateEnd        = (document.getElementById('ee-dend')||{value:''}).value.trim() || null;
  ev.time           = time || null;
  ev.location       = (document.getElementById('ee-location')||{value:''}).value.trim() || null;
  ev.universeId     = document.getElementById('ee-u').value;
  ev.category       = document.getElementById('ee-cat').value || null;
  ev.emotionalTone  = (document.getElementById('ee-tone')||{value:''}).value || null;
  ev.lifeSituation  = (document.getElementById('ee-situation')||{value:''}).value || null;
  ev.roleStatus     = (document.getElementById('ee-role')||{value:''}).value.trim() || null;
  ev.internalChange = (document.getElementById('ee-internal')||{value:''}).value.trim() || null;
  ev.status         = (document.getElementById('ee-status')||{value:''}).value || null;
  const recFreq     = (document.getElementById('ee-recurring')||{value:''}).value;
  ev.recurring      = recFreq ? { frequency: recFreq } : null;
  ev.tags           = (document.getElementById('ee-tags')||{value:''}).value.split(',').map(t=>t.trim()).filter(Boolean);
  ev.description    = document.getElementById('ee-dc').value.trim();
  ev.notes          = document.getElementById('ee-notes').value.trim();
  ev.media          = [..._editMediaList];
  Store.autosave(); render(); updateCatFilterBar(); updateStatusFilterBar(); updateTagFilterBar(); updateStatsPanel();
  MS.pop(); M.render(); notify('Saved \u2713', 'success');
}

function delEvent(evId) {
  ftConfirmGate('Delete this event? This cannot be undone.', function () {
  S.events      = S.events.filter(e => e.id !== evId);
  S.connections = S.connections.filter(c => c.fromEventId !== evId && c.toEventId !== evId);
  Store.autosave(); render(); updateTagFilterBar(); M.close(); notify('Event deleted.', 'warning');
  }, { title: 'Delete event?', confirmLabel: 'Delete', danger: true });
}

function submitAddSE(evId, path) {
  const title = document.getElementById('as-t').value.trim();
  const date  = document.getElementById('as-d').value.trim();
  const desc  = document.getElementById('as-dc').value.trim();
  const notes = document.getElementById('as-notes').value.trim();
  const time  = (document.getElementById('as-time')||{value:''}).value.trim();
  if (!title) { notify('Title is required.', 'error'); return; }
  const ev = S.events.find(e => e.id === evId); if (!ev) return;
  let node = ev;
  for (const i of path) {
    if (!node.subEvents) node.subEvents = [];
    node = node.subEvents[i]; if (!node) return;
  }
  if (!node.subEvents) node.subEvents = [];
  node.subEvents.push({ id: uid(), title, date, time: time || null, description: desc,
    notes, media: [..._editMediaList], subEvents: [] });
  Store.autosave(); MS.pop(); M.render(); notify('Sub-event added \u2713', 'success');
}

function saveSE(evId, path) {
  const ev = S.events.find(e => e.id === evId); if (!ev) return;
  let node = ev;
  for (const i of path) { if (!node.subEvents) return; node = node.subEvents[i]; if (!node) return; }
  node.title       = document.getElementById('es-t').value.trim() || node.title;
  node.date        = document.getElementById('es-d').value.trim();
  node.time        = (document.getElementById('es-time')||{value:''}).value.trim() || null;
  node.description = document.getElementById('es-dc').value.trim();
  node.notes       = document.getElementById('es-notes').value.trim();
  node.media       = [..._editMediaList];
  Store.autosave(); MS.pop(); M.render(); notify('Saved \u2713', 'success');
}

function delSE(evId, path) {
  ftConfirmGate('Delete this sub-event and all its children? This cannot be undone.', function () {
  const ev = S.events.find(e => e.id === evId); if (!ev) return;
  let parent = ev;
  for (const i of path.slice(0, -1)) { if (!parent.subEvents) return; parent = parent.subEvents[i]; if (!parent) return; }
  if (!parent.subEvents) return;
  parent.subEvents.splice(path[path.length - 1], 1);
  Store.autosave(); MS.pop(); M.render(); notify('Deleted.', 'warning');
  }, { title: 'Delete sub-event?', confirmLabel: 'Delete', danger: true });
}

function addConn(fromId) {
  const toId = document.getElementById('cn-to').value;
  const lbl  = document.getElementById('cn-lb').value.trim();
  if (!toId) { notify('Please select an event.', 'error'); return; }
  const dup = S.connections.some(c =>
    (c.fromEventId === fromId && c.toEventId === toId) ||
    (c.fromEventId === toId   && c.toEventId === fromId));
  if (dup) { notify('Connection already exists.', 'error'); return; }
  S.connections.push({ id: uid(), fromEventId: fromId, toEventId: toId, label: lbl });
  Store.autosave(); render(); M.render(); notify('Connection added \u2713', 'success');
}

function delConn(connId, evId) {
  S.connections = S.connections.filter(c => c.id !== connId);
  Store.autosave(); render(); M.render(); notify('Connection removed.', 'warning');
}

function submitAddUni() {
  const name  = document.getElementById('au-n').value.trim();
  const color = document.getElementById('au-c').value;
  clearFieldError('au-n');
  if (!name) {
    showFieldError('au-n', 'Enter a life track name.');
    notify('Please enter a name.', 'error');
    return;
  }
  const uDesc      = (document.getElementById('au-desc') ||{value:''}).value.trim();
  const uNotes     = (document.getElementById('au-notes')||{value:''}).value.trim();
  const uBirthDate = (document.getElementById('au-birth')||{value:''}).value.trim();
  S.lifeTracks.push({ id: uid(), name, color, visible: true, description: uDesc, notes: uNotes,
    birthDate: uBirthDate || null });
  Store.autosave(); clampPanY(); render(); updateUniToggleBar(); M.close(); notify('Life Track created \u2713', 'success');
}

function saveUni(uId) {
  const u = getU(uId); if (!u) return;
  const name = document.getElementById('eu-n').value.trim();
  clearFieldError('eu-n');
  if (!name) {
    showFieldError('eu-n', 'Name is required.');
    notify('Name is required.', 'error');
    return;
  }
  u.name        = name;
  u.color       = document.getElementById('eu-c').value;
  u.birthDate   = (document.getElementById('eu-birth')||{value:''}).value.trim() || null;
  u.description = (document.getElementById('eu-desc') ||{value:''}).value.trim();
  u.notes       = (document.getElementById('eu-notes')||{value:''}).value.trim();
  Store.autosave(); render(); updateUniToggleBar(); M.close(); notify('Life Track updated \u2713', 'success');
}

function delUni(uId) {
  const u = getU(uId);
  const cnt = S.events.filter(e => e.universeId === uId).length;
  ftConfirmGate('Delete "' + (u ? u.name : 'this life track') + '"?' +
    (cnt ? ' This will also delete ' + cnt + ' event(s).' : ''), function () {
  S.events      = S.events.filter(e => e.universeId !== uId);
  S.lifeTracks   = S.lifeTracks.filter(u2 => u2.id !== uId);
  Store.autosave(); clampPanY(); render(); M.close(); notify('Life Track deleted.', 'warning');
  }, { title: 'Delete life track?', confirmLabel: 'Delete', danger: true });
}

/* =====================================================
   CATEGORY EDITOR CRUD
   ===================================================== */
function catEditorRemove(idx) {
  const cats = Object.keys(CATEGORIES);
  if (idx < 0 || idx >= cats.length) return;
  const catName = cats[idx];
  const evCount = S.events.filter(e => e.category === catName).length;
  function _go() {
    S.events.forEach(e => { if (e.category === catName) e.category = null; });
    delete CATEGORIES[catName];
    syncCategoriesToState();
    Store.autosave();
    M.render();
    notify('Category "' + catName + '" removed.', 'warning');
  }
  if (evCount > 0) {
    ftConfirmGate(
      'Delete "' + catName + '"? ' + evCount + ' event(s) use this category — they will become uncategorized.',
      _go,
      { title: 'Delete category?', confirmLabel: 'Delete', danger: true }
    );
    return;
  }
  _go();
}

function catEditorAdd() {
  const nameEl = document.getElementById('ce-new-name');
  const colEl = document.getElementById('ce-new-col');
  const iconEl = document.getElementById('ce-new-icon');
  const name = (nameEl ? nameEl.value : '').trim();
  if (!name) { notify('Please enter a category name.', 'error'); return; }
  if (CATEGORIES[name]) { notify('A category named "' + name + '" already exists.', 'error'); return; }
  const color = colEl ? colEl.value : '#888888';
  const icon = (iconEl ? iconEl.value : '').trim() || '📌';
  CATEGORIES[name] = { color, icon };
  syncCategoriesToState();
  Store.autosave();
  if (nameEl) nameEl.value = '';
  M.render();
  notify('Category "' + name + '" added!', 'success');
}

function catEditorSave() {
  const oldCats = Object.keys(CATEGORIES);
  const newCategories = {};
  const renameMap = {};
  for (let i = 0; i < oldCats.length; i++) {
    const nameEl = document.getElementById('ce-name-' + i);
    const colEl = document.getElementById('ce-col-' + i);
    const iconEl = document.getElementById('ce-icon-' + i);
    if (!nameEl) continue;
    const newName = nameEl.value.trim();
    if (!newName) continue;
    const color = colEl ? colEl.value : '#888';
    const icon = (iconEl ? iconEl.value : '').trim() || '📌';
    if (newName !== oldCats[i]) {
      renameMap[oldCats[i]] = newName;
    }
    newCategories[newName] = { color, icon };
  }
  const dupes = {};
  for (const k in newCategories) {
    const lower = k.toLowerCase();
    if (dupes[lower]) { notify('Duplicate category name: "' + k + '". Please use unique names.', 'error'); return; }
    dupes[lower] = true;
  }
  S.events.forEach(ev => {
    if (ev.category && renameMap[ev.category]) {
      ev.category = renameMap[ev.category];
    }
  });
  CATEGORIES = newCategories;
  syncCategoriesToState();
  Store.autosave();
  render();
  updateCatFilterBar();
  updateStatsPanel();
  M.close();
  notify('Categories updated!', 'success');
}

function catEditorResetDefaults() {
  ftConfirmGate('Reset all categories to defaults? Custom categories will be lost. Events using removed categories will become uncategorized.', function () {
  const defaultNames = Object.keys(DEFAULT_CATEGORIES);
  S.events.forEach(ev => {
    if (ev.category && !DEFAULT_CATEGORIES[ev.category]) {
      ev.category = null;
    }
  });
  CATEGORIES = {};
  for (const k in DEFAULT_CATEGORIES) CATEGORIES[k] = Object.assign({}, DEFAULT_CATEGORIES[k]);
  syncCategoriesToState();
  Store.autosave();
  M.render();
  notify('Categories reset to defaults.', 'warning');
  }, { title: 'Reset categories to defaults?', confirmLabel: 'Reset', danger: true });
}

/* =====================================================
   AFFILIATION EDITOR FUNCTIONS
   ===================================================== */
function affiliationEditorAdd() {
  const nameEl = document.getElementById('aff-new-name');
  const name = (nameEl ? nameEl.value : '').trim();
  if (!name) { notify('Please enter an affiliation name.', 'error'); return; }
  if (!S.affiliations) S.affiliations = [];
  if (S.affiliations.includes(name)) { notify('"' + name + '" already exists.', 'error'); return; }
  S.affiliations.push(name);
  Store.autosave();
  if (nameEl) nameEl.value = '';
  M.render();
  notify('Organization "' + name + '" added!', 'success');
}

function affiliationEditorRemove(idx) {
  if (!S.affiliations) return;
  const name = S.affiliations[idx];
  if (name === undefined) return;
  const charCount = S.people.filter(c => c.affiliation === name).length;
  function _go() {
    S.people.forEach(c => { if (c.affiliation === name) c.affiliation = ''; });
    S.affiliations.splice(idx, 1);
    Store.autosave();
    M.render();
    notify('Organization "' + name + '" removed.', 'warning');
  }
  if (charCount > 0) {
    ftConfirmGate(
      'Remove "' + name + '"? ' + charCount + ' person/people use this organization — their field will be cleared.',
      _go,
      { title: 'Remove organization?', confirmLabel: 'Remove', danger: true }
    );
    return;
  }
  _go();
}

function affiliationEditorSave() {
  if (!S.affiliations) S.affiliations = [];
  const count = S.affiliations.length;
  const newAffs = [];
  const renameMap = {};
  for (let i = 0; i < count; i++) {
    const el = document.getElementById('aff-name-' + i);
    if (!el) continue;
    const newName = el.value.trim();
    if (!newName) continue;
    const oldName = S.affiliations[i];
    if (newName !== oldName) renameMap[oldName] = newName;
    newAffs.push(newName);
  }
  const seen = {};
  for (const n of newAffs) {
    const lower = n.toLowerCase();
    if (seen[lower]) { notify('Duplicate affiliation name: "' + n + '". Please use unique names.', 'error'); return; }
    seen[lower] = true;
  }
  S.people.forEach(c => {
    if (c.affiliation && renameMap[c.affiliation]) c.affiliation = renameMap[c.affiliation];
  });
  S.affiliations = newAffs;
  Store.autosave();
  M.close();
  notify('Organizations updated!', 'success');
}

/* =====================================================
   UI ACTIONS (called from toolbar)
   ===================================================== */
const UI = {
  addEvent(presetUni, presetYear) {
    M.push({ t: 'addEv',
      uId:   presetUni || (S.lifeTracks[0] ? S.lifeTracks[0].id : ''),
      date:  presetYear ? 'xx/xx/' + presetYear : '',
      title: '', desc: ''
    });
  },
  addUniverse() {
    M.push({ t: 'addUni', name: '', color: PALETTE[S.lifeTracks.length % PALETTE.length] });
  },
  help() {
    _helpState = { query: '', activeId: HELP_GUIDE_SECTIONS[0].id };
    M.push({ t: 'help' });
  },
  people() {
    _meanwhileMode = false;
    M.push({ t: 'charList', q: '' });
  },
  connectionMap() {
    M.push({ t: 'connectionMap' });
  },
  catEditor() {
    M.push({ t: 'catEditor' });
  },
  affiliationEditor() {
    M.push({ t: 'affiliationEditor' });
  },
  charEvLink(evId) {
    M.push({ t: 'charEvLink', evId });
  },
  toggleStats() {
    _statsVisible = !_statsVisible;
    const btn = document.getElementById('stats-btn');
    if (btn) btn.style.background = _statsVisible ? 'rgba(74,143,222,0.3)' : '';
    updateStatsPanel();
  },
  toggleKbd() {
    _kbdVisible = !_kbdVisible;
    const panel = document.getElementById('kbd-panel');
    if (panel) {
      if (_kbdVisible) {
        panel.classList.add('visible');
        // re-trigger animation
        panel.style.animation = 'none';
        requestAnimationFrame(() => { panel.style.animation = ''; });
      } else {
        panel.classList.remove('visible');
      }
    }
  }
};

/* =====================================================
   PERSISTENCE
   ===================================================== */
const SKEY = 'inf_biography_v1';
const Store = {
  autosave() {
    try {
      if (_blankTemplateMode && isBlankTemplateState(S)) {
        localStorage.removeItem(SKEY);
        return;
      }
      localStorage.setItem(SKEY, JSON.stringify(S));
    } catch (_) {}
  },
  normalize() {
    S.lifeTracks = Array.isArray(S.lifeTracks) ? S.lifeTracks : [];
    S.events = Array.isArray(S.events) ? S.events : [];
    S.connections = Array.isArray(S.connections) ? S.connections : [];
    S.people = Array.isArray(S.people) ? S.people : [];
    S.categories = S.categories && typeof S.categories === 'object' ? S.categories : {};
    S.affiliations = Array.isArray(S.affiliations) ? S.affiliations : [];
    syncCategoriesFromState();
  },
  load() {
    try {
      const raw = localStorage.getItem(SKEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (isBlankTemplateState(d)) {
          localStorage.removeItem(SKEY);
          return false;
        }
        S.lifeTracks    = d.lifeTracks || d.universes || [];
        S.events       = d.events      || [];
        S.connections  = d.connections || [];
        S.people       = d.characters  || d.people || [];
        S.categories   = d.categories  || {};
        S.affiliations = d.affiliations || [];
        Store.normalize();
        return true;
      }
    } catch (_) {}
    return false;
  },
  clearSavedBlank() {
    try {
      const raw = localStorage.getItem(SKEY);
      if (raw && isBlankTemplateState(JSON.parse(raw))) localStorage.removeItem(SKEY);
    } catch (_) {}
  },

  /* ---- Save as portable self-contained HTML ---- */
  saveHTML() {
    notify('Preparing HTML file\u2026', 'info');
    fetch(location.href)
      .then(r => r.text())
      .then(src => {
        // Replace state between markers with current data.
        // UE-17/BE-16: make the embedded state marker- and script-safe. Escape
        // '<' and '>' so a note containing a closing script tag cannot break out
        // of the script element, and escape '/' so user text can never forge the
        // STATE_START / STATE_END comment markers. JSON.parse on import restores
        // every original character, so the round-trip stays lossless.
        const stateJSON = JSON.stringify(S).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/\//g, '\\/');
        const newSrc = src.replace(
          /\/\*STATE_START\*\/[\s\S]*?\/\*STATE_END\*\//,
          '/*STATE_START*/let S = ' + stateJSON + ';/*STATE_END*/'
        );
        const blob = new Blob([newSrc], { type: 'text/html' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        const date = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = 'free-timeline_' + date + '.html';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        notify('Timeline saved as HTML \u2713', 'success');
      })
      .catch(() => {
        /* Fallback: build HTML from scratch using template */
        Store._saveHTMLFallback();
      });
  },

  /* Fallback for when fetch(location.href) is blocked (e.g. file:// protocol) */
  _saveHTMLFallback() {
    // UE-17/BE-16: marker- and script-safe embed (see saveHTML above).
    const stateJSON = JSON.stringify(S).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/\//g, '\\/');
    /* Inject state into the page's own script by reading the document */
    const clone = document.documentElement.outerHTML;
    const newSrc = clone.replace(
      /\/\*STATE_START\*\/[\s\S]*?\/\*STATE_END\*\//,
      '/*STATE_START*/let S = ' + stateJSON + ';/*STATE_END*/'
    );
    const blob = new Blob([newSrc], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = 'free-timeline_' + date + '.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notify('Timeline saved as HTML \u2713', 'success');
  },

  /* ---- Export as plain JSON backup ---- */
  saveJSON() {
    const json = JSON.stringify(S, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = 'free-timeline_' + date + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notify('Data exported as JSON \u2713', 'success');
  },

  blankTimeline() {
    /* #018 part 2: mobile-safe two-step confirm with backup prompt. */
    if (typeof ftConfirm === 'function') {
      ftConfirm({
        title: 'Clear and start a blank timeline?',
        message: 'This will clear all life tracks, events, people, and connections from your browser. You can save a JSON backup first.',
        confirmLabel: 'Continue',
        cancelLabel: 'Cancel',
        danger: true
      }).then(function (ok) {
        if (!ok) return;
        ftConfirm({
          title: 'Save a backup first?',
          message: 'Recommended: export a JSON file so you can restore your work later.',
          confirmLabel: 'Save backup, then clear',
          cancelLabel: 'Clear without saving'
        }).then(function (save) {
          if (save) Store.saveJSON();
          Store._doBlank();
        });
      });
      return;
    }
    if (!confirm('Are you sure you want a blank template?')) return;
    if (confirm('Do you want to save your work before making a blank template?')) Store.saveJSON();
    Store._doBlank();
  },

  _doBlank() {
    _blankTemplateMode = true;
    S.lifeTracks = [{ id: uid(), name: 'Untitled', color: PALETTE[0], visible: true, description: '', notes: '', birthDate: null }];
    S.events = [];
    S.connections = [];
    S.people = [];
    S.affiliations = [];
    if (!S.categories || Object.keys(S.categories).length === 0) syncCategoriesToState();
    V.panX = 0; V.panY = 0; V.scale = 1;
    const zoom = document.getElementById('zoom-pct'); if (zoom) zoom.textContent = '100%';
    Store.autosave();
    History.clear();  /* BE-13: blank is a hard boundary — clear undo */
    MS = [];
    M.close();
    clampPanY();
    render();
    updateUniToggleBar();
    updateCatFilterBar();
    updateStatusFilterBar();
    updateTagFilterBar();
    updateStatsPanel();
    notify('Blank timeline ready.', 'warning');
  },

  importClick() { document.getElementById('file-in').click(); },

  /* ---- Unified import: handles both .html and .json files ---- */
  importFile(e) {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
      try {
        /* #053: enforce a hard size cap before parsing. */
        if (typeof ftImportSizeOK === 'function' && !ftImportSizeOK(ev.target.result)) {
          notify('File is too large (max ' + Math.round(ftImportMaxBytes/1024/1024) + ' MB).', 'error');
          return;
        }
        let raw;
        if (f.name.endsWith('.html') || f.type === 'text/html') {
          /* Extract embedded state from a saved HTML file using markers */
          const match = ev.target.result.match(/\/\*STATE_START\*\/let S\s*=\s*([\s\S]*?);\/\*STATE_END\*\//);
          if (!match) { notify('Could not find timeline data in this HTML file.', 'error'); return; }
          raw = JSON.parse(match[1]);
        } else {
          raw = JSON.parse(ev.target.result);
        }
        /* #053: shared validator strips javascript:/data: URLs and enforces shape. */
        const d = (typeof ftValidateImport === 'function')
          ? ftValidateImport(raw, { kind: 'biography' })
          : raw;
        ftConfirmGate('Loading will replace ALL current data. Continue?', function () {
          const wasLegacy = !!d._wasLegacy;
          S.lifeTracks    = d.lifeTracks || d.universes || [];
          S.events       = d.events      || [];
          S.connections  = d.connections || [];
          S.people       = d.people      || d.characters  || [];
          S.categories   = d.categories  || {};
          S.affiliations = d.affiliations || [];
          syncCategoriesFromState();
          Store.autosave();
          History.clear();  /* BE-13: undo must not cross the import boundary */
          clampPanY(); render();
          updateCatFilterBar(); updateStatusFilterBar(); updateTagFilterBar(); updateUniToggleBar(); updateStatsPanel();
          if (wasLegacy) {
            setTimeout(() => notify('File loaded \u2713 — your Universes are now Life Tracks. All data is intact. Rename them at your own pace.', 'success'), 400);
          } else {
            notify('Timeline loaded \u2713', 'success');
          }
        }, { title: 'Replace all data?', confirmLabel: 'Replace', danger: true });
      } catch (err) { notify('Could not read file: ' + err.message, 'error'); }
    };
    r.readAsText(f); e.target.value = '';
  }
};

  /* =====================================================
     UNDO / REDO HISTORY
     ===================================================== */
  const History = (() => {
    const _undo = [];
    const _redo = [];
    const MAX   = 60;
    let   _busy = false;

    const _origSave = Store.autosave.bind(Store);
    Store.autosave = function () {
      if (!_busy) {
        const snap = localStorage.getItem(SKEY);
        if (snap) {
          _undo.push(snap);
          if (_undo.length > MAX) _undo.shift();
          _redo.length = 0;
          _updateUI();
        }
      }
      _origSave();
    };

    function _restore(json) {
      try {
        const d = JSON.parse(json);
        S.lifeTracks   = d.lifeTracks || d.universes || [];
        S.events       = d.events       || [];
        S.connections  = d.connections  || [];
        S.people       = d.people || d.characters || [];
        S.categories   = d.categories   || {};
        S.affiliations = d.affiliations || [];
        syncCategoriesFromState();
        clampPanY();
        render();
        updateUniToggleBar();
        updateCatFilterBar();
        if (typeof updateStatsPanel === 'function') updateStatsPanel();
        M.close();
      } catch (e) { notify('Could not restore state.', 'error'); }
    }

    function _saveBypass() {
      _busy = true;
      _origSave();
      _busy = false;
    }

    function _updateUI() {
      const ub = document.getElementById('undo-btn');
      const rb = document.getElementById('redo-btn');
      if (ub) { ub.disabled = _undo.length === 0; ub.style.opacity = _undo.length === 0 ? '0.5' : '1'; }
      if (rb) { rb.disabled = _redo.length === 0; rb.style.opacity = _redo.length === 0 ? '0.5' : '1'; }
    }

    return {
      undo() {
        if (_undo.length === 0) { notify('Nothing to undo.', 'info'); return; }
        const cur = localStorage.getItem(SKEY);
        if (cur) { _redo.push(cur); if (_redo.length > MAX) _redo.shift(); }
        _restore(_undo.pop());
        _saveBypass();
        _updateUI();
        notify('Undone ↩', 'info');
      },
      redo() {
        if (_redo.length === 0) { notify('Nothing to redo.', 'info'); return; }
        const cur = localStorage.getItem(SKEY);
        if (cur) { _undo.push(cur); if (_undo.length > MAX) _undo.shift(); }
        _restore(_redo.pop());
        _saveBypass();
        _updateUI();
        notify('Redone ↪', 'info');
      },
      clear() {
        /* BE-13: wipe both stacks at a full-data-replacement boundary
           (import / blank) so undo can never restore data from across it. */
        _undo.length = 0; _redo.length = 0; _updateUI();
      }
    };
  })();

  /* Parity fix (same class as Universe UE-1): expose the single History on
     window so the toolbar + mobile-drawer Undo/Redo buttons reach it. They are
     wired in biography.html as onclick="History.undo()/redo()", which evaluates
     in GLOBAL scope; a top-level `const` is not a window property, so without
     this they bound to the built-in DOM window.History (which has no .undo) and
     silently did nothing — only the engine-scoped Ctrl+Z/Ctrl+Y path worked. */
  window.History = History;
    

/* =====================================================
   SAMPLE DATA (loaded on first run)
   ===================================================== */
function loadSample() {
  if (Store.load()) return;
  /* #021: Neutral, generic sample data shown on first run when localStorage is empty.
     Replace with your own content by clicking + Event / + Life Track / + Person.
     (Real user data lives in localStorage and is never touched by this fallback.) */
  S.lifeTracks = [
    { id: 'u1', name: 'Sample Track A — Personal',  color: '#9b59b6', visible: true, description: 'Example life-track. Replace with your own.' },
    { id: 'u2', name: 'Sample Track B — Career',    color: '#3498db', visible: true, description: 'Another example track. Use these to group events by theme.' },
    { id: 'u3', name: 'Sample Track C — Relationships', color: '#e91e63', visible: true, description: 'Tracks are just labels — give them any meaning you like.' }
  ];
  S.events = [
    { id: 'e01', universeId: 'u1', date: 'xx/xx/2000', title: 'Sample Event 1',
      description: 'This is an example event. Click it to edit, or delete it and add your own.',
      notes: '', location: '',
      emotionalTone: '', roleStatus: null, internalChange: null,
      category: 'Other', media: [], characterIds: ['ch01'],
      subEvents: [] },
    { id: 'e02', universeId: 'u2', date: 'xx/xx/2010', title: 'Sample Event 2',
      description: 'Events can be linked to any number of people and tracks.',
      notes: '', location: '',
      emotionalTone: '', roleStatus: null, internalChange: null,
      category: 'Other', media: [], characterIds: [],
      subEvents: [] },
    { id: 'e03', universeId: 'u3', date: 'xx/xx/2020', title: 'Sample Event 3',
      description: 'Drag to pan the timeline, scroll or pinch to zoom.',
      notes: '', location: '',
      emotionalTone: '', roleStatus: null, internalChange: null,
      category: 'Other', media: [], characterIds: ['ch01'],
      subEvents: [] }
  ];
  S.people = [
    {
      id: 'ch01', name: 'Sample Person A', aliases: '',
      status: 'Living', alignment: 'Other', species: '', color: '#3498db',
      photo: null, birthDate: '',
      occupation: '', affiliation: '',
      locations: '',
      powers: '',
      biography: 'This is an example person. Replace with someone from your life — or delete and add your own.',
      notes: '',
      relationshipNotes: '',
      yearsKnown: 0, howWeMet: '',
      media: [], universeIds: ['u1']
    }
  ];
  S.connections = [
    { id: 'c1', fromEventId: 'e01', toEventId: 'e02', label: 'Followed by →' },
    { id: 'c2', fromEventId: 'e02', toEventId: 'e03', label: 'Followed by →' }
  ];
  syncCategoriesToState();
}


/* =====================================================
   MULTI-VIEW SYSTEM
   ===================================================== */
let _currentView = 'timeline';
function switchView(view) {
  if (typeof MemoryTour !== 'undefined' && MemoryTour.active && view !== 'timeline') MemoryTour.stop(false);
  if (typeof ContinuityTour !== 'undefined' && ContinuityTour.active && view !== 'timeline') ContinuityTour.stop(false);
  _currentView = view;
  const canvasWrap = document.getElementById('canvas-wrap');
  const filterPanel = document.getElementById('filter-panel');
  const kbdHint = document.getElementById('kbd-hint');
  const zoomCtrl = document.getElementById('zoom-ctrl');
  const statsPanel = document.getElementById('stats-panel');

  const isTimeline = view === 'timeline';
  canvasWrap.style.display = isTimeline ? 'block' : 'none';
  filterPanel.style.display = isTimeline ? '' : 'none';

  document.getElementById('people-view').classList.toggle('visible', view === 'people');
  document.getElementById('map-view').classList.toggle('visible', view === 'map');
  document.getElementById('stats-full-view').classList.toggle('visible', view === 'stats');

  ['timeline','people','map','stats'].forEach(function(v) {
    var tab = document.getElementById('tab-' + v);
    if (tab) tab.classList.toggle('active', v === view);
  });

  if (view === 'people') renderPeopleView();
  if (view === 'map') { setTimeout(function() { ConnectionMap.build(document.getElementById('map-view')); }, 60); }
  if (view === 'stats') renderStatsFullView();

  if (isTimeline) {
    setTimeout(function() {
      var wrap = document.getElementById('canvas-wrap');
      var canvas = document.getElementById('tl-canvas');
      canvas.width = wrap.clientWidth;
      canvas.height = wrap.clientHeight;
      render();
    }, 50);
  }
}

function renderPeopleView() {
  var grid = document.getElementById('pv-grid');
  if (!grid) return;
  var q = (document.getElementById('pv-search') || {}).value || '';
  q = q.toLowerCase().trim();

  var chars = S.people.filter(function(ch) {
    if (!q) return true;
    return ch.name.toLowerCase().includes(q) ||
      (ch.aliases || '').toLowerCase().includes(q) ||
      (ch.occupation || '').toLowerCase().includes(q) ||
      (ch.affiliation || '').toLowerCase().includes(q) ||
      (ch.alignment || '').toLowerCase().includes(q) ||
      (ch.notes || '').toLowerCase().includes(q) ||
      (ch.relationshipNotes || '').toLowerCase().includes(q);
  });

  if (chars.length === 0) {
    var isFirst = S.people.length === 0;
    grid.innerHTML =
      '<div class="pv-empty">' +
        '<div class="pv-empty-glyph">\u2766 \u2766 \u2766</div>' +
        '<div class="pv-empty-title">' + (isFirst ? 'Your archive is waiting' : 'No one matches that search') + '</div>' +
        '<div class="pv-empty-msg">' +
          (isFirst
            ? 'Every life is a tapestry of the people in it. Start by adding someone who shaped your story \u2014 family, a friend, a mentor.'
            : 'Try a different name, alias, occupation, relationship, or note keyword.') +
        '</div>' +
        (isFirst ? '<div class="pv-empty-cta">Use the <strong>+ New Person</strong> button to begin.</div>' : '') +
      '</div>';
    return;
  }

  var relationshipColors = { 'Family': '#b05070', 'Partner': '#9b59b6', 'Friend': '#3498db', 'Mentor': '#e09a3c', 'Colleague': '#4a9375', 'Other': '#95867a' };

  grid.innerHTML = chars.map(function(ch) {
    var evCnt = S.events.filter(function(e) { return (e.characterIds||[]).includes(ch.id); }).length;
    var uniIds = getCharUniverseIds(ch);
    var tagsHTML = uniIds.slice(0, 4).map(function(uid) {
      var u = getU(uid);
      return u ? '<span class="pv-tag" style="background:' + u.color + '">' + esc(u.name) + '</span>' : '';
    }).join('');
    if (uniIds.length > 4) {
      tagsHTML += '<span class="pv-tag" style="background:#8a7556">+' + (uniIds.length - 4) + '</span>';
    }

    var avatarInner = ch.photo
      ? '<img src="' + esc(ch.photo) + '" alt="' + esc(ch.name) + '">'
      : ch.name.split(' ').map(function(w){return w[0]||''}).join('').slice(0,2).toUpperCase();

    var statusColors = { 'Living': '#4a9375', 'Passed Away': '#7a5a4a', 'Lost Touch': '#c08040', 'Unknown': '#95867a' };
    var sCol = statusColors[ch.status] || '#95867a';
    var relCol = relationshipColors[ch.alignment] || '#95867a';
    var accent = relCol;

    var chipsHTML = '';
    if (ch.alignment) chipsHTML += '<span class="pv-chip rel" style="background:' + relCol + '">' + esc(ch.alignment) + '</span>';
    if (ch.status)    chipsHTML += '<span class="pv-chip rel" style="background:' + sCol + '">' + esc(ch.status) + '</span>';
    if (ch.occupation) chipsHTML += '<span class="pv-chip meta">' + esc(ch.occupation) + '</span>';

    var ticksMax = 8;
    var ticksFilled = Math.min(evCnt, ticksMax);
    var ticksHTML = '';
    for (var i = 0; i < ticksMax; i++) {
      ticksHTML += '<span class="pv-events-tick' + (i >= ticksFilled ? ' empty' : '') + '"></span>';
    }
    var eventsLabel = evCnt === 0
      ? '<span class="zero">No linked memories</span>'
      : evCnt + ' memor' + (evCnt !== 1 ? 'ies' : 'y');

    var metaHTML = '';
    if (ch.yearsKnown) metaHTML += '<span class="pv-meta-label">Years</span><span>' + esc(String(ch.yearsKnown)) + '</span>';
    if (ch.yearsKnown && ch.affiliation) metaHTML += '<span style="color:#d8c6a4">\u2022</span>';
    if (ch.affiliation) metaHTML += '<span class="pv-meta-label">Where</span><span>' + esc(ch.affiliation) + '</span>';

    var contextText = ch.relationshipNotes || ch.howWeMet || ch.notes || '';
    var contextHTML = contextText ? '<div class="pv-context">' + esc(contextText) + '</div>' : '';

    var avatarStyle = ch.photo ? '' : 'background:' + accent + ';color:#fff;font-weight:800';

    return '<div class="pv-card" tabindex="0" role="button" aria-label="Open archive entry for ' + esc(ch.name) + '" ' +
        'data-cid="' + ch.id + '" ' +
        'style="--pv-accent:' + accent + '" ' +
        'onclick="MS=[{t:\'charDetail\',charId:\'' + ch.id + '\'}];M.push(MS[0]);M.render()" ' +
        'onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();MS=[{t:\'charDetail\',charId:\'' + ch.id + '\'}];M.push(MS[0]);M.render();}">' +
      '<div class="pv-card-top">' +
        '<div class="pv-avatar" style="' + avatarStyle + '">' + avatarInner + '</div>' +
        '<div class="pv-heading">' +
          '<div class="pv-name">' + esc(ch.name) + '</div>' +
          (ch.aliases ? '<div class="pv-alias">aka ' + esc(ch.aliases) + '</div>' : '') +
          (ch.birthDate ? '<div class="pv-sub">Born ' + esc(ch.birthDate) + '</div>' : '') +
        '</div>' +
      '</div>' +
      (chipsHTML ? '<div class="pv-chip-row">' + chipsHTML + '</div>' : '') +
      (tagsHTML ? '<div class="pv-tags">' + tagsHTML + '</div>' : '') +
      (metaHTML ? '<div class="pv-meta-row">' + metaHTML + '</div>' : '') +
      contextHTML +
      '<div class="pv-events">' +
        '<div class="pv-events-ticks" aria-hidden="true">' + ticksHTML + '</div>' +
        '<div class="pv-events-count">' + eventsLabel + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

function renderStatsFullView() {
  var el = document.getElementById('stats-full-view');
  if (!el) return;

  var totalEvents = S.events.length;
  var totalTracks = S.lifeTracks.length;
  var totalChars = S.people.length;
  var totalConns = S.connections.length;

  var dates = S.events.map(function(e) { return parseDate(e.date); }).filter(function(d) { return d !== null; }).sort(function(a,b) { return a-b; });
  var dateRange = dates.length >= 2
    ? Math.floor(dates[0]) + ' \u2013 ' + Math.floor(dates[dates.length-1])
    : (dates.length === 1 ? String(Math.floor(dates[0])) : '\u2014');
  var spanYears = dates.length >= 2 ? Math.floor(dates[dates.length-1]) - Math.floor(dates[0]) : 0;

  var catCounts = {};
  S.events.forEach(function(ev) { var c = ev.category || 'Other'; catCounts[c] = (catCounts[c]||0)+1; });
  var catEntries = Object.entries(catCounts).sort(function(a,b) { return b[1]-a[1]; });
  var maxCat = catEntries.length > 0 ? catEntries[0][1] : 1;

  var catBarsHTML = catEntries.map(function(entry) {
    var cat = entry[0], cnt = entry[1];
    var info = CATEGORIES[cat] || CATEGORIES['Other'];
    var pct = Math.round((cnt / maxCat) * 100);
    return '<div class="sfv-bar-row">' +
      '<div class="sfv-bar-label"><span>' + info.icon + ' ' + esc(cat) + '</span><span>' + cnt + '</span></div>' +
      '<div class="sfv-bar-track"><div class="sfv-bar-fill" style="width:' + pct + '%;background:' + info.color + '"></div></div></div>';
  }).join('');

  var trackCounts = {};
  S.lifeTracks.forEach(function(u) {
    trackCounts[u.id] = { name: u.name, color: u.color, cnt: S.events.filter(function(e) { return e.universeId === u.id; }).length };
  });
  var trackEntries = Object.values(trackCounts).sort(function(a,b) { return b.cnt - a.cnt; });
  var maxTrack = trackEntries.length > 0 ? trackEntries[0].cnt : 1;
  var mostActiveTrack = trackEntries.length > 0 ? trackEntries[0] : null;

  var trackBarsHTML = trackEntries.map(function(t) {
    var pct = Math.round((t.cnt / maxTrack) * 100);
    return '<div class="sfv-bar-row">' +
      '<div class="sfv-bar-label"><span>' + esc(t.name) + '</span><span>' + t.cnt + '</span></div>' +
      '<div class="sfv-bar-track"><div class="sfv-bar-fill" style="width:' + pct + '%;background:' + t.color + '"></div></div></div>';
  }).join('');

  var turningPoints = S.events.filter(function(e) {
    var c = (e.category || '').toLowerCase();
    return c.includes('turning point') || c.includes('milestone') || c.includes('achievement');  /* BE-2: match Biography's "Challenges & Turning Points" / "Career & Achievement" (and legacy Universe categories) */
  }).length;

  var tonesCounts = {};
  S.events.forEach(function(ev) { var t = ev.emotionalTone || ev.tone; if (t) { tonesCounts[t] = (tonesCounts[t]||0)+1; } });  /* BE-1: Biography stores ev.emotionalTone (ev.tone only survives on imported Universe data) */
  var toneEntries = Object.entries(tonesCounts).sort(function(a,b) { return b[1]-a[1]; });
  var maxTone = toneEntries.length > 0 ? toneEntries[0][1] : 1;
  var totalToneEvents = toneEntries.reduce(function(s,e) { return s + e[1]; }, 0);
  /* A-8: stats panel now reads from the unified TONE_COLORS / toneIcon source. */
  var toneColors = (typeof TONE_COLORS !== 'undefined') ? TONE_COLORS
    : { 'Joyful': '#f1c40f', 'Sad': '#3498db', 'Triumphant': '#e67e22', 'Difficult': '#e74c3c', 'Peaceful': '#2ecc71', 'Exciting': '#9b59b6', 'Bittersweet': '#e91e63', 'Grateful': '#1abc9c', 'Uncertain': '#95a5a6', 'Hopeful': '#27ae60', 'Anxious': '#d35400', 'Transformative': '#8e44ad', 'Proud': '#f39c12', 'Confusing': '#7f8c8d', 'Liberating': '#16a085', 'Painful': '#c0392b', 'Overwhelming': '#2c3e50' };
  var tonesHTML = toneEntries.map(function(entry) {
    var tone = entry[0], cnt = entry[1];
    var col = toneColors[tone] || '#95a5a6';
    var ico = (typeof toneIcon === 'function') ? toneIcon(tone) : '';
    var pct = Math.round((cnt / maxTone) * 100);
    return '<div class="sfv-bar-row">' +
      '<div class="sfv-bar-label"><span>' + (ico ? ico + ' ' : '') + esc(tone) + '</span><span>' + cnt + '</span></div>' +
      '<div class="sfv-bar-track"><div class="sfv-bar-fill" style="width:' + pct + '%;background:' + col + '"></div></div></div>';
  }).join('');

  var topPeople = S.people.map(function(ch) {
    var cnt = S.events.filter(function(e) { return (e.characterIds||[]).includes(ch.id); }).length;
    return { name: ch.name, cnt: cnt, color: ch.color || charHashColor(ch.id) };
  }).sort(function(a,b) { return b.cnt - a.cnt; }).slice(0, 8);
  var topPeopleHTML = topPeople.map(function(p) {
    return '<div class="sfv-list-item"><span class="sfv-dot" style="background:' + p.color + '"></span><span style="flex:1">' + esc(p.name) + '</span><span style="font-weight:700;color:#3d2b1f">' + p.cnt + ' events</span></div>';
  }).join('');

  var monthCounts = {};
  var monthLabels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  S.events.forEach(function(ev) {
    var d = parseDate(ev.date);
    if (d !== null) {
      var frac = d - Math.floor(d);
      var m = Math.floor(frac * 12);
      if (m >= 0 && m < 12) monthCounts[m] = (monthCounts[m] || 0) + 1;
    }
  });
  var maxMonth = Math.max.apply(null, Object.values(monthCounts).concat([1]));
  var monthBarsHTML = monthLabels.map(function(lbl, i) {
    var cnt = monthCounts[i] || 0;
    var h = cnt > 0 ? Math.max(Math.round((cnt / maxMonth) * 100), 4) : 0;
    return '<div class="sfv-chart-col" style="height:' + h + '%;background:#b07942" title="' + lbl + ': ' + cnt + '"></div>';
  }).join('');
  var monthLabelsHTML = monthLabels.map(function(l) { return '<span>' + l + '</span>'; }).join('');

  var recentEvs = S.events.slice().sort(function(a,b) {
    var da = parseDate(a.date), db = parseDate(b.date);
    return (db||0) - (da||0);
  }).slice(0, 7);
  var recentHTML = recentEvs.map(function(ev) {
    var info = CATEGORIES[ev.category] || CATEGORIES['Other'];
    var track = S.lifeTracks.find(function(t) { return t.id === ev.universeId; });
    return '<tr>' +
      '<td><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:' + info.color + ';margin-right:5px;vertical-align:middle"></span>' + esc(ev.title) + '</td>' +
      '<td>' + esc(ev.date) + '</td>' +
      '<td>' + (track ? esc(track.name) : '\u2014') + '</td>' +
      '<td>' + (ev.emotionalTone || ev.tone || '\u2014') + '</td></tr>';
  }).join('');

  var lifeScore = Math.min(100, Math.round(
    (Math.min(totalEvents, 50) / 50) * 25 +
    (Math.min(totalTracks, 5) / 5) * 20 +
    (Math.min(totalChars, 10) / 10) * 20 +
    (Math.min(totalConns, 10) / 10) * 15 +
    (totalToneEvents > 0 ? Math.min(toneEntries.length, 5) / 5 * 10 : 0) +
    (spanYears > 0 ? Math.min(spanYears, 30) / 30 * 10 : 0)
  ));
  var gaugeLabel = lifeScore >= 80 ? 'Rich' : lifeScore >= 60 ? 'Growing' : lifeScore >= 40 ? 'Developing' : lifeScore >= 20 ? 'Starting' : 'New';
  function lifeScoreColor(s) { return s >= 80 ? '#2ecc71' : s >= 60 ? '#27ae60' : s >= 40 ? '#f39c12' : s >= 20 ? '#e67e22' : '#e74c3c'; }

  var SIZE = 180, R = 72, cx = SIZE/2, cy = SIZE/2;
  var arcStart = -225, arcEnd = 45, totalAngle = 270;
  var scoreAngle = arcStart + (lifeScore / 100) * totalAngle;
  function polarToXY(cx2, cy2, r, deg) { var rad = (deg - 90) * Math.PI / 180; return { x: cx2 + r * Math.cos(rad), y: cy2 + r * Math.sin(rad) }; }
  function arcPath(cx2, cy2, r, sd, ed) {
    var s = polarToXY(cx2,cy2,r,sd), e = polarToXY(cx2,cy2,r,ed);
    var large = ((ed - sd + 360) % 360) > 180 ? 1 : 0;
    return 'M ' + s.x + ' ' + s.y + ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + e.x + ' ' + e.y;
  }
  var gCol = lifeScoreColor(lifeScore);
  var trackPath = arcPath(cx, cy, R, arcStart, arcEnd);
  var fillPath = lifeScore > 0 ? arcPath(cx, cy, R, arcStart, Math.min(scoreAngle, arcEnd - 0.1)) : '';
  var gaugeHTML = '<svg width="' + SIZE + '" height="' + SIZE + '" class="sfv-gauge-svg" viewBox="0 0 ' + SIZE + ' ' + SIZE + '">' +
    '<defs><linearGradient id="bioGaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="' + gCol + '" stop-opacity="0.7"/><stop offset="100%" stop-color="' + gCol + '"/></linearGradient></defs>' +
    '<path d="' + trackPath + '" fill="none" stroke="#e8e0d0" stroke-width="10" stroke-linecap="round"/>' +
    (fillPath ? '<path d="' + fillPath + '" fill="none" stroke="url(#bioGaugeGrad)" stroke-width="10" stroke-linecap="round"/>' : '') +
    '<text x="' + cx + '" y="' + (cy - 8) + '" class="sfv-gauge-score" fill="' + gCol + '">' + lifeScore + '</text>' +
    '<text x="' + cx + '" y="' + (cy + 16) + '" class="sfv-gauge-label" fill="' + gCol + '" font-size="13" font-weight="700" font-family="Georgia,serif" text-anchor="middle">' + gaugeLabel + '</text>' +
    '<text x="' + cx + '" y="' + (cy + 32) + '" fill="#999" font-size="9" font-family="Georgia,serif" text-anchor="middle">Life Richness</text></svg>';

  function subBar(label, value, color) {
    return '<div class="sfv-sub-bar-row"><div class="sfv-sub-bar-label"><span>' + label + '</span><span>' + value + '%</span></div>' +
      '<div class="sfv-sub-bar-track"><div class="sfv-sub-bar-fill" style="width:' + value + '%;background:' + color + '"></div></div></div>';
  }
  var evRichness = Math.min(100, Math.round((Math.min(totalEvents, 50) / 50) * 100));
  var trackDiv = Math.min(100, Math.round((Math.min(totalTracks, 5) / 5) * 100));
  var pplConnect = Math.min(100, Math.round((Math.min(totalChars, 10) / 10) * 100));
  var emoDepth = totalToneEvents > 0 ? Math.min(100, Math.round((Math.min(toneEntries.length, 5) / 5) * 100)) : 0;

  function deltaHTML(val, suffix) {
    if (val > 0) return '<div class="m-delta sfv-delta-up">\u25B2 ' + val + (suffix||'') + '</div>';
    if (val < 0) return '<div class="m-delta sfv-delta-dn">\u25BC ' + Math.abs(val) + (suffix||'') + '</div>';
    return '<div class="m-delta sfv-delta-flat">\u25AC Flat</div>';
  }

  el.innerHTML =
    '<div class="sfv-title">Free Timeline Biography — Dashboard</div>' +
    '<div class="sfv-grid">' +
      '<div class="sfv-card"><h3>Life Richness Score</h3>' +
        '<div class="sfv-gauge-wrap">' + gaugeHTML +
          '<div style="width:100%">' +
            subBar('Event Richness', evRichness, lifeScoreColor(evRichness)) +
            subBar('Track Diversity', trackDiv, lifeScoreColor(trackDiv)) +
            subBar('People Connections', pplConnect, lifeScoreColor(pplConnect)) +
            subBar('Emotional Depth', emoDepth, lifeScoreColor(emoDepth)) +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="sfv-card"><h3>Key Metrics</h3>' +
        '<div class="sfv-metric-grid">' +
          '<div class="sfv-metric-box"><div class="m-val">' + totalEvents + '</div><div class="m-lbl">Life Events</div>' + deltaHTML(totalEvents > 0 ? totalEvents : 0) + '</div>' +
          '<div class="sfv-metric-box"><div class="m-val">' + totalTracks + '</div><div class="m-lbl">Life Tracks</div>' + deltaHTML(totalTracks) + '</div>' +
          '<div class="sfv-metric-box"><div class="m-val">' + totalChars + '</div><div class="m-lbl">Key People</div>' + deltaHTML(totalChars) + '</div>' +
          '<div class="sfv-metric-box"><div class="m-val">' + totalConns + '</div><div class="m-lbl">Life Links</div>' + deltaHTML(totalConns) + '</div>' +
          '<div class="sfv-metric-box"><div class="m-val">' + turningPoints + '</div><div class="m-lbl">Turning Points</div>' + deltaHTML(turningPoints) + '</div>' +
          '<div class="sfv-metric-box"><div class="m-val">' + catEntries.length + '</div><div class="m-lbl">Categories Used</div>' + deltaHTML(catEntries.length) + '</div>' +
          '<div class="sfv-metric-box"><div class="m-val" style="font-size:16px">' + esc(dateRange) + '</div><div class="m-lbl">Timeline Span</div>' + (spanYears > 0 ? '<div class="m-delta sfv-delta-up">' + spanYears + ' years</div>' : '') + '</div>' +
          '<div class="sfv-metric-box"><div class="m-val" style="font-size:14px">' + (mostActiveTrack ? esc(mostActiveTrack.name) : '\u2014') + '</div><div class="m-lbl">Most Active Track</div>' + (mostActiveTrack ? '<div class="m-delta sfv-delta-up">' + mostActiveTrack.cnt + ' events</div>' : '') + '</div>' +
        '</div>' +
      '</div>' +

      '<div class="sfv-card"><h3>Recent Activity</h3>' +
        '<table class="sfv-recent-table"><thead><tr><th>Event</th><th>Date</th><th>Track</th><th>Tone</th></tr></thead>' +
        '<tbody>' + (recentHTML || '<tr><td colspan="4" style="color:#999;text-align:center">No events yet.</td></tr>') + '</tbody></table>' +
      '</div>' +

      '<div class="sfv-card"><h3>Events by Category</h3>' + (catBarsHTML || '<div style="color:#999;font-size:12px">No events yet.</div>') + '</div>' +
      '<div class="sfv-card"><h3>Events by Life Track</h3>' + (trackBarsHTML || '<div style="color:#999;font-size:12px">No tracks yet.</div>') + '</div>' +
      '<div class="sfv-card"><h3>Emotional Tones</h3>' + (tonesHTML || '<div style="color:#999;font-size:12px">No tones assigned yet.</div>') + '</div>' +
      '<div class="sfv-card"><h3>Most Connected People</h3>' + (topPeopleHTML || '<div style="color:#999;font-size:12px">No people yet.</div>') + '</div>' +
      '<div class="sfv-card full"><h3>Events by Month</h3>' +
        '<div class="sfv-chart-bars">' + monthBarsHTML + '</div>' +
        '<div class="sfv-chart-labels">' + monthLabelsHTML + '</div>' +
      '</div>' +
    '</div>';
}

/* =====================================================
   INITIALISATION
   ===================================================== */
window.addEventListener('DOMContentLoaded', () => {
  Store.clearSavedBlank();
  const loadedSavedWork = Store.load();
  const _hadSavedWork = loadedSavedWork;
  if (!loadedSavedWork && isBlankTemplateState(S)) {
    S.lifeTracks = [];
    S.events = [];
    S.connections = [];
    S.people = [];
    S.affiliations = [];
    loadSample();
  }
  Store.normalize();
  Store.autosave();
  if (!S.categories || Object.keys(S.categories).length === 0) {
    syncCategoriesToState();
  }

  initCanvas();
  updateFilterBar();
  updateUniToggleBar();
  updateCatFilterBar();
  updateStatusFilterBar();
  updateTagFilterBar();
  document.getElementById('zoom-pct').textContent = '100%';
  render();

  /* #043: first-run onboarding for new visitors. Shown only when there was
     no saved work in localStorage and the user has not dismissed it before. */
  if (!_hadSavedWork && typeof ftOnboarding !== 'undefined') {
    ftOnboarding.maybeShow({
      flagKey: 'ft_bio_onboarded',
      glyph: '📖',
      title: 'Welcome to Biography Timeline',
      lines: [
        'These are example life-tracks and events — feel free to delete them and replace with your own story.',
        'Click "+ Event" in the toolbar to add the first event in your timeline.',
        'Your data is saved automatically in this browser. Export a JSON backup regularly using ↓ JSON.'
      ],
      actionLabel: '+ Add my first event',
      actionCallback: function () { if (typeof UI !== 'undefined' && UI.addEvent) UI.addEvent(); }
    });
  }

  // Close modal only on clean backdrop click — not when drag-selecting text spills outside
  let _modalDownOnBg = false;
  document.getElementById('modal-bg').addEventListener('mousedown', e => {
    _modalDownOnBg = (e.target.id === 'modal-bg');
  });
  document.getElementById('modal-bg').addEventListener('click', e => {
    if (e.target.id === 'modal-bg' && _modalDownOnBg) M.close();
  });

  // Smooth keyboard panning
  const _keysHeld = {};
  const _keyVel = { x: 0, y: 0 };
  const _KEY_BASE_SPEED = 2;
  const _KEY_MAX_SPEED = 18;
  const _KEY_ACCEL = 0.35;
  const _KEY_DECEL = 0.82;
  let _keyAnimId = null;

  function _keyPanTick() {
    let anyHeld = false;
    let tx = 0, ty = 0;
    if (_keysHeld['ArrowLeft'])  { tx += 1; anyHeld = true; }
    if (_keysHeld['ArrowRight']) { tx -= 1; anyHeld = true; }
    if (_keysHeld['ArrowUp'])    { ty += 1; anyHeld = true; }
    if (_keysHeld['ArrowDown'])  { ty -= 1; anyHeld = true; }

    if (tx !== 0) {
      _keyVel.x += tx * _KEY_ACCEL;
      _keyVel.x = clamp(_keyVel.x, -_KEY_MAX_SPEED, _KEY_MAX_SPEED);
    } else {
      _keyVel.x *= _KEY_DECEL;
      if (Math.abs(_keyVel.x) < 0.1) _keyVel.x = 0;
    }
    if (ty !== 0) {
      _keyVel.y += ty * _KEY_ACCEL;
      _keyVel.y = clamp(_keyVel.y, -_KEY_MAX_SPEED, _KEY_MAX_SPEED);
    } else {
      _keyVel.y *= _KEY_DECEL;
      if (Math.abs(_keyVel.y) < 0.1) _keyVel.y = 0;
    }

    if (Math.abs(_keyVel.x) > 0.05 || Math.abs(_keyVel.y) > 0.05) {
      V.panX += _keyVel.x;
      V.panY += _keyVel.y;
      clampPanX();
      clampPanY();
      render();
      _keyAnimId = requestAnimationFrame(_keyPanTick);
    } else {
      _keyVel.x = 0;
      _keyVel.y = 0;
      _keyAnimId = null;
    }
  }

  function _startKeyAnim() {
    if (!_keyAnimId) _keyAnimId = requestAnimationFrame(_keyPanTick);
  }

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (e.key === 'Escape')             { M.close(); closeLightbox(); if (_kbdVisible) UI.toggleKbd(); }
    if (e.key === '+' || e.key === '=')  doZoom(1.25, null);
    if (e.key === '-')                   doZoom(0.8, null);
    if (e.key === '0')                   resetView();
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (!_keysHeld[e.key]) {
        _keysHeld[e.key] = true;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          _keyVel.x = (e.key === 'ArrowLeft' ? 1 : -1) * _KEY_BASE_SPEED;
        } else {
          _keyVel.y = (e.key === 'ArrowUp' ? 1 : -1) * _KEY_BASE_SPEED;
        }
        _startKeyAnim();
      }
    }
    if (e.ctrlKey && e.key === 'z' && !e.shiftKey) { e.preventDefault(); History.undo(); }
    if (e.ctrlKey && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); History.redo(); }
    if (e.key === 's' || e.key === 'S')  UI.toggleStats();
    if (e.key === '?' || e.key === '/') UI.toggleKbd();
  });

  document.addEventListener('keyup', e => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      delete _keysHeld[e.key];
    }
  });

  // Auto-save every 60 seconds
  setInterval(() => Store.autosave(), 60000);

  // Welcome message
  setTimeout(() => notify('Welcome! ✨  Double-click any life track row to add your first event.', 'info'), 700);
});

/* =====================================================
   CHARACTER FILTER STATE & HELPERS
   ===================================================== */
let _charFilterIds = [];
let _charSortOrder = 'a-z'; /* a-z, events, universe */

let _filterMode = 'any'; // 'any' = OR, 'all' = AND
let _searchText = '';   // live event text search

/* Category filter */
let _catFilter = null; // null = all, else category name string

/* Emotional tone filter */
let _toneFilter = null; // null = all, else tone string

/* Status filter */
let _statusFilter = null; // null = all, else status string

/* Tag filter */
let _tagFilter = null; // null = all, else tag string

/* Stats panel visibility */
let _statsVisible = false;

/* Keyboard shortcuts panel visibility */
let _kbdVisible = false;

function updateEventSearch(val) {
  _searchText = (val || '').trim().toLowerCase();
  // Sync both search inputs
  const desktopIn = document.getElementById('ev-search-input');
  if (desktopIn && desktopIn.value.trim().toLowerCase() !== _searchText) desktopIn.value = val || '';
  const mobileIn = document.getElementById('ev-search-input-mobile');
  if (mobileIn && mobileIn.value.trim().toLowerCase() !== _searchText) mobileIn.value = val || '';
  updateFilterBar();
  if (typeof updateMobileActiveStrip === 'function') updateMobileActiveStrip();
  render();
}

/* ---- Category filter ---- */
function setCatFilter(cat) {
  _catFilter = (_catFilter === cat) ? null : cat; // toggle
  updateCatFilterBar();
  render();
}

function clearCatFilter() {
  _catFilter = null;
  updateCatFilterBar();
  render();
}

/* ---- Emotional Tone filter ---- */
function setToneFilter(tone) {
  _toneFilter = tone || null;
  const clearBtn = document.getElementById('tone-clear-btn');
  if (clearBtn) clearBtn.style.display = _toneFilter ? '' : 'none';
  // Sync both selects
  const selDesktop = document.getElementById('tone-filter-select');
  if (selDesktop) selDesktop.value = _toneFilter || '';
  const selMobile = document.getElementById('tone-filter-select-mobile');
  if (selMobile) selMobile.value = _toneFilter || '';
  if (typeof updateMobileActiveStrip === 'function') updateMobileActiveStrip();
  render();
}

function clearToneFilter() {
  _toneFilter = null;
  const sel = document.getElementById('tone-filter-select');
  if (sel) sel.value = '';
  const selMobile = document.getElementById('tone-filter-select-mobile');
  if (selMobile) selMobile.value = '';
  const clearBtn = document.getElementById('tone-clear-btn');
  if (clearBtn) clearBtn.style.display = 'none';
  render();
}

/* ---- Status filter ---- */
function setStatusFilter(status) {
  _statusFilter = (_statusFilter === status) ? null : status;
  updateStatusFilterBar();
  render();
}

function clearStatusFilter() {
  _statusFilter = null;
  updateStatusFilterBar();
  render();
}

function updateStatusFilterBar() {
  const chips = document.getElementById('status-filter-chips');
  const chipsMobile = document.getElementById('status-filter-chips-mobile');
  const clearBtn = document.getElementById('status-clear-btn');
  if (!chips) return;
  const statusHtml = BIO_STATUSES.map(st => {
    const col = statusColor(st);
    const isActive = (_statusFilter === null || _statusFilter === st);
    const cnt = S.events.filter(ev => ev.status === st).length;
    return '<span class="cat-filter-chip' + (isActive ? '' : ' inactive') + '" ' +
      'style="background:' + col + ';border-color:' + col + ';" ' +
      'onclick="setStatusFilter(\'' + st + '\')" title="' + st + ' (' + cnt + ' events)">' +
      st + (cnt > 0 ? ' <span style="opacity:0.8;font-size:10px">(' + cnt + ')</span>' : '') +
      '</span>';
  }).join('');
  chips.innerHTML = statusHtml;
  if (chipsMobile) chipsMobile.innerHTML = statusHtml;
  clearBtn.style.display = _statusFilter ? '' : 'none';
  updateMobileActiveStrip();
}

/* ---- Tag filter ---- */
function setTagFilter(tag) {
  _tagFilter = (_tagFilter === tag) ? null : tag;
  updateTagFilterBar();
  render();
}

function clearTagFilter() {
  _tagFilter = null;
  updateTagFilterBar();
  render();
}

function updateTagFilterBar() {
  const chips = document.getElementById('tag-filter-chips');
  const chipsMobile = document.getElementById('tag-filter-chips-mobile');
  const clearBtn = document.getElementById('tag-clear-btn');
  if (!chips) return;

  const allTags = {};
  S.events.forEach(function(ev) {
    (ev.tags || []).forEach(function(t) {
      allTags[t] = (allTags[t] || 0) + 1;
    });
  });

  const tagNames = Object.keys(allTags).sort();
  if (tagNames.length === 0) {
    chips.innerHTML = '<span style="color:#bbb;font-size:11px">No tags yet</span>';
    if (chipsMobile) chipsMobile.innerHTML = '<span style="color:rgba(200,175,140,0.4);font-size:11px">No tags yet</span>';
    clearBtn.style.display = 'none';
    return;
  }

  const tagHtml = tagNames.map(function(tag) {
    var cnt = allTags[tag];
    var isActive = (_tagFilter === null || _tagFilter === tag);
    return '<span class="tag-filter-chip' + (isActive ? '' : ' inactive') + '" ' +
      'onclick="setTagFilter(\'' + tag.replace(/'/g, "\\'") + '\')" title="' + tag + ' (' + cnt + ' events)">' +
      esc(tag) + (cnt > 0 ? ' <span style="opacity:0.8;font-size:10px">(' + cnt + ')</span>' : '') +
      '</span>';
  }).join('');

  chips.innerHTML = tagHtml;
  if (chipsMobile) chipsMobile.innerHTML = tagHtml;

  clearBtn.style.display = _tagFilter ? '' : 'none';
  updateMobileActiveStrip();
}

function updateCatFilterBar() {
  const chips = document.getElementById('cat-filter-chips');
  const chipsMobile = document.getElementById('cat-filter-chips-mobile');
  const clearBtn = document.getElementById('cat-clear-btn');
  if (!chips) return;

  const allCats = Object.keys(CATEGORIES);
  // Count events per category
  const counts = {};
  allCats.forEach(c => counts[c] = 0);
  S.events.forEach(ev => { if (ev.category && counts[ev.category] !== undefined) counts[ev.category]++; });

  const catHtml = allCats.map(cat => {
    const info = CATEGORIES[cat];
    const cnt = counts[cat];
    const isActive = (_catFilter === null || _catFilter === cat);
    return '<span class="cat-filter-chip' + (isActive ? '' : ' inactive') + '" ' +
      'style="background:' + info.color + ';border-color:' + info.color + ';" ' +
      'onclick="setCatFilter(\'' + cat + '\')" title="' + cat + ' (' + cnt + ' events)">' +
      info.icon + ' ' + cat +
      (cnt > 0 ? ' <span style="opacity:0.8;font-size:10px">(' + cnt + ')</span>' : '') +
      '</span>';
  }).join('');

  chips.innerHTML = catHtml;
  if (chipsMobile) chipsMobile.innerHTML = catHtml;

  clearBtn.style.display = _catFilter ? '' : 'none';
  updateMobileActiveStrip();
}

/* ---- Stats panel ---- */
function updateStatsPanel() {
  const panel = document.getElementById('stats-panel');
  if (!panel) return;

  if (!_statsVisible) { panel.classList.remove('visible'); return; }

  const totalEvents = S.events.length;
  const totalUnis = S.lifeTracks.length;
  const totalChars = S.people.length;
  const totalConns = S.connections.length;

  // Date range
  const dates = S.events.map(e => parseDate(e.date)).filter(d => d !== null).sort((a,b)=>a-b);
  const dateRange = dates.length >= 2
    ? Math.floor(dates[0]) + ' – ' + Math.floor(dates[dates.length-1])
    : (dates.length === 1 ? String(Math.floor(dates[0])) : '—');

  // Category breakdown
  const catCounts = {};
  S.events.forEach(ev => { const c = ev.category || 'Other'; catCounts[c] = (catCounts[c]||0)+1; });
  const topCats = Object.entries(catCounts).sort((a,b)=>b[1]-a[1]).slice(0,3);
  const catHTML = topCats.map(([c,n]) => {
    const info = CATEGORIES[c] || CATEGORIES['Other'];
    return '<span style="display:inline-flex;align-items:center;gap:3px;margin-right:7px">' +
      '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + info.color + '"></span>' +
      '<span>' + c + ': ' + n + '</span></span>';
  }).join('');

  var turningPoints = S.events.filter(function(e) {
    var c = (e.category || '').toLowerCase();
    return c.includes('turning point') || c.includes('milestone') || c.includes('achievement');  /* BE-2: match Biography's "Challenges & Turning Points" / "Career & Achievement" (and legacy Universe categories) */
  }).length;

  panel.innerHTML =
    '<div style="font-size:9px;font-weight:900;letter-spacing:.8px;color:#8a6d3b;margin-bottom:8px">LIFESTORY STATS</div>' +
    '<div class="sp-row">' +
      '<div class="sp-item"><div class="sp-val">' + totalEvents + '</div><div class="sp-lbl">LIFE EVENTS</div></div>' +
      '<div class="sp-divider"></div>' +
      '<div class="sp-item"><div class="sp-val">' + totalUnis + '</div><div class="sp-lbl">LIFE TRACKS</div></div>' +
      '<div class="sp-divider"></div>' +
      '<div class="sp-item"><div class="sp-val">' + totalChars + '</div><div class="sp-lbl">KEY PEOPLE</div></div>' +
    '</div>' +
    '<div class="sp-row" style="margin-top:6px">' +
      '<div class="sp-item"><div class="sp-val">' + totalConns + '</div><div class="sp-lbl">LIFE LINKS</div></div>' +
      '<div class="sp-divider"></div>' +
      '<div class="sp-item"><div class="sp-val" style="font-size:14px">' + esc(dateRange) + '</div><div class="sp-lbl">LIFE SPAN</div></div>' +
      '<div class="sp-divider"></div>' +
      '<div class="sp-item"><div class="sp-val">' + turningPoints + '</div><div class="sp-lbl">TURNING POINTS</div></div>' +
    '</div>' +
    (catHTML ? '<div style="font-size:10px;color:#8a7a60;border-top:1px solid rgba(255,255,255,0.1);padding-top:6px;margin-top:6px">Top categories: ' + catHTML + '</div>' : '');

  panel.classList.add('visible');
}

function charHashColor(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const cols = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#e91e63','#00bcd4','#607d8b'];
  return cols[hash % cols.length];
}

function toggleCharFilter(charId) {
  const idx = _charFilterIds.indexOf(charId);
  if (idx === -1) _charFilterIds.push(charId);
  else _charFilterIds.splice(idx, 1);
  updateFilterBar();
  render();
}

function clearCharFilters() {
  _charFilterIds = [];
  updateFilterBar();
  render();
}

function toggleFilterMode() {
  _filterMode = _filterMode === 'any' ? 'all' : 'any';
  updateFilterBar();
  render();
}

function updateFilterBar() {
  const bar      = document.getElementById('char-filter-bar');
  const chips    = document.getElementById('cf-chips');
  const modeBtn  = document.getElementById('cf-mode-btn');
  const clearBtn = document.getElementById('cf-clear-btn');
  const summary  = document.getElementById('cf-summary');
  const chipsMobile = document.getElementById('cf-chips-mobile');
  if (!bar) return;

  if (_charFilterIds.length === 0) {
    bar.classList.remove('active');
    chips.innerHTML = '<span style="color:#b0b8cc">Pin a person from their profile to filter the timeline</span>';
    if (chipsMobile) chipsMobile.innerHTML = '<span style="color:rgba(200,175,140,0.4);font-size:11px">Open a person\'s profile \u2192 tap \ud83d\udccd Pin to filter</span>';
    if (modeBtn)  modeBtn.style.display  = 'none';
    if (clearBtn) clearBtn.style.display = 'none';
    if (summary)  summary.textContent    = '';
    updateMobileActiveStrip();
    return;
  }

  bar.classList.add('active');
  const charChipHtml = _charFilterIds.map(cid => {
    const ch = S.people.find(c => c.id === cid);
    if (!ch) return '';
    const col = ch.color || charHashColor(cid);
    return '<span class="cf-chip" style="background:' + col + '22;color:' + col + ';border-color:' + col + '55" onclick="toggleCharFilter(\'' + cid + '\')">' +
      (ch.photo ? '<img src="' + esc(ch.photo) + '" style="width:13px;height:13px;border-radius:50%;object-fit:cover">' : '') +
      esc(ch.name) + ' <span class="cf-x">\u00d7</span></span>';
  }).join('');
  chips.innerHTML = charChipHtml;
  if (chipsMobile) chipsMobile.innerHTML = charChipHtml;

  if (_charFilterIds.length >= 2) {
    modeBtn.style.display = '';
    modeBtn.textContent = _filterMode === 'any' ? 'OR' : 'AND';
  } else {
    modeBtn.style.display = 'none';
  }
  clearBtn.style.display = '';

  const matchCount = S.events.filter(ev => {
    const ids = ev.characterIds || [];
    const cMatch = _filterMode === 'all'
      ? _charFilterIds.every(fid => ids.includes(fid))
      : _charFilterIds.some(fid => ids.includes(fid));
    const sMatch = _searchText ? (ev.title + ' ' + (ev.description||'') + ' ' + (ev.tags||[]).join(' ')).toLowerCase().includes(_searchText) : true;
    return cMatch && sMatch;
  }).length;
  if (summary) summary.textContent = matchCount + ' event' + (matchCount !== 1 ? 's' : '') + ' highlighted';
  updateMobileActiveStrip();
}

/* =====================================================
   UNIVERSE TOGGLE BAR
   ===================================================== */
function updateUniToggleBar() {
  const bar = document.getElementById('uni-toggle-bar');
  const chips = document.getElementById('uni-toggle-chips');
  const hint = document.getElementById('uni-toggle-hint');
  if (!chips) return;
  if (S.lifeTracks.length === 0) {
    chips.innerHTML = '';
    if (hint) hint.textContent = 'Your timeline is empty — click  \u2795 Life Track  in the toolbar to create your first row, then add events to it.';
    return;
  }
  if (hint) hint.textContent = '';
  chips.innerHTML = S.lifeTracks.map(u => {
    const hidden = u.visible === false;
    return '<button type="button" class="uni-toggle-chip' + (hidden ? ' hidden-uni' : '') + '" ' +
      'style="background:' + u.color + ';border-color:' + u.color + ';" ' +
      'onclick="toggleUniverse(\'' + u.id + '\')" title="Click to show or hide this life track" ' +
      'aria-pressed="' + (!hidden) + '" aria-label="' + (hidden ? 'Show life track ' : 'Hide life track ') + esc(u.name) + '">' +
      '<span aria-hidden="true">' + (hidden ? '🚫 ' : '✅ ') + esc(u.name) + '</span>' +
      '<span class="sr-only">' + (hidden ? 'Hidden' : 'Visible') + '</span></button>';
  }).join('');
}

function toggleUniverse(uid2) {
  const u = S.lifeTracks.find(x => x.id === uid2);
  if (!u) return;
  u.visible = u.visible === false ? true : false;
  updateUniToggleBar();
  render();
  notify((u.visible === false ? 'Hidden life track: ' : 'Showing life track: ') + u.name, 'info');
}

/* =====================================================
   CONNECTION MAP  (v6 — pan/zoom, search, hover glow, edge click)
   ===================================================== */
const ConnectionMap = {
  _uniFilter: null,
  _mx: 0, _my: 0, _mscale: 1,
  _listenersAttached: false,
  _container: null,
  _drag: null,

  build(container) {
    this._container = container;
    this._mx = 0; this._my = 0; this._mscale = 1;
    if (S.people.length === 0) {
      container.innerHTML =
        '<div class="conn-map-wrap" id="cm-wrap"><div class="cm-empty">'
        + '<div class="cm-empty-star">\uD83C\uDF3F</div>'
        + '<h3>No one linked to your story yet</h3>'
        + '<p>This is where the people in your life become a constellation \u2014 connected by the moments you shared. Add someone, link them to a memory, and watch the web grow.</p>'
        + '<div class="cm-empty-steps">'
          + '<b>1.</b> Click <b>\uD83D\uDC64 People</b> in the toolbar and add a name (a photo and notes are optional).<br>'
          + '<b>2.</b> Open any event on your timeline and tap <b>\uD83D\uDC64 People</b> to link them to the memory.<br>'
          + '<b>3.</b> Return here \u2014 warm lines will appear between people who share events.'
        + '</div>'
        + '</div></div>';
      return;
    }

    // Build edge data
    const edgeMap = {};
    S.events.forEach(ev => {
      const ids = ev.characterIds || [];
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const key = [ids[i], ids[j]].sort().join('|');
          if (!edgeMap[key]) edgeMap[key] = { a: ids[i], b: ids[j], type: 'shared', sharedEvs: [] };
          edgeMap[key].sharedEvs.push(ev.id);
        }
      }
    });
    const edges = Object.values(edgeMap);

    // Filter chars by universe if needed
    const allChars = S.people.filter(ch => {
      if (!this._uniFilter) return true;
      return S.events.some(ev => ev.universeId === this._uniFilter && (ev.characterIds || []).includes(ch.id));
    });

    // Improved radial layout
    const W = 740, H = 540;
    const CX = W / 2, CY = H / 2;
    const N = allChars.length;
    const R = Math.min(CX, CY) * (N <= 3 ? 0.52 : N <= 6 ? 0.65 : 0.73);
    const pos = {};
    allChars.forEach((ch, i) => {
      const a = (2 * Math.PI * i / N) - Math.PI / 2;
      pos[ch.id] = { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a) };
    });

    /* --- Build SVG --- */
    /* Relationship type -> muted color palette (data-driven) */
    const _relCol = { 'Family':'#c17a95', 'Partner':'#9d7eb5', 'Friend':'#6b9ac4', 'Mentor':'#d4a058', 'Colleague':'#74a080', 'Other':'#a49282' };
    const _edgeColorFor = (a, b) => {
      const pa = S.people.find(p => p.id === a), pb = S.people.find(p => p.id === b);
      const ra = pa && pa.alignment, rb = pb && pb.alignment;
      if (ra && rb && ra === rb) return { col: _relCol[ra] || '#b29070', label: ra };
      if (ra && _relCol[ra]) return { col: _relCol[ra], label: ra };
      if (rb && _relCol[rb]) return { col: _relCol[rb], label: rb };
      return { col: '#b29070', label: '' };
    };
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" id="cm-svg" class="conn-map-svg">';
    s += '<defs>';
    s += '<filter id="glow2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>';
    s += '<filter id="glow3" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>';
    s += '<filter id="edgeGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>';
    s += '<radialGradient id="cmBg" cx="50%" cy="48%" r="65%">'
      + '<stop offset="0%" stop-color="#fff5dd" stop-opacity="0.85"/>'
      + '<stop offset="55%" stop-color="#f3e4c0" stop-opacity="0.7"/>'
      + '<stop offset="100%" stop-color="#e7d4a6" stop-opacity="0.5"/>'
      + '</radialGradient>';
    s += '<style>'
      + '.cm-sel-ring{animation:cmSelPulse 2s ease-in-out infinite}'
      + '@keyframes cmSelPulse{0%,100%{opacity:.9}50%{opacity:.5}}'
      + '.cm-edge{filter:url(#edgeGlow)}'
      + '</style>';
    s += '</defs>';
    s += '<rect width="' + W + '" height="' + H + '" fill="url(#cmBg)" rx="10"/>';
    /* Subtle concentric "life-ring" guide — very faint */
    const gCX = W/2, gCY = H/2;
    [0.3, 0.5, 0.7].forEach(f => {
      const rr = Math.min(gCX, gCY) * f;
      s += '<circle cx="' + gCX + '" cy="' + gCY + '" r="' + rr + '" fill="none" stroke="rgba(140,108,66,0.08)" stroke-width="1" stroke-dasharray="2,6"/>';
    });
    /* Open the pan/zoom group */
    s += '<g id="cm-g">';

    // Life-track halos — warm & subtle
    S.lifeTracks.forEach(u => {
      allChars.forEach(ch => {
        if (!S.events.some(ev => ev.universeId === u.id && (ev.characterIds||[]).includes(ch.id))) return;
        const p = pos[ch.id]; if (!p) return;
        s += '<circle cx="' + p.x + '" cy="' + p.y + '" r="50" fill="' + u.color + '" opacity="0.11"/>';
      });
    });

    // Life-track cluster labels
    S.lifeTracks.forEach(u => {
      const members = allChars.filter(ch => S.events.some(ev => ev.universeId === u.id && (ev.characterIds||[]).includes(ch.id)));
      if (members.length === 0) return;
      const avgX = members.reduce((a, ch) => a + (pos[ch.id]?pos[ch.id].x:0), 0) / members.length;
      const avgY = members.reduce((a, ch) => a + (pos[ch.id]?pos[ch.id].y:0), 0) / members.length;
      s += '<text x="' + avgX + '" y="' + (avgY - 62) + '" text-anchor="middle" font-size="9.5" fill="' + u.color + '" opacity="0.85" font-family="-apple-system,sans-serif" font-weight="700" letter-spacing="0.8" style="pointer-events:none;text-transform:uppercase">' + esc(u.name) + '</text>';
    });

    // Edges — warm threads, colored by relationship type where data exists
    edges.forEach(e => {
      const pa = pos[e.a], pb = pos[e.b]; if (!pa || !pb) return;
      const mx2 = (pa.x + pb.x) / 2, my2 = (pa.y + pb.y) / 2 - 28;
      const thick = Math.min(1.6 + e.sharedEvs.length * 0.85, 6);
      const ec = _edgeColorFor(e.a, e.b);
      s += '<path d="M' + pa.x + ',' + pa.y + ' Q' + mx2 + ',' + my2 + ' ' + pb.x + ',' + pb.y + '"'
        + ' stroke="' + ec.col + '" stroke-width="' + thick + '" fill="none" opacity="0.6"'
        + ' stroke-linecap="round"'
        + ' class="cm-edge" data-type="shared" data-a="' + e.a + '" data-b="' + e.b
        + '" data-reltype="' + esc(ec.label || '') + '"'
        + ' data-cnt="' + e.sharedEvs.length + '" data-evids="' + e.sharedEvs.join(',') + '" style="cursor:pointer"/>';
    });

    // Nodes
    allChars.forEach(ch => {
      const p = pos[ch.id]; if (!p) return;
      const col = ch.color || charHashColor(ch.id);
      const evCnt = S.events.filter(ev => (ev.characterIds||[]).includes(ch.id)).length;
      const nr = 20 + Math.min(evCnt * 1.8, 15);
      const initials = ch.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
      const isFiltered = _charFilterIds.includes(ch.id);
      /* Soft warm halo around every node */
      s += '<circle cx="' + p.x + '" cy="' + p.y + '" r="' + (nr + 6) + '" fill="' + col + '" opacity="0.2" style="pointer-events:none"/>';
      if (isFiltered) {
        s += '<circle cx="' + p.x + '" cy="' + p.y + '" r="' + (nr + 11) + '" fill="none" stroke="#c77c21" stroke-width="2.5" stroke-dasharray="5,3" opacity="0.95" class="cm-sel-ring" style="pointer-events:none"/>';
      }
      /* Main node disc — warm cream ring */
      s += '<circle cx="' + p.x + '" cy="' + p.y + '" r="' + nr + '" fill="' + col + 'e6" stroke="#fff8e4" stroke-width="2.2"'
        + ' class="cm-node" data-cid="' + ch.id + '" style="cursor:pointer;filter:drop-shadow(0 2px 4px rgba(120,86,40,0.22))">'
        + '<title>' + esc(ch.name) + (evCnt ? ' \u2014 ' + evCnt + ' event' + (evCnt !== 1 ? 's' : '') : '') + '</title></circle>';
      if (ch.photo) {
        s += '<defs><clipPath id="ccp-' + ch.id + '"><circle cx="' + p.x + '" cy="' + p.y + '" r="' + (nr - 2) + '"/></clipPath></defs>';
        s += '<image href="' + ch.photo + '" x="' + (p.x-nr) + '" y="' + (p.y-nr) + '" width="' + (nr*2) + '" height="' + (nr*2) + '"'
          + ' clip-path="url(#ccp-' + ch.id + ')" preserveAspectRatio="xMidYMid slice"'
          + ' class="cm-node" data-cid="' + ch.id + '" style="cursor:pointer"/>';
      } else {
        s += '<text x="' + p.x + '" y="' + (p.y+5) + '" text-anchor="middle" font-size="13" font-weight="700" fill="white"'
          + ' font-family="-apple-system,sans-serif" letter-spacing="0.5" style="pointer-events:none;text-shadow:0 1px 2px rgba(80,50,20,0.4)">' + initials + '</text>';
      }
      // Name label — warm, readable on cream bg
      s += '<text x="' + p.x + '" y="' + (p.y+nr+15) + '" text-anchor="middle" font-size="10.5" fill="#3d2b1f"'
        + ' font-family="-apple-system,sans-serif" font-weight="600" class="cm-label" data-cid="' + ch.id + '" style="pointer-events:none;paint-order:stroke;stroke:rgba(253,247,233,0.85);stroke-width:2.8px;stroke-linejoin:round">'
        + (ch.name.length > 15 ? ch.name.slice(0,14) + '\u2026' : ch.name) + '</text>';
      // Life-track dots
      const uniIds = [...new Set(S.events.filter(ev => (ev.characterIds||[]).includes(ch.id)).map(ev => ev.universeId))];
      const dotSp = 9, totalDots = Math.min(uniIds.length, 5);
      const dotStartX = p.x - ((totalDots - 1) * dotSp) / 2;
      uniIds.slice(0, 5).forEach((uid, di) => {
        const uu = S.lifeTracks.find(u => u.id === uid); if (!uu) return;
        s += '<circle cx="' + (dotStartX + di * dotSp) + '" cy="' + (p.y+nr+26) + '" r="3.5" fill="' + uu.color + '" opacity="0.95" stroke="rgba(255,250,236,0.85)" stroke-width="0.8"><title>' + esc(uu.name) + '</title></circle>';
      });
    });

    /* Close pan/zoom group */
    s += '</g>';
    s += '</svg>';

    // Universe filter buttons
    const uniBtns = [
      '<button class="btn sm ' + (!this._uniFilter ? 'accent' : 'light') + '" onclick="ConnectionMap._uniFilter=null;ConnectionMap._rebuild()">All</button>'
    ].concat(S.lifeTracks.map(u => {
      const active = this._uniFilter === u.id;
      return '<button class="btn sm ' + (active ? 'accent' : 'light') + '" onclick="ConnectionMap._uniFilter=\'' + u.id + '\';ConnectionMap._rebuild()"'
        + ' style="' + (active ? 'background:' + u.color + ';border-color:' + u.color : 'border-left:3px solid ' + u.color) + '">' + esc(u.name) + '</button>';
    })).join('');

    container.innerHTML =
      '<div class="rel-controls">'
      + '<input class="map-search" id="cm-search" placeholder="\uD83D\uDD0D Search people\u2026" oninput="ConnectionMap._search(this.value)">'
      + '<div class="rel-ctrl-filters">'
      + '<span style="font-size:11px;color:#6080b0;flex-shrink:0">Filter:</span>'
      + uniBtns
      + '</div>'
      + '<div class="rel-ctrl-btns">'
      + '<button class="mz-btn" onclick="ConnectionMap._zoom(1.2)" title="Zoom In">+</button>'
      + '<span id="cm-pct">100%</span>'
      + '<button class="mz-btn" onclick="ConnectionMap._zoom(0.83)" title="Zoom Out">\u2212</button>'
      + '<button class="mz-btn" onclick="ConnectionMap._fitAll()" title="Fit All" style="font-size:13px">\u26F6</button>'
      + '<button class="mz-btn" onclick="ConnectionMap._resetView()" title="Reset Map">\u2302</button>'
      + '<button class="mz-btn" id="cm-legend-btn" onclick="ConnectionMap._toggleLegend()" title="Legend" style="font-weight:700;font-size:12px">?</button>'
      + '</div>'
      + '</div>'
      + '<div class="rel-hint">Drag to pan \u00B7 Mouse wheel or +/\u2212 to zoom \u00B7 Click node to open profile \u00B7 Click line for shared events</div>'
      + '<div class="conn-map-wrap" id="cm-wrap">'
      + s
      + '<div class="map-tip" id="map-tip"></div>'
      + '<div id="cm-legend-panel" class="cm-legend-panel" style="display:none">'
      + '<div class="cml-title">\uD83D\uDDFA\uFE0F Map Legend</div>'
      + '<div class="cml-item"><span class="cml-line" style="background:#b29070;width:24px;height:3px;border-radius:2px"></span>Line = shared memory (thicker = more events)</div>'
      + '<div style="font-size:10.5px;color:#7a5a34;margin:4px 0 6px;font-weight:600;letter-spacing:.3px;text-transform:uppercase">Line color = relationship type</div>'
      + '<div class="cml-item"><span class="cml-line" style="background:#c17a95;width:20px;height:3px;border-radius:2px"></span>Family</div>'
      + '<div class="cml-item"><span class="cml-line" style="background:#9d7eb5;width:20px;height:3px;border-radius:2px"></span>Partner</div>'
      + '<div class="cml-item"><span class="cml-line" style="background:#6b9ac4;width:20px;height:3px;border-radius:2px"></span>Friend</div>'
      + '<div class="cml-item"><span class="cml-line" style="background:#d4a058;width:20px;height:3px;border-radius:2px"></span>Mentor</div>'
      + '<div class="cml-item"><span class="cml-line" style="background:#74a080;width:20px;height:3px;border-radius:2px"></span>Colleague</div>'
      + '<div class="cml-item"><span class="cml-line" style="background:#b29070;width:20px;height:3px;border-radius:2px"></span>Other / unspecified</div>'
      + '<div style="height:6px"></div>'
      + '<div class="cml-item"><span style="width:16px;height:16px;border-radius:50%;background:#9d7eb5;flex-shrink:0;display:inline-block;border:2px solid #fff8e4;box-shadow:0 1px 3px rgba(80,55,20,.2)"></span>Person \u2014 size reflects event count</div>'
      + '<div class="cml-item"><span style="width:16px;height:16px;border-radius:50%;border:2.5px dashed #c77c21;flex-shrink:0;display:inline-block;background:transparent"></span>Highlighted by active filter</div>'
      + '<div style="height:6px"></div>'
      + '<div style="font-size:10.5px;color:#7a5a34;line-height:1.75">Colored dots below each node = life tracks<br>Hover a person for details &nbsp;&middot;&nbsp; Click to open profile<br>Click a line for shared memories</div>'
      + '</div>'
      + '</div>';

    setTimeout(() => this._attachInteractions(), 60);
  },

  _zoom(f) {
    this._mscale = Math.max(0.2, Math.min(5, this._mscale * f));
    this._updateTransform();
  },

  _resetView() {
    this._mx = 0; this._my = 0; this._mscale = 1;
    this._updateTransform();
    const inp = document.getElementById('cm-search');
    if (inp) { inp.value = ''; this._search(''); }
  },

  _updateTransform() {
    const g = document.getElementById('cm-g');
    if (g) g.setAttribute('transform', 'translate(' + this._mx + ',' + this._my + ') scale(' + this._mscale + ')');
    const pctEl = document.getElementById('cm-pct');
    if (pctEl) pctEl.textContent = Math.round(this._mscale * 100) + '%';
  },

  _search(q) {
    q = (q || '').toLowerCase().trim();
    const wrap = document.getElementById('cm-wrap');
    if (!wrap) return;
    let firstMatch = null;
    wrap.querySelectorAll('.cm-node').forEach(el => {
      const cid = el.dataset.cid; if (!cid) return;
      const ch = S.people.find(c => c.id === cid);
      const match = !q || (ch && (ch.name.toLowerCase().includes(q) || (ch.aliases||'').toLowerCase().includes(q)));
      el.style.opacity = match ? '' : '0.08';
      if (match && q && !firstMatch && el.getAttribute('cx') !== null) {
        firstMatch = { cx: parseFloat(el.getAttribute('cx')), cy: parseFloat(el.getAttribute('cy')) };
      }
    });
    wrap.querySelectorAll('.cm-label').forEach(el => {
      const cid = el.dataset.cid; if (!cid) return;
      const ch = S.people.find(c => c.id === cid);
      const match = !q || (ch && (ch.name.toLowerCase().includes(q) || (ch.aliases||'').toLowerCase().includes(q)));
      el.style.opacity = match ? '' : '0.08';
    });
    if (firstMatch && q) {
      const targetMx = 370 - firstMatch.cx * this._mscale;
      const targetMy = 270 - firstMatch.cy * this._mscale;
      const startMx = this._mx, startMy = this._my;
      const diffX = targetMx - startMx, diffY = targetMy - startMy;
      const duration = 340, t0 = performance.now();
      const ease = t => t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
      const step = now => {
        const t = Math.min((now - t0) / duration, 1);
        this._mx = startMx + diffX * ease(t);
        this._my = startMy + diffY * ease(t);
        this._updateTransform();
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  },

  _fitAll() {
    const startMx = this._mx, startMy = this._my, startMs = this._mscale;
    const duration = 380, t0 = performance.now();
    const ease = t => t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
    const step = now => {
      const t = Math.min((now - t0) / duration, 1);
      const e = ease(t);
      this._mx = startMx * (1 - e);
      this._my = startMy * (1 - e);
      this._mscale = startMs + (1 - startMs) * e;
      this._updateTransform();
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },

  _toggleLegend() {
    const panel = document.getElementById('cm-legend-panel');
    if (!panel) return;
    const visible = panel.style.display !== 'none';
    panel.style.display = visible ? 'none' : 'block';
    const btn = document.getElementById('cm-legend-btn');
    if (btn) btn.classList.toggle('active', !visible);
  },

  _attachInteractions() {
    const wrap = document.getElementById('cm-wrap');
    const tip  = document.getElementById('map-tip');
    if (!wrap || !tip) return;

    /* --- Pan / Zoom --- */
    wrap.onmousedown = (e) => {
      if (e.target.classList.contains('cm-node') || e.target.classList.contains('cm-edge')) return;
      this._drag = { on: true, sx: e.clientX, sy: e.clientY, ox: this._mx, oy: this._my };
      wrap.classList.add('cm-dragging');
      e.preventDefault();
    };

    if (!this._listenersAttached) {
      window.addEventListener('mousemove', (e) => {
        if (!this._drag || !this._drag.on) return;
        this._mx = this._drag.ox + e.clientX - this._drag.sx;
        this._my = this._drag.oy + e.clientY - this._drag.sy;
        this._updateTransform();
      });
      window.addEventListener('mouseup', () => {
        if (this._drag) this._drag.on = false;
        const w = document.getElementById('cm-wrap');
        if (w) w.classList.remove('cm-dragging');
      });
      this._listenersAttached = true;
    }

    wrap.onwheel = (e) => {
      e.preventDefault();
      this._zoom(e.deltaY < 0 ? 1.12 : 0.89);
    };

    /* Touch pan */
    let t0 = null;
    wrap.ontouchstart = (e) => {
      if (e.touches.length === 1) t0 = { x: e.touches[0].clientX, y: e.touches[0].clientY, mx: this._mx, my: this._my };
    };
    wrap.ontouchmove = (e) => {
      if (e.touches.length === 1 && t0) {
        this._mx = t0.mx + e.touches[0].clientX - t0.x;
        this._my = t0.my + e.touches[0].clientY - t0.y;
        this._updateTransform(); e.preventDefault();
      }
    };
    wrap.ontouchend = () => { t0 = null; };

    /* --- Node hover: glow + edge highlight --- */
    wrap.querySelectorAll('.cm-node').forEach(el => {
      el.addEventListener('click', () => {
        const cid = el.dataset.cid; if (cid) _openCharDetail(cid);
      });

      el.addEventListener('mouseenter', () => {
        el.setAttribute('filter', 'url(#glow2)');
        const origR = parseFloat(el.getAttribute('r') || 20);
        el.dataset.origR = String(origR);
        el.setAttribute('r', origR + 5);
        const cid = el.dataset.cid;
        wrap.querySelectorAll('.cm-edge').forEach(edge => {
          if (edge.dataset.a === cid || edge.dataset.b === cid) {
            edge.dataset.origOp = edge.getAttribute('opacity') || '0.6';
            edge.dataset.origSw = edge.getAttribute('stroke-width') || '1.5';
            edge.setAttribute('opacity', '0.95');
            const sw = parseFloat(edge.getAttribute('stroke-width') || 1.5);
            edge.setAttribute('stroke-width', sw + 2.5);
          }
        });
      });

      el.addEventListener('mouseleave', () => {
        el.removeAttribute('filter');
        if (el.dataset.origR) { el.setAttribute('r', el.dataset.origR); delete el.dataset.origR; }
        wrap.querySelectorAll('.cm-edge').forEach(edge => {
          if (edge.dataset.origOp !== undefined) { edge.setAttribute('opacity', edge.dataset.origOp); delete edge.dataset.origOp; }
          if (edge.dataset.origSw !== undefined) { edge.setAttribute('stroke-width', edge.dataset.origSw); delete edge.dataset.origSw; }
        });
        tip.style.display = 'none';
      });

      el.addEventListener('mousemove', e => {
        const cid = el.dataset.cid;
        const ch = cid ? S.people.find(c => c.id === cid) : null;
        if (!ch) { tip.style.display = 'none'; return; }
        const evs = S.events.filter(ev => (ev.characterIds||[]).includes(ch.id));
        const unis = [...new Set(evs.map(ev => { const uu = S.lifeTracks.find(u => u.id === ev.universeId); return uu ? uu.name : null; }).filter(Boolean))];
        const _relPal = { 'Family':'#b05070', 'Partner':'#9b59b6', 'Friend':'#3498db', 'Mentor':'#d08838', 'Colleague':'#4a9375', 'Other':'#95867a' };
        const _statusPal = { 'Living':'#4a9375', 'Passed Away':'#b05060', 'Lost Touch':'#c17a2c' };
        tip.innerHTML = '<strong>' + esc(ch.name) + '</strong>'
          + (ch.aliases ? '<br><em>' + esc(ch.aliases) + '</em>' : '')
          + (ch.alignment ? '<br><span style="color:' + (_relPal[ch.alignment]||'#95867a') + '">\u25CF</span> ' + esc(ch.alignment) : '')
          + (ch.status  ? '<br><span style="color:' + (_statusPal[ch.status]||'#8b6e4e') + '">\u25CF</span> ' + esc(ch.status) : '')
          + '<br>\uD83D\uDCC5 ' + evs.length + ' event' + (evs.length !== 1 ? 's' : '')
          + (unis.length ? '<br>\uD83C\uDF31 ' + esc(unis.join(', ')) : '')
          + (ch.powers ? '<br>\u2728 ' + esc(ch.powers.split('\n')[0].slice(0, 65)) + (ch.powers.length > 65 ? '\u2026' : '') : '')
          + '<br><span style="font-size:10.5px;color:#8b6e4e;margin-top:4px;display:block">Click to open full profile</span>';
        _showMapTip(tip, e, wrap);
      });
    });

    /* --- Edge: click to open shared-scene panel --- */
    wrap.querySelectorAll('.cm-edge').forEach(el => {
      el.addEventListener('click', e => {
        const ca = S.people.find(c => c.id === el.dataset.a);
        const cb = S.people.find(c => c.id === el.dataset.b);
        if (!ca || !cb) return;
        const evIds = (el.dataset.evids || '').split(',').filter(Boolean);
        const evs = evIds.map(id => S.events.find(ev => ev.id === id)).filter(Boolean);
        let panel = document.getElementById('cm-edge-panel');
        if (!panel) {
          panel = document.createElement('div');
          panel.id = 'cm-edge-panel';
          panel.style.cssText = 'position:absolute;background:#fffaec;border:1px solid #c9ae78;border-radius:12px;padding:14px 16px;font-size:13px;z-index:30;max-width:300px;box-shadow:0 10px 32px rgba(80,55,20,.25),0 0 0 1px rgba(255,255,255,.55) inset;max-height:320px;overflow-y:auto;backdrop-filter:blur(6px);';
          document.getElementById('cm-wrap').appendChild(panel);
        }
        const rect = wrap.getBoundingClientRect();
        let lx = e.clientX - rect.left + 14, ly = e.clientY - rect.top + 14;
        if (lx + 300 > rect.width)  lx = e.clientX - rect.left - 305;
        if (ly + 330 > rect.height) ly = e.clientY - rect.top - 200;
        panel.style.left = lx + 'px'; panel.style.top = ly + 'px';
        panel.innerHTML =
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:9px">'
          + '<strong style="font-size:14px;color:#3d2b1f">\uD83D\uDD56 Shared Memories</strong>'
          + '<button onclick="document.getElementById(\'cm-edge-panel\').style.display=\'none\'" style="background:none;border:none;cursor:pointer;font-size:20px;color:#a8916d;line-height:1;padding:0 0 0 10px">&times;</button>'
          + '</div>'
          + '<div style="font-size:12px;color:#8b6e4e;margin-bottom:10px;font-style:italic">' + esc(ca.name) + ' &amp; ' + esc(cb.name) + '</div>'
          + evs.map(ev => {
              const uu = getU(ev.universeId);
              return '<div class="shared-ev-item" onclick="MS.push({t:\'evDetail\',evId:\'' + ev.id + '\'});M.render()">'
                + '<div class="shared-ev-dot" style="background:' + (uu?uu.color:'#b29070') + '"></div>'
                + '<div><div style="font-size:12.5px;font-weight:600;color:#3d2b1f">' + esc(ev.title) + '</div>'
                + '<div style="font-size:10.5px;color:#8b6e4e">' + esc(ev.date||'?') + (uu ? ' \u2014 ' + esc(uu.name) : '') + '</div></div>'
                + '</div>';
            }).join('');
        panel.style.display = 'block';
        e.stopPropagation();
      });

      el.addEventListener('mousemove', e => {
        const ca = S.people.find(c => c.id === el.dataset.a);
        const cb = S.people.find(c => c.id === el.dataset.b);
        if (!ca || !cb) return;
        const cnt = parseInt(el.dataset.cnt) || 0;
        const relType = el.dataset.reltype || '';
        const evIds = (el.dataset.evids || '').split(',').filter(Boolean);
        const evTitles = evIds.slice(0, 4).map(eid => { const ev = S.events.find(ev => ev.id === eid); return ev ? '\u2022 ' + esc(ev.title) : null; }).filter(Boolean).join('<br>');
        tip.innerHTML = '<strong>' + cnt + ' Shared Event' + (cnt !== 1 ? 's' : '') + '</strong><br>'
          + esc(ca.name) + ' &amp; ' + esc(cb.name)
          + (relType ? '<br><em>Relationship: ' + esc(relType) + '</em>' : '')
          + '<br>' + evTitles
          + (evIds.length > 4 ? '<br>\u2026 +' + (evIds.length - 4) + ' more' : '')
          + '<br><span style="font-size:10.5px;color:#8b6e4e">\uD83D\uDC49 Click to see all events</span>';
        _showMapTip(tip, e, wrap);
      });
      el.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
    });

    /* Click background to dismiss edge panel */
    wrap.onclick = (e) => {
      if (e.target.classList.contains('cm-edge')) return;
      const panel = document.getElementById('cm-edge-panel');
      if (panel && !panel.contains(e.target)) panel.style.display = 'none';
    };
  },

  _rebuild() {
    if (this._container) this.build(this._container);
  }
};

function _showMapTip(tip, e, wrap) {
  const rect = wrap.getBoundingClientRect();
  let lx = e.clientX - rect.left + 14, ly = e.clientY - rect.top + 14;
  tip.style.display = 'block';
  const tw = tip.offsetWidth || 200, th = tip.offsetHeight || 80;
  if (lx + tw > rect.width)  lx = e.clientX - rect.left - tw - 10;
  if (ly + th > rect.height) ly = e.clientY - rect.top  - th - 10;
  tip.style.left = lx + 'px';
  tip.style.top  = ly + 'px';
}

/* =====================================================
   SHARED SCENES HELPER
   ===================================================== */
function buildSharedEventsHTML(charId) {
  const others = S.people.filter(c => c.id !== charId);
  let hasAny = false;
  const rows = others.map(other => {
    const shared = S.events.filter(ev =>
      (ev.characterIds||[]).includes(charId) && (ev.characterIds||[]).includes(other.id)
    );
    if (shared.length === 0) return '';
    hasAny = true;
    const col = other.color || charHashColor(other.id);
    return '<div style="margin-bottom:10px">'
      + '<div style="font-size:11px;font-weight:700;color:#4050a0;margin-bottom:4px">'
      + '<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:' + col + ';margin-right:5px;vertical-align:middle"></span>'
      + esc(other.name) + ' <span style="font-weight:400;color:#a0a8c0">(' + shared.length + ' shared scene' + (shared.length !== 1 ? 's' : '') + ')</span></div>'
      + shared.map(ev => {
        const u = S.lifeTracks.find(u => u.id === ev.universeId);
        return '<div class="shared-ev-item" onclick="_openEv(\'' + ev.id + '\')">'
          + '<div class="shared-ev-dot" style="background:' + (u ? u.color : '#ccc') + '"></div>'
          + '<div><div style="font-size:12px;font-weight:600;color:#1a1a2e">' + esc(ev.title) + '</div>'
          + '<div style="font-size:10px;color:#7080a0">'
          + esc(ev.date || '?') + (u ? ' &mdash; ' + esc(u.name) : '') + '</div></div></div>';
      }).join('')
      + '</div>';
  }).filter(Boolean).join('');
  if (!hasAny) return '<div style="font-size:12px;color:#bbb;padding:6px 0">No shared events yet. Link people to events to see their connections.</div>';
  return rows;
}

function _openEv(evId) {
  M.close();
  setTimeout(() => { M.openEvDetail(evId); }, 80);
}

let _helpState = { query: '', activeId: 'getting-started' };

const HELP_GUIDE_SECTIONS = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    note: 'Your first visit and what to do first.',
    kicker: 'First steps',
    searchText: 'start begin first visit help guide life track event autosave private local',
    html: `
      <div class="help-tip"><strong>Welcome to Free Timeline Biography.</strong> Think of it as a private archive for one life story. You add moments, place them on a timeline, and come back whenever you want to add more.</div>
      <p>Most people start with one life track and one event. Click <strong>+ Life Track</strong>, give the row a simple name such as <em>My Life</em>, then click <strong>+ Event</strong> to record your first memory.</p>
      <p>You do not need to begin at birth. Start with any moment you remember well. You can move backward and forward later.</p>
      <div class="help-action-box"><strong>A calm way to begin:</strong> create one track, add one event, write one honest sentence, then save that event. The rest can grow little by little.</div>
      <div class="help-mini-list">
        <div class="help-mini-card"><strong>Where to click</strong><span>The main buttons are in the top toolbar. On mobile, open <strong>More</strong> for extra actions.</span></div>
        <div class="help-mini-card"><strong>What appears next</strong><span>Each saved event becomes a dot on the timeline. Click the dot any time to read or edit it.</span></div>
      </div>
    `
  },
  {
    id: 'what-is-saved-locally',
    title: 'What is saved locally',
    note: 'What stays on this device, and the risks to know.',
    kicker: 'Storage and privacy',
    searchText: 'local saved browser device privacy offline clearing history browser data same browser same computer localStorage photos attachments risk',
    html: `
      <div class="help-warning"><strong>Important:</strong> your working timeline is saved in this browser on this device. It is not sent to a server, and it does not automatically appear in another browser, another phone, or another computer.</div>
      <p>The app saves your current timeline in the browser every minute. That local copy includes your life tracks, events, people, connections, categories, groups, notes, and anything else already in the timeline.</p>
      <p>If you clear browser data, use a different browser, use private browsing, reset the device, or lose the device, that local copy can disappear. That is why backups matter.</p>
      <p>Your exported backup files are different. Those are saved where you choose, such as your Documents folder or a USB drive, and they stay there until you delete them.</p>
      <div class="help-note"><strong>Safe rule:</strong> treat the browser copy as your working table, and treat backups as your archive boxes.</div>
    `
  },
  {
    id: 'creating-events',
    title: 'Creating events',
    note: 'How to add a memory and what each field means.',
    kicker: 'Record a moment',
    searchText: 'create event add event title date description category save people media tags start date end date',
    html: `
      <p>An event is one moment, period, or memory. It can be a birthday, a move, a job, a loss, a trip, or something very ordinary that still matters to you.</p>
      <ol class="help-steps">
        <li class="help-step"><div class="help-step-num">1</div><div><h4>Click <strong>+ Event</strong></h4><p>Choose the life track where the event belongs. If you only have one track, it is usually selected for you.</p></div></li>
        <li class="help-step"><div class="help-step-num">2</div><div><h4>Add the main details</h4><p>Use a short title, a date if you know it, and a description in your own words. If you only know part of the date, you can use <strong>X</strong> for the unknown parts, such as <strong>XX/XX/1965</strong>.</p></div></li>
        <li class="help-step"><div class="help-step-num">3</div><div><h4>Choose a category</h4><p>Categories color the event and make it easier to find later.</p></div></li>
        <li class="help-step"><div class="help-step-num">4</div><div><h4>Save the event</h4><p>After you save, the event appears on the timeline as a dot. Click that dot to read, edit, or link people.</p></div></li>
      </ol>
      <div class="help-tip"><strong>Writing tip:</strong> a few real details make the story stronger. What happened, where were you, and how did it feel?</div>
    `
  },
  {
    id: 'timeline-navigation',
    title: 'Timeline navigation',
    note: 'How to move around without changing your data.',
    kicker: 'Move through time',
    searchText: 'navigation pan move timeline drag scroll today reset event dot double click row open event',
    html: `
      <p>The timeline is your reading surface. Moving around it does not change your data. It only changes what part of the timeline you are looking at.</p>
      <p>Drag on empty space to move left or right through time. Older years are on one side, newer years on the other. Click an event dot to open it. Double-click an empty part of a track to add an event quickly in that area.</p>
      <div class="help-mini-list">
        <div class="help-mini-card"><strong><span aria-hidden="true">🕘</span> Today</strong><span>Jumps the view back to the current date without changing zoom.</span></div>
        <div class="help-mini-card"><strong><span aria-hidden="true">⌂</span> Reset</strong><span>Returns the view to the normal position and zoom if you feel lost.</span></div>
      </div>
      <div class="help-note">If your events seem to have disappeared, first check whether you are simply looking at a different part of the timeline. <strong>Today</strong> and <strong>Reset</strong> are the fastest way back.</div>
    `
  },
  {
    id: 'pan-and-zoom',
    title: 'Pan and zoom',
    note: 'See the full life or a small period in more detail.',
    kicker: 'View detail',
    searchText: 'zoom in out pan ctrl scroll plus minus wheel shift scroll row height scale detail',
    html: `
      <p>Panning means moving the view. Zooming means changing how much time fits on the screen.</p>
      <p>Use the mouse wheel to move across the timeline. Hold <strong>Ctrl</strong> while scrolling to zoom in or out. You can also use the <strong>+</strong> and <strong>−</strong> zoom buttons on the screen.</p>
      <p>Zoom in when you want to work on a small period with more detail. Zoom out when you want the wider shape of a life, a decade, or many tracks at once.</p>
      <div class="help-tip"><strong>Helpful reminder:</strong> zoom does not change the event itself. It only changes how close you are looking.</div>
    `
  },
  {
    id: 'tracks-universes',
    title: 'Tracks/universes',
    note: 'Rows on the timeline, including older file names.',
    kicker: 'Organize rows',
    searchText: 'tracks universes life tracks rows rename hide show delete legacy universe old backup',
    html: `
      <p>A life track is one row on the timeline. Use separate tracks when you want a cleaner story, such as one track for your own life and another for family history or a special chapter.</p>
      <p>Older backup files may still use the word <strong>Universe</strong>. In Biography, that same idea now appears as <strong>Life Track</strong>.</p>
      <ol class="help-steps">
        <li class="help-step"><div class="help-step-num">1</div><div><h4>Create a track</h4><p>Click <strong>+ Life Track</strong>, give it a name, choose a color, and save.</p></div></li>
        <li class="help-step"><div class="help-step-num">2</div><div><h4>Show or hide it</h4><p>Use the track chips in the filter bar. Hiding a track does not delete anything.</p></div></li>
        <li class="help-step"><div class="help-step-num">3</div><div><h4>Edit carefully</h4><p>You can rename a track or change its color. If you delete a track, the events inside that track are deleted too, so make a backup first.</p></div></li>
      </ol>
    `
  },
  {
    id: 'people-characters',
    title: 'People/characters',
    note: 'How to build the people archive beside the timeline.',
    kicker: 'People archive',
    searchText: 'people characters person profile new person relationship family friend mentor pin filter timeline path life track context',
    html: `
      <p>The <strong>People</strong> view is where you keep important people, family members, friends, colleagues, or any figure connected to the story.</p>
      <p>Click <strong>People</strong>, then <strong>+ New Person</strong>. Only the name is required. Photo, notes, relationship, occupation, and other details are optional.</p>
      <p>Each person gets a profile page. That profile shows their linked events, a timeline path, and a <strong>Life Track Context</strong> option so you can read their moments with more background around them.</p>
      <div class="help-note"><strong>Pin Filter:</strong> inside a person profile you can pin that person as a filter. This is a quick way to show only events connected to them.</div>
    `
  },
  {
    id: 'categories',
    title: 'Categories',
    note: 'Color and label your events for easier reading.',
    kicker: 'Visual labels',
    searchText: 'categories category colors labels milestone education career relationship home place grief achievement health',
    html: `
      <p>Categories help you understand the timeline at a glance. They give events a type and a color, so one look can tell you whether a period is full of family events, work changes, travel, or something else.</p>
      <p>Click <strong>Categories</strong> in the toolbar to add your own categories, rename existing ones, or change their colors.</p>
      <p>When you save an event with a category, the event uses that category color on the timeline and becomes easier to filter later.</p>
      <div class="help-tip"><strong>Simple habit:</strong> if you are unsure which category to use, pick the closest one and keep going. You can always change it later.</div>
    `
  },
  {
    id: 'search-and-filters',
    title: 'Search and filters',
    note: 'Find one memory fast, even in a large timeline.',
    kicker: 'Find anything',
    searchText: 'search filters category people tone status tags clear all mobile search bar pin person',
    html: `
      <p>The search box looks through event text so you can find a memory by a word, name, or phrase. Type in the box and the timeline narrows to matching events.</p>
      <p>The filter bar can also narrow by category, emotional tone, status, tags, and pinned people. On mobile, open <strong>Search/Filters</strong> to reach the same tools.</p>
      <div class="help-mini-list">
        <div class="help-mini-card"><strong>Category</strong><span>Show only one type of event.</span></div>
        <div class="help-mini-card"><strong>People</strong><span>Use a pinned person to show connected moments.</span></div>
        <div class="help-mini-card"><strong>Tone and status</strong><span>Useful when you want a certain kind of period.</span></div>
        <div class="help-mini-card"><strong>Clear</strong><span>Turn filters off when you want the full timeline back.</span></div>
      </div>
      <div class="help-note">If something seems missing, check whether a search or filter is still active before assuming the event is gone.</div>
    `
  },
  {
    id: 'relationships-connections',
    title: 'Relationships/connections',
    note: 'See how people and events connect together.',
    kicker: 'Connected lives',
    searchText: 'relationships connections map people linked events event people section connection map shared events',
    html: `
      <p>Connections are created when you link people to events. For example, if a wedding event is linked to two people, both of those people become part of that moment in the archive.</p>
      <p>Open any event and use the <strong>People</strong> section to link or unlink people. This changes the relationship between the event and the person. It does not delete either one.</p>
      <p>The <strong>Relationships</strong> view gives you a map of how people connect across the story. It is especially helpful when you want to understand who appears together, who shaped a chapter, or how a circle changed over time.</p>
    `
  },
  {
    id: 'story-mode',
    title: 'Story Mode',
    note: 'How to read Biography as a story.',
    kicker: 'Read the archive',
    searchText: 'story mode reading story biography timeline path life track context descriptions media people profiles',
    html: `
      <div class="help-note"><strong>There is no separate button called Story Mode in this version.</strong> In Biography, story mode is the way the archive becomes readable when you combine events, descriptions, people, and context.</div>
      <p>To read the story, open an event dot and read the title, dates, description, notes, and media together. Then open the linked people to see their profiles and linked moments.</p>
      <p>On a person profile, <strong>Timeline Path</strong> shows their own trail through the story. <strong>Life Track Context</strong> adds surrounding events from the same track, which helps a single memory feel like part of a larger chapter.</p>
      <p>If you want Biography to feel more like a narrative, write short descriptions instead of only titles. Even one extra sentence often changes the whole reading experience.</p>
    `
  },
  {
    id: 'importing',
    title: 'Importing',
    note: 'Bring in a backup file from your device.',
    kicker: 'Load a file',
    searchText: 'import load html json file replace current data choose file',
    html: `
      <div class="help-warning"><strong>Import replaces the current timeline.</strong> If the current timeline matters, make a fresh backup before you load anything.</div>
      <p>Click <strong>Load</strong>, choose a saved <strong>.html</strong> or <strong>.json</strong> backup file, and confirm the import. The timeline on screen will switch to the data from that file.</p>
      <p>Imported older files still work. If an older file used the word <strong>Universe</strong>, Biography keeps the data and shows those rows as life tracks.</p>
    `
  },
  {
    id: 'creating-backups',
    title: 'Creating backups',
    note: 'Save a copy you can keep outside the browser.',
    kicker: 'Protect your work',
    searchText: 'backup create save html save json export documents usb safe copy',
    html: `
      <p>Use <strong>Save HTML</strong> when you want a full portable copy that can reopen as its own timeline page. Use <strong>JSON</strong> when you want a plain data backup file.</p>
      <p>Choose a clear file name and save it somewhere you can find again, such as your Documents folder. For important work, keep a second copy on another device or USB drive.</p>
      <div class="help-action-box"><strong>Good routine:</strong> create a backup at the end of each session, before big edits, and before clearing browser data or changing devices.</div>
    `
  },
  {
    id: 'restoring-from-backup',
    title: 'Restoring from backup',
    note: 'Bring your saved archive back into the app.',
    kicker: 'Restore safely',
    searchText: 'restore backup load current work replace restore timeline from file',
    html: `
      <ol class="help-steps">
        <li class="help-step"><div class="help-step-num">1</div><div><h4>Back up the current timeline first</h4><p>If there is anything on screen that you may want to keep, export it before restoring a different file.</p></div></li>
        <li class="help-step"><div class="help-step-num">2</div><div><h4>Click <strong>Load</strong></h4><p>Select your saved HTML or JSON backup file.</p></div></li>
        <li class="help-step"><div class="help-step-num">3</div><div><h4>Confirm the replacement</h4><p>Once confirmed, the app loads the archive from that file and shows it as the current timeline.</p></div></li>
      </ol>
      <div class="help-warning">Restore is not a merge. It is a replacement of the current timeline with the backup you chose.</div>
    `
  },
  {
    id: 'keyboard-shortcuts',
    title: 'Keyboard shortcuts',
    note: 'Useful if you have a physical keyboard.',
    kicker: 'Keyboard help',
    searchText: 'keyboard shortcuts esc escape arrows ctrl z ctrl y plus minus zero keys',
    html: `
      <p>You can use Biography without a keyboard. These shortcuts are optional and mainly helpful on desktop or when a tablet has a connected keyboard.</p>
      <div class="help-mini-list">
        <div class="help-mini-card"><strong>Esc</strong><span>Closes an open panel or modal.</span></div>
        <div class="help-mini-card"><strong>Arrow keys</strong><span>Move the timeline view.</span></div>
        <div class="help-mini-card"><strong>+</strong> and <strong>−</strong><span>Zoom in or out.</span></div>
        <div class="help-mini-card"><strong>0</strong><span>Reset zoom and position.</span></div>
        <div class="help-mini-card"><strong>Ctrl + Z</strong><span>Undo the last change.</span></div>
        <div class="help-mini-card"><strong>Ctrl + Y</strong><span>Redo a change you undid.</span></div>
      </div>
      <div class="help-note"><strong>Inside this guide:</strong> use <strong>Tab</strong> to move, <strong>Enter</strong> or <strong>Space</strong> to open a section, and <strong>Esc</strong> to close the guide.</div>
    `
  },
  {
    id: 'mobile-use',
    title: 'Mobile use',
    note: 'How Biography works on phones and tablets.',
    kicker: 'Phone and tablet',
    searchText: 'mobile phone tablet more search filters touch mobile use drawer buttons add event',
    html: `
      <p>Biography works on mobile with touch-friendly buttons and drawers. The top bar gives you <strong>Add Event</strong>, <strong>Search/Filters</strong>, and <strong>More</strong>.</p>
      <p>Open <strong>More</strong> to reach backups, load/import, views, categories, groups, navigation tools, and this guide. Open <strong>Search/Filters</strong> to search events and filter the timeline.</p>
      <p>On smaller screens, using the on-screen zoom buttons is often easier than keyboard shortcuts. If you have a connected keyboard, the usual shortcuts still help.</p>
      <div class="help-tip"><strong>Mobile habit:</strong> after any important session, open <strong>More</strong> and make a backup before you close the page.</div>
    `
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    note: 'Common problems and the fastest checks.',
    kicker: 'When something feels wrong',
    searchText: 'troubleshooting missing events no data reset view filters hidden track browser data import wrong file image too large',
    html: `
      <div class="help-mini-list">
        <div class="help-mini-card"><strong>I cannot see my events</strong><span>Press <strong>Today</strong> or <strong>Reset</strong>, then clear any search or filters. Also check whether the track is hidden.</span></div>
        <div class="help-mini-card"><strong>My work is gone</strong><span>Check whether you opened the same browser on the same device. If browser data was cleared, restore from a backup file.</span></div>
        <div class="help-mini-card"><strong>The wrong file loaded</strong><span>Make a backup of what is on screen now if needed, then load the correct backup file.</span></div>
        <div class="help-mini-card"><strong>An image will not save</strong><span>Large images can fail. Try a smaller image. The app warns when an image is too large for local storage.</span></div>
      </div>
      <p>If something still feels wrong, make a backup of the current state before trying more changes. That gives you a safe point to return to.</p>
      <p>If you need outside help, share only what you are comfortable sharing. Your timeline is private by default.</p>
    `
  }
];

function helpMatchedSections() {
  const q = (_helpState.query || '').trim().toLowerCase();
  if (!q) return HELP_GUIDE_SECTIONS;
  return HELP_GUIDE_SECTIONS.filter(section =>
    (section.title + ' ' + section.note + ' ' + section.kicker + ' ' + section.searchText + ' ' + section.html.replace(/<[^>]+>/g, ' '))
      .toLowerCase()
      .includes(q)
  );
}

function helpCurrentId() {
  const matches = helpMatchedSections();
  if (!matches.length) return '';
  const exists = matches.some(section => section.id === _helpState.activeId);
  if (!exists) _helpState.activeId = matches[0].id;
  return _helpState.activeId;
}

function buildHelpGuide() {
  const matches = helpMatchedSections();
  const activeId = helpCurrentId();
  const active = matches.find(section => section.id === activeId);
  const tabHTML = matches.map((section, idx) =>
    '<button class="help-tab' + (section.id === activeId ? ' active' : '') + '" type="button" role="tab" aria-selected="' + (section.id === activeId ? 'true' : 'false') + '" aria-controls="help-panel-' + section.id + '" id="help-tab-' + section.id + '" tabindex="' + (section.id === activeId ? '0' : '-1') + '" onclick="helpTab(\'' + section.id + '\')" onkeydown="helpTabKey(event,' + idx + ')">' +
      '<span class="help-tab-label">' + esc(section.title) + '</span>' +
      '<span class="help-tab-note">' + esc(section.note) + '</span>' +
    '</button>'
  ).join('');

  const sectionHTML = matches.map(section =>
    '<section class="help-section' + (section.id === activeId ? ' active' : '') + '" id="help-panel-' + section.id + '" role="tabpanel" aria-labelledby="help-tab-' + section.id + '">' +
      '<div class="help-panel-head">' +
        '<div class="help-panel-kicker">' + esc(section.kicker) + '</div>' +
        '<h3 class="help-panel-title">' + esc(section.title) + '</h3>' +
      '</div>' +
      '<div class="help-panel-body">' + section.html + '</div>' +
    '</section>'
  ).join('');

  const countLabel = matches.length === 1 ? '1 section' : matches.length + ' sections';
  return '' +
    '<div class="help-shell" id="help-shell">' +
      '<div class="help-hero">' +
        '<div class="help-kicker">Archive Curator Guide</div>' +
        '<h3>Everything you need to use Free Timeline Biography</h3>' +
        '<p>This guide is written for real use, not for technical reading. Search for a topic, open a section, and follow the steps at your own pace.</p>' +
        '<p>Nothing in this guide changes your data. It simply explains how the timeline works and how to keep your archive safe.</p>' +
        '<div class="help-searchbar">' +
          '<div class="help-search-wrap">' +
            '<input class="help-search" id="help-search-input" type="text" placeholder="Search the guide: backup, people, mobile, filters…" value="' + esc(_helpState.query || '') + '" oninput="helpSearch(this.value)">' +
          '</div>' +
          '<div class="help-search-meta">' +
            '<span class="help-chip">' + countLabel + '</span>' +
            ((_helpState.query || '').trim()
              ? '<button type="button" class="help-chip help-chip-btn" onclick="helpSearch(\'\')">Clear search</button>'
              : '<span class="help-chip">Esc closes</span>') +
          '</div>' +
        '</div>' +
      '</div>' +
      (matches.length
        ? '<div class="help-layout">' +
            '<aside class="help-nav" aria-label="Guide sections">' +
              '<div class="help-nav-title">Sections</div>' +
              '<div class="help-tabs" role="tablist" aria-label="Help guide sections">' + tabHTML + '</div>' +
              '<div class="help-footer-note">Tip: use search to jump to backups, people, filters, keyboard help, or mobile instructions.</div>' +
            '</aside>' +
            '<div class="help-content"><div class="help-panel">' + sectionHTML + '</div></div>' +
          '</div>'
        : '<div class="help-panel"><div class="help-empty"><strong>No section matches that search.</strong>Try a simpler word such as <em>backup</em>, <em>people</em>, <em>mobile</em>, or <em>filters</em>.</div></div>') +
    '</div>';
}

function helpSearch(val) {
  _helpState.query = val || '';
  const active = document.activeElement;
  const activeId = active && active.id;
  const selectionStart = active && typeof active.selectionStart === 'number' ? active.selectionStart : null;
  const selectionEnd = active && typeof active.selectionEnd === 'number' ? active.selectionEnd : null;
  renderHelpGuide({ preserveFocusId: activeId, selectionStart, selectionEnd });
}

function helpTab(id, shouldFocusBtn) {
  _helpState.activeId = id;
  renderHelpGuide({ focusTabId: shouldFocusBtn ? id : '' });
}

function helpTabKey(e, idx) {
  const matches = helpMatchedSections();
  if (!matches.length) return;
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
  e.preventDefault();
  let next = idx;
  if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = matches.length - 1;
  else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (idx + 1) % matches.length;
  else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = (idx - 1 + matches.length) % matches.length;
  helpTab(matches[next].id, true);
}

function helpFocusableEls() {
  const shell = document.getElementById('help-shell');
  if (!shell) return [];
  return Array.from(shell.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
    .filter(el => !el.disabled && el.offsetParent !== null);
}

function helpTrapFocus(e) {
  if (e.key !== 'Tab') return;
  const els = helpFocusableEls();
  if (!els.length) return;
  const first = els[0];
  const last = els[els.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function initHelpGuide(opts) {
  const shell = document.getElementById('help-shell');
  if (!shell) return;
  shell.addEventListener('keydown', helpTrapFocus);
  const preserveFocusId = opts && opts.preserveFocusId;
  const focusTabId = opts && opts.focusTabId;
  if (preserveFocusId) {
    const target = document.getElementById(preserveFocusId);
    if (target && typeof target.focus === 'function') {
      target.focus();
      if (preserveFocusId === 'help-search-input' && typeof opts.selectionStart === 'number' && typeof target.setSelectionRange === 'function') {
        target.setSelectionRange(opts.selectionStart, opts.selectionEnd == null ? opts.selectionStart : opts.selectionEnd);
      }
      return;
    }
  }
  if (focusTabId) {
    const btn = document.getElementById('help-tab-' + focusTabId);
    if (btn) { btn.focus(); return; }
  }
  const search = document.getElementById('help-search-input');
  if (search) {
    setTimeout(() => {
      try {
        search.focus();
        const len = search.value.length;
        if (typeof search.setSelectionRange === 'function') search.setSelectionRange(len, len);
      } catch (_) {}
    }, 0);
  }
}

function renderHelpGuide(opts) {
  const body = document.getElementById('m-body');
  if (!body) return;
  body.innerHTML = buildHelpGuide();
  initHelpGuide(opts || {});
}

/* buildUniStats — returns object with event/char counts */
function buildUniStats(uId) {
  const evs  = S.events.filter(e => e.universeId === uId);
  const chars = new Set(evs.flatMap(e => e.characterIds || []));
  return { eventCount: evs.length, charCount: chars.size };
}
/* === TIMELINE ENGINE RENDER END === */

/* =====================================================
   TIMELINE ENGINE EXPORTS (soft extract — Prompt 2.4.A)
   Single registration point. Anything a future
   js/biography-timeline.js module would need to expose lives here.
   defineProperty getters/setters keep the live `let` bindings
   (TRACK_H, YEAR_MIN, YEAR_MAX) reactive. All wrapped in try/catch
   so a missing symbol can never break page load.
   ===================================================== */
try {
  /* Object references — same identity in both worlds */
  FT_BIO.state       = (typeof S    !== 'undefined') ? S    : null;
  FT_BIO.view        = (typeof V    !== 'undefined') ? V    : null;
  FT_BIO.modalStack  = (typeof MS   !== 'undefined') ? MS   : null;
  FT_BIO.modal       = (typeof M    !== 'undefined') ? M    : null;
  FT_BIO.palette     = (typeof PALETTE !== 'undefined') ? PALETTE : null;
  FT_BIO.store       = (typeof Store   !== 'undefined') ? Store   : null;
  FT_BIO.ui          = window.UI || null;

  /* Render entry points */
  FT_BIO.render          = (typeof render          === 'function') ? render          : null;
  FT_BIO.drawConnections = (typeof drawConnections === 'function') ? drawConnections : null;
  FT_BIO.drawEvents      = (typeof drawEvents      === 'function') ? drawEvents      : null;

  /* Live-binding accessors for mutable primitives */
  Object.defineProperty(FT_BIO, 'TRACK_H', {
    configurable: true,
    get: function(){ try { return TRACK_H; } catch(_){ return undefined; } },
    set: function(v){ try { TRACK_H  = v; } catch(_){} }
  });
  Object.defineProperty(FT_BIO, 'YEAR_MIN', {
    configurable: true,
    get: function(){ try { return YEAR_MIN; } catch(_){ return undefined; } },
    set: function(v){ try { YEAR_MIN = v; } catch(_){} }
  });
  Object.defineProperty(FT_BIO, 'YEAR_MAX', {
    configurable: true,
    get: function(){ try { return YEAR_MAX; } catch(_){ return undefined; } },
    set: function(v){ try { YEAR_MAX = v; } catch(_){} }
  });

  /* =====================================================
     ViewportController (Prompt 2.4.B)
     Thin adapter over the existing V.scale / V.panX engine.
     Exposes the spec API (centerMs, pxPerDay, dateToX, xToDate,
     pan, zoomAt, fitToData) plus persistence to localStorage
     'ft_bio_view_v1' on pointerup + wheel (debounced 300 ms).
     Restored on next tick so the user's last view survives F5.
     ===================================================== */
  var _VC_KEY = 'ft_bio_view_v1';
  var _MS_PER_YEAR = 365.25 * 86400 * 1000;
  function _yearToMs(y) { return (y - 1970) * _MS_PER_YEAR; }
  function _msToYear(ms) { return 1970 + ms / _MS_PER_YEAR; }

  var VC = {
    get pxPerYear()    { try { return BPPY * V.scale; } catch(_){ return 0; } },
    get pxPerDay()     { try { return (BPPY * V.scale) / 365.25; } catch(_){ return 0; } },
    get minPxPerDay()  { try { return (BPPY * getMinScale()) / 365.25; } catch(_){ return 0; } },
    get maxPxPerDay()  { try { return (BPPY * MAX_SC) / 365.25; } catch(_){ return 0; } },
    get centerYear()   { try { return OY + sw(centerX()) / BPPY; } catch(_){ return OY; } },
    get centerMs()     { try { return _yearToMs(this.centerYear); } catch(_){ return 0; } },

    dateToX: function(ms) {
      try { return ws(yw(_msToYear(ms))); } catch(_){ return 0; }
    },
    xToDate: function(px) {
      try { return _yearToMs(OY + sw(px) / BPPY); } catch(_){ return 0; }
    },

    pan: function(dxPx) {
      try {
        V.panX += (dxPx || 0);
        if (typeof clampPanX === 'function') clampPanX();
        if (typeof render === 'function') render();
      } catch(_){}
    },
    zoomAt: function(cursorX, factor) {
      try {
        if (typeof doZoom === 'function') doZoom(factor, cursorX);
      } catch(_){}
    },
    setCenterMs: function(ms) {
      try {
        var year = _msToYear(ms);
        V.panX = -yw(year) * V.scale;
        if (typeof clampPanX === 'function') clampPanX();
        if (typeof render === 'function') render();
      } catch(_){}
    },
    fitToData: function(events, paddingFraction) {
      try {
        var evs = (events && events.length) ? events
                : (FT_BIO.state && FT_BIO.state.events) ? FT_BIO.state.events
                : [];
        if (!evs.length) return false;
        var years = [];
        for (var i = 0; i < evs.length; i++) {
          var y = (typeof parseDate === 'function') ? parseDate(evs[i].date) : null;
          if (typeof y === 'number' && isFinite(y)) years.push(y);
        }
        if (!years.length) return false;
        var yMin = Math.min.apply(null, years);
        var yMax = Math.max.apply(null, years);
        var pad  = (paddingFraction != null ? paddingFraction : 0.05) * Math.max(1, yMax - yMin);
        var span = (yMax - yMin) + 2 * pad;
        var visW = (typeof timeAxisLength === 'function') ? timeAxisLength() : 0;
        if (visW <= 0 || span <= 0) return false;
        var newScale = clamp(visW / (span * BPPY), getMinScale(), MAX_SC);
        var cYear = (yMin + yMax) / 2;
        V.scale = newScale;
        V.panX  = -yw(cYear) * V.scale;
        if (typeof clampPanX === 'function') clampPanX();
        var z = document.getElementById('zoom-pct');
        if (z && typeof formatZoomPercent === 'function') z.textContent = formatZoomPercent();
        if (typeof render === 'function') render();
        return true;
      } catch(_){ return false; }
    },

    save: function() {
      try {
        localStorage.setItem(_VC_KEY, JSON.stringify({
          v: 1, ts: Date.now(),
          scale: V.scale, panX: V.panX, panY: V.panY
        }));
      } catch(_){}
    },
    restore: function() {
      try {
        var raw = localStorage.getItem(_VC_KEY);
        if (!raw) return false;
        var data = JSON.parse(raw);
        if (!data || typeof data.scale !== 'number' || typeof data.panX !== 'number') return false;
        var minSc = (typeof getMinScale === 'function') ? getMinScale() : 0.001;
        V.scale = clamp(data.scale, minSc, MAX_SC);
        V.panX  = data.panX;
        if (typeof data.panY === 'number') V.panY = data.panY;
        if (typeof clampPanX === 'function') clampPanX();
        if (typeof clampPanY === 'function') clampPanY();
        var z = document.getElementById('zoom-pct');
        if (z && typeof formatZoomPercent === 'function') z.textContent = formatZoomPercent();
        return true;
      } catch(_){ return false; }
    },
    clear: function() {
      try { localStorage.removeItem(_VC_KEY); } catch(_){}
    }
  };
  FT_BIO.ViewportController = VC;

  /* Wire debounced auto-save on pointerup + wheel (300 ms) */
  try {
    var _vcSaveTimer = null;
    var _vcQueueSave = function() {
      if (_vcSaveTimer) clearTimeout(_vcSaveTimer);
      _vcSaveTimer = setTimeout(function(){ VC.save(); }, 300);
    };
    var _vcCanvas = (typeof CV === 'function') ? CV() : document.getElementById('tl-canvas');
    if (_vcCanvas) {
      _vcCanvas.addEventListener('pointerup', _vcQueueSave, { passive: true });
      _vcCanvas.addEventListener('wheel',     _vcQueueSave, { passive: true });
    }
  } catch(_){}

  /* Restore last view on next tick (after initial render finishes) */
  try {
    setTimeout(function(){
      try {
        if (VC.restore() && typeof render === 'function') render();
      } catch(_){}
    }, 0);
  } catch(_){}

  FT_BIO._loaded = true;
} catch (_) {
  try { console.warn('[FT_BIO] export registration failed:', _); } catch(__){}
}


/* =====================================================
   PHASE 3 — Mobile UX glue (swipe-down + bottom-bar zoom-pct sync)
   ===================================================== */
(function setupMobileSwipeAndZoomSync() {
  function init() {
    /* Swipe-down-to-close on the event detail modal */
    const bg = document.getElementById('modal-bg');
    if (bg && !bg.__swipeDown) {
      bg.__swipeDown = true;
      let startY = 0, dy = 0, dragging = false, modal = null;
      bg.addEventListener('touchstart', function(e) {
        modal = bg.querySelector('.modal') || bg.querySelector('#modal');
        if (!modal || e.touches.length !== 1) return;
        if (modal.scrollTop > 4) return;
        startY = e.touches[0].clientY; dy = 0; dragging = true;
        modal.style.transition = 'none';
      }, { passive: true });
      bg.addEventListener('touchmove', function(e) {
        if (!dragging || !modal) return;
        dy = e.touches[0].clientY - startY;
        if (dy < 0) dy = 0;
        modal.style.transform = 'translateY(' + dy + 'px)';
        if (dy > 8) bg.style.background = 'rgba(0,0,0,' + Math.max(0.15, 0.55 - dy / 600) + ')';
      }, { passive: true });
      bg.addEventListener('touchend', function() {
        if (!dragging || !modal) return;
        dragging = false;
        modal.style.transition = 'transform 0.18s ease';
        bg.style.background = '';
        if (dy > 120) {
          modal.style.transform = 'translateY(100%)';
          setTimeout(function() {
            try { if (window.M && M.close) M.close(); } catch(_) {}
            modal.style.transition = ''; modal.style.transform = '';
          }, 180);
        } else {
          modal.style.transform = '';
        }
      });
    }

    /* Mirror the desktop #zoom-pct readout into the mobile bottom-bar #bb-zoom-pct */
    const desktop = document.getElementById('zoom-pct');
    const mobile  = document.getElementById('bb-zoom-pct');
    if (desktop && mobile) {
      const sync = function() { mobile.textContent = desktop.textContent; };
      sync();
      try {
        new MutationObserver(sync).observe(desktop, { childList: true, characterData: true, subtree: true });
      } catch(_) {}
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();


/* =====================================================
   MINIMAP (ported from Universe — A-1)
   -----------------------------------------------------
   Adds a 100px minimap fixed at the bottom of #canvas-wrap.
   Renders one 1px dot per event coloured by its life track and
   a translucent rectangle showing the current viewport. Drag
   the rectangle to pan; drag its left/right edges to zoom.
   On viewports <600px the minimap is hidden via CSS and the
   #minimap-jump "Jump to year" input takes its place.
   ===================================================== */
(function setupMinimap() {
  function init() {
    const host = document.getElementById('minimap');
    const cnv  = document.getElementById('minimap-canvas');
    const jumpInput = document.getElementById('jump-year-input');
    const jumpGo    = document.getElementById('jump-year-go');
    if (!cnv) return;

    const g = cnv.getContext('2d');
    const EDGE = 6;        // px hit zone for the resize handles
    let lastRect = null;
    let yearMin = OY - 5, yearMax = OY + 5;
    let mode = null;       // null | 'pan' | 'resize-l' | 'resize-r'
    let startX = 0, startLeftYr = 0, startRightYr = 0, startCenterYr = 0;
    let startScale = 1, startPanX = 0;

    function getEventDecYear(ev) {
      try { return parseDate(ev.date, ev.time); } catch(_) { return null; }
    }

    function recomputeRange() {
      const evs = (S && S.events) ? S.events : [];
      let lo = Infinity, hi = -Infinity;
      evs.forEach(ev => {
        const y = getEventDecYear(ev);
        if (y == null || !isFinite(y)) return;
        if (y < lo) lo = y;
        if (y > hi) hi = y;
      });
      if (!isFinite(lo) || !isFinite(hi) || lo === hi) {
        const c = sy2yr(timeAxisStart() + timeAxisLength() / 2);
        lo = c - 10; hi = c + 10;
      }
      const pad = Math.max(1, (hi - lo) * 0.05);
      yearMin = lo - pad; yearMax = hi + pad;
    }

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const r = cnv.getBoundingClientRect();
      const w = Math.max(50, Math.floor(r.width));
      const h = Math.max(40, Math.floor(r.height));
      cnv.width  = Math.floor(w * dpr);
      cnv.height = Math.floor(h * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }

    function visibleYearRange() {
      const a = timeAxisStart();
      const b = a + timeAxisLength();
      let yA = sy2yr(a), yB = sy2yr(b);
      if (yA > yB) { const t = yA; yA = yB; yB = t; }
      return [yA, yB];
    }

    function yrToPx(y, w) {
      const span = Math.max(0.0001, yearMax - yearMin);
      return ((y - yearMin) / span) * w;
    }

    function pxToYr(px, w) {
      return yearMin + (px / Math.max(1, w)) * (yearMax - yearMin);
    }

    function niceStep(rough) {
      if (!isFinite(rough) || rough <= 0) return 1;
      const pow = Math.pow(10, Math.floor(Math.log10(rough)));
      const n = rough / pow;
      let nice;
      if (n < 1.5) nice = 1;
      else if (n < 3) nice = 2;
      else if (n < 7) nice = 5;
      else nice = 10;
      return nice * pow;
    }

    function draw() {
      if (!host || host.offsetParent === null) return; // hidden by CSS
      recomputeRange();
      const w = cnv.clientWidth, h = cnv.clientHeight;
      g.clearRect(0, 0, w, h);

      // Backdrop — warm parchment to match Bio palette
      g.fillStyle = '#fffaf0';
      g.fillRect(0, 0, w, h);

      // Lane stripes per visible track (Bio: lifeTracks; Uni fallback: universes)
      const tracks = (S.lifeTracks || S.universes || []).filter(u => u.visible !== false);
      const laneH = tracks.length > 0 ? (h - 6) / tracks.length : (h - 6);
      tracks.forEach((u, i) => {
        const y = 3 + i * laneH;
        g.fillStyle = (u.color || '#b07942') + '22';
        g.fillRect(0, y, w, laneH);
      });

      // Year tick lines
      const span = yearMax - yearMin;
      const step = niceStep(span / 6);
      g.strokeStyle = '#e8dcc8';
      g.lineWidth = 1;
      for (let y = Math.ceil(yearMin / step) * step; y <= yearMax; y += step) {
        const x = Math.round(yrToPx(y, w)) + 0.5;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
      }

      // Event dots, 1px, coloured by track
      const trackColor = {};
      tracks.forEach((u, i) => trackColor[u.id] = { color: u.color || '#b07942', idx: i });
      const evs = (S && S.events) ? S.events : [];
      for (let i = 0; i < evs.length; i++) {
        const ev = evs[i];
        const tInfo = trackColor[ev.universeId];
        if (!tInfo) continue;
        const y = getEventDecYear(ev);
        if (y == null || !isFinite(y)) continue;
        const px = yrToPx(y, w);
        const py = 3 + tInfo.idx * laneH + laneH / 2;
        g.fillStyle = tInfo.color;
        g.fillRect(Math.floor(px), Math.floor(py - 1), 2, 2);
      }

      // Viewport rectangle — bio accent (warm amber)
      const [vA, vB] = visibleYearRange();
      const lx = Math.max(0, Math.min(w, yrToPx(vA, w)));
      const rx = Math.max(0, Math.min(w, yrToPx(vB, w)));
      g.fillStyle = 'rgba(176, 121, 66, 0.18)';
      g.fillRect(lx, 0, Math.max(2, rx - lx), h);
      g.strokeStyle = 'rgba(176, 121, 66, 0.85)';
      g.lineWidth = 1;
      g.strokeRect(Math.round(lx) + 0.5, 0.5, Math.max(1, Math.round(rx - lx) - 1), h - 1);
      // Edge handles
      g.fillStyle = 'rgba(176, 121, 66, 0.85)';
      g.fillRect(Math.round(lx),     0, 2, h);
      g.fillRect(Math.round(rx) - 2, 0, 2, h);

      lastRect = { leftPx: lx, rightPx: rx, w: w, h: h };
    }

    /* === Apply pan / zoom to the main timeline === */
    function panToCenterYear(centerYr) {
      V.panX = -yw(centerYr) * V.scale;
      if (typeof clampPanX === 'function') clampPanX();
      if (typeof render === 'function') render();
      const zp = document.getElementById('zoom-pct');
      if (zp && typeof formatZoomPercent === 'function') zp.textContent = formatZoomPercent();
      else if (zp) zp.textContent = Math.round(V.scale * 100) + '%';
    }

    function setVisibleRange(leftYr, rightYr) {
      if (rightYr <= leftYr) rightYr = leftYr + 0.001;
      const span = rightYr - leftYr;
      const minSc = (typeof getMinScale === 'function') ? getMinScale() : 0.0001;
      const targetScale = Math.max(minSc, Math.min(MAX_SC, timeAxisLength() / (span * BPPY)));
      V.scale = targetScale;
      panToCenterYear((leftYr + rightYr) / 2);
    }

    /* === Pointer interaction on the minimap === */
    function localX(e) {
      const r = cnv.getBoundingClientRect();
      return Math.max(0, Math.min(r.width, e.clientX - r.left));
    }

    cnv.addEventListener('pointerdown', e => {
      if (!lastRect) return;
      const x = localX(e);
      const w = lastRect.w;
      cnv.setPointerCapture(e.pointerId);
      startX = x;
      startScale = V.scale;
      startPanX  = V.panX;
      const [vA, vB] = visibleYearRange();
      startLeftYr = vA; startRightYr = vB; startCenterYr = (vA + vB) / 2;

      if (Math.abs(x - lastRect.leftPx)  <= EDGE) {
        mode = 'resize-l'; host.classList.add('mm-resize-w');
      } else if (Math.abs(x - lastRect.rightPx) <= EDGE) {
        mode = 'resize-r'; host.classList.add('mm-resize-w');
      } else if (x >= lastRect.leftPx && x <= lastRect.rightPx) {
        mode = 'pan'; host.classList.add('mm-grabbing');
      } else {
        const yr = pxToYr(x, w);
        panToCenterYear(yr);
        mode = 'pan'; host.classList.add('mm-grabbing');
        startX = x;
        const [a, b] = visibleYearRange();
        startCenterYr = (a + b) / 2;
        startLeftYr = a; startRightYr = b;
      }
      e.preventDefault();
    });

    cnv.addEventListener('pointermove', e => {
      if (!mode || !lastRect) return;
      const w = lastRect.w;
      const dxPx = localX(e) - startX;
      const dxYr = (dxPx / Math.max(1, w)) * (yearMax - yearMin);

      if (mode === 'pan') {
        panToCenterYear(startCenterYr + dxYr);
      } else if (mode === 'resize-l') {
        const newLeft  = Math.min(startRightYr - 0.001, startLeftYr + dxYr);
        setVisibleRange(newLeft, startRightYr);
      } else if (mode === 'resize-r') {
        const newRight = Math.max(startLeftYr + 0.001, startRightYr + dxYr);
        setVisibleRange(startLeftYr, newRight);
      }
      e.preventDefault();
    });

    function endDrag(e) {
      if (!mode) return;
      mode = null;
      host.classList.remove('mm-grabbing', 'mm-resize-w');
      try { cnv.releasePointerCapture(e.pointerId); } catch(_) {}
    }
    cnv.addEventListener('pointerup',     endDrag);
    cnv.addEventListener('pointercancel', endDrag);

    /* === Jump-to-year input (mobile fallback) === */
    function doJump() {
      const v = parseFloat(jumpInput && jumpInput.value);
      if (!isFinite(v)) return;
      panToCenterYear(v);
    }
    if (jumpGo)    jumpGo.addEventListener('click', doJump);
    if (jumpInput) jumpInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); doJump(); }
    });

    /* === Wire into the main render loop === */
    if (typeof window.render === 'function' && !window.render.__minimap) {
      const _orig = window.render;
      window.render = function() {
        const out = _orig.apply(this, arguments);
        try { draw(); } catch(_) {}
        return out;
      };
      window.render.__minimap = true;
    } else if (typeof render === 'function' && !render.__minimap) {
      const _orig = render;
      render = function() {
        const out = _orig.apply(this, arguments);
        try { draw(); } catch(_) {}
        return out;
      };
      render.__minimap = true;
    }

    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(resize).observe(cnv);
    }
    window.addEventListener('resize', resize);
    resize();
    draw();
    window.__minimapDraw = draw;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();


/* =====================================================
   JUMP-TO-YEAR (ported from Universe — A-2)
   -----------------------------------------------------
   Toolbar #jump-btn opens a prompt; accepts plain years,
   negative years for BC/BCE, or "500 BC" / "1969 AD".
   Pans (without changing zoom) to the requested year.
   The mobile #minimap-jump input is wired separately by
   the minimap module (A-1).
   ===================================================== */
(function setupJumpToYear() {
  function jumpToYear() {
    const raw = prompt('Jump to year (use a negative number for BC, e.g. -3000 for 3000 BC):', '');
    if (raw == null) return;
    const s = String(raw).trim();
    if (!s) return;
    const m = s.match(/^(-?\d+(?:\.\d+)?)(?:\s*(BC|AD|BCE|CE))?$/i);
    if (!m) {
      if (typeof notify === 'function') notify('Please enter a valid year, e.g. 1969, -3000, or "500 BC".', 'error');
      else alert('Please enter a valid year, e.g. 1969, -3000, or "500 BC".');
      return;
    }
    let y = parseFloat(m[1]);
    const era = (m[2] || '').toUpperCase();
    if ((era === 'BC' || era === 'BCE') && y > 0) y = -y;
    if (!isFinite(y)) return;
    V.panX = -yw(y) * V.scale;
    if (typeof clampPanX === 'function') clampPanX();
    if (typeof render === 'function') render();
    const zp = document.getElementById('zoom-pct');
    if (zp) zp.textContent = (typeof formatZoomPercent === 'function')
      ? formatZoomPercent()
      : Math.round(V.scale * 100) + '%';
  }

  // Attach to the existing UI namespace (defined at B.js:5025).
  if (typeof window !== 'undefined') {
    window.UI = window.UI || {};
    window.UI.jumpToYear = jumpToYear;
  }
})();


/* =====================================================
   STORY LINE OVERLAY (ported from Universe — A-3)
   -----------------------------------------------------
   Renders a connected wave through every visible event in
   chronological order. Toggle on/off via the #story-line-btn
   toolbar button. Hooked into render() above the call to
   drawEvents() (see the if-check around drawStoryLine).
   Bio retheming: warm sepia tones in place of Universe's
   cobalt blues.
   ===================================================== */
var _storyLineVisible = false;

function toggleStoryLine() {
  _storyLineVisible = !_storyLineVisible;
  const btn = document.getElementById('story-line-btn');
  if (btn) {
    if (_storyLineVisible) {
      btn.style.background = '#b07942';
      btn.style.borderColor = '#8b5e2e';
      btn.style.color = '#fff';
      btn.style.fontWeight = '700';
    } else {
      btn.style.background = '';
      btn.style.borderColor = '';
      btn.style.color = '';
      btn.style.fontWeight = '';
    }
  }
  if (typeof render === 'function') render();
}

function drawStoryLine(c, g) {
  if (typeof isVerticalTimelineLayout === 'function' && isVerticalTimelineLayout()) return;
  if (!S || !S.events || S.events.length === 0) return;

  const allEvs = S.events.concat(typeof expandRecurringEvents === 'function' ? expandRecurringEvents() : []);

  const pts = [];
  allEvs.forEach(function(ev) {
    if (ev.isPhantom) return;
    const u = getU(ev.universeId);
    if (!u || u.visible === false) return;
    const dec = parseDate(ev.date, ev.time);
    if (dec === null) return;
    const vi = getVisIdx(ev.universeId);
    if (vi < 0) return;
    if (typeof _catFilter    !== 'undefined' && _catFilter    && ev.category !== _catFilter) return;
    if (typeof _tagFilter    !== 'undefined' && _tagFilter    && !(ev.tags||[]).includes(_tagFilter)) return;
    if (typeof _statusFilter !== 'undefined' && _statusFilter && (ev.status||'') !== _statusFilter) return;
    // Bio uses ev.emotionalTone (Universe uses ev.tone) — handle either.
    if (typeof _toneFilter   !== 'undefined' && _toneFilter   && (ev.emotionalTone || ev.tone || '') !== _toneFilter) return;
    const sx  = ws(yw(dec));
    const dir = (vi % 2 === 0) ? -1 : 1;   // -1 = spike UP, 1 = spike DOWN
    pts.push({ dec: dec, sx: sx, vi: vi, dir: dir, color: u.color, ev: ev });
  });

  if (pts.length === 0) return;
  pts.sort(function(a, b) { return a.dec - b.dec; });

  const baseY   = RULER_H + (c.height - RULER_H) / 2;
  const maxH    = Math.min(72, (c.height - RULER_H) * 0.30);
  const W       = c.width;
  const STEP    = 2;

  // Adaptive sigma based on median spacing between adjacent events.
  var spacings = [];
  for (var k = 1; k < pts.length; k++) spacings.push(Math.abs(pts[k].sx - pts[k-1].sx));
  spacings.sort(function(a,b){return a-b;});
  var medSpacing = spacings.length ? spacings[Math.floor(spacings.length/2)] : 120;
  var sigma = Math.max(28, Math.min(60, medSpacing * 0.32));

  // Sample the waveform.
  var samples = [];
  for (var x = LEFT_W; x <= W; x += STEP) {
    var wv = 0;
    for (var j = 0; j < pts.length; j++) {
      var dx = x - pts[j].sx;
      wv += pts[j].dir * Math.exp(-(dx*dx) / (2*sigma*sigma));
    }
    samples.push({ x: x, wv: wv });
  }

  // Normalize so the loudest peak hits maxH.
  var maxAbs = 0;
  for (var s = 0; s < samples.length; s++) {
    var a = Math.abs(samples[s].wv);
    if (a > maxAbs) maxAbs = a;
  }
  if (maxAbs < 0.001) maxAbs = 1;
  var scale = maxH / maxAbs;

  g.save();

  // --- Colour gradient for the line ---
  var gradX0 = pts[0].sx, gradX1 = pts[pts.length-1].sx;
  if (Math.abs(gradX1 - gradX0) < 4) gradX1 = gradX0 + 4;
  var lineGrad;
  try {
    lineGrad = g.createLinearGradient(gradX0, 0, gradX1, 0);
    if (pts.length === 1) {
      lineGrad.addColorStop(0, pts[0].color);
      lineGrad.addColorStop(1, pts[0].color);
    } else {
      pts.forEach(function(pt, i) {
        var t = (gradX1 === gradX0) ? 0 : (pt.sx - gradX0) / (gradX1 - gradX0);
        t = Math.max(0, Math.min(1, t));
        lineGrad.addColorStop(t, pt.color);
      });
    }
  } catch(e) { lineGrad = '#b07942'; }

  function buildPath() {
    g.beginPath();
    for (var s = 0; s < samples.length; s++) {
      var sx2 = samples[s].x;
      var sy2 = baseY + samples[s].wv * scale;
      if (s === 0) g.moveTo(sx2, sy2); else g.lineTo(sx2, sy2);
    }
  }

  // Fill above-baseline area
  buildPath();
  g.lineTo(W, baseY);
  g.lineTo(LEFT_W, baseY);
  g.closePath();
  g.globalAlpha = 0.10;
  g.fillStyle = lineGrad;
  g.fill();

  // Shadow / glow — warm sepia (Bio retheme of Universe's cobalt).
  g.globalAlpha = 0.14;
  g.strokeStyle = 'rgba(120, 70, 30, 0.8)';
  g.lineWidth = 8;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  buildPath();
  g.stroke();

  // Baseline rule — warm tan.
  g.globalAlpha = 0.22;
  g.strokeStyle = '#c4956a';
  g.lineWidth = 1;
  g.setLineDash([4, 8]);
  g.beginPath();
  g.moveTo(LEFT_W, baseY);
  g.lineTo(W, baseY);
  g.stroke();
  g.setLineDash([]);

  // Main wave line
  g.globalAlpha = 0.88;
  g.strokeStyle = lineGrad;
  g.lineWidth = 2.5;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  buildPath();
  g.stroke();

  // White shimmer on top
  g.globalAlpha = 0.28;
  g.strokeStyle = '#ffffff';
  g.lineWidth = 1;
  buildPath();
  g.stroke();

  // --- Dots + labels at each event's peak ---
  g.globalAlpha = 1;
  pts.forEach(function(pt, i) {
    var peakY = baseY + pt.dir * maxH;

    // Vertical drop line
    g.globalAlpha = 0.20;
    g.strokeStyle = pt.color;
    g.lineWidth = 1;
    g.setLineDash([3, 4]);
    g.beginPath();
    g.moveTo(pt.sx, baseY);
    g.lineTo(pt.sx, peakY);
    g.stroke();
    g.setLineDash([]);

    // Glow ring
    g.globalAlpha = 0.22;
    g.beginPath();
    g.arc(pt.sx, peakY, 11, 0, Math.PI * 2);
    g.fillStyle = pt.color;
    g.fill();

    // Dot
    g.globalAlpha = 1;
    g.beginPath();
    g.arc(pt.sx, peakY, 6, 0, Math.PI * 2);
    g.fillStyle = pt.color;
    g.fill();
    g.strokeStyle = '#fff';
    g.lineWidth = 1.8;
    g.stroke();

    // Label pill (above peak if up, below if down)
    var labelY = (pt.dir === -1) ? peakY - 14 : peakY + 20;
    var label  = pt.ev.title.length > 16 ? pt.ev.title.slice(0,15) + '\u2026' : pt.ev.title;
    g.font = 'bold 9px -apple-system,sans-serif';
    g.textAlign = 'center';
    var tw = g.measureText(label).width;
    g.globalAlpha = 0.72;
    g.fillStyle = pt.color;
    var pillH = 14, pillW = tw + 10;
    g.beginPath();
    if (g.roundRect) g.roundRect(pt.sx - pillW/2, labelY - pillH + 3, pillW, pillH, 7);
    else             g.rect(pt.sx - pillW/2, labelY - pillH + 3, pillW, pillH);
    g.fill();

    g.globalAlpha = 1;
    g.fillStyle = '#ffffff';
    g.fillText(label, pt.sx, labelY);
  });

  g.textBaseline = 'alphabetic';
  g.globalAlpha = 1;
  g.restore();
}

if (typeof window !== 'undefined') {
  window.toggleStoryLine = toggleStoryLine;
  window.drawStoryLine = drawStoryLine;
}


/* =====================================================
   FIT TO DATA — UI.fitToData (ported from Universe — A-4)
   -----------------------------------------------------
   Frames the visible event range with 5% padding (rather
   than zooming all the way out). Called by the toolbar
   #fit-btn. Falls back to resetView when the timeline is
   empty.
   ===================================================== */
(function setupFitToData() {
  function fitToData() {
    try {
      const evs = (S && S.events) ? S.events : [];
      const years = [];
      evs.forEach(function(ev) {
        try { const y = parseDate(ev.date, ev.time); if (isFinite(y)) years.push(y); } catch(_){}
      });
      if (!years.length) { resetView(); return; }
      const yMin = Math.min.apply(null, years);
      const yMax = Math.max.apply(null, years);
      const pad  = 0.05 * Math.max(1, yMax - yMin);
      const span = (yMax - yMin) + 2 * pad;
      const visW = timeAxisLength();
      if (visW <= 0 || span <= 0) return;
      V.scale = clamp(visW / (span * BPPY), getMinScale(), MAX_SC);
      V.panX  = -yw((yMin + yMax) / 2) * V.scale;
      if (typeof clampPanX === 'function') clampPanX();
      const z = document.getElementById('zoom-pct');
      if (z) z.textContent = (typeof formatZoomPercent === 'function')
        ? formatZoomPercent() : Math.round(V.scale * 100) + '%';
      if (typeof render === 'function') render();
    } catch(_) {}
  }

  if (typeof window !== 'undefined') {
    window.UI = window.UI || {};
    window.UI.fitToData = fitToData;
    window.fitFullTimeline = window.fitFullTimeline || fitFullTimeline;
  }
})();


/* =====================================================
   SHARE VIEW + URL HASH STATE (ported from Universe — A-5)
   -----------------------------------------------------
   - UI.shareView(): copies a #date=…&zoom=…&tracks=… URL
     to the clipboard so the current pan/zoom/track-visibility
     can be restored from a link.
   - setupHashState(): on load, parses the same hash and
     restores the view; on each render() (debounced 300 ms),
     writes the current view back to the address bar.
   Bio uses S.lifeTracks where Universe uses S.universes —
   the helpers fall back to either.
   ===================================================== */
(function setupShareView() {
  function tracksList() {
    const list = (S && (S.lifeTracks || S.universes)) || [];
    return list.filter(function(u) { return u.visible !== false; })
               .map(function(u) { return u.id; })
               .join(',');
  }

  function buildShareHash() {
    const cy = (typeof OY === 'number' ? OY : 2000) + (sw(centerX()) / BPPY);
    const tracks = tracksList();
    return '#date=' + encodeURIComponent(cy.toFixed(3)) +
           '&zoom=' + encodeURIComponent(V.scale.toFixed(4)) +
           (tracks ? '&tracks=' + encodeURIComponent(tracks) : '');
  }

  function shareView() {
    try {
      const hash = buildShareHash();
      const url = location.origin + location.pathname + hash;
      const after = function(ok) {
        const btn = document.getElementById('share-btn');
        if (!btn) return;
        const orig = btn.textContent;
        btn.textContent = ok ? '\u2713 Copied' : '\u26A0 ' + url;
        btn.disabled = true;
        setTimeout(function() { btn.textContent = orig; btn.disabled = false; }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function(){ after(true); }, function(){ after(false); });
      } else {
        const ta = document.createElement('textarea');
        ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        let ok = false; try { ok = document.execCommand('copy'); } catch(_){}
        document.body.removeChild(ta); after(ok);
      }
      try { history.replaceState(null, '', hash); } catch(_) {}
    } catch(_) {}
  }

  if (typeof window !== 'undefined') {
    window.UI = window.UI || {};
    window.UI.shareView = shareView;
  }
})();

/* === URL hash state (load-restore + render-write) ===== */
(function setupHashState() {
  const KEY = '__ftHashState';
  if (window[KEY]) return;
  window[KEY] = true;

  let suppressWrite = false;
  let writeTimer = null;

  function parseHash() {
    const h = (location.hash || '').replace(/^#/, '');
    if (!h) return null;
    const out = {};
    h.split('&').forEach(function(p) {
      const kv = p.split('=');
      const k = kv[0], v = kv[1];
      if (k) out[decodeURIComponent(k)] = v == null ? '' : decodeURIComponent(v);
    });
    return out;
  }

  function applyHash() {
    const p = parseHash();
    if (!p) return false;
    let touched = false;

    if (p.tracks != null) {
      const ids = new Set(p.tracks.split(',').filter(Boolean));
      const list = (S && (S.lifeTracks || S.universes)) || [];
      list.forEach(function(u) {
        const want = ids.size === 0 ? true : ids.has(u.id);
        if (u.visible !== want) { u.visible = want; touched = true; }
      });
    }
    if (p.zoom != null && isFinite(parseFloat(p.zoom))) {
      const z = clamp(parseFloat(p.zoom), getMinScale(), MAX_SC);
      if (z !== V.scale) { V.scale = z; touched = true; }
    }
    if (p.date != null && isFinite(parseFloat(p.date))) {
      const y = parseFloat(p.date);
      V.panX = -yw(y) * V.scale;
      if (typeof clampPanX === 'function') clampPanX();
      touched = true;
    }
    if (touched) {
      const z = document.getElementById('zoom-pct');
      if (z && typeof formatZoomPercent === 'function') z.textContent = formatZoomPercent();
      if (typeof render === 'function') render();
    }
    return touched;
  }

  function buildHash() {
    try {
      const cy = (typeof OY === 'number' ? OY : 2000) + (sw(centerX()) / BPPY);
      const list = (S && (S.lifeTracks || S.universes)) || [];
      const tracks = list.filter(function(u){return u.visible !== false;})
                         .map(function(u){return u.id;}).join(',');
      return '#date=' + encodeURIComponent(cy.toFixed(3)) +
             '&zoom=' + encodeURIComponent(V.scale.toFixed(4)) +
             (tracks ? '&tracks=' + encodeURIComponent(tracks) : '');
    } catch(_) { return ''; }
  }

  function writeHash() {
    if (suppressWrite) return;
    clearTimeout(writeTimer);
    writeTimer = setTimeout(function() {
      try {
        const h = buildHash();
        if (h && h !== location.hash) history.replaceState(null, '', h);
      } catch(_) {}
    }, 300);
  }

  function init() {
    suppressWrite = true;
    try { applyHash(); } finally {
      setTimeout(function() { suppressWrite = false; writeHash(); }, 0);
    }

    if (typeof render === 'function' && !render.__hashSync) {
      const _orig = render;
      render = function() {
        const out = _orig.apply(this, arguments);
        try { writeHash(); } catch(_) {}
        return out;
      };
      render.__hashSync = true;
    }

    window.addEventListener('hashchange', function() {
      suppressWrite = true;
      try { applyHash(); } finally { setTimeout(function() { suppressWrite = false; }, 0); }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();


/* =====================================================
   LIFE-TRACK ROW REORDER (ported from Universe — A-6)
   -----------------------------------------------------
   Drag a track header (in the left panel) up or down to
   reorder S.lifeTracks. Hit-tests on action buttons
   ('u-hide'/'u-edit'/'u-info'/'u-del') are skipped so
   their clicks still fire normally.
   ===================================================== */
var lifeTrackDrag = { on: false, id: null, sy: 0, moved: false };

function getLifeTrackRowAt(mx, my) {
  if (typeof isVerticalTimelineLayout === 'function' && isVerticalTimelineLayout()) return null;
  if (mx < 0 || mx > LEFT_W || my < RULER_H) return null;
  let vi = 0;
  const list = (S && (S.lifeTracks || S.universes)) || [];
  for (let i = 0; i < list.length; i++) {
    const u = list[i];
    if (u.visible === false) continue;
    const ty  = trackY(vi);
    const top = ty - TRACK_H / 2;
    const bot = ty + TRACK_H / 2;
    if (my >= top && my <= bot) return { id: u.id, vi: vi };
    vi++;
  }
  return null;
}

function isLifeTrackActionTarget(mx, my) {
  if (typeof hits === 'undefined' || !hits) return false;
  return hits.some(function(t) {
    return (t.type === 'u-hide' || t.type === 'u-edit' || t.type === 'u-info' || t.type === 'u-del')
        && mx >= t.x && mx <= t.x + t.w
        && my >= t.y && my <= t.y + t.h;
  });
}

function visibleIndexFromClientY(clientY) {
  const c = CV();
  const r = c.getBoundingClientRect();
  const my = clientY - r.top;
  const idx = Math.floor((my - RULER_H - V.panY) / TRACK_H);
  return clamp(idx, 0, Math.max(0, visCount() - 1));
}

function startLifeTrackDrag(uId, clientY) {
  lifeTrackDrag = { on: true, id: uId, sy: clientY, moved: false };
  const c = CV(); if (c) c.classList.add('dragging');
}

function moveLifeTrackToVisibleIndex(uId, targetVisIdx) {
  const list = (S && (S.lifeTracks || S.universes));
  if (!list) return false;
  const fromIdx = list.findIndex(function(u){ return u.id === uId; });
  if (fromIdx < 0) return false;
  const currentVisIdx = (typeof getVisIdx === 'function') ? getVisIdx(uId) : -1;
  if (currentVisIdx === targetVisIdx) return false;
  const moving = list.splice(fromIdx, 1)[0];
  const visibleAfter = list.filter(function(u){ return u.visible !== false; });
  if (targetVisIdx >= visibleAfter.length) {
    list.push(moving);
  } else {
    const beforeId = visibleAfter[targetVisIdx].id;
    const insertIdx = list.findIndex(function(u){ return u.id === beforeId; });
    list.splice(insertIdx, 0, moving);
  }
  return true;
}

function updateLifeTrackDrag(clientY) {
  if (!lifeTrackDrag.on || !lifeTrackDrag.id) return;
  if (Math.abs(clientY - lifeTrackDrag.sy) > 4) lifeTrackDrag.moved = true;
  const targetVisIdx = visibleIndexFromClientY(clientY);
  if (moveLifeTrackToVisibleIndex(lifeTrackDrag.id, targetVisIdx)) {
    if (typeof render === 'function') render();
    if (typeof updateUniToggleBar === 'function') updateUniToggleBar();
  }
}

function finishLifeTrackDrag() {
  const didMove = lifeTrackDrag.moved;
  lifeTrackDrag = { on: false, id: null, sy: 0, moved: false };
  const c = CV(); if (c) c.classList.remove('dragging');
  if (didMove) {
    try { if (typeof Store !== 'undefined' && Store.autosave) Store.autosave(); } catch(_){}
    if (typeof render === 'function') render();
    if (typeof updateUniToggleBar === 'function') updateUniToggleBar();
    if (typeof notify === 'function') notify('Life track order updated \u2713', 'success');
  }
}

if (typeof window !== 'undefined') {
  window.getLifeTrackRowAt        = getLifeTrackRowAt;
  window.isLifeTrackActionTarget  = isLifeTrackActionTarget;
  window.startLifeTrackDrag       = startLifeTrackDrag;
  window.updateLifeTrackDrag      = updateLifeTrackDrag;
  window.finishLifeTrackDrag      = finishLifeTrackDrag;
  window.moveLifeTrackToVisibleIndex = moveLifeTrackToVisibleIndex;
}


/* =====================================================
   LIFE-TRACK VERTICAL SCROLLBAR (ported from Universe — A-7)
   -----------------------------------------------------
   Custom scrollbar for the vertical (track) axis. Visible
   only when the total track height exceeds the canvas
   viewport. Drag the thumb or click the bar to scroll.
   Renamed from #uni-scrollbar to #track-scrollbar so it
   reads naturally for the Bio app.
   ===================================================== */
var _trackSbDrag = false;
var _trackSbDragStartY = 0;
var _trackSbDragStartPanY = 0;

function updateTrackScrollbar() {
  const bar = document.getElementById('track-scrollbar');
  const thumb = document.getElementById('track-scrollbar-thumb');
  if (!bar || !thumb) return;

  const c = CV();
  if (!c) return;
  const viewH = c.height - RULER_H;
  const totalH = visCount() * TRACK_H + 24;

  if (totalH <= viewH) {
    bar.classList.remove('visible');
    return;
  }
  bar.classList.add('visible');

  const barH = bar.clientHeight;
  if (barH <= 0) return;

  const ratio = viewH / totalH;
  const thumbH = Math.max(20, Math.round(barH * ratio));
  thumb.style.height = thumbH + 'px';

  const minPY = Math.min(0, viewH - totalH);
  const scrollFrac = minPY === 0 ? 0 : V.panY / minPY;
  const maxThumbTop = barH - thumbH;
  thumb.style.top = Math.round(scrollFrac * maxThumbTop) + 'px';
}

function initTrackScrollbar() {
  const bar = document.getElementById('track-scrollbar');
  const thumb = document.getElementById('track-scrollbar-thumb');
  if (!bar || !thumb) return;

  thumb.addEventListener('mousedown', function(e) {
    e.preventDefault();
    e.stopPropagation();
    _trackSbDrag = true;
    _trackSbDragStartY = e.clientY;
    _trackSbDragStartPanY = V.panY;
    bar.classList.add('dragging');
  });

  window.addEventListener('mousemove', function(e) {
    if (!_trackSbDrag) return;
    e.preventDefault();
    const dy = e.clientY - _trackSbDragStartY;
    const barEl = document.getElementById('track-scrollbar');
    const thumbEl = document.getElementById('track-scrollbar-thumb');
    const barH = barEl.clientHeight;
    const thumbH = thumbEl.clientHeight;
    const maxThumbTop = barH - thumbH;
    if (maxThumbTop <= 0) return;

    const c = CV();
    const viewH = c.height - RULER_H;
    const totalH = visCount() * TRACK_H + 24;
    const minPY = Math.min(0, viewH - totalH);

    const newFrac = clamp((_trackSbDragStartPanY / (minPY || -1)) + dy / maxThumbTop, 0, 1);
    V.panY = newFrac * minPY;
    if (typeof clampPanY === 'function') clampPanY();
    if (typeof render === 'function') render();
    updateTrackScrollbar();
  });

  window.addEventListener('mouseup', function() {
    if (_trackSbDrag) {
      _trackSbDrag = false;
      bar.classList.remove('dragging');
    }
  });

  bar.addEventListener('click', function(e) {
    if (e.target === thumb) return;
    const barRect = bar.getBoundingClientRect();
    const clickY = e.clientY - barRect.top;
    const barH = bar.clientHeight;
    const thumbEl = document.getElementById('track-scrollbar-thumb');
    const thumbH = thumbEl.clientHeight;
    const maxThumbTop = barH - thumbH;
    if (maxThumbTop <= 0) return;

    const c = CV();
    const viewH = c.height - RULER_H;
    const totalH = visCount() * TRACK_H + 24;
    const minPY = Math.min(0, viewH - totalH);

    const targetCenter = clickY - thumbH / 2;
    const frac = clamp(targetCenter / maxThumbTop, 0, 1);
    V.panY = frac * minPY;
    if (typeof clampPanY === 'function') clampPanY();
    if (typeof render === 'function') render();
    updateTrackScrollbar();
  });

  updateTrackScrollbar();
}

/* Wire into the main render loop so the thumb stays in sync
   with any pan/zoom/track-toggle change (matches Universe's
   pattern of calling updateUniverseScrollbar after every
   render-affecting action). */
(function hookTrackScrollbar() {
  function init() {
    initTrackScrollbar();
    if (typeof window !== 'undefined' && typeof window.render === 'function' && !window.render.__trackSb) {
      const _orig = window.render;
      window.render = function() {
        const out = _orig.apply(this, arguments);
        try { updateTrackScrollbar(); } catch(_) {}
        return out;
      };
      window.render.__trackSb = true;
    } else if (typeof render === 'function' && !render.__trackSb) {
      const _orig = render;
      render = function() {
        const out = _orig.apply(this, arguments);
        try { updateTrackScrollbar(); } catch(_) {}
        return out;
      };
      render.__trackSb = true;
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

if (typeof window !== 'undefined') {
  window.updateTrackScrollbar    = updateTrackScrollbar;
  window.initTrackScrollbar      = initTrackScrollbar;
  // Also expose under Universe's original name so any third-party hooks keep working.
  window.updateUniverseScrollbar = window.updateUniverseScrollbar || updateTrackScrollbar;
}


/* =====================================================
   STRUCTURED TONE SYSTEM (ported from Universe — A-8)
   -----------------------------------------------------
   Universe defines TONE_OPTIONS / TONE_COLORS / TONE_ICONS
   as a single source of truth. Bio previously had two
   scattered toneColors maps (one inline in the detail
   modal, one in the stats panel) and no icons. This block
   unifies them while preserving Bio's richer 17-tone
   vocabulary (Universe ships 6).
   ===================================================== */
var TONE_OPTIONS = [
  'Exciting','Difficult','Transformative','Peaceful','Bittersweet','Proud','Anxious',
  'Hopeful','Confusing','Liberating','Painful','Joyful','Overwhelming','Grateful',
  'Uncertain','Sad','Triumphant'
];
var TONE_COLORS = {
  Exciting:'#f39c12', Difficult:'#c0392b', Transformative:'#8e44ad', Peaceful:'#27ae60',
  Bittersweet:'#d35400', Proud:'#2980b9', Anxious:'#e67e22', Hopeful:'#16a085',
  Confusing:'#7f8c8d', Liberating:'#1abc9c', Painful:'#e74c3c', Joyful:'#f1c40f',
  Overwhelming:'#9b59b6', Grateful:'#27ae60', Uncertain:'#95a5a6',
  Sad:'#3498db', Triumphant:'#e67e22'
};
var TONE_ICONS = {
  Exciting:'\u2728', Difficult:'\uD83D\uDCA2', Transformative:'\uD83E\uDD8B',
  Peaceful:'\uD83C\uDF3F', Bittersweet:'\uD83E\uDD40', Proud:'\uD83C\uDF1F',
  Anxious:'\uD83D\uDE30', Hopeful:'\uD83C\uDF05', Confusing:'\uD83C\uDF00',
  Liberating:'\uD83D\uDD4A\uFE0F', Painful:'\uD83D\uDC94', Joyful:'\uD83D\uDE0A',
  Overwhelming:'\uD83C\uDF0A', Grateful:'\uD83D\uDE4F', Uncertain:'\uD83E\uDD14',
  Sad:'\uD83D\uDE22', Triumphant:'\uD83C\uDFC6'
};
function toneColor(t) { return (t && TONE_COLORS[t]) || '#888'; }
function toneIcon(t)  { return (t && TONE_ICONS[t])  || ''; }

if (typeof window !== 'undefined') {
  window.TONE_OPTIONS = TONE_OPTIONS;
  window.TONE_COLORS  = TONE_COLORS;
  window.TONE_ICONS   = TONE_ICONS;
  window.toneColor    = toneColor;
  window.toneIcon     = toneIcon;
}


/* =====================================================
   COMPACT LIFE-TRACKS DROPDOWN (ported from Universe — A-10)
   -----------------------------------------------------
   Closes #uni-drop-panel when the user clicks outside it
   or presses Escape. The open/close toggle itself is wired
   inline on #uni-drop-btn (matches Universe's pattern).
   ===================================================== */
(function bindUniDropDismissal() {
  function init() {
    if (window.__uniDropBound) return;
    window.__uniDropBound = true;
    document.addEventListener('click', function(e) {
      const wrap = document.getElementById('uni-drop-wrap');
      const panel = document.getElementById('uni-drop-panel');
      const btn = document.getElementById('uni-drop-btn');
      if (!wrap || !panel || !btn) return;
      if (panel.style.display === 'none' || panel.style.display === '') return;
      if (!wrap.contains(e.target)) {
        panel.style.display = 'none';
        btn.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', function(e) {
      if (e.key !== 'Escape') return;
      const panel = document.getElementById('uni-drop-panel');
      const btn = document.getElementById('uni-drop-btn');
      if (!panel || !btn) return;
      if (panel.style.display !== 'none' && panel.style.display !== '') {
        panel.style.display = 'none';
        btn.setAttribute('aria-expanded', 'false');
        try { btn.focus(); } catch(_){}
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

/* =====================================================
   PART 7 — Today marker, year bands, birth-date age,
            warm-dust ambient, global error trap
   ===================================================== */
(function () {
  'use strict';

  var REDUCED = false;
  try { REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) {}

  /* ---------- 7.1  Global error trap ---------- */
  if (!window.__ftBioErrTrap) {
    window.__ftBioErrTrap = true;
    window.addEventListener('error', function (e) {
      try { if (typeof notify === 'function') notify('Something went wrong: ' + (e && e.message ? e.message : 'unknown'), 'warning'); } catch (_) {}
    });
    window.addEventListener('unhandledrejection', function (e) {
      try { if (typeof notify === 'function') notify('Action failed: ' + (e && e.reason ? (e.reason.message || e.reason) : 'unknown'), 'warning'); } catch (_) {}
    });
  }

  /* ---------- 7.2  Settings (birth date) ---------- */
  var SET_KEY = 'ft_bio_settings_v1';
  function readSettings() {
    try { return JSON.parse(localStorage.getItem(SET_KEY) || '{}') || {}; } catch (_) { return {}; }
  }
  function writeSettings(s) {
    try { localStorage.setItem(SET_KEY, JSON.stringify(s || {})); } catch (_) {}
  }
  function getBirthDate() {
    var s = readSettings();
    return (s && typeof s.birthDate === 'string' && s.birthDate) ? s.birthDate : '';
  }
  function promptBirthDate() {
    var cur = getBirthDate();
    var v = window.prompt('Your birth date (YYYY-MM-DD or YYYY). Leave blank to clear.', cur || '');
    if (v === null) return;
    var s = readSettings();
    if (!v.trim()) { delete s.birthDate; writeSettings(s); try { notify('Birth date cleared', 'info'); } catch(_){} return; }
    s.birthDate = v.trim();
    writeSettings(s);
    try { notify('Birth date saved \u2713', 'success'); } catch(_){}
    refreshAgeInTitle();
  }
  window.FT_BIO_SETTINGS = { read: readSettings, write: writeSettings, promptBirthDate: promptBirthDate };

  /* parse "YYYY", "YYYY-MM", "YYYY-MM-DD", "DD/MM/YYYY" → fractional year */
  function parseAnyToYear(str) {
    if (!str) return null;
    if (typeof parseDate === 'function') {
      try { var y = parseDate(str); if (typeof y === 'number' && isFinite(y)) return y; } catch (_) {}
    }
    var m;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(str))) {
      var d = new Date(+m[1], +m[2]-1, +m[3]); return d.getFullYear() + (d.getTime() - new Date(d.getFullYear(),0,1).getTime()) / (365.25*86400000);
    }
    if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(str))) {
      var d2 = new Date(+m[3], +m[2]-1, +m[1]); return d2.getFullYear() + (d2.getTime() - new Date(d2.getFullYear(),0,1).getTime()) / (365.25*86400000);
    }
    if ((m = /^(\d{4})-(\d{1,2})$/.exec(str))) return +m[1] + (+m[2]-1)/12;
    if ((m = /^(\d{4})$/.exec(str))) return +m[1];
    return null;
  }

  function ageBetween(birthStr, eventStr) {
    var by = parseAnyToYear(birthStr);
    var ey = parseAnyToYear(eventStr);
    if (by === null || ey === null) return null;
    var a = Math.floor(ey - by);
    if (a < 0 || a > 150) return null;
    return a;
  }

  /* Inject "(age N)" beside the modal title whenever an event is opened. */
  function refreshAgeInTitle() {
    var title = document.getElementById('m-title');
    if (!title) return;
    var existing = title.querySelector('.ft-age-inline');
    if (existing) existing.remove();

    var ev = null;
    try {
      var top = (typeof MS !== 'undefined' && MS && MS.length) ? MS[MS.length-1] : null;
      if (top && (top.t === 'event' || top.t === 'editEv') && top.evId && Array.isArray(S.events)) {
        ev = S.events.find(function (x) { return x.id === top.evId; });
      }
    } catch (_) {}
    if (!ev || !ev.date) return;

    var birth = getBirthDate();
    if (!birth) return;
    var a = ageBetween(birth, ev.date);
    if (a === null) return;

    var span = document.createElement('span');
    span.className = 'ft-age-inline';
    span.textContent = ' (age ' + a + ')';
    span.style.cssText = 'color:#9a8570;font-weight:500;font-size:0.85em;margin-left:6px;';
    title.appendChild(span);
  }

  /* Watch the modal body for re-renders. */
  function installAgeObserver() {
    var body = document.getElementById('m-body');
    if (!body || body.__ftAgeObs) return;
    body.__ftAgeObs = true;
    var obs = new MutationObserver(function () { refreshAgeInTitle(); });
    obs.observe(body, { childList: true, subtree: true });
  }

  /* ---------- 7.3  Settings button (toolbar) ---------- */
  function buildSettingsButton() {
    var tb = document.getElementById('toolbar');
    if (!tb || document.getElementById('ft-settings-btn')) return;
    var btn = document.createElement('button');
    btn.id = 'ft-settings-btn';
    btn.className = 'btn';
    btn.type = 'button';
    btn.title = 'Settings — set your birth date for automatic age display';
    btn.textContent = '\u2699 Settings';
    btn.style.marginLeft = '6px';
    btn.addEventListener('click', promptBirthDate);
    var logo = tb.querySelector('.logo');
    if (logo && logo.parentNode) logo.parentNode.appendChild(btn);
    else tb.appendChild(btn);
  }

  /* ---------- 7.4  Overlay canvases (year bands + today + dust) ---------- */
  var bandsCv = null, bandsCx = null;
  var dustCv  = null, dustCx  = null;
  var dustParticles = [];

  function buildOverlays() {
    var wrap = document.getElementById('canvas-wrap');
    var main = document.getElementById('tl-canvas');
    if (!wrap || !main || document.getElementById('ft-bands-cv')) return;
    /* cs() makes a positioned overlay matching the wrap. */
    function cs(id, z, opacity) {
      var c = document.createElement('canvas');
      c.id = id;
      c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:' + z + ';opacity:' + opacity + ';';
      wrap.appendChild(c);
      return c;
    }
    /* Behind tl-canvas (z 0) wouldn't show because tl-canvas paints opaque,
       so we layer above with low opacity to keep it subtle. */
    bandsCv = cs('ft-bands-cv', 5, 1);
    dustCv  = cs('ft-dust-cv',  6, 0.05);
    bandsCx = bandsCv.getContext('2d');
    dustCx  = dustCv.getContext('2d');
    seedDust();
    sizeOverlays();
    window.addEventListener('resize', sizeOverlays);
    requestAnimationFrame(loop);
  }

  function sizeOverlays() {
    if (!bandsCv) return;
    var dpr = window.devicePixelRatio || 1;
    [bandsCv, dustCv].forEach(function (c) {
      var w = c.clientWidth, h = c.clientHeight;
      if (c.width !== w * dpr || c.height !== h * dpr) {
        c.width  = Math.max(1, Math.floor(w * dpr));
        c.height = Math.max(1, Math.floor(h * dpr));
        c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    });
  }

  function seedDust() {
    dustParticles = [];
    for (var i = 0; i < 10; i++) {
      dustParticles.push({
        x: Math.random(), y: Math.random(),
        vx: (Math.random() - 0.5) * 0.0006,
        vy: (Math.random() - 0.5) * 0.0004,
        r: 14 + Math.random() * 22
      });
    }
  }

  function drawYearBands() {
    if (!bandsCx) return;
    var w = bandsCv.clientWidth, h = bandsCv.clientHeight;
    bandsCx.clearRect(0, 0, w, h);
    // On the vertical (mobile) layout the timeline runs top-to-bottom, but these
    // bands map time to the X axis only (VC.dateToX) — painting them would draw
    // year stripes and a dashed 'Today' line rotated 90° straight across the middle
    // of the screen. Skip the overlay entirely in that mode. (Fix MOB-2)
    if (typeof isVerticalTimelineLayout === 'function' && isVerticalTimelineLayout()) return;
    if (typeof VC === 'undefined' || !VC.dateToX) return;
    /* visible year range from screen edges */
    var msL = VC.xToDate(0);
    var msR = VC.xToDate(w);
    if (!isFinite(msL) || !isFinite(msR)) return;
    var yL = new Date(msL).getFullYear() - 1;
    var yR = new Date(msR).getFullYear() + 1;
    if (yR - yL > 400) return; /* too zoomed out — skip bands */
    bandsCx.font = '700 11px ui-sans-serif,system-ui,sans-serif';
    bandsCx.textBaseline = 'top';
    for (var y = yL; y <= yR; y++) {
      var x0 = VC.dateToX(new Date(y, 0, 1).getTime());
      var x1 = VC.dateToX(new Date(y + 1, 0, 1).getTime());
      if (x1 < 0 || x0 > w) continue;
      /* alternating warm bands */
      bandsCx.fillStyle = (y % 2 === 0) ? 'rgba(245,239,230,0.55)' : 'rgba(250,246,239,0.0)';
      bandsCx.fillRect(x0, 0, x1 - x0, h);
      /* year label */
      if (x1 - x0 > 28) {
        bandsCx.fillStyle = 'rgba(120,100,70,0.45)';
        bandsCx.fillText(String(y), x0 + 6, 6);
      }
    }
    // The 'Today' marker is intentionally NOT drawn on this overlay: drawRuler()
    // (horizontal) and drawRulerVertical() already paint the authoritative dashed
    // TODAY line + badge across the full canvas. Drawing it again here produced a
    // second, slightly-offset Today line over the timeline. (Fix BE-9 — de-duplicate)
  }

  function drawDust() {
    if (!dustCx) return;
    var w = dustCv.clientWidth, h = dustCv.clientHeight;
    dustCx.clearRect(0, 0, w, h);
    // Hide the ambient dust on the vertical (mobile) layout too, so the overlay
    // pair is fully blank there (paired with the band skip above). (Fix MOB-2)
    if (typeof isVerticalTimelineLayout === 'function' && isVerticalTimelineLayout()) return;
    var grad;
    for (var i = 0; i < dustParticles.length; i++) {
      var p = dustParticles[i];
      if (!REDUCED) { p.x += p.vx; p.y += p.vy; }
      if (p.x < -0.05) p.x = 1.05; else if (p.x > 1.05) p.x = -0.05;
      if (p.y < -0.05) p.y = 1.05; else if (p.y > 1.05) p.y = -0.05;
      var px = p.x * w, py = p.y * h;
      grad = dustCx.createRadialGradient(px, py, 0, px, py, p.r);
      grad.addColorStop(0, 'rgba(220,180,120,1)');
      grad.addColorStop(1, 'rgba(220,180,120,0)');
      dustCx.fillStyle = grad;
      dustCx.beginPath(); dustCx.arc(px, py, p.r, 0, Math.PI * 2); dustCx.fill();
    }
  }

  var _lastBands = 0;
  function loop(ts) {
    sizeOverlays();
    /* Year bands depend on view; redraw at ~30fps which is more than enough. */
    if (ts - _lastBands > 33) { drawYearBands(); _lastBands = ts; }
    drawDust();
    requestAnimationFrame(loop);
  }

  /* ---------- 7.5  Init ---------- */
  function init() {
    buildSettingsButton();
    buildOverlays();
    installAgeObserver();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

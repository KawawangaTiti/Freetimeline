'use strict';

/* =====================================================
   CONSTANTS
   ===================================================== */
const LEFT_W  = 170;   // universe label panel width (px) — slightly wider for bigger buttons
const RULER_H = 54;    // time ruler height (px)
/* =====================================================
   FT_UNI NAMESPACE (soft extract — Prompt 2.4.A)
   Reserves window.FT_UNI as the future module surface for the
   timeline engine. Live state, view, modal stack, persistence and
   render entry points are registered at the bottom of this script
   inside the "TIMELINE ENGINE EXPORTS" block. When the file is
   eventually split into js/universe-timeline.js, every consumer
   already references FT_UNI.x instead of bare globals — making the
   final extraction a pure mechanical move with no callsite changes.
   ===================================================== */
window.FT_UNI = window.FT_UNI || {};

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
let   TRACK_H = 100;   // height per universe track (px) — user-configurable
const EV_R    = 13;    // event circle radius (px)
const OY      = 2000;  // origin year (world x = 0)
const BPPY    = 110;   // base pixels per year at scale=1
let YEAR_MIN = -200000; // B-8: bumped from -150000 → -200000 for parity with Biography (deeper prehistoric range)
let YEAR_MAX = 20000;  // 20,000 AD — configurable
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
  '#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6',
  '#1abc9c','#e67e22','#e91e63','#00bcd4','#607d8b'
];
const MONTHS  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/* ---- EVENT CATEGORIES (dynamic — editable by user) ---- */
const DEFAULT_CATEGORIES = {
  'Battle':    { color: '#c03428', icon: '⚔️' },
  'Origin':    { color: '#7030a0', icon: '⭐' },
  'Alliance':  { color: '#1e8a50', icon: '🤝' },
  'Betrayal':  { color: '#d06010', icon: '🗡️' },
  'Discovery': { color: '#1a6ea8', icon: '🔭' },
  'Death':     { color: '#304860', icon: '💀' },
  'Political': { color: '#607080', icon: '🏛️' },
  'Cosmic':    { color: '#5a1a90', icon: '🌌' },
  'Other':     { color: '#788090', icon: '📌' },
};
let CATEGORIES = Object.assign({}, DEFAULT_CATEGORIES);
const UNI_STATUSES = ['Upcoming','In Progress','Resolved','Ongoing','Cancelled'];
const UNI_STATUS_COLORS = { Upcoming:'#1a6ea8', 'In Progress':'#d06010', Resolved:'#1e8a50', Ongoing:'#b07800', Cancelled:'#788090' };
function statusColor(st) { return UNI_STATUS_COLORS[st] || '#888'; }

const TONE_OPTIONS = ['Epic','Tragic','Hopeful','Dark','Triumphant','Mysterious'];
const TONE_COLORS = { Epic:'#e74c3c', Tragic:'#2c3e50', Hopeful:'#f1c40f', Dark:'#1a1a2e', Triumphant:'#e67e22', Mysterious:'#8e44ad' };
const TONE_ICONS = { Epic:'\uD83D\uDD25', Tragic:'\uD83D\uDC94', Hopeful:'\uD83C\uDF05', Dark:'\uD83C\uDF11', Triumphant:'\uD83C\uDFC6', Mysterious:'\uD83D\uDD2E' };
function toneColor(t) { return TONE_COLORS[t] || '#888'; }
function toneIcon(t) { return TONE_ICONS[t] || ''; }
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
/*STATE_START*/let S = {"universes":[{"id":"u1","name":"Sample Universe A","color":"#4a8fde","visible":true,"description":"","notes":""},{"id":"u2","name":"Sample Universe B","color":"#c08040","visible":true,"description":"","notes":""}],"events":[{"id":"e1","universeId":"u1","date":"xx/xx/2020","title":"Sample Event 1","description":"This is an example event. Replace with your own content.","notes":"","media":[],"subEvents":[]},{"id":"e2","universeId":"u1","date":"xx/xx/2022","title":"Sample Event 2","description":"Another example event.","notes":"","media":[],"subEvents":[]},{"id":"e3","universeId":"u2","date":"xx/xx/2024","title":"Sample Event 3","description":"Events can belong to any universe.","notes":"","media":[],"subEvents":[]}],"characters":[],"connections":[],"categories":{},"affiliations":[]};/*STATE_END*/

// View transform
let V = { panX: 0, panY: 0, scale: 1 };

// Interaction
let drag   = { on: false, sx: 0, sy: 0, px: 0, py: 0, moved: false };
let uniDrag = { on: false, id: null, sy: 0, moved: false };
let hits   = [];   // hit targets rebuilt every render
let _lblSuppressedIds = new Set(); // 2.4.D: label ids hidden by de-collision sweep

// Modal stack — each entry describes what to show
let MS = [];
/* === TIMELINE ENGINE STATE END === */

// Working media list during form editing
let _editMediaList = [];
let _charPhoto = null;  // base64 photo for character being edited
let _meanwhileMode = false; // toggle meanwhile context in char timeline
/* B-2: blank-template detection (ported from Biography). Used to suppress
   "load saved work?" prompts and avoid persisting an empty template. */
let _blankTemplateMode = false;

function isBlankTemplateState(d) {
  const tracks = d.universes || d.lifeTracks || [];
  const events = d.events || [];
  const connections = d.connections || [];
  const people = d.characters || d.people || [];
  const affiliations = d.affiliations || [];
  const hasNoContent = events.length === 0 && connections.length === 0 && people.length === 0 && affiliations.length === 0;
  const hasNoTracks = tracks.length === 0;
  const hasOnlyDefaultBlankTrack = tracks.length === 1 && String(tracks[0].name || '').trim().toLowerCase() === 'untitled';
  return hasNoContent && (hasNoTracks || hasOnlyDefaultBlankTrack);
}

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
  if (/(required|please enter|please select|must be|too large|could not|failed|invalid|duplicate|already exists)/.test(text)) return 'error';
  if (/(deleted|removed|reset|cannot be undone|lost|overwrite|irreversible)/.test(text)) return 'warning';
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
  if (!el.id) el.id = (prefix || 'ft-field') + '-' + Math.random().toString(36).slice(2, 9);
  return el.id;
}

function clearFieldError(fieldId) {
  const field = document.getElementById(fieldId);
  if (!field) return;
  field.removeAttribute('aria-invalid');
  const errId = fieldId + '-error';
  const err = document.getElementById(errId);
  if (err) err.remove();
  const describedBy = (field.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean).filter(id => id !== errId);
  if (describedBy.length) field.setAttribute('aria-describedby', describedBy.join(' '));
  else field.removeAttribute('aria-describedby');
}

function showFieldError(fieldId, message) {
  const field = document.getElementById(fieldId);
  if (!field) { notify(message, 'error'); return false; }
  clearFieldError(fieldId);
  const err = document.createElement('div');
  err.id = fieldId + '-error';
  err.className = 'field-error';
  err.setAttribute('role', 'alert');
  err.textContent = message;
  field.setAttribute('aria-invalid', 'true');
  const describedBy = (field.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
  describedBy.push(err.id);
  field.setAttribute('aria-describedby', Array.from(new Set(describedBy)).join(' '));
  field.insertAdjacentElement('afterend', err);
  try { field.focus(); } catch (_) {}
  notify(message, 'error');
  return false;
}

function bindFormLabels(root) {
  (root || document).querySelectorAll('label').forEach(function(label) {
    if (label.htmlFor) return;
    let scope = label.parentElement;
    while (scope && scope !== root && !scope.querySelector('input, textarea, select')) scope = scope.parentElement;
    const control = (scope || label.parentElement || root).querySelector('input, textarea, select');
    if (!control) return;
    label.htmlFor = ensureControlId(control, 'ft-field');
  });
}

function describeInteractiveElements(root) {
  (root || document).querySelectorAll('button, [role="button"], input, textarea, select, a').forEach(function(el) {
    if (el.matches('input[type="hidden"]')) return;
    if (!el.getAttribute('aria-label')) {
      const label = (el.textContent || '').replace(/\s+/g, ' ').trim() || el.getAttribute('title') || el.getAttribute('placeholder');
      if (label) el.setAttribute('aria-label', label);
    }
  });
}

function getFocusable(root) {
  return Array.from((root || document).querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
    .filter(function(el) { return !el.disabled && el.offsetParent !== null; });
}

/* =====================================================
   DATA HELPERS
   ===================================================== */
function getU(id)      { return S.universes.find(u => u.id === id); }
function getVisIdx(id) {
  let vi = 0;
  for (const u of S.universes) {
    if (u.visible === false) continue;
    if (u.id === id) return vi;
    vi++;
  }
  return -1;
}
function visCount() { return S.universes.filter(u => u.visible !== false).length; }

/**
 * Parse "dd/mm/yyyy" -> decimal year. 'X' allowed for unknown parts.
 * Supports negative years (e.g. xx/xx/-50000 for BC).
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
  /* B-3: weekly recurrence (ported from Biography). */
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
  if (freq === 'century') {
    return { day: parts.day, month: parts.month, year: parts.year + 100 };
  }
  return null;
}

/* UE-9: memoise recurrence expansion. This is called inside the render hot path
   (drawEvents / drawStoryLine), so without a cache every pan/zoom frame re-ran up
   to 500 date-step iterations per recurring event. Key the cache on a signature
   of the recurring events — every field that ends up in a phantom, minus the
   heavy media/subEvents the phantoms drop — plus the year bound. Any edit/import
   that changes a recurring event changes the signature and rebuilds the cache. */
var _recCache = { sig: null, out: [] };
function expandRecurringEvents() {
  const LIMIT = 500;
  const maxYear = new Date().getFullYear() + 2;
  const recurring = S.events.filter(function(ev) {
    return ev.recurring && ev.recurring.frequency;
  });
  const sig = maxYear + '~' + JSON.stringify(recurring.map(function(ev) {
    return Object.assign({}, ev, { media: 0, subEvents: 0 });
  }));
  if (sig === _recCache.sig) return _recCache.out;

  const phantoms = [];
  recurring.forEach(function(ev) {
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
  _recCache.sig = sig;
  _recCache.out = phantoms;
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
      '    background: linear-gradient(180deg, rgba(14,16,32,0.96) 0%, rgba(14,16,32,0.78) 80%, rgba(14,16,32,0) 100%);',
      '    overflow-x: auto; overflow-y: hidden;',
      '    scroll-snap-type: x mandatory;',
      '    -webkit-overflow-scrolling: touch;',
      '    scrollbar-width: none;',
      '    padding-top: calc(8px + env(safe-area-inset-top, 0px));',
      '    border-bottom: 1px solid rgba(100,120,200,0.18);',
      '  }',
      '  #universe-pill-bar::-webkit-scrollbar { display: none; }',
      '  .upb-pill {',
      '    flex: 0 0 auto; scroll-snap-align: center;',
      '    display: inline-flex; align-items: center; gap: 7px;',
      '    padding: 7px 14px; border-radius: 999px;',
      '    background: rgba(200,210,240,0.10);',
      '    color: #c8cde0; font: 600 12.5px/1 inherit;',
      '    border: 1px solid rgba(100,120,200,0.25);',
      '    cursor: pointer; opacity: 0.6;',
      '    transition: opacity .18s, background .18s, border-color .18s, transform .12s;',
      '    white-space: nowrap; max-width: 50vw;',
      '    min-height: 36px;',
      '  }',
      '  .upb-pill:active { transform: scale(0.96); }',
      '  .upb-pill.is-active {',
      '    opacity: 1; font-weight: 700;',
      '    background: linear-gradient(135deg, rgba(74,143,222,0.35), rgba(58,112,192,0.35));',
      '    border-color: rgba(120,170,255,0.6);',
      '    text-decoration: underline; text-underline-offset: 4px;',
      '    box-shadow: 0 0 12px rgba(74,143,222,0.35);',
      '  }',
      '  .upb-dot {',
      '    width: 10px; height: 10px; border-radius: 50%;',
      '    box-shadow: 0 0 0 1px rgba(0,0,0,0.35) inset;',
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
      '    z-index: 5; background: #0e1020;',
      '    overflow-y: auto; overflow-x: hidden;',
      '    -webkit-overflow-scrolling: touch; touch-action: pan-y;',
      '    padding: calc(60px + env(safe-area-inset-top, 0px)) 0 24px;',
      '    box-sizing: border-box;',
      '  }',
      '  #mob-uni-feed.is-empty { display: flex; align-items: center; justify-content: center; }',
      '  .muf-empty { color: #8088a8; font: 500 14px/1.4 inherit; text-align: center; padding: 40px 24px; }',
      '  .muf-stack { display: flex; flex-direction: column; gap: 14px; padding: 0 8px; }',
      '  .muf-row { display: flex; gap: 10px; padding: 0 8px; align-items: stretch; }',
      '  .muf-rail {',
      '    flex: 0 0 56px; min-width: 56px; padding-top: 10px; position: relative;',
      '    display: flex; flex-direction: column; align-items: center;',
      '    color: #a8b0d0; font: 600 11px/1.2 inherit; text-align: center;',
      '  }',
      '  .muf-rail::before {',
      '    content: ""; position: absolute; top: 0; bottom: 0;',
      '    left: 50%; width: 2px; transform: translateX(-50%);',
      '    background: rgba(120,140,200,0.18);',
      '  }',
      '  .muf-rail-dot {',
      '    width: 10px; height: 10px; border-radius: 50%;',
      '    background: var(--muf-accent, #4a8fde); position: relative; z-index: 1;',
      '    box-shadow: 0 0 0 3px #0e1020;',
      '  }',
      '  .muf-rail-date { margin-top: 6px; position: relative; z-index: 1; background: #0e1020; padding: 2px 0; }',
      '  .muf-card {',
      '    flex: 1 1 auto; min-width: 0;',
      '    background: linear-gradient(180deg, rgba(28,32,56,0.95), rgba(22,26,44,0.95));',
      '    border: 1px solid rgba(100,120,200,0.22);',
      '    border-left: 3px solid var(--muf-accent, #4a8fde);',
      '    border-radius: 14px; padding: 12px 14px; color: #e0e8ff;',
      '    cursor: pointer; transition: transform .12s, background .18s, border-color .18s;',
      '    display: flex; flex-direction: column; gap: 8px;',
      '  }',
      '  .muf-card:active { transform: scale(0.985); background: rgba(40,46,78,0.95); }',
      '  .muf-card-head { display: flex; align-items: flex-start; gap: 10px; justify-content: space-between; }',
      '  .muf-card-title {',
      '    font: 700 15px/1.3 inherit; color: #e8eeff;',
      '    overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;',
      '    word-break: break-word; flex: 1 1 auto; min-width: 0;',
      '  }',
      '  .muf-card-date {',
      '    flex: 0 0 auto; font: 600 11px/1 inherit; color: #c8cde0;',
      '    background: rgba(74,143,222,0.18); border: 1px solid rgba(120,170,255,0.35);',
      '    padding: 4px 8px; border-radius: 999px; white-space: nowrap;',
      '  }',
      '  .muf-card-desc {',
      '    font: 400 13px/1.45 inherit; color: #b8c0d8;',
      '    overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;',
      '    word-break: break-word;',
      '  }',
      '  .muf-card-thumb {',
      '    width: 100%; max-height: 180px; object-fit: cover; border-radius: 10px;',
      '    background: rgba(0,0,0,0.25);',
      '  }',
      '  .muf-card-meta {',
      '    display: flex; gap: 10px; align-items: center; flex-wrap: wrap;',
      '    font: 500 11px/1 inherit; color: #8a93b3;',
      '  }',
      '  .muf-sub-list {',
      '    display: flex; flex-direction: column; gap: 8px; margin-top: 4px;',
      '    padding-left: 14px; border-left: 2px dashed rgba(120,140,200,0.3);',
      '  }',
      '  .muf-sub-card {',
      '    background: rgba(40,46,78,0.55);',
      '    border: 1px solid rgba(100,120,200,0.18);',
      '    border-radius: 10px; padding: 8px 10px;',
      '    font: 600 12.5px/1.3 inherit; color: #d6dcf2;',
      '    display: flex; gap: 8px; align-items: center; justify-content: space-between;',
      '    cursor: pointer; transition: background .18s, transform .12s;',
      '  }',
      '  .muf-sub-card:active { transform: scale(0.985); background: rgba(56,64,100,0.7); }',
      '  .muf-sub-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1 1 auto; }',
      '  .muf-sub-date {',
      '    flex: 0 0 auto; color: #a8b0d0; font: 500 10.5px/1 inherit;',
      '    background: rgba(120,140,200,0.15); padding: 3px 7px; border-radius: 999px;',
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
    /* Insert after the pill bar so the bar overlays it visually. */
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
        if (pid && typeof M === 'object' && M && typeof M.openEvDetail === 'function') {
          M.openEvDetail(pid);
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

  /* Horizontal swipe on the feed → page to prev/next visible universe.
     Native vertical scroll is preserved via touch-action: pan-y. */
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
  if (_storyLineVisible) drawStoryLine(c, g);
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

  // Ruler bar — subtle gradient
  const rulerGrad = g.createLinearGradient(0, 0, 0, RULER_H);
  rulerGrad.addColorStop(0, '#edf0f5');
  rulerGrad.addColorStop(1, '#f4f5f8');
  g.fillStyle = rulerGrad;
  g.fillRect(LEFT_W, 0, W - LEFT_W, RULER_H);
  g.strokeStyle = '#c8ccd6'; g.lineWidth = 1;
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
      g.strokeStyle = 'rgba(220,224,232,0.65)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(sx, RULER_H); g.lineTo(sx, c.height); g.stroke();
      g.strokeStyle = '#bec4d0'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(sx, RULER_H - 6); g.lineTo(sx, RULER_H); g.stroke();
    }
  }

  const majs = Math.floor(lyear / maj) * maj;
  g.font = '11px -apple-system, "Segoe UI", sans-serif';
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
      g.strokeStyle = '#9aa2b4'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(sx, RULER_H - 16); g.lineTo(sx, RULER_H); g.stroke();
      g.strokeStyle = 'rgba(210,215,228,0.55)'; g.lineWidth = 1;
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
          lbl = formatCalendarYear(Math.round(y));
        }
        g.fillStyle = '#505868';
        g.fillText(lbl, sx, RULER_H - 20);
      }
      _idx++;
    }
  }

  drawRangeEndpointLabel(g, YEAR_MIN, LEFT_W + 6, 'left');
  drawRangeEndpointLabel(g, YEAR_MAX, W - 6, 'right');

  // TODAY line — precise marker
  const now = new Date();
  const todayDec = now.getFullYear() + now.getMonth() / 12 + now.getDate() / 365;
  const tx = ws(yw(todayDec));
  if (tx >= LEFT_W && tx <= W) {
    g.save();
    // Subtle glow underlay
    g.strokeStyle = 'rgba(220,60,50,0.18)'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(tx, RULER_H); g.lineTo(tx, c.height); g.stroke();
    // Crisp dashed line
    g.strokeStyle = '#d43c2e'; g.lineWidth = 1.5;
    g.setLineDash([5, 4]);
    g.beginPath(); g.moveTo(tx, 0); g.lineTo(tx, c.height); g.stroke();
    g.setLineDash([]);
    // Badge label pill — refined
    const badgeW = 44, badgeH = 16;
    rRect(g, tx - badgeW / 2, 2, badgeW, badgeH, 5);
    g.fillStyle = '#d43c2e'; g.fill();
    g.fillStyle = '#fff';
    g.font = 'bold 9px -apple-system, sans-serif';
    g.textAlign = 'center';
    g.fillText('TODAY', tx, 14);
    // Tick mark at ruler bottom
    g.strokeStyle = '#d43c2e'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(tx, RULER_H - 10); g.lineTo(tx, RULER_H); g.stroke();
    g.restore();
  }

  // Left panel header (drawn over track area)
  g.fillStyle = '#161626';
  g.fillRect(0, 0, LEFT_W, RULER_H);
  // Subtle gradient overlay on header
  const hdrGrad = g.createLinearGradient(0, 0, LEFT_W, 0);
  hdrGrad.addColorStop(0, 'rgba(60,80,180,0.18)');
  hdrGrad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = hdrGrad;
  g.fillRect(0, 0, LEFT_W, RULER_H);
  g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(LEFT_W, 0); g.lineTo(LEFT_W, RULER_H); g.stroke();
  g.fillStyle = 'rgba(200,210,240,0.78)';
  g.font = 'bold 10px -apple-system, "Segoe UI", sans-serif';
  g.textAlign = 'center';
  g.fillText('UNIVERSES', LEFT_W / 2, RULER_H / 2 + 4);
}

function drawRulerVertical(c, g) {
  const W = c.width, H = c.height;

  const rulerGrad = g.createLinearGradient(0, 0, RULER_H, 0);
  rulerGrad.addColorStop(0, '#edf0f5');
  rulerGrad.addColorStop(1, '#f4f5f8');
  g.fillStyle = rulerGrad;
  g.fillRect(0, LEFT_W, RULER_H, H - LEFT_W);
  g.strokeStyle = '#c8ccd6';
  g.beginPath(); g.moveTo(RULER_H, LEFT_W); g.lineTo(RULER_H, H); g.stroke();

  g.fillStyle = '#161626';
  g.fillRect(0, 0, W, LEFT_W);
  const hdrGrad = g.createLinearGradient(0, 0, 0, LEFT_W);
  hdrGrad.addColorStop(0, 'rgba(60,80,180,0.18)');
  hdrGrad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = hdrGrad;
  g.fillRect(0, 0, W, LEFT_W);
  g.strokeStyle = 'rgba(255,255,255,0.10)';
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
    g.strokeStyle = 'rgba(220,224,232,0.65)';
    g.beginPath(); g.moveTo(RULER_H, sy); g.lineTo(c.width, sy); g.stroke();
    g.strokeStyle = '#bec4d0';
    g.beginPath(); g.moveTo(RULER_H - 6, sy); g.lineTo(RULER_H, sy); g.stroke();
  }

  const majs = Math.floor(topYear / maj) * maj;
  g.font = '11px -apple-system, "Segoe UI", sans-serif';
  g.textAlign = 'left';
  // Spec 2.4.C: measureText collision avoidance — label every Nth tick (min 80px vertical gap)
  { const _midY = (topYear + bottomYear) / 2;
    const _dSmp = (isMon || isDay) ? decYearToDate(_midY) : null;
    const _sampleLbl = isDay ? '15 Jun 2000'
                     : isMon ? (MONTHS[(_dSmp && _dSmp.m) || 5] + ' 2000')
                     : formatCalendarYear(Math.round(_midY));
    const _lh = 14; // approx line height for vertical spacing
    const _tickPx = Math.max(1, Math.abs(ws(yw(majs + maj)) - ws(yw(majs))));
    const _labelN = Math.max(1, Math.ceil(Math.max(80, _lh + 4) / _tickPx));
    let _idx = 0;
    for (let y = majs; y <= bottomYear + maj; y += maj) {
      const sy = ws(yw(y));
      if (sy < LEFT_W - 20 || sy > H + 20) { _idx++; continue; }
      g.strokeStyle = '#9aa2b4';
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
        g.fillStyle = '#505868';
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
    g.strokeStyle = 'rgba(220,60,50,0.18)'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(RULER_H, ty); g.lineTo(c.width, ty); g.stroke();
    g.strokeStyle = '#d43c2e'; g.lineWidth = 1.5;
    g.setLineDash([5, 4]);
    g.beginPath(); g.moveTo(0, ty); g.lineTo(c.width, ty); g.stroke();
    g.setLineDash([]);
    rRect(g, 6, ty - 10, 44, 16, 5);
    g.fillStyle = '#d43c2e'; g.fill();
    g.fillStyle = '#fff';
    g.font = 'bold 9px -apple-system, sans-serif';
    g.textAlign = 'center';
    g.fillText('TODAY', 28, ty + 2.5);
    g.restore();
  }

  g.fillStyle = 'rgba(200,210,240,0.78)';
  g.font = 'bold 10px -apple-system, "Segoe UI", sans-serif';
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
  g.font = 'bold 11px -apple-system, "Segoe UI", sans-serif';
  g.textAlign = align;
  const textW = g.measureText(label).width;
  const pad = 7;
  const boxX = align === 'left' ? x - pad : x - textW - pad;
  rRect(g, boxX, 3, textW + pad * 2, 18, 5);
  g.fillStyle = 'rgba(26,26,46,0.9)';
  g.fill();
  g.fillStyle = '#fff';
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
  S.universes.forEach(u => {
    if (u.visible === false) return;
    const ty  = trackY(vi);
    const top = ty - TRACK_H / 2;
    const bot = ty + TRACK_H / 2;
    const isDimmed = !!u.dimmed;
    if (isDimmed) g.save(), g.globalAlpha = 0.25;

    // Panel background
    const panelGrad = g.createLinearGradient(0, top, LEFT_W, top);
    panelGrad.addColorStop(0, u.color + '28');
    panelGrad.addColorStop(1, u.color + '0c');
    g.fillStyle = panelGrad;
    g.fillRect(0, top, LEFT_W, TRACK_H);

    // Color accent stripe
    g.fillStyle = u.color;
    g.fillRect(LEFT_W - 5, top, 5, TRACK_H);
    g.save();
    const stripeGrad = g.createLinearGradient(LEFT_W - 14, top, LEFT_W - 5, top);
    stripeGrad.addColorStop(0, u.color + '00');
    stripeGrad.addColorStop(1, u.color + '55');
    g.fillStyle = stripeGrad;
    g.fillRect(LEFT_W - 14, top, 9, TRACK_H);
    g.restore();

    // Track bottom separator (left panel portion)
    g.strokeStyle = 'rgba(200,205,218,0.7)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, bot); g.lineTo(LEFT_W, bot); g.stroke();

    // Universe name
    g.fillStyle = '#15152a';
    g.font = 'bold 12px -apple-system, "Segoe UI", sans-serif';
    g.textAlign = 'left';
    const disp = u.name.length > 16 ? u.name.slice(0, 15) + '\u2026' : u.name;
    g.fillText(disp, 10, ty - 18);

    // Event count
    const evCnt = S.events.filter(e => e.universeId === u.id).length;
    g.fillStyle = '#8892a8';
    g.font = '10px -apple-system, "Segoe UI", sans-serif';
    g.fillText(evCnt + ' event' + (evCnt !== 1 ? 's' : ''), 10, ty - 4);
    g.fillStyle = '#9098b0';
    g.font = 'bold 13px -apple-system, "Segoe UI", sans-serif';
    g.textAlign = 'right';
    g.fillText('↕', LEFT_W - 12, ty - 10);

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
    g.fillStyle = '#e8f0ff'; g.fill(); g.strokeStyle = '#b8ccee'; g.lineWidth = 0.7; g.stroke();
    rRect(g, delX, btnY2 - btnH / 2, btnW, btnH, btnR);
    g.fillStyle = '#ffe8e8'; g.fill(); g.strokeStyle = '#e8b0b0'; g.lineWidth = 0.7; g.stroke();
    g.fillStyle = '#404860';
    g.font = 'bold 10px -apple-system, "Segoe UI", sans-serif';
    g.textAlign = 'center';
    g.fillText(u.dimmed ? 'show' : 'hide', hideX + btnW / 2, btnY2 + 3.5);
    g.fillText('edit', editX + btnW / 2, btnY2 + 3.5);
    g.fillStyle = '#2a60c0';
    g.fillText('info', infoX + btnW / 2, btnY2 + 3.5);
    g.fillStyle = '#c03030';
    g.fillText('del', delX + btnW / 2, btnY2 + 3.5);

    vi++;
  });

  g.restore();

  // Sticky shadow — right edge of left panel
  g.save();
  const shadow = g.createLinearGradient(LEFT_W, 0, LEFT_W + 10, 0);
  shadow.addColorStop(0, 'rgba(0,10,40,0.09)');
  shadow.addColorStop(1, 'rgba(0,10,40,0.00)');
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
  S.universes.forEach(u => {
    if (u.visible === false) return;
    const tx   = trackY(vi);
    const left  = tx - TRACK_H / 2;
    const right = tx + TRACK_H / 2;
    const isDimmed = !!u.dimmed;
    if (isDimmed) g.save(), g.globalAlpha = 0.25;

    // Column header background
    const panelGrad = g.createLinearGradient(left, 0, left, LEFT_W);
    panelGrad.addColorStop(0, u.color + '28');
    panelGrad.addColorStop(1, u.color + '0c');
    g.fillStyle = panelGrad;
    g.fillRect(left, 0, TRACK_H, LEFT_W);

    // Bottom accent stripe
    g.fillStyle = u.color;
    g.fillRect(left, LEFT_W - 5, TRACK_H, 5);

    // Column separator
    g.strokeStyle = 'rgba(200,205,218,0.7)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(right, 0); g.lineTo(right, LEFT_W); g.stroke();

    // Name
    g.fillStyle = '#15152a';
    g.font = 'bold 11px -apple-system, "Segoe UI", sans-serif';
    g.textAlign = 'center';
    const disp = u.name.length > 12 ? u.name.slice(0, 11) + '\u2026' : u.name;
    g.fillText(disp, tx, 22);

    // Event count
    const evCnt = S.events.filter(e => e.universeId === u.id).length;
    g.fillStyle = '#8892a8';
    g.font = '10px -apple-system, "Segoe UI", sans-serif';
    g.fillText(evCnt + ' event' + (evCnt !== 1 ? 's' : ''), tx, 38);

    if (isDimmed) g.restore();

    // Buttons (visual only — hits already registered by drawTracksVertical)
    const btnW = 34, btnH = 24;
    const col1 = left + 8, col2 = right - btnW - 8;
    const row1 = 56, row2 = 86;
    [['u-hide', col1, row1, u.dimmed ? 'show' : 'hide', '#dde0e8', '#404860'],
     ['u-edit', col2, row1, 'edit', '#dde0e8', '#404860'],
     ['u-info', col1, row2, 'info', '#e8f0ff', '#2a60c0'],
     ['u-del',  col2, row2, 'del',  '#ffe8e8', '#c03030']].forEach(function(btn) {
      rRect(g, btn[1], btn[2], btnW, btnH, 5);
      g.fillStyle = btn[4]; g.fill();
      g.strokeStyle = '#c8ccda'; g.lineWidth = 0.7; g.stroke();
      g.fillStyle = btn[5];
      g.font = 'bold 9px -apple-system, "Segoe UI", sans-serif';
      g.textAlign = 'center';
      g.fillText(btn[3], btn[1] + btnW / 2, btn[2] + 15);
    });

    vi++;
  });

  g.restore();

  // Sticky shadow — bottom edge of header band
  g.save();
  const shadow = g.createLinearGradient(0, LEFT_W, 0, LEFT_W + 10);
  shadow.addColorStop(0, 'rgba(0,10,40,0.09)');
  shadow.addColorStop(1, 'rgba(0,10,40,0.00)');
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
    // Emblem ring
    g.beginPath(); g.arc(c.width / 2, c.height / 2 - 52, 28, 0, Math.PI * 2);
    g.strokeStyle = 'rgba(100,160,255,0.18)'; g.lineWidth = 2; g.stroke();
    g.beginPath(); g.arc(c.width / 2, c.height / 2 - 52, 20, 0, Math.PI * 2);
    g.fillStyle = 'rgba(60,100,220,0.06)'; g.fill();
    g.strokeStyle = 'rgba(100,160,255,0.35)'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = 'rgba(120,180,255,0.7)';
    g.font = '22px -apple-system, "Segoe UI", sans-serif';
    g.fillText('✦', c.width / 2, c.height / 2 - 44);
    // Headline
    g.fillStyle = 'rgba(80,130,220,0.82)';
    g.font = 'bold 17px -apple-system, "Segoe UI", sans-serif';
    g.fillText('Your universe begins here', c.width / 2, c.height / 2 - 10);
    // Sub text
    g.font = '13px -apple-system, "Segoe UI", sans-serif';
    g.fillStyle = 'rgba(110,150,210,0.62)';
    g.fillText('Open  ＋ Universe  to forge the first arc, then  ＋ Event  to anchor its first moment.', c.width / 2, c.height / 2 + 16);
    g.fillStyle = 'rgba(100,140,200,0.42)';
    g.fillText('Need guidance? The  ✦ Help  codex awaits in the toolbar.', c.width / 2, c.height / 2 + 38);
    g.restore();
    return;
  }

  let vi = 0;
  S.universes.forEach(u => {
    if (u.visible === false) return;
    const ty  = trackY(vi);
    const top = ty - TRACK_H / 2;
    const bot = ty + TRACK_H / 2;

    const isDimmed = !!u.dimmed;
    if (isDimmed) g.save(), g.globalAlpha = 0.25;

    // Track background — subtle horizontal gradient band
    const trackGrad = g.createLinearGradient(LEFT_W, top, LEFT_W, bot);
    trackGrad.addColorStop(0, vi % 2 === 0 ? 'rgba(0,0,0,0.008)' : 'rgba(0,0,0,0.018)');
    trackGrad.addColorStop(0.5, vi % 2 === 0 ? 'rgba(0,0,0,0.018)' : 'rgba(0,0,0,0.032)');
    trackGrad.addColorStop(1, vi % 2 === 0 ? 'rgba(0,0,0,0.008)' : 'rgba(0,0,0,0.018)');
    g.fillStyle = trackGrad;
    g.fillRect(LEFT_W, top, c.width - LEFT_W, TRACK_H);

    // Left panel background — color-tinted with gradient
    const panelGrad = g.createLinearGradient(0, top, LEFT_W, top);
    panelGrad.addColorStop(0, u.color + '28');
    panelGrad.addColorStop(1, u.color + '0c');
    g.fillStyle = panelGrad;
    g.fillRect(0, top, LEFT_W, TRACK_H);

    // Left color accent stripe — tapered glow
    g.fillStyle = u.color;
    g.fillRect(LEFT_W - 5, top, 5, TRACK_H);
    g.save();
    const stripeGrad = g.createLinearGradient(LEFT_W - 14, top, LEFT_W - 5, top);
    stripeGrad.addColorStop(0, u.color + '00');
    stripeGrad.addColorStop(1, u.color + '55');
    g.fillStyle = stripeGrad;
    g.fillRect(LEFT_W - 14, top, 9, TRACK_H);
    g.restore();

    // Track bottom separator
    g.strokeStyle = 'rgba(200,205,218,0.7)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, bot); g.lineTo(c.width, bot); g.stroke();

    // Left panel right border
    g.strokeStyle = 'rgba(200,205,218,0.5)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(LEFT_W - 5, top); g.lineTo(LEFT_W - 5, bot); g.stroke();

    // Universe name
    g.fillStyle = '#15152a';
    g.font = 'bold 12px -apple-system, "Segoe UI", sans-serif';
    g.textAlign = 'left';
    const disp = u.name.length > 16 ? u.name.slice(0, 15) + '\u2026' : u.name;
    g.fillText(disp, 10, ty - 18);

    // Event count
    const evCnt = S.events.filter(e => e.universeId === u.id).length;
    g.fillStyle = '#8892a8';
    g.font = '10px -apple-system, "Segoe UI", sans-serif';
    g.fillText(evCnt + ' event' + (evCnt !== 1 ? 's' : ''), 10, ty - 4);
    g.fillStyle = '#9098b0';
    g.font = 'bold 13px -apple-system, "Segoe UI", sans-serif';
    g.textAlign = 'right';
    g.fillText('↕', LEFT_W - 12, ty - 10);

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
    g.fillStyle = '#e8f0ff';
    g.fill();
    g.strokeStyle = '#b8ccee'; g.lineWidth = 0.7; g.stroke();

    // DEL button
      rRect(g, delX, btnY2 - btnH / 2, btnW, btnH, btnR);
      g.fillStyle = '#ffe8e8';
      g.fill();
      g.strokeStyle = '#e8b0b0'; g.lineWidth = 0.7; g.stroke();

    // Button labels
    g.fillStyle = '#404860';
    g.font = 'bold 10px -apple-system, "Segoe UI", sans-serif';
    g.textAlign = 'center';
    g.fillText(u.dimmed ? 'show' : 'hide', hideX + btnW / 2, btnY2 + 3.5);
    g.fillText('edit', editX + btnW / 2, btnY2 + 3.5);
    g.fillStyle = '#2a60c0';
    g.fillText('info', infoX + btnW / 2, btnY2 + 3.5);
    g.fillStyle = '#c03030';
    g.fillText('del', delX + btnW / 2, btnY2 + 3.5);

    hits.push({ type: 'u-row', id: u.id, x: 0, y: top, w: LEFT_W, h: TRACK_H });

    // Register hit targets
    hits.push({ type: 'u-hide', id: u.id, x: hideX, y: btnY2 - btnH / 2, w: btnW, h: btnH });
    hits.push({ type: 'u-edit', id: u.id, x: editX, y: btnY2 - btnH / 2, w: btnW, h: btnH });
    hits.push({ type: 'u-info', id: u.id, x: infoX, y: btnY2 - btnH / 2, w: btnW, h: btnH });
    hits.push({ type: 'u-del',  id: u.id, x: delX,  y: btnY2 - btnH / 2, w: btnW, h: btnH });

    // Track axis centre line — dual: glow layer + crisp top line
    g.save();
    if (isDimmed) g.globalAlpha = 0.25;
    g.strokeStyle = u.color + '30'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(LEFT_W, ty); g.lineTo(c.width, ty); g.stroke();
    g.strokeStyle = u.color + '65'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(LEFT_W, ty); g.lineTo(c.width, ty); g.stroke();
    g.restore();

    vi++;
  });
}

function drawTracksVertical(c, g) {
  const vc = visCount();
  if (vc === 0) return;

  let vi = 0;
  S.universes.forEach(u => {
    if (u.visible === false) return;
    const tx = trackY(vi);
    const left = tx - TRACK_H / 2;
    const right = tx + TRACK_H / 2;
    const isDimmed = !!u.dimmed;
    if (isDimmed) g.save(), g.globalAlpha = 0.25;

    const colGrad = g.createLinearGradient(left, LEFT_W, right, LEFT_W);
    colGrad.addColorStop(0, vi % 2 === 0 ? 'rgba(0,0,0,0.008)' : 'rgba(0,0,0,0.018)');
    colGrad.addColorStop(0.5, vi % 2 === 0 ? 'rgba(0,0,0,0.018)' : 'rgba(0,0,0,0.032)');
    colGrad.addColorStop(1, vi % 2 === 0 ? 'rgba(0,0,0,0.008)' : 'rgba(0,0,0,0.018)');
    g.fillStyle = colGrad;
    g.fillRect(left, LEFT_W, TRACK_H, c.height - LEFT_W);

    const panelGrad = g.createLinearGradient(left, 0, left, LEFT_W);
    panelGrad.addColorStop(0, u.color + '28');
    panelGrad.addColorStop(1, u.color + '0c');
    g.fillStyle = panelGrad;
    g.fillRect(left, 0, TRACK_H, LEFT_W);

    g.fillStyle = u.color;
    g.fillRect(left, LEFT_W - 5, TRACK_H, 5);

    g.strokeStyle = 'rgba(200,205,218,0.7)';
    g.beginPath(); g.moveTo(right, 0); g.lineTo(right, c.height); g.stroke();

    g.fillStyle = '#15152a';
    g.font = 'bold 11px -apple-system, "Segoe UI", sans-serif';
    g.textAlign = 'center';
    const disp = u.name.length > 12 ? u.name.slice(0, 11) + '\u2026' : u.name;
    g.fillText(disp, tx, 22);

    const evCnt = S.events.filter(e => e.universeId === u.id).length;
    g.fillStyle = '#8892a8';
    g.font = '10px -apple-system, "Segoe UI", sans-serif';
    g.fillText(evCnt + ' event' + (evCnt !== 1 ? 's' : ''), tx, 38);

    if (isDimmed) g.restore();

    const btnW = 34, btnH = 24;
    const col1 = left + 8, col2 = right - btnW - 8;
    const row1 = 56, row2 = 86;
    [['u-hide', col1, row1, u.dimmed ? 'show' : 'hide', '#dde0e8', '#404860'],
     ['u-edit', col2, row1, 'edit', '#dde0e8', '#404860'],
     ['u-info', col1, row2, 'info', '#e8f0ff', '#2a60c0'],
     ['u-del',  col2, row2, 'del',  '#ffe8e8', '#c03030']].forEach(function(btn) {
      rRect(g, btn[1], btn[2], btnW, btnH, 5);
      g.fillStyle = btn[4]; g.fill();
      g.strokeStyle = '#c8ccda'; g.lineWidth = 0.7; g.stroke();
      g.fillStyle = btn[5];
      g.font = 'bold 9px -apple-system, "Segoe UI", sans-serif';
      g.textAlign = 'center';
      g.fillText(btn[3], btn[1] + btnW / 2, btn[2] + 15);
      hits.push({ type: btn[0], id: u.id, x: btn[1], y: btn[2], w: btnW, h: btnH });
    });

    hits.push({ type: 'u-row', id: u.id, x: left, y: 0, w: TRACK_H, h: LEFT_W });

    g.save();
    if (isDimmed) g.globalAlpha = 0.25;
    g.strokeStyle = u.color + '30'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(tx, LEFT_W); g.lineTo(tx, c.height); g.stroke();
    g.strokeStyle = u.color + '65'; g.lineWidth = 1;
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
    const _connColor = getConnColor(conn, fu.color);
    const _connAlpha = _connDimmed ? 0.08 : getConnOpacity(conn);
    // Glow underlay for connection lines
    g.strokeStyle = _connColor;
    g.lineWidth = getConnWidth(conn) + 3;
    g.globalAlpha = _connAlpha * 0.18;
    g.beginPath(); g.moveTo(fx, fy);
    if (isVerticalTimelineLayout()) g.bezierCurveTo(mx, fy, mx, ty2, tx, ty2);
    else g.bezierCurveTo(fx, my, tx, my, tx, ty2);
    g.stroke();
    // Main line
    g.lineWidth = getConnWidth(conn);
    if (getConnDashed(conn)) g.setLineDash([6, 4]);
    g.globalAlpha = _connAlpha;
    g.beginPath(); g.moveTo(fx, fy);
    if (isVerticalTimelineLayout()) g.bezierCurveTo(mx, fy, mx, ty2, tx, ty2);
    else g.bezierCurveTo(fx, my, tx, my, tx, ty2);
    g.stroke();
    g.setLineDash([]); g.globalAlpha = 1;
    if (conn.label) {
      g.globalAlpha = 0.65; g.fillStyle = '#384060';
      g.font = '9px -apple-system, sans-serif'; g.textAlign = 'center';
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
      if (last && Math.abs(sx - last.timeCoord) < CLUSTER_PX_THRESHOLD) {   /* UE-8: clusters carry timeCoord, not x — last.x was undefined so the merge never fired */
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
    pop.style.cssText = 'position:fixed;z-index:9200;background:#fff;border:1px solid #c8ccd6;border-radius:9px;box-shadow:0 6px 24px rgba(0,0,0,0.16);padding:0;min-width:190px;max-width:270px;max-height:280px;overflow:hidden;display:none;font-family:-apple-system,"Segoe UI",sans-serif;';
    pop.innerHTML = '<div style="padding:8px 12px 6px;border-bottom:1px solid #eaecf2;font-size:11px;font-weight:700;color:#505868;display:flex;justify-content:space-between;align-items:center"><span id="lbl-pop-title">Events</span><span id="lbl-pop-close" style="cursor:pointer;font-size:16px;color:#9098b0;line-height:1">&times;</span></div><div id="lbl-cluster-pop-list" style="overflow-y:auto;max-height:236px;"></div>';
    document.body.appendChild(pop);
    pop.querySelector('#lbl-pop-close').addEventListener('click', () => { pop.style.display = 'none'; });
    document.addEventListener('pointerdown', e => {
      if (pop.style.display !== 'none' && !pop.contains(e.target)) pop.style.display = 'none';
    }, true);
  }
  const list = pop.querySelector('#lbl-cluster-pop-list');
  pop.querySelector('#lbl-pop-title').textContent = events.length + ' events here';
  list.innerHTML = events.map(ev =>
    '<div data-evid="' + esc(ev.id) + '" style="padding:7px 12px;cursor:pointer;border-bottom:1px solid #f0f1f6;font-size:12px;" onmouseenter="this.style.background=\'#f0f4ff\'" onmouseleave="this.style.background=\'\'">' +
    '<div style="font-weight:600;color:#1c2030;line-height:1.3">' + esc(ev.title || 'Untitled') + '</div>' +
    '<div style="font-size:10px;color:#8090aa;margin-top:2px">' + esc(ev.date || '') + (ev.time ? ' · ' + esc(ev.time) : '') + '</div>' +
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
  const col = u ? u.color : '#888';
  const r = 12 + Math.min(count, 30) * 0.4;

  // Shadow
  g.beginPath(); g.arc(x, y + 2.5, r, 0, Math.PI * 2);
  g.fillStyle = 'rgba(0,0,0,0.08)'; g.fill();

  // Glow aura
  const clusterAura = g.createRadialGradient(x, y, r * 0.6, x, y, r + 5);
  clusterAura.addColorStop(0, col + '30');
  clusterAura.addColorStop(1, col + '00');
  g.beginPath(); g.arc(x, y, r + 5, 0, Math.PI * 2);
  g.fillStyle = clusterAura; g.fill();

  // Ring
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = col + '18'; g.fill();
  g.strokeStyle = col; g.lineWidth = 1.8; g.stroke();

  // Inner white
  g.beginPath(); g.arc(x, y, r - 3, 0, Math.PI * 2);
  g.fillStyle = 'rgba(255,255,255,0.88)'; g.fill();

  g.font = 'bold 11px -apple-system, "Segoe UI", sans-serif';
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

  // Friendly guidance when universes exist but no events have been added yet
  if (S.events.length === 0 && S.universes.length > 0) {
    g.save();
    g.textAlign = 'center';
    g.fillStyle = 'rgba(80,130,220,0.72)';
    g.font = 'bold 14px -apple-system, "Segoe UI", sans-serif';
    g.fillText('✦  Arc open — place the first event to begin the chronicle.', c.width / 2, RULER_H + 46);
    g.font = '12px -apple-system, "Segoe UI", sans-serif';
    g.fillStyle = 'rgba(110,150,210,0.52)';
    g.fillText('Click  ＋ Event  in the toolbar, or double-click anywhere on a universe row.', c.width / 2, RULER_H + 66);
    g.restore();
  }

  const allEvs = S.events.concat(expandRecurringEvents());

  /* === Phase 2.4.K: Virtualization for large timelines ===
     Build a year-sorted index once per dataset signature so we can
     slice the visible window in O(log n) instead of scanning every
     event on every frame. When the dataset is small (<200 events)
     the linear filter is faster than the sort+slice, so we skip it. */
  let candidates = allEvs;
  if (allEvs.length >= 200) {
    const sig = allEvs.length + '|' + (allEvs[allEvs.length-1] && allEvs[allEvs.length-1].id || '');
    if (!drawEvents._idx || drawEvents._idx.sig !== sig) {
      const arr = [];
      for (let i = 0; i < allEvs.length; i++) {
        const e = allEvs[i];
        const d = parseDate(e.date, e.time);
        if (d !== null) arr.push({ ev: e, year: d });
      }
      arr.sort((a,b) => a.year - b.year);
      drawEvents._idx = { sig: sig, arr: arr };
    }
    const arr = drawEvents._idx.arr;
    // Lower bound: first arr[i].year >= visYearLeft - small slack
    let lo = 0, hi = arr.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m].year < visYearLeft) lo = m + 1; else hi = m; }
    const start = lo;
    lo = 0; hi = arr.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m].year <= visYearRight) lo = m + 1; else hi = m; }
    const end = lo;
    candidates = new Array(end - start);
    for (let i = start; i < end; i++) candidates[i - start] = arr[i].ev;
  }

  const culled = candidates.filter(ev => {
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

  // 2.4.K: Skip the expensive O(n²) label de-collision sweep when many
  // events are visible at once — at that density labels are not legible
  // anyway and would be hidden by the existing cluster bubbles.
  const _skipLblSweep = culled.length > 500;

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
  if (!isVerticalTimelineLayout() && !_skipLblSweep) {
    g.font = 'bold 10px -apple-system, "Segoe UI", sans-serif';
    const _boxes = [];
    culled.forEach(ev => {
      if (ev.isPhantom) return;
      const u = getU(ev.universeId);
      if (!u || u.visible === false) return;
      const dec = parseDate(ev.date, ev.time);
      if (dec === null) return;
      if (_catFilter    && ev.category !== _catFilter) return;
      if (_tagFilter    && !(ev.tags||[]).includes(_tagFilter)) return;
      if (_statusFilter && (ev.status||'') !== _statusFilter) return;
      if (_toneFilter   && (ev.tone||'') !== _toneFilter) return;
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
    g.font = 'bold 9px -apple-system, "Segoe UI", sans-serif';
    const pw = g.measureText(pillLbl).width + 10;
    const ph = 14;
    const px = pill.x - pw / 2, py = pill.y - ph + 2;
    g.beginPath();
    if (g.roundRect) g.roundRect(px, py, pw, ph, 7);
    else g.rect(px, py, pw, ph);
    g.fillStyle = 'rgba(80,96,200,0.84)'; g.fill();
    g.fillStyle = '#fff'; g.textAlign = 'center';
    g.fillText(pillLbl, pill.x, pill.y - 2);
    hits.push({ type: 'lbl_cluster', x: px, y: py, w: pw, h: ph, cx: pill.x, cy: pill.y, events: pill.events });
  });
}

/* =====================================================
   STORY LINE — connected path through all events
   ===================================================== */
function toggleStoryLine() {
  _storyLineVisible = !_storyLineVisible;
  const btn = document.getElementById('story-line-btn');
  if (btn) {
    if (_storyLineVisible) {
      btn.style.background = '#4a8fde';
      btn.style.borderColor = '#357bbf';
      btn.style.color = '#fff';
      btn.style.fontWeight = '700';
    } else {
      btn.style.background = '';
      btn.style.borderColor = '';
      btn.style.color = '';
      btn.style.fontWeight = '';
    }
  }
  render();
}

function drawStoryLine(c, g) {
  if (isVerticalTimelineLayout()) return;
  if (S.events.length === 0) return;

  const allEvs = S.events.concat(expandRecurringEvents ? expandRecurringEvents() : []);

  const pts = [];
  allEvs.forEach(function(ev) {
    if (ev.isPhantom) return;
    const u = getU(ev.universeId);
    if (!u || u.visible === false) return;
    const dec = parseDate(ev.date, ev.time);
    if (dec === null) return;
    const vi = getVisIdx(ev.universeId);
    if (vi < 0) return;
    if (_catFilter    && ev.category !== _catFilter) return;
    if (_tagFilter    && !(ev.tags||[]).includes(_tagFilter)) return;
    if (_statusFilter && (ev.status||'') !== _statusFilter) return;
    if (_toneFilter   && (ev.tone||'') !== _toneFilter) return;
    const sx  = ws(yw(dec));
    const dir = (vi % 2 === 0) ? -1 : 1;   // -1 = spike UP, 1 = spike DOWN
    pts.push({ dec, sx, vi, dir, color: u.color, ev });
  });

  if (pts.length === 0) return;
  pts.sort(function(a, b) { return a.dec - b.dec; });

  const baseY   = RULER_H + (c.height - RULER_H) / 2;
  const maxH    = Math.min(72, (c.height - RULER_H) * 0.30);
  const W       = c.width;
  const STEP    = 2;   // sample every 2px for smoothness

  // Adaptive sigma: based on median spacing between adjacent events in screen px
  var spacings = [];
  for (var k = 1; k < pts.length; k++) spacings.push(Math.abs(pts[k].sx - pts[k-1].sx));
  spacings.sort(function(a,b){return a-b;});
  var medSpacing = spacings.length ? spacings[Math.floor(spacings.length/2)] : 120;
  var sigma = Math.max(28, Math.min(60, medSpacing * 0.32));

  // Build waveform sample array
  var samples = [];
  for (var x = LEFT_W; x <= W; x += STEP) {
    var wv = 0;
    for (var j = 0; j < pts.length; j++) {
      var dx = x - pts[j].sx;
      wv += pts[j].dir * Math.exp(-(dx*dx) / (2*sigma*sigma));
    }
    samples.push({ x: x, wv: wv });
  }

  // Normalize so the loudest peak hits maxH
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
  } catch(e) { lineGrad = '#4a8fde'; }

  // --- Build the canvas path from samples ---
  function buildPath() {
    g.beginPath();
    for (var s = 0; s < samples.length; s++) {
      var sx2 = samples[s].x;
      var sy2 = baseY + samples[s].wv * scale;
      if (s === 0) g.moveTo(sx2, sy2); else g.lineTo(sx2, sy2);
    }
  }

  // Fill above-baseline area (upward spikes)
  buildPath();
  g.lineTo(W, baseY);
  g.lineTo(LEFT_W, baseY);
  g.closePath();
  g.globalAlpha = 0.10;
  g.fillStyle = lineGrad;
  g.fill();

  // Shadow / glow
  g.globalAlpha = 0.14;
  g.strokeStyle = 'rgba(30,30,120,0.8)';
  g.lineWidth = 8;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  buildPath();
  g.stroke();

  // Baseline rule
  g.globalAlpha = 0.22;
  g.strokeStyle = '#8090c0';
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
    var peakY = baseY + pt.dir * maxH;   // where this event's peak is

    // Vertical drop line from baseline to peak
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

    // Label (above peak if up, below if down)
    var labelY = (pt.dir === -1) ? peakY - 14 : peakY + 20;
    var label  = pt.ev.title.length > 16 ? pt.ev.title.slice(0,15) + '\u2026' : pt.ev.title;

    // Label background pill
    g.font = 'bold 9px -apple-system,sans-serif';
    g.textAlign = 'center';
    var tw = g.measureText(label).width;
    g.globalAlpha = 0.72;
    g.fillStyle = pt.color;
    var pillH = 14, pillW = tw + 10;
    g.beginPath();
    g.roundRect ? g.roundRect(pt.sx - pillW/2, labelY - pillH + 3, pillW, pillH, 7)
                : g.rect(pt.sx - pillW/2, labelY - pillH + 3, pillW, pillH);
    g.fill();

    g.globalAlpha = 1;
    g.fillStyle = '#ffffff';
    g.fillText(label, pt.sx, labelY);
  });

  g.textBaseline = 'alphabetic';
  g.globalAlpha = 1;
  g.restore();
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

    if (_tagFilter && !(ev.tags||[]).includes(_tagFilter)) {
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

    if (_toneFilter && (ev.tone || '') !== _toneFilter) {
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

    // Outer glow aura — soft halo emanating from the artifact dot
    g.beginPath(); g.arc(sx, sy, EV_R + 8, 0, Math.PI * 2);
    const auraGrad = g.createRadialGradient(sx, sy, EV_R - 1, sx, sy, EV_R + 8);
    auraGrad.addColorStop(0, u.color + '28');
    auraGrad.addColorStop(1, u.color + '00');
    g.fillStyle = auraGrad; g.fill();

    // Drop shadow
    g.beginPath(); g.arc(sx, sy + 2.5, EV_R + 1, 0, Math.PI * 2);
    g.fillStyle = 'rgba(0,0,0,0.10)'; g.fill();

    // White backing ring
    g.beginPath(); g.arc(sx, sy, EV_R + 2, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255,255,255,0.92)'; g.fill();

    // Main colored fill
    g.beginPath(); g.arc(sx, sy, EV_R, 0, Math.PI * 2);
    const dotGrad = g.createRadialGradient(sx - 2, sy - 2, 0, sx, sy, EV_R);
    dotGrad.addColorStop(0, u.color + 'ff');
    dotGrad.addColorStop(1, u.color + 'cc');
    g.fillStyle = dotGrad; g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1.5; g.stroke();

    // Inner highlight gleam
    g.beginPath(); g.arc(sx - 3, sy - 3, EV_R * 0.28, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.fill();

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
      g.lineWidth = 1.5; g.globalAlpha = 0.8;
      if (ev.status === 'Cancelled') { g.setLineDash([3,3]); }
      g.stroke();
      g.setLineDash([]);
      g.restore();
    }

    if (ev.subEvents && ev.subEvents.length > 0) {
      const bx = sx + EV_R - 1, by2 = sy - EV_R + 1;
      g.beginPath(); g.arc(bx, by2, 7, 0, Math.PI * 2);
      g.fillStyle = '#252535'; g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1; g.stroke();
      g.fillStyle = '#ffffff';
      g.font = 'bold 7px -apple-system, sans-serif'; g.textAlign = 'center';
      g.fillText(ev.subEvents.length > 9 ? '9+' : String(ev.subEvents.length), bx, by2 + 2.5);
    }

    if (ev.media && ev.media.length > 0) {
      const mx2 = sx - EV_R + 1, my2 = sy - EV_R + 1;
      g.beginPath(); g.arc(mx2, my2, 6, 0, Math.PI * 2);
      g.fillStyle = '#e8a010'; g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1; g.stroke();
      g.fillStyle = '#ffffff';
      g.font = 'bold 7px -apple-system, sans-serif'; g.textAlign = 'center';
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
      g.fillStyle = '#18182e';
      g.font = 'bold 10px -apple-system, "Segoe UI", sans-serif';
      g.textAlign = isVerticalTimelineLayout() ? 'left' : 'center';
      g.fillText(label, lx, ly);
      g.fillStyle = '#9098b0';
      g.font = '9px -apple-system, "Segoe UI", sans-serif';
      const dateLabel = (ev.date || '?') + (ev.time ? ' ' + ev.time : '');
      g.fillText(dateLabel, lx, ly + 12);

      const _chIds = ev.characterIds || [];
      if (_chIds.length > 0) {
        const maxD = Math.min(_chIds.length, 6);
        const dotR = 6, dotSp = 14;
        const totalDW = (maxD - 1) * dotSp;
        const dotY = ly + 28;
        for (let di = 0; di < maxD; di++) {
          const chd = S.characters.find(cc => cc.id === _chIds[di]);
          const col2 = chd ? (chd.color || charHashColor(chd.id)) : '#aaa';
          const cx2 = sx - totalDW/2 + di*dotSp;
          g.beginPath(); g.arc(cx2, dotY+1.5, dotR, 0, Math.PI*2);
          g.fillStyle = 'rgba(0,0,0,0.12)'; g.fill();
          g.beginPath(); g.arc(cx2, dotY, dotR, 0, Math.PI*2);
          g.fillStyle = col2; g.fill();
          g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke();
          if (chd && chd.name) {
            const init = chd.name.charAt(0).toUpperCase();
            g.fillStyle = 'rgba(255,255,255,0.92)';
            g.font = 'bold 6px -apple-system,sans-serif';
            g.textAlign = 'center';
            g.fillText(init, cx2, dotY + 2.5);
          }
        }
        if (_chIds.length > 6) {
          g.fillStyle = '#6070c0';
          g.font = 'bold 8px -apple-system,sans-serif'; g.textAlign = 'center';
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

function getUniverseRowAt(mx, my) {
  if (isVerticalTimelineLayout()) return null;
  if (mx < 0 || mx > LEFT_W || my < RULER_H) return null;
  let vi = 0;
  for (const u of S.universes) {
    if (u.visible === false) continue;
    const ty = trackY(vi);
    const top = ty - TRACK_H / 2;
    const bot = ty + TRACK_H / 2;
    if (my >= top && my <= bot) return { id: u.id, vi };
    vi++;
  }
  return null;
}

function isUniverseActionTarget(mx, my) {
  return hits.some(t => (t.type === 'u-hide' || t.type === 'u-edit' || t.type === 'u-info' || t.type === 'u-del') && mx >= t.x && mx <= t.x + t.w && my >= t.y && my <= t.y + t.h);
}

function visibleIndexFromClientY(clientY) {
  const c = CV();
  const r = c.getBoundingClientRect();
  const my = clientY - r.top;
  return clamp(Math.floor((my - RULER_H - V.panY) / TRACK_H), 0, Math.max(0, visCount() - 1));
}

function startUniverseDrag(uId, clientY) {
  uniDrag = { on: true, id: uId, sy: clientY, moved: false };
  CV().classList.add('dragging');
}

function moveUniverseToVisibleIndex(uId, targetVisIdx) {
  const fromIdx = S.universes.findIndex(u => u.id === uId);
  if (fromIdx < 0) return false;
  const currentVisIdx = getVisIdx(uId);
  if (currentVisIdx === targetVisIdx) return false;
  const moving = S.universes.splice(fromIdx, 1)[0];
  const visibleAfter = S.universes.filter(u => u.visible !== false);
  if (targetVisIdx >= visibleAfter.length) S.universes.push(moving);
  else {
    const beforeId = visibleAfter[targetVisIdx].id;
    const insertIdx = S.universes.findIndex(u => u.id === beforeId);
    S.universes.splice(insertIdx, 0, moving);
  }
  return true;
}

function updateUniverseDrag(clientY) {
  if (!uniDrag.on || !uniDrag.id) return;
  if (Math.abs(clientY - uniDrag.sy) > 4) uniDrag.moved = true;
  const targetVisIdx = visibleIndexFromClientY(clientY);
  if (moveUniverseToVisibleIndex(uniDrag.id, targetVisIdx)) {
    render(); updateUniToggleBar(); updateUniverseScrollbar();
  }
}

function finishUniverseDrag() {
  const didMove = uniDrag.moved;
  uniDrag = { on: false, id: null, sy: 0, moved: false };
  CV().classList.remove('dragging');
  if (didMove) { Store.autosave(); render(); updateUniToggleBar(); notify('Universe order updated ✓', 'success'); }
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
    if (typeof updateUniverseScrollbar === 'function') updateUniverseScrollbar();
  }

  /* Debounced resize — coalesces rapid mobile viewport/orientation events */
  var _resizeTimer = null;
  function scheduleResize() {
    if (_resizeTimer) return;
    _resizeTimer = setTimeout(function() { _resizeTimer = null; resize(); }, 80);
  }

  /* Expose globally so mobile controls can trigger canvas resize */
  window._tlResize = resize;

  /* Primary: ResizeObserver fires on any size change (address bar, rotation, filters) */
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(scheduleResize).observe(wrap);
  }

  /* Secondary: standard resize event */
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

  // ---- Wheel: unified preventDefault policy ----
  // Only intercept the wheel when the cursor is inside the canvas AND the user
  // is signalling an explicit timeline gesture (modifier or dominant horizontal
  // trackpad swipe). Otherwise the page scrolls naturally.
  c.addEventListener('wheel', e => {
    const r  = c.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    const inside = mx >= 0 && my >= 0 && mx <= r.width && my <= r.height;
    const horizDominant = Math.abs(e.deltaX) > Math.abs(e.deltaY) * 2;
    const wantsZoom = e.ctrlKey || e.metaKey;
    const wantsVPan = e.shiftKey;
    const altPan    = e.altKey;
    if (!inside || !(wantsZoom || wantsVPan || altPan || horizDominant)) return;

    e.preventDefault();

    if (!isVerticalTimelineLayout() && mx < LEFT_W && my > RULER_H && wantsVPan) {
      // Left universe panel + Shift+scroll → resize rows
      const delta = e.deltaY < 0 ? 10 : -10;
      TRACK_H = clamp(TRACK_H + delta, 60, 200);
      const sl = document.getElementById('track-h-slider');
      const tv = document.getElementById('track-h-val');
      if (sl) sl.value = TRACK_H;
      if (tv) tv.textContent = TRACK_H;
      clampPanY();
      render();
      updateUniverseScrollbar();
    } else if (wantsZoom) {
      const fac = e.deltaY < 0 ? 1.1 : 0.909;
      doZoom(fac, primaryScreenCoord(mx, my));
    } else if (wantsVPan) {
      V.panY -= e.deltaY;
      clampPanY();
      render();
      updateUniverseScrollbar();
    } else {
      // altPan or horizontal-dominant trackpad swipe
      const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
      V.panX -= delta;
      clampPanX();
      render();
    }
  }, { passive: false });

  // ---- Pointer Events: unified mouse + touch + pen ----
  // Single Pointer Events implementation handles all input types. Mouse pan,
  // touch pan, two-finger pinch, click hit-test, hover tooltips and the
  // universe-row reorder drag in the left panel all flow through this block.
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
    let drag       = null;        // {pointerId,sx,sy,px,py,cx,cy,t,moved,axis,recent,reorder}
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

        /* Preserve universe-row reorder drag from the left panel. */
        const uRow = (typeof getUniverseRowAt === 'function') ? getUniverseRowAt(p.cx, p.cy) : null;
        if (uRow && (typeof isUniverseActionTarget !== 'function' || !isUniverseActionTarget(p.cx, p.cy))) {
          startUniverseDrag(uRow.id, e.clientY);
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
        // Long-press → add event is a touch/pen affordance only; mouse users
        // get double-click for that.
        if (isTouch(e)) {
          cancelLong();
          longTimer = setTimeout(() => {
            if (!drag || drag.reorder || drag.moved) return;
            longFired = true; cancelLong();
            if (isInPlotArea(drag.cx, drag.cy)) {
              let bestId = null, bestDist = Infinity, vi = 0;
              S.universes.forEach(u => {
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
        if (drag && drag.reorder && typeof finishUniverseDrag === 'function') finishUniverseDrag();
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

      /* Universe row drag takes priority while active. */
      if (drag && drag.reorder && drag.pointerId === e.pointerId && pointers.size === 1) {
        if (typeof updateUniverseDrag === 'function') updateUniverseDrag(e.clientY);
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
            V.panX = drag.px + dy;
            clampPanX();
            render();
          } else if (drag.axis === 'universe') {
            V.panY = drag.py + dx;
            clampPanY();
            render();
            updateUniverseScrollbar();
          }
        } else {
          V.panX = drag.px + dx;
          V.panY = drag.py + dy;
          clampPanX(); clampPanY();
          render();
          updateUniverseScrollbar();
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
        if (wasReorder && pointers.size === 0 && typeof finishUniverseDrag === 'function') finishUniverseDrag();
        if (pointers.size === 0) drag = null;
        return;
      }

      cancelLong();

      if (drag.reorder) {
        if (typeof finishUniverseDrag === 'function') finishUniverseDrag();
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
    S.universes.forEach(u => {
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
            ? `Delete "${u ? u.name : 'universe'}" and its ${evCnt} event${evCnt !== 1 ? 's' : ''}?`
            : `Delete "${u ? u.name : 'universe'}"?`;
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
  const c = CV();
  const mxF = mouseX != null ? mouseX : centerX();
  const wx0 = sw(mxF);
  const minSc = getMinScale();
  V.scale = clamp(V.scale * factor, minSc, MAX_SC);
  V.panX  = mxF - centerX() - wx0 * V.scale;
  clampPanX();
  document.getElementById('zoom-pct').textContent = formatZoomPercent();
  render();
}

function resetView() {
  fitFullTimeline();
  render();
  updateUniverseScrollbar();
}

function fitFullTimeline() {
  V.scale = getMinScale();
  V.panX = 0;
  clampPanX();
  document.getElementById('zoom-pct').textContent = formatZoomPercent();
}

function formatZoomPercent() {
  const pct = V.scale * 100;
  if (pct < 0.01) return pct.toFixed(4) + '%';
  if (pct < 1) return pct.toFixed(2) + '%';
  return Math.round(pct) + '%';
}

function goToToday() {
  const now = new Date();
  const todayDec = now.getFullYear() + now.getMonth() / 12 + now.getDate() / 365;
  const targetPanX = -yw(todayDec) * V.scale;
  const startPanX = V.panX;

  // Resolve clamped target without changing current state
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
    updateUniverseScrollbar();
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

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
      updateUniverseScrollbar();
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
      updateUniverseScrollbar();
      this._renderSpotlight(this.items[this.idx]);
      if (t < 1 && this.active) this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  },

  _renderCard(item) {
    const title = document.getElementById('continuity-tour-title');
    const meta = document.getElementById('continuity-tour-meta');
    const desc = document.getElementById('continuity-tour-desc');
    const universe = getU(item.ev.universeId);
    if (title) title.textContent = item.ev.title || 'Untitled event';
    if (meta) meta.textContent = (item.dateLabel || 'Date not set') + (universe ? '  •  ' + universe.name : '');
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

/* =====================================================
   B-1: MEMORY TOUR (ported from Biography)
   Sibling to ContinuityTour — slower, gentler chronological
   playback. Reuses the same .tour-* CSS already in the page.
   ===================================================== */
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
    if (ContinuityTour.active) ContinuityTour.stop(false);
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
   UNIVERSE VERTICAL SCROLLBAR
   ===================================================== */
let _uniSbDrag = false;
let _uniSbDragStartY = 0;
let _uniSbDragStartPanY = 0;

function updateUniverseScrollbar() {
  const bar = document.getElementById('uni-scrollbar');
  const thumb = document.getElementById('uni-scrollbar-thumb');
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

function initUniverseScrollbar() {
  const bar = document.getElementById('uni-scrollbar');
  const thumb = document.getElementById('uni-scrollbar-thumb');
  if (!bar || !thumb) return;

  thumb.addEventListener('mousedown', e => {
    e.preventDefault();
    e.stopPropagation();
    _uniSbDrag = true;
    _uniSbDragStartY = e.clientY;
    _uniSbDragStartPanY = V.panY;
    bar.classList.add('dragging');
  });

  window.addEventListener('mousemove', e => {
    if (!_uniSbDrag) return;
    e.preventDefault();
    const dy = e.clientY - _uniSbDragStartY;
    const barEl = document.getElementById('uni-scrollbar');
    const thumbEl = document.getElementById('uni-scrollbar-thumb');
    const barH = barEl.clientHeight;
    const thumbH = thumbEl.clientHeight;
    const maxThumbTop = barH - thumbH;
    if (maxThumbTop <= 0) return;

    const c = CV();
    const viewH = c.height - RULER_H;
    const totalH = visCount() * TRACK_H + 24;
    const minPY = Math.min(0, viewH - totalH);

    const newFrac = clamp((_uniSbDragStartPanY / (minPY || -1)) + dy / maxThumbTop, 0, 1);
    V.panY = newFrac * minPY;
    clampPanY();
    render();
    updateUniverseScrollbar();
  });

  window.addEventListener('mouseup', () => {
    if (_uniSbDrag) {
      _uniSbDrag = false;
      bar.classList.remove('dragging');
    }
  });

  bar.addEventListener('click', e => {
    if (e.target === thumb) return;
    const barRect = bar.getBoundingClientRect();
    const clickY = e.clientY - barRect.top;
    const barH = bar.clientHeight;
    const thumbEl = document.getElementById('uni-scrollbar-thumb');
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
    clampPanY();
    render();
    updateUniverseScrollbar();
  });

  updateUniverseScrollbar();
}

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
    el.innerHTML = '<div style="font-size:12px;color:#bbb;padding:3px 0 6px">No attachments yet.</div>';
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
    '<div id="ml-display"></div>' +
    '<div class="media-add-area">' +
    '<div class="media-row">' +
    '<button type="button" class="btn light sm" onclick="document.getElementById(\'media-file-in\').click()">\uD83D\uDDBC Add Image</button>' +
    '<input type="file" id="media-file-in" accept="image/*" style="display:none" onchange="addImageMedia(event)">' +
    '<span style="font-size:11px;color:#bbb">(stored in browser &mdash; keep images under 5 MB)</span>' +
    '</div>' +
    '<div class="media-row">' +
    '<input id="yt-input" class="mi" placeholder="YouTube URL, video link, or any URL\u2026" style="flex:1">' +
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
const M = {
  bg:   () => document.getElementById('modal-bg'),
  crumb:() => document.getElementById('m-crumb'),
  ttl:  () => document.getElementById('m-title'),
  btns: () => document.getElementById('m-btns'),
  body: () => document.getElementById('m-body'),
  foot: () => document.getElementById('m-foot'),

  open()  { this.bg().classList.add('open'); document.body.classList.add('modal-open'); },
  close() { this.bg().classList.remove('open'); document.body.classList.remove('modal-open'); MS = []; },
  back()  {
    MS.pop();
    if (MS.length === 0) this.close(); else this.render();
  },

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
  push(frame) { if (typeof ContinuityTour !== 'undefined' && ContinuityTour.active) ContinuityTour.stop(false); if (typeof MemoryTour !== 'undefined' && MemoryTour.active) MemoryTour.stop(false); MS.push(frame); this.open(); this.render(); },
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

    const toneBadge = ev.tone
      ? '<span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:10px;background:' + toneColor(ev.tone) + '22;color:' + toneColor(ev.tone) + ';font-size:12px;font-weight:700;border:1px solid ' + toneColor(ev.tone) + '55;margin-left:6px">' + toneIcon(ev.tone) + ' ' + esc(ev.tone) + '</span>'
      : '';

    const recBadge = ev.recurring && ev.recurring.frequency
      ? '<span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:10px;background:#eef2ff;color:#4a4f9f;font-size:12px;font-weight:700;border:1px solid #b8c0ff;margin-left:6px">&#128257; ' + esc(ev.recurring.frequency === 'century' ? 'century-based' : ev.recurring.frequency) + '</span>'
      : '';

    this.body().innerHTML =
      '<div class="ev-date">&#128197; ' + esc(ev.date || '??/??/????') + (ev.time ? ' at ' + esc(ev.time) : '') + '</div>' +
      '<div style="margin-bottom:8px;display:flex;flex-wrap:wrap;align-items:center;gap:4px">' +
        '<span class="ev-badge" style="background:' + col + '">' + esc(u ? u.name : '?') + '</span>' +
        catBadge +
        stBadge +
        toneBadge +
        recBadge +
      '</div>' +
      (ev.tags && ev.tags.length ? '<div class="ev-tags">' + ev.tags.map(function(t){return '<span class="ev-tag">' + esc(t) + '</span>';}).join('') + '</div>' : '') +
      '<div class="ev-desc">' + (ev.description ? esc(ev.description) : '<em style="color:#ccc">No description.</em>') + '</div>' +
      buildNotesDisplay(ev.notes) +
      buildMediaDisplay(ev.media) +
      (conns.length ? buildConnsSection(conns) : '') +
      buildSESection(ev.id, ev.subEvents || [], []);

    this.foot().innerHTML =
      '<button class="btn light" onclick="M.push({t:\'conns\',evId:\'' + ev.id + '\'})">&#128279; Connections</button>' +
      '<button class="btn danger" onclick="delEvent(\'' + ev.id + '\')">&#128465; Delete Event</button>' +
      '<button class="btn light" onclick="M.close()">Close</button>';
  },

  /* ---- Sub-event Detail ---- */
  /* Improvement #1: fully recursive — works at any depth, shows sub-events of sub-events */
  _seDetail(top) {
    const ev = S.events.find(e => e.id === top.evId); if (!ev) return;
    let node = ev; const crumbs = [ev.title];
    for (const segId of top.path) {   /* UE-12: id path, not index */
      if (!node.subEvents) return;
      node = node.subEvents.find(s => s && s.id === segId); if (!node) return;
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
    const uOpts = S.universes.map(u =>
      '<option value="' + u.id + '"' + (u.id === top.uId ? ' selected' : '') + '>' + esc(u.name) + '</option>'
    ).join('');
    this.body().innerHTML =
      '<div class="fg"><label>Title <span style="color:#e74c3c">*</span></label>' +
      '<input id="ae-t" placeholder="e.g. Civil War" value="' + esc(top.title || '') + '"></div>' +
      '<div class="fg"><label>Date <span style="color:#e74c3c">*</span> &nbsp;<span style="font-weight:400;color:#999">(dd/mm/yyyy \u2014 use X for unknown parts)</span></label>' +
      '<input id="ae-d" placeholder="xx/xx/2006" value="' + esc(top.date || '') + '">' +
      '<div class="hint">Examples: 15/06/2006 &bull; xx/xx/2006 &bull; xx/xx/-50000 (BC) &bull; xx/xx/100000 (future)</div></div>' +
      '<div class="fg"><label>Time <span style="font-weight:400;color:#aaa">(optional, HH:MM)</span></label>' +
      '<input id="ae-time" type="time" value="" style="width:140px">' +
      '<div class="hint">Add a specific time of day if needed</div></div>' +
      '<div class="fg"><label>Universe <span style="color:#e74c3c">*</span></label>' +
      '<select id="ae-u">' + (uOpts || '<option value="">\u2014 Create a universe first \u2014</option>') + '</select></div>' +
      '<div class="fg"><label>Category</label>' +
      '<select id="ae-cat"><option value="">— None —</option>' +
      Object.keys(CATEGORIES).map(c => '<option value="' + c + '">' + CATEGORIES[c].icon + ' ' + c + '</option>').join('') +
      '</select></div>' +
      '<div class="fg"><label>Status <span style="font-weight:400;color:#aaa">(optional)</span></label>' +
      '<select id="ae-status"><option value="">— None —</option>' +
      UNI_STATUSES.map(s => '<option value="' + s + '">' + s + '</option>').join('') +
      '</select></div>' +
      '<div class="fg"><label>Tone / Mood <span style="font-weight:400;color:#aaa">(optional)</span></label>' +
      '<select id="ae-tone"><option value="">— None —</option>' +
      TONE_OPTIONS.map(t => '<option value="' + t + '">' + toneIcon(t) + ' ' + t + '</option>').join('') +
      '</select></div>' +
      '<div class="fg"><label>Recurrence <span style="font-weight:400;color:#aaa">(optional)</span></label>' +
      '<select id="ae-recurring"><option value="">— None —</option>' +
      '<option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="century">Century-based</option>' +
      '</select><div class="hint">Creates semi-transparent repeat dots on the canvas, capped at 500.</div></div>' +
      '<div class="fg"><label>Tags <span style="font-weight:400;color:#aaa">(comma separated)</span></label>' +
      '<input id="ae-tags" type="text" placeholder="e.g. origin, battle, cosmic, key moment"></div>' +
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
    const uOpts = S.universes.map(u =>
      '<option value="' + u.id + '"' + (u.id === ev.universeId ? ' selected' : '') + '>' + esc(u.name) + '</option>'
    ).join('');
    const catOpts = '<option value="">— None —</option>' +
      Object.keys(CATEGORIES).map(c =>
        '<option value="' + c + '"' + (ev.category === c ? ' selected' : '') + '>' + CATEGORIES[c].icon + ' ' + c + '</option>'
      ).join('');
    const recOpts = '<option value="">— None —</option>' +
      [['weekly','Weekly'],['monthly','Monthly'],['yearly','Yearly'],['century','Century-based']].map(function(pair) {
        return '<option value="' + pair[0] + '"' + ((ev.recurring && ev.recurring.frequency) === pair[0] ? ' selected' : '') + '>' + pair[1] + '</option>';
      }).join('');
    this.body().innerHTML =
      '<div class="fg"><label>Title *</label><input id="ee-t" value="' + esc(ev.title) + '"></div>' +
      '<div class="fg"><label>Date (dd/mm/yyyy \u2014 X for unknown)</label>' +
      '<input id="ee-d" value="' + esc(ev.date || '') + '"></div>' +
      '<div class="fg"><label>Time <span style="font-weight:400;color:#aaa">(optional, HH:MM)</span></label>' +
      '<input id="ee-time" type="time" value="' + esc(ev.time || '') + '" style="width:140px"></div>' +
      '<div class="fg"><label>Universe</label><select id="ee-u">' + uOpts + '</select></div>' +
      '<div class="fg"><label>Category</label><select id="ee-cat">' + catOpts + '</select></div>' +
      '<div class="fg"><label>Status <span style="font-weight:400;color:#aaa">(optional)</span></label>' +
      '<select id="ee-status"><option value="">— None —</option>' +
      UNI_STATUSES.map(s => '<option value="' + s + '"' + (ev.status === s ? ' selected' : '') + '>' + s + '</option>').join('') +
      '</select></div>' +
      '<div class="fg"><label>Tone / Mood <span style="font-weight:400;color:#aaa">(optional)</span></label>' +
      '<select id="ee-tone"><option value="">— None —</option>' +
      TONE_OPTIONS.map(t => '<option value="' + t + '"' + (ev.tone === t ? ' selected' : '') + '>' + toneIcon(t) + ' ' + t + '</option>').join('') +
      '</select></div>' +
      '<div class="fg"><label>Recurrence <span style="font-weight:400;color:#aaa">(optional)</span></label>' +
      '<select id="ee-recurring">' + recOpts + '</select>' +
      '<div class="hint">Creates semi-transparent repeat dots on the canvas, capped at 500.</div></div>' +
      '<div class="fg"><label>Tags <span style="font-weight:400;color:#aaa">(comma separated)</span></label>' +
      '<input id="ee-tags" type="text" value="' + esc((ev.tags||[]).join(', ')) + '" placeholder="e.g. origin, battle, cosmic, key moment"></div>' +
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
    for (const segId of top.path) { if (!node.subEvents) return; node = node.subEvents.find(s => s && s.id === segId); if (!node) return; }  /* UE-12: id path */
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
    this.ttl().textContent   = '\uD83D\uDD17 Connections';
    ensureConnStylePresets();
    const existing = S.connections.filter(c => c.fromEventId === ev.id || c.toEventId === ev.id);
    const others   = S.events.filter(e => e.id !== ev.id);
    const opts = others.map(e => {
      const u = getU(e.universeId);
      return '<option value="' + e.id + '">[' + esc(u ? u.name : '?') + '] ' + esc(e.title) + '</option>';
    }).join('');
    const existingHTML = existing.length === 0
      ? '<div style="color:#ccc;font-size:12px;padding:4px 0">No connections yet.</div>'
      : existing.map(cn => {
          const othId = cn.fromEventId === ev.id ? cn.toEventId : cn.fromEventId;
          const oe = S.events.find(e => e.id === othId);
          const ou = oe ? getU(oe.universeId) : null;
          const fallbackCol = ou ? ou.color : '#aaa';
          const cc = getConnColor(cn, fallbackCol);
          const cw = getConnWidth(cn);
          const co = Math.round(getConnOpacity(cn) * 100);
          const dashSel = getConnDashed(cn) ? 'dashed' : 'solid';
          return '<div class="conn-item" style="align-items:flex-start;flex-wrap:wrap">' +
            '<span class="conn-dot" style="background:' + cc + ';margin-top:5px"></span>' +
            '<span style="flex:1;min-width:170px"><strong>' + esc(oe ? oe.title : 'Unknown') + '</strong>' +
              (cn.label ? '<br><em style="font-size:11px;color:#aaa">' + esc(cn.label) + '</em>' : '') + '</span>' +
            '<button class="btn danger sm" onclick="delConn(\'' + cn.id + '\',\'' + ev.id + '\')">&#10005;</button>' +
            '<div style="flex-basis:100%;display:grid;grid-template-columns:90px 1fr;gap:8px;align-items:center;margin-left:18px;margin-top:8px;font-size:11px;color:#777">' +
              '<label>Colour</label><input type="color" id="cn-col-' + cn.id + '" value="' + cc + '" onchange="updateConnStyle(\'' + cn.id + '\')">' +
              '<label>Thickness</label><input type="range" id="cn-w-' + cn.id + '" min="0.5" max="10" step="0.5" value="' + cw + '" oninput="updateConnStyle(\'' + cn.id + '\')">' +
              '<label>Visibility</label><input type="range" id="cn-o-' + cn.id + '" min="8" max="100" step="1" value="' + co + '" oninput="updateConnStyle(\'' + cn.id + '\')">' +
              '<label>Style</label><select id="cn-d-' + cn.id + '" onchange="updateConnStyle(\'' + cn.id + '\')"><option value="dashed"' + (dashSel === 'dashed' ? ' selected' : '') + '>Dashed</option><option value="solid"' + (dashSel === 'solid' ? ' selected' : '') + '>Solid</option></select>' +
              '<label>Preset</label><div style="display:flex;gap:6px;align-items:center"><select id="cn-preset-' + cn.id + '">' + buildConnPresetOptions(cn.presetId || '') + '</select><button class="btn sm light" onclick="applyConnPresetToConn(\'' + cn.id + '\')">Apply</button><button class="btn sm" onclick="saveConnPresetFromConn(\'' + cn.id + '\')">Save</button></div>' +
            '</div></div>';
        }).join('');
    const presetToolsHTML = '<div style="margin-bottom:16px;padding:10px;border:1px solid #e6e6ee;border-radius:8px;background:#fafbff">' +
      '<div class="sec-hd"><h3>Style Presets</h3></div>' +
      '<div style="font-size:11px;color:#888;margin-bottom:8px">Apply a saved line style, save your current settings as a reusable preset, or move presets between timeline files.</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px">' +
      '<button class="btn sm light" onclick="exportConnStylePresets()">Export Presets</button>' +
      '<button class="btn sm light" onclick="importConnStylePresets()">Import Presets</button>' +
      '<button class="btn sm" onclick="saveNewConnStyleAsPreset()">Save New Connection Style</button>' +
      '</div></div>';
    this.body().innerHTML =
      presetToolsHTML +
      '<div style="margin-bottom:18px"><div class="sec-hd"><h3>Existing (' + existing.length + ')</h3></div>' + existingHTML + '</div>' +
      '<div style="border-top:1px solid #eee;padding-top:16px"><div class="sec-hd"><h3>Add New Connection</h3></div>' +
      '<div class="fg"><label>Connect to Event</label><select id="cn-to">' + (opts || '<option>No other events</option>') + '</select></div>' +
      '<div class="fg"><label>Label (optional)</label><input id="cn-lb" placeholder="e.g. Causes, Related to, Leads to..."></div>' +
      '<div class="fg"><label>Preset</label><select id="cn-new-preset" onchange="applyConnPresetToNew(this.value)">' + buildConnPresetOptions('') + '</select><div class="hint">Choose a reusable line style, or adjust the controls below manually.</div></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
      '<div class="fg"><label>Line colour</label><input type="color" id="cn-new-color" value="' + (getU(ev.universeId) ? getU(ev.universeId).color : '#7080f0') + '"></div>' +
      '<div class="fg"><label>Line style</label><select id="cn-new-dash"><option value="dashed">Dashed</option><option value="solid">Solid</option></select></div>' +
      '</div>' +
      '<div class="fg"><label>Thickness</label><input type="range" id="cn-new-width" min="0.5" max="10" step="0.5" value="1.5"></div>' +
      '<div class="fg"><label>Visibility</label><input type="range" id="cn-new-opacity" min="8" max="100" step="1" value="42"></div></div>';
    this.foot().innerHTML =
      '<button class="btn light" onclick="M.back()">Back</button>' +
      '<button class="btn accent" onclick="addConn(\'' + ev.id + '\')">Add Connection</button>';
  },

  /* ---- Add Universe ---- */
  _addUni(top) {
    const col = top.color || PALETTE[S.universes.length % PALETTE.length];
    this.crumb().textContent = '';
    this.ttl().textContent   = '+ New Universe';
    this.body().innerHTML =
      '<div class="fg"><label>Name *</label>' +
      '<input id="au-n" placeholder="e.g. Marvel 616, MCU, DC Rebirth..." value="' + esc(top.name || '') + '"></div>' +
      '<div class="fg"><label>Colour</label>' +
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:4px">' +
      '<input type="color" id="au-c" value="' + col + '"></div>' +
      '<div class="swatches">' + PALETTE.map(c2 =>
        '<div class="swatch" style="background:' + c2 + '" onclick="document.getElementById(\'au-c\').value=\'' + c2 + '\'"></div>'
      ).join('') + '</div></div>' +
      '<div class="fg"><label>Description <span style="font-weight:400;color:#aaa">(what is this universe about?)</span></label>' +
      '<textarea id="au-desc" placeholder="e.g. The main Marvel comics continuity, spanning 1961 to present. Heroes, villains, cosmic events..." style="min-height:72px"></textarea></div>' +
      '<div class="fg"><label>\uD83D\uDCDD Observations &amp; Notes <span style="font-weight:400;color:#aaa">(personal notes, themes, comparisons...)</span></label>' +
      '<textarea id="au-notes" placeholder="Personal observations about this universe..." style="min-height:58px"></textarea></div>';
    this.foot().innerHTML =
      '<button class="btn light" onclick="M.close()">Cancel</button>' +
      '<button class="btn accent" onclick="submitAddUni()">Create Universe</button>';
  },

  /* ---- Edit Universe ---- */
  _editUni(top) {
    const u = getU(top.uId); if (!u) return;
    this.crumb().textContent = '';
    this.ttl().textContent   = '&#9998; Edit Universe';
    this.body().innerHTML =
      '<div class="fg"><label>Name *</label><input id="eu-n" value="' + esc(u.name) + '"></div>' +
      '<div class="fg"><label>Colour</label>' +
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:4px">' +
      '<input type="color" id="eu-c" value="' + u.color + '"></div>' +
      '<div class="swatches">' + PALETTE.map(c2 =>
        '<div class="swatch" style="background:' + c2 + '" onclick="document.getElementById(\'eu-c\').value=\'' + c2 + '\'"></div>'
      ).join('') + '</div></div>' +
      '<div class="fg"><label>Description</label>' +
      '<textarea id="eu-desc" placeholder="Describe this universe..." style="min-height:72px">' + esc(u.description || '') + '</textarea></div>' +
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
    this.crumb().textContent = 'Universes';
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
        '</div>' +
      '</div>' +

      '<div class="uni-stat-row">' +
        '<div class="uni-stat-card"><div class="uni-stat-val">' + evs.length + '</div><div class="uni-stat-label">EVENTS</div></div>' +
        '<div class="uni-stat-card"><div class="uni-stat-val">' + charIds.size + '</div><div class="uni-stat-label">CHARACTERS</div></div>' +
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
        '<span style="font-size:11px;color:#bbb;margin-left:8px">Restores the original 9 categories</span>' +
      '</div>';
    this.foot().innerHTML =
      '<button class="btn light" onclick="M.close()">Cancel</button>' +
      '<button class="btn accent" onclick="catEditorSave()">Save Changes</button>';
  },

  /* ---- Organization Editor (B-9 ported from Biography: UI rename only,
         schema field `affiliation` and S.affiliations array unchanged) ---- */
  _affiliationEditor(top) {
    this.crumb().textContent = '';
    this.ttl().textContent   = '\uD83C\uDFE2 Organization Editor';
    const affs = S.affiliations || [];
    const affRows = affs.map((aff, idx) =>
      '<div style="display:flex;align-items:center;gap:8px;padding:9px 12px;border:1px solid #ebebeb;border-radius:8px;margin-bottom:7px;background:#fafbfd">' +
        '<input id="aff-name-' + idx + '" value="' + esc(aff) + '" style="flex:1;padding:5px 9px;border:1px solid #d6d6d6;border-radius:5px;font-size:13px;font-family:inherit" placeholder="Organization name">' +
        '<span style="font-size:10px;color:#aaa;white-space:nowrap;min-width:60px;text-align:right">' +
          S.characters.filter(c => c.affiliation === aff).length + ' character(s)' +
        '</span>' +
        '<button class="btn danger sm" onclick="affiliationEditorRemove(' + idx + ')" title="Delete organization">&times;</button>' +
      '</div>'
    ).join('');
    this.body().innerHTML =
      '<div style="margin-bottom:14px;font-size:13px;color:#666;line-height:1.6">' +
        'Manage the list of organizations and groups that can be selected on a character. Add, rename, or remove entries here.' +
      '</div>' +
      '<div id="aff-list">' + (affRows || '<div style="color:#ccc;font-size:13px;padding:12px 0">No organizations yet. Add one below.</div>') + '</div>' +
      '<div style="border-top:1px solid #eee;padding-top:14px;margin-top:8px">' +
        '<div style="display:flex;gap:8px;align-items:center">' +
          '<input id="aff-new-name" placeholder="New organization name..." style="flex:1;padding:5px 9px;border:1px solid #d6d6d6;border-radius:5px;font-size:13px;font-family:inherit">' +
          '<button class="btn accent sm" onclick="affiliationEditorAdd()">&#65291; Add</button>' +
        '</div>' +
      '</div>';
    this.foot().innerHTML =
      '<button class="btn light" onclick="M.close()">Cancel</button>' +
      '<button class="btn accent" onclick="affiliationEditorSave()">Save Changes</button>';
  },

  /* ---- Help (Observatory Manual v8 — premium, searchable, accessible) ---- */
  _help() {
    this.crumb().textContent = '';
    this.ttl().textContent   = '✦ Observatory Manual — Free Timeline Universe';
    this.body().innerHTML = obsHelpMarkup();
    // Focus management + search wiring (next frame so DOM is present)
    requestAnimationFrame(() => { try { obsHelpInit(); } catch(_){} });
    this.foot().innerHTML =
      '<button class="btn light" onclick="M.close()">Close</button>' +
      '<button class="btn accent" style="font-size:15px;padding:9px 30px;" onclick="M.close()">&#10003; Got it &mdash; let\'s go!</button>';
  },

  /* ---- Character List ---- */
  _charList(top) {
    const q = (top.q || '').toLowerCase();
    this.crumb().textContent = '';
    this.ttl().textContent   = '⬡ Characters — Dossiers & Profiles';
    const eb = document.createElement('button');
    eb.className = 'btn accent'; eb.innerHTML = '&#65291; New Dossier';
    eb.onclick = () => { MS.push({ t: 'addChar' }); M.render(); };
    this.btns().insertBefore(eb, this.btns().firstChild);
    let chars = S.characters.filter(c =>
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
      S.characters.forEach(ch => {
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
    const sortBtnU = '<button class="btn sm ' + (_charSortOrder==='universe'?'accent':'light') + '" onclick="_setSortOrder(\'universe\');M.render()">Universe</button>';
    
    this.body().innerHTML =
      '<div style="margin-bottom:10px;display:flex;gap:5px;align-items:center"><span style="font-size:11px;color:#999;white-space:nowrap">Sort by:</span>' + sortBtnA + sortBtnE + sortBtnU + '</div>' +
      '<input class="char-search" id="char-search-q" placeholder="\uD83D\uDD0D Search characters\u2026" value="' + esc(top.q || '') + '" oninput="_charSearchUpdate()">' +
      (chars.length === 0
        ? '<div style="color:#ccc;font-size:13px;padding:12px 2px">' +
          (S.characters.length === 0
            ? 'No dossiers yet. Click <strong>+ New Dossier</strong> to add your first character.'
            : 'No matching dossiers found.') + '</div>'
        : '<div><div style="font-size:11px;color:#999;margin:8px 0 6px;padding:0 2px"><strong>' + chars.length + '</strong> character' + (chars.length!==1?'s':'') + '</div>' +
          chars.map(c => buildCharCard(c)).join('') + '</div>'
      ) +
      (S.characters.length > 0 ? '<div style="border-top:1px solid #eee;margin-top:12px;padding-top:12px">' + buildCharStats() + '</div>' : '');
    this.foot().innerHTML = '<button class="btn light" onclick="M.close()">Close</button>';
  },

  /* ---- Character Detail ---- */
  _charDetail(top) {
    const ch = S.characters.find(c => c.id === top.charId); if (!ch) return;
    this.crumb().textContent = 'Characters';
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

    const statusColors = { 'Alive': '#2ecc71', 'Deceased': '#e74c3c', 'Unknown': '#95a5a6', 'Other': '#f39c12' };
    const sCol = statusColors[ch.status] || '#95a5a6';

    const photoHTML = ch.photo
      ? '<img class="char-profile-photo" src="' + esc(ch.photo) + '" onclick="openLightbox(this.src)" title="Click to enlarge">'
      : '<div class="char-photo-placeholder">\u{1F464}</div>';

    const counterpartsHTML = (ch.counterpartIds || []).map(cid => {
      const cc = S.characters.find(c => c.id === cid); if (!cc) return '';
      const cpRel = ((ch.counterpartRelations || {})[cid] || 'Related');
      const relationshipColors = { 'Ally': '#3498db', 'Enemy': '#e74c3c', 'Rival': '#f39c12', 'Family': '#e91e63', 'Mentor': '#9c27b0', 'Related': '#95a5a6' };
      const relCol = relationshipColors[cpRel] || '#95a5a6';
      const ccUnis = getCharUniverseIds(cc).map(uid => { const u = getU(uid); return u ? '<span class="char-uni-tag" style="background:' + u.color + '">' + esc(u.name) + '</span>' : ''; }).join('');
      const ccAvatarHTML = cc.photo
        ? '<img style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid #eee" src="' + esc(cc.photo) + '">'
        : '<div class="char-avatar" style="width:32px;height:32px;font-size:14px;flex-shrink:0">' + esc(charInitials(cc.name)) + '</div>';
      return '<div class="char-counterpart" data-cid="' + cid + '" onclick="_openCharDetail(this.dataset.cid)">' +
        ccAvatarHTML + '<div><div style="font-size:12px;font-weight:600;color:#222">' + esc(cc.name) + '</div>' +
        '<div style="display:flex;gap:3px;flex-wrap:wrap;margin-top:2px;align-items:center">' + ccUnis + '<span style="display:inline-block;padding:1px 6px;border-radius:8px;font-size:9px;background:' + relCol + ';color:#fff;font-weight:700">' + esc(cpRel) + '</span></div></div></div>';
    }).join('');

    const charEvCount = S.events.filter(e => (e.characterIds||[]).includes(ch.id)).length;

    const alignmentColors = { 'Hero': '#2ecc71', 'Villain': '#e74c3c', 'Neutral': '#95a5a6' };
    const alignCol = alignmentColors[ch.alignment] || '#95a5a6';
    const _hdAccent = ch.color || (uniIds.length ? ((getU(uniIds[0])||{}).color || '#4a8fde') : '#4a8fde');

    this.body().innerHTML =
      '<div class="char-profile-hd" style="--cv-accent:' + _hdAccent + '">' +
        '<div class="char-photo-wrap">' + photoHTML + '</div>' +
        '<div class="char-profile-meta">' +
          '<div class="char-profile-name">' + esc(ch.name) + '</div>' +
          (ch.aliases ? '<div class="char-profile-aliases">aka ' + esc(ch.aliases) + '</div>' : '') +
          '<div style="margin-bottom:6px;">' +
            (ch.status ? '<span class="char-status-badge" style="background:' + sCol + '">' + esc(ch.status) + '</span>' : '') +
            (ch.alignment ? '<span class="char-status-badge" style="background:' + alignCol + '">' + esc(ch.alignment) + '</span>' : '') +
            (ch.species ? '<span style="display:inline-block;padding:2px 9px;border-radius:10px;font-size:10px;background:#f0f2f5;color:#555;font-weight:600">' + esc(ch.species) + '</span>' : '') +
          '</div>' +
          (ch.occupation ? '<div style="font-size:12px;color:#666;margin-bottom:4px"><strong style="color:#333">Work:</strong> ' + esc(ch.occupation) + '</div>' : '') +
          (ch.affiliation ? '<div style="font-size:12px;color:#666;margin-bottom:4px"><strong style="color:#333">Organization:</strong> ' + esc(ch.affiliation) + '</div>' : '') +
          (uniTagsHTML ? '<div style="display:flex;flex-wrap:wrap;gap:4px">' + uniTagsHTML + '</div>' : '') +
        '</div>' +
      '</div>' +
      (((ch.victories||0) + (ch.draws||0) + (ch.defeats||0)) > 0
        ? '<div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap">' +
            '<div style="flex:1;min-width:80px;background:#e8f5e9;border-radius:10px;padding:10px 14px;text-align:center"><div style="font-size:20px;font-weight:800;color:#2e7d32">' + (ch.victories||0) + '</div><div style="font-size:10px;font-weight:700;color:#388e3c;text-transform:uppercase;letter-spacing:1px">Victories</div></div>' +
            '<div style="flex:1;min-width:80px;background:#fff3e0;border-radius:10px;padding:10px 14px;text-align:center"><div style="font-size:20px;font-weight:800;color:#e65100">' + (ch.draws||0) + '</div><div style="font-size:10px;font-weight:700;color:#ef6c00;text-transform:uppercase;letter-spacing:1px">Draws</div></div>' +
            '<div style="flex:1;min-width:80px;background:#ffebee;border-radius:10px;padding:10px 14px;text-align:center"><div style="font-size:20px;font-weight:800;color:#c62828">' + (ch.defeats||0) + '</div><div style="font-size:10px;font-weight:700;color:#d32f2f;text-transform:uppercase;letter-spacing:1px">Defeats</div></div>' +
          '</div>'
        : '') +
      (ch.locations ? '<div style="margin-bottom:14px"><div class="notes-label" style="color:#5a6a7a">\uD83D\uDCCD LOCATIONS</div><div class="ev-desc" style="margin-bottom:0">' + esc(ch.locations) + '</div></div>' : '') +
      (ch.powers ? '<div class="powers-block"><div class="powers-label">\u26A1 POWERS &amp; ABILITIES</div><div class="powers-text">' + esc(ch.powers) + '</div></div>' : '') +
      (ch.biography ? '<div style="margin-bottom:14px"><div class="notes-label" style="color:#5a6a7a">\uD83D\uDCD6 BIOGRAPHY</div><div class="ev-desc" style="margin-bottom:0">' + esc(ch.biography) + '</div></div>' : '') +
      buildNotesDisplay(ch.notes) +
      buildMediaDisplay(ch.media) +
      '<div style="border-top:1px solid #f0f0f0;padding-top:14px;margin-bottom:14px">' +
        '<div class="sec-hd" style="margin-bottom:8px">' +
          '<h3>\u{1F5D3} Timeline Path (' + charEvCount + ' event' + (charEvCount!==1?'s':'') + ')</h3>' +
          '<button class="btn sm light" id="meanwhile-btn" onclick="_toggleMeanwhile(\'' + ch.id + '\')" title="Show background events from their universe(s)">\uD83C\uDF0D Universe Context</button>' +
        ' <button class="btn sm ' + (_charFilterIds.includes(ch.id) ? 'accent' : 'light') + '" onclick="toggleCharFilter(\'' + ch.id + '\');MS.pop();M.push({t:\'charDetail\',charId:\'' + ch.id + '\'})">\uD83D\uDCCD ' + (_charFilterIds.includes(ch.id) ? 'Unpin Filter' : 'Pin Filter') + '</button>' +
        ' <button class="btn sm light" onclick="UI.connectionMap()" title="Open connection map">\uD83D\uDD78\uFE0F Map</button>' +
        '</div>' +
        '<div id="char-tl-container">' + buildCharTimeline(ch, _meanwhileMode) + '</div>' +
      '</div>' +
      (counterpartsHTML ? '<div style="border-top:1px solid #f0f0f0;padding-top:14px"><div class="sec-hd" style="margin-bottom:8px"><h3>\uD83D\uDD17 Alternate Universe Versions</h3></div>' + counterpartsHTML + '</div>' : '') +
      (S.characters.length > 1 ? '<div style="border-top:1px solid #f0f0f0;padding-top:14px"><div class="sec-hd" style="margin-bottom:8px"><h3>\uD83C\uDFAD Shared Scenes</h3></div>' + buildSharedEventsHTML(ch.id) + '</div>' : '');

    this.foot().innerHTML =
      '<button class="btn danger" onclick="delChar(\'' + ch.id + '\')">&#128465; Delete</button>' +
      '<button class="btn light" onclick="M.close()">Close</button>';
  },

  /* ---- Add Character ---- */
  _addChar(top) {
    _charPhoto = null;
    _editMediaList = [];
    this.crumb().textContent = '';
    this.ttl().textContent   = '+ New Character';
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
      '<div class="fg"><label>Name <span style="color:#e74c3c">*</span></label><input id="ac-name" placeholder="e.g. Tony Stark"></div>' +
      '<div class="fg"><label>Aliases / Other Names</label><input id="ac-aliases" placeholder="e.g. Iron Man, Iron Patriot, Shellhead"></div>' +
      '<div class="fg" style="display:flex;gap:10px">' +
        '<div style="flex:1"><label>Status</label><select id="ac-status"><option value="">Unknown</option><option value="Alive">Alive</option><option value="Deceased">Deceased</option><option value="Unknown">Unknown</option><option value="Other">Other</option></select></div>' +
        '<div style="flex:1"><label>Alignment</label><select id="ac-alignment"><option value="">None</option><option value="Hero">Hero</option><option value="Villain">Villain</option><option value="Neutral">Neutral</option></select></div>' +
      '</div>' +
      '<div class="fg" style="display:flex;gap:10px">' +
        '<div style="flex:1"><label>Species / Type</label><input id="ac-species" placeholder="e.g. Human, Mutant, Asgardian"></div>' +
        '<div style="flex:1"><label>Occupation</label><input id="ac-occupation" placeholder="e.g. Engineer, Scientist"></div>' +
      '</div>' +
      '<div class="fg"><label>Organization / Group</label><select id="ac-affiliation"><option value="">— None —</option>' + (S.affiliations||[]).map(a => '<option value="' + esc(a) + '">' + esc(a) + '</option>').join('') + '</select></div>' +
      '<div class="fg" style="display:flex;gap:10px">' +
        '<div style="flex:1"><label>Victories</label><input id="ac-victories" type="number" min="0" placeholder="0"></div>' +
        '<div style="flex:1"><label>Draws</label><input id="ac-draws" type="number" min="0" placeholder="0"></div>' +
        '<div style="flex:1"><label>Defeats</label><input id="ac-defeats" type="number" min="0" placeholder="0"></div>' +
      '</div>' +
      '<div class="fg"><label>Locations <span style="font-weight:400;color:#aaa">(places where this character has been)</span></label>' +
        '<textarea id="ac-locations" placeholder="e.g. New York, Wakanda, Asgard, Space..." style="min-height:60px"></textarea></div>' +
      '<div class="fg"><label>Accent Colour</label>' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:4px"><input type="color" id="ac-color" value="#4a8fde"></div>' +
        '<div class="swatches">' + PALETTE.map(c2 => '<div class="swatch" style="background:' + c2 + '" onclick="document.getElementById(\'ac-color\').value=\'' + c2 + '\'" ></div>').join('') + '</div>' +
      '</div>' +
      '<div class="fg"><label>&#9889; Powers &amp; Abilities</label>' +
        '<textarea id="ac-powers" placeholder="e.g.\nSuperhuman strength\nFlight\nEnergy beams\u2026" style="min-height:80px"></textarea></div>' +
      '<div class="fg"><label>&#128218; Biography</label><textarea id="ac-bio" placeholder="Character background and history\u2026" style="min-height:90px"></textarea></div>' +
      '<div class="fg"><label>\uD83D\uDCDD Notes</label><textarea id="ac-notes" placeholder="Extra notes\u2026" style="min-height:60px"></textarea></div>' +
      buildMediaForm();
    setTimeout(() => rebuildMediaList(), 0);
    this.foot().innerHTML =
      '<button class="btn light" onclick="M.back()">Cancel</button>' +
      '<button class="btn accent" onclick="submitAddChar()">Create Character</button>';
  },

  /* ---- Edit Character ---- */
  _editChar(top) {
    const ch = S.characters.find(c => c.id === top.charId); if (!ch) return;
    _charPhoto = ch.photo || null;
    _editMediaList = ch.media ? ch.media.map(m => Object.assign({}, m)) : [];
    this.crumb().textContent = 'Editing';
    this.ttl().textContent   = ch.name;
    const photoPreviewHTML = _charPhoto
      ? '<img id="char-photo-preview" src="' + _charPhoto + '" style="width:72px;height:72px;border-radius:9px;object-fit:cover;border:3px solid #eee;flex-shrink:0">'
      : '<div id="char-photo-preview" class="char-photo-placeholder" style="width:72px;height:72px;font-size:30px;border-radius:9px;margin-bottom:0;flex-shrink:0">\u{1F464}</div>';
    const sel = (v) => ch.status === v ? ' selected' : '';

    const allOtherChars = S.characters.filter(c => c.id !== ch.id);
    const cpOpts = allOtherChars.map(c2 => '<option value="' + c2.id + '">' + esc(c2.name) + '</option>').join('');
    const existingCPs = (ch.counterpartIds || []).map(cid => {
      const cc = S.characters.find(c => c.id === cid); if (!cc) return '';
      return '<div class="media-edit-item"><span class="med-icon">\uD83D\uDD17</span>' +
        '<span class="med-name">' + esc(cc.name) + '</span>' +
        '<button class="btn danger sm" data-chid="' + ch.id + '" data-cpid="' + cid + '" onclick="removeCounterpart(this.dataset.chid,this.dataset.cpid)">&#10005;</button></div>';
    }).join('');

    this.body().innerHTML =
      '<div class="char-photo-upload-area">' +
        photoPreviewHTML +
        '<div>' +
          '<button type="button" class="btn light sm" onclick="document.getElementById(\'char-photo-in\').click()">\uD83D\uDDBC Change Photo</button>' +
          '<input type="file" id="char-photo-in" accept="image/*" style="display:none" onchange="setCharPhoto(event)">' +
          '<button type="button" class="btn sm" style="margin-left:5px" onclick="clearCharPhoto()">&#10005; Clear</button>' +
        '</div>' +
      '</div>' +
      '<div class="fg"><label>Name *</label><input id="ec-name" value="' + esc(ch.name) + '"></div>' +
      '<div class="fg"><label>Aliases</label><input id="ec-aliases" value="' + esc(ch.aliases || '') + '"></div>' +
      '<div class="fg" style="display:flex;gap:10px">' +
        '<div style="flex:1"><label>Status</label><select id="ec-status"><option value=""' + (ch.status?'':' selected') + '>Unknown</option><option value="Alive"' + sel('Alive') + '>Alive</option><option value="Deceased"' + sel('Deceased') + '>Deceased</option><option value="Unknown"' + sel('Unknown') + '>Unknown</option><option value="Other"' + sel('Other') + '>Other</option></select></div>' +
        '<div style="flex:1"><label>Alignment</label><select id="ec-alignment"><option value=""' + (ch.alignment?'':' selected') + '>None</option><option value="Hero"' + (ch.alignment==='Hero'?' selected':'') + '>Hero</option><option value="Villain"' + (ch.alignment==='Villain'?' selected':'') + '>Villain</option><option value="Neutral"' + (ch.alignment==='Neutral'?' selected':'') + '>Neutral</option></select></div>' +
      '</div>' +
      '<div class="fg" style="display:flex;gap:10px">' +
        '<div style="flex:1"><label>Species / Type</label><input id="ec-species" value="' + esc(ch.species || '') + '"></div>' +
        '<div style="flex:1"><label>Occupation</label><input id="ec-occupation" value="' + esc(ch.occupation || '') + '"></div>' +
      '</div>' +
      '<div class="fg"><label>Organization / Group</label><select id="ec-affiliation"><option value="">— None —</option>' + (S.affiliations||[]).map(a => '<option value="' + esc(a) + '"' + (ch.affiliation === a ? ' selected' : '') + '>' + esc(a) + '</option>').join('') + '</select></div>' +
      '<div class="fg" style="display:flex;gap:10px">' +
        '<div style="flex:1"><label>Victories</label><input id="ec-victories" type="number" min="0" value="' + (ch.victories || 0) + '"></div>' +
        '<div style="flex:1"><label>Draws</label><input id="ec-draws" type="number" min="0" value="' + (ch.draws || 0) + '"></div>' +
        '<div style="flex:1"><label>Defeats</label><input id="ec-defeats" type="number" min="0" value="' + (ch.defeats || 0) + '"></div>' +
      '</div>' +
      '<div class="fg"><label>Locations <span style="font-weight:400;color:#aaa">(places where this character has been)</span></label>' +
        '<textarea id="ec-locations" style="min-height:60px">' + esc(ch.locations || '') + '</textarea></div>' +
      '<div class="fg"><label>Accent Colour</label>' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:4px"><input type="color" id="ec-color" value="' + (ch.color || '#4a8fde') + '"></div>' +
        '<div class="swatches">' + PALETTE.map(c2 => '<div class="swatch" style="background:' + c2 + '" onclick="document.getElementById(\'ec-color\').value=\'' + c2 + '\'" ></div>').join('') + '</div>' +
      '</div>' +
      '<div class="fg"><label>&#9889; Powers &amp; Abilities</label><textarea id="ec-powers" style="min-height:80px">' + esc(ch.powers || '') + '</textarea></div>' +
      '<div class="fg"><label>&#128218; Biography</label><textarea id="ec-bio" style="min-height:90px">' + esc(ch.biography || '') + '</textarea></div>' +
      '<div class="fg"><label>\uD83D\uDCDD Notes</label><textarea id="ec-notes" style="min-height:60px">' + esc(ch.notes || '') + '</textarea></div>' +
      '<div class="fg" style="border-top:1px solid #eee;padding-top:13px">' +
        '<div class="sec-hd" style="margin-bottom:8px"><h3>\uD83D\uDD17 Alternate Universe Versions (Counterparts)</h3></div>' +
        (existingCPs || '<div style="font-size:12px;color:#ccc;margin-bottom:8px">No counterparts linked yet.</div>') +
        (allOtherChars.length > 0
          ? '<div style="margin-top:6px"><div style="display:flex;gap:6px;margin-bottom:6px"><select id="cp-add-sel" class="mi" style="flex:1">' + cpOpts + '</select>' +
            '<select id="cp-add-rel" style="flex:0 0 120px"><option value="Related">Related</option><option value="Ally">Ally</option><option value="Enemy">Enemy</option><option value="Rival">Rival</option><option value="Family">Family</option><option value="Mentor">Mentor</option></select>' +
            '<button class="btn accent sm" data-chid="' + ch.id + '" onclick="addCounterpart(this.dataset.chid)">&#65291; Link</button></div><div style="font-size:10px;color:#999">Select relationship type above</div></div>'
          : '<div style="font-size:11px;color:#bbb">Create more characters to link counterparts.</div>') +
      '</div>' +
      buildMediaForm();
    setTimeout(() => rebuildMediaList(), 0);
    this.foot().innerHTML =
      '<button class="btn light" onclick="M.back()">Cancel</button>' +
      '<button class="btn accent" onclick="saveChar(\'' + ch.id + '\')">Save Changes</button>';
  },

  /* ---- Event Character Linking ---- */
  _connectionMap(top) {
    document.getElementById('m-title').textContent = '\u{1F578}\uFE0F Character Connections Map';
    document.getElementById('m-crumb').textContent = '';
    document.getElementById('m-btns').innerHTML = '';
    document.getElementById('m-foot').innerHTML = '';
    ConnectionMap.build(top);
  },

    _charEvLink(top) {
    const ev = S.events.find(e => e.id === top.evId); if (!ev) return;
    if (!ev.characterIds) ev.characterIds = [];
    const linked   = ev.characterIds.map(cid => S.characters.find(c => c.id === cid)).filter(Boolean);
    const unlinked = S.characters.filter(c => !ev.characterIds.includes(c.id));
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
    this.ttl().textContent   = '\u{1F464} Characters in this Event';
    this.body().innerHTML =
      '<div style="margin-bottom:18px"><div class="sec-hd"><h3>Linked Characters (' + linked.length + ')</h3></div>' + linkedHTML + '</div>' +
      (S.characters.length === 0
        ? '<div style="border-top:1px solid #eee;padding-top:14px;color:#ccc;font-size:12px">No characters created yet. Click <strong>&#128100; Characters</strong> in the toolbar to create some.</div>'
        : unlinked.length > 0
          ? '<div style="border-top:1px solid #eee;padding-top:16px"><div class="sec-hd"><h3>Add Character</h3></div>' +
            '<div class="fg"><label>Select character</label><select id="ch-add-sel">' + opts + '</select></div></div>'
          : '<div style="border-top:1px solid #eee;padding-top:14px;font-size:12px;color:#aaa">All characters are already linked to this event.</div>'
      );
    this.foot().innerHTML =
      '<button class="btn light" onclick="M.back()">Back</button>' +
      (S.characters.length > 0 && unlinked.length > 0
        ? '<button class="btn accent" data-evid="' + ev.id + '" onclick="linkCharToEvent(this.dataset.evid)">Add to Event</button>'
        : '');
  }
};

let _modalReturnFocus = null;

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
  if (!this.bg().classList.contains('open')) {
    const active = document.activeElement;
    _modalReturnFocus = active && typeof active.focus === 'function' ? active : null;
  }
  _mOpen();
  requestAnimationFrame(syncModalAccessibility);
};

/* Hardened close: idempotent, never throws, runs registered cleanups.
   Fixes Help-modal crash when clicking Got it / Cancel / X / Esc / outside. */
M._cleanups = M._cleanups || [];
M.onClose = function(fn){ if (typeof fn === 'function') M._cleanups.push(fn); };
M._closing = false;
const _mClose = M.close.bind(M);
M.close = function() {
  if (M._closing) return;                                 /* re-entry guard */
  const bg = document.getElementById('modal-bg');
  if (!bg || !bg.classList.contains('open')) {            /* already closed: no-op */
    MS = [];
    return;
  }
  M._closing = true;
  try {
    /* 1. Run any cleanups registered by the active screen */
    const queue = M._cleanups.splice(0, M._cleanups.length);
    queue.forEach(function(fn){ try { fn(); } catch(_){} });
    /* 2. Drop the open class + clear stack */
    try { _mClose(); } catch(_){ try { bg.classList.remove('open'); MS = []; } catch(__){} }
    /* 3. Restore focus safely */
    const toFocus = _modalReturnFocus;
    _modalReturnFocus = null;
    try { syncModalAccessibility(); } catch(_){}
    if (toFocus && document.contains(toFocus)) {
      setTimeout(function() { try { toFocus.focus(); } catch (_) {} }, 0);
    }
  } catch (err) {
    /* Hard fallback: never crash the page */
    try { bg.classList.remove('open'); bg.setAttribute('aria-hidden','true'); } catch(_){}
    try { MS = []; } catch(_){}
    try { if (typeof notify === 'function') notify('Closed the panel (recovered from a hiccup).'); } catch(_){}
  } finally {
    M._closing = false;
  }
};

const _mRender = M.render.bind(M);
M.render = function() {
  _mRender();
  requestAnimationFrame(syncModalAccessibility);
};

/* =====================================================
   UI overlay helper (Prompt 1.2)
   Generic, idempotent open/close for every secondary overlay
   (range-cfg-overlay, mob-drawer, mob-drawer-overlay, mob-fp-overlay,
    filter-panel-rows, mob-blank-confirm, tlb-sheet, tlb-sheet-scrim, …).
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
    'mob-drawer', 'mob-drawer-overlay',
    'filter-panel-rows', 'mob-fp-overlay',
    'mob-blank-confirm',
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
    /* Don't preventDefault — let DevTools still see it. */
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
function getConnColor(conn, fallback) {
  return conn && conn.color ? conn.color : (fallback || '#7080f0');
}
function getConnWidth(conn) { return clamp(parseFloat(conn && conn.width) || 1.5, 0.5, 10); }
function getConnOpacity(conn) { return clamp(parseFloat(conn && conn.opacity) || 0.42, 0.08, 1); }
function getConnDashed(conn) { return !conn || conn.dashed !== false; }
function buildConnsSection(conns) {
  return '<div style="margin-bottom:16px"><div class="sec-hd"><h3>&#128279; Connections (' + conns.length + ')</h3></div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:6px">' +
    conns.map(cn =>
      '<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;background:#f2f2f5;border-radius:12px;font-size:12px;cursor:pointer" onclick="M.openEvDetail(\'' + cn.ev.id + '\')">' +
      '<span style="width:18px;height:' + Math.max(2, getConnWidth(cn.conn)) + 'px;border-radius:3px;background:' + cn.col + ';opacity:' + getConnOpacity(cn.conn) + ';display:inline-block"></span>' +
      esc(cn.ev.title) + (cn.lbl ? ' <em style="color:#bbb;font-size:10px">' + esc(cn.lbl) + '</em>' : '') + '</span>'
    ).join('') + '</div><div style="font-size:11px;color:#aaa;margin-top:6px">Open Connections to change line colour, thickness, visibility, or dashed/solid style.</div></div>';
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
      : ses.map((se) => {
          if (!se.id) se.id = uid();   /* UE-12: backfill an id for legacy/id-less sub-events so the id path resolves */
          const newPath = JSON.stringify([...parentPath, se.id]);
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
  /* UE-12: resolve by stable sub-event ids, not array indices. An index path
     captured when a modal opened goes stale if a sibling is added/removed/
     reordered before the action, silently hitting the wrong sub-event. An id
     path resolves the right node or fails cleanly (null) when it's gone. */
  for (const segId of path) {
    if (!node.subEvents) return null;
    node = node.subEvents.find(s => s && s.id === segId);
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
    if (oe) res.push({ ev: oe, col: getConnColor(c, ou ? ou.color : '#aaa'), lbl: c.label, conn: c });
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
  const statusColors = { 'Alive':'#2ecc71','Deceased':'#e74c3c','Unknown':'#95a5a6','Other':'#f39c12' };
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
      '<div class="char-uni-tags">' + (tags || '<span style="font-size:10px;color:#ccc">No universe links yet</span>') + '</div>' +
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
  const chars = ev.characterIds.map(cid => S.characters.find(c => c.id === cid)).filter(Boolean);
  if (chars.length === 0) return '';
  const chips = chars.map(ch => {
    const av = ch.photo
      ? '<img class="char-in-event-photo" src="' + esc(ch.photo) + '">'
      : '<span>' + charInitials(ch.name) + '</span>';
    return '<span class="char-in-event" data-id="' + ch.id + '" onclick="_openCharDetail(this.dataset.id)">' + av + esc(ch.name) + '</span>';
  }).join('');
  return '<div style="margin-bottom:14px"><div class="notes-label" style="color:#6a78a0">\u{1F464} CHARACTERS</div><div style="display:flex;flex-wrap:wrap;gap:0">' + chips + '</div></div>';
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
  const ch = S.characters.find(c => c.id === charId);
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
  if (S.characters.length === 0) return '';
  
  const totalChars = S.characters.length;
  const heroCount = S.characters.filter(c => c.alignment === 'Hero').length;
  const villainCount = S.characters.filter(c => c.alignment === 'Villain').length;
  const neutralCount = S.characters.filter(c => c.alignment === 'Neutral').length;
  
  const aliveCount = S.characters.filter(c => c.status === 'Alive').length;
  const deceasedCount = S.characters.filter(c => c.status === 'Deceased').length;
  
  const withOrganization = S.characters.filter(c => c.affiliation).length;
  const withOccupation = S.characters.filter(c => c.occupation).length;
  
  const totalEvents = new Set(S.events.flatMap(e => e.characterIds || [])).size;
  const avgEvents = totalChars > 0 ? (S.events.reduce((sum, e) => sum + (e.characterIds?.length || 0), 0) / totalChars).toFixed(1) : 0;
  
  return '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:11px">' +
    '<div style="background:#f0f2f5;padding:8px;border-radius:5px"><strong>' + totalChars + '</strong><br>Total Characters</div>' +
    '<div style="background:#f0f2f5;padding:8px;border-radius:5px"><strong>' + (heroCount + villainCount + neutralCount) + '</strong><br>Aligned (' + (heroCount ? '<span style="color:#2ecc71">H:' + heroCount + '</span> ' : '') + (villainCount ? '<span style="color:#e74c3c">V:' + villainCount + '</span> ' : '') + (neutralCount ? '<span style="color:#95a5a6">N:' + neutralCount + '</span>' : '') + ')</div>' +
    '<div style="background:#f0f2f5;padding:8px;border-radius:5px"><strong>' + aliveCount + '</strong><br>Alive (' + deceasedCount + ' deceased)</div>' +
    '<div style="background:#f0f2f5;padding:8px;border-radius:5px"><strong>' + withOccupation + '</strong><br>With Occupation</div>' +
    '<div style="background:#f0f2f5;padding:8px;border-radius:5px"><strong>' + withOrganization + '</strong><br>In an Organization</div>' +
    '<div style="background:#f0f2f5;padding:8px;border-radius:5px"><strong>' + avgEvents + '</strong><br>Avg Events/Char</div>' +
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
    showFieldError('ac-name', 'Enter a character name.');
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
    victories: parseInt((document.getElementById('ac-victories')||{value:'0'}).value) || 0,
    draws:     parseInt((document.getElementById('ac-draws')||{value:'0'}).value) || 0,
    defeats:   parseInt((document.getElementById('ac-defeats')||{value:'0'}).value) || 0,
    locations: (document.getElementById('ac-locations')||{value:''}).value.trim(),
    color:     (document.getElementById('ac-color')||{value:'#4a8fde'}).value,
    powers:    (document.getElementById('ac-powers')||{value:''}).value.trim(),
    biography: (document.getElementById('ac-bio')||{value:''}).value.trim(),
    notes:     (document.getElementById('ac-notes')||{value:''}).value.trim(),
    photo:     _charPhoto || null,
    media:     [..._editMediaList],
    counterpartIds: [],
    counterpartRelations: {},
    universeIds: []
  };
  S.characters.push(ch);
  Store.autosave(); M.close(); notify('Character created! \u2713', 'success');
}

function saveChar(charId) {
  const ch = S.characters.find(c => c.id === charId); if (!ch) return;
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
  ch.victories = parseInt((document.getElementById('ec-victories')||{value:'0'}).value) || 0;
  ch.draws     = parseInt((document.getElementById('ec-draws')||{value:'0'}).value) || 0;
  ch.defeats   = parseInt((document.getElementById('ec-defeats')||{value:'0'}).value) || 0;
  ch.locations = (document.getElementById('ec-locations')||{value:''}).value.trim();
  ch.color     = (document.getElementById('ec-color')||{value:'#4a8fde'}).value;
  ch.powers    = (document.getElementById('ec-powers')||{value:''}).value.trim();
  ch.biography = (document.getElementById('ec-bio')||{value:''}).value.trim();
  ch.notes     = (document.getElementById('ec-notes')||{value:''}).value.trim();
  ch.photo     = _charPhoto;
  ch.media     = [..._editMediaList];
  if (!ch.counterpartRelations) ch.counterpartRelations = {};
  Store.autosave(); MS.pop(); M.render(); notify('Saved \u2713', 'success');
}

function delChar(charId) {
  const ch = S.characters.find(c => c.id === charId);
  ftConfirmGate('Delete "' + (ch?ch.name:'this character') + '"? This will also remove all links to events.', function () {
  S.characters = S.characters.filter(c => c.id !== charId);
  // remove from all events
  S.events.forEach(e => { if (e.characterIds) e.characterIds = e.characterIds.filter(id => id !== charId); });
  // remove from counterpartIds of other chars
  S.characters.forEach(c => { if (c.counterpartIds) c.counterpartIds = c.counterpartIds.filter(id => id !== charId); });
  Store.autosave(); M.close(); notify('Character deleted.', 'warning');
  }, { title: 'Delete character?', confirmLabel: 'Delete', danger: true });
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
  Store.autosave(); M.render(); notify('Character unlinked.', 'warning');
}

function addCounterpart(charId) {
  const ch = S.characters.find(c => c.id === charId); if (!ch) return;
  const sel = document.getElementById('cp-add-sel'); if (!sel) return;
  const relSel = document.getElementById('cp-add-rel'); 
  const cpId = sel.value; if (!cpId || cpId === charId) return;
  const relationship = relSel ? relSel.value : 'Related';
  if (!ch.counterpartIds) ch.counterpartIds = [];
  if (!ch.counterpartRelations) ch.counterpartRelations = {};
  if (!ch.counterpartIds.includes(cpId)) ch.counterpartIds.push(cpId);
  // bidirectional
  const cp = S.characters.find(c => c.id === cpId);
  if (cp) {
    if (!cp.counterpartIds) cp.counterpartIds = [];
    if (!cp.counterpartIds.includes(charId)) cp.counterpartIds.push(charId);
  }
  Store.autosave(); M.render(); notify('Counterpart linked \u2713', 'success');
}

function removeCounterpart(charId, cpId) {
  const ch = S.characters.find(c => c.id === charId); if (!ch) return;
  ch.counterpartIds = (ch.counterpartIds||[]).filter(id => id !== cpId);
  const cp = S.characters.find(c => c.id === cpId);
  if (cp) cp.counterpartIds = (cp.counterpartIds||[]).filter(id => id !== charId);
  Store.autosave(); M.render(); notify('Counterpart removed.', 'warning');
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
    showFieldError('ae-u', 'Select a universe before creating the event.');
    notify('Please select a universe (create one first).', 'error');
    return;
  }
  if (parseDate(date) === null){
    showFieldError('ae-d', 'Year must be numeric, for example xx/xx/2006 or xx/xx/-50000.');
    notify('Year must be a number (e.g. xx/xx/2006, xx/xx/-50000).', 'error');
    return;
  }
  const cat = document.getElementById('ae-cat').value;
  const status = (document.getElementById('ae-status')||{value:''}).value || null;
  const tags = (document.getElementById('ae-tags')||{value:''}).value.split(',').map(t=>t.trim()).filter(Boolean);
  const tone = (document.getElementById('ae-tone')||{value:''}).value || null;
  const recFreq = (document.getElementById('ae-recurring')||{value:''}).value;
  S.events.push({ id: uid(), universeId: uId, date, time: time || null, title, description: desc,
    notes, media: [..._editMediaList], subEvents: [], category: cat || null, status, tags, tone,
    recurring: recFreq ? { frequency: recFreq } : null });
  Store.autosave(); render(); updateCatFilterBar(); updateStatusFilterBar(); updateTagFilterBar(); updateToneFilterBar(); updateStatsPanel(); M.close(); notify('Event created! \u2713', 'success');
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
    showFieldError('ee-u', 'Select a universe for this event.');
    notify('Please select a universe.', 'error');
    return;
  }
  ev.title       = title;
  ev.date        = date;
  ev.time        = time || null;
  ev.universeId  = document.getElementById('ee-u').value;
  ev.category    = document.getElementById('ee-cat').value || null;
  ev.status      = (document.getElementById('ee-status')||{value:''}).value || null;
  ev.tone        = (document.getElementById('ee-tone')||{value:''}).value || null;
  const recFreq  = (document.getElementById('ee-recurring')||{value:''}).value;
  ev.recurring   = recFreq ? { frequency: recFreq } : null;
  ev.tags        = (document.getElementById('ee-tags')||{value:''}).value.split(',').map(t=>t.trim()).filter(Boolean);
  ev.description = document.getElementById('ee-dc').value.trim();
  ev.notes       = document.getElementById('ee-notes').value.trim();
  ev.media       = [..._editMediaList];
  Store.autosave(); render(); updateCatFilterBar(); updateStatusFilterBar(); updateTagFilterBar(); updateToneFilterBar(); updateStatsPanel();
  MS.pop(); M.render(); notify('Saved \u2713', 'success');
}

function delEvent(evId) {
  ftConfirmGate('Delete this event? This cannot be undone.', function () {
  S.events      = S.events.filter(e => e.id !== evId);
  S.connections = S.connections.filter(c => c.fromEventId !== evId && c.toEventId !== evId);
  Store.autosave(); render(); updateTagFilterBar(); updateToneFilterBar(); M.close(); notify('Event deleted.', 'warning');
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
  for (const segId of path) {   /* UE-12: walk by id, not index */
    if (!node.subEvents) { notify('That sub-event no longer exists.', 'error'); return; }
    node = node.subEvents.find(s => s && s.id === segId);
    if (!node) { notify('That sub-event no longer exists.', 'error'); return; }
  }
  if (!node.subEvents) node.subEvents = [];
  node.subEvents.push({ id: uid(), title, date, time: time || null, description: desc,
    notes, media: [..._editMediaList], subEvents: [] });
  Store.autosave(); MS.pop(); M.render(); notify('Sub-event added \u2713', 'success');
}

function saveSE(evId, path) {
  /* UE-12: resolve by id path; abort cleanly if the sub-event moved or was deleted. */
  const node = getNodeAtPath(evId, path);
  if (!node) { notify('This sub-event no longer exists — it may have been moved or deleted.', 'error'); MS.pop(); M.render(); return; }
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
  /* UE-12: resolve the parent by id path and splice the child by id, so a stale
     path deletes the RIGHT sub-event (or nothing) — never a wrong sibling. */
  const parent = getNodeAtPath(evId, path.slice(0, -1));
  const targetId = path[path.length - 1];
  const idx = (parent && parent.subEvents) ? parent.subEvents.findIndex(s => s && s.id === targetId) : -1;
  if (idx < 0) { notify('This sub-event no longer exists — it may have already been deleted.', 'error'); MS.pop(); M.render(); return; }
  parent.subEvents.splice(idx, 1);
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
  const color = (document.getElementById('cn-new-color') || { value: '' }).value || null;
  const width = parseFloat((document.getElementById('cn-new-width') || { value: '1.5' }).value) || 1.5;
  const opacity = (parseFloat((document.getElementById('cn-new-opacity') || { value: '42' }).value) || 42) / 100;
  const dashed = ((document.getElementById('cn-new-dash') || { value: 'dashed' }).value !== 'solid');
  const presetId = (document.getElementById('cn-new-preset') || { value: '' }).value || '';
  S.connections.push({ id: uid(), fromEventId: fromId, toEventId: toId, label: lbl, color, width, opacity, dashed, presetId });
  Store.autosave(); render(); M.render(); notify('Connection added \u2713', 'success');
}

function ensureConnStylePresets() {
  if (!Array.isArray(S.connStylePresets) || S.connStylePresets.length === 0) {
    S.connStylePresets = [
      { id: 'preset-subtle', name: 'Subtle Link', color: '#7080f0', width: 1.5, opacity: 0.42, dashed: true },
      { id: 'preset-major', name: 'Major Sequence', color: '#e74c3c', width: 3, opacity: 0.72, dashed: false },
      { id: 'preset-clue', name: 'Clue / Echo', color: '#9b59b6', width: 2, opacity: 0.55, dashed: true }
    ];
  }
  return S.connStylePresets;
}

function normalizeConnPreset(p) {
  return {
    id: p.id || uid(),
    name: String(p.name || 'Imported Preset').slice(0, 60),
    color: p.color || '#7080f0',
    width: clamp(parseFloat(p.width) || 1.5, 0.5, 10),
    opacity: clamp(parseFloat(p.opacity) || 0.42, 0.08, 1),
    dashed: p.dashed !== false
  };
}

function buildConnPresetOptions(selectedId) {
  const presets = ensureConnStylePresets();
  return '<option value="">— No preset —</option>' + presets.map(p => '<option value="' + esc(p.id) + '"' + (p.id === selectedId ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('');
}

function getConnPreset(presetId) {
  return ensureConnStylePresets().find(p => p.id === presetId) || null;
}

function applyConnPresetToFields(prefix, preset) {
  if (!preset) return;
  const col = document.getElementById(prefix + 'color');
  const wid = document.getElementById(prefix + 'width');
  const opa = document.getElementById(prefix + 'opacity');
  const das = document.getElementById(prefix + 'dash');
  if (col) col.value = preset.color;
  if (wid) wid.value = preset.width;
  if (opa) opa.value = Math.round(preset.opacity * 100);
  if (das) das.value = preset.dashed ? 'dashed' : 'solid';
}

function applyConnPresetToNew(presetId) {
  const preset = getConnPreset(presetId);
  applyConnPresetToFields('cn-new-', preset);
}

function applyConnPresetToConn(connId) {
  const sel = document.getElementById('cn-preset-' + connId);
  const preset = sel ? getConnPreset(sel.value) : null;
  if (!preset) { notify('Please choose a preset first.', 'error'); return; }
  const col = document.getElementById('cn-col-' + connId);
  const wid = document.getElementById('cn-w-' + connId);
  const opa = document.getElementById('cn-o-' + connId);
  const das = document.getElementById('cn-d-' + connId);
  if (col) col.value = preset.color;
  if (wid) wid.value = preset.width;
  if (opa) opa.value = Math.round(preset.opacity * 100);
  if (das) das.value = preset.dashed ? 'dashed' : 'solid';
  const cn = S.connections.find(c => c.id === connId);
  if (cn) cn.presetId = preset.id;
  updateConnStyle(connId);
  notify('Preset applied ✓', 'success');
}

function readConnStyleFromFields(connId) {
  return normalizeConnPreset({
    name: 'Connection Style',
    color: (document.getElementById('cn-col-' + connId) || { value: '#7080f0' }).value,
    width: (document.getElementById('cn-w-' + connId) || { value: 1.5 }).value,
    opacity: ((parseFloat((document.getElementById('cn-o-' + connId) || { value: 42 }).value) || 42) / 100),
    dashed: ((document.getElementById('cn-d-' + connId) || { value: 'dashed' }).value !== 'solid')
  });
}

function readNewConnStyleFields() {
  return normalizeConnPreset({
    name: 'Connection Style',
    color: (document.getElementById('cn-new-color') || { value: '#7080f0' }).value,
    width: (document.getElementById('cn-new-width') || { value: 1.5 }).value,
    opacity: ((parseFloat((document.getElementById('cn-new-opacity') || { value: 42 }).value) || 42) / 100),
    dashed: ((document.getElementById('cn-new-dash') || { value: 'dashed' }).value !== 'solid')
  });
}

function saveConnPreset(style, name) {
  ensureConnStylePresets();
  const preset = normalizeConnPreset(Object.assign({}, style, { id: uid(), name }));
  S.connStylePresets.push(preset);
  Store.autosave();
  M.render();
  notify('Connection style preset saved ✓', 'success');
}

function saveConnPresetFromConn(connId) {
  const name = prompt('Preset name:', 'Connection Style');
  if (!name) return;
  saveConnPreset(readConnStyleFromFields(connId), name.trim());
}

function saveNewConnStyleAsPreset() {
  const name = prompt('Preset name:', 'Connection Style');
  if (!name) return;
  saveConnPreset(readNewConnStyleFields(), name.trim());
}

function exportConnStylePresets() {
  const data = JSON.stringify({ connectionStylePresets: ensureConnStylePresets() }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'connection-style-presets.json';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
  notify('Connection style presets exported ✓', 'success');
}

function importConnStylePresets() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = ev => {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const incoming = Array.isArray(parsed) ? parsed : parsed.connectionStylePresets;
        if (!Array.isArray(incoming)) throw new Error('No presets found');
        ensureConnStylePresets();
        let added = 0;
        for (const raw of incoming) {
          const preset = normalizeConnPreset(raw);
          if (S.connStylePresets.some(p => p.id === preset.id)) preset.id = uid();
          S.connStylePresets.push(preset);
          added++;
        }
        Store.autosave();
        M.render();
        notify('Imported ' + added + ' preset' + (added === 1 ? '' : 's') + ' ✓', 'success');
      } catch (err) {
        notify('Could not import presets. Please choose a valid JSON preset file.', 'error');
      }
    };
    reader.readAsText(f);
  };
  input.click();
}

function updateConnStyle(connId) {
  const cn = S.connections.find(c => c.id === connId);
  if (!cn) return;
  cn.color = (document.getElementById('cn-col-' + connId) || { value: cn.color || '#7080f0' }).value;
  cn.width = parseFloat((document.getElementById('cn-w-' + connId) || { value: cn.width || 1.5 }).value) || 1.5;
  cn.opacity = (parseFloat((document.getElementById('cn-o-' + connId) || { value: Math.round(getConnOpacity(cn) * 100) }).value) || 42) / 100;
  cn.dashed = ((document.getElementById('cn-d-' + connId) || { value: 'dashed' }).value !== 'solid');
  const presetSel = document.getElementById('cn-preset-' + connId);
  if (presetSel) cn.presetId = presetSel.value || '';
  Store.autosave(); render();
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
    showFieldError('au-n', 'Enter a universe name.');
    notify('Please enter a name.', 'error');
    return;
  }
  const uDesc  = (document.getElementById('au-desc') ||{value:''}).value.trim();
  const uNotes = (document.getElementById('au-notes')||{value:''}).value.trim();
  S.universes.push({ id: uid(), name, color, visible: true, description: uDesc, notes: uNotes });
  Store.autosave(); clampPanY(); render(); updateUniToggleBar(); M.close(); notify('Universe created \u2713', 'success');
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
  u.description = (document.getElementById('eu-desc') ||{value:''}).value.trim();
  u.notes       = (document.getElementById('eu-notes')||{value:''}).value.trim();
  Store.autosave(); render(); updateUniToggleBar(); M.close(); notify('Universe updated \u2713', 'success');
}

function delUni(uId) {
  const u = getU(uId);
  const cnt = S.events.filter(e => e.universeId === uId).length;
  ftConfirmGate('Delete "' + (u ? u.name : 'this universe') + '"?' +
    (cnt ? ' This will also delete ' + cnt + ' event(s).' : ''), function () {
  S.events      = S.events.filter(e => e.universeId !== uId);
  S.universes   = S.universes.filter(u2 => u2.id !== uId);
  Store.autosave(); clampPanY(); render(); M.close(); notify('Universe deleted.', 'warning');
  }, { title: 'Delete universe?', confirmLabel: 'Delete', danger: true });
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
  if (!name) { notify('Please enter an organization name.', 'error'); return; }
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
  const charCount = S.characters.filter(c => c.affiliation === name).length;
  function _go() {
    S.characters.forEach(c => { if (c.affiliation === name) c.affiliation = ''; });
    S.affiliations.splice(idx, 1);
    Store.autosave();
    M.render();
    notify('Organization "' + name + '" removed.', 'warning');
  }
  if (charCount > 0) {
    ftConfirmGate(
      'Remove "' + name + '"? ' + charCount + ' character(s) use this organization — their organization field will be cleared.',
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
    if (seen[lower]) { notify('Duplicate organization name: "' + n + '". Please use unique names.', 'error'); return; }
    seen[lower] = true;
  }
  S.characters.forEach(c => {
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
      uId:   presetUni || (S.universes[0] ? S.universes[0].id : ''),
      date:  presetYear ? 'xx/xx/' + presetYear : '',
      title: '', desc: ''
    });
  },
  addUniverse() {
    M.push({ t: 'addUni', name: '', color: PALETTE[S.universes.length % PALETTE.length] });
  },
  help() {
    M.push({ t: 'help' });
  },
  characters() {
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
  },

  /* ── Phase 2.4.I: Toolbar actions ───────────────────── */
  fitToData() {
    try {
      const evs = (S && S.events) ? S.events : [];
      const years = [];
      evs.forEach(ev => {
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
      if (z && typeof formatZoomPercent === 'function') z.textContent = formatZoomPercent();
      render();
    } catch(_) {}
  },

  jumpToYear() {
    const raw = prompt('Jump to year (use a negative number for BC, e.g. -3000 for 3000 BC):', '');
    if (raw == null) return;
    const s = String(raw).trim();
    if (!s) return;
    const m = s.match(/^(-?\d+(?:\.\d+)?)(?:\s*(BC|AD|BCE|CE))?$/i);
    if (!m) { alert('Please enter a valid year, e.g. 1969, -3000, or "500 BC".'); return; }
    let y = parseFloat(m[1]);
    const era = (m[2] || '').toUpperCase();
    if ((era === 'BC' || era === 'BCE') && y > 0) y = -y;
    if (!isFinite(y)) return;
    V.panX = -yw(y) * V.scale;
    if (typeof clampPanX === 'function') clampPanX();
    render();
  },

  shareView() {
    try {
      const cy = (typeof OY === 'number' ? OY : 2000) + (sw(centerX()) / BPPY);
      const zoom = V.scale;
      // Visible track ids (ordered) — short list to keep URL tame.
      const tracks = (S.universes || [])
        .filter(u => u.visible !== false)
        .map(u => u.id)
        .join(',');
      const hash = '#date=' + encodeURIComponent(cy.toFixed(3)) +
                   '&zoom=' + encodeURIComponent(zoom.toFixed(4)) +
                   (tracks ? '&tracks=' + encodeURIComponent(tracks) : '');
      const url = location.origin + location.pathname + hash;
      const after = (ok) => {
        /* UE-5: be honest that this is a view link (camera position), not data. */
        if (ok) notify('View link copied — it restores this view on this device, not your data. Use Save HTML / Export to share the timeline itself.', 'info');
        const btn = document.getElementById('share-btn');
        if (!btn) return;
        const orig = btn.textContent;
        btn.textContent = ok ? '✓ Copied' : '⚠ ' + url;
        btn.disabled = true;
        setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => after(true), () => after(false));
      } else {
        const ta = document.createElement('textarea');
        ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        let ok = false; try { ok = document.execCommand('copy'); } catch(_){}
        document.body.removeChild(ta); after(ok);
      }
      // Also reflect into the address bar so refresh restores the view.
      try { history.replaceState(null, '', hash); } catch(_) {}
    } catch(_) {}
  }
};

/* =====================================================
   PERSISTENCE
   ===================================================== */
const SKEY = 'inf_universe_v4';
const Store = {
  autosave() {
    try {
      /* B-2: don't persist a blank template — it would block sample data on next load. */
      if (_blankTemplateMode && isBlankTemplateState(S)) {
        localStorage.removeItem(SKEY);
        return;
      }
      localStorage.setItem(SKEY, JSON.stringify(S));
    } catch (_) {}
  },
  normalize() {
    S.universes = Array.isArray(S.universes) ? S.universes : [];
    S.events = Array.isArray(S.events) ? S.events : [];
    S.connections = Array.isArray(S.connections) ? S.connections : [];
    S.characters = Array.isArray(S.characters) ? S.characters : [];
    S.categories = S.categories && typeof S.categories === 'object' ? S.categories : {};
    S.affiliations = Array.isArray(S.affiliations) ? S.affiliations : [];
    syncCategoriesFromState();
  },
  /* B-2: drop a saved blank template so first-run sample data can re-appear. */
  clearSavedBlank() {
    try {
      const raw = localStorage.getItem(SKEY);
      if (raw && isBlankTemplateState(JSON.parse(raw))) localStorage.removeItem(SKEY);
    } catch (_) {}
  },
  load() {
    try {
      const raw = localStorage.getItem(SKEY);
      if (raw) {
        const d = JSON.parse(raw);
        /* B-2: treat blank-template saves as "nothing saved". */
        if (isBlankTemplateState(d)) {
          localStorage.removeItem(SKEY);
          return false;
        }
        S.universes    = d.universes   || [];
        S.events       = d.events      || [];
        S.connections  = d.connections || [];
        S.characters   = d.characters  || [];
        S.categories   = d.categories  || {};
        S.affiliations = d.affiliations || [];
        Store.normalize();
        return true;
      }
    } catch (_) {}
    return false;
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
        a.download = 'timeline_' + date + '.html';
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
    a.download = 'timeline_' + date + '.html';
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
    a.download = 'timeline_' + date + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notify('Data exported as JSON \u2713', 'success');
  },

  blankTimeline() {
    /* #018: mobile-safe confirm gate. Falls back to native confirm() if ft-confirm.js
       failed to load. Once confirmed, ask about a backup with the same fallback. */
    if (typeof ftConfirm === 'function') {
      ftConfirm({
        title: 'Clear and start a blank timeline?',
        message: 'This will clear all universes, events, characters, and connections from your browser. You can save a JSON backup first.',
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
    /* B-2: mark blank-template intent so autosave doesn't lock us out of sample data. */
    _blankTemplateMode = true;
    S.universes = [{ id: uid(), name: 'Untitled', color: PALETTE[0], visible: true, description: '', notes: '' }];
    S.events = [];
    S.connections = [];
    S.characters = [];
    S.affiliations = [];
    if (!S.categories || Object.keys(S.categories).length === 0) syncCategoriesToState();
    V.panX = 0; V.panY = 0; V.scale = getMinScale();
    const zoom = document.getElementById('zoom-pct'); if (zoom) zoom.textContent = formatZoomPercent();
    Store.autosave();
    if (window.History && window.History.clear) window.History.clear();  /* BE-13/UE-18: blank is a hard boundary — undo greys out, no cross-boundary restore */
    MS = [];
    M.close();
    clampPanY();
    render();
    updateUniverseScrollbar();
    updateUniToggleBar();
    updateCatFilterBar();
    updateStatusFilterBar();
    updateTagFilterBar();
    updateToneFilterBar();
    updateCharFilterSelect();
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
        /* #053: enforce a hard size cap before parsing \u2014 protects against
           memory-DoS via a deliberately huge file. */
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
        /* #053: every imported field goes through the shared validator/sanitiser.
           Any javascript:/data: URL injected into media[].src or character.photo
           is stripped before it can reach the renderer. */
        const d = (typeof ftValidateImport === 'function')
          ? ftValidateImport(raw, { kind: 'universe' })
          : raw;
        ftConfirmGate('Loading will replace ALL current data. Continue?', function () {
          S.universes    = d.universes   || [];
          S.events       = d.events      || [];
          S.connections  = d.connections || [];
          S.characters   = d.characters  || [];
          S.categories   = d.categories  || {};
          S.affiliations = d.affiliations || [];
          syncCategoriesFromState();
          Store.autosave();
          if (window.History && window.History.clear) window.History.clear();  /* BE-13/UE-18: undo must not cross the import boundary */
          clampPanY(); render();
          updateCatFilterBar(); updateStatusFilterBar(); updateTagFilterBar(); updateToneFilterBar(); updateCharFilterSelect(); updateUniToggleBar(); updateStatsPanel();
          notify('Timeline loaded \u2713', 'success');
        }, { title: 'Replace all data?', confirmLabel: 'Replace', danger: true });
      } catch (err) { notify('Could not read file: ' + err.message, 'error'); }
    };
    r.readAsText(f); e.target.value = '';
  }
};

  /* =====================================================
     UNDO / REDO HISTORY
     ===================================================== */
  /* UE-1 — REMOVED: the second, conflicting undo/redo stack.
     Universe previously had TWO uncoordinated undo systems: this block-scoped
     `const History` (a localStorage-string stack, wired to Ctrl+Z/Ctrl+Y) and
     the deep-snapshot `window.History` defined in PART 6 below (wired to the
     toolbar/drawer buttons). Both were fed by Store.autosave but consumed
     independently, so clicking Undo and then pressing Ctrl+Z rewound two
     different stacks and produced a state the user never had — silent world
     corruption. We now keep ONLY the deep-snapshot window.History; the
     Ctrl+Z/Ctrl+Y handler below calls it too, and Store.autosave is wrapped
     exactly once (in PART 6). This also restores parity with Biography. */
    

/* =====================================================
   SAMPLE DATA (loaded on first run)
   ===================================================== */
function loadSample() {
  if (Store.load()) return;
  S.universes = [
    { id:'u1', name:'Marvel 616',  color:'#e74c3c', visible:true },
    { id:'u2', name:'MCU (Films)', color:'#3498db', visible:true },
    { id:'u3', name:'DC Rebirth',  color:'#2ecc71', visible:true },
  ];
  S.events = [
    { id:'e01', universeId:'u1', date:'xx/xx/1963', title:'X-Men Founded',
      description:'Charles Xavier establishes the Xavier School for Gifted Youngsters and assembles the original five X-Men: Cyclops, Marvel Girl, Beast, Iceman, and Angel.',
      notes:'First appearance in X-Men #1 (September 1963). Stan Lee & Jack Kirby.',
      category:'Origin', media:[],
      subEvents:[
        { id:'s01a', title:'Original Roster', date:'xx/xx/1963',
          description:'Cyclops (Scott Summers), Marvel Girl (Jean Grey), Beast (Hank McCoy), Iceman (Bobby Drake), and Angel (Warren Worthington III).',
          notes:'', media:[], subEvents:[] },
        { id:'s01b', title:'First Mission vs Magneto', date:'xx/xx/1963',
          description:'The X-Men intercept Magneto at Cape Citadel, a US military installation he has seized.',
          notes:'', media:[],
          subEvents:[
            { id:'s01b1', title:'Cape Citadel Battle', date:'xx/xx/1963',
              description:'Magneto attempts to take control of US ballistic missiles. The X-Men repel him — their first recorded victory.',
              notes:'This battle establishes the core X-Men vs Magneto rivalry that defines the franchise.',
              media:[], subEvents:[] }
          ]}
      ]},
    { id:'e02', universeId:'u1', date:'xx/xx/1984', title:'Secret Wars I',
      description:'The all-powerful Beyonder kidnaps Earth\'s greatest heroes and villains, transporting them to a patchwork world called Battleworld to fight for his entertainment.',
      notes:'12-issue limited series written by Jim Shooter. Marvel Super Heroes Secret Wars (1984).',
      category:'Battle', media:[],
      subEvents:[
        { id:'s02a', title:'Battleworld', date:'xx/xx/1984',
          description:'A planet assembled from fragments of other worlds: Doombase, Denver, an alien city, and more.', notes:'', media:[], subEvents:[] },
        { id:'s02b', title:"Spider-Man's Alien Costume", date:'xx/xx/1984',
          description:'Peter Parker bonds with a black alien symbiote — creating the iconic black suit that would later become Venom.',
          notes:'This single moment spawned Venom, Carnage, and an entire symbiote mythology.',
          media:[], subEvents:[] }
      ]},
    { id:'e03', universeId:'u1', date:'xx/xx/2006', title:'Civil War',
      description:'The Superhero Registration Act fractures the Marvel hero community. Iron Man leads the pro-registration faction; Captain America leads the resistance.',
      notes:'', category:'Political', media:[],
      subEvents:[
        { id:'s03a', title:'Stamford Disaster', date:'xx/xx/2006',
          description:"New Warriors filming a reality show confront supervillains near a school. Nitro's explosion kills 600 civilians, triggering public outcry.", notes:'', media:[], subEvents:[] },
        { id:'s03b', title:'Registration Act Passed', date:'xx/xx/2006',
          description:'Congress passes the Superhero Registration Act, requiring all people with superpowers to register with S.H.I.E.L.D.', notes:'', media:[], subEvents:[] },
        { id:'s03c', title:'Rogers Surrenders', date:'xx/xx/2006',
          description:'Witnessing the collateral destruction of the hero-vs-hero war, Steve Rogers orders his forces to stand down and surrenders.', notes:'', media:[], subEvents:[] }
      ]},
    { id:'e04', universeId:'u1', date:'xx/xx/2015', title:'Secret Wars II',
      description:'The Beyonders destroy the entire multiverse. Reed Richards assembles a "Life Raft." All of existence collapses into a final Battleworld ruled by God-Emperor Doom.',
      notes:'', category:'Cosmic', media:[],
      subEvents:[
        { id:'s04a', title:'Incursions Begin', date:'xx/xx/2013',
          description:'Parallel Earths begin colliding and destroying each other — the Illuminati are formed to stop them.', notes:'', media:[], subEvents:[] },
        { id:'s04b', title:'All Is Lost', date:'xx/xx/2015',
          description:'The final two Earths collide. Captain America and Iron Man watch the universe end.', notes:'', media:[], subEvents:[] }
      ]},
    { id:'e05', universeId:'u2', date:'02/05/2008', title:'Iron Man (MCU)',
      description:'Tony Stark is captured in Afghanistan, builds a crude armored suit to escape, and later perfects the technology. He publicly reveals himself as Iron Man — the first superhero of the MCU era.',
      notes:'Directed by Jon Favreau. Robert Downey Jr. The film that launched the entire MCU.',
      category:'Origin',
      media:[
        { id:'m05a', type:'youtube', name:'Iron Man - Official Trailer', src:'https://www.youtube.com/watch?v=8ugaeA-nMTc' }
      ],
      subEvents:[
        { id:'s05a', title:'Cave: Mark I', date:'xx/xx/2008',
          description:'"A box of scraps." Tony builds the first Iron Man suit using salvaged missile parts to escape the Ten Rings.',
          notes:'The arc reactor that powers the Mark I suit is about the size of a plate.',
          media:[], subEvents:[] },
        { id:'s05b', title:'"I am Iron Man"', date:'xx/xx/2008',
          description:'At a press conference, Tony Stark publicly reveals he is Iron Man — shattering the expected secret identity trope.',
          notes:'An iconic moment — Favreau confirmed RDJ improvised this line.',
          media:[], subEvents:[] }
      ]},
    { id:'e06', universeId:'u2', date:'04/05/2012', title:'The Avengers',
      description:'Nick Fury activates the Avenger Initiative after Loki steals the Tesseract. Six heroes unite for the first time to repel the Chitauri invasion of New York.',
      notes:'Directed by Joss Whedon. First time the assembled MCU cast shared the screen.',
      category:'Alliance', media:[],
      subEvents:[
        { id:'s06a', title:'Team Assembled', date:'xx/xx/2012',
          description:'Iron Man, Captain America, Thor, Hulk, Black Widow, and Hawkeye form the first Avengers roster.', notes:'', media:[], subEvents:[] },
        { id:'s06b', title:'Battle of New York', date:'xx/xx/2012',
          description:'The Avengers close the inter-dimensional portal above Stark Tower. Tony flies a nuclear warhead through the wormhole.',
          notes:'This battle is referenced throughout the entire MCU as a turning point for public awareness of superheroes.',
          media:[],
          subEvents:[
            { id:'s06b1', title:"Tony's Sacrifice", date:'xx/xx/2012',
              description:'With the nuclear warhead aimed at New York, Tony flies it through the Chitauri portal and nearly dies. His arc reactor temporarily powers down.',
              notes:'Foreshadows the sacrifice in Endgame. "Part of the journey is the end."',
              media:[], subEvents:[] }
          ]}
      ]},
    { id:'e07', universeId:'u2', date:'xx/xx/2018', title:'Infinity War',
      description:'Thanos completes his quest for all six Infinity Stones and snaps half of all life in the universe out of existence.',
      notes:'', category:'Cosmic', media:[],
      subEvents:[
        { id:'s07a', title:'The Snap', date:'xx/xx/2018',
          description:'Thanos snaps his fingers on Titan and 50% of all life — including half the Avengers — disintegrates into dust.', notes:'', media:[], subEvents:[] }
      ]},
    { id:'e08', universeId:'u2', date:'xx/xx/2019', title:'Avengers: Endgame',
      description:"Five years after the Snap, the remaining Avengers execute a \"time heist\" to collect the Infinity Stones from the past and undo Thanos' genocide.",
      notes:'The highest-grossing film of all time at release. Conclusion of the Infinity Saga.',
      category:'Battle', media:[],
      subEvents:[
        { id:'s08a', title:'The Time Heist', date:'xx/xx/2023',
          description:'The Avengers split into teams to retrieve the Stones from 2012, 2013, 2014, and 1970.',
          notes:'', media:[],
          subEvents:[
            { id:'s08a1', title:'New York 2012', date:'xx/xx/2023',
              description:'Tony and Steve retrieve the Mind Stone and Space Stone. Tony also secretly takes more Pym Particles.',
              notes:'The "America\'s ass" moment occurs here.', media:[], subEvents:[] },
            { id:'s08a2', title:'Vormir', date:'xx/xx/2023',
              description:'Natasha and Clint battle each other for the right to sacrifice themselves for the Soul Stone. Natasha wins — and dies.',
              notes:'Mirrors the Gamora sacrifice in Infinity War from Thanos\'s perspective.', media:[], subEvents:[] }
          ]},
        { id:'s08b', title:'The Final Battle', date:'xx/xx/2023',
          description:'All restored heroes face Thanos and his full army. Every Avenger, Guardian, wizard, and king fights together.', notes:'', media:[], subEvents:[] },
        { id:'s08c', title:'"I am Iron Man"', date:'xx/xx/2023',
          description:'Tony wields the Stones one last time, snapping Thanos and his army out of existence — at the cost of his own life.',
          notes:'Echoes the press conference line from 2008. Perfect bookend to the MCU Infinity Saga.',
          media:[], subEvents:[] }
      ]},
    { id:'e09', universeId:'u3', date:'xx/xx/1938', title:'Superman Arrives on Earth',
      description:"Kal-El's rocket crashes in Smallville, Kansas. He is found and raised as Clark Kent by Jonathan and Martha Kent, with powers far beyond mortal men.",
      notes:'Action Comics #1 (June 1938). The first superhero — Superman defined the genre.',
      category:'Origin', media:[], subEvents:[]},
    { id:'e10', universeId:'u3', date:'xx/xx/2011', title:'Flashpoint',
      description:"Barry Allen travels back in time to save his mother's life, accidentally creating a nightmarish alternate timeline: no Superman, Batman is Thomas Wayne, Aquaman and Wonder Woman are at war.",
      notes:'', category:'Betrayal', media:[],
      subEvents:[
        { id:'s10a', title:"Barry's Mistake", date:'xx/xx/2011',
          description:'Barry runs back in time and stops the Reverse-Flash from killing his mother. The timeline fractures catastrophically.', notes:'', media:[], subEvents:[] },
        { id:'s10b', title:'Flashpoint Timeline', date:'xx/xx/2011',
          description:'A world without Superman, a murderous Thomas Wayne as Batman, and an apocalyptic war between Atlantis and Themyscira.', notes:'', media:[], subEvents:[] },
        { id:'s10c', title:'Reset', date:'xx/xx/2011',
          description:"Barry undoes his own action, but Professor Zoom tampers with the timeline — creating the New 52 universe.", notes:'', media:[], subEvents:[] }
      ]},
    { id:'e11', universeId:'u3', date:'xx/xx/2016', title:'DC: Rebirth',
      description:"Wally West escapes the Speed Force and reveals a terrible truth: an outside force stole a decade from the DC Universe and erased legacy heroes from existence. The trail leads to Watchmen's Dr. Manhattan.",
      notes:'DC Universe Rebirth #1 (May 2016). Written by Geoff Johns. A love letter to DC history.',
      category:'Discovery', media:[],
      subEvents:[
        { id:'s11a', title:'Wally Returns', date:'xx/xx/2016',
          description:'Wally West, lost in the Speed Force since Flashpoint, reaches out to Barry Allen through sheer will. Barry remembers and pulls him home.', notes:'', media:[], subEvents:[] },
        { id:'s11b', title:"Metron's Chair & Dr. Manhattan", date:'xx/xx/2016',
          description:'Batman finds a smiley face button in the Batcave wall — a clue that Dr. Manhattan has been manipulating the DC timeline.', notes:'', media:[], subEvents:[] }
      ]}
  ];

  S.characters = [
    {
      id: 'ch01', name: 'Tony Stark', aliases: 'Iron Man, Iron Patriot, Shellhead',
      status: 'Deceased', species: 'Human', color: '#3498db',
      photo: null,
      powers: 'Genius-level intellect (IQ 270+)\nMaster engineer & inventor\nPowered Iron Man armour (strength, flight, energy weapons, AI support)\nTactical genius & billionaire industrialist',
      biography: 'Anthony Edward Stark is a genius inventor, billionaire, and former weapons manufacturer who built a powered armour suit and became Iron Man. He co-founded the Avengers and sacrificed his life to defeat Thanos.',
      notes: 'First appearance: Tales of Suspense #39 (1963).\nRDJ immortalised him in the MCU from 2008–2019.',
      media: [{ id: 'cm01a', type: 'youtube', name: 'Iron Man - Official Trailer (MCU)', src: 'https://www.youtube.com/watch?v=8ugaeA-nMTc' }],
      counterpartIds: ['ch02'], universeIds: ['u2']
    },
    {
      id: 'ch02', name: 'Tony Stark (616)', aliases: 'Iron Man, Director of S.H.I.E.L.D.',
      status: 'Alive', species: 'Human', color: '#e74c3c',
      photo: null,
      powers: 'Iron Man armour (multiple variants: Extremis, Bleeding Edge, Godkiller)\nExtremis bio-hack (briefly)\nGenius engineer & strategist',
      biography: 'The Marvel 616 Tony Stark. Led the pro-registration side during Civil War, later became Director of S.H.I.E.L.D., and has died and been revived multiple times.',
      notes: 'The original comics version — more morally complex than his MCU counterpart.',
      media: [], counterpartIds: ['ch01'], universeIds: ['u1']
    },
    {
      id: 'ch03', name: 'Steve Rogers', aliases: 'Captain America, Cap, Nomad',
      status: 'Alive', species: 'Super Soldier', color: '#2ecc71',
      photo: null,
      powers: 'Peak human physiology via Super Soldier Serum\nEnhanced strength, speed, agility, endurance & healing\nVibranium shield (indestructible)\nMaster tactician & hand-to-hand combatant',
      biography: 'A frail young man from Brooklyn, Steve Rogers was enhanced by the Super-Soldier Serum in WWII and became Captain America. He embodies ideals of justice and selflessness.',
      notes: 'Appears in both 616 and MCU continuities in different forms.',
      media: [], counterpartIds: [], universeIds: ['u1', 'u2']
    },
    {
      id: 'ch04', name: 'Barry Allen', aliases: 'The Flash, Scarlet Speedster',
      status: 'Alive', species: 'Meta-Human', color: '#f39c12',
      photo: null,
      powers: 'Connection to the Speed Force\nSupernatural speed (faster than light)\nTime travel via the Speed Force\nPhasing through solid matter\nCreating speed-force lightning\nReverse aging via speed',
      biography: 'Barry Allen is a Central City forensic scientist who gained super-speed after being struck by lightning in his lab. His time-travel mistake created the Flashpoint disaster.',
      notes: 'His mother\'s murder by the Reverse-Flash drives much of his arc in DC Rebirth.',
      media: [], counterpartIds: [], universeIds: ['u3']
    },
    {
      id: 'ch05', name: 'Thanos', aliases: 'The Mad Titan, Infinity\'s Champion',
      status: 'Deceased', species: 'Eternal-Deviant', color: '#9b59b6',
      photo: null,
      powers: 'Superhuman strength, speed, durability & telepathy\nMystic arts & energy manipulation\nMaster strategist\nWith Infinity Gauntlet: omnipotence over Reality, Space, Time, Mind, Power and Soul',
      biography: 'Thanos of Titan believes the universe\'s finite resources doom all life. His solution: eliminate half of all life with a single snap using the complete Infinity Gauntlet.',
      notes: 'Appears in both MCU (films) and Marvel 616 comics in different contexts.',
      media: [], counterpartIds: [], universeIds: ['u1', 'u2']
    }
  ];

  // Link characters to sample events
  const charEventLinks = {
    'e03': ['ch02', 'ch03'],         // Civil War (616)
    'e04': ['ch02', 'ch03'],         // Secret Wars II
    'e05': ['ch01'],                 // Iron Man MCU
    'e06': ['ch01', 'ch03'],         // The Avengers MCU
    'e07': ['ch01', 'ch03', 'ch05'], // Infinity War
    'e08': ['ch01', 'ch03', 'ch05'], // Endgame
    'e10': ['ch04'],                 // Flashpoint
    'e11': ['ch04']                  // DC Rebirth
  };
  S.events.forEach(ev => {
    ev.characterIds = charEventLinks[ev.id] || [];
  });

  S.connections = [
    { id:'c1', fromEventId:'e02', toEventId:'e04', label:'Echoes' },
    { id:'c2', fromEventId:'e03', toEventId:'e04', label:'Contributes to' },
    { id:'c3', fromEventId:'e05', toEventId:'e06', label:'Precedes' },
    { id:'c4', fromEventId:'e06', toEventId:'e07', label:'Leads to' },
    { id:'c5', fromEventId:'e07', toEventId:'e08', label:'Continues' },
    { id:'c6', fromEventId:'e10', toEventId:'e11', label:'Leads to' },
  ];
  syncCategoriesToState();
}

/* =====================================================
   MULTI-VIEW SYSTEM
   ===================================================== */
let _currentView = 'timeline';
function switchView(view) {
  if (typeof ContinuityTour !== 'undefined' && ContinuityTour.active && view !== 'timeline') ContinuityTour.stop(false);
  if (typeof MemoryTour !== 'undefined' && MemoryTour.active && view !== 'timeline') MemoryTour.stop(false);
  _currentView = view;
  const canvasWrap = document.getElementById('canvas-wrap');
  const filterPanel = document.getElementById('filter-panel');

  const isTimeline = view === 'timeline';
  canvasWrap.style.display = isTimeline ? 'block' : 'none';
  filterPanel.style.display = isTimeline ? '' : 'none';

  document.getElementById('chars-view').classList.toggle('visible', view === 'characters');
  document.getElementById('map-view').classList.toggle('visible', view === 'connections');
  document.getElementById('stats-full-view').classList.toggle('visible', view === 'stats');

  ['timeline','characters','connections','stats'].forEach(function(v) {
    var tab = document.getElementById('tab-' + v);
    if (tab) tab.classList.toggle('active', v === view);
  });

  if (view === 'characters') renderCharsView();
  if (view === 'connections') { setTimeout(function() { ConnectionMap.build(document.getElementById('map-view')); }, 60); }
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

function renderCharsView() {
  var grid = document.getElementById('cv-grid');
  if (!grid) return;
  var q = (document.getElementById('cv-search') || {}).value || '';
  q = q.toLowerCase().trim();

  var chars = S.characters.filter(function(ch) {
    if (!q) return true;
    return ch.name.toLowerCase().includes(q) ||
      (ch.aliases || '').toLowerCase().includes(q) ||
      (ch.species || '').toLowerCase().includes(q) ||
      (ch.affiliation || '').toLowerCase().includes(q) ||
      (ch.notes || '').toLowerCase().includes(q);
  });

  if (chars.length === 0) {
    var isFirst = S.characters.length === 0;
    grid.innerHTML =
      '<div class="cv-empty">' +
        '<div class="cv-empty-glyph">\u2756 \u2756 \u2756</div>' +
        '<div class="cv-empty-title">' + (isFirst ? 'The character list is empty' : 'No dossier matches your search') + '</div>' +
        '<div class="cv-empty-msg">' +
          (isFirst
            ? 'Every universe begins with its first name. Create a dossier to record a character\u2019s identity, organizations, and the events that shape them.'
            : 'Try a different name, alias, species, organization, or note keyword.') +
        '</div>' +
        (isFirst ? '<div class="cv-empty-cta">Use the <strong>+ New Character</strong> button to begin.</div>' : '') +
      '</div>';
    return;
  }

  grid.innerHTML = chars.map(function(ch) {
    var evCnt = S.events.filter(function(e) { return (e.characterIds||[]).includes(ch.id); }).length;
    var uniIds = getCharUniverseIds(ch);
    var tagsHTML = uniIds.slice(0, 4).map(function(uid) {
      var u = getU(uid);
      return u ? '<span class="cv-tag" style="background:' + u.color + '">' + esc(u.name) + '</span>' : '';
    }).join('');
    if (uniIds.length > 4) {
      tagsHTML += '<span class="cv-tag" style="background:#555">+' + (uniIds.length - 4) + '</span>';
    }

    var avatarInner = ch.photo
      ? '<img src="' + esc(ch.photo) + '" alt="' + esc(ch.name) + '">'
      : esc(ch.name.split(' ').map(function(w){return w[0]||''}).join('').slice(0,2).toUpperCase());

    var statusColors = { 'Alive': '#2ecc71', 'Deceased': '#e74c3c', 'Missing': '#f39c12', 'Unknown': '#95a5a6', 'Retired': '#3498db', 'Active': '#2ecc71', 'Other': '#f39c12' };
    var sCol = statusColors[ch.status] || '#95a5a6';
    var alignColors = { 'Hero': '#2ecc71', 'Villain': '#e74c3c', 'Neutral': '#95a5a6' };
    var aCol = alignColors[ch.alignment] || '#95a5a6';

    var chipsHTML = '';
    if (ch.status)    chipsHTML += '<span class="cv-chip status" style="background:' + sCol + '">' + esc(ch.status) + '</span>';
    if (ch.alignment) chipsHTML += '<span class="cv-chip align" style="background:' + aCol + '">' + esc(ch.alignment) + '</span>';
    if (ch.species)   chipsHTML += '<span class="cv-chip species">' + esc(ch.species) + '</span>';

    var accent = ch.color || (uniIds.length ? ((getU(uniIds[0])||{}).color || '#4a8fde') : '#4a8fde');

    var ticksMax = 8;
    var ticksFilled = Math.min(evCnt, ticksMax);
    var ticksHTML = '';
    for (var i = 0; i < ticksMax; i++) {
      ticksHTML += '<span class="cv-events-tick' + (i >= ticksFilled ? ' empty' : '') + '"></span>';
    }
    var eventsLabel = evCnt === 0
      ? '<span class="zero">No linked events</span>'
      : evCnt + ' event' + (evCnt !== 1 ? 's' : '');

    var affilHTML = ch.affiliation
      ? '<div class="cv-affil"><span class="cv-affil-label">Organization</span><span>' + esc(ch.affiliation) + '</span></div>'
      : '';

    var notesHTML = ch.notes
      ? '<div class="cv-notes">' + esc(ch.notes) + '</div>'
      : '';

    var avatarStyle = ch.photo ? '' : 'background:' + accent + ';color:#fff;font-weight:800';

    return '<div class="cv-card" tabindex="0" role="button" aria-label="Open dossier for ' + esc(ch.name) + '" ' +
        'data-cid="' + ch.id + '" ' +
        'style="--cv-accent:' + accent + '" ' +
        'onclick="MS=[{t:\'charDetail\',charId:\'' + ch.id + '\'}];M.push(MS[0]);M.render()" ' +
        'onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();MS=[{t:\'charDetail\',charId:\'' + ch.id + '\'}];M.push(MS[0]);M.render();}">' +
      '<div class="cv-card-top">' +
        '<div class="cv-avatar" style="' + avatarStyle + '">' + avatarInner + '</div>' +
        '<div class="cv-heading">' +
          '<div class="cv-name">' + esc(ch.name) + '</div>' +
          (ch.aliases ? '<div class="cv-alias">aka ' + esc(ch.aliases) + '</div>' : '') +
          (ch.occupation ? '<div class="cv-sub">' + esc(ch.occupation) + '</div>' : '') +
        '</div>' +
      '</div>' +
      (chipsHTML ? '<div class="cv-chip-row">' + chipsHTML + '</div>' : '') +
      (tagsHTML ? '<div class="cv-tags">' + tagsHTML + '</div>' : '') +
      affilHTML +
      notesHTML +
      '<div class="cv-events">' +
        '<div class="cv-events-ticks" aria-hidden="true">' + ticksHTML + '</div>' +
        '<div class="cv-events-count">' + eventsLabel + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

function renderStatsFullView() {
  var el = document.getElementById('stats-full-view');
  if (!el) return;

  var totalEvents = S.events.length;
  var totalUniverses = S.universes.length;
  var totalChars = S.characters.length;
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

  var uniCounts = {};
  S.universes.forEach(function(u) {
    uniCounts[u.id] = { name: u.name, color: u.color, cnt: S.events.filter(function(e) { return e.universeId === u.id; }).length };
  });
  var uniEntries = Object.values(uniCounts).sort(function(a,b) { return b.cnt - a.cnt; });
  var maxUni = uniEntries.length > 0 ? uniEntries[0].cnt : 1;
  var mostActiveUni = uniEntries.length > 0 ? uniEntries[0] : null;

  var uniBarsHTML = uniEntries.map(function(u) {
    var pct = Math.round((u.cnt / maxUni) * 100);
    return '<div class="sfv-bar-row">' +
      '<div class="sfv-bar-label"><span>' + esc(u.name) + '</span><span>' + u.cnt + '</span></div>' +
      '<div class="sfv-bar-track"><div class="sfv-bar-fill" style="width:' + pct + '%;background:' + u.color + '"></div></div></div>';
  }).join('');

  var topChars = S.characters.map(function(ch) {
    var cnt = S.events.filter(function(e) { return (e.characterIds||[]).includes(ch.id); }).length;
    return { name: ch.name, cnt: cnt, color: ch.color || charHashColor(ch.id) };
  }).sort(function(a,b) { return b.cnt - a.cnt; }).slice(0, 8);
  var topCharsHTML = topChars.map(function(p) {
    return '<div class="sfv-list-item"><span class="sfv-dot" style="background:' + p.color + '"></span><span style="flex:1">' + esc(p.name) + '</span><span style="font-weight:700;color:#222">' + p.cnt + ' events</span></div>';
  }).join('');

  var affiliationCounts = {};
  S.characters.forEach(function(ch) {
    if (ch.affiliation) { affiliationCounts[ch.affiliation] = (affiliationCounts[ch.affiliation]||0)+1; }
  });
  var affEntries = Object.entries(affiliationCounts).sort(function(a,b) { return b[1]-a[1]; });
  var maxAff = affEntries.length > 0 ? affEntries[0][1] : 1;
  var affBarsHTML = affEntries.map(function(entry) {
    var pct = Math.round((entry[1] / maxAff) * 100);
    return '<div class="sfv-bar-row">' +
      '<div class="sfv-bar-label"><span>' + esc(entry[0]) + '</span><span>' + entry[1] + '</span></div>' +
      '<div class="sfv-bar-track"><div class="sfv-bar-fill" style="width:' + pct + '%;background:#9b59b6"></div></div></div>';
  }).join('');

  var speciesCounts = {};
  S.characters.forEach(function(ch) {
    var sp = ch.species || 'Unknown';
    speciesCounts[sp] = (speciesCounts[sp]||0)+1;
  });
  var speciesEntries = Object.entries(speciesCounts).sort(function(a,b) { return b[1]-a[1]; });
  var maxSpecies = speciesEntries.length > 0 ? speciesEntries[0][1] : 1;
  var speciesHTML = speciesEntries.map(function(entry) {
    var pct = Math.round((entry[1] / maxSpecies) * 100);
    return '<div class="sfv-bar-row">' +
      '<div class="sfv-bar-label"><span>' + esc(entry[0]) + '</span><span>' + entry[1] + '</span></div>' +
      '<div class="sfv-bar-track"><div class="sfv-bar-fill" style="width:' + pct + '%;background:#4a8fde"></div></div></div>';
  }).join('');

  var recentEvs = S.events.slice().sort(function(a,b) {
    var da = parseDate(a.date), db = parseDate(b.date);
    return (db||0) - (da||0);
  }).slice(0, 7);
  var recentHTML = recentEvs.map(function(ev) {
    var info = CATEGORIES[ev.category] || CATEGORIES['Other'];
    var uni = S.universes.find(function(u) { return u.id === ev.universeId; });
    return '<tr>' +
      '<td><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:' + info.color + ';margin-right:5px;vertical-align:middle"></span>' + esc(ev.title) + '</td>' +
      '<td>' + esc(ev.date) + '</td>' +
      '<td>' + (uni ? esc(uni.name) : '\u2014') + '</td></tr>';
  }).join('');

  var worldScore = Math.min(100, Math.round(
    (Math.min(totalEvents, 50) / 50) * 25 +
    (Math.min(totalUniverses, 5) / 5) * 20 +
    (Math.min(totalChars, 10) / 10) * 20 +
    (Math.min(totalConns, 10) / 10) * 15 +
    (Math.min(catEntries.length, 5) / 5) * 10 +
    (spanYears > 0 ? Math.min(spanYears, 100) / 100 * 10 : 0)
  ));
  var gaugeLabel = worldScore >= 80 ? 'Epic' : worldScore >= 60 ? 'Rich' : worldScore >= 40 ? 'Growing' : worldScore >= 20 ? 'Emerging' : 'New';
  function wScoreColor(s) { return s >= 80 ? '#2ecc71' : s >= 60 ? '#27ae60' : s >= 40 ? '#f39c12' : s >= 20 ? '#e67e22' : '#e74c3c'; }

  var SIZE = 180, R = 72, cx = SIZE/2, cy = SIZE/2;
  var arcStart = -225, arcEnd = 45, totalAngle = 270;
  var scoreAngle = arcStart + (worldScore / 100) * totalAngle;
  function polarToXY(cx2, cy2, r, deg) { var rad = (deg - 90) * Math.PI / 180; return { x: cx2 + r * Math.cos(rad), y: cy2 + r * Math.sin(rad) }; }
  function arcPath(cx2, cy2, r, sd, ed) {
    var s = polarToXY(cx2,cy2,r,sd), e = polarToXY(cx2,cy2,r,ed);
    var large = ((ed - sd + 360) % 360) > 180 ? 1 : 0;
    return 'M ' + s.x + ' ' + s.y + ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + e.x + ' ' + e.y;
  }
  var gCol = wScoreColor(worldScore);
  var trackPath = arcPath(cx, cy, R, arcStart, arcEnd);
  var fillPath = worldScore > 0 ? arcPath(cx, cy, R, arcStart, Math.min(scoreAngle, arcEnd - 0.1)) : '';
  var gaugeHTML = '<svg width="' + SIZE + '" height="' + SIZE + '" class="sfv-gauge-svg" viewBox="0 0 ' + SIZE + ' ' + SIZE + '">' +
    '<defs><linearGradient id="uniGaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="' + gCol + '" stop-opacity="0.7"/><stop offset="100%" stop-color="' + gCol + '"/></linearGradient></defs>' +
    '<path d="' + trackPath + '" fill="none" stroke="#e0e4ee" stroke-width="10" stroke-linecap="round"/>' +
    (fillPath ? '<path d="' + fillPath + '" fill="none" stroke="url(#uniGaugeGrad)" stroke-width="10" stroke-linecap="round"/>' : '') +
    '<text x="' + cx + '" y="' + (cy - 8) + '" class="sfv-gauge-score" fill="' + gCol + '">' + worldScore + '</text>' +
    '<text x="' + cx + '" y="' + (cy + 16) + '" class="sfv-gauge-label" fill="' + gCol + '" font-size="13" font-weight="700" text-anchor="middle">' + gaugeLabel + '</text>' +
    '<text x="' + cx + '" y="' + (cy + 32) + '" fill="#999" font-size="9" text-anchor="middle">World Richness</text></svg>';

  function subBar(label, value, color) {
    return '<div class="sfv-sub-bar-row"><div class="sfv-sub-bar-label"><span>' + label + '</span><span>' + value + '%</span></div>' +
      '<div class="sfv-sub-bar-track"><div class="sfv-sub-bar-fill" style="width:' + value + '%;background:' + color + '"></div></div></div>';
  }
  var evRichness = Math.min(100, Math.round((Math.min(totalEvents, 50) / 50) * 100));
  var uniDiv = Math.min(100, Math.round((Math.min(totalUniverses, 5) / 5) * 100));
  var charDepth = Math.min(100, Math.round((Math.min(totalChars, 10) / 10) * 100));
  var connDens = Math.min(100, Math.round((Math.min(totalConns, 10) / 10) * 100));

  function deltaHTML(val, suffix) {
    if (val > 0) return '<div class="m-delta sfv-delta-up">\u25B2 ' + val + (suffix||'') + '</div>';
    if (val < 0) return '<div class="m-delta sfv-delta-dn">\u25BC ' + Math.abs(val) + (suffix||'') + '</div>';
    return '<div class="m-delta sfv-delta-flat">\u25AC Flat</div>';
  }

  el.innerHTML =
    '<div class="sfv-title">◉ Chronicle Observatory — Universe Analytics</div>' +
    '<div class="sfv-grid">' +
      '<div class="sfv-card"><h3>World Richness Score</h3>' +
        '<div class="sfv-gauge-wrap">' + gaugeHTML +
          '<div style="width:100%">' +
            subBar('Event Richness', evRichness, wScoreColor(evRichness)) +
            subBar('Universe Diversity', uniDiv, wScoreColor(uniDiv)) +
            subBar('Character Depth', charDepth, wScoreColor(charDepth)) +
            subBar('Connection Density', connDens, wScoreColor(connDens)) +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="sfv-card"><h3>Key Metrics</h3>' +
        '<div class="sfv-metric-grid">' +
          '<div class="sfv-metric-box"><div class="m-val">' + totalEvents + '</div><div class="m-lbl">Total Events</div>' + deltaHTML(totalEvents) + '</div>' +
          '<div class="sfv-metric-box"><div class="m-val">' + totalUniverses + '</div><div class="m-lbl">Universes</div>' + deltaHTML(totalUniverses) + '</div>' +
          '<div class="sfv-metric-box"><div class="m-val">' + totalChars + '</div><div class="m-lbl">Characters</div>' + deltaHTML(totalChars) + '</div>' +
          '<div class="sfv-metric-box"><div class="m-val">' + totalConns + '</div><div class="m-lbl">Connections</div>' + deltaHTML(totalConns) + '</div>' +
          '<div class="sfv-metric-box"><div class="m-val" style="font-size:16px">' + esc(dateRange) + '</div><div class="m-lbl">Timeline Span</div>' + (spanYears > 0 ? '<div class="m-delta sfv-delta-up">' + spanYears + ' years</div>' : '') + '</div>' +
          '<div class="sfv-metric-box"><div class="m-val" style="font-size:14px">' + (mostActiveUni ? esc(mostActiveUni.name) : '\u2014') + '</div><div class="m-lbl">Most Active Universe</div>' + (mostActiveUni ? '<div class="m-delta sfv-delta-up">' + mostActiveUni.cnt + ' events</div>' : '') + '</div>' +
          '<div class="sfv-metric-box"><div class="m-val">' + catEntries.length + '</div><div class="m-lbl">Categories Used</div>' + deltaHTML(catEntries.length) + '</div>' +
          '<div class="sfv-metric-box"><div class="m-val">' + speciesEntries.length + '</div><div class="m-lbl">Species</div>' + deltaHTML(speciesEntries.length) + '</div>' +
        '</div>' +
      '</div>' +

      '<div class="sfv-card"><h3>Recent Events</h3>' +
        '<table class="sfv-recent-table"><thead><tr><th>Event</th><th>Date</th><th>Universe</th></tr></thead>' +
        '<tbody>' + (recentHTML || '<tr><td colspan="3" style="color:#999;text-align:center">No events yet.</td></tr>') + '</tbody></table>' +
      '</div>' +

      '<div class="sfv-card"><h3>Events by Category</h3>' + (catBarsHTML || '<div style="color:#999;font-size:12px">No events yet.</div>') + '</div>' +
      '<div class="sfv-card"><h3>Events by Universe</h3>' + (uniBarsHTML || '<div style="color:#999;font-size:12px">No universes yet.</div>') + '</div>' +
      '<div class="sfv-card"><h3>Most Active Characters</h3>' + (topCharsHTML || '<div style="color:#999;font-size:12px">No characters yet.</div>') + '</div>' +
      '<div class="sfv-card"><h3>Species Breakdown</h3>' + (speciesHTML || '<div style="color:#999;font-size:12px">No species data.</div>') + '</div>' +
      '<div class="sfv-card"><h3>Organizations</h3>' + (affBarsHTML || '<div style="color:#999;font-size:12px">No organizations yet.</div>') + '</div>' +
    '</div>';
}

/* =====================================================
   INITIALISATION
   ===================================================== */
window.addEventListener('DOMContentLoaded', () => {
  /* B-2: drop a stale blank-template save before we decide whether to load samples. */
  Store.clearSavedBlank();
  const _hadSavedWork = Store.load();
  if (!_hadSavedWork) loadSample();
  Store.normalize();
  Store.autosave();
  if (!S.categories || Object.keys(S.categories).length === 0) {
    syncCategoriesToState();
  }

  initCanvas();
  initUniverseScrollbar();
  updateFilterBar();
  updateUniToggleBar();
  updateCatFilterBar();
  updateStatusFilterBar();
  updateTagFilterBar();
  updateToneFilterBar();
  updateCharFilterSelect();
  fitFullTimeline();
  render();
  updateUniverseScrollbar();

  /* #043: first-run onboarding. Shown only when there was no saved work
     (sample data is now visible) and the user has not dismissed it before. */
  if (!_hadSavedWork && typeof ftOnboarding !== 'undefined') {
    ftOnboarding.maybeShow({
      flagKey: 'ft_uni_onboarded',
      glyph: '✦',
      title: 'Welcome to Universe Timeline',
      lines: [
        'These are example universes and events — feel free to delete them and add your own.',
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
    if (e.key === 'Escape') {
      M.close(); closeLightbox(); if (_kbdVisible) UI.toggleKbd();
      if (typeof mobCloseDrawer === 'function') mobCloseDrawer();
      if (typeof mobCloseFilters === 'function') mobCloseFilters();
    }
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
    if (e.ctrlKey && e.key === 'z' && !e.shiftKey) { e.preventDefault(); window.History.undo(); }                 /* UE-1: unified on window.History */
    if (e.ctrlKey && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); window.History.redo(); }
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
  setTimeout(() => notify('Welcome! \u2728  Double-click any track to add your first event.', 'info'), 700);
});

/* =====================================================
   CHARACTER FILTER STATE & HELPERS
   ===================================================== */
let _charFilterIds = [];
let _storyLineVisible = false;
let _charSortOrder = 'a-z'; /* a-z, events, universe */

let _filterMode = 'any'; // 'any' = OR, 'all' = AND
let _searchText = '';   // live event text search

/* Category filter */
let _catFilter = null; // null = all, else category name string

/* Status filter */
let _statusFilter = null; // null = all, else status string

/* Tag filter */
let _tagFilter = null; // null = all, else tag string

/* Tone filter */
let _toneFilter = null; // null = all, else tone string

/* Stats panel visibility */
let _statsVisible = false;

/* Keyboard shortcuts panel visibility */
let _kbdVisible = false;

function updateEventSearch(val) {
  _searchText = (val || '').trim().toLowerCase();
  updateFilterBar();
  if (typeof updateMobileActiveStrip === 'function') updateMobileActiveStrip();
  render();
}

/* ---- Category filter ---- */
function setCatFilter(cat) {
  _catFilter = (_catFilter === cat) ? null : cat;
  updateCatFilterBar();
  if (typeof updateMobileActiveStrip === 'function') updateMobileActiveStrip();
  render();
}

function clearCatFilter() {
  _catFilter = null;
  updateCatFilterBar();
  if (typeof updateMobileActiveStrip === 'function') updateMobileActiveStrip();
  render();
}

/* ---- Status filter ---- */
function setStatusFilter(status) {
  _statusFilter = (_statusFilter === status) ? null : status;
  updateStatusFilterBar();
  if (typeof updateMobileActiveStrip === 'function') updateMobileActiveStrip();
  render();
}

function clearStatusFilter() {
  _statusFilter = null;
  updateStatusFilterBar();
  if (typeof updateMobileActiveStrip === 'function') updateMobileActiveStrip();
  render();
}

function updateStatusFilterBar() {
  const sel = document.getElementById('status-filter-select');
  if (!sel) return;
  var html = '<option value="">\u25CF Status</option>';
  UNI_STATUSES.forEach(function(st) {
    var cnt = S.events.filter(function(ev){ return ev.status === st; }).length;
    html += '<option value="' + esc(st) + '"' + (_statusFilter === st ? ' selected' : '') + '>' + esc(st) + ' (' + cnt + ')</option>';
  });
  sel.innerHTML = html;
  updateAllClearBtn();
}

/* ---- Tag filter ---- */
function setTagFilter(tag) {
  _tagFilter = tag || null;
  updateTagFilterBar();
  if (typeof updateMobileActiveStrip === 'function') updateMobileActiveStrip();
  render();
}

function clearTagFilter() {
  _tagFilter = null;
  updateTagFilterBar();
  if (typeof updateMobileActiveStrip === 'function') updateMobileActiveStrip();
  render();
}

function updateTagFilterBar() {
  const sel = document.getElementById('tag-filter-select');
  if (!sel) return;

  const allTags = {};
  S.events.forEach(function(ev) {
    (ev.tags || []).forEach(function(t) {
      allTags[t] = (allTags[t] || 0) + 1;
    });
  });

  const tagNames = Object.keys(allTags).sort();
  var html = '<option value="">\uD83C\uDFF7 Tags</option>';
  tagNames.forEach(function(tag) {
    var cnt = allTags[tag];
    html += '<option value="' + esc(tag) + '"' + (_tagFilter === tag ? ' selected' : '') + '>' + esc(tag) + ' (' + cnt + ')</option>';
  });
  sel.innerHTML = html;
  updateAllClearBtn();
}

/* ---- Tone filter ---- */
function setToneFilter(tone) {
  _toneFilter = tone || null;
  updateToneFilterBar();
  if (typeof updateMobileActiveStrip === 'function') updateMobileActiveStrip();
  render();
}

function clearToneFilter() {
  _toneFilter = null;
  updateToneFilterBar();
  if (typeof updateMobileActiveStrip === 'function') updateMobileActiveStrip();
  render();
}

function updateToneFilterBar() {
  const sel = document.getElementById('tone-filter-select');
  if (!sel) return;

  const allTones = {};
  S.events.forEach(function(ev) {
    if (ev.tone) allTones[ev.tone] = (allTones[ev.tone] || 0) + 1;
  });

  var html = '<option value="">\uD83C\uDFAD Tone</option>';
  TONE_OPTIONS.forEach(function(tone) {
    var cnt = allTones[tone] || 0;
    if (cnt > 0) {
      html += '<option value="' + esc(tone) + '"' + (_toneFilter === tone ? ' selected' : '') + '>' + toneIcon(tone) + ' ' + esc(tone) + ' (' + cnt + ')</option>';
    }
  });
  sel.innerHTML = html;
  updateAllClearBtn();
}

function updateCatFilterBar() {
  const sel = document.getElementById('cat-filter-select');
  if (!sel) return;

  const allCats = Object.keys(CATEGORIES);
  const counts = {};
  allCats.forEach(function(c){ counts[c] = 0; });
  S.events.forEach(function(ev){ if (ev.category && counts[ev.category] !== undefined) counts[ev.category]++; });

  var html = '<option value="">\uD83C\uDFED Category</option>';
  allCats.forEach(function(cat) {
    var info = CATEGORIES[cat];
    var cnt = counts[cat];
    html += '<option value="' + esc(cat) + '"' + (_catFilter === cat ? ' selected' : '') + '>' + info.icon + ' ' + esc(cat) + ' (' + cnt + ')</option>';
  });
  sel.innerHTML = html;
  updateAllClearBtn();
}

function updateCharFilterSelect() {
  const sel = document.getElementById('char-filter-select');
  if (!sel) return;
  var html = '<option value="">\uD83D\uDC64 Character</option>';
  S.characters.forEach(function(ch) {
    if (_charFilterIds.indexOf(ch.id) === -1) {
      html += '<option value="' + ch.id + '">' + esc(ch.name) + '</option>';
    }
  });
  sel.innerHTML = html;
}

function addCharFilterFromSelect(charId) {
  if (!charId) return;
  if (_charFilterIds.indexOf(charId) === -1) {
    _charFilterIds.push(charId);
  }
  updateFilterBar();
  updateCharFilterSelect();
  render();
}

function clearAllFilters() {
  _catFilter = null;
  _statusFilter = null;
  _tagFilter = null;
  _toneFilter = null;
  _charFilterIds = [];
  _searchText = '';
  var si = document.getElementById('ev-search-input');
  if (si) si.value = '';
  updateCatFilterBar();
  updateStatusFilterBar();
  updateTagFilterBar();
  updateToneFilterBar();
  updateFilterBar();
  updateCharFilterSelect();
  if (typeof updateMobileActiveStrip === 'function') updateMobileActiveStrip();
  render();
}

function updateAllClearBtn() {
  var btn = document.getElementById('all-clear-btn');
  if (!btn) return;
  var anyActive = _catFilter || _statusFilter || _tagFilter || _toneFilter || _charFilterIds.length > 0 || _searchText.length > 0;
  btn.style.display = anyActive ? '' : 'none';
}

/* ---- Stats panel ---- */
function updateStatsPanel() {
  const panel = document.getElementById('stats-panel');
  if (!panel) return;

  if (!_statsVisible) { panel.classList.remove('visible'); return; }

  const totalEvents = S.events.length;
  const totalUnis = S.universes.length;
  const totalChars = S.characters.length;
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

  panel.innerHTML =
    '<div style="font-size:9px;font-weight:900;letter-spacing:.8px;color:#6080c0;margin-bottom:8px">TIMELINE STATS</div>' +
    '<div class="sp-row">' +
      '<div class="sp-item"><div class="sp-val">' + totalEvents + '</div><div class="sp-lbl">EVENTS</div></div>' +
      '<div class="sp-divider"></div>' +
      '<div class="sp-item"><div class="sp-val">' + totalUnis + '</div><div class="sp-lbl">UNIVERSES</div></div>' +
      '<div class="sp-divider"></div>' +
      '<div class="sp-item"><div class="sp-val">' + totalChars + '</div><div class="sp-lbl">CHARACTERS</div></div>' +
      '<div class="sp-divider"></div>' +
      '<div class="sp-item"><div class="sp-val">' + totalConns + '</div><div class="sp-lbl">CONNECTIONS</div></div>' +
    '</div>' +
    '<div style="font-size:10px;color:#6080a0;margin-bottom:6px">&#128197; Span: <strong style="color:#c0d0ff">' + esc(dateRange) + '</strong></div>' +
    (catHTML ? '<div style="font-size:10px;color:#6080a0;border-top:1px solid rgba(255,255,255,0.1);padding-top:6px;margin-top:2px">Top categories: ' + catHTML + '</div>' : '');

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
  updateCharFilterSelect();
  render();
}

function clearCharFilters() {
  _charFilterIds = [];
  updateFilterBar();
  updateCharFilterSelect();
  render();
}

function toggleFilterMode() {
  _filterMode = _filterMode === 'any' ? 'all' : 'any';
  updateFilterBar();
  render();
}

function updateFilterBar() {
  const chips    = document.getElementById('cf-chips');
  const modeBtn  = document.getElementById('cf-mode-btn');
  const clearBtn = document.getElementById('cf-clear-btn');
  const summary  = document.getElementById('cf-summary');

  if (_charFilterIds.length === 0) {
    if (chips) chips.innerHTML = '';
    if (modeBtn)  modeBtn.style.display  = 'none';
    if (clearBtn) clearBtn.style.display = 'none';
    if (summary)  summary.textContent    = '';
    updateAllClearBtn();
    if (typeof updateMobileActiveStrip === 'function') updateMobileActiveStrip();
    return;
  }

  if (chips) chips.innerHTML = _charFilterIds.map(cid => {
    const ch = S.characters.find(c => c.id === cid);
    if (!ch) return '';
    const col = ch.color || charHashColor(cid);
    return '<span class="cf-chip" style="background:' + col + '22;color:' + col + ';border-color:' + col + '55" onclick="toggleCharFilter(\'' + cid + '\')">' +
      (ch.photo ? '<img src="' + esc(ch.photo) + '" style="width:13px;height:13px;border-radius:50%;object-fit:cover">' : '') +
      esc(ch.name) + ' <span class="cf-x">\u00d7</span></span>';
  }).join('');

  if (_charFilterIds.length >= 2) {
    if (modeBtn) { modeBtn.style.display = ''; modeBtn.textContent = _filterMode === 'any' ? 'OR' : 'AND'; }
  } else {
    if (modeBtn) modeBtn.style.display = 'none';
  }
  if (clearBtn) clearBtn.style.display = '';

  const matchCount = S.events.filter(ev => {
    const ids = ev.characterIds || [];
    const cMatch = _filterMode === 'all'
      ? _charFilterIds.every(fid => ids.includes(fid))
      : _charFilterIds.some(fid => ids.includes(fid));
    const sMatch = _searchText ? (ev.title + ' ' + (ev.description||'') + ' ' + (ev.tags||[]).join(' ')).toLowerCase().includes(_searchText) : true;
    return cMatch && sMatch;
  }).length;
  if (summary) summary.textContent = matchCount + ' event' + (matchCount !== 1 ? 's' : '') + ' highlighted';
  updateAllClearBtn();
  if (typeof updateMobileActiveStrip === 'function') updateMobileActiveStrip();
}

/* =====================================================
   UNIVERSE TOGGLE BAR
   ===================================================== */
function updateUniToggleBar() {
  const bar = document.getElementById('uni-toggle-bar');
  const chips = document.getElementById('uni-toggle-chips');
  const hint = document.getElementById('uni-toggle-hint');
  if (!chips) return;
  if (S.universes.length === 0) {
    chips.innerHTML = '';
    if (hint) hint.textContent = 'No universes yet — click  + Universe  in the toolbar to add one';
    return;
  }
  if (hint) hint.textContent = '';
  chips.innerHTML = S.universes.map(u => {
    const hidden = u.visible === false;
    return '<button type="button" class="uni-toggle-chip' + (hidden ? ' hidden-uni' : '') + '" ' +
      'style="background:' + u.color + ';border-color:' + u.color + ';" ' +
      'onclick="toggleUniverse(\'' + u.id + '\')" title="Click to show or hide this universe" ' +
      'aria-pressed="' + (!hidden) + '" aria-label="' + (hidden ? 'Show universe ' : 'Hide universe ') + esc(u.name) + '">' +
      '<span aria-hidden="true">' + (hidden ? '🚫 ' : '✅ ') + esc(u.name) + '</span>' +
      '<span class="sr-only">' + (hidden ? 'Hidden' : 'Visible') + '</span></button>';
  }).join('');
}

function toggleUniverse(uid2) {
  const u = S.universes.find(x => x.id === uid2);
  if (!u) return;
  u.visible = u.visible === false ? true : false;
  Store.autosave();   /* UE-3: persist the visibility flip (was lost on refresh) and capture it in undo history */
  updateUniToggleBar();
  render();
  notify((u.visible === false ? 'Hidden universe: ' : 'Showing universe: ') + u.name, 'info');
}

/* =====================================================
   CONNECTION MAP  (v6 — pan/zoom, search, hover glow, edge click)
   ===================================================== */
const ConnectionMap = {
  _uniFilter: null,
  _mx: 0, _my: 0, _mscale: 1,
  _listenersAttached: false,
  _container: null,
  _pos: {},
  _W: 740, _H: 540,

  build(container) {
    this._container = container;
    this._mx = 0; this._my = 0; this._mscale = 1;
    if (S.characters.length === 0) {
      container.innerHTML =
        '<div class="conn-map-wrap" id="cm-wrap"><div class="cm-empty">'
        + '<div class="cm-empty-star">\u2728</div>'
        + '<h3>Your constellation is waiting</h3>'
        + '<p>Connections appear when two characters share events, or when you mark them as counterparts across universes. Add a few characters first, then link them to scenes \u2014 the map will light up on its own.</p>'
        + '<div class="cm-empty-steps">'
          + '<b>1.</b> Open the \u2318 Characters tab and add characters.<br>'
          + '<b>2.</b> Open any event and attach two or more characters to it.<br>'
          + '<b>3.</b> (Optional) In a character profile, list counterparts to link alt-universe versions.<br>'
          + '<b>4.</b> Return here \u2014 edges will glow between shared characters.'
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
    S.characters.forEach(ch => {
      (ch.counterpartIds || []).forEach(cid => {
        const key = [ch.id, cid].sort().join('|') + '__cp';
        if (!edgeMap[key]) edgeMap[key] = { a: ch.id, b: cid, type: 'counterpart', sharedEvs: [] };
      });
    });
    const edges = Object.values(edgeMap);

    // Filter chars by universe if needed
    const allChars = S.characters.filter(ch => {
      if (!this._uniFilter) return true;
      return S.events.some(ev => ev.universeId === this._uniFilter && (ev.characterIds || []).includes(ch.id));
    });

    // Improved radial layout
    const W = 740, H = 540;
    this._W = W; this._H = H;
    const CX = W / 2, CY = H / 2;
    const N = allChars.length;
    const R = Math.min(CX, CY) * (N <= 3 ? 0.52 : N <= 6 ? 0.65 : 0.73);
    const pos = {};
    this._pos = pos;
    allChars.forEach((ch, i) => {
      const a = (2 * Math.PI * i / N) - Math.PI / 2;
      pos[ch.id] = { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a) };
    });

    /* --- Build SVG --- */
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" id="cm-svg" class="conn-map-svg">';
    s += '<defs>';
    s += '<filter id="glow2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>';
    s += '<filter id="glow3" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>';
    /* Edge soft glow */
    s += '<filter id="edgeGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>';
    /* Radial gradient for the constellation center */
    s += '<radialGradient id="cmBg" cx="50%" cy="48%" r="70%">'
      + '<stop offset="0%" stop-color="#3d4372" stop-opacity="0.55"/>'
      + '<stop offset="55%" stop-color="#272a4e" stop-opacity="0.75"/>'
      + '<stop offset="100%" stop-color="#1a1d38" stop-opacity="0.95"/>'
      + '</radialGradient>';
    /* Selected-node pulsing ring animation */
    s += '<style>'
      + '.cm-sel-ring{animation:cmSelPulse 2s ease-in-out infinite}'
      + '@keyframes cmSelPulse{0%,100%{opacity:.9;transform:scale(1);transform-origin:center}50%{opacity:.55;transform:scale(1.06);transform-origin:center}}'
      + '.cm-edge{filter:url(#edgeGlow)}'
      + '</style>';
    s += '</defs>';
    /* Background rect uses radial gradient for subtle center warmth */
    s += '<rect width="' + W + '" height="' + H + '" fill="url(#cmBg)"/>';
    /* Soft ecliptic grid rings — very faint, gives sense of orbit */
    const gCX = W/2, gCY = H/2;
    [0.28, 0.48, 0.68].forEach(f => {
      const rr = Math.min(gCX, gCY) * f;
      s += '<circle cx="' + gCX + '" cy="' + gCY + '" r="' + rr + '" fill="none" stroke="rgba(170,190,240,0.06)" stroke-width="1" stroke-dasharray="2,5"/>';
    });
    /* Open the pan/zoom group */
    s += '<g id="cm-g">';

    // Universe halos — softer, larger, subtle warmth per universe
    S.universes.forEach(u => {
      allChars.forEach(ch => {
        if (!S.events.some(ev => ev.universeId === u.id && (ev.characterIds||[]).includes(ch.id))) return;
        const p = pos[ch.id]; if (!p) return;
        s += '<circle cx="' + p.x + '" cy="' + p.y + '" r="52" fill="' + u.color + '" opacity="0.08"/>';
      });
    });

    // Universe cluster labels
    S.universes.forEach(u => {
      const members = allChars.filter(ch => S.events.some(ev => ev.universeId === u.id && (ev.characterIds||[]).includes(ch.id)));
      if (members.length === 0) return;
      const avgX = members.reduce((a, ch) => a + (pos[ch.id]?pos[ch.id].x:0), 0) / members.length;
      const avgY = members.reduce((a, ch) => a + (pos[ch.id]?pos[ch.id].y:0), 0) / members.length;
      s += '<text x="' + avgX + '" y="' + (avgY - 62) + '" text-anchor="middle" font-size="9.5" fill="' + u.color + '" opacity="0.78" font-family="-apple-system,sans-serif" font-weight="700" letter-spacing="0.8" style="pointer-events:none;text-transform:uppercase">' + esc(u.name) + '</text>';
    });

    // Edges — glowing cosmic threads
    edges.forEach(e => {
      const pa = pos[e.a], pb = pos[e.b]; if (!pa || !pb) return;
      const mx2 = (pa.x + pb.x) / 2, my2 = (pa.y + pb.y) / 2 - 28;
      if (e.type === 'counterpart') {
        s += '<path d="M' + pa.x + ',' + pa.y + ' Q' + mx2 + ',' + my2 + ' ' + pb.x + ',' + pb.y + '"'
          + ' stroke="#a495e6" stroke-width="1.6" stroke-dasharray="5,4" fill="none" opacity="0.7"'
          + ' stroke-linecap="round"'
          + ' class="cm-edge" data-type="counterpart" data-a="' + e.a + '" data-b="' + e.b + '" style="cursor:pointer"/>';
      } else {
        const thick = Math.min(1.4 + e.sharedEvs.length * 0.85, 6);
        s += '<path d="M' + pa.x + ',' + pa.y + ' Q' + mx2 + ',' + my2 + ' ' + pb.x + ',' + pb.y + '"'
          + ' stroke="#6fd3c8" stroke-width="' + thick + '" fill="none" opacity="0.48"'
          + ' stroke-linecap="round"'
          + ' class="cm-edge" data-type="shared" data-a="' + e.a + '" data-b="' + e.b
          + '" data-cnt="' + e.sharedEvs.length + '" data-evids="' + e.sharedEvs.join(',') + '" style="cursor:pointer"/>';
      }
    });

    // Nodes
    allChars.forEach(ch => {
      const p = pos[ch.id]; if (!p) return;
      const col = ch.color || charHashColor(ch.id);
      const evCnt = S.events.filter(ev => (ev.characterIds||[]).includes(ch.id)).length;
      const nr = 20 + Math.min(evCnt * 1.8, 15);
      const initials = ch.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
      const isFiltered = _charFilterIds.includes(ch.id);
      /* Outer soft halo — constant for every node, gives "artifact" feel */
      s += '<circle cx="' + p.x + '" cy="' + p.y + '" r="' + (nr + 6) + '" fill="' + col + '" opacity="0.18" style="pointer-events:none"/>';
      if (isFiltered) {
        /* Pulsing selected ring */
        s += '<circle cx="' + p.x + '" cy="' + p.y + '" r="' + (nr + 11) + '" fill="none" stroke="#ffd27a" stroke-width="2.5" stroke-dasharray="5,3" opacity="0.92" class="cm-sel-ring" style="pointer-events:none;transform-origin:' + p.x + 'px ' + p.y + 'px"/>';
      }
      /* Main node disc */
      s += '<circle cx="' + p.x + '" cy="' + p.y + '" r="' + nr + '" fill="' + col + 'dd" stroke="rgba(255,255,255,0.72)" stroke-width="1.6"'
        + ' class="cm-node" data-cid="' + ch.id + '" style="cursor:pointer">'
        + '<title>' + esc(ch.name) + (evCnt ? ' \u2014 ' + evCnt + ' event' + (evCnt !== 1 ? 's' : '') : '') + '</title></circle>';
      if (ch.photo) {
        s += '<defs><clipPath id="ccp-' + ch.id + '"><circle cx="' + p.x + '" cy="' + p.y + '" r="' + (nr - 1.5) + '"/></clipPath></defs>';
        s += '<image href="' + ch.photo + '" x="' + (p.x-nr) + '" y="' + (p.y-nr) + '" width="' + (nr*2) + '" height="' + (nr*2) + '"'
          + ' clip-path="url(#ccp-' + ch.id + ')" preserveAspectRatio="xMidYMid slice"'
          + ' class="cm-node" data-cid="' + ch.id + '" style="cursor:pointer"/>';
      } else {
        s += '<text x="' + p.x + '" y="' + (p.y+5) + '" text-anchor="middle" font-size="13" font-weight="700" fill="white"'
          + ' font-family="-apple-system,sans-serif" letter-spacing="0.5" style="pointer-events:none;text-shadow:0 1px 2px rgba(0,0,0,0.4)">' + initials + '</text>';
      }
      // Name label — readable against dusk bg
      s += '<text x="' + p.x + '" y="' + (p.y+nr+15) + '" text-anchor="middle" font-size="10.5" fill="#dde4f5"'
        + ' font-family="-apple-system,sans-serif" font-weight="600" class="cm-label" data-cid="' + ch.id + '" style="pointer-events:none;paint-order:stroke;stroke:rgba(20,22,44,0.75);stroke-width:2.5px;stroke-linejoin:round">'
        + (ch.name.length > 15 ? ch.name.slice(0,14) + '\u2026' : ch.name) + '</text>';
      // Universe dots
      const uniIds = [...new Set(S.events.filter(ev => (ev.characterIds||[]).includes(ch.id)).map(ev => ev.universeId))];
      const dotSp = 9, totalDots = Math.min(uniIds.length, 5);
      const dotStartX = p.x - ((totalDots - 1) * dotSp) / 2;
      uniIds.slice(0, 5).forEach((uid, di) => {
        const uu = S.universes.find(u => u.id === uid); if (!uu) return;
        s += '<circle cx="' + (dotStartX + di * dotSp) + '" cy="' + (p.y+nr+26) + '" r="3.5" fill="' + uu.color + '" opacity="0.92" stroke="rgba(255,255,255,0.35)" stroke-width="0.6"><title>' + esc(uu.name) + '</title></circle>';
      });
    });

    /* Close pan/zoom group */
    s += '</g>';
    s += '</svg>';

    // Universe filter buttons
    const uniBtns = [
      '<button class="btn sm ' + (!this._uniFilter ? 'accent' : 'light') + '" onclick="ConnectionMap._uniFilter=null;ConnectionMap._rebuild()" style="font-size:10px;padding:3px 9px">All</button>'
    ].concat(S.universes.map(u => {
      const active = this._uniFilter === u.id;
      return '<button class="btn sm ' + (active ? 'accent' : 'light') + '" onclick="ConnectionMap._uniFilter=\'' + u.id + '\';ConnectionMap._rebuild()"'
        + ' style="font-size:10px;padding:3px 9px;' + (active ? 'background:' + u.color + ';border-color:' + u.color : 'border-left:3px solid ' + u.color) + '">' + esc(u.name) + '</button>';
    })).join('');

    container.innerHTML =
      /* Controls bar */
      '<div class="cm-controls-bar">'
      + '<span style="font-size:10px;color:#6070a0;font-weight:700;flex-shrink:0">UNIVERSE:</span>'
      + '<div class="cm-uni-filter">' + uniBtns + '</div>'
      + '<div class="cm-sep"></div>'
      + '<input class="map-search" id="cm-search" placeholder="\uD83D\uDD0D Search\u2026" oninput="ConnectionMap._search(this.value)" style="width:130px">'
      + '<div class="cm-sep"></div>'
      + '<button class="mz-btn" onclick="ConnectionMap._zoom(1.2)" title="Zoom In">+</button>'
      + '<span id="cm-pct">100%</span>'
      + '<button class="mz-btn" onclick="ConnectionMap._zoom(0.83)" title="Zoom Out">\u2212</button>'
      + '<button class="mz-btn" onclick="ConnectionMap._fitAll()" title="Fit All" style="font-size:13px">\u26F6</button>'
      + '<button class="mz-btn" onclick="ConnectionMap._resetView()" title="Reset Map" style="font-size:13px">\u2302</button>'
      + '<button class="mz-btn" id="cm-legend-btn" onclick="ConnectionMap._toggleLegend()" title="Legend" style="font-size:13px">\u24C1</button>'
      + '<span class="cm-hint">Drag to pan \u00B7 Scroll to zoom \u00B7 Click node = profile \u00B7 Click teal line = shared scenes</span>'
      + '</div>'
      /* Map area — fills remaining height */
      + '<div class="conn-map-wrap" id="cm-wrap">'
      + s
      + '<div class="map-tip" id="map-tip"></div>'
      /* Floating legend panel */
      + '<div class="cm-legend-panel" id="cm-legend-panel">'
      + '<h4>\uD83D\uDDFA Legend</h4>'
      + '<div class="cml-item"><span class="cml-line" style="background:#40e0c0"></span> Shared appearance<br><span style="font-size:10px;color:#5060a0;margin-left:31px">Thicker = more shared scenes</span></div>'
      + '<div class="cml-item"><span class="cml-dash"></span> Counterpart / alt-universe link</div>'
      + '<div class="cml-item"><span style="display:inline-block;width:24px;height:24px;border-radius:50%;background:#4a8fde44;border:2px solid #4a8fde;font-size:10px;text-align:center;line-height:22px;flex-shrink:0">\u25CF</span> Node size = event count</div>'
      + '<div class="cml-item"><span style="display:inline-block;width:24px;height:24px;border-radius:50%;border:2.5px dashed #ffd700;flex-shrink:0"></span> Pinned to filter</div>'
      + '<div class="cml-item">\uD83C\uDF10 Colored dots = universes</div>'
      + '<div style="margin-top:8px;padding-top:8px;border-top:1px solid #2a3060;font-size:10px;color:#4050a0">Click a teal edge for shared scene list</div>'
      + '</div>'
      + '</div>';

    setTimeout(() => this._attachInteractions(), 60);
  },

  _zoom(f) {
    this._mscale = Math.max(0.2, Math.min(5, this._mscale * f));
    this._updateTransform();
  },

  _fitAll() {
    const wrap = document.getElementById('cm-wrap');
    if (!wrap) return;
    const pts = Object.values(this._pos);
    if (pts.length === 0) { this._resetView(); return; }
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const minX = Math.min(...xs) - 50, maxX = Math.max(...xs) + 50;
    const minY = Math.min(...ys) - 50, maxY = Math.max(...ys) + 50;
    const fw = wrap.clientWidth, fh = wrap.clientHeight;
    const scaleX = fw / (maxX - minX), scaleY = fh / (maxY - minY);
    this._mscale = Math.min(scaleX, scaleY, 2);
    this._mx = (fw - (minX + maxX) * this._mscale) / 2;
    this._my = (fh - (minY + maxY) * this._mscale) / 2;
    this._updateTransform();
  },

  _resetView() {
    this._mx = 0; this._my = 0; this._mscale = 1;
    this._updateTransform();
    const inp = document.getElementById('cm-search');
    if (inp) { inp.value = ''; this._search(''); }
  },

  _toggleLegend() {
    const panel = document.getElementById('cm-legend-panel');
    const btn = document.getElementById('cm-legend-btn');
    if (!panel) return;
    panel.classList.toggle('visible');
    if (btn) btn.style.background = panel.classList.contains('visible') ? '#3040a0' : '';
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
      const ch = S.characters.find(c => c.id === cid);
      const match = !q || (ch && (ch.name.toLowerCase().includes(q) || (ch.aliases||'').toLowerCase().includes(q)));
      el.style.opacity = match ? '' : '0.08';
      if (match && q && !firstMatch && this._pos[cid]) firstMatch = this._pos[cid];
    });
    wrap.querySelectorAll('.cm-label').forEach(el => {
      const cid = el.dataset.cid; if (!cid) return;
      const ch = S.characters.find(c => c.id === cid);
      const match = !q || (ch && (ch.name.toLowerCase().includes(q) || (ch.aliases||'').toLowerCase().includes(q)));
      el.style.opacity = match ? '' : '0.08';
    });
    /* Center on first match with smooth animation */
    if (firstMatch && wrap) {
      const fw = wrap.clientWidth, fh = wrap.clientHeight;
      this._mx = fw / 2 - firstMatch.x * this._mscale;
      this._my = fh / 2 - firstMatch.y * this._mscale;
      const g = document.getElementById('cm-g');
      if (g) {
        g.style.transition = 'transform 0.4s ease';
        this._updateTransform();
        setTimeout(() => { if (g) g.style.transition = ''; }, 450);
      }
    }
  },

  _attachInteractions() {
    const wrap = document.getElementById('cm-wrap');
    const tip  = document.getElementById('map-tip');
    if (!wrap || !tip) return;

    /* --- Pan / Zoom --- */
    let drag = { on: false, sx: 0, sy: 0, ox: 0, oy: 0 };

    wrap.onmousedown = (e) => {
      if (e.target.classList.contains('cm-node') || e.target.classList.contains('cm-edge')) return;
      drag.on = true; drag.sx = e.clientX; drag.sy = e.clientY;
      drag.ox = this._mx; drag.oy = this._my;
      wrap.classList.add('cm-dragging');
      e.preventDefault();
    };

    if (!this._listenersAttached) {
      window.addEventListener('mousemove', (e) => {
        if (!drag.on) return;
        this._mx = drag.ox + e.clientX - drag.sx;
        this._my = drag.oy + e.clientY - drag.sy;
        this._updateTransform();
      });
      window.addEventListener('mouseup', () => {
        drag.on = false;
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
            edge.dataset.origOp = edge.getAttribute('opacity') || '0.48';
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
        const ch = cid ? S.characters.find(c => c.id === cid) : null;
        if (!ch) { tip.style.display = 'none'; return; }
        const evs = S.events.filter(ev => (ev.characterIds||[]).includes(ch.id));
        const unis = [...new Set(evs.map(ev => { const uu = S.universes.find(u => u.id === ev.universeId); return uu ? uu.name : null; }).filter(Boolean))];
        tip.innerHTML = '<strong>' + esc(ch.name) + '</strong>'
          + (ch.aliases ? '<br><em style="color:#a0b0d0">' + esc(ch.aliases) + '</em>' : '')
          + (ch.species ? '<br>\uD83E\uDDEC ' + esc(ch.species) : '')
          + (ch.status  ? '<br><span style="color:' + ({'Alive':'#2ecc71','Deceased':'#e74c3c'}[ch.status]||'#95a5a6') + '">\u25CF</span> ' + esc(ch.status) : '')
          + '<br>\uD83D\uDCC5 ' + evs.length + ' event' + (evs.length !== 1 ? 's' : '')
          + (unis.length ? '<br>\uD83C\uDF0D ' + esc(unis.join(', ')) : '')
          + (ch.powers ? '<br>\u26A1 ' + esc(ch.powers.split('\n')[0].slice(0, 65)) + (ch.powers.length > 65 ? '\u2026' : '') : '')
          + '<br><span style="font-size:10px;color:#6070a0;margin-top:4px;display:block">Click to open full profile</span>';
        _showMapTip(tip, e, wrap);
      });
    });

    /* --- Edge: click to open shared-scene panel --- */
    wrap.querySelectorAll('.cm-edge').forEach(el => {
      el.addEventListener('click', e => {
        if (el.dataset.type !== 'shared') return;
        const ca = S.characters.find(c => c.id === el.dataset.a);
        const cb = S.characters.find(c => c.id === el.dataset.b);
        if (!ca || !cb) return;
        const evIds = (el.dataset.evids || '').split(',').filter(Boolean);
        const evs = evIds.map(id => S.events.find(ev => ev.id === id)).filter(Boolean);
        let panel = document.getElementById('cm-edge-panel');
        if (!panel) {
          panel = document.createElement('div');
          panel.id = 'cm-edge-panel';
          panel.style.cssText = 'position:absolute;background:#fff;border:1.5px solid #c8d4f0;border-radius:11px;padding:14px 16px;font-size:13px;z-index:30;max-width:295px;box-shadow:0 8px 30px rgba(0,0,0,.22);max-height:320px;overflow-y:auto;';
          document.getElementById('cm-wrap').appendChild(panel);
        }
        const rect = wrap.getBoundingClientRect();
        let lx = e.clientX - rect.left + 14, ly = e.clientY - rect.top + 14;
        if (lx + 300 > rect.width)  lx = e.clientX - rect.left - 305;
        if (ly + 330 > rect.height) ly = e.clientY - rect.top - 200;
        panel.style.left = lx + 'px'; panel.style.top = ly + 'px';
        panel.innerHTML =
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:9px">'
          + '<strong style="font-size:14px;color:#1a1a2e">\uD83C\uDFAD Shared Scenes</strong>'
          + '<button onclick="document.getElementById(\'cm-edge-panel\').style.display=\'none\'" style="background:none;border:none;cursor:pointer;font-size:20px;color:#aaa;line-height:1;padding:0 0 0 10px">&times;</button>'
          + '</div>'
          + '<div style="font-size:12px;color:#6080a0;margin-bottom:10px;font-style:italic">' + esc(ca.name) + ' &amp; ' + esc(cb.name) + '</div>'
          + evs.map(ev => {
              const uu = getU(ev.universeId);
              return '<div class="shared-ev-item" onclick="MS.push({t:\'evDetail\',evId:\'' + ev.id + '\'});M.render()"'
                + ' style="cursor:pointer;padding:7px 4px;border-bottom:1px solid #f0f4fc">'
                + '<div class="shared-ev-dot" style="background:' + (uu?uu.color:'#ccc') + '"></div>'
                + '<div><div style="font-size:12px;font-weight:600;color:#1a1a2e">' + esc(ev.title) + '</div>'
                + '<div style="font-size:10px;color:#7080a0">' + esc(ev.date||'?') + (uu ? ' \u2014 ' + esc(uu.name) : '') + '</div></div>'
                + '</div>';
            }).join('');
        panel.style.display = 'block';
        e.stopPropagation();
      });

      el.addEventListener('mousemove', e => {
        const type = el.dataset.type;
        const ca = S.characters.find(c => c.id === el.dataset.a);
        const cb = S.characters.find(c => c.id === el.dataset.b);
        if (!ca || !cb) return;
        if (type === 'counterpart') {
          tip.innerHTML = '<strong>Counterparts</strong><br>' + esc(ca.name) + ' \u2194 ' + esc(cb.name)
            + '<br><span style="font-size:10px;color:#a0a8c0">Same character, different universe</span>';
        } else {
          const cnt = parseInt(el.dataset.cnt) || 0;
          const evIds = (el.dataset.evids || '').split(',').filter(Boolean);
          const evTitles = evIds.slice(0, 4).map(eid => { const ev = S.events.find(ev => ev.id === eid); return ev ? '\u2022 ' + esc(ev.title) : null; }).filter(Boolean).join('<br>');
          tip.innerHTML = '<strong>' + cnt + ' Shared Scene' + (cnt !== 1 ? 's' : '') + '</strong><br>'
            + esc(ca.name) + ' &amp; ' + esc(cb.name) + '<br>' + evTitles
            + (evIds.length > 4 ? '<br>\u2026 +' + (evIds.length - 4) + ' more' : '')
            + '<br><span style="font-size:10px;color:#6070a0">\uD83D\uDC49 Click to see all events</span>';
        }
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
    const c = this._container || document.getElementById('map-view');
    if (c) this.build(c);
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
  const others = S.characters.filter(c => c.id !== charId);
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
        const u = S.universes.find(u => u.id === ev.universeId);
        return '<div class="shared-ev-item" onclick="_openEv(\'' + ev.id + '\')">'
          + '<div class="shared-ev-dot" style="background:' + (u ? u.color : '#ccc') + '"></div>'
          + '<div><div style="font-size:12px;font-weight:600;color:#1a1a2e">' + esc(ev.title) + '</div>'
          + '<div style="font-size:10px;color:#7080a0">'
          + esc(ev.date || '?') + (u ? ' &mdash; ' + esc(u.name) : '') + '</div></div></div>';
      }).join('')
      + '</div>';
  }).filter(Boolean).join('');
  if (!hasAny) return '<div style="font-size:12px;color:#bbb;padding:6px 0">No shared scenes yet. Link characters to events to discover crossovers.</div>';
  return rows;
}

function _openEv(evId) {
  M.close();
  setTimeout(() => { M.openEvDetail(evId); }, 80);
}


/* helpTab — legacy shim (kept for backward compatibility) */
function helpTab(n) {
  const list = document.querySelectorAll('[data-obs-toc-item]');
  if (list[n]) list[n].click();
}

/* =====================================================
   OBSERVATORY MANUAL — premium searchable help
   ===================================================== */
const OBS_HELP_SECTIONS = [
  { id:'welcome',        label:'Welcome',                 coord:'α-00', kw:'overview introduction about begin' },
  { id:'getting-started',label:'Getting Started',         coord:'α-01', kw:'first steps begin new user' },
  { id:'saved-locally',  label:'What Is Saved Locally',   coord:'α-02', kw:'storage browser localstorage data privacy risk' },
  { id:'creating-events',label:'Creating Events',         coord:'β-01', kw:'add event moment title date description' },
  { id:'timeline-nav',   label:'Timeline Navigation',     coord:'β-02', kw:'move scroll jump today reset view' },
  { id:'pan-zoom',       label:'Pan and Zoom',            coord:'β-03', kw:'zoom in out drag pinch wheel scale' },
  { id:'tracks',         label:'Tracks / Universes',      coord:'γ-01', kw:'rows worlds stories containers' },
  { id:'people',         label:'People / Characters',     coord:'γ-02', kw:'characters cast dossier profile portrait' },
  { id:'categories',     label:'Categories',              coord:'γ-03', kw:'types tags classification battle discovery' },
  { id:'search-filters', label:'Search and Filters',      coord:'γ-04', kw:'find filter chip universe status tone tag' },
  { id:'relationships',  label:'Relationships / Connections', coord:'δ-01', kw:'links bonds causes reveals arrows map' },
  { id:'story-mode',     label:'Story Mode',              coord:'δ-02', kw:'story arc line narrative follow chain' },
  { id:'importing',      label:'Importing',               coord:'ε-01', kw:'load json file bring back restore open' },
  { id:'backups',        label:'Creating Backups',        coord:'ε-02', kw:'export save json html copy file download' },
  { id:'restore',        label:'Restoring From Backup',   coord:'ε-03', kw:'import load replace overwrite rescue' },
  { id:'shortcuts',      label:'Keyboard Shortcuts',      coord:'ζ-01', kw:'keys hotkeys arrow escape plus minus' },
  { id:'mobile',         label:'Mobile Use',              coord:'ζ-02', kw:'phone tablet touch pinch tap drawer' },
  { id:'troubleshoot',   label:'Troubleshooting',         coord:'η-01', kw:'problems bug fix missing lost broken' },
  { id:'faq',            label:'Frequently Asked',        coord:'θ-01', kw:'faq question answer common' },
  { id:'privacy',        label:'Privacy & Data',          coord:'θ-02', kw:'privacy offline account cookies tracking' },
  { id:'credits',        label:'About & Credits',         coord:'θ-03', kw:'credits about version copyright thanks' }
];

let _obsHelpPrevFocus = null;
let _obsHelpActiveId = 'welcome';

function obsHelpMarkup() {
  const toc = OBS_HELP_SECTIONS.map((s, i) => {
    const active = i === 0 ? ' is-active' : '';
    return `<button type="button" class="obs-toc-item${active}" data-obs-toc-item data-obs-target="${s.id}" aria-label="${s.label}" role="option" aria-selected="${i===0}">
      <span class="obs-toc-coord">${s.coord}</span>
      <span class="obs-toc-label">${s.label}</span>
    </button>`;
  }).join('');

  return `
<style id="obs-help-style">
  #modal-bg.open .modal:has(.obs-help){ width: min(1040px, 96vw) !important; max-width:1040px; }
  .obs-help{ font-family: ui-sans-serif, -apple-system, "Inter", "Segoe UI", system-ui, sans-serif;
    color:#d6deee; font-size:15px; line-height:1.7; letter-spacing:0.005em;
    position:relative; margin:-20px; padding:0;
    background:
      radial-gradient(1200px 600px at 85% -10%, rgba(116,120,255,0.14), transparent 55%),
      radial-gradient(900px 500px at 10% 110%, rgba(0,210,255,0.10), transparent 60%),
      radial-gradient(600px 360px at 55% 50%, rgba(180,90,255,0.07), transparent 70%),
      linear-gradient(180deg, rgba(8,10,24,0.55), rgba(6,8,20,0.72));
  }
  .obs-help::before{ content:""; position:absolute; inset:0; pointer-events:none;
    background-image:
      radial-gradient(1px 1px at 12% 18%, rgba(255,255,255,0.55), transparent 60%),
      radial-gradient(1px 1px at 78% 42%, rgba(255,255,255,0.35), transparent 60%),
      radial-gradient(1px 1px at 34% 76%, rgba(255,255,255,0.45), transparent 60%),
      radial-gradient(1px 1px at 63% 88%, rgba(255,255,255,0.30), transparent 60%),
      radial-gradient(1.5px 1.5px at 90% 10%, rgba(180,220,255,0.6), transparent 60%),
      radial-gradient(1px 1px at 5% 55%, rgba(255,255,255,0.35), transparent 60%);
    opacity:0.7; mix-blend-mode:screen;
  }
  .obs-help-hero{ position:relative; padding:22px 26px 18px; border-bottom:1px solid rgba(120,180,255,0.12);
    background: linear-gradient(180deg, rgba(14,18,42,0.55), rgba(10,12,28,0.1)); }
  .obs-hero-eyebrow{ font-family: "JetBrains Mono", "SF Mono", ui-monospace, Menlo, Consolas, monospace;
    font-size:10.5px; letter-spacing:0.22em; text-transform:uppercase; color:#7a9ccd; margin-bottom:6px;
    display:flex; align-items:center; gap:10px; }
  .obs-hero-eyebrow::before{ content:""; width:22px; height:1px; background:linear-gradient(90deg, transparent, #7a9ccd); }
  .obs-hero-title{ font-family: "Fraunces", "Cormorant Garamond", "Playfair Display", Georgia, serif;
    font-weight:500; font-size:28px; line-height:1.15; color:#eaf0ff; letter-spacing:-0.01em;
    margin:0 0 6px; }
  .obs-hero-title em{ font-style:italic; color:#9fc0ff; font-weight:400; }
  .obs-hero-sub{ font-size:13.5px; color:#9aa8c4; max-width:64ch; }
  .obs-search-wrap{ position:relative; margin-top:16px; }
  .obs-search{ width:100%; background:rgba(10,14,32,0.7); border:1px solid rgba(120,180,255,0.18);
    border-radius:999px; padding:13px 46px 13px 46px; color:#e6edff; font-size:15px;
    font-family:inherit; outline:none; transition: border-color .15s, box-shadow .15s, background .15s; }
  .obs-search:focus{ border-color:rgba(120,200,255,0.55); box-shadow:0 0 0 4px rgba(88,160,255,0.14);
    background:rgba(14,20,44,0.85); }
  .obs-search::placeholder{ color:#6a7a9a; }
  .obs-search-ico{ position:absolute; left:16px; top:50%; transform:translateY(-50%); color:#7a9ccd;
    font-size:16px; pointer-events:none; }
  .obs-search-hint{ position:absolute; right:12px; top:50%; transform:translateY(-50%);
    font-family: "JetBrains Mono", ui-monospace, monospace; font-size:10.5px; letter-spacing:0.14em;
    color:#5b6c8e; border:1px solid rgba(120,180,255,0.14); padding:3px 8px; border-radius:6px;
    background:rgba(10,14,32,0.6); }
  .obs-search-hint.hidden{ display:none; }

  .obs-help-shell{ display:grid; grid-template-columns: 260px 1fr; gap:0;
    min-height:420px; max-height:70vh; }
  .obs-toc{ border-right:1px solid rgba(120,180,255,0.1);
    padding:16px 10px; overflow-y:auto; background:rgba(8,10,22,0.35); }
  .obs-toc-head{ font-family:"JetBrains Mono", ui-monospace, monospace;
    font-size:10px; letter-spacing:0.24em; text-transform:uppercase; color:#5a6e92;
    padding:6px 12px 10px; display:flex; align-items:center; gap:8px; }
  .obs-toc-head::after{ content:""; flex:1; height:1px; background:linear-gradient(90deg, rgba(120,180,255,0.2), transparent); }
  .obs-toc-item{ display:flex; align-items:center; gap:10px; width:100%;
    background:transparent; border:1px solid transparent; color:#aab6d0;
    padding:9px 12px; border-radius:8px; text-align:left; font-size:13.5px;
    font-family:inherit; cursor:pointer; transition: all .14s ease;
    margin-bottom:2px; }
  .obs-toc-item:hover{ background:rgba(90,140,220,0.08); color:#dbe6ff; }
  .obs-toc-item:focus-visible{ outline:none; border-color:rgba(120,200,255,0.55);
    box-shadow:0 0 0 3px rgba(88,160,255,0.16); }
  .obs-toc-item.is-active{ background:linear-gradient(90deg, rgba(90,160,255,0.18), rgba(90,160,255,0.03));
    color:#eaf1ff; border-color:rgba(120,200,255,0.25);
    box-shadow: inset 2px 0 0 #7fb4ff; }
  .obs-toc-item.is-hidden{ display:none; }
  .obs-toc-coord{ font-family:"JetBrains Mono", ui-monospace, monospace;
    font-size:10px; color:#6b7fa6; letter-spacing:0.1em; min-width:34px; }
  .obs-toc-item.is-active .obs-toc-coord{ color:#9ec4ff; }
  .obs-toc-label{ flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .obs-toc-empty{ padding:16px 14px; font-size:12.5px; color:#6e7c98; font-style:italic; }

  .obs-main{ padding:22px 28px 28px; overflow-y:auto; position:relative; }
  .obs-section{ display:none; max-width:68ch; animation:obsFadeIn .24s ease; }
  .obs-section.is-active{ display:block; }
  .obs-section.is-hidden{ display:none !important; }
  @keyframes obsFadeIn{ from{opacity:0; transform:translateY(6px);} to{opacity:1; transform:none;} }

  .obs-sec-meta{ display:flex; align-items:baseline; gap:14px; margin-bottom:6px;
    font-family:"JetBrains Mono", ui-monospace, monospace; font-size:10.5px;
    letter-spacing:0.2em; text-transform:uppercase; color:#6c84b0; }
  .obs-sec-meta::after{ content:""; flex:1; height:1px;
    background:linear-gradient(90deg, rgba(120,180,255,0.28), transparent); }
  .obs-sec-title{ font-family:"Fraunces","Cormorant Garamond",Georgia,serif;
    font-weight:500; font-size:26px; line-height:1.2; color:#eaf0ff;
    letter-spacing:-0.008em; margin:0 0 14px; }
  .obs-sec-lede{ font-size:15.5px; color:#bac7e2; margin-bottom:16px; max-width:64ch; }
  .obs-p{ margin:0 0 12px; color:#c2cde2; max-width:64ch; }
  .obs-p strong{ color:#ecf1ff; font-weight:600; }
  .obs-p em{ color:#a6c3ea; font-style:italic; }

  .obs-callout{ position:relative; margin:14px 0; padding:14px 16px 14px 18px;
    border-radius:10px; border:1px solid rgba(120,180,255,0.16);
    background:rgba(18,22,44,0.55); backdrop-filter: blur(6px);
    font-size:14px; color:#c4cfe6; }
  .obs-callout::before{ content:""; position:absolute; left:0; top:10px; bottom:10px; width:2px;
    background:linear-gradient(180deg, #7fb4ff, rgba(127,180,255,0)); border-radius:2px; }
  .obs-callout .obs-callout-tag{ display:inline-block; font-family:"JetBrains Mono",ui-monospace,monospace;
    font-size:10px; letter-spacing:0.18em; text-transform:uppercase;
    color:#7fb4ff; margin-bottom:6px; }
  .obs-callout.warn{ border-color:rgba(255,180,110,0.28); background:rgba(44,28,14,0.45); }
  .obs-callout.warn::before{ background:linear-gradient(180deg,#ffb770,rgba(255,183,112,0)); }
  .obs-callout.warn .obs-callout-tag{ color:#ffb770; }
  .obs-callout.danger{ border-color:rgba(255,120,120,0.3); background:rgba(50,18,22,0.5); }
  .obs-callout.danger::before{ background:linear-gradient(180deg,#ff8c8c,rgba(255,140,140,0)); }
  .obs-callout.danger .obs-callout-tag{ color:#ff8c8c; }
  .obs-callout.tip{ border-color:rgba(140,230,200,0.25); background:rgba(14,38,34,0.45); }
  .obs-callout.tip::before{ background:linear-gradient(180deg,#8ce6c8,rgba(140,230,200,0)); }
  .obs-callout.tip .obs-callout-tag{ color:#8ce6c8; }

  .obs-steps{ counter-reset: step; margin:8px 0 16px; padding:0; list-style:none; }
  .obs-steps li{ position:relative; padding:10px 0 10px 46px; border-top:1px dashed rgba(120,180,255,0.12); }
  .obs-steps li:first-child{ border-top:none; }
  .obs-steps li::before{ counter-increment: step; content: counter(step, decimal-leading-zero);
    position:absolute; left:0; top:12px; width:30px; height:30px; border-radius:50%;
    display:flex; align-items:center; justify-content:center;
    font-family:"JetBrains Mono", ui-monospace, monospace; font-size:11px; color:#bfd4ff;
    background:radial-gradient(circle at 30% 30%, rgba(90,140,220,0.35), rgba(18,22,44,0.9));
    border:1px solid rgba(120,180,255,0.28); }
  .obs-steps b{ display:block; color:#eaf0ff; font-weight:600; font-size:14.5px; margin-bottom:2px; }
  .obs-steps span{ color:#b4c0d9; font-size:14px; }

  .obs-kbd-grid{ display:grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap:8px;
    margin:8px 0 18px; }
  .obs-kbd-row{ display:flex; align-items:center; gap:12px; padding:9px 12px;
    border:1px solid rgba(120,180,255,0.12); border-radius:8px;
    background:rgba(12,16,34,0.5); }
  .obs-kbd-keys{ display:flex; gap:4px; flex-shrink:0; }
  .obs-key{ font-family:"JetBrains Mono",ui-monospace,monospace; font-size:11.5px;
    color:#dbe6ff; background:linear-gradient(180deg, rgba(40,48,80,0.9), rgba(20,24,44,0.95));
    border:1px solid rgba(140,180,230,0.3); border-radius:5px;
    padding:3px 7px; min-width:22px; text-align:center;
    box-shadow: 0 1px 0 rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06); }
  .obs-kbd-desc{ font-size:13.5px; color:#b7c4dd; }

  .obs-faq{ margin:4px 0 14px; }
  .obs-faq details{ border:1px solid rgba(120,180,255,0.14); border-radius:8px;
    padding:0; margin-bottom:8px; background:rgba(12,16,34,0.4); overflow:hidden; }
  .obs-faq summary{ cursor:pointer; padding:12px 14px; font-weight:500; color:#dbe6ff;
    font-size:14.5px; list-style:none; position:relative; padding-right:30px;
    transition:background .14s; }
  .obs-faq summary::-webkit-details-marker{ display:none; }
  .obs-faq summary:hover{ background:rgba(90,140,220,0.06); }
  .obs-faq summary::after{ content:"+"; position:absolute; right:16px; top:50%; transform:translateY(-50%);
    color:#7fb4ff; font-family:"JetBrains Mono",ui-monospace,monospace; transition:transform .18s; }
  .obs-faq details[open] summary::after{ content:"−"; }
  .obs-faq details > div{ padding:0 14px 12px; color:#b7c4dd; font-size:14px; line-height:1.7; }

  .obs-footer-note{ margin-top:28px; padding-top:16px; border-top:1px solid rgba(120,180,255,0.12);
    font-family:"JetBrains Mono", ui-monospace, monospace; font-size:10.5px;
    letter-spacing:0.18em; text-transform:uppercase; color:#5a6e92;
    display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; }

  .obs-highlight{ background:rgba(255,220,120,0.25); color:#fff6c9;
    border-radius:3px; padding:0 2px; box-shadow: 0 0 0 1px rgba(255,220,120,0.15); }

  .obs-noresults{ padding:40px 20px; text-align:center; color:#7f8eac; font-size:14px; }
  .obs-noresults strong{ display:block; color:#c5d0e9; font-size:16px; margin-bottom:6px; }

  .obs-toc-toggle{ display:none; }
  .tour-overlay {
    position: absolute;
    inset: 0;
    z-index: 7;
    pointer-events: none;
    opacity: 0;
    transition: opacity .22s ease;
  }
  .tour-overlay.active { opacity: 1; }
  .tour-wash {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(circle at 20% 18%, rgba(67,96,220,0.18), rgba(67,96,220,0) 30%),
      radial-gradient(circle at 82% 22%, rgba(0,212,255,0.16), rgba(0,212,255,0) 34%),
      linear-gradient(180deg, rgba(8,12,24,0.06), rgba(8,12,24,0.18));
  }
  .tour-spotlight {
    position: absolute;
    width: 154px;
    height: 154px;
    margin-left: -77px;
    margin-top: -77px;
    border-radius: 50%;
    border: 1.5px solid rgba(0,212,255,0.45);
    background: radial-gradient(circle, rgba(96,212,255,0.14) 0%, rgba(96,212,255,0.06) 36%, rgba(96,212,255,0) 74%);
    box-shadow: 0 0 0 12px rgba(70,108,255,0.08), 0 0 28px rgba(0,212,255,0.18);
    transition: transform .24s ease, left .24s ease, top .24s ease, opacity .24s ease;
  }
  .tour-card {
    position: absolute;
    top: 18px;
    left: 18px;
    width: min(380px, calc(100% - 36px));
    padding: 18px 18px 16px;
    border-radius: 20px;
    border: 1px solid rgba(92,122,220,0.42);
    background: linear-gradient(180deg, rgba(12,18,36,0.9) 0%, rgba(10,14,28,0.94) 100%);
    box-shadow: 0 18px 48px rgba(0,0,0,0.32);
    color: #d8e7ff;
    pointer-events: auto;
  }
  .tour-kicker {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 5px 10px;
    border-radius: 999px;
    background: rgba(0,212,255,0.12);
    color: #94e8ff;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .tour-title {
    margin: 12px 0 4px;
    font-size: 23px;
    line-height: 1.2;
    color: #f4f8ff;
  }
  .tour-meta {
    color: #88a5cf;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .tour-desc {
    margin-top: 12px;
    color: #c3d0eb;
    font-size: 14px;
    line-height: 1.72;
  }
  .tour-controls {
    position: absolute;
    left: 50%;
    bottom: 18px;
    transform: translateX(-50%);
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 18px;
    border: 1px solid rgba(92,122,220,0.38);
    background: rgba(10,16,30,0.92);
    box-shadow: 0 14px 40px rgba(0,0,0,0.28);
    pointer-events: auto;
  }
  .tour-btn {
    min-height: 40px;
    padding: 8px 14px;
    border: 1px solid rgba(0,212,255,0.22);
    border-radius: 12px;
    background: linear-gradient(180deg, rgba(15,27,48,0.96) 0%, rgba(11,18,33,0.98) 100%);
    color: #cbe9ff;
    font-size: 13px;
    font-family: inherit;
    font-weight: 700;
    cursor: pointer;
  }
  .tour-btn:hover,
  .tour-btn:focus-visible {
    border-color: rgba(0,212,255,0.56);
    box-shadow: 0 0 0 3px rgba(0,212,255,0.12);
  }
  .tour-btn.exit {
    border-color: rgba(255,130,130,0.32);
    color: #ffd2d2;
  }
  .tour-progress {
    min-width: 82px;
    text-align: center;
    color: #8eb1d6;
    font-size: 12px;
    font-weight: 800;
  }
  @media (prefers-reduced-motion: reduce) {
    .tour-overlay,
    .tour-spotlight { transition: none !important; }
  }

  /* Mobile */
  @media (max-width: 820px){
    #modal-bg.open .modal:has(.obs-help){ width:100% !important; max-width:100% !important; }
    .obs-help{ margin:-20px -20px -20px -20px; }
    .obs-help-shell{ grid-template-columns: 1fr; max-height:none; }
    .obs-toc{ border-right:none; border-bottom:1px solid rgba(120,180,255,0.12);
      max-height:0; overflow:hidden; padding:0 10px; transition:max-height .26s ease, padding .26s ease; }
    .obs-toc.is-open{ max-height:46vh; padding:12px 10px; overflow-y:auto; }
    .obs-toc-toggle{ display:flex; align-items:center; justify-content:space-between;
      width:100%; padding:12px 16px; background:rgba(12,16,34,0.6);
      border:none; border-top:1px solid rgba(120,180,255,0.1);
      color:#bbc9e5; font-family:inherit; font-size:13.5px; cursor:pointer;
      text-align:left; }
    .obs-toc-toggle .obs-chev{ transition:transform .2s; color:#7fb4ff; }
    .obs-toc-toggle.is-open .obs-chev{ transform:rotate(180deg); }
    .obs-main{ padding:18px 18px 24px; max-height:none; }
    .obs-hero-title{ font-size:22px; }
    .obs-sec-title{ font-size:21px; }
    .obs-search-hint{ display:none; }
    .tour-card {
      top: 12px;
      left: 12px;
      width: calc(100% - 24px);
      padding: 16px 14px 14px;
    }
    .tour-controls {
      left: 12px;
      right: 12px;
      bottom: 12px;
      transform: none;
      justify-content: center;
      flex-wrap: wrap;
    }
  }
</style>

<div class="obs-help" data-obs-help role="dialog" aria-label="Observatory Manual for Free Timeline Universe">

  <header class="obs-help-hero">
    <div class="obs-hero-eyebrow">Observatory Manual · Star Catalogue · v8</div>
    <h1 class="obs-hero-title">A guide to charting your universe — <em>every coordinate explained</em>.</h1>
    <p class="obs-hero-sub">A complete field manual for Free Timeline Universe: how to build worlds, connect stories, protect your work, and move confidently through time. Search any topic, or pick a heading from the catalogue.</p>
    <div class="obs-search-wrap">
      <span class="obs-search-ico" aria-hidden="true">⌕</span>
      <input type="search" class="obs-search" data-obs-search placeholder="Search the manual — try “backup”, “zoom”, “character”…" aria-label="Search the manual" autocomplete="off" spellcheck="false" />
      <span class="obs-search-hint" data-obs-search-hint>esc · close</span>
    </div>
  </header>

  <button type="button" class="obs-toc-toggle" data-obs-toc-toggle aria-expanded="false" aria-controls="obs-toc-list">
    <span>Star catalogue · <strong id="obs-current-label" style="color:#eaf0ff;font-weight:500">Welcome</strong></span>
    <span class="obs-chev">▾</span>
  </button>

  <div class="obs-help-shell">
    <aside class="obs-toc" id="obs-toc-list" role="listbox" aria-label="Manual sections">
      <div class="obs-toc-head">Star catalogue</div>
      ${toc}
      <div class="obs-toc-empty" data-obs-toc-empty style="display:none">No matching sections.</div>
    </aside>
    <main class="obs-main" data-obs-main tabindex="-1">
      ${obsHelpSectionsMarkup()}
      <div class="obs-noresults" data-obs-noresults style="display:none">
        <strong>No results in the catalogue.</strong>
        Try a simpler word, like <em>event</em>, <em>zoom</em>, or <em>backup</em>.
      </div>
      <div class="obs-footer-note">
        <span>End of transmission · Free Timeline Universe</span>
        <span>Press Esc to close · Focus returns to the Help button</span>
      </div>
    </main>
  </div>
</div>
`;
}

function obsHelpSectionsMarkup(){
  const S_ = {
    welcome: {
      coord:'α-00 · Prologue',
      title:'Welcome to your observatory',
      lede:'Free Timeline Universe is a private, offline chronicle for your imagination. You can build the history of a novel, a game, a film series, a family saga, or any world where things happen in order.',
      body:`
        <p class="obs-p">This manual is designed like a small observatory handbook. It explains every feature in plain language, with no technical words to memorize. Use the <strong>search bar above</strong> to jump to any topic, or browse the star catalogue on the left.</p>
        <div class="obs-callout tip"><span class="obs-callout-tag">How to use this guide</span>
          Each section is short. Read only what you need. You can come back any time from the ✦ Help button in the top bar.</div>
        <p class="obs-p"><strong>If you are brand new:</strong> start with <em>Getting Started</em>, then read <em>What Is Saved Locally</em>. Those two sections prepare you for everything else.</p>
        <p class="obs-p"><strong>If you have used it before:</strong> the search bar finds any section in under a second. Try searching <em>backup</em>, <em>story mode</em>, or <em>shortcuts</em>.</p>`
    },
    'getting-started': {
      coord:'α-01 · First light',
      title:'Getting started',
      lede:'Five minutes is enough to place your first moment on the timeline.',
      body:`
        <ol class="obs-steps">
          <li><b>Open the app.</b><span>Free Timeline Universe works the moment the page opens. There is no sign-up, no email, no account to create.</span></li>
          <li><b>Create your first Universe.</b><span>A Universe is a container for one world or one story. Click <strong>Add Universe</strong> in the top bar. Give it a name like <em>My Fantasy Novel</em> and pick a colour.</span></li>
          <li><b>Add your first event.</b><span>Click <strong>Add Event</strong>. Write a title, choose a date (any date — even an invented one), pick the Universe you just created, and press Save.</span></li>
          <li><b>Explore the timeline.</b><span>Your event appears as a dot on the main canvas. Drag the canvas to move through time. Use the + and − buttons, or your mouse wheel, to zoom.</span></li>
          <li><b>Save a backup right away.</b><span>Before you invest hours, make one backup. Open the menu, choose <strong>Export JSON</strong>, and keep the file somewhere safe. This is important — read <em>What Is Saved Locally</em> next.</span></li>
        </ol>
        <div class="obs-callout"><span class="obs-callout-tag">Suggestion</span>Start small. One universe, five events. You can always grow your world later.</div>`
    },
    'saved-locally': {
      coord:'α-02 · Local storage',
      title:'What is saved locally',
      lede:'Your world lives inside this browser, on this device. Nothing is sent to the internet. This gives you privacy — and a responsibility.',
      body:`
        <p class="obs-p">Free Timeline Universe saves your work in your browser's own storage. That storage stays on your computer or phone. No server ever sees your world. There is no account and no cloud sync.</p>
        <div class="obs-callout warn"><span class="obs-callout-tag">Important risk</span>
          Because your world is stored in this browser, it can be erased by things you would not normally worry about. Please read the list below carefully — it only takes a minute.</div>
        <p class="obs-p"><strong>Your world can disappear if any of these happen without a backup:</strong></p>
        <ol class="obs-steps">
          <li><b>You clear browsing data.</b><span>"Clear history", "Clear cookies and site data", or "Reset browser" will erase your world.</span></li>
          <li><b>You use private / incognito mode.</b><span>Private windows delete everything when you close them. Do not build your world in a private window.</span></li>
          <li><b>You change browsers or devices.</b><span>Opening the app on a different browser or a different computer will not show your world. It lives only where you created it.</span></li>
          <li><b>You uninstall the browser.</b><span>Removing Chrome, Firefox, Safari, Edge, or similar will take the storage with it.</span></li>
          <li><b>The browser runs out of space.</b><span>This is rare, but very large files or very low disk space can push data out.</span></li>
          <li><b>An extension or cleanup tool removes site data.</b><span>"Cookie cleaners" and "privacy extensions" sometimes delete storage.</span></li>
        </ol>
        <div class="obs-callout tip"><span class="obs-callout-tag">The only true safety net</span>
          Export a backup file regularly and keep it somewhere outside the browser — for example, a folder on your computer, a cloud drive, or a USB stick. See <em>Creating Backups</em>.</div>
        <p class="obs-p">Autosave is always on. Every change you make is kept in this browser automatically. But autosave only protects against small things — like accidentally closing the tab. It does not protect against clearing the browser.</p>`
    },
    'creating-events': {
      coord:'β-01 · Events',
      title:'Creating events',
      lede:'An event is one moment in your world. It can be enormous or tiny. If it matters to the story, it belongs on the timeline.',
      body:`
        <ol class="obs-steps">
          <li><b>Click "Add Event".</b><span>The event form opens on top of the timeline.</span></li>
          <li><b>Write a clear Title.</b><span>Short, specific titles work best. Examples: <em>The First Dragon Wakes</em>, <em>Founding of Moon Colony</em>, <em>The Treaty Breaks</em>.</span></li>
          <li><b>Set the Date or Timeline Point.</b><span>Use any format that makes sense for your world. <em>Year 1</em>, <em>430 BC</em>, <em>12/04/2088</em>, or <em>xx/xx/1450</em> if only the year is known. You can edit it later.</span></li>
          <li><b>Add a Description.</b><span>Describe what happened, who was there, and what changed after. This is the heart of your event. You can format text, add line breaks, and paste long passages.</span></li>
          <li><b>Pick a Universe.</b><span>Choose which world this event belongs to. You can change it later.</span></li>
          <li><b>Pick a Category.</b><span>Categories are the <em>type</em> of event — for example: Battle, Discovery, Birth, Prophecy, Political Shift. You create your own. See <em>Categories</em>.</span></li>
          <li><b>Link characters (optional).</b><span>If you already have characters, attach the ones involved in this moment. This powers the Characters tab and story connections.</span></li>
          <li><b>Save.</b><span>Your event appears on the timeline as a coloured marker inside its universe's track.</span></li>
        </ol>
        <div class="obs-callout tip"><span class="obs-callout-tag">Tip</span>Your first draft of any event does not need to be perfect. Capture it quickly, then polish later.</div>
        <p class="obs-p"><strong>Editing an event:</strong> click any event on the timeline to open it, then press <strong>Edit</strong>. You can change any field, or delete the event. Deleting always asks for confirmation.</p>
        <p class="obs-p"><strong>Event images:</strong> if the form offers an image field, you can paste or upload a picture for that moment. Images also live inside the browser, so they count toward the same local storage.</p>`
    },
    'timeline-nav': {
      coord:'β-02 · Navigation',
      title:'Timeline navigation',
      lede:'The main canvas is one long road through time. You can wander, jump, and return home without fear of losing your place.',
      body:`
        <ol class="obs-steps">
          <li><b>Move through time.</b><span>Click and drag the empty area of the canvas to slide the timeline left (past) or right (future). On a touchscreen, swipe with one finger.</span></li>
          <li><b>Jump to Today.</b><span>If you use real-world dates, click <strong>Today</strong> to snap back to the current date.</span></li>
          <li><b>Reset View.</b><span>If the timeline looks off, press <strong>Reset View</strong>. This recenters the canvas — <em>nothing is deleted, nothing is changed.</em></span></li>
          <li><b>Fit everything.</b><span>Use <strong>Fit</strong> (if available in your toolbar) to zoom out until every event is on screen at once.</span></li>
          <li><b>Focus on one universe.</b><span>Click a universe chip above the timeline to hide the others for a while. Click again to bring them back.</span></li>
        </ol>
        <div class="obs-callout"><span class="obs-callout-tag">Getting lost is normal</span>Drag too far and you might see a blank canvas. <strong>Reset View</strong> always brings you home.</div>`
    },
    'pan-zoom': {
      coord:'β-03 · Pan & zoom',
      title:'Pan and zoom',
      lede:'Pan is how you slide the canvas. Zoom is how close you stand to it.',
      body:`
        <p class="obs-p"><strong>Panning (moving around):</strong></p>
        <ol class="obs-steps">
          <li><b>Mouse or trackpad.</b><span>Click and hold an empty part of the canvas, then drag.</span></li>
          <li><b>Touchscreen.</b><span>Swipe with one finger.</span></li>
          <li><b>Keyboard.</b><span>Use the Arrow keys — left/right moves through time, up/down moves between universe rows.</span></li>
        </ol>
        <p class="obs-p"><strong>Zooming (closer or wider):</strong></p>
        <ol class="obs-steps">
          <li><b>Wheel or trackpad.</b><span>Scroll up to zoom in, scroll down to zoom out. On trackpads, the pinch gesture also works.</span></li>
          <li><b>Buttons.</b><span>Use <strong>+</strong> and <strong>−</strong> in the toolbar.</span></li>
          <li><b>Keyboard.</b><span>Press <strong>+</strong> (or <strong>=</strong>) to zoom in, <strong>−</strong> to zoom out, <strong>0</strong> to reset.</span></li>
          <li><b>Touchscreen.</b><span>Place two fingers on the canvas and spread them apart to zoom in; pinch them together to zoom out.</span></li>
        </ol>
        <div class="obs-callout tip"><span class="obs-callout-tag">Good habit</span>Zoom out before you panic. A wide view usually reveals where your events really are.</div>`
    },
    tracks: {
      coord:'γ-01 · Tracks',
      title:'Tracks and universes',
      lede:'A universe is one world or one story. Each universe gets its own coloured row — its own track — on the timeline.',
      body:`
        <ol class="obs-steps">
          <li><b>Create a universe.</b><span>Click <strong>Add Universe</strong>. Give it a name and a colour. Optionally add a short description.</span></li>
          <li><b>Rearrange universes.</b><span>From the universe list, you can rename, recolour, or reorder them. Order controls the stacking of rows on the canvas.</span></li>
          <li><b>Hide or show a universe.</b><span>Use the universe chips above the timeline to temporarily hide a universe without deleting it.</span></li>
          <li><b>Delete a universe.</b><span>Deleting a universe is always confirmed. You can choose what happens to its events — they can be moved to another universe or deleted.</span></li>
        </ol>
        <div class="obs-callout tip"><span class="obs-callout-tag">Think of it this way</span>If your story has parallel timelines (for example, a main plot and an ancient prequel), use one universe per timeline. You can then view them side by side.</div>
        <p class="obs-p"><strong>Universe Info:</strong> open a universe's info panel to see its event count, character count, and time span at a glance.</p>`
    },
    people: {
      coord:'γ-02 · People',
      title:'People and characters',
      lede:'Characters are the people (or creatures, or nations) your events revolve around. Each one gets a full dossier in the Characters tab.',
      body:`
        <ol class="obs-steps">
          <li><b>Open the Characters tab.</b><span>Click the <strong>Characters</strong> button in the top bar. This is your cast list.</span></li>
          <li><b>Create a dossier.</b><span>Press <strong>New Dossier</strong>. Fill in the name, a short description, and any other details you want. You can add a portrait later.</span></li>
          <li><b>Link characters to events.</b><span>Inside any event, attach the characters involved. The Characters tab will automatically track every moment each character appears in.</span></li>
          <li><b>Browse a character's timeline.</b><span>Open a dossier and you will see all the events they participate in, in order. This is their personal chronology.</span></li>
          <li><b>Find shared scenes.</b><span>The Characters tab can show you which characters appear together — useful for spotting duos, rivalries, and crossover moments.</span></li>
        </ol>
        <div class="obs-callout"><span class="obs-callout-tag">Writer's tip</span>Characters do not need full biographies to be useful. Even a one-line description is enough to start.</div>
        <p class="obs-p"><strong>Organizations</strong> group characters into factions, houses, guilds, crews, or any other grouping you invent. Manage them from the organization editor.</p>`
    },
    categories: {
      coord:'γ-03 · Categories',
      title:'Categories',
      lede:'Categories are the kinds of events — the colours of moments. You create and name them yourself.',
      body:`
        <ol class="obs-steps">
          <li><b>Open the Category editor.</b><span>Find <strong>Categories</strong> in the menu or settings area. This is where you build your own labels.</span></li>
          <li><b>Add a category.</b><span>Type a name, pick a colour, and save. Good examples: Battle, Discovery, Prophecy, Birth, Political Shift, Migration, Betrayal, Technology.</span></li>
          <li><b>Use categories on events.</b><span>Every event can be assigned one category. You can change it anytime.</span></li>
          <li><b>Filter by category.</b><span>Use the category filter bar to show only one kind of event — for example, only battles, or only discoveries.</span></li>
          <li><b>Edit or delete a category.</b><span>Renaming a category updates every event using it. Deleting a category is confirmed; its events are kept, just without that tag.</span></li>
        </ol>
        <div class="obs-callout tip"><span class="obs-callout-tag">Tip</span>A few clear categories are better than many confusing ones. Start with 5–7 and grow only when needed.</div>`
    },
    'search-filters': {
      coord:'γ-04 · Lookup',
      title:'Search and filters',
      lede:'When your world grows large, search and filters are how you focus. Think of them as a set of lenses.',
      body:`
        <p class="obs-p"><strong>Universal search:</strong> the search tool looks through event titles, descriptions, characters, and connections. Matching events are highlighted on the timeline.</p>
        <ol class="obs-steps">
          <li><b>Universe chips.</b><span>Click a universe at the top to show only that world. Click again to show all.</span></li>
          <li><b>Category filters.</b><span>Show only certain kinds of events — for example, only wars.</span></li>
          <li><b>Status, Tag, and Tone filters.</b><span>Use these to narrow down by event status (if you use it), freeform tags, or emotional tone.</span></li>
          <li><b>Character filter.</b><span>Show only events that include a chosen character.</span></li>
          <li><b>Clear filters.</b><span>Every filter bar has a way to reset. Clearing filters never deletes anything — it just shows everything again.</span></li>
        </ol>
        <div class="obs-callout"><span class="obs-callout-tag">Tip</span>Filters stack. You can combine a universe filter with a category filter to see, for example, all battles in one specific world.</div>`
    },
    relationships: {
      coord:'δ-01 · Connections',
      title:'Relationships and connections',
      lede:'Connections are arrows between events. They show cause and effect — how one moment led to another.',
      body:`
        <ol class="obs-steps">
          <li><b>Open an event.</b><span>Click the event you want to connect from.</span></li>
          <li><b>Choose the connection action.</b><span>Inside the event view, use the <strong>Connections</strong> option.</span></li>
          <li><b>Pick the second event.</b><span>Search for and select the event this one leads to or relates to.</span></li>
          <li><b>Add a label (optional).</b><span>Short labels work best: <em>causes</em>, <em>reveals</em>, <em>leads to</em>, <em>betrays</em>, <em>echoes</em>.</span></li>
          <li><b>View connections on the map.</b><span>Open the <strong>Connection Map</strong> from the menu to see every link as a graph. Zoom and drag to explore it.</span></li>
        </ol>
        <div class="obs-callout tip"><span class="obs-callout-tag">Use sparingly</span>Connect only the moments that truly shape each other. Too many arrows become noise.</div>
        <p class="obs-p"><strong>Character relationships</strong> can also be tracked on each character's dossier — allies, rivals, family, and so on. These are separate from event connections.</p>`
    },
    'story-mode': {
      coord:'δ-02 · Story mode',
      title:'Story mode',
      lede:'Story Mode lets you follow a chain of connected events like a single narrative thread.',
      body:`
        <ol class="obs-steps">
          <li><b>Open Story Mode.</b><span>Find the <strong>Story Line</strong> or <strong>Story Arc</strong> option in the menu or the view switcher.</span></li>
          <li><b>Pick a starting event.</b><span>Story Mode will travel along its connections, showing each event in order.</span></li>
          <li><b>Read forward.</b><span>Each scene shows the event, its characters, and the connection that brought you here.</span></li>
          <li><b>Exit Story Mode.</b><span>Press Escape or use the close button. You return to the full timeline view.</span></li>
        </ol>
        <div class="obs-callout"><span class="obs-callout-tag">Great for</span>Previewing a plotline, checking that a quest has the right beats, or sharing a single arc with a collaborator through a backup file.</div>`
    },
    importing: {
      coord:'ε-01 · Import',
      title:'Importing',
      lede:'Importing means bringing a saved world back into the app.',
      body:`
        <ol class="obs-steps">
          <li><b>Open the menu and click Load.</b><span>This opens a file picker.</span></li>
          <li><b>Choose your backup file.</b><span>Select the <em>.json</em> or <em>.html</em> file you saved before.</span></li>
          <li><b>Read the warning carefully.</b><span>Importing will replace whatever world is currently open. If you have unsaved work, export it first.</span></li>
          <li><b>Confirm.</b><span>Your saved world appears on screen — events, universes, categories, characters, connections, and all.</span></li>
        </ol>
        <div class="obs-callout danger"><span class="obs-callout-tag">Danger</span>Import replaces the current world. This cannot be undone automatically. Always export your current world first if you want to keep it.</div>`
    },
    backups: {
      coord:'ε-02 · Export',
      title:'Creating backups',
      lede:'A backup is a copy of your entire world saved to a file on your device. It is the single most important habit in this app.',
      body:`
        <ol class="obs-steps">
          <li><b>Open the menu.</b><span>Find the <strong>Export JSON</strong> option.</span></li>
          <li><b>Save the file.</b><span>Choose a location you trust — a backup folder, a cloud drive like Google Drive or iCloud, or a USB stick.</span></li>
          <li><b>Name it clearly.</b><span>Use names with dates or stage notes. Examples: <em>SpaceCampaign-2026-01-15</em>, <em>FantasyWorld-before-map-rewrite</em>, <em>MyNovel-chapter-12-complete</em>.</span></li>
          <li><b>Repeat regularly.</b><span>A good rhythm is: after every major writing session, before every big experiment, and before clearing your browser.</span></li>
        </ol>
        <div class="obs-callout tip"><span class="obs-callout-tag">Two types of backups</span>
          <strong>Export JSON</strong> is the full, re-importable backup — your primary safety net.
          <strong>Save HTML</strong> (if available) produces a standalone page you can open in any browser to read the timeline, without importing.</div>
        <div class="obs-callout warn"><span class="obs-callout-tag">When to back up</span>
          Before you clear browser history. Before you update your browser. Before you switch devices. Before any change you are nervous about.</div>`
    },
    restore: {
      coord:'ε-03 · Restore',
      title:'Restoring from backup',
      lede:'Restoring means loading a backup file back into the app to bring a previous world back.',
      body:`
        <ol class="obs-steps">
          <li><b>Open the app in the browser you want to use.</b><span>The restored world will live in that browser going forward.</span></li>
          <li><b>Choose Load / Import.</b><span>Pick the <em>.json</em> file you saved. If you only have an HTML backup, open the HTML file directly to read it, or use its export option to get the JSON again.</span></li>
          <li><b>Confirm the replacement.</b><span>If a world is already open, importing replaces it. Export what you have first if you want to keep it.</span></li>
          <li><b>Verify everything is there.</b><span>Check event counts, character counts, and a few open events. Connections and images should all be present.</span></li>
        </ol>
        <div class="obs-callout danger"><span class="obs-callout-tag">If you lost a world</span>
          The app cannot recover a world that was never exported. This is the reason <strong>Creating Backups</strong> matters. If you do have a backup file, follow the steps above and it will come back exactly as you saved it.</div>`
    },
    shortcuts: {
      coord:'ζ-01 · Keys',
      title:'Keyboard shortcuts',
      lede:'Shortcuts are optional but quick. Everything also works with mouse and touch.',
      body:`
        <div class="obs-kbd-grid">
          <div class="obs-kbd-row"><span class="obs-kbd-keys"><span class="obs-key">+</span><span class="obs-key">=</span></span><span class="obs-kbd-desc">Zoom in</span></div>
          <div class="obs-kbd-row"><span class="obs-kbd-keys"><span class="obs-key">−</span></span><span class="obs-kbd-desc">Zoom out</span></div>
          <div class="obs-kbd-row"><span class="obs-kbd-keys"><span class="obs-key">0</span></span><span class="obs-kbd-desc">Reset view</span></div>
          <div class="obs-kbd-row"><span class="obs-kbd-keys"><span class="obs-key">←</span></span><span class="obs-kbd-desc">Move toward the past</span></div>
          <div class="obs-kbd-row"><span class="obs-kbd-keys"><span class="obs-key">→</span></span><span class="obs-kbd-desc">Move toward the future</span></div>
          <div class="obs-kbd-row"><span class="obs-kbd-keys"><span class="obs-key">↑</span><span class="obs-key">↓</span></span><span class="obs-kbd-desc">Move between universe rows</span></div>
          <div class="obs-kbd-row"><span class="obs-kbd-keys"><span class="obs-key">Esc</span></span><span class="obs-kbd-desc">Close any open panel, image, or this manual</span></div>
          <div class="obs-kbd-row"><span class="obs-kbd-keys"><span class="obs-key">Ctrl</span><span class="obs-key">Z</span></span><span class="obs-kbd-desc">Undo the last change</span></div>
          <div class="obs-kbd-row"><span class="obs-kbd-keys"><span class="obs-key">Ctrl</span><span class="obs-key">Y</span></span><span class="obs-kbd-desc">Redo</span></div>
          <div class="obs-kbd-row"><span class="obs-kbd-keys"><span class="obs-key">Ctrl</span><span class="obs-key">Shift</span><span class="obs-key">Z</span></span><span class="obs-kbd-desc">Redo (alternative)</span></div>
          <div class="obs-kbd-row"><span class="obs-kbd-keys"><span class="obs-key">S</span></span><span class="obs-kbd-desc">Show or hide the stats panel</span></div>
          <div class="obs-kbd-row"><span class="obs-kbd-keys"><span class="obs-key">?</span><span class="obs-key">/</span></span><span class="obs-kbd-desc">Show or hide the on-screen key hints</span></div>
        </div>
        <div class="obs-callout tip"><span class="obs-callout-tag">Inside the manual</span>
          Inside this Observatory Manual, you can also use <strong>↑ / ↓</strong> in the left catalogue to move between sections, and <strong>Esc</strong> to close the manual and return focus to the button you opened it from.</div>
        <p class="obs-p">Shortcuts pause while you are typing in a text field or search box — so you can write plus and minus in descriptions without zooming the canvas.</p>`
    },
    mobile: {
      coord:'ζ-02 · Mobile',
      title:'Mobile use',
      lede:'The app works on phones and tablets. Gestures replace keys, and panels become bottom sheets.',
      body:`
        <ol class="obs-steps">
          <li><b>Swipe to pan.</b><span>Drag with one finger to move through time or between rows.</span></li>
          <li><b>Pinch to zoom.</b><span>Place two fingers on the canvas. Spread them apart to zoom in, pinch them together to zoom out.</span></li>
          <li><b>Tap to open.</b><span>Tap any event to open it. Tap a universe chip to filter.</span></li>
          <li><b>Use the drawer menu.</b><span>On small screens, the top bar collapses into a menu. Tap it to find Add Event, Add Universe, Characters, Export, Load, and ❓ Help.</span></li>
          <li><b>Bottom sheets.</b><span>Panels (like this manual and event forms) slide up from the bottom and can be dismissed by tapping the handle, the backdrop, or the Close button.</span></li>
        </ol>
        <div class="obs-callout warn"><span class="obs-callout-tag">Backups on mobile</span>
          Mobile browsers are more aggressive about clearing storage. It is especially important to export backups often and save them to your cloud drive (iCloud, Google Drive, etc.).</div>
        <p class="obs-p"><strong>Performance:</strong> very large worlds (thousands of events) may run smoother on a desktop or laptop. Pinching to zoom first, then tapping events, keeps things responsive.</p>`
    },
    troubleshoot: {
      coord:'η-01 · Diagnostics',
      title:'Troubleshooting',
      lede:'Common problems and the simplest way to solve each one.',
      body:`
        <div class="obs-faq">
          <details><summary>My timeline looks empty or frozen</summary><div>
            Press <strong>Reset View</strong>. This recenters the canvas without deleting anything. If it is still empty, check that a universe chip is not hidden — click any hidden universe to bring it back.
          </div></details>
          <details><summary>My events are gone after I closed the browser</summary><div>
            If you never exported a backup, check whether you cleared browsing data, used a private window, or switched browsers. Those wipe local storage. Next time, export a backup before any risky action. See <em>What Is Saved Locally</em>.
          </div></details>
          <details><summary>Import fails or says the file is invalid</summary><div>
            Make sure you are picking the <em>.json</em> backup file (not a screenshot or a text file). If the file was saved by a very old version, try opening the HTML version, which can re-export a fresh JSON.
          </div></details>
          <details><summary>Zooming or scrolling feels slow</summary><div>
            Filter down to one universe or category while you work on it. Close the stats panel if it is open. On very large worlds, use desktop or laptop browsers for heavy editing.
          </div></details>
          <details><summary>A button does nothing</summary><div>
            Close any open modal (press <strong>Esc</strong>) and try again. If the page still misbehaves, export a backup, refresh the tab, and reopen the app — your world will load automatically.
          </div></details>
          <details><summary>I deleted something by mistake</summary><div>
            Press <strong>Ctrl + Z</strong> (or <strong>⌘ + Z</strong>) to undo. If undo is not available, import your most recent backup.
          </div></details>
          <details><summary>The app looks broken on my phone</summary><div>
            Rotate the phone to landscape, or pinch out slightly to reset the zoom. If panels are stuck, tap the backdrop behind them or press the Close button.
          </div></details>
        </div>
        <div class="obs-callout"><span class="obs-callout-tag">Still stuck?</span>
          Export a backup first (so nothing is lost), then try refreshing the page. The autosave will reload your world exactly as it was.</div>`
    },
    faq: {
      coord:'θ-01 · FAQ',
      title:'Frequently asked',
      lede:'Short answers to the questions people ask most.',
      body:`
        <div class="obs-faq">
          <details><summary>Do I need an account?</summary><div>No. There is no sign-up, no email, no password. The app starts working the second it loads.</div></details>
          <details><summary>Is it free?</summary><div>Yes. Free Timeline Universe is free to use. That is in the name.</div></details>
          <details><summary>Where is my data stored?</summary><div>Inside this browser, on this device. Nothing is sent to any server. See <em>What Is Saved Locally</em>.</div></details>
          <details><summary>Can I use it offline?</summary><div>Yes. Once the page is open, it works without an internet connection. If you saved the HTML file, you can open it anywhere with any browser.</div></details>
          <details><summary>Can two people edit the same timeline?</summary><div>Not live. But you can share a backup file: one person exports, the other imports. Split the work by universe if you collaborate.</div></details>
          <details><summary>Is there a limit to how many events I can add?</summary><div>There is no hard limit. Very large worlds (thousands of events with images) may slow down a small device. Desktop browsers handle the largest worlds best.</div></details>
          <details><summary>Can I change the colour of a universe or category later?</summary><div>Yes. Edit the universe or the category; the change applies to every event using it.</div></details>
          <details><summary>Can I print my timeline or export it as a document?</summary><div>Use <strong>Save HTML</strong> to create a standalone page you can print from your browser's print dialog.</div></details>
          <details><summary>How do I move my world to another computer?</summary><div>Export a backup on the old computer, email or copy the file to the new one, and import it there.</div></details>
        </div>`
    },
    privacy: {
      coord:'θ-02 · Privacy',
      title:'Privacy & data',
      lede:'A short and plain summary of what this app does — and does not do — with your information.',
      body:`
        <ol class="obs-steps">
          <li><b>No account.</b><span>You are never asked for a name, email, password, or identity of any kind.</span></li>
          <li><b>No server.</b><span>Your events, characters, universes, images, and backups live only on the device you use. They are not uploaded or synced.</span></li>
          <li><b>No tracking.</b><span>There are no analytics, no ads, no cookies for advertising.</span></li>
          <li><b>No sharing.</b><span>Nothing you write is visible to anyone else unless you personally share a backup file.</span></li>
        </ol>
        <div class="obs-callout warn"><span class="obs-callout-tag">Your responsibility</span>
          Because your world lives on your device, protecting it is up to you. Keep backups outside the browser — in a folder, a cloud drive, or a USB stick.</div>`
    },
    credits: {
      coord:'θ-03 · Colophon',
      title:'About & credits',
      lede:'About this tool and the people it is made for.',
      body:`
        <p class="obs-p"><strong>Free Timeline Universe</strong> is a self-contained, offline-first worldbuilding app for writers, storytellers, game masters, artists, students, and historians of imagined worlds. It runs entirely in your browser, keeps your work private, and never asks for an account.</p>
        <p class="obs-p">This Observatory Manual — the guide you are reading — was rebuilt to be searchable, accessible from the keyboard, and easy to read on any device. Every section of the app is documented here. If something is missing, the search bar will tell you.</p>
        <div class="obs-callout tip"><span class="obs-callout-tag">Thank you</span>
          This tool exists because people like you have imaginary worlds worth recording. Keep building.</div>
        <p class="obs-p" style="color:#8a98b8; font-size:13px;">Manual v8 · Observatory edition · Free Timeline Universe</p>`
    }
  };

  return OBS_HELP_SECTIONS.map((meta, i) => {
    const d = S_[meta.id] || { coord: meta.coord, title: meta.label, lede:'', body:'' };
    const active = i === 0 ? ' is-active' : '';
    return `<article class="obs-section${active}" data-obs-section="${meta.id}" data-obs-kw="${(meta.kw||'').replace(/"/g,'&quot;')}">
      <div class="obs-sec-meta">${d.coord}</div>
      <h2 class="obs-sec-title">${d.title}</h2>
      ${d.lede ? `<p class="obs-sec-lede">${d.lede}</p>` : ''}
      ${d.body}
    </article>`;
  }).join('');
}

function obsHelpInit(){
  const root = document.querySelector('[data-obs-help]');
  if (!root) return;
  const search = root.querySelector('[data-obs-search]');
  const tocItems = [...root.querySelectorAll('[data-obs-toc-item]')];
  const sections = [...root.querySelectorAll('[data-obs-section]')];
  const noResults = root.querySelector('[data-obs-noresults]');
  const tocEmpty = root.querySelector('[data-obs-toc-empty]');
  const mainEl = root.querySelector('[data-obs-main]');
  const tocToggle = root.querySelector('[data-obs-toc-toggle]');
  const tocList = root.querySelector('#obs-toc-list');
  const currentLabel = root.querySelector('#obs-current-label');

  // Remember previously focused element so we can return focus on close
  _obsHelpPrevFocus = document.activeElement;
  _obsHelpActiveId = 'welcome';

  // Initial focus to the search field (keyboard accessible)
  setTimeout(() => { try { search && search.focus({preventScroll:true}); } catch(_){} }, 60);

  const activate = (id, opts = {}) => {
    _obsHelpActiveId = id;
    tocItems.forEach(t => {
      const match = t.dataset.obsTarget === id;
      t.classList.toggle('is-active', match);
      t.setAttribute('aria-selected', match ? 'true' : 'false');
      if (match && currentLabel) currentLabel.textContent = t.querySelector('.obs-toc-label').textContent;
    });
    sections.forEach(s => s.classList.toggle('is-active', s.dataset.obsSection === id));
    if (mainEl && !opts.noScroll) mainEl.scrollTo({ top: 0, behavior: 'smooth' });
    // Close mobile drawer after picking
    if (tocToggle && tocList && tocList.classList.contains('is-open') && window.innerWidth <= 820){
      tocList.classList.remove('is-open');
      tocToggle.classList.remove('is-open');
      tocToggle.setAttribute('aria-expanded', 'false');
    }
  };

  tocItems.forEach(btn => {
    btn.addEventListener('click', () => activate(btn.dataset.obsTarget));
  });

  // Mobile TOC toggle
  if (tocToggle && tocList){
    tocToggle.addEventListener('click', () => {
      const open = !tocList.classList.contains('is-open');
      tocList.classList.toggle('is-open', open);
      tocToggle.classList.toggle('is-open', open);
      tocToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // Keyboard navigation inside TOC
  tocList && tocList.addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End' && e.key !== 'Enter') return;
    const visible = tocItems.filter(t => !t.classList.contains('is-hidden'));
    if (!visible.length) return;
    const current = document.activeElement;
    let idx = visible.indexOf(current);
    if (idx === -1) idx = visible.findIndex(t => t.classList.contains('is-active'));
    if (idx === -1) idx = 0;
    if (e.key === 'ArrowDown') idx = Math.min(visible.length - 1, idx + 1);
    else if (e.key === 'ArrowUp') idx = Math.max(0, idx - 1);
    else if (e.key === 'Home') idx = 0;
    else if (e.key === 'End') idx = visible.length - 1;
    else if (e.key === 'Enter') { visible[Math.max(0,idx)].click(); e.preventDefault(); return; }
    visible[idx].focus();
    visible[idx].click();
    e.preventDefault();
  });

  // Search helpers
  const escapeReg = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stripMarks = (el) => {
    el.querySelectorAll('.obs-highlight').forEach(m => {
      const p = m.parentNode;
      p.replaceChild(document.createTextNode(m.textContent), m);
      p.normalize();
    });
  };
  const highlightIn = (el, re) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: n => {
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = n.parentNode;
        if (!p || p.nodeName === 'SCRIPT' || p.nodeName === 'STYLE' || p.classList.contains('obs-highlight')) return NodeFilter.FILTER_REJECT;
        return re.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const targets = [];
    let n; while ((n = walker.nextNode())) targets.push(n);
    targets.forEach(node => {
      const frag = document.createDocumentFragment();
      const text = node.nodeValue;
      let last = 0; re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        const mark = document.createElement('span');
        mark.className = 'obs-highlight';
        mark.textContent = m[0];
        frag.appendChild(mark);
        last = m.index + m[0].length;
        if (!m[0]) break;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      node.parentNode.replaceChild(frag, node);
    });
  };

  const doSearch = () => {
    const q = (search.value || '').trim().toLowerCase();
    sections.forEach(s => stripMarks(s));
    if (!q) {
      tocItems.forEach(t => t.classList.remove('is-hidden'));
      sections.forEach(s => s.classList.remove('is-hidden'));
      tocEmpty.style.display = 'none';
      noResults.style.display = 'none';
      activate(_obsHelpActiveId || 'welcome', { noScroll:true });
      return;
    }
    const re = new RegExp(escapeReg(q), 'gi');
    let firstMatch = null;
    let anyMatch = false;
    sections.forEach((s, i) => {
      const kw = (s.dataset.obsKw || '').toLowerCase();
      const text = (s.textContent || '').toLowerCase();
      const hit = kw.includes(q) || text.includes(q);
      s.classList.toggle('is-hidden', !hit);
      const tocItem = tocItems[i];
      if (tocItem) tocItem.classList.toggle('is-hidden', !hit);
      if (hit) {
        anyMatch = true;
        if (!firstMatch) firstMatch = s.dataset.obsSection;
        highlightIn(s, re);
      }
    });
    tocEmpty.style.display = anyMatch ? 'none' : 'block';
    noResults.style.display = anyMatch ? 'none' : 'block';
    if (firstMatch) activate(firstMatch);
  };

  if (search) {
    search.addEventListener('input', doSearch);
    search.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (search.value) {
          // First Escape clears the search
          e.stopPropagation();
          e.preventDefault();
          search.value = '';
          doSearch();
        } else {
          // Second Escape closes the manual (global handler skips INPUT)
          e.preventDefault();
          try { M.close(); } catch(_){}
        }
      } else if (e.key === 'ArrowDown') {
        // Move focus into TOC for quick keyboard nav
        const firstVisible = tocItems.find(t => !t.classList.contains('is-hidden'));
        if (firstVisible) { firstVisible.focus(); e.preventDefault(); }
      }
    });
  }

  // Focus return on close: register a one-shot cleanup with the hardened M.close
  if (typeof M !== 'undefined' && typeof M.onClose === 'function') {
    M.onClose(function(){
      const prev = _obsHelpPrevFocus;
      _obsHelpPrevFocus = null;
      if (prev && typeof prev.focus === 'function') {
        setTimeout(function(){
          try { prev.focus({preventScroll:true}); } catch(_) { try{ prev.focus(); }catch(__){} }
        }, 0);
      }
    });
  }
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
   js/universe-timeline.js module would need to expose lives here.
   defineProperty getters/setters keep the live `let` bindings
   (TRACK_H, YEAR_MIN, YEAR_MAX) reactive. All wrapped in try/catch
   so a missing symbol can never break page load.
   ===================================================== */
try {
  /* Object references — same identity in both worlds */
  FT_UNI.state       = (typeof S    !== 'undefined') ? S    : null;
  FT_UNI.view        = (typeof V    !== 'undefined') ? V    : null;
  FT_UNI.modalStack  = (typeof MS   !== 'undefined') ? MS   : null;
  FT_UNI.modal       = (typeof M    !== 'undefined') ? M    : null;
  FT_UNI.palette     = (typeof PALETTE !== 'undefined') ? PALETTE : null;
  FT_UNI.store       = (typeof Store   !== 'undefined') ? Store   : null;
  FT_UNI.ui          = window.UI || null;

  /* Render entry points */
  FT_UNI.render          = (typeof render          === 'function') ? render          : null;
  FT_UNI.drawConnections = (typeof drawConnections === 'function') ? drawConnections : null;
  FT_UNI.drawEvents      = (typeof drawEvents      === 'function') ? drawEvents      : null;

  /* Live-binding accessors for mutable primitives */
  Object.defineProperty(FT_UNI, 'TRACK_H', {
    configurable: true,
    get: function(){ try { return TRACK_H; } catch(_){ return undefined; } },
    set: function(v){ try { TRACK_H  = v; } catch(_){} }
  });
  Object.defineProperty(FT_UNI, 'YEAR_MIN', {
    configurable: true,
    get: function(){ try { return YEAR_MIN; } catch(_){ return undefined; } },
    set: function(v){ try { YEAR_MIN = v; } catch(_){} }
  });
  Object.defineProperty(FT_UNI, 'YEAR_MAX', {
    configurable: true,
    get: function(){ try { return YEAR_MAX; } catch(_){ return undefined; } },
    set: function(v){ try { YEAR_MAX = v; } catch(_){} }
  });

  /* =====================================================
     ViewportController (Prompt 2.4.B)
     Thin adapter over the existing V.scale / V.panX engine.
     Exposes the spec API (centerMs, pxPerDay, dateToX, xToDate,
     pan, zoomAt, fitToData) plus persistence to localStorage
     'ft_uni_view_v1' on pointerup + wheel (debounced 300 ms).
     Restored on next tick so the user's last view survives F5.
     The existing doZoom() already pivots under the cursor and
     +/- buttons already step at 1.25x — those paths are untouched.
     ===================================================== */
  var _VC_KEY = 'ft_uni_view_v1';
  var _MS_PER_YEAR = 365.25 * 86400 * 1000;
  function _yearToMs(y) { return (y - 1970) * _MS_PER_YEAR; }
  function _msToYear(ms) { return 1970 + ms / _MS_PER_YEAR; }

  var VC = {
    /* Live-binding scalar getters */
    get pxPerYear()    { try { return BPPY * V.scale; } catch(_){ return 0; } },
    get pxPerDay()     { try { return (BPPY * V.scale) / 365.25; } catch(_){ return 0; } },
    get minPxPerDay()  { try { return (BPPY * getMinScale()) / 365.25; } catch(_){ return 0; } },
    get maxPxPerDay()  { try { return (BPPY * MAX_SC) / 365.25; } catch(_){ return 0; } },
    get centerYear()   { try { return OY + sw(centerX()) / BPPY; } catch(_){ return OY; } },
    get centerMs()     { try { return _yearToMs(this.centerYear); } catch(_){ return 0; } },

    /* Coordinate conversions (ms <-> screen px) */
    dateToX: function(ms) {
      try { return ws(yw(_msToYear(ms))); } catch(_){ return 0; }
    },
    xToDate: function(px) {
      try { return _yearToMs(OY + sw(px) / BPPY); } catch(_){ return 0; }
    },

    /* Mutators — all delegate to existing engine functions */
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
                : (FT_UNI.state && FT_UNI.state.events) ? FT_UNI.state.events
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
        V.panX  = -yw(cYear) * V.scale;  /* center midpoint at screen centerX */
        if (typeof clampPanX === 'function') clampPanX();
        var z = document.getElementById('zoom-pct');
        if (z && typeof formatZoomPercent === 'function') z.textContent = formatZoomPercent();
        if (typeof render === 'function') render();
        return true;
      } catch(_){ return false; }
    },

    /* Persistence */
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
        /* UE-11: pick ONE viewport authority. When the URL hash carries the view
           (#date=/&zoom=), setupHashState.applyHash() already restored it during
           init; this deferred setTimeout(0) restore must NOT run, or it would
           overwrite the hash-restored view from localStorage — leaving the
           address bar out of sync and clobbering a shared link. The hash wins
           when present; localStorage only restores the last view when there is
           no hash (e.g. first visit of the session). */
        if (/[#&](date|zoom)=/.test(location.hash || '')) return false;
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
  FT_UNI.ViewportController = VC;

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

  FT_UNI._loaded = true;
} catch (_) {
  try { console.warn('[FT_UNI] export registration failed:', _); } catch(__){}
}


/* =====================================================
   MINIMAP (Phase 2.4.G)
   -----------------------------------------------------
   Adds a 100px minimap fixed at the bottom of #canvas-wrap.
   Renders one 1px dot per event coloured by its track and a
   translucent rectangle showing the current viewport. Drag
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
    let lastRect = null;   // {leftPx, rightPx, topPx, btmPx} from the last draw
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
      // 5% padding so dots don't sit on the edge.
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

    function draw() {
      if (!host || host.offsetParent === null) return; // hidden by CSS
      recomputeRange();
      const w = cnv.clientWidth, h = cnv.clientHeight;
      g.clearRect(0, 0, w, h);

      // Backdrop
      g.fillStyle = '#0a0c18';
      g.fillRect(0, 0, w, h);

      // Lane stripes per visible track
      const tracks = (S.universes || S.lifeTracks || []).filter(u => u.visible !== false);
      const laneH = tracks.length > 0 ? (h - 6) / tracks.length : (h - 6);
      tracks.forEach((u, i) => {
        const y = 3 + i * laneH;
        g.fillStyle = (u.color || '#446') + '22';
        g.fillRect(0, y, w, laneH);
      });

      // Year tick lines (every "nice" step)
      const span = yearMax - yearMin;
      const step = niceStep(span / 6);
      g.strokeStyle = '#1a2238';
      g.lineWidth = 1;
      for (let y = Math.ceil(yearMin / step) * step; y <= yearMax; y += step) {
        const x = Math.round(yrToPx(y, w)) + 0.5;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
      }

      // Event dots, 1px, coloured by track
      const trackColor = {};
      tracks.forEach((u, i) => trackColor[u.id] = { color: u.color || '#88a', idx: i });
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

      // Viewport rectangle
      const [vA, vB] = visibleYearRange();
      const lx = Math.max(0, Math.min(w, yrToPx(vA, w)));
      const rx = Math.max(0, Math.min(w, yrToPx(vB, w)));
      g.fillStyle = 'rgba(120, 170, 255, 0.18)';
      g.fillRect(lx, 0, Math.max(2, rx - lx), h);
      g.strokeStyle = 'rgba(140, 190, 255, 0.85)';
      g.lineWidth = 1;
      g.strokeRect(Math.round(lx) + 0.5, 0.5, Math.max(1, Math.round(rx - lx) - 1), h - 1);
      // Edge handles
      g.fillStyle = 'rgba(140, 190, 255, 0.85)';
      g.fillRect(Math.round(lx),     0, 2, h);
      g.fillRect(Math.round(rx) - 2, 0, 2, h);

      lastRect = { leftPx: lx, rightPx: rx, w: w, h: h };
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

    /* === Apply pan / zoom to the main timeline === */
    function panToCenterYear(centerYr) {
      // ws(yw(centerYr)) should equal centerX().
      // ws(wx) = wx * V.scale + centerX() + V.panX  →  V.panX = -yw(centerYr) * V.scale.
      V.panX = -yw(centerYr) * V.scale;
      if (typeof clampPanX === 'function') clampPanX();
      if (typeof render === 'function') render();
      const zp = document.getElementById('zoom-pct');
      if (zp) zp.textContent = formatZoomPercent();
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
        // Click outside the rect → recenter immediately.
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

    /* === Collapse / expand (UE-2): default collapsed so the minimap stops
       covering the bottom of the live canvas; opt-in via the Map pill, remembered. === */
    (function setupCollapse(){
      const MM_KEY = 'uni_minimap_collapsed_v1';
      const showBtn   = document.getElementById('minimap-show');
      const toggleBtn = document.getElementById('minimap-toggle');
      function apply(collapsed){
        document.body.classList.toggle('mm-collapsed', collapsed);
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', String(!collapsed));
        if (!collapsed) { try { resize(); draw(); } catch(_){} }
      }
      apply(document.body.classList.contains('mm-collapsed'));
      if (toggleBtn) toggleBtn.addEventListener('click', function(){
        try { localStorage.setItem(MM_KEY, '1'); } catch(_){}
        apply(true);
      });
      if (showBtn) showBtn.addEventListener('click', function(){
        try { localStorage.setItem(MM_KEY, '0'); } catch(_){}
        apply(false);
      });
    })();

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
   KEYBOARD NAVIGATION (Phase 2.4.H)
   -----------------------------------------------------
   #canvas-wrap is tabindex=0 already. A single keydown
   listener on it (plus a tiny document-level Esc handler)
   provides:
     ArrowLeft/Right  pan ±20px (Shift = ±200px)
     ArrowUp/Down     pan the cross axis ±20 / ±200px
     + / =            zoom in 1.25x
     - / _            zoom out 1.25x
     0                fit to data
     Home             jump to first event (chronological)
     End              jump to last event (chronological)
     Tab / Shift+Tab  cycle events chronologically with focus ring
     Enter            open detail modal of the focused event
     Escape           close any open modal
   ===================================================== */
(function setupKeyboardNav() {
  function init() {
    const wrap = document.getElementById('canvas-wrap');
    if (!wrap) return;

    let focusedEventId = null;
    let sortedCache = null;       // cached chronological list
    let sortedCacheKey = '';

    function chronoEvents() {
      const evs = (S && S.events) ? S.events : [];
      const key = evs.length + '|' + (evs[evs.length - 1] && evs[evs.length - 1].id || '');
      if (sortedCache && sortedCacheKey === key) return sortedCache;
      const out = [];
      for (let i = 0; i < evs.length; i++) {
        const ev = evs[i];
        const u  = (S.universes || []).find(x => x.id === ev.universeId);
        if (!u || u.visible === false) continue;
        let y; try { y = parseDate(ev.date, ev.time); } catch(_) { y = null; }
        if (y == null || !isFinite(y)) continue;
        out.push({ ev: ev, year: y, uId: u.id });
      }
      out.sort((a, b) => a.year - b.year);
      sortedCache = out; sortedCacheKey = key;
      return out;
    }

    function panTimeline(dxPx) {
      V.panX += dxPx;
      if (typeof clampPanX === 'function') clampPanX();
      if (typeof render === 'function') render();
    }
    function panCross(dyPx) {
      V.panY += dyPx;
      if (typeof clampPanY === 'function') clampPanY();
      if (typeof render === 'function') render();
      if (typeof updateUniverseScrollbar === 'function') updateUniverseScrollbar();
    }
    function panPrimary(deltaPx) {
      // On vertical layout the time axis is Y; on horizontal it's X. The
      // engine stores time pan in V.panX in both layouts, so this is a
      // straight delegation.
      panTimeline(deltaPx);
    }

    function fitToData() {
      const evs = (S && S.events) ? S.events : [];
      const years = [];
      evs.forEach(ev => {
        try { const y = parseDate(ev.date, ev.time); if (isFinite(y)) years.push(y); } catch(_){}
      });
      if (!years.length) { if (typeof resetView === 'function') resetView(); return; }
      const yMin = Math.min.apply(null, years);
      const yMax = Math.max.apply(null, years);
      const pad  = 0.05 * Math.max(1, yMax - yMin);
      const span = (yMax - yMin) + 2 * pad;
      const visW = timeAxisLength();
      if (visW <= 0 || span <= 0) return;
      V.scale = clamp(visW / (span * BPPY), getMinScale(), MAX_SC);
      const cYear = (yMin + yMax) / 2;
      V.panX  = -yw(cYear) * V.scale;
      if (typeof clampPanX === 'function') clampPanX();
      const z = document.getElementById('zoom-pct');
      if (z && typeof formatZoomPercent === 'function') z.textContent = formatZoomPercent();
      if (typeof render === 'function') render();
    }

    function jumpToYear(year) {
      V.panX = -yw(year) * V.scale;
      if (typeof clampPanX === 'function') clampPanX();
      if (typeof render === 'function') render();
    }

    function focusEvent(idx) {
      const list = chronoEvents();
      if (!list.length) { focusedEventId = null; if (typeof render === 'function') render(); return; }
      const i = ((idx % list.length) + list.length) % list.length;
      const item = list[i];
      focusedEventId = item.ev.id;
      jumpToYear(item.year);
      if (typeof render === 'function') render();
      // Announce to screen readers via the wrap's aria-live region (if any).
      wrap.setAttribute('aria-activedescendant', 'event-' + item.ev.id);
    }

    function focusedIndex() {
      const list = chronoEvents();
      if (!focusedEventId) return -1;
      for (let i = 0; i < list.length; i++) if (list[i].ev.id === focusedEventId) return i;
      return -1;
    }

    function modalIsOpen() {
      const bg = document.getElementById('modal-bg');
      return !!(bg && bg.classList.contains('open'));
    }

    /* === Halo: draw a focus ring on the focused event after each render === */
    function drawHalo() {
      if (!focusedEventId) return;
      const c = (typeof CV === 'function') ? CV() : null;
      if (!c) return;
      const list = chronoEvents();
      const item = list.find(x => x.ev.id === focusedEventId);
      if (!item) return;
      const visTracks = (S.universes || []).filter(u => u.visible !== false);
      const vi = visTracks.findIndex(u => u.id === item.uId);
      if (vi < 0) return;
      const x = eventScreenX(item.year, vi);
      const y = eventScreenY(item.year, vi);
      const g = c.getContext('2d');
      g.save();
      g.lineWidth = 2;
      g.strokeStyle = '#ffd84a';
      g.shadowColor = '#ffd84a';
      g.shadowBlur  = 8;
      g.beginPath(); g.arc(x, y, 14, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 1;
      g.strokeStyle = 'rgba(255, 216, 74, 0.55)';
      g.shadowBlur  = 0;
      g.beginPath(); g.arc(x, y, 18, 0, Math.PI * 2); g.stroke();
      g.restore();
    }
    if (typeof render === 'function' && !render.__kbdHalo) {
      const _orig = render;
      render = function() {
        const out = _orig.apply(this, arguments);
        try { drawHalo(); } catch(_) {}
        return out;
      };
      render.__kbdHalo = true;
    }

    /* === Main keydown handler on #canvas-wrap === */
    wrap.addEventListener('keydown', function(e) {
      // Don't intercept while the user is typing in an input/textarea inside the wrap.
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      // Don't intercept while a modal is open — the modal owns the keyboard.
      if (modalIsOpen() && e.key !== 'Escape') return;

      const big = e.shiftKey ? 200 : 20;

      switch (e.key) {
        case 'ArrowLeft':
          panPrimary(+big); e.preventDefault(); break;
        case 'ArrowRight':
          panPrimary(-big); e.preventDefault(); break;
        case 'ArrowUp':
          panCross(+big); e.preventDefault(); break;
        case 'ArrowDown':
          panCross(-big); e.preventDefault(); break;
        case '+': case '=':
          doZoom(1.25, null); e.preventDefault(); break;
        case '-': case '_':
          doZoom(0.8, null); e.preventDefault(); break;
        case '0':
          fitToData(); e.preventDefault(); break;
        case 'Home': {
          const list = chronoEvents();
          if (list.length) focusEvent(0);
          e.preventDefault(); break;
        }
        case 'End': {
          const list = chronoEvents();
          if (list.length) focusEvent(list.length - 1);
          e.preventDefault(); break;
        }
        case 'Tab': {
          const list = chronoEvents();
          if (!list.length) return; // let native Tab move out
          const cur = focusedIndex();
          const nextIdx = e.shiftKey ? (cur <= 0 ? list.length - 1 : cur - 1)
                                     : (cur < 0 ? 0 : (cur + 1) % list.length);
          focusEvent(nextIdx);
          e.preventDefault();
          break;
        }
        case 'Enter': case ' ':
          if (focusedEventId && typeof M !== 'undefined' && typeof M.openEvDetail === 'function') {
            M.openEvDetail(focusedEventId);
            e.preventDefault();
          }
          break;
      }
    });

    /* === Esc anywhere → close any open modal === */
    document.addEventListener('keydown', function(e) {
      if (e.key !== 'Escape') return;
      if (!modalIsOpen()) return;
      if (typeof M !== 'undefined' && typeof M.close === 'function') {
        try { M.close(); e.preventDefault(); } catch(_){}
      }
    });

    /* === Clicking the canvas should clear any stale focus ring === */
    const tlc = document.getElementById('tl-canvas');
    if (tlc) tlc.addEventListener('pointerdown', () => {
      if (focusedEventId) { focusedEventId = null; if (typeof render === 'function') render(); }
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/* =====================================================
   URL HASH STATE  (Phase 2.4.J)
   -----------------------------------------------------
   Reads #date=YYYY&zoom=N&tracks=id1,id2,... on load and
   restores the view. Updates the hash (debounced 300 ms)
   whenever the user pans, zooms, or toggles a universe.
   The hash is the single source of truth for "where am I
   looking?" so a refresh — or a shared link — restores
   the exact same view.
   ===================================================== */
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
    h.split('&').forEach(p => {
      const [k, v] = p.split('=');
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
      /* UE-5: a #tracks list from a link shared by ANOTHER device names track
         ids this timeline doesn't have. Applying it blindly sets want=false for
         every local universe and blanks the recipient's whole timeline. Only
         honour the list when it actually overlaps local tracks (or is empty,
         which means "show all"); otherwise leave visibility untouched. */
      const overlaps = (S.universes || []).some(u => ids.has(u.id));
      if (ids.size === 0 || overlaps) {
        (S.universes || []).forEach(u => {
          const want = ids.size === 0 ? true : ids.has(u.id);
          if (u.visible !== want) { u.visible = want; touched = true; }
        });
      }
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
      const tracks = (S.universes || [])
        .filter(u => u.visible !== false)
        .map(u => u.id)
        .join(',');
      return '#date=' + encodeURIComponent(cy.toFixed(3)) +
             '&zoom=' + encodeURIComponent(V.scale.toFixed(4)) +
             (tracks ? '&tracks=' + encodeURIComponent(tracks) : '');
    } catch(_) { return ''; }
  }

  function writeHash() {
    if (suppressWrite) return;
    clearTimeout(writeTimer);
    writeTimer = setTimeout(() => {
      try {
        const h = buildHash();
        if (h && h !== location.hash) {
          history.replaceState(null, '', h);
        }
      } catch(_) {}
    }, 300);
  }

  function init() {
    suppressWrite = true;
    try { applyHash(); } finally {
      // Allow a frame for any restore-from-localStorage to settle, then unlock.
      setTimeout(() => { suppressWrite = false; writeHash(); }, 0);
    }

    // Hook render() once to capture pan/zoom/visibility changes.
    if (typeof render === 'function' && !render.__hashSync) {
      const _orig = render;
      render = function() {
        const out = _orig.apply(this, arguments);
        try { writeHash(); } catch(_) {}
        return out;
      };
      render.__hashSync = true;
    }

    // Cross-tab / back-forward navigation.
    window.addEventListener('hashchange', () => {
      suppressWrite = true;
      try { applyHash(); } finally { setTimeout(() => { suppressWrite = false; }, 0); }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/* =====================================================
   PHASE 3 — Mobile UX glue (swipe-down + zoom-pct sync)
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
        // Only start if the touch begins near the top (handle area) OR
        // the inner content isn't scrolled — so users can still scroll long modals.
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
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

/* =====================================================
   PART 6 — Universe Switcher, Undo/Redo, Autosave History,
            Saved-toast, Clear-filters pill
   ===================================================== */
(function () {
  'use strict';

  /* ---------- 6.1  Undo / Redo (ring buffer of 50) ---------- */
  const HIST_MAX = 50;
  const undoStack = [];
  const redoStack = [];
  let _isRestoring = false;

  function snapshot() {
    try { return JSON.parse(JSON.stringify(S)); } catch (_) { return null; }
  }
  function restore(snap) {
    if (!snap) return;
    _isRestoring = true;
    try {
      S.universes    = snap.universes    || [];
      S.events       = snap.events       || [];
      S.connections  = snap.connections  || [];
      S.characters   = snap.characters   || [];
      S.categories   = snap.categories   || {};
      S.affiliations = snap.affiliations || [];
      if (typeof Store !== 'undefined' && Store.normalize) Store.normalize();
      if (typeof render === 'function') render();
      ['updateUniverseScrollbar','updateUniToggleBar','updateCatFilterBar',
       'updateStatusFilterBar','updateTagFilterBar','updateToneFilterBar',
       'updateCharFilterSelect','updateStatsPanel'
      ].forEach(function (fn) { try { if (typeof window[fn] === 'function') window[fn](); } catch (_) {} });
      refreshUndoRedoButtons();
      refreshUniverseSwitcher();
    } finally { _isRestoring = false; }
  }

  function pushUndo() {
    if (_isRestoring) return;
    const snap = snapshot();
    if (!snap) return;
    undoStack.push(snap);
    if (undoStack.length > HIST_MAX) undoStack.shift();
    redoStack.length = 0;
    refreshUndoRedoButtons();
  }

  function refreshUndoRedoButtons() {
    const ub = document.getElementById('undo-btn');
    const rb = document.getElementById('redo-btn');
    if (ub) { ub.disabled = undoStack.length === 0; ub.style.opacity = ub.disabled ? '0.4' : '1'; }
    if (rb) { rb.disabled = redoStack.length === 0; rb.style.opacity = rb.disabled ? '0.4' : '1'; }
  }

  window.History = {
    push: pushUndo,
    undo: function () {
      if (undoStack.length === 0) { try { notify('Nothing to undo', 'info'); } catch (_) {} return; }
      const cur = snapshot();
      const prev = undoStack.pop();
      if (cur) redoStack.push(cur);
      restore(prev);
      try { notify('Undid last change \u21A9', 'info'); } catch (_) {}
    },
    redo: function () {
      if (redoStack.length === 0) { try { notify('Nothing to redo', 'info'); } catch (_) {} return; }
      const cur = snapshot();
      const next = redoStack.pop();
      if (cur) undoStack.push(cur);
      restore(next);
      try { notify('Redid change \u21AA', 'info'); } catch (_) {}
    },
    /* BE-13/UE-18: wipe both stacks at a full-data-replacement boundary
       (import / blank) so undo can never restore data from across it; the
       buttons then correctly grey out. */
    clear: function () { undoStack.length = 0; redoStack.length = 0; refreshUndoRedoButtons(); },
    size: function () { return { undo: undoStack.length, redo: redoStack.length }; }
  };

  /* ---------- 6.2  Autosave history (ft_uni_history_v1, max 10 FIFO) ---------- */
  const HIST_KEY = 'ft_uni_history_v1';
  const HIST_LIMIT = 10;

  function pushAutosaveHistory() {
    try {
      const raw = localStorage.getItem(HIST_KEY);
      let arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) arr = [];
      arr.push({ ts: Date.now(), state: snapshot() });
      while (arr.length > HIST_LIMIT) arr.shift();
      localStorage.setItem(HIST_KEY, JSON.stringify(arr));
    } catch (_) {}
  }

  /* ---------- 6.3  "Saved \u2713" toast (debounced 600ms) ---------- */
  let _saveToastTimer = null;
  function showSavedToast() {
    clearTimeout(_saveToastTimer);
    _saveToastTimer = setTimeout(function () {
      try { notify('Saved \u2713', 'success'); } catch (_) {}
    }, 600);
  }

  /* ---------- 6.4  Wrap Store.autosave to add history + toast + undo snapshot ---------- */
  if (typeof Store !== 'undefined' && typeof Store.autosave === 'function') {
    const _origAutosave = Store.autosave.bind(Store);
    Store.autosave = function () {
      pushUndo();
      const r = _origAutosave();
      pushAutosaveHistory();
      showSavedToast();
      refreshUniverseSwitcher();
      return r;
    };
  }

  /* ---------- 6.5  Universe Switcher (toolbar select) ---------- */
  const UNI_LIST_KEY = 'ft_uni_universes_v1';

  function readUniList() {
    try {
      const raw = localStorage.getItem(UNI_LIST_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) { return []; }
  }
  function writeUniList(list) {
    try { localStorage.setItem(UNI_LIST_KEY, JSON.stringify(list)); } catch (_) {}
  }
  function syncUniListFromState() {
    /* Mirror current S.universes into the persisted switcher list. */
    if (!Array.isArray(S.universes)) return;
    const list = S.universes.map(function (u) {
      return { id: u.id, name: u.name || 'Untitled', color: u.color || '#888' };
    });
    writeUniList(list);
    return list;
  }

  function buildSwitcher() {
    const tb = document.getElementById('toolbar');
    if (!tb || document.getElementById('uni-switcher')) return;
    const wrap = document.createElement('div');
    wrap.className = 'tb-group';
    wrap.style.cssText = 'display:inline-flex;align-items:center;gap:6px;margin-left:6px;';
    wrap.innerHTML =
      '<span class="tb-group-label" style="font-size:11px;color:rgba(0,210,255,0.55);white-space:nowrap;">\u269B Universe</span>' +
      '<select id="uni-switcher" aria-label="Switch universe" ' +
        'style="padding:6px 10px;border-radius:7px;background:rgba(10,12,24,0.7);' +
        'color:#cde;border:1px solid rgba(100,120,200,0.3);font:inherit;cursor:pointer;max-width:220px;">' +
      '</select>';
    /* Insert after the first .sep so it sits right after Navigation/Create. */
    const firstSep = tb.querySelector('.sep');
    if (firstSep && firstSep.nextSibling) tb.insertBefore(wrap, firstSep.nextSibling);
    else tb.appendChild(wrap);

    const sel = wrap.querySelector('#uni-switcher');
    sel.addEventListener('change', function () {
      const v = sel.value;
      if (v === '__new__') {
        sel.value = '';
        const name = (window.prompt && prompt('Name the new universe:', 'New Universe')) || '';
        if (!name.trim()) { refreshUniverseSwitcher(); return; }
        pushUndo();
        const color = PALETTE[(S.universes.length) % PALETTE.length];
        S.universes.push({ id: uid(), name: name.trim(), color: color, visible: true, description: '', notes: '' });
        if (typeof Store !== 'undefined' && Store.autosave) Store.autosave();
        if (typeof render === 'function') render();
        try { if (typeof updateUniToggleBar === 'function') updateUniToggleBar(); } catch (_) {}
        refreshUniverseSwitcher();
        try { notify('Universe created', 'success'); } catch (_) {}
        return;
      }
      /* Scroll the chosen universe into view by placing its track near the top. */
      const u = S.universes.find(function (x) { return x.id === v; });
      if (!u) return;
      try {
        const idx = getVisIdx(u.id);
        if (idx >= 0) { V.panY = -(idx * TRACK_H); if (typeof clampPanY === 'function') clampPanY(); }
        if (typeof render === 'function') render();
      } catch (_) {}
    });
    refreshUniverseSwitcher();
  }

  function refreshUniverseSwitcher() {
    const sel = document.getElementById('uni-switcher');
    if (!sel) return;
    syncUniListFromState();
    const list = readUniList();
    const cur = sel.value;
    let html = '<option value="" disabled' + (cur ? '' : ' selected') + '>Choose universe\u2026</option>';
    list.forEach(function (u) {
      html += '<option value="' + u.id + '">' + (u.name || 'Untitled').replace(/</g, '&lt;') + '</option>';
    });
    html += '<option value="__new__">+ New universe</option>';
    sel.innerHTML = html;
    if (cur && list.some(function (u) { return u.id === cur; })) sel.value = cur;
  }

  /* ---------- 6.6  "Clear filters" pill ---------- */
  function anyFilterActive() {
    return !!(
      (typeof _catFilter !== 'undefined' && _catFilter) ||
      (typeof _tagFilter !== 'undefined' && _tagFilter) ||
      (typeof _statusFilter !== 'undefined' && _statusFilter) ||
      (typeof _toneFilter !== 'undefined' && _toneFilter) ||
      (typeof _charFilterIds !== 'undefined' && _charFilterIds && _charFilterIds.length > 0)
    );
  }

  function clearAllFilters() {
    try { if (typeof _catFilter !== 'undefined')      _catFilter = null; } catch (_) {}
    try { if (typeof _tagFilter !== 'undefined')      _tagFilter = null; } catch (_) {}
    try { if (typeof _statusFilter !== 'undefined')   _statusFilter = null; } catch (_) {}
    try { if (typeof _toneFilter !== 'undefined')     _toneFilter = null; } catch (_) {}
    try { if (typeof _charFilterIds !== 'undefined')  _charFilterIds.length = 0; } catch (_) {}
    ['updateCatFilterBar','updateStatusFilterBar','updateTagFilterBar','updateToneFilterBar','updateCharFilterSelect']
      .forEach(function (fn) { try { if (typeof window[fn] === 'function') window[fn](); } catch (_) {} });
    if (typeof render === 'function') render();
    try { notify('Filters cleared', 'info'); } catch (_) {}
    refreshClearFiltersPill();
  }
  window.clearAllFilters = clearAllFilters;

  function buildClearFiltersPill() {
    if (document.getElementById('clear-filters-pill')) return;
    const wrap = document.getElementById('canvas-wrap');
    if (!wrap) return;
    const btn = document.createElement('button');
    btn.id = 'clear-filters-pill';
    btn.type = 'button';
    btn.textContent = '\u2715 Clear filters';
    btn.title = 'Remove all active category / tag / status / tone / character filters';
    btn.setAttribute('aria-label', 'Clear all active filters');
    btn.style.cssText =
      'position:absolute;top:10px;left:50%;transform:translateX(-50%);' +
      'display:none;z-index:9;padding:6px 14px;border-radius:100px;cursor:pointer;' +
      'background:linear-gradient(135deg,#4a8fde,#3a70c0);color:#fff;font:600 12px inherit;' +
      'border:1px solid rgba(255,255,255,0.18);box-shadow:0 4px 14px rgba(0,0,0,0.35);';
    btn.addEventListener('click', clearAllFilters);
    wrap.appendChild(btn);
  }

  function refreshClearFiltersPill() {
    const btn = document.getElementById('clear-filters-pill');
    if (!btn) return;
    btn.style.display = anyFilterActive() ? 'inline-block' : 'none';
  }
  window.refreshClearFiltersPill = refreshClearFiltersPill;

  /* Auto-poll for filter state changes (cheap; runs every 400ms). */
  setInterval(refreshClearFiltersPill, 400);

  /* ---------- 6.7  Init on DOM ready ---------- */
  function init() {
    buildSwitcher();
    buildClearFiltersPill();
    refreshUndoRedoButtons();
    /* Seed the very first undo snapshot so the user can revert their first edit. */
    if (undoStack.length === 0) { const s = snapshot(); if (s) undoStack.push(s); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

/* ============================================================================
 * ft-calendar.js — FreeTimeline custom / fantasy calendar engine (Phase A)
 * ----------------------------------------------------------------------------
 * AUTONOMOUS + INERT MODULE.
 *
 *   - Loads and runs entirely on its own. It does NOT touch, patch or read any
 *     other file. universe-timeline.js will be wired to it *later*, by hand,
 *     one seam at a time (parseDate / ruler labels).
 *   - Exposes a PURE public API on window.ftCalendar. No call here mutates the
 *     app's state; the only side effect is (a) writing localStorage when the
 *     user saves the settings panel, and (b) dispatching 'ftcalendarchange'.
 *
 * ZERO-REGRESSION CONTRACT
 *   When the definition is disabled (enabled === false, the default), EVERY
 *   function reproduces the *exact* current behaviour of universe-timeline.js:
 *     - 365 fixed days per year,
 *     - continuous value  yr + (mo-1)/12 + (da-1)/365   (parseDate),
 *     - year label 'N AD' for year > 0 and '|N| BC' for year < 0
 *       (formatCalendarYear, incl. the M / Bn abbreviations),
 *     - date display 'dd/mm/yyyy' (formatDateParts).
 *   Only when the user explicitly enables a custom calendar do the real month
 *   lengths / era names / moons take over.
 * ========================================================================== */
(function () {
  'use strict';

  /* Idempotency guard: never initialise twice. */
  if (window.__ftCalInit) { return; }
  window.__ftCalInit = true;

  var LS_KEY = 'ft_calendar_v1';
  var CHANGE_EVENT = 'ftcalendarchange';

  /* -------------------------------------------------------------------------
   * Small local helpers (self-contained — the module shares nothing with the
   * host app on purpose).
   * ---------------------------------------------------------------------- */
  function clampNum(v, lo, hi) {
    v = Number(v);
    if (isNaN(v)) v = lo;
    return v < lo ? lo : (v > hi ? hi : v);
  }
  function isFiniteNum(v) { return typeof v === 'number' && isFinite(v); }

  /* -------------------------------------------------------------------------
   * DEFAULT DEFINITION — the real Gregorian calendar, disabled.
   * The month lengths are the real ones (Feb = 28) so daysInYear() === 365,
   * matching the fixed 365 the host app uses today.
   * ---------------------------------------------------------------------- */
  function defaultDef() {
    return {
      enabled: false,
      name: 'Gregorian',
      months: [
        { name: 'January',   days: 31 },
        { name: 'February',  days: 28 },
        { name: 'March',     days: 31 },
        { name: 'April',     days: 30 },
        { name: 'May',       days: 31 },
        { name: 'June',      days: 30 },
        { name: 'July',      days: 31 },
        { name: 'August',    days: 31 },
        { name: 'September', days: 30 },
        { name: 'October',   days: 31 },
        { name: 'November',  days: 30 },
        { name: 'December',  days: 31 }
      ],
      weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      /* Eras that reproduce the current AD / BC behaviour. In default (disabled)
         mode these are informational only — yearLabel() special-cases disabled
         to be byte-identical to formatCalendarYear(). */
      eras: [
        { name: 'BC', startYear: -Infinity },
        { name: 'AD', startYear: 1 }
      ],
      yearZeroName: '',
      moons: []
    };
  }

  /* Deep-ish clone that is safe for our plain-data shapes. */
  function cloneDef(d) {
    try { return JSON.parse(JSON.stringify(d)); }
    catch (e) { return defaultDef(); }
  }

  /* -------------------------------------------------------------------------
   * Validation / sanitisation. A corrupted or partial stored object must never
   * throw and must never poison the engine — anything unusable falls back to
   * the corresponding default piece.
   * ---------------------------------------------------------------------- */
  function sanitizeDef(raw) {
    var def = defaultDef();
    if (!raw || typeof raw !== 'object') return def;

    try {
      var out = defaultDef();

      out.enabled = raw.enabled === true;
      out.name = (typeof raw.name === 'string') ? raw.name : def.name;
      out.yearZeroName = (typeof raw.yearZeroName === 'string') ? raw.yearZeroName : '';

      /* months: keep only valid {name, days>=1}; must have at least 1. */
      if (Array.isArray(raw.months) && raw.months.length) {
        var months = [];
        for (var i = 0; i < raw.months.length; i++) {
          var m = raw.months[i];
          if (!m || typeof m !== 'object') continue;
          var mn = (typeof m.name === 'string' && m.name.trim()) ? m.name : ('Month ' + (months.length + 1));
          var md = Math.round(clampNum(m.days, 1, 1000));
          months.push({ name: mn, days: md });
        }
        if (months.length) out.months = months;
      }

      if (Array.isArray(raw.weekdays) && raw.weekdays.length) {
        var wds = [];
        for (var w = 0; w < raw.weekdays.length; w++) {
          if (typeof raw.weekdays[w] === 'string' && raw.weekdays[w].trim()) wds.push(raw.weekdays[w]);
        }
        if (wds.length) out.weekdays = wds;
      }

      if (Array.isArray(raw.eras)) {
        var eras = [];
        for (var e = 0; e < raw.eras.length; e++) {
          var er = raw.eras[e];
          if (!er || typeof er !== 'object') continue;
          var enm = (typeof er.name === 'string') ? er.name : '';
          var sy = (er.startYear === -Infinity) ? -Infinity
                 : (isFiniteNum(er.startYear) ? Math.round(er.startYear)
                 : (isFiniteNum(parseInt(er.startYear, 10)) ? parseInt(er.startYear, 10) : 0));
          eras.push({ name: enm, startYear: sy });
        }
        /* Sort ascending by startYear so era lookup is a simple scan. */
        eras.sort(function (a, b) { return a.startYear - b.startYear; });
        out.eras = eras.length ? eras : def.eras;
      }

      if (Array.isArray(raw.moons)) {
        var moons = [];
        for (var k = 0; k < raw.moons.length; k++) {
          var mo = raw.moons[k];
          if (!mo || typeof mo !== 'object') continue;
          var period = clampNum(mo.period, 0.01, 1e7);
          if (!isFiniteNum(period)) continue;
          moons.push({
            name: (typeof mo.name === 'string') ? mo.name : ('Moon ' + (moons.length + 1)),
            period: period,
            offset: isFiniteNum(mo.offset) ? mo.offset : (parseFloat(mo.offset) || 0)
          });
        }
        out.moons = moons;
      }

      return out;
    } catch (err) {
      return def;
    }
  }

  /* -------------------------------------------------------------------------
   * State + persistence.
   * ---------------------------------------------------------------------- */
  var _def = null;              /* cached, always a sanitised object */
  var _listeners = [];          /* onChange callbacks */

  function loadFromStorage() {
    try {
      var rawStr = window.localStorage ? window.localStorage.getItem(LS_KEY) : null;
      if (!rawStr) return defaultDef();
      var parsed = JSON.parse(rawStr);
      return sanitizeDef(parsed);
    } catch (e) {
      return defaultDef();
    }
  }

  function def() {
    if (!_def) {
      try { _def = loadFromStorage(); }
      catch (e) { _def = defaultDef(); }
    }
    return _def;
  }

  function saveDef(next) {
    try {
      _def = sanitizeDef(next);
      try {
        if (window.localStorage) {
          window.localStorage.setItem(LS_KEY, JSON.stringify(_def));
        }
      } catch (e) { /* storage full / blocked — keep in-memory copy */ }
      emitChange();
      return _def;
    } catch (err) {
      return def();
    }
  }

  function emitChange() {
    var d = def();
    for (var i = 0; i < _listeners.length; i++) {
      try { _listeners[i](d); } catch (e) { /* isolate listener errors */ }
    }
    try {
      var ev;
      try { ev = new CustomEvent(CHANGE_EVENT, { detail: d }); }
      catch (e2) {
        ev = document.createEvent('CustomEvent');
        ev.initCustomEvent(CHANGE_EVENT, false, false, d);
      }
      window.dispatchEvent(ev);
    } catch (e) { /* no DOM — ignore */ }
  }

  function onChange(cb) {
    if (typeof cb !== 'function') return function () {};
    _listeners.push(cb);
    /* return an unsubscribe handle */
    return function () {
      var i = _listeners.indexOf(cb);
      if (i >= 0) _listeners.splice(i, 1);
    };
  }

  /* -------------------------------------------------------------------------
   * Calendar geometry helpers.
   * ---------------------------------------------------------------------- */
  function daysInYear() {
    try {
      var d = def();
      var sum = 0;
      for (var i = 0; i < d.months.length; i++) sum += d.months[i].days;
      return sum > 0 ? sum : 365;
    } catch (e) { return 365; }
  }

  function monthCount() {
    try { return def().months.length || 12; } catch (e) { return 12; }
  }

  function monthLen(m) {
    /* m is 1-based. */
    try {
      var d = def();
      var idx = clampNum(Math.round(m), 1, d.months.length) - 1;
      return d.months[idx].days;
    } catch (e) { return 30; }
  }

  function monthName(m) {
    try {
      var d = def();
      var idx = clampNum(Math.round(m), 1, d.months.length) - 1;
      return d.months[idx].name;
    } catch (e) { return 'Month ' + m; }
  }

  function weekdayName(i) {
    try {
      var d = def();
      if (!d.weekdays.length) return '';
      var n = d.weekdays.length;
      var idx = ((Math.round(i) % n) + n) % n;   /* wrap negatives */
      return d.weekdays[idx];
    } catch (e) { return ''; }
  }

  /* Cumulative days before month m (1-based) within a year. */
  function daysBeforeMonth(m) {
    var d = def();
    var idx = clampNum(Math.round(m), 1, d.months.length);
    var acc = 0;
    for (var i = 0; i < idx - 1; i++) acc += d.months[i].days;
    return acc;
  }

  /* -------------------------------------------------------------------------
   * partsToValue — continuous, MONOTONIC positioning number.
   *
   * DISABLED (default): byte-for-byte the current host formula
   *     yr + (mo-1)/12 + (da-1)/365
   * so no existing event ever shifts position when the module is inert.
   *
   * ENABLED: use the real month lengths — accumulate the days before the month
   * plus the day offset, divided by the true days-in-year. Still strictly
   * increasing across (year, month, day).
   * ---------------------------------------------------------------------- */
  function partsToValue(parts) {
    try {
      if (!parts) return 0;
      var yr = Math.round(Number(parts.year) || 0);
      var d = def();

      if (!d.enabled) {
        /* EXACT legacy behaviour (universe-timeline.js parseDate, sans time). */
        var moL = clampNum(parts.month, 1, 12);
        var daL = clampNum(parts.day, 1, 31);
        return yr + (moL - 1) / 12 + (daL - 1) / 365;
      }

      var nMonths = d.months.length;
      var mo = clampNum(Math.round(parts.month), 1, nMonths);
      var da = clampNum(Math.round(parts.day), 1, monthLen(mo));
      var diy = daysInYear();
      var dayOffset = daysBeforeMonth(mo) + (da - 1);
      return yr + dayOffset / diy;
    } catch (e) {
      return Math.round(Number(parts && parts.year) || 0);
    }
  }

  /* -------------------------------------------------------------------------
   * SEAM FOR PHASE B — frameYear(baseYear, frame)
   *
   * Phase A: pure IDENTITY. Returns baseYear untouched.
   *
   * Phase B will implement TIME DILATION by location: a place's proximity to
   * the centre of the universe stretches/compresses how many "base" years map
   * to a local year. The `frame` argument will describe the location's
   * reference (e.g. { dilation: 1.0, epoch: 0 } or a place id resolved to a
   * factor), and this function will convert a base-timeline year into that
   * location's local year *before* it is labelled. Keeping the transform here,
   * behind a single seam, means the ruler/label code only ever calls
   * frameYear()/yearLabel(year, {frame}) and never learns the dilation maths.
   * ---------------------------------------------------------------------- */
  function frameYear(baseYear, frame) {
    /* PHASE A: identity. `frame` is accepted and deliberately ignored. */
    return baseYear;
  }

  /* -------------------------------------------------------------------------
   * yearLabel(year, opts)
   *
   * DISABLED (default): byte-for-byte the host's formatCalendarYear() output
   *   ('N AD' / '|N| BC', with the K-thousands comma grouping and M / Bn
   *   abbreviations). opts.frame is applied through frameYear() first (identity
   *   in Phase A, so no change).
   *
   * ENABLED: resolve the matching era (largest startYear <= year) and append
   *   its name, e.g. '1200 T.E.'. yearZeroName handles the year-0 case.
   *
   * opts = { frame } (optional).
   * ---------------------------------------------------------------------- */
  function legacyYearLabel(yr) {
    /* Mirror of universe-timeline.js formatCalendarYear (line ~1511). */
    var abs = Math.abs(yr);
    var neg = yr < 0;
    var suf = neg ? ' BC' : ' AD';
    if (abs >= 1e9) {
      var v9 = abs / 1e9;
      var s9 = Math.abs(v9 - Math.round(v9)) < 0.05 ? String(Math.round(v9)) : v9.toFixed(1);
      return s9 + ' Bn' + suf;
    }
    if (abs >= 1e6) {
      var v6 = abs / 1e6;
      var s6 = Math.abs(v6 - Math.round(v6)) < 0.05 ? String(Math.round(v6)) : v6.toFixed(1);
      return s6 + ' M' + suf;
    }
    if (abs >= 1000) {
      return String(Math.round(abs)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + suf;
    }
    return String(Math.round(abs)) + suf;
  }

  function yearLabel(year, opts) {
    try {
      opts = opts || {};
      var yr = Math.round(Number(year) || 0);

      /* Apply the Phase-B seam first (identity in Phase A). */
      yr = frameYear(yr, opts.frame);

      var d = def();
      if (!d.enabled) {
        return legacyYearLabel(yr);
      }

      /* Year-zero override. */
      if (yr === 0 && d.yearZeroName) return d.yearZeroName;

      /* Find the era: the one with the greatest startYear that is <= yr.
         eras are kept sorted ascending by sanitizeDef(). */
      var era = null;
      for (var i = 0; i < d.eras.length; i++) {
        if (d.eras[i].startYear <= yr) era = d.eras[i];
        else break;
      }
      if (!era && d.eras.length) era = d.eras[0];

      var numStr = String(Math.abs(yr)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      if (era && era.name) return numStr + ' ' + era.name;
      return String(yr);
    } catch (e) {
      return String(Math.round(Number(year) || 0));
    }
  }

  /* -------------------------------------------------------------------------
   * formatParts({day, month, year})
   *
   * DISABLED (default): reproduce formatDateParts() -> 'dd/mm/yyyy'
   *   (zero-padded day and month, raw year).
   *
   * ENABLED: '<day> <MonthName>, <yearLabel>' e.g. '15 Frostmonth, 1200 T.E.'.
   * ---------------------------------------------------------------------- */
  function pad2(n) { return String(n).padStart(2, '0'); }

  function formatParts(parts, opts) {
    try {
      if (!parts) return '';
      var d = def();
      if (!d.enabled) {
        /* EXACT mirror of formatDateParts (universe-timeline.js line ~302). */
        return pad2(parts.day) + '/' + pad2(parts.month) + '/' + parts.year;
      }
      var mo = clampNum(Math.round(parts.month), 1, d.months.length);
      var da = clampNum(Math.round(parts.day), 1, monthLen(mo));
      return da + ' ' + monthName(mo) + ', ' + yearLabel(parts.year, opts);
    } catch (e) {
      try { return pad2(parts.day) + '/' + pad2(parts.month) + '/' + parts.year; }
      catch (e2) { return ''; }
    }
  }

  /* -------------------------------------------------------------------------
   * clampPart / validate — clamp a part against the calendar limits.
   *   kind: 'day' | 'month' | 'year'
   *   For 'day' you may pass the containing month as the 3rd arg so the day is
   *   clamped to that month's real length.
   * ---------------------------------------------------------------------- */
  function clampPart(kind, value, monthForDay) {
    try {
      if (kind === 'month') {
        return clampNum(Math.round(value), 1, monthCount());
      }
      if (kind === 'day') {
        var m = clampNum(Math.round(monthForDay || 1), 1, monthCount());
        return clampNum(Math.round(value), 1, monthLen(m));
      }
      if (kind === 'year') {
        return Math.round(Number(value) || 0);
      }
      return value;
    } catch (e) { return value; }
  }

  function validate(parts) {
    try {
      if (!parts || typeof parts !== 'object') return false;
      var yr = Number(parts.year);
      if (isNaN(yr)) return false;
      var m = Math.round(Number(parts.month));
      if (isNaN(m) || m < 1 || m > monthCount()) return false;
      var day = Math.round(Number(parts.day));
      if (isNaN(day) || day < 1 || day > monthLen(m)) return false;
      return true;
    } catch (e) { return false; }
  }

  /* =========================================================================
   * SETTINGS PANEL (openSettings)
   * Accessible modal dialog (role="dialog", Escape to close, focus trap /
   * restore). English UI. Uses var(--v-panel, ...) / var(--v-ink, ...) with
   * safe fallbacks. NO floating button is added — the host wires the entry
   * point (a menu item) later.
   * ====================================================================== */
  var _panel = null;
  var _prevFocus = null;
  var _keyHandler = null;
  var _draft = null;   /* working copy while the panel is open */

  function injectPanelStyle() {
    if (document.getElementById('ft-cal-style')) return;
    var s = document.createElement('style');
    s.id = 'ft-cal-style';
    s.textContent = [
      '#ft-cal-overlay{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;',
      'justify-content:center;background:rgba(0,0,0,0.55);backdrop-filter:blur(3px);',
      'padding:20px;font-family:-apple-system,"Segoe UI",system-ui,sans-serif;}',
      '#ft-cal-overlay[hidden]{display:none;}',
      '#ft-cal-dialog{width:560px;max-width:100%;max-height:calc(100vh - 40px);overflow:auto;',
      'background:var(--v-panel,#12162b);color:var(--v-ink,#eaf0ff);border-radius:16px;',
      'border:1px solid var(--v-bd,rgba(255,255,255,0.14));box-shadow:0 20px 60px rgba(0,0,0,0.6);',
      'padding:22px;box-sizing:border-box;}',
      '#ft-cal-dialog h2{font-size:18px;font-weight:800;margin:0 0 2px;}',
      '#ft-cal-dialog .ftc-sub{font-size:12px;color:var(--v-ink-dim,#b6c0e0);margin:0 0 16px;}',
      '#ft-cal-dialog .ftc-sec{margin:0 0 18px;}',
      '#ft-cal-dialog .ftc-lbl{display:block;font-size:11px;font-weight:700;text-transform:uppercase;',
      'letter-spacing:.6px;color:var(--v-ink-dim,#b6c0e0);margin:0 0 8px;}',
      '#ft-cal-dialog input[type=text],#ft-cal-dialog input[type=number]{background:rgba(255,255,255,0.06);',
      'border:1px solid var(--v-bd,rgba(255,255,255,0.16));color:var(--v-ink,#eaf0ff);border-radius:8px;',
      'padding:7px 9px;font:inherit;font-size:13px;box-sizing:border-box;}',
      '#ft-cal-dialog input[type=text]{width:100%;}',
      '#ft-cal-dialog .ftc-row{display:flex;gap:8px;align-items:center;margin:0 0 6px;}',
      '#ft-cal-dialog .ftc-row input[type=text]{flex:1 1 auto;}',
      '#ft-cal-dialog .ftc-row input.ftc-days{width:78px;flex:0 0 auto;}',
      '#ft-cal-dialog .ftc-row input.ftc-yr{width:110px;flex:0 0 auto;}',
      '#ft-cal-dialog .ftc-toggle{display:flex;align-items:center;gap:9px;font-size:14px;font-weight:600;}',
      '#ft-cal-dialog button{font:inherit;cursor:pointer;border-radius:8px;border:1px solid var(--v-bd,rgba(255,255,255,0.16));',
      'background:rgba(255,255,255,0.06);color:var(--v-ink,#eaf0ff);padding:7px 12px;font-size:13px;font-weight:600;',
      'transition:background .12s,border-color .12s;}',
      '#ft-cal-dialog button:hover{background:rgba(255,255,255,0.12);}',
      '#ft-cal-dialog button.ftc-x{padding:4px 9px;font-size:14px;line-height:1;}',
      '#ft-cal-dialog button.ftc-add{font-size:12px;margin-top:4px;}',
      '#ft-cal-dialog .ftc-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;',
      'margin-top:22px;border-top:1px solid var(--v-bd,rgba(255,255,255,0.12));padding-top:16px;}',
      '#ft-cal-dialog button.ftc-primary{background:var(--v-accent,#4f7cff);border-color:transparent;color:#fff;font-weight:800;}',
      '#ft-cal-dialog button.ftc-primary:hover{filter:brightness(1.1);}',
      '#ft-cal-dialog button.ftc-danger{color:#ffb4b4;}',
      '#ft-cal-dialog .ftc-reset{margin-right:auto;}',
      '#ft-cal-dialog :focus-visible{outline:3px solid #8fd3ff;outline-offset:2px;}',
      '#ft-cal-dialog .ftc-hint{font-size:11px;color:var(--v-ink-dim,#b6c0e0);margin:6px 0 0;}'
    ].join('');
    document.head.appendChild(s);
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!attrs.hasOwnProperty(k)) continue;
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else node.setAttribute(k, attrs[k]);
      }
    }
    if (children) {
      for (var i = 0; i < children.length; i++) {
        if (children[i]) node.appendChild(children[i]);
      }
    }
    return node;
  }

  function buildBody(dialog) {
    dialog.innerHTML = '';
    var d = _draft;

    /* Header */
    dialog.appendChild(el('h2', { id: 'ft-cal-title', text: 'Calendar Settings' }));
    dialog.appendChild(el('p', { class: 'ftc-sub',
      text: 'Design a custom / fantasy calendar. When disabled, the timeline behaves exactly as the default Gregorian calendar.' }));

    /* Enable toggle + name */
    var enableWrap = el('div', { class: 'ftc-sec' });
    var toggleLabel = el('label', { class: 'ftc-toggle' });
    var chk = el('input', { type: 'checkbox' });
    chk.checked = !!d.enabled;
    chk.addEventListener('change', function () { d.enabled = chk.checked; });
    toggleLabel.appendChild(chk);
    toggleLabel.appendChild(document.createTextNode('Enable custom calendar'));
    enableWrap.appendChild(toggleLabel);
    dialog.appendChild(enableWrap);

    var nameSec = el('div', { class: 'ftc-sec' });
    nameSec.appendChild(el('label', { class: 'ftc-lbl', for: 'ftc-name', text: 'Calendar name' }));
    var nameIn = el('input', { type: 'text', id: 'ftc-name', value: d.name || '' });
    nameIn.addEventListener('input', function () { d.name = nameIn.value; });
    nameSec.appendChild(nameIn);
    dialog.appendChild(nameSec);

    /* Months */
    var monthsSec = el('div', { class: 'ftc-sec' });
    monthsSec.appendChild(el('span', { class: 'ftc-lbl', text: 'Months (name + days)' }));
    var monthsList = el('div', {});
    monthsSec.appendChild(monthsList);
    function renderMonths() {
      monthsList.innerHTML = '';
      d.months.forEach(function (m, idx) {
        var row = el('div', { class: 'ftc-row' });
        var nm = el('input', { type: 'text', value: m.name, 'aria-label': 'Month ' + (idx + 1) + ' name' });
        nm.addEventListener('input', function () { m.name = nm.value; });
        var dys = el('input', { type: 'number', min: '1', max: '1000', value: String(m.days), 'aria-label': 'Month ' + (idx + 1) + ' days' });
        dys.className = 'ftc-days';
        dys.addEventListener('input', function () { m.days = Math.round(clampNum(dys.value, 1, 1000)); });
        var del = el('button', { type: 'button', class: 'ftc-x ftc-danger', 'aria-label': 'Remove month ' + (idx + 1), text: '×' });
        del.addEventListener('click', function () {
          if (d.months.length <= 1) return;   /* keep at least one month */
          d.months.splice(idx, 1);
          renderMonths();
        });
        row.appendChild(nm); row.appendChild(dys); row.appendChild(del);
        monthsList.appendChild(row);
      });
    }
    renderMonths();
    var addMonth = el('button', { type: 'button', class: 'ftc-add', text: '+ Add month' });
    addMonth.addEventListener('click', function () {
      d.months.push({ name: 'Month ' + (d.months.length + 1), days: 30 });
      renderMonths();
    });
    monthsSec.appendChild(addMonth);
    dialog.appendChild(monthsSec);

    /* Weekdays */
    var wdSec = el('div', { class: 'ftc-sec' });
    wdSec.appendChild(el('span', { class: 'ftc-lbl', text: 'Weekday names' }));
    var wdList = el('div', {});
    wdSec.appendChild(wdList);
    function renderWeekdays() {
      wdList.innerHTML = '';
      d.weekdays.forEach(function (w, idx) {
        var row = el('div', { class: 'ftc-row' });
        var nm = el('input', { type: 'text', value: w, 'aria-label': 'Weekday ' + (idx + 1) });
        nm.addEventListener('input', function () { d.weekdays[idx] = nm.value; });
        var del = el('button', { type: 'button', class: 'ftc-x ftc-danger', 'aria-label': 'Remove weekday ' + (idx + 1), text: '×' });
        del.addEventListener('click', function () {
          if (d.weekdays.length <= 1) return;
          d.weekdays.splice(idx, 1);
          renderWeekdays();
        });
        row.appendChild(nm); row.appendChild(del);
        wdList.appendChild(row);
      });
    }
    renderWeekdays();
    var addWd = el('button', { type: 'button', class: 'ftc-add', text: '+ Add weekday' });
    addWd.addEventListener('click', function () {
      d.weekdays.push('Day ' + (d.weekdays.length + 1));
      renderWeekdays();
    });
    wdSec.appendChild(addWd);
    dialog.appendChild(wdSec);

    /* Eras */
    var eraSec = el('div', { class: 'ftc-sec' });
    eraSec.appendChild(el('span', { class: 'ftc-lbl', text: 'Eras (name + start year)' }));
    var eraList = el('div', {});
    eraSec.appendChild(eraList);
    function renderEras() {
      eraList.innerHTML = '';
      d.eras.forEach(function (er, idx) {
        var row = el('div', { class: 'ftc-row' });
        var nm = el('input', { type: 'text', value: er.name, 'aria-label': 'Era ' + (idx + 1) + ' name' });
        nm.addEventListener('input', function () { er.name = nm.value; });
        var startVal = (er.startYear === -Infinity) ? '' : String(er.startYear);
        var yr = el('input', { type: 'number', value: startVal, placeholder: 'start year', 'aria-label': 'Era ' + (idx + 1) + ' start year' });
        yr.className = 'ftc-yr';
        yr.addEventListener('input', function () {
          var v = parseInt(yr.value, 10);
          er.startYear = isNaN(v) ? -Infinity : v;
        });
        var del = el('button', { type: 'button', class: 'ftc-x ftc-danger', 'aria-label': 'Remove era ' + (idx + 1), text: '×' });
        del.addEventListener('click', function () {
          d.eras.splice(idx, 1);
          renderEras();
        });
        row.appendChild(nm); row.appendChild(yr); row.appendChild(del);
        eraList.appendChild(row);
      });
    }
    renderEras();
    var addEra = el('button', { type: 'button', class: 'ftc-add', text: '+ Add era' });
    addEra.addEventListener('click', function () {
      d.eras.push({ name: 'Era', startYear: 1 });
      renderEras();
    });
    eraSec.appendChild(addEra);
    dialog.appendChild(eraSec);

    /* Year-zero name */
    var yzSec = el('div', { class: 'ftc-sec' });
    yzSec.appendChild(el('label', { class: 'ftc-lbl', for: 'ftc-yz', text: 'Year-zero name (optional)' }));
    var yzIn = el('input', { type: 'text', id: 'ftc-yz', value: d.yearZeroName || '', placeholder: 'e.g. The Founding' });
    yzIn.addEventListener('input', function () { d.yearZeroName = yzIn.value; });
    yzSec.appendChild(yzIn);
    dialog.appendChild(yzSec);

    /* Actions */
    var actions = el('div', { class: 'ftc-actions' });
    var resetBtn = el('button', { type: 'button', class: 'ftc-reset', text: 'Reset to Gregorian' });
    resetBtn.addEventListener('click', function () {
      _draft = defaultDef();
      buildBody(dialog);
      focusFirst(dialog);
    });
    var cancelBtn = el('button', { type: 'button', text: 'Cancel' });
    cancelBtn.addEventListener('click', closeSettings);
    var saveBtn = el('button', { type: 'button', class: 'ftc-primary', text: 'Save' });
    saveBtn.addEventListener('click', function () {
      saveDef(_draft);
      closeSettings();
    });
    actions.appendChild(resetBtn);
    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
    dialog.appendChild(actions);
  }

  function focusFirst(dialog) {
    var f = dialog.querySelector('input,button,[tabindex]');
    if (f) { try { f.focus(); } catch (e) {} }
  }

  function trapTab(e, dialog) {
    if (e.key !== 'Tab') return;
    var focusables = dialog.querySelectorAll('input,button,[tabindex]:not([tabindex="-1"])');
    if (!focusables.length) return;
    var first = focusables[0];
    var last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }

  function openSettings() {
    try {
      if (_panel) return;   /* already open */
      injectPanelStyle();
      _prevFocus = document.activeElement;
      _draft = cloneDef(def());

      var overlay = el('div', { id: 'ft-cal-overlay' });
      var dialog = el('div', {
        id: 'ft-cal-dialog',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'ft-cal-title',
        tabindex: '-1'
      });
      overlay.appendChild(dialog);
      overlay.addEventListener('mousedown', function (e) {
        if (e.target === overlay) closeSettings();   /* click backdrop = cancel */
      });

      buildBody(dialog);
      document.body.appendChild(overlay);
      _panel = overlay;

      _keyHandler = function (e) {
        if (e.key === 'Escape') { e.preventDefault(); closeSettings(); return; }
        trapTab(e, dialog);
      };
      document.addEventListener('keydown', _keyHandler, true);

      focusFirst(dialog);
    } catch (err) {
      /* Panel is a nicety — never let it break the host. */
      try { if (_panel) closeSettings(); } catch (e) {}
    }
  }

  function closeSettings() {
    try {
      if (_keyHandler) { document.removeEventListener('keydown', _keyHandler, true); _keyHandler = null; }
      if (_panel && _panel.parentNode) _panel.parentNode.removeChild(_panel);
      _panel = null;
      _draft = null;
      if (_prevFocus && _prevFocus.focus) { try { _prevFocus.focus(); } catch (e) {} }
      _prevFocus = null;
    } catch (err) { _panel = null; }
  }

  /* -------------------------------------------------------------------------
   * Public API.
   * ---------------------------------------------------------------------- */
  window.ftCalendar = {
    /* definition + persistence */
    def: def,
    save: saveDef,
    onChange: onChange,

    /* geometry */
    daysInYear: daysInYear,
    monthCount: monthCount,
    monthLen: monthLen,
    monthName: monthName,
    weekdayName: weekdayName,

    /* positioning + labels */
    partsToValue: partsToValue,
    yearLabel: yearLabel,
    formatParts: formatParts,

    /* validation */
    clampPart: clampPart,
    validate: validate,

    /* Phase-B seam */
    frameYear: frameYear,

    /* UI */
    openSettings: openSettings,
    closeSettings: closeSettings,

    /* constants (handy for tests / host wiring) */
    STORAGE_KEY: LS_KEY,
    CHANGE_EVENT: CHANGE_EVENT
  };

  /* Prime the cached definition once at load (defensive, never throws). */
  try { def(); } catch (e) { _def = defaultDef(); }
})();

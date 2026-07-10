/* FreeTimeline — Places & custom world map (shared by Universe and Biography).

   The user defines Places (name, icon, colour, optional parent region), uploads
   their OWN map image (Middle-earth, Lusitânia, a hand-drawn campaign map…) and
   pins Places onto it. Clicking a pin shows that place's events and can filter
   the timeline. With no image uploaded the view renders an abstract card grid,
   so the feature is useful from the first Place created.

   Storage: the map image lives in IndexedDB (db "ft-maps", one record per app
   storage key) as a Blob, compressed at upload (≤2048px, JPEG q0.82). Only
   S.places / S.mapMeta go through localStorage. Export embeds the image as a
   dataURL (validated on import by ft-import-validate.js).

   The engine integrates via ftPlaces.init(cfg) — see CFG below. This module
   never touches engine state except through the provided callbacks. */
(function () {
  'use strict';
  if (window.ftPlaces) return;

  var CFG = null;      /* set by init():
    { kind: 'universe'|'biography',
      storageKey: string,                    // IDB record key (use the app's localStorage key)
      getS: function() -> S,                 // live state; S.places[] and S.mapMeta are owned here
      autosave: function(),                  // persist S
      notify: function(msg),
      jumpToEvent: function(ev),             // focus this event on the timeline view
      setPlaceFilter: function(placeId|null),// engine's timeline place-filter (optional)
      eventDateLabel: function(ev) -> string,// short date label (optional)
      accent: '#4a8fde' }                    // optional accent colour */

  function S() { return CFG.getS(); }
  function places() { var s = S(); if (!Array.isArray(s.places)) s.places = []; return s.places; }
  function mapMeta() {
    var s = S();
    if (!s.mapMeta || typeof s.mapMeta !== 'object') s.mapMeta = { has: false, w: 0, h: 0, name: '' };
    return s.mapMeta;
  }
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function uid() { return 'p_' + Math.random().toString(36).slice(2, 10); }
  function byId(id) { return places().find(function (p) { return p.id === id; }) || null; }
  function eventsAt(placeId) {
    var evs = (S().events || []).filter(function (ev) {
      return Array.isArray(ev.placeIds) && ev.placeIds.indexOf(placeId) !== -1;
    });
    return evs;
  }

  /* ============================ IndexedDB map store ============================ */
  var mapStore = (function () {
    var DB = 'ft-maps', ST = 'maps';
    function withDb(fn, fail) {
      try {
        var rq = indexedDB.open(DB, 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore(ST); };
        rq.onsuccess = function () { fn(rq.result); };
        rq.onerror = function () { fail(rq.error); };
      } catch (e) { fail(e); }
    }
    function get(key) {
      return new Promise(function (res) {
        withDb(function (db) {
          var tx = db.transaction(ST, 'readonly').objectStore(ST).get(key);
          tx.onsuccess = function () { res(tx.result || null); };
          tx.onerror = function () { res(null); };
        }, function () { res(null); });
      });
    }
    function set(key, blob) {
      return new Promise(function (res) {
        withDb(function (db) {
          var tx = db.transaction(ST, 'readwrite').objectStore(ST).put(blob, key);
          tx.onsuccess = function () { res(true); };
          tx.onerror = function () { res(false); };
        }, function () { res(false); });
      });
    }
    function del(key) {
      return new Promise(function (res) {
        withDb(function (db) {
          var tx = db.transaction(ST, 'readwrite').objectStore(ST).delete(key);
          tx.onsuccess = function () { res(true); };
          tx.onerror = function () { res(false); };
        }, function () { res(false); });
      });
    }
    return { get: get, set: set, del: del };
  })();

  /* Compress an image File/Blob/dataURL to ≤MAXPX JPEG q0.82. Resolves {blob,w,h}. */
  var MAXPX = 2048, MAXBYTES = 4 * 1024 * 1024;
  function compressImage(src) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h) return rej(new Error('Unreadable image.'));
        var sc = Math.min(1, MAXPX / Math.max(w, h));
        var cw = Math.round(w * sc), ch = Math.round(h * sc);
        var cv = document.createElement('canvas');
        cv.width = cw; cv.height = ch;
        cv.getContext('2d').drawImage(img, 0, 0, cw, ch);
        cv.toBlob(function (blob) {
          if (!blob) return rej(new Error('Compression failed.'));
          if (blob.size > MAXBYTES) return rej(new Error('Map image is too large even after compression (>4MB). Use a smaller image.'));
          res({ blob: blob, w: cw, h: ch });
        }, 'image/jpeg', 0.82);
      };
      img.onerror = function () { rej(new Error('Could not load that image.')); };
      if (typeof src === 'string') img.src = src;
      else img.src = URL.createObjectURL(src);
    });
  }
  function blobToDataUrl(blob) {
    return new Promise(function (res) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result || '')); };
      r.onerror = function () { res(''); };
      r.readAsDataURL(blob);
    });
  }

  /* ============================ view state ============================ */
  var root = null;               // container element (given per render)
  var view = { sc: 1, px: 0, py: 0, sel: null, arming: false, mapUrl: '' };
  var _objUrl = '';

  function persist() { try { CFG.autosave(); } catch (_) {} }
  function note(m) { try { CFG.notify(m); } catch (_) {} }

  /* ============================ styles ============================ */
  var cssDone = false;
  function ensureCss() {
    if (cssDone) return;
    cssDone = true;
    var acc = (CFG && CFG.accent) || '#4a8fde';
    var st = document.createElement('style');
    st.textContent =
      '.ftp-wrap{display:flex;height:100%;min-height:0;gap:0}' +
      '.ftp-main{flex:1 1 auto;display:flex;flex-direction:column;min-width:0}' +
      '.ftp-bar{display:flex;align-items:center;gap:8px;padding:10px 12px;flex-wrap:wrap}' +
      '.ftp-bar .ftp-hint{font-size:11.5px;opacity:.65;margin-left:auto}' +
      '.ftp-timebar{display:flex;align-items:center;gap:12px;padding:8px 14px;background:rgba(128,128,128,.10);border-bottom:1px solid rgba(128,128,128,.18)}' +
      '.ftp-time-lbl{font-size:13px;font-weight:700;min-width:150px;font-variant-numeric:tabular-nums}' +
      '.ftp-timebar input[type=range]{flex:1;accent-color:#4a8fde;cursor:pointer}' +
      '.ftp-btn{border:1px solid rgba(128,128,128,.4);background:rgba(128,128,128,.12);color:inherit;' +
        'border-radius:8px;padding:6px 12px;font-size:12.5px;font-weight:600;cursor:pointer}' +
      '.ftp-btn:hover{background:rgba(128,128,128,.22)}' +
      '.ftp-btn.acc{background:' + acc + ';border-color:' + acc + ';color:#fff}' +
      '.ftp-btn.danger{border-color:rgba(220,80,80,.5);color:#e07070}' +
      '.ftp-mapbox{flex:1 1 auto;position:relative;overflow:hidden;min-height:0;cursor:grab;' +
        'background:repeating-conic-gradient(rgba(128,128,128,.06) 0 25%,transparent 0 50%) 0 0/28px 28px}' +
      '.ftp-mapbox.arming{cursor:crosshair}' +
      '.ftp-inner{position:absolute;top:0;left:0;transform-origin:0 0}' +
      '.ftp-inner img{display:block;max-width:none;user-select:none;-webkit-user-drag:none;pointer-events:none}' +
      '.ftp-pin{position:absolute;transform:translate(-50%,-100%);background:transparent;border:0;' +
        'cursor:pointer;padding:0;text-align:center;font-size:22px;line-height:1}' +
      '.ftp-pin .ftp-pin-lbl{display:block;font-size:10.5px;font-weight:700;white-space:nowrap;' +
        'background:rgba(10,14,26,.72);color:#fff;border-radius:6px;padding:1px 6px;margin-top:1px}' +
      '.ftp-pin.sel .ftp-pin-lbl{outline:2px solid ' + acc + '}' +
      '.ftp-zoom{position:absolute;right:12px;bottom:12px;display:flex;gap:6px;z-index:5}' +
      '.ftp-grid{flex:1 1 auto;overflow-y:auto;display:grid;gap:10px;padding:12px;align-content:start;' +
        'grid-template-columns:repeat(auto-fill,minmax(170px,1fr))}' +
      '.ftp-card{border:1px solid rgba(128,128,128,.35);border-radius:11px;padding:10px 12px;cursor:pointer;' +
        'background:rgba(128,128,128,.08);text-align:left;color:inherit}' +
      '.ftp-card:hover{background:rgba(128,128,128,.16)}' +
      '.ftp-card.sel{outline:2px solid ' + acc + '}' +
      '.ftp-card .ftp-card-name{font-weight:700;font-size:13.5px;display:flex;align-items:center;gap:7px}' +
      '.ftp-card .ftp-card-count{font-size:11.5px;opacity:.65;margin-top:3px}' +
      '.ftp-card .ftp-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}' +
      '.ftp-card.child{margin-left:16px}' +
      '.ftp-side{width:290px;flex-shrink:0;border-left:1px solid rgba(128,128,128,.25);overflow-y:auto;' +
        'padding:12px;display:flex;flex-direction:column;gap:9px}' +
      '.ftp-side h3{margin:0;font-size:15px;display:flex;align-items:center;gap:8px}' +
      '.ftp-side .ftp-desc{font-size:12.5px;opacity:.8;white-space:pre-wrap}' +
      '.ftp-evrow{display:block;width:100%;text-align:left;border:1px solid rgba(128,128,128,.3);' +
        'background:rgba(128,128,128,.08);color:inherit;border-radius:8px;padding:7px 9px;cursor:pointer;font-size:12.5px}' +
      '.ftp-evrow:hover{background:rgba(128,128,128,.18)}' +
      '.ftp-evrow .ftp-evdate{opacity:.6;font-size:11px;display:block}' +
      '.ftp-empty{padding:40px 20px;text-align:center;opacity:.7;font-size:13.5px;max-width:420px;margin:0 auto}' +
      '.ftp-ed-scrim{position:fixed;inset:0;z-index:940;background:rgba(8,10,18,.55)}' +
      '.ftp-ed{position:fixed;z-index:941;top:14vh;left:50%;transform:translateX(-50%);width:min(420px,92vw);' +
        'background:var(--ftp-panel,#181f33);color:var(--ftp-ink,#e8edf8);border:1px solid rgba(128,128,128,.35);' +
        'border-radius:14px;padding:16px;box-shadow:0 24px 60px rgba(0,0,0,.45)}' +
      '.ftp-ed h3{margin:0 0 12px}' +
      '.ftp-ed label{display:block;font-size:11.5px;font-weight:700;opacity:.75;margin:9px 0 3px}' +
      '.ftp-ed input,.ftp-ed select,.ftp-ed textarea{width:100%;box-sizing:border-box;background:rgba(128,128,128,.12);' +
        'border:1px solid rgba(128,128,128,.35);border-radius:8px;color:inherit;padding:7px 9px;font-size:13px}' +
      '.ftp-ed textarea{min-height:70px;resize:vertical}' +
      '.ftp-ed .ftp-ed-row{display:flex;gap:8px}.ftp-ed .ftp-ed-row>div{flex:1}' +
      '.ftp-ed .ftp-ed-actions{display:flex;gap:8px;margin-top:14px;justify-content:flex-end}' +
      '.ftp-symgrid{display:flex;flex-wrap:wrap;gap:4px;max-height:148px;overflow:auto;padding:6px;border:1px solid rgba(128,128,128,.3);border-radius:8px;background:rgba(128,128,128,.08);margin-top:3px}' +
      '.ftp-sym{width:34px;height:34px;display:grid;place-items:center;border:1px solid transparent;border-radius:7px;background:transparent;color:inherit;cursor:pointer;padding:0}' +
      '.ftp-sym:hover{background:rgba(128,128,128,.18)}' +
      '.ftp-sym.on{border-color:#4a8fde;background:rgba(74,143,222,.18)}' +
      '.ftp-sym.none{font-size:14px;opacity:.6}' +
      '.ftp-sym svg{width:22px;height:22px}' +
      '.ftp-pin-sym{display:inline-flex;align-items:center;justify-content:center}.ftp-pin-sym svg{width:22px;height:22px}' +
      '@media(max-width:767px){.ftp-wrap{flex-direction:column}.ftp-side{width:auto;border-left:0;' +
        'border-top:1px solid rgba(128,128,128,.25);max-height:45%}}';
    document.head.appendChild(st);
    /* theme vars for the editor dialog */
    var lumm = (getComputedStyle(document.body).backgroundColor || '').match(/\d+/g);
    var isDark = !lumm || (0.299 * +lumm[0] + 0.587 * +lumm[1] + 0.114 * +lumm[2]) < 128;
    document.documentElement.style.setProperty('--ftp-panel', isDark ? '#181f33' : '#fffdf8');
    document.documentElement.style.setProperty('--ftp-ink', isDark ? '#e8edf8' : '#3d2b1f');
  }

  /* ============================ main render ============================ */
  function renderMapView(container) {
    ensureCss();
    root = container;
    root.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'ftp-wrap';
    var main = document.createElement('div');
    main.className = 'ftp-main';
    wrap.appendChild(main);

    /* --- top bar --- */
    var bar = document.createElement('div');
    bar.className = 'ftp-bar';
    var addB = mkBtn('＋ Place', 'acc', function () { openPlaceEditor(null); });
    bar.appendChild(addB);
    /* One calm set of choices: draw it, generate a base, or bring your own.
       The heavy Azgaar studio is tucked behind "Advanced" so it doesn't overwhelm. */
    if (window.ftSketch) { bar.appendChild(mkBtn('✏️ Draw map', 'acc', openSketch)); }
    if (window.ftMapGen) { bar.appendChild(mkBtn('✨ Quick map', '', openMapGen)); }
    var upB = mkBtn(mapMeta().has ? 'Replace image' : '⬆ Upload image', '', pickImage);
    bar.appendChild(upB);
    if (mapMeta().has) {
      bar.appendChild(mkBtn('Remove map', 'danger', removeImage));
    }
    if (window.ftAzgaar || window.ftMapPaint) {
      bar.appendChild(mkBtn('⚙ Advanced', '', openAdvancedMap));
    }
    var hint = document.createElement('span');
    hint.className = 'ftp-hint';
    hint.textContent = mapMeta().has
      ? 'Scroll to zoom · drag to pan · click a pin for its events'
      : 'Upload your own world map (it stays on this device) — or use the place grid below';
    bar.appendChild(hint);
    main.appendChild(bar);

    /* --- P3: time scrubber — watch the map change across its epochs --- */
    (function () {
      var eps = S().mapEpochs || [];
      if (eps.length < 2 || !mapMeta().has || !(window.ftMapPaint && window.ftMapPaint.renderEpoch)) return;
      var tbar = document.createElement('div'); tbar.className = 'ftp-timebar';
      var lbl = document.createElement('span'); lbl.className = 'ftp-time-lbl';
      var slider = document.createElement('input'); slider.type = 'range'; slider.min = 0; slider.max = eps.length - 1; slider.step = 1;
      slider.value = Math.min(eps.length - 1, S().mapEpochIndex || (eps.length - 1));
      slider.setAttribute('aria-label', 'Scrub the map through time');
      function show(i) {
        var ep = eps[i]; if (!ep) return;
        lbl.textContent = '⏳ ' + (ep.year || ep.label || ('Epoch ' + (i + 1)));
        var cv = document.createElement('canvas'); cv.width = 1200; cv.height = 840;
        window.ftMapPaint.renderEpoch(cv, ep, 'relief');
        var im = main.querySelector('.ftp-mapbox img'); if (im) im.src = cv.toDataURL('image/png');
      }
      slider.addEventListener('input', function () { show(+this.value); });
      tbar.appendChild(lbl); tbar.appendChild(slider);
      main.appendChild(tbar);
      setTimeout(function () { show(+slider.value); }, 80);
    })();

    /* --- map or grid --- */
    if (mapMeta().has) {
      main.appendChild(buildMapBox());
    } else {
      main.appendChild(buildGrid());
    }

    /* --- side panel --- */
    if (view.sel && byId(view.sel)) wrap.appendChild(buildSide(byId(view.sel)));
    root.appendChild(wrap);

    if (!places().length && !mapMeta().has) {
      var em = document.createElement('div');
      em.className = 'ftp-empty';
      em.innerHTML = '<b>No places yet.</b><br>Create your first Place with <b>＋ Place</b>, link events to it from the event editor, ' +
        'and optionally upload your own map image to pin places onto it.';
      main.appendChild(em);
    }
  }

  function mkBtn(label, cls, fn) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'ftp-btn' + (cls ? ' ' + cls : '');
    b.textContent = label;
    b.addEventListener('click', fn);
    return b;
  }

  /* ---------- image map ---------- */
  function buildMapBox() {
    var box = document.createElement('div');
    box.className = 'ftp-mapbox' + (view.arming ? ' arming' : '');
    box.setAttribute('aria-label', 'World map with place pins');
    var inner = document.createElement('div');
    inner.className = 'ftp-inner';
    box.appendChild(inner);

    var img = document.createElement('img');
    img.alt = mapMeta().name || 'Custom world map';
    inner.appendChild(img);
    ensureMapUrl().then(function (url) {
      if (url) { img.src = url; img.onload = function () { placePins(inner); applyT(inner); }; }
    });

    function applyT(el) {
      el.style.transform = 'translate(' + view.px + 'px,' + view.py + 'px) scale(' + view.sc + ')';
      /* counter-scale pins so they stay readable */
      Array.prototype.forEach.call(el.querySelectorAll('.ftp-pin'), function (p) {
        p.style.transform = 'translate(-50%,-100%) scale(' + (1 / view.sc) + ')';
      });
    }

    /* wheel zoom around cursor */
    box.addEventListener('wheel', function (e) {
      e.preventDefault();
      var r = box.getBoundingClientRect();
      var mx = e.clientX - r.left, my = e.clientY - r.top;
      var f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      var ns = Math.min(8, Math.max(0.2, view.sc * f));
      f = ns / view.sc;
      view.px = mx - (mx - view.px) * f;
      view.py = my - (my - view.py) * f;
      view.sc = ns;
      applyT(inner);
    }, { passive: false });

    /* drag pan / arm-click pin placement */
    var drag = null;
    box.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.ftp-pin') || e.target.closest('.ftp-zoom')) return;
      drag = { x: e.clientX, y: e.clientY, px: view.px, py: view.py, moved: false };
      box.setPointerCapture(e.pointerId);
    });
    box.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      view.px = drag.px + dx; view.py = drag.py + dy;
      applyT(inner);
    });
    box.addEventListener('pointerup', function (e) {
      var wasDrag = drag && drag.moved;
      drag = null;
      if (wasDrag || !view.arming || !view.sel) return;
      /* place the armed pin at the click point (image coords, normalized) */
      var ir = inner.querySelector('img').getBoundingClientRect();
      var x = (e.clientX - ir.left) / ir.width;
      var y = (e.clientY - ir.top) / ir.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) return;
      var p = byId(view.sel);
      if (p) {
        p.pin = { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 };
        view.arming = false;
        persist();
        note('Pin placed for “' + p.name + '”.');
        renderMapView(root);
      }
    });

    /* zoom pill */
    var z = document.createElement('div');
    z.className = 'ftp-zoom';
    z.appendChild(mkBtn('−', '', function () { view.sc = Math.max(0.2, view.sc / 1.3); applyT(inner); }));
    z.appendChild(mkBtn('Fit', '', function () { view.sc = 1; view.px = 0; view.py = 0; applyT(inner); }));
    z.appendChild(mkBtn('＋', '', function () { view.sc = Math.min(8, view.sc * 1.3); applyT(inner); }));
    box.appendChild(z);

    /* grid of unpinned places below? — keep the map clean; unpinned places are
       reachable from the side panel + editor. Show a subtle count if any. */
    return box;
  }

  function placePins(inner) {
    Array.prototype.forEach.call(inner.querySelectorAll('.ftp-pin'), function (p) { p.remove(); });
    var img = inner.querySelector('img');
    if (!img || !img.naturalWidth) return;
    places().forEach(function (p) {
      if (!p.pin) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ftp-pin' + (view.sel === p.id ? ' sel' : '');
      b.style.left = (p.pin.x * 100) + '%';
      b.style.top = (p.pin.y * 100) + '%';
      b.setAttribute('aria-label', 'Place: ' + p.name + ' (' + eventsAt(p.id).length + ' events)');
      var _picon = (p.symbol && window.ftSymbols && ftSymbols.byId(p.symbol))
        ? '<span class="ftp-pin-sym" style="color:' + esc(p.color || '#e8ecf6') + ';transform:scale(' + (p.symSize || 1) + ')">' + ftSymbols.svg(p.symbol) + '</span>'
        : '<span aria-hidden="true">' + esc(p.icon || '📍') + '</span>';
      b.innerHTML = _picon +
        '<span class="ftp-pin-lbl" style="' + (p.color ? 'box-shadow:inset 0 -2px 0 ' + esc(p.color) : '') + '">' + esc(p.name) + '</span>';
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        view.sel = p.id; view.arming = false;
        renderMapView(root);
      });
      inner.appendChild(b);
    });
  }

  /* ---------- abstract grid (no image) ---------- */
  function buildGrid() {
    var g = document.createElement('div');
    g.className = 'ftp-grid';
    var all = places();
    var roots = all.filter(function (p) { return !p.parentId || !byId(p.parentId); });
    function card(p, isChild) {
      var c = document.createElement('button');
      c.type = 'button';
      c.className = 'ftp-card' + (isChild ? ' child' : '') + (view.sel === p.id ? ' sel' : '');
      var n = eventsAt(p.id).length;
      c.innerHTML =
        '<div class="ftp-card-name"><span class="ftp-dot" style="background:' + esc(p.color || '#888') + '"></span>' +
        esc(p.icon ? p.icon + ' ' : '') + esc(p.name) + '</div>' +
        '<div class="ftp-card-count">' + n + ' event' + (n === 1 ? '' : 's') + '</div>';
      c.addEventListener('click', function () { view.sel = p.id; renderMapView(root); });
      return c;
    }
    roots.forEach(function (p) {
      g.appendChild(card(p, false));
      all.filter(function (q) { return q.parentId === p.id; }).forEach(function (q) { g.appendChild(card(q, true)); });
    });
    return g;
  }

  /* ---------- side panel ---------- */
  function buildSide(p) {
    var s = document.createElement('div');
    s.className = 'ftp-side';
    var h = document.createElement('h3');
    h.innerHTML = '<span class="ftp-dot" style="width:10px;height:10px;border-radius:50%;background:' + esc(p.color || '#888') + '"></span>' +
      esc(p.icon ? p.icon + ' ' : '') + esc(p.name);
    s.appendChild(h);
    var parent = p.parentId && byId(p.parentId);
    if (parent) {
      var pr = document.createElement('div');
      pr.style.cssText = 'font-size:11.5px;opacity:.65';
      pr.textContent = 'in ' + parent.name;
      s.appendChild(pr);
    }
    if (p.description) {
      var d = document.createElement('div');
      d.className = 'ftp-desc';
      d.textContent = p.description;
      s.appendChild(d);
    }
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
    row.appendChild(mkBtn('Edit', '', function () { openPlaceEditor(p.id); }));
    if (mapMeta().has) {
      row.appendChild(mkBtn(p.pin ? 'Move pin' : 'Set pin', '', function () {
        view.arming = true;
        note('Now click the spot on the map for “' + p.name + '”.');
        renderMapView(root);
      }));
    }
    if (typeof CFG.setPlaceFilter === 'function') {
      row.appendChild(mkBtn('Filter timeline', 'acc', function () { CFG.setPlaceFilter(p.id); }));
    }
    row.appendChild(mkBtn('✕', '', function () { view.sel = null; renderMapView(root); }));
    s.appendChild(row);

    var evs = eventsAt(p.id);
    var lbl = document.createElement('div');
    lbl.style.cssText = 'font-size:11.5px;font-weight:700;opacity:.7;margin-top:4px';
    lbl.textContent = evs.length ? ('Events here (' + evs.length + ')') : 'No events linked to this place yet — link them from the event editor.';
    s.appendChild(lbl);
    evs.forEach(function (ev) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ftp-evrow';
      var dt = '';
      try { dt = CFG.eventDateLabel ? CFG.eventDateLabel(ev) : (ev.date || ''); } catch (_) {}
      b.innerHTML = '<span class="ftp-evdate">' + esc(dt) + '</span>' + esc(ev.title || '(untitled)');
      b.addEventListener('click', function () { try { CFG.jumpToEvent(ev); } catch (_) {} });
      s.appendChild(b);
    });
    return s;
  }

  /* ---------- place editor (self-contained dialog) ---------- */
  var edEls = null;
  function closeEditor() {
    if (edEls) { edEls.scrim.remove(); edEls.box.remove(); edEls = null; }
    document.removeEventListener('keydown', edKey, true);
  }
  function edKey(e) { if (e.key === 'Escape') { e.stopPropagation(); closeEditor(); } }

  function openPlaceEditor(id) {
    closeEditor();
    var p = id ? byId(id) : null;
    var scrim = document.createElement('div');
    scrim.className = 'ftp-ed-scrim';
    scrim.addEventListener('click', closeEditor);
    var box = document.createElement('div');
    box.className = 'ftp-ed';
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', p ? 'Edit place' : 'New place');
    var parentOpts = places()
      .filter(function (q) { return (!p || q.id !== p.id) && !q.parentId; })
      .map(function (q) {
        return '<option value="' + esc(q.id) + '"' + (p && p.parentId === q.id ? ' selected' : '') + '>' + esc(q.name) + '</option>';
      }).join('');
    box.innerHTML =
      '<h3>' + (p ? 'Edit place' : 'New place') + '</h3>' +
      '<label for="ftp-ed-name">Name</label>' +
      '<input id="ftp-ed-name" type="text" maxlength="200" value="' + esc(p ? p.name : '') + '">' +
      '<div class="ftp-ed-row"><div>' +
      '<label for="ftp-ed-icon">Icon (emoji)</label>' +
      '<input id="ftp-ed-icon" type="text" maxlength="8" value="' + esc(p ? p.icon : '') + '" placeholder="📍">' +
      '</div><div>' +
      '<label for="ftp-ed-color">Colour</label>' +
      '<input id="ftp-ed-color" type="color" value="' + esc((p && /^#[0-9a-fA-F]{6}$/.test(p.color || '')) ? p.color : '#7a9ede') + '">' +
      '</div></div>' +
      '<label>Map symbol <span style="font-weight:400;opacity:.6">(optional — shown on the map instead of the emoji)</span></label>' +
      '<div class="ftp-symgrid" id="ftp-ed-symgrid"></div>' +
      '<input type="hidden" id="ftp-ed-symbol" value="' + esc(p ? (p.symbol || '') : '') + '">' +
      '<div class="ftp-ed-row"><div><label for="ftp-ed-symsize">Symbol size</label>' +
      '<input id="ftp-ed-symsize" type="range" min="0.7" max="1.8" step="0.1" value="' + ((p && p.symSize) || 1) + '"></div></div>' +
      '<label for="ftp-ed-parent">Region (parent place)</label>' +
      '<select id="ftp-ed-parent"><option value="">— none —</option>' + parentOpts + '</select>' +
      '<label for="ftp-ed-desc">Description</label>' +
      '<textarea id="ftp-ed-desc" maxlength="4000">' + esc(p ? p.description : '') + '</textarea>' +
      '<div class="ftp-ed-actions"></div>';
    var actions = box.querySelector('.ftp-ed-actions');
    (function () {
      var grid = box.querySelector('#ftp-ed-symgrid'), hidden = box.querySelector('#ftp-ed-symbol');
      if (!grid) return;
      if (!window.ftSymbols) { grid.innerHTML = '<span style="opacity:.6;font-size:12px">Symbol library still loading…</span>'; return; }
      var html = '<button type="button" class="ftp-sym none' + (hidden.value ? '' : ' on') + '" data-sym="" title="No symbol (use the emoji)">✕</button>';
      ftSymbols.GROUPS.forEach(function (g) { g.items.forEach(function (it) {
        html += '<button type="button" class="ftp-sym' + (hidden.value === it[0] ? ' on' : '') + '" data-sym="' + it[0] + '" title="' + it[1] + '">' + ftSymbols.svg(it[0]) + '</button>';
      }); });
      grid.innerHTML = html;
      grid.addEventListener('click', function (e) {
        var btn = e.target.closest('.ftp-sym'); if (!btn) return;
        hidden.value = btn.getAttribute('data-sym');
        Array.prototype.forEach.call(grid.children, function (c) { c.classList.toggle('on', c === btn); });
      });
    })();
    if (p) {
      actions.appendChild(mkBtn('Delete', 'danger', function () {
        var evCount = eventsAt(p.id).length;
        var msg = 'Delete place “' + p.name + '”' + (evCount ? ' (linked to ' + evCount + ' events — the events stay, only the link is removed)' : '') + '?';
        var go = function () {
          var s = S();
          s.places = places().filter(function (q) { return q.id !== p.id; });
          s.places.forEach(function (q) { if (q.parentId === p.id) q.parentId = ''; });
          (s.events || []).forEach(function (ev) {
            if (Array.isArray(ev.placeIds)) ev.placeIds = ev.placeIds.filter(function (x) { return x !== p.id; });
          });
          var ppl = s.characters || s.people || [];
          ppl.forEach(function (ch) {
            if (Array.isArray(ch.placeIds)) ch.placeIds = ch.placeIds.filter(function (x) { return x !== p.id; });
          });
          if (view.sel === p.id) view.sel = null;
          persist(); closeEditor(); renderMapView(root); note('Place deleted.');
        };
        if (typeof window.ftConfirm === 'function') window.ftConfirm(msg).then(function (ok) { if (ok) go(); });
        else if (window.confirm(msg)) go();
      }));
    }
    actions.appendChild(mkBtn('Cancel', '', closeEditor));
    actions.appendChild(mkBtn('Save', 'acc', function () {
      var name = box.querySelector('#ftp-ed-name').value.trim();
      if (!name) { note('Give the place a name.'); return; }
      var target = p;
      if (!target) { target = { id: uid(), pin: null }; places().push(target); }
      target.name = name.slice(0, 200);
      target.icon = box.querySelector('#ftp-ed-icon').value.trim().slice(0, 8);
      target.symbol = (box.querySelector('#ftp-ed-symbol') || {}).value || '';
      var _ss = parseFloat((box.querySelector('#ftp-ed-symsize') || {}).value);
      target.symSize = (isFinite(_ss) && _ss > 0) ? Math.round(_ss * 10) / 10 : 1;
      target.color = box.querySelector('#ftp-ed-color').value;
      target.parentId = box.querySelector('#ftp-ed-parent').value;
      target.description = box.querySelector('#ftp-ed-desc').value.slice(0, 4000);
      view.sel = target.id;
      persist(); closeEditor(); renderMapView(root);
      note(p ? 'Place updated.' : 'Place “' + target.name + '” created' + (mapMeta().has ? ' — use “Set pin” to put it on the map.' : '.'));
    }));
    document.body.appendChild(scrim);
    document.body.appendChild(box);
    document.addEventListener('keydown', edKey, true);
    edEls = { scrim: scrim, box: box };
    box.querySelector('#ftp-ed-name').focus();
  }

  /* ---------- map image lifecycle ---------- */
  function ensureMapUrl() {
    if (view.mapUrl) return Promise.resolve(view.mapUrl);
    return mapStore.get(CFG.storageKey).then(function (stored) {
      if (stored instanceof Blob) {
        if (_objUrl) URL.revokeObjectURL(_objUrl);
        _objUrl = URL.createObjectURL(stored);
        view.mapUrl = _objUrl;
        return view.mapUrl;
      }
      if (typeof stored === 'string' && stored) { view.mapUrl = stored; return stored; }
      /* private-mode fallback carried in state */
      var s = S();
      if (typeof s._mapDataUrl === 'string' && s._mapDataUrl) { view.mapUrl = s._mapDataUrl; return view.mapUrl; }
      return '';
    });
  }

  function pickImage() {
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      note('Processing map image…');
      compressImage(f).then(function (r) {
        return mapStore.set(CFG.storageKey, r.blob).then(function (ok) {
          var s = S();
          if (!ok) {
            /* IDB unavailable (private mode): small images ride in state */
            if (r.blob.size < 1.5 * 1024 * 1024) {
              return blobToDataUrl(r.blob).then(function (du) { s._mapDataUrl = du; return true; });
            }
            note('Could not store the map on this device (private mode?). Use a smaller image.');
            return false;
          }
          delete s._mapDataUrl;
          return true;
        }).then(function (stored) {
          if (!stored) return;
          var s = S();
          s.mapMeta = { has: true, w: r.w, h: r.h, name: f.name.slice(0, 200) };
          view.mapUrl = ''; view.sc = 1; view.px = 0; view.py = 0;
          persist();
          note('Map image saved (' + r.w + '×' + r.h + ').');
          renderMapView(root);
        });
      }).catch(function (e) { note(String(e.message || e)); });
    });
    inp.click();
  }

  function removeImage() {
    var msg = 'Remove the map image? Places and pins are kept.';
    var go = function () {
      mapStore.del(CFG.storageKey);
      try { mapStore.del(CFG.storageKey + '__sketch'); } catch (_) {}
      var s = S();
      delete s._mapDataUrl;
      delete s.mapSketchIcons;
      s.mapMeta = { has: false, w: 0, h: 0, name: '' };
      view.mapUrl = '';
      persist(); renderMapView(root); note('Map image removed.');
    };
    if (typeof window.ftConfirm === 'function') window.ftConfirm(msg).then(function (ok) { if (ok) go(); });
    else if (window.confirm(msg)) go();
  }

  /* ---------- Pro Map Studio (ft-azgaar bridge) ---------- */
  function importMapFile(file, name) {
    if (!file) return Promise.resolve(false);
    note('Importing your map…');
    return compressImage(file).then(function (r) {
      return mapStore.set(CFG.storageKey, r.blob).then(function (ok) {
        var s = S();
        if (!ok) {
          if (r.blob.size < 1.5 * 1024 * 1024) {
            return blobToDataUrl(r.blob).then(function (du) { s._mapDataUrl = du; return { ok: true, r: r }; });
          }
          note('Could not store the map on this device (private mode?). Try a smaller export.');
          return { ok: false, r: r };
        }
        delete s._mapDataUrl;
        return { ok: true, r: r };
      });
    }).then(function (out) {
      if (!out.ok) return false;
      var s = S(), r = out.r;
      s.mapMeta = { has: true, w: r.w, h: r.h, name: String(name || (file.name || 'World map')).slice(0, 200) };
      view.mapUrl = ''; view.sc = 1; view.px = 0; view.py = 0;
      persist();
      note('Map imported (' + r.w + '×' + r.h + ') — drop Places and pins on top.');
      renderMapView(root);
      return true;
    }).catch(function (e) { note(String(e.message || e)); return false; });
  }

  function openAzgaar() {
    if (!window.ftAzgaar) { note('The map studio is still loading — try again in a moment.'); return; }
    window.ftAzgaar.open({
      onImport: function (file) { return importMapFile(file, 'World map (studio)'); }
    });
  }

  /* ---------- Sketch-a-Map (ft-sketch bridge) — the simple drawer ---------- */
  function sketchKey() { return CFG.storageKey + '__sketch'; }
  function openSketch() {
    if (!window.ftSketch) { note('The map editor is still loading — try again in a moment.'); return; }
    var s = S();
    // Load any prior painted layers from IndexedDB so drawing is resumable.
    Promise.resolve(mapStore.get(sketchKey())).then(function (blob) {
      if (blob && typeof blob.arrayBuffer === 'function') return blob.arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
      if (blob instanceof Uint8Array) return blob;
      return null;
    }).catch(function () { return null; }).then(function (packed) {
      window.ftSketch.open({
        packed: packed,
        icons: Array.isArray(s.mapSketchIcons) ? s.mapSketchIcons : null,
        onSave: function (dataUrl, meta, pk, icons) {
          note('Saving your map…');
          return setMapFromDataUrl(dataUrl).then(function (ok) {
            if (!ok) { note('Could not store the map on this device (private mode?).'); return false; }
            var st = S();
            st.mapMeta = { has: true, w: (meta && meta.w) || 0, h: (meta && meta.h) || 0, name: (meta && meta.name) || 'Sketched map' };
            st.mapSketchIcons = (icons || []).map(function (o) { return { type: o.type, x: o.x, y: o.y, size: o.size }; });
            view.mapUrl = ''; view.sc = 1; view.px = 0; view.py = 0;
            persist();
            try { mapStore.set(sketchKey(), new Blob([pk])); } catch (_) {}  // editable layers live in IDB, not localStorage
            note('Map saved — drop Places and pins on top, or reopen to keep editing.');
            renderMapView(root);
            return true;
          });
        }
      });
    });
  }

  /* ---------- Advanced maps (tucked away: Azgaar studio + grid painter) ---------- */
  function openAdvancedMap() {
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:9500;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5)';
    var card = document.createElement('div');
    var dark = (function () { var m = (getComputedStyle(document.body).backgroundColor || '').match(/\d+/g); return m ? (0.299 * +m[0] + 0.587 * +m[1] + 0.114 * +m[2]) < 128 : false; })();
    card.style.cssText = 'min-width:280px;max-width:360px;border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:10px;box-shadow:0 20px 60px rgba(0,0,0,.5);' +
      (dark ? 'background:#141d33;color:#e7ecf7;border:1px solid #26365c' : 'background:#fffdf8;color:#3d2b1f;border:1px solid #e6dac6');
    var h = document.createElement('div'); h.style.cssText = 'font-weight:800;font-size:15px'; h.textContent = 'Advanced map tools';
    var p = document.createElement('div'); p.style.cssText = 'font-size:12.5px;opacity:.72;margin-bottom:4px';
    p.textContent = 'Power-user options. Most people won’t need these — “Draw map” and “Quick map” cover it.';
    card.appendChild(h); card.appendChild(p);
    function row(label, desc, fn) {
      var b = document.createElement('button');
      b.style.cssText = 'text-align:left;border-radius:10px;padding:11px 13px;cursor:pointer;font:600 13px inherit;' +
        (dark ? 'background:#0e1830;color:#e7ecf7;border:1px solid #26365c' : 'background:#fff;color:#3d2b1f;border:1px solid #e6dac6');
      b.innerHTML = label + '<div style="font-weight:400;opacity:.65;font-size:11.5px;margin-top:2px">' + desc + '</div>';
      b.addEventListener('click', function () { document.body.removeChild(ov); fn(); });
      return b;
    }
    if (window.ftAzgaar) card.appendChild(row('🗺️ Pro map studio (Azgaar)', 'Full fantasy-map generator — rivers, biomes, countries, any scale. Export a PNG and import it.', openAzgaar));
    if (window.ftMapPaint) card.appendChild(row('🖌 Grid painter', 'The older cell-based painter, with political countries and time epochs.', openPaintMap));
    var cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    cancel.style.cssText = 'align-self:flex-end;margin-top:4px;border:0;background:transparent;color:inherit;opacity:.7;cursor:pointer;font:600 12px inherit;padding:6px 4px';
    cancel.addEventListener('click', function () { document.body.removeChild(ov); });
    card.appendChild(cancel);
    ov.appendChild(card);
    ov.addEventListener('click', function (e) { if (e.target === ov) document.body.removeChild(ov); });
    document.body.appendChild(ov);
  }

  /* ---------- generated maps (ft-mapgen bridge) ---------- */
  function openMapGen() {
    if (!window.ftMapGen) { note('Map generator is still loading — try again in a moment.'); return; }
    window.ftMapGen.open({
      onApply: function (dataUrl, meta) {
        note('Saving your new map…');
        return setMapFromDataUrl(dataUrl).then(function (ok) {
          if (!ok) { note('Could not store the generated map on this device (private mode?).'); return false; }
          var s = S();
          s.mapMeta = { has: true, w: (meta && meta.w) || 0, h: (meta && meta.h) || 0, name: (meta && meta.name) || 'Generated map' };
          view.mapUrl = ''; view.sc = 1; view.px = 0; view.py = 0;
          persist();
          note('Map created — drag a pin, or add Places onto it.');
          renderMapView(root);
          return true;
        });
      },
      onAddPlaces: function (pins) {
        if (!Array.isArray(pins) || !pins.length) return;
        pins.forEach(function (pin) {
          places().push({
            id: uid(),
            name: String(pin.name || 'Place').slice(0, 200),
            icon: '', color: pin.color || '#7a9ede', description: '', parentId: '',
            pin: { x: Math.round((pin.x || 0.5) * 1000) / 1000, y: Math.round((pin.y || 0.5) * 1000) / 1000 }
          });
        });
        persist();
        renderMapView(root);
        note(pins.length + ' place' + (pins.length === 1 ? '' : 's') + ' added to the map.');
      }
    });
  }

  /* ---------- painted maps (ft-mappaint bridge) ---------- */
  function openPaintMap() {
    if (!window.ftMapPaint) { note('Map painter is still loading — try again in a moment.'); return; }
    var s = S();
    window.ftMapPaint.open({
      grid: s.mapPaintGrid || null,
      pol: s.mapPoliticalGrid || null,
      countries: s.mapCountries || [],
      epochs: s.mapEpochs || null,
      epochIndex: s.mapEpochIndex || 0,
      onApply: function (dataUrl, meta) {
        note('Saving your map…');
        return setMapFromDataUrl(dataUrl).then(function (ok) {
          if (!ok) { note('Could not store the map on this device (private mode?).'); return false; }
          var st = S();
          st.mapMeta = { has: true, w: (meta && meta.w) || 0, h: (meta && meta.h) || 0, name: (meta && meta.name) || 'Painted map' };
          view.mapUrl = ''; view.sc = 1; view.px = 0; view.py = 0;
          persist();
          note('Map saved — paint again any time to keep editing it.');
          renderMapView(root);
          return true;
        });
      },
      onSaveGrid: function (grid) { var st = S(); st.mapPaintGrid = grid; persist(); },
      onSavePol: function (pol, countries) { var st = S(); st.mapPoliticalGrid = pol; st.mapCountries = countries; persist(); },
      onSaveEpochs: function (epochs, idx) { var st = S(); st.mapEpochs = epochs; st.mapEpochIndex = idx; persist(); }
    });
  }

  /* ---------- export / import helpers ---------- */
  /* Resolve the current map image as a dataURL for embedding in exports ('' if none). */
  function getMapDataUrl() {
    if (!mapMeta().has) return Promise.resolve('');
    return mapStore.get(CFG.storageKey).then(function (stored) {
      if (stored instanceof Blob) return blobToDataUrl(stored);
      if (typeof stored === 'string') return stored;
      var s = S();
      return (typeof s._mapDataUrl === 'string') ? s._mapDataUrl : '';
    });
  }
  /* Write an imported dataURL back to IDB (called by the engine after validation). */
  function setMapFromDataUrl(dataUrl) {
    if (!dataUrl) return Promise.resolve(false);
    return compressImage(dataUrl).then(function (r) {
      return mapStore.set(CFG.storageKey, r.blob).then(function (ok) {
        var s = S();
        if (!ok && r.blob.size < 1.5 * 1024 * 1024) {
          return blobToDataUrl(r.blob).then(function (du) { s._mapDataUrl = du; return true; });
        }
        if (ok) delete s._mapDataUrl;
        return ok;
      });
    }).then(function (stored) {
      view.mapUrl = '';
      return stored;
    }).catch(function () { return false; });
  }

  /* ---------- small helpers for engine templates ---------- */
  function placeName(id) { var p = byId(id); return p ? p.name : ''; }
  function placeChipsHtml(ids) {
    if (!Array.isArray(ids) || !ids.length) return '';
    return ids.map(function (pid) {
      var p = byId(pid);
      if (!p) return '';
      return '<span style="display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:700;' +
        'border:1px solid rgba(128,128,128,.4);border-radius:999px;padding:1px 8px;margin:1px 3px 1px 0">' +
        '<span style="width:7px;height:7px;border-radius:50%;background:' + esc(p.color || '#888') + '"></span>' +
        esc((p.icon ? p.icon + ' ' : '') + p.name) + '</span>';
    }).join('');
  }
  function placeOptionsHtml(selectedIds) {
    var sel = Array.isArray(selectedIds) ? selectedIds : [];
    return places().map(function (p) {
      return '<option value="' + esc(p.id) + '"' + (sel.indexOf(p.id) !== -1 ? ' selected' : '') + '>' +
        esc((p.icon ? p.icon + ' ' : '') + p.name) + '</option>';
    }).join('');
  }

  window.ftPlaces = {
    init: function (cfg) { CFG = cfg; },
    renderMapView: renderMapView,
    openPlaceEditor: openPlaceEditor,
    placeName: placeName,
    placeChipsHtml: placeChipsHtml,
    placeOptionsHtml: placeOptionsHtml,
    getMapDataUrl: getMapDataUrl,
    setMapFromDataUrl: setMapFromDataUrl,
    mapStore: mapStore,
    selectPlace: function (id) { view.sel = id; },
    _eventsAt: eventsAt
  };
})();

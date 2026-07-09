/* ============================================================================
 * ft-mappaint.js — paint a world map, no drawing skill required (Map editor P1).
 *
 * The user paints terrain (water / sand / grass / forest / mountain / snow) onto
 * a coarse grid with a brush or a fill bucket. Hard cell edges are smoothed into
 * organic coasts by rendering the grid small and upscaling with interpolation
 * (same trick as the procedural generator), plus a crisp coastline stroke where
 * land meets water so the map stays readable.
 *
 * The editable grid is kept as compact data ({w,h,cells:[...]}) so the map can be
 * re-opened and edited later — and, in a later phase, snapshotted per timeline
 * epoch so the map can evolve over time. On save it is also baked to a PNG and
 * fed through the existing ft-places image pipeline (so pins/zoom/pan just work).
 *
 * Public API:
 *   window.ftMapPaint.open({ dark, grid, onApply(dataUrl, meta)->Promise|any,
 *                            onSaveGrid(grid) })
 *     grid        existing {w,h,cells} to keep editing, or null to start blank.
 *     onApply     receives a PNG dataURL of the finished map + {name,w,h}.
 *     onSaveGrid  receives the editable grid to persist for next time.
 * ==========================================================================*/
(function () {
  'use strict';
  if (window.ftMapPaint) return;

  /* terrain palette — id is the value stored per cell */
  var TERRAIN = [
    { id: 0, name: 'Deep water', color: '#12324a', water: true },
    { id: 1, name: 'Water',      color: '#1c5a74', water: true },
    { id: 2, name: 'Sand',       color: '#d9c9a0', water: false },
    { id: 3, name: 'Grass',      color: '#5a8a4a', water: false },
    { id: 4, name: 'Forest',     color: '#35603f', water: false },
    { id: 5, name: 'Mountain',   color: '#7d7466', water: false },
    { id: 6, name: 'Snow',       color: '#e6ecf0', water: false }
  ];
  function tById(id) { return TERRAIN[id] || TERRAIN[0]; }
  function rgb(hex) { return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]; }
  var COL = TERRAIN.map(function (t) { return rgb(t.color); });

  var GW = 80, GH = 56;          // grid resolution (compact + detailed enough)

  function blankGrid() { return { w: GW, h: GH, cells: new Array(GW * GH).fill(0) }; }
  function cloneGrid(g) {
    if (!g || !Array.isArray(g.cells)) return blankGrid();
    return { w: g.w || GW, h: g.h || GH, cells: g.cells.slice() };
  }

  /* -------- render a grid onto a canvas (smoothed + coastline) -------- */
  function renderGrid(cv, grid, style) {
    if (window.ftMapRender) {
      window.ftMapRender.render(cv, { terrain: grid.cells, gw: grid.w, gh: grid.h, seaLevel: 0.42, seed: 1, style: (style === 'atlas' ? 'atlas' : 'relief'), climate: 'temperate' });
      return;
    }
    var W = cv.width, H = cv.height, ctx = cv.getContext('2d');
    var gw = grid.w, gh = grid.h, cells = grid.cells;
    // small canvas at grid resolution, then smooth-upscale for organic coasts
    var sm = document.createElement('canvas'); sm.width = gw; sm.height = gh;
    var sctx = sm.getContext('2d'), img = sctx.createImageData(gw, gh), d = img.data;
    for (var i = 0; i < gw * gh; i++) {
      var c = COL[cells[i] || 0], k = i * 4;
      d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
    }
    sctx.putImageData(img, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(sm, 0, 0, W, H);
    // subtle depth vignette
    var vg = ctx.createRadialGradient(W / 2, H * 0.44, H * 0.25, W / 2, H / 2, W * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    /* (fallback renderer always draws the coastline) */
    // coastline: stroke shared edges between water and non-water cells
    var cw = W / gw, ch = H / gh;
    ctx.strokeStyle = 'rgba(20,30,40,0.5)'; ctx.lineWidth = Math.max(1, W / 900);
    ctx.beginPath();
    function water(x, y) { if (x < 0 || y < 0 || x >= gw || y >= gh) return true; return tById(cells[y * gw + x]).water; }
    for (var y = 0; y < gh; y++) {
      for (var x = 0; x < gw; x++) {
        if (tById(cells[y * gw + x]).water) continue;
        if (water(x + 1, y)) { ctx.moveTo((x + 1) * cw, y * ch); ctx.lineTo((x + 1) * cw, (y + 1) * ch); }
        if (water(x - 1, y)) { ctx.moveTo(x * cw, y * ch); ctx.lineTo(x * cw, (y + 1) * ch); }
        if (water(x, y + 1)) { ctx.moveTo(x * cw, (y + 1) * ch); ctx.lineTo((x + 1) * cw, (y + 1) * ch); }
        if (water(x, y - 1)) { ctx.moveTo(x * cw, y * ch); ctx.lineTo((x + 1) * cw, y * ch); }
      }
    }
    ctx.stroke();
  }

  /* flood fill (bucket) */
  function bucket(grid, sx, sy, val) {
    var gw = grid.w, gh = grid.h, cells = grid.cells;
    var target = cells[sy * gw + sx];
    if (target === val) return;
    var stack = [[sx, sy]];
    while (stack.length) {
      var p = stack.pop(), x = p[0], y = p[1];
      if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
      if (cells[y * gw + x] !== target) continue;
      cells[y * gw + x] = val;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  }

  /* ---------------- political layer (countries) ---------------- */
  var COUNTRY_COLORS = ['#c0674a', '#4a8fde', '#57b98a', '#e0a24a', '#9a7ae0', '#4ec5c1', '#d95f8a', '#7a9a3a'];
  function blankPol() { return { w: GW, h: GH, cells: new Array(GW * GH).fill(0) }; }
  function clonePol(p) { if (!p || !Array.isArray(p.cells)) return blankPol(); return { w: p.w || GW, h: p.h || GH, cells: p.cells.slice() }; }
  function hexA(hex, a) { hex = String(hex || '#888'); var r = parseInt(hex.slice(1, 3), 16) || 136, g = parseInt(hex.slice(3, 5), 16) || 136, b = parseInt(hex.slice(5, 7), 16) || 136; return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'; }
  function renderPolitical(cv, pol, countries) {
    if (!pol || !countries || !countries.length) return;
    var ctx = cv.getContext('2d'), W = cv.width, H = cv.height, gw = pol.w, gh = pol.h, cells = pol.cells;
    var cw = W / gw, ch = H / gh, byId = {}; countries.forEach(function (c) { byId[c.id] = c; });
    for (var y = 0; y < gh; y++) for (var x = 0; x < gw; x++) { var id = cells[y * gw + x]; if (!id) continue; var c = byId[id]; if (!c) continue; ctx.fillStyle = hexA(c.color, 0.34); ctx.fillRect(Math.floor(x * cw), Math.floor(y * ch), Math.ceil(cw) + 1, Math.ceil(ch) + 1); }
    function idAt(x, y) { if (x < 0 || y < 0 || x >= gw || y >= gh) return 0; return cells[y * gw + x]; }
    ctx.strokeStyle = 'rgba(26,18,12,0.72)'; ctx.lineWidth = Math.max(1.2, W / 640); ctx.lineJoin = 'round'; ctx.beginPath();
    for (var y2 = 0; y2 < gh; y2++) for (var x2 = 0; x2 < gw; x2++) {
      var id2 = cells[y2 * gw + x2]; if (!id2) continue;
      if (idAt(x2 + 1, y2) !== id2) { ctx.moveTo((x2 + 1) * cw, y2 * ch); ctx.lineTo((x2 + 1) * cw, (y2 + 1) * ch); }
      if (idAt(x2 - 1, y2) !== id2) { ctx.moveTo(x2 * cw, y2 * ch); ctx.lineTo(x2 * cw, (y2 + 1) * ch); }
      if (idAt(x2, y2 + 1) !== id2) { ctx.moveTo(x2 * cw, (y2 + 1) * ch); ctx.lineTo((x2 + 1) * cw, (y2 + 1) * ch); }
      if (idAt(x2, y2 - 1) !== id2) { ctx.moveTo(x2 * cw, y2 * ch); ctx.lineTo((x2 + 1) * cw, y2 * ch); }
    }
    ctx.stroke();
    ctx.textAlign = 'center'; ctx.font = '700 ' + Math.round(W / 46) + 'px Georgia, serif';
    countries.forEach(function (c) {
      var sx = 0, sy = 0, n = 0; for (var i = 0; i < cells.length; i++) if (cells[i] === c.id) { sx += (i % gw); sy += Math.floor(i / gw); n++; }
      if (!n) return; var lx = sx / n * cw, ly = sy / n * ch;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,14,10,0.85)'; ctx.strokeText(c.name, lx, ly);
      ctx.fillStyle = 'rgba(255,255,255,0.94)'; ctx.fillText(c.name, lx, ly);
    });
  }

  /* ---------------- UI ---------------- */
  var els = null;
  function css() {
    if (document.getElementById('ftmp-css')) return;
    var st = document.createElement('style'); st.id = 'ftmp-css';
    st.textContent = [
      '.ftmp-scrim{position:fixed;inset:0;z-index:1200;background:rgba(6,9,18,.68);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:16px}',
      '.ftmp{width:min(1000px,100%);max-height:96vh;background:var(--ftmp-bg);color:var(--ftmp-ink);border:1px solid var(--ftmp-line);border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,.55);display:flex;flex-direction:column;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif}',
      '.ftmp-head{display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid var(--ftmp-line)}',
      '.ftmp-head .ic{width:32px;height:32px;border-radius:9px;background:var(--ftmp-acc);display:grid;place-items:center;color:#fff;font-size:17px;flex:0 0 auto}',
      '.ftmp-head h2{margin:0;font-size:15.5px;font-weight:650}.ftmp-head p{margin:2px 0 0;font-size:11.5px;opacity:.6}',
      '.ftmp-x{margin-left:auto;width:30px;height:30px;border-radius:8px;border:0;background:transparent;color:inherit;font-size:20px;cursor:pointer;opacity:.6}.ftmp-x:hover{opacity:1;background:var(--ftmp-raise)}',
      '.ftmp-body{display:flex;gap:14px;padding:14px 16px;min-height:0}',
      '.ftmp-tools{width:190px;flex:0 0 auto;display:flex;flex-direction:column;gap:12px;overflow:auto}',
      '.ftmp-lbl{font-size:10.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;opacity:.55;margin-bottom:6px}',
      '.ftmp-swatches{display:flex;flex-direction:column;gap:4px}',
      '.ftmp-sw{display:flex;align-items:center;gap:9px;padding:6px 8px;border-radius:8px;border:1px solid transparent;background:transparent;color:inherit;cursor:pointer;font-size:13px;text-align:left;width:100%}',
      '.ftmp-sw:hover{background:var(--ftmp-raise)}.ftmp-sw.on{border-color:var(--ftmp-acc);background:var(--ftmp-raise)}',
      '.ftmp-sw .dot{width:18px;height:18px;border-radius:5px;flex:0 0 auto;border:1px solid rgba(128,128,128,.4)}',
      '.ftmp-seg{display:flex;gap:4px}',
      '.ftmp-seg button{flex:1;height:32px;border:1px solid var(--ftmp-line);background:var(--ftmp-raise);color:inherit;border-radius:8px;font-size:12.5px;font-weight:600;cursor:pointer}',
      '.ftmp-seg button.on{background:var(--ftmp-acc);border-color:var(--ftmp-acc);color:#fff}',
      '.ftmp-canvaswrap{flex:1;min-width:0;display:flex;flex-direction:column;gap:10px}',
      '.ftmp-canvas{width:100%;aspect-ratio:10/7;background:#0a1a28;border:1px solid var(--ftmp-line);border-radius:12px;cursor:crosshair;touch-action:none;display:block}',
      '.ftmp-foot{display:flex;gap:8px;align-items:center}',
      '.ftmp-hint{font-size:11.5px;opacity:.6;flex:1}',
      '.ftmp-btn{height:36px;padding:0 14px;border-radius:8px;border:1px solid var(--ftmp-line);background:var(--ftmp-raise);color:inherit;font-size:13px;font-weight:600;cursor:pointer}',
      '.ftmp-btn.pri{background:var(--ftmp-acc);border-color:var(--ftmp-acc);color:#fff}',
      '@media(max-width:720px){.ftmp-body{flex-direction:column}.ftmp-tools{width:auto;flex-direction:row;flex-wrap:wrap}}'
    ].join('');
    document.head.appendChild(st);
  }
  function theme(dark) {
    var r = document.documentElement.style;
    r.setProperty('--ftmp-bg', dark ? '#141b2e' : '#fffdf8');
    r.setProperty('--ftmp-raise', dark ? '#1b2338' : '#f1ece1');
    r.setProperty('--ftmp-line', dark ? '#2a3350' : '#e0d7c6');
    r.setProperty('--ftmp-ink', dark ? '#e8ecf6' : '#3d2b1f');
    r.setProperty('--ftmp-acc', '#4f9cff');
  }
  function el(t, c, h) { var e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; }
  function close() { if (els) { els.scrim.remove(); els = null; } document.removeEventListener('keydown', onKey, true); }
  function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }

  function open(opts) {
    opts = opts || {};
    var dark = opts.dark;
    if (dark == null) { var m = (getComputedStyle(document.body).backgroundColor || '').match(/\d+/g); dark = !m || (0.299 * +m[0] + 0.587 * +m[1] + 0.114 * +m[2]) < 128; }
    css(); theme(dark); close();

    var grid = cloneGrid(opts.grid);
    var cur = 3;       // current terrain (grass)
    var brush = 2;     // brush radius in cells
    var tool = 'brush';// brush | bucket
    var style = 'relief';// relief | atlas — the art look
    var mode = 'terrain';// terrain | political (countries)
    var pol = clonePol(opts.pol);
    var countries = (opts.countries || []).map(function (c) { return { id: +c.id, name: c.name, color: c.color }; });
    var curCountry = countries.length ? countries[0].id : 0;
    var _cid = countries.reduce(function (m, c) { return Math.max(m, +c.id || 0); }, 0);

    var scrim = el('div', 'ftmp-scrim');
    scrim.addEventListener('click', function (e) { if (e.target === scrim) close(); });
    var modal = el('div', 'ftmp');
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-label', 'Paint a map');
    modal.addEventListener('click', function (e) { e.stopPropagation(); });

    var head = el('div', 'ftmp-head',
      '<div class="ic">🖌</div><div><h2>Paint your map</h2><p>Pick a terrain, then paint. Water and land blend into coasts automatically.</p></div>');
    var x = el('button', 'ftmp-x'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.textContent = '×'; x.addEventListener('click', close);
    head.appendChild(x); modal.appendChild(head);

    var body = el('div', 'ftmp-body');
    // tools column
    var tools = el('div', 'ftmp-tools');
    var modeWrap = el('div'); modeWrap.innerHTML = '<div class="ftmp-lbl">Layer</div>';
    var modeSeg = el('div', 'ftmp-seg');
    [['terrain', 'Terrain'], ['political', 'Countries']].forEach(function (p) {
      var b = el('button', p[0] === mode ? 'on' : ''); b.type = 'button'; b.textContent = p[1];
      b.addEventListener('click', function () { mode = p[0]; Array.prototype.forEach.call(modeSeg.children, function (c) { c.classList.toggle('on', c.textContent === p[1]); }); renderPalette(); });
      modeSeg.appendChild(b);
    });
    modeWrap.appendChild(modeSeg); tools.appendChild(modeWrap);
    var paletteHost = el('div'); tools.appendChild(paletteHost);
    function renderPalette() {
      paletteHost.innerHTML = '';
      if (mode === 'terrain') {
        paletteHost.innerHTML = '<div class="ftmp-lbl">Terrain</div>';
        var sw = el('div', 'ftmp-swatches');
        TERRAIN.forEach(function (t) {
          var b = el('button', 'ftmp-sw' + (t.id === cur ? ' on' : '')); b.type = 'button'; b.dataset.id = t.id;
          b.innerHTML = '<span class="dot" style="background:' + t.color + '"></span>' + t.name;
          b.addEventListener('click', function () { cur = t.id; Array.prototype.forEach.call(sw.children, function (c) { c.classList.toggle('on', +c.dataset.id === cur); }); });
          sw.appendChild(b);
        });
        paletteHost.appendChild(sw);
      } else {
        paletteHost.innerHTML = '<div class="ftmp-lbl">Countries</div>';
        var list = el('div', 'ftmp-swatches');
        countries.forEach(function (c) {
          var b = el('button', 'ftmp-sw' + (c.id === curCountry ? ' on' : '')); b.type = 'button'; b.dataset.cid = c.id;
          b.innerHTML = '<span class="dot" style="background:' + c.color + '"></span>' + c.name;
          b.addEventListener('click', function () { curCountry = c.id; Array.prototype.forEach.call(list.children, function (x) { x.classList.toggle('on', +x.dataset.cid === curCountry); }); });
          list.appendChild(b);
        });
        paletteHost.appendChild(list);
        var add = el('button', 'ftmp-btn'); add.type = 'button'; add.style.cssText = 'width:100%;margin-top:6px'; add.textContent = '＋ New country';
        add.addEventListener('click', function () {
          var nm = window.prompt('Country name', 'New nation'); if (!nm) return;
          _cid++; var c = { id: _cid, name: String(nm).slice(0, 60), color: COUNTRY_COLORS[(_cid - 1) % COUNTRY_COLORS.length] };
          countries.push(c); curCountry = c.id; renderPalette();
        });
        paletteHost.appendChild(add);
        if (!countries.length) paletteHost.insertAdjacentHTML('beforeend', '<div style="font-size:11px;opacity:.6;margin-top:6px">Add a country, then paint its land — borders draw themselves.</div>');
      }
    }
    renderPalette();

    var toolWrap = el('div'); toolWrap.innerHTML = '<div class="ftmp-lbl">Tool</div>';
    var toolSeg = el('div', 'ftmp-seg');
    [['brush', 'Brush'], ['bucket', 'Fill']].forEach(function (p) {
      var b = el('button', p[0] === tool ? 'on' : ''); b.type = 'button'; b.textContent = p[1];
      b.addEventListener('click', function () { tool = p[0]; Array.prototype.forEach.call(toolSeg.children, function (c) { c.classList.toggle('on', c.textContent === p[1]); }); });
      toolSeg.appendChild(b);
    });
    toolWrap.appendChild(toolSeg); tools.appendChild(toolWrap);

    var sizeWrap = el('div'); sizeWrap.innerHTML = '<div class="ftmp-lbl">Brush size</div>';
    var sizeSeg = el('div', 'ftmp-seg');
    [['1', 1], ['2', 2], ['3', 3], ['5', 5]].forEach(function (p) {
      var b = el('button', p[1] === brush ? 'on' : ''); b.type = 'button'; b.textContent = p[0];
      b.addEventListener('click', function () { brush = p[1]; Array.prototype.forEach.call(sizeSeg.children, function (c) { c.classList.toggle('on', +c.textContent === brush); }); });
      sizeSeg.appendChild(b);
    });
    sizeWrap.appendChild(sizeSeg); tools.appendChild(sizeWrap);

    var styleWrap = el('div'); styleWrap.innerHTML = '<div class="ftmp-lbl">Map style</div>';
    var styleSeg = el('div', 'ftmp-seg');
    [['relief', 'Relief'], ['atlas', 'Atlas']].forEach(function (p) {
      var b = el('button', p[0] === style ? 'on' : ''); b.type = 'button'; b.textContent = p[1];
      b.addEventListener('click', function () { style = p[0]; Array.prototype.forEach.call(styleSeg.children, function (c) { c.classList.toggle('on', c.textContent === p[1]); }); paint(); });
      styleSeg.appendChild(b);
    });
    styleWrap.appendChild(styleSeg); tools.appendChild(styleWrap);

    var clearWrap = el('div');
    var clearBtn = el('button', 'ftmp-btn'); clearBtn.type = 'button'; clearBtn.style.width = '100%'; clearBtn.textContent = '↺ Clear layer';
    clearBtn.addEventListener('click', function () { if (mode === 'political') pol = blankPol(); else grid = blankGrid(); paint(); });
    clearWrap.appendChild(clearBtn); tools.appendChild(clearWrap);

    body.appendChild(tools);

    // canvas column
    var cwrap = el('div', 'ftmp-canvaswrap');
    var canvas = el('canvas', 'ftmp-canvas'); canvas.width = 800; canvas.height = 560;
    cwrap.appendChild(canvas);
    var foot = el('div', 'ftmp-foot');
    foot.appendChild(el('span', 'ftmp-hint', 'Click or drag to paint · Fill floods an area · nothing leaves your browser'));
    var useBtn = el('button', 'ftmp-btn pri'); useBtn.type = 'button'; useBtn.textContent = 'Use this map';
    useBtn.addEventListener('click', function () { applyMap(); });
    foot.appendChild(useBtn);
    cwrap.appendChild(foot);
    body.appendChild(cwrap);
    modal.appendChild(body);

    scrim.appendChild(modal);
    document.body.appendChild(scrim);
    document.addEventListener('keydown', onKey, true);
    els = { scrim: scrim };
    var _first = modal.querySelector('.ftmp-sw'); if (_first) try { _first.focus(); } catch (_) {}

    function paint() { renderGrid(canvas, grid, style); renderPolitical(canvas, pol, countries); }

    function cellAt(ev) {
      var r = canvas.getBoundingClientRect();
      var x = Math.floor((ev.clientX - r.left) / r.width * grid.w);
      var y = Math.floor((ev.clientY - r.top) / r.height * grid.h);
      return [Math.max(0, Math.min(grid.w - 1, x)), Math.max(0, Math.min(grid.h - 1, y))];
    }
    function stamp(cx, cy) {
      var g = mode === 'political' ? pol : grid, val = mode === 'political' ? curCountry : cur;
      if (mode === 'political' && !val) { note('Add a country first (＋ New country).'); return; }
      if (tool === 'bucket') { bucket(g, cx, cy, val); return; }
      var rr = brush - 1;
      for (var dy = -rr; dy <= rr; dy++) for (var dx = -rr; dx <= rr; dx++) {
        if (dx * dx + dy * dy > rr * rr + rr) continue;
        var x = cx + dx, y = cy + dy;
        if (x >= 0 && y >= 0 && x < g.w && y < g.h) g.cells[y * g.w + x] = val;
      }
    }
    var drawing = false;
    canvas.addEventListener('pointerdown', function (ev) {
      ev.preventDefault(); drawing = true; canvas.setPointerCapture(ev.pointerId);
      var c = cellAt(ev); stamp(c[0], c[1]); paint();
      if (tool === 'bucket') drawing = false;
    });
    canvas.addEventListener('pointermove', function (ev) {
      if (!drawing) return; var c = cellAt(ev); stamp(c[0], c[1]); paint();
    });
    canvas.addEventListener('pointerup', function () { drawing = false; });

    function applyMap() {
      var big = document.createElement('canvas'); big.width = 1500; big.height = 1050;
      renderGrid(big, grid, style); renderPolitical(big, pol, countries);
      var dataUrl = big.toDataURL('image/png');
      var meta = { name: 'Painted map', w: big.width, h: big.height };
      if (typeof opts.onSaveGrid === 'function') { try { opts.onSaveGrid(cloneGrid(grid)); } catch (_) {} }
      if (typeof opts.onSavePol === 'function') { try { opts.onSavePol(clonePol(pol), countries.map(function (c) { return { id: c.id, name: c.name, color: c.color }; })); } catch (_) {} }
      var finish = function () { close(); };
      if (typeof opts.onApply === 'function') {
        var r = opts.onApply(dataUrl, meta);
        if (r && typeof r.then === 'function') r.then(finish, finish); else finish();
      } else finish();
    }

    paint();
  }

  window.ftMapPaint = { open: open, _renderGrid: renderGrid, _blankGrid: blankGrid };
})();

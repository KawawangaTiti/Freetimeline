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
  function renderGrid(cv, grid, coastline) {
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
    if (coastline === false) return;
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
    var swWrap = el('div'); swWrap.innerHTML = '<div class="ftmp-lbl">Terrain</div>';
    var sw = el('div', 'ftmp-swatches');
    TERRAIN.forEach(function (t) {
      var b = el('button', 'ftmp-sw' + (t.id === cur ? ' on' : ''));
      b.type = 'button'; b.dataset.id = t.id;
      b.innerHTML = '<span class="dot" style="background:' + t.color + '"></span>' + t.name;
      b.addEventListener('click', function () { cur = t.id; Array.prototype.forEach.call(sw.children, function (c) { c.classList.toggle('on', +c.dataset.id === cur); }); });
      sw.appendChild(b);
    });
    swWrap.appendChild(sw); tools.appendChild(swWrap);

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

    var clearWrap = el('div');
    var clearBtn = el('button', 'ftmp-btn'); clearBtn.type = 'button'; clearBtn.style.width = '100%'; clearBtn.textContent = '↺ Clear to water';
    clearBtn.addEventListener('click', function () { grid = blankGrid(); paint(); });
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

    function paint() { renderGrid(canvas, grid, true); }

    function cellAt(ev) {
      var r = canvas.getBoundingClientRect();
      var x = Math.floor((ev.clientX - r.left) / r.width * grid.w);
      var y = Math.floor((ev.clientY - r.top) / r.height * grid.h);
      return [Math.max(0, Math.min(grid.w - 1, x)), Math.max(0, Math.min(grid.h - 1, y))];
    }
    function stamp(cx, cy) {
      if (tool === 'bucket') { bucket(grid, cx, cy, cur); return; }
      var rr = brush - 1;
      for (var dy = -rr; dy <= rr; dy++) for (var dx = -rr; dx <= rr; dx++) {
        if (dx * dx + dy * dy > rr * rr + rr) continue;
        var x = cx + dx, y = cy + dy;
        if (x >= 0 && y >= 0 && x < grid.w && y < grid.h) grid.cells[y * grid.w + x] = cur;
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
      renderGrid(big, grid, true);
      var dataUrl = big.toDataURL('image/png');
      var meta = { name: 'Painted map', w: big.width, h: big.height };
      if (typeof opts.onSaveGrid === 'function') { try { opts.onSaveGrid(cloneGrid(grid)); } catch (_) {} }
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

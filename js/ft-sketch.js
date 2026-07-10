/* FreeTimeline — Sketch-a-Map: the simple map maker.
   Scribble a rough shape → clean anti-aliased coastline; then add mountains, rivers,
   lakes, roads, snow, borders, and stamp place icons. Runs as a full-screen overlay.
   Public API: window.ftSketch.open({ packed:Uint8Array|null, icons:array|null,
     onSave(dataUrl, meta, packed, icons):Promise|void }).
   `packed` is the 7 painted layers quantised to bytes (land,relief,river,snow,lake,
   road,border) at GW×GH, so a map can be reopened and kept editing. */
(function () {
  if (window.ftSketch) return;
  var GW = 360, GH = 240, NL = 7;
  var ICONS = [['🏰', 'Kingdom'], ['🏯', 'Fortress'], ['🏘️', 'City'], ['🏠', 'Town'],
    ['🗼', 'Capital'], ['⚓', 'Port'], ['⛩️', 'Temple'], ['🗿', 'Ruin'],
    ['🌲', 'Forest'], ['⛰️', 'Peak'], ['⚔️', 'Battle'], ['💀', 'Danger']];

  function lum(c) { var m = (c || '').match(/\d+/g); return m ? (0.299 * +m[0] + 0.587 * +m[1] + 0.114 * +m[2]) : 255; }

  function ensureCss() {
    if (document.getElementById('ftsk-css')) return;
    var st = document.createElement('style'); st.id = 'ftsk-css';
    st.textContent =
      '.ftsk-ov{position:fixed;inset:0;z-index:9000;display:flex;flex-direction:column;font-family:inherit}' +
      '.ftsk-bar{display:flex;align-items:center;gap:12px;padding:9px 14px;flex-shrink:0;box-shadow:0 2px 10px rgba(0,0,0,.14)}' +
      '.ftsk-bar .ttl{display:flex;flex-direction:column;line-height:1.2;min-width:0}' +
      '.ftsk-bar .ttl strong{font-size:14px}' +
      '.ftsk-bar .ttl span{font-size:11px;opacity:.7}' +
      '.ftsk-sp{flex:1 1 auto}' +
      '.ftsk-btn{border-radius:9px;padding:8px 15px;cursor:pointer;font-weight:700;font-size:13px;white-space:nowrap;border:1px solid}' +
      '.ftsk-stage{flex:1 1 auto;position:relative;min-height:0;overflow:hidden}' +
      '.ftsk-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:crosshair}' +
      '.ftsk-rail{position:absolute;top:12px;left:12px;display:flex;flex-direction:column;gap:4px;z-index:3;border-radius:14px;padding:7px;box-shadow:0 8px 24px rgba(0,0,0,.28)}' +
      '.ftsk-tool{display:flex;align-items:center;gap:9px;border:1px solid transparent;background:transparent;font:600 13px/1 inherit;padding:8px 12px 8px 10px;border-radius:10px;cursor:pointer;text-align:left;min-width:126px}' +
      '.ftsk-tool .em{font-size:16px;width:20px;text-align:center}' +
      '.ftsk-sep{height:1px;margin:3px 4px}' +
      '.ftsk-gsep{height:1px;margin:5px 8px;opacity:.5}' +
      '.ftsk-cursor{position:absolute;border:1.5px solid rgba(255,255,255,.75);border-radius:50%;pointer-events:none;z-index:4;display:none;transform:translate(-50%,-50%);box-shadow:0 0 0 1px rgba(0,0,0,.35)}' +
      '.ftsk-bnum{font-size:11px;font-weight:700;opacity:.7;min-width:20px;text-align:right;font-variant-numeric:tabular-nums}' +
      '.ftsk-mini{display:flex;align-items:center;gap:8px;padding:5px 8px}' +
      '.ftsk-mini label{font-size:11px;font-weight:600;min-width:30px;opacity:.7}' +
      '.ftsk-mini input{accent-color:#2f7cf6;width:92px}' +
      '.ftsk-ghost{border-radius:9px;padding:8px 11px;cursor:pointer;font:600 12px inherit;border:1px solid}' +
      '.ftsk-icons{position:absolute;top:12px;left:160px;z-index:3;display:none;flex-direction:column;gap:6px;border-radius:14px;padding:9px;box-shadow:0 8px 24px rgba(0,0,0,.28);width:190px}' +
      '.ftsk-icons.show{display:flex}' +
      '.ftsk-icons .t{font-size:10.5px;font-weight:700;letter-spacing:.5px;opacity:.7;text-transform:uppercase}' +
      '.ftsk-icons .g{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}' +
      '.ftsk-ico{font-size:19px;line-height:1;padding:8px 0;border:1px solid;border-radius:9px;cursor:pointer;text-align:center}' +
      '.ftsk-icons .tip{font-size:11px;opacity:.7;line-height:1.4}' +
      '.ftsk-layers{position:absolute;top:12px;right:12px;z-index:3;display:flex;flex-direction:column;gap:1px;border-radius:14px;padding:9px 8px;box-shadow:0 8px 24px rgba(0,0,0,.28);width:198px}' +
      '.ftsk-layers .t{font-size:10.5px;font-weight:700;letter-spacing:.5px;opacity:.7;text-transform:uppercase;padding:2px 6px 7px}' +
      '.ftsk-lrow{display:flex;align-items:center;gap:8px;padding:6px 7px;border-radius:8px;font-size:12.5px;font-weight:600;cursor:default}' +
      '.ftsk-lrow .eye{cursor:pointer;width:20px;text-align:center;font-size:13px;user-select:none}' +
      '.ftsk-lrow .nm{flex:1;display:flex;align-items:center;gap:7px;min-width:0}' +
      '.ftsk-lrow .nm .le{font-size:14px;width:18px;text-align:center}' +
      '.ftsk-lrow.off{opacity:.4}' +
      '.ftsk-lrow .del{cursor:pointer;opacity:.45;font-size:12px;border:0;background:transparent;color:inherit;padding:2px 4px;border-radius:6px}' +
      '.ftsk-lrow .del:hover{opacity:1}' +
      '.ftsk-hint{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);z-index:3;pointer-events:none;border-radius:999px;padding:7px 16px;font-size:12.5px;box-shadow:0 6px 18px rgba(0,0,0,.2);transition:opacity .4s;white-space:nowrap;max-width:92vw;border:1px solid}';
    document.head.appendChild(st);
  }

  function open(opts) {
    opts = opts || {};
    ensureCss();
    var dark = lum(getComputedStyle(document.body).backgroundColor) < 128;
    var T = dark
      ? { chrome: '#111c31', line: '#26365c', ink: '#e7ecf7', sub: '#9fb0cf', panel: '#16203a', hover: 'rgba(255,255,255,.07)', tip: '#0e1830' }
      : { chrome: '#fffdf8', line: '#e6dac6', ink: '#3d2b1f', sub: '#7a6a55', panel: '#fffaf0', hover: 'rgba(120,80,30,.08)', tip: '#fffaf0' };
    var acc = '#2f7cf6';

    var ov = document.createElement('div'); ov.className = 'ftsk-ov'; ov.style.background = dark ? '#0c1424' : '#f3ead6';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Sketch a map');

    /* header */
    var bar = document.createElement('div'); bar.className = 'ftsk-bar';
    bar.style.background = T.chrome; bar.style.borderBottom = '1px solid ' + T.line; bar.style.color = T.ink;
    var ttl = document.createElement('div'); ttl.className = 'ttl';
    ttl.innerHTML = '<strong>✏️ Draw your map</strong><span>Scribble rough — it tidies itself. Then add terrain, water and places.</span>';
    var sp = document.createElement('div'); sp.className = 'ftsk-sp';
    var saveB = document.createElement('button'); saveB.className = 'ftsk-btn'; saveB.textContent = '✓ Use this map';
    saveB.style.cssText += 'background:' + acc + ';color:#fff;border-color:' + acc;
    var cancelB = document.createElement('button'); cancelB.className = 'ftsk-btn'; cancelB.textContent = '✕ Cancel';
    cancelB.style.cssText += 'background:transparent;color:' + T.ink + ';border-color:' + T.line;
    var undoB = document.createElement('button'); undoB.className = 'ftsk-btn'; undoB.textContent = '↶'; undoB.title = 'Undo (Ctrl+Z)';
    undoB.style.cssText += 'background:transparent;color:' + T.ink + ';border-color:' + T.line + ';font-size:16px;padding:6px 12px';
    var redoB = document.createElement('button'); redoB.className = 'ftsk-btn'; redoB.textContent = '↷'; redoB.title = 'Redo (Ctrl+Y)';
    redoB.style.cssText += 'background:transparent;color:' + T.ink + ';border-color:' + T.line + ';font-size:16px;padding:6px 12px';
    undoB.addEventListener('click', function () { undo(); });
    redoB.addEventListener('click', function () { redo(); });
    bar.appendChild(ttl); bar.appendChild(sp); bar.appendChild(undoB); bar.appendChild(redoB); bar.appendChild(saveB); bar.appendChild(cancelB);
    ov.appendChild(bar);

    /* stage */
    var stage = document.createElement('div'); stage.className = 'ftsk-stage';
    var disp = document.createElement('canvas'); disp.className = 'ftsk-canvas'; stage.appendChild(disp);

    var rail = document.createElement('div'); rail.className = 'ftsk-rail';
    rail.style.background = T.panel; rail.style.border = '1px solid ' + T.line; rail.style.color = T.ink;
    var TOOLS = [['land', '✏️', 'Draw land'], ['select', '🖱', 'Select'], ['erase', '🧽', 'Erase'], ['sep'],
      ['relief', '⛰️', 'Mountains'], ['snow', '❄️', 'Snow'], ['sep'],
      ['river', '🌊', 'River'], ['lake', '💧', 'Lake'], ['sep'],
      ['road', '🛤️', 'Road'], ['border', '🖊️', 'Border'], ['sep'],
      ['icon', '🏰', 'Places']];
    TOOLS.forEach(function (t) {
      if (t[0] === 'sep') { var s = document.createElement('div'); s.className = 'ftsk-gsep'; s.style.background = T.line; rail.appendChild(s); return; }
      var b = document.createElement('button'); b.className = 'ftsk-tool' + (t[0] === 'land' ? ' on' : '');
      b.dataset.t = t[0]; b.innerHTML = '<span class="em">' + t[1] + '</span>' + t[2];
      b.style.color = T.ink; rail.appendChild(b);
    });
    var sep = document.createElement('div'); sep.className = 'ftsk-sep'; sep.style.background = T.line; rail.appendChild(sep);
    var mini = document.createElement('div'); mini.className = 'ftsk-mini';
    mini.innerHTML = '<label>Brush</label>'; var size = document.createElement('input');
    size.type = 'range'; size.min = 4; size.max = 34; size.value = 16; mini.appendChild(size);
    var bnum = document.createElement('span'); bnum.className = 'ftsk-bnum'; bnum.textContent = '16'; mini.appendChild(bnum);
    rail.appendChild(mini);
    var clearB = document.createElement('button'); clearB.className = 'ftsk-ghost'; clearB.textContent = 'Clear all';
    clearB.style.background = T.panel; clearB.style.borderColor = T.line; clearB.style.color = T.ink; rail.appendChild(clearB);
    stage.appendChild(rail);

    var icoPanel = document.createElement('div'); icoPanel.className = 'ftsk-icons';
    icoPanel.style.background = T.panel; icoPanel.style.border = '1px solid ' + T.line; icoPanel.style.color = T.ink;
    icoPanel.innerHTML = '<span class="t">Stamp a place</span>';
    var ig = document.createElement('div'); ig.className = 'g'; icoPanel.appendChild(ig);
    var tip = document.createElement('span'); tip.className = 'tip'; tip.textContent = 'Click the map to place · drag to move · double-click to remove.'; icoPanel.appendChild(tip);
    stage.appendChild(icoPanel);

    var hint = document.createElement('div'); hint.className = 'ftsk-hint';
    hint.style.background = T.tip; hint.style.color = T.sub; hint.style.borderColor = T.line;
    hint.textContent = 'Draw a rough island — don’t worry, it’ll be tidied up automatically.';
    stage.appendChild(hint);
    var ring = document.createElement('div'); ring.className = 'ftsk-cursor'; stage.appendChild(ring);
    ov.appendChild(stage);
    document.body.appendChild(ov);

    /* ---- engine ---- */
    var dctx = disp.getContext('2d');
    var buf = document.createElement('canvas'); buf.width = GW; buf.height = GH;
    var bctx = buf.getContext('2d'); var imgD = bctx.createImageData(GW, GH);
    var land = f(), relief = f(), river = f(), snow = f(), lake = f(), road = f(), borderM = f();
    var LAY = [land, relief, river, snow, lake, road, borderM];
    var lb = f(), rb = f(), lkb = f(), el = f();
    var icons = [];
    var iconType = '🏰', selIcon = -1, dragIcon = -1;
    var tool = 'land', brush = 16, drawing = false, last = null;
    var vis = { land: true, lake: true, relief: true, river: true, snow: true, road: true, border: true, icons: true };
    function f() { return new Float32Array(GW * GH); }

    // restore prior work
    if (opts.packed && opts.packed.length === NL * GW * GH) {
      for (var L = 0; L < NL; L++) { var off = L * GW * GH, arr = LAY[L]; for (var k = 0; k < GW * GH; k++) arr[k] = opts.packed[off + k] / 255; }
    }
    if (Array.isArray(opts.icons)) icons = opts.icons.map(function (o) { return { type: o.type, x: o.x, y: o.y, size: o.size }; });

    function cl(v) { return v < 0 ? 0 : v > 255 ? 255 : Math.round(v); }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function mix(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
    function smooth(a, b, x) { if (x <= a) return 0; if (x >= b) return 1; var t = (x - a) / (b - a); return t * t * (3 - 2 * t); }
    function hash(x, y) { var n = (x * 374761393 + y * 668265263) | 0; n = (n ^ (n >> 13)) * 1274126177 | 0; return ((n ^ (n >> 16)) >>> 0) / 4294967295; }
    function vn(x, y) { var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; var tl = hash(xi, yi), tr = hash(xi + 1, yi), bl = hash(xi, yi + 1), br = hash(xi + 1, yi + 1); var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); return lerp(lerp(tl, tr, u), lerp(bl, br, u), v); }
    function ridge(x, y) { var a = 1 - Math.abs(2 * vn(x, y) - 1), b = 1 - Math.abs(2 * vn(x * 2.1, y * 2.1) - 1), c = 1 - Math.abs(2 * vn(x * 4.3, y * 4.3) - 1); return a * 0.6 + b * 0.3 + c * 0.1; }

    var SEA_DEEP = [24, 58, 88], SEA_SHORE = [92, 150, 182], SEA_SHOAL = [150, 196, 210];
    var LAKE_DEEP = [46, 96, 120], LAKE_SHORE = [110, 168, 186];
    var LAND_LO = [212, 198, 159], LAND_MID = [190, 168, 120], LAND_HI = [150, 112, 70], ROCK = [110, 80, 50];
    var SNOW = [242, 246, 250], RIVER = [70, 122, 162], ROAD = [120, 92, 58], BORDER = [150, 60, 60], INK = [58, 44, 28];

    function blur(src, dst, rad, passes) {
      var tmp = dst, a = src;
      for (var p = 0; p < passes; p++) {
        for (var y = 0; y < GH; y++) { var row = y * GW, acc = 0, n = 0, i; for (i = -rad; i <= rad; i++) { var x = Math.max(0, Math.min(GW - 1, i)); acc += a[row + x]; n++; } for (var x2 = 0; x2 < GW; x2++) { tmp[row + x2] = acc / n; var xo = x2 - rad, xi = x2 + rad + 1; acc -= a[row + Math.max(0, Math.min(GW - 1, xo))]; acc += a[row + Math.max(0, Math.min(GW - 1, xi))]; } }
        for (var x3 = 0; x3 < GW; x3++) { var acc2 = 0, n2 = 0, j; for (j = -rad; j <= rad; j++) { var yy = Math.max(0, Math.min(GH - 1, j)); acc2 += tmp[yy * GW + x3]; n2++; } for (var y2 = 0; y2 < GH; y2++) { dst[y2 * GW + x3] = acc2 / n2; var yo = y2 - rad, yi = y2 + rad + 1; acc2 -= tmp[Math.max(0, Math.min(GH - 1, yo)) * GW + x3]; acc2 += tmp[Math.max(0, Math.min(GH - 1, yi)) * GW + x3]; } }
        a = dst;
      }
    }
    function renderMap() {
      blur(land, lb, 3, 3); blur(relief, rb, 2, 1); blur(lake, lkb, 2, 1);
      for (var i2 = 0; i2 < el.length; i2++) { if (rb[i2] > 0.02) { var x = i2 % GW, y = (i2 / GW) | 0; el[i2] = rb[i2] * (0.45 + ridge(x * 0.09, y * 0.09) * 1.15); } else el[i2] = 0; }
      var d = imgD.data;
      for (var y = 0; y < GH; y++) for (var x = 0; x < GW; x++) {
        var i = y * GW + x, px = i * 4, v = lb[i];
        var landA = vis.land ? smooth(0.44, 0.56, v) : 0;
        var t = Math.min(1, (0.5 - Math.min(v, 0.5)) / 0.5);
        var ocean = t < 0.22 ? mix(SEA_SHOAL, SEA_SHORE, t / 0.22) : mix(SEA_SHORE, SEA_DEEP, (t - 0.22) / 0.78);
        var col;
        if (landA <= 0) col = ocean;
        else {
          var e = vis.relief ? Math.min(1.2, el[i]) : 0;
          var lc = e < 0.5 ? mix(LAND_LO, LAND_MID, e * 2) : mix(LAND_MID, LAND_HI, Math.min(1, (e - 0.5) * 2));
          if (e > 0.75) lc = mix(lc, ROCK, Math.min(0.7, (e - 0.75) * 1.6));
          var nz = (hash(x, y) - 0.5) * 8; lc = [cl(lc[0] + nz), cl(lc[1] + nz), cl(lc[2] + nz)];
          if (e > 0.05) { var gx = el[i + 1] - el[i - 1], gy = el[i + GW] - el[i - GW]; var sh = Math.max(-0.5, Math.min(0.5, (-gx - gy) * 3.6)); lc = [cl(lc[0] * (1 + sh)), cl(lc[1] * (1 + sh)), cl(lc[2] * (1 + sh))]; }
          if (e > 0.92) lc = mix(lc, SNOW, Math.min(0.8, (e - 0.92) * 6));
          if (vis.road && road[i] > 0.3) lc = mix(lc, ROAD, Math.min(0.85, road[i]));
          if (vis.river && river[i] > 0.22) lc = mix(lc, RIVER, Math.min(0.8, river[i]));
          var sn = vis.snow ? Math.min(1, snow[i]) : 0; if (sn > 0.05) lc = mix(lc, SNOW, sn);
          if (vis.border && borderM[i] > 0.3) lc = mix(lc, BORDER, Math.min(0.8, borderM[i]));
          var lkA = vis.lake ? smooth(0.45, 0.55, lkb[i]) : 0;
          var lakeCol = mix(LAKE_SHORE, LAKE_DEEP, Math.min(1, lkb[i]));
          var landCover = landA * (1 - lkA);
          var base = lkA > 0 ? mix(ocean, lakeCol, lkA) : ocean;
          col = mix(base, lc, landCover);
          var eLake = 1 - Math.min(1, Math.abs(lkb[i] - 0.5) / 0.05);
          if (landA > 0.5 && eLake > 0) col = mix(col, INK, eLake * eLake * 0.35);
        }
        var edge = 1 - Math.min(1, Math.abs(v - 0.5) / 0.045);
        if (edge > 0) col = mix(col, INK, edge * edge * 0.4);
        d[px] = cl(col[0]); d[px + 1] = cl(col[1]); d[px + 2] = cl(col[2]); d[px + 3] = 255;
      }
      bctx.putImageData(imgD, 0, 0);
    }
    function drawIcons(ctx, w, h) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (var k = 0; k < icons.length; k++) {
        var ic = icons[k], cx = ic.x / GW * w, cy = ic.y / GH * h, sz = ic.size * (w / disp.getBoundingClientRect().width || 1);
        if (ctx === dctx) sz = ic.size;
        if (ctx === dctx && k === selIcon) { ctx.save(); ctx.strokeStyle = 'rgba(47,124,246,.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, sz * 0.62, 0, 7); ctx.stroke(); ctx.restore(); }
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1;
        ctx.font = sz + 'px ' + getComputedStyle(document.body).fontFamily; ctx.fillText(ic.type, cx, cy); ctx.restore();
      }
    }
    function compose() {
      var r = disp.getBoundingClientRect();
      dctx.imageSmoothingEnabled = true; dctx.imageSmoothingQuality = 'high';
      dctx.clearRect(0, 0, r.width, r.height);
      dctx.drawImage(buf, 0, 0, r.width, r.height);
      if (vis.icons) drawIcons(dctx, r.width, r.height);
      if (selActive) drawSel(movingSel ? moveOff.x : 0, movingSel ? moveOff.y : 0);
    }
    function fit() { var r = disp.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1); disp.width = Math.round(r.width * dpr); disp.height = Math.round(r.height * dpr); dctx.setTransform(dpr, 0, 0, dpr, 0, 0); renderMap(); compose(); }
    function stamp(gx, gy) {
      var scale = GW / (disp.getBoundingClientRect().width || GW), rad = Math.max(2, brush * scale), r2 = rad * rad;
      var x0 = Math.max(0, Math.floor(gx - rad)), x1 = Math.min(GW - 1, Math.ceil(gx + rad));
      var y0 = Math.max(0, Math.floor(gy - rad)), y1 = Math.min(GH - 1, Math.ceil(gy + rad));
      for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
        var dx = x - gx, dy = y - gy, dd = dx * dx + dy * dy; if (dd > r2) continue;
        var i = y * GW + x, ff = 1 - Math.sqrt(dd) / rad, onLand = (land[i] > 0.3 || lb[i] > 0.4);
        if (tool === 'land') land[i] = Math.min(1, land[i] + ff * 0.8);
        else if (tool === 'erase') { land[i] = Math.max(0, land[i] - ff); relief[i] *= (1 - ff); snow[i] *= (1 - ff); river[i] *= (1 - ff); lake[i] *= (1 - ff); road[i] *= (1 - ff); borderM[i] *= (1 - ff); }
        else if (tool === 'relief') { if (onLand) relief[i] = Math.min(1, relief[i] + ff * 0.5); }
        else if (tool === 'river') { if (onLand) river[i] = Math.min(1, river[i] + ff * 0.9); }
        else if (tool === 'lake') { if (onLand) lake[i] = Math.min(1, lake[i] + ff * 0.8); }
        else if (tool === 'road') { if (onLand) road[i] = Math.min(1, road[i] + ff * 0.9); }
        else if (tool === 'snow') { if (onLand) snow[i] = Math.min(1, snow[i] + ff * 0.5); }
        else if (tool === 'border') { if (onLand) borderM[i] = Math.min(1, borderM[i] + ff * 0.7); }
      }
    }
    function toGrid(ev) { var r = disp.getBoundingClientRect(); return { x: (ev.clientX - r.left) / r.width * GW, y: (ev.clientY - r.top) / r.height * GH }; }
    function line(a, b) { var dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy), steps = Math.max(1, Math.ceil(dist / 1.5)); for (var s = 0; s <= steps; s++) stamp(a.x + dx * s / steps, a.y + dy * s / steps); }
    var raf = null; function queue() { if (raf) return; raf = requestAnimationFrame(function () { raf = null; renderMap(); compose(); }); }
    function iconHit(ev) { var r = disp.getBoundingClientRect(); for (var k = icons.length - 1; k >= 0; k--) { var ic = icons[k], cx = ic.x / GW * r.width + r.left, cy = ic.y / GH * r.height + r.top; if (Math.hypot(ev.clientX - cx, ev.clientY - cy) < Math.max(14, ic.size * 0.6)) return k; } return -1; }

    var hintGone = false;
    function hideHint() { if (hintGone) return; hintGone = true; hint.style.opacity = 0; setTimeout(function () { if (hint.parentNode) hint.remove(); }, 450); }

    disp.addEventListener('pointerdown', function (e) {
      try { disp.setPointerCapture(e.pointerId); } catch (_) {} hideHint();
      if (tool === 'select') {
        var gs = toGrid(e);
        if (selActive && selType === 'land') { var hk = handleHit(e); if (hk >= 0) { pushUndo(); dragHandle = hk; return; } }
        if (selActive && inSel(gs.x, gs.y)) { movingSel = true; moveStart = gs; moveOff = { x: 0, y: 0 }; }
        else { floodSelect(gs.x, gs.y); }
        compose(); return;
      }
      if (tool === 'icon') {
        var hit = iconHit(e);
        if (hit >= 0) { pushUndo(); selIcon = hit; dragIcon = hit; compose(); }
        else { pushUndo(); var g = toGrid(e); icons.push({ type: iconType, x: g.x, y: g.y, size: Math.max(16, brush * 1.5) }); selIcon = icons.length - 1; compose(); }
        return;
      }
      pushUndo();
      drawing = true; last = toGrid(e); stamp(last.x, last.y); queue();
    });
    disp.addEventListener('pointermove', function (e) {
      if (dragHandle >= 0) { var gh = toGrid(e); hR[dragHandle] = Math.max(2, Math.hypot(gh.x - hCX, gh.y - hCY)); rasterizeHandles(); renderMap(); compose(); return; }
      if (movingSel) { var gm = toGrid(e); moveOff = { x: Math.round(gm.x - moveStart.x), y: Math.round(gm.y - moveStart.y) }; compose(); return; }
      if (dragIcon >= 0) { var g = toGrid(e); icons[dragIcon].x = g.x; icons[dragIcon].y = g.y; compose(); return; }
      if (!drawing) return; var g2 = toGrid(e); line(last, g2); last = g2; queue();
    });
    var PAINT = ['land', 'erase', 'relief', 'river', 'lake', 'road', 'snow', 'border'];
    disp.addEventListener('pointermove', function (e) {
      if (PAINT.indexOf(tool) < 0) { ring.style.display = 'none'; return; }
      var sr = stage.getBoundingClientRect(), d = brush * 2;
      ring.style.display = 'block'; ring.style.left = (e.clientX - sr.left) + 'px'; ring.style.top = (e.clientY - sr.top) + 'px';
      ring.style.width = d + 'px'; ring.style.height = d + 'px';
    });
    disp.addEventListener('pointerleave', function () { ring.style.display = 'none'; });
    function up() {
      if (dragHandle >= 0) { dragHandle = -1; renderMap(); compose(); return; }
      if (movingSel) { movingSel = false; if (moveOff.x || moveOff.y) { commitMove(moveOff.x, moveOff.y); if (selType === 'land') computeHandles(); } moveOff = { x: 0, y: 0 }; renderMap(); compose(); return; }
      if (drawing) { drawing = false; if (tool === 'land') fillHoles(); renderMap(); compose(); } dragIcon = -1;
    }
    window.addEventListener('pointerup', up);
    disp.addEventListener('dblclick', function (e) { if (tool !== 'icon') return; var hit = iconHit(e); if (hit >= 0) { pushUndo(); icons.splice(hit, 1); selIcon = -1; compose(); } });

    rail.querySelectorAll('.ftsk-tool').forEach(function (b) {
      b.addEventListener('click', function () {
        rail.querySelectorAll('.ftsk-tool').forEach(function (x) { x.classList.remove('on'); x.style.background = 'transparent'; x.style.color = T.ink; });
        b.classList.add('on'); b.style.background = acc; b.style.color = '#fff'; tool = b.dataset.t;
        icoPanel.classList.toggle('show', tool === 'icon');
        if (tool !== 'select') deselect();
        if (['land', 'erase', 'relief', 'river', 'lake', 'road', 'snow', 'border'].indexOf(tool) < 0) ring.style.display = 'none';
        if (tool !== 'icon') { selIcon = -1; compose(); }
      });
      if (b.classList.contains('on')) { b.style.background = acc; b.style.color = '#fff'; }
    });
    ICONS.forEach(function (p, idx) {
      var b = document.createElement('button'); b.className = 'ftsk-ico' + (idx === 0 ? ' on' : ''); b.textContent = p[0]; b.title = p[1];
      b.style.borderColor = idx === 0 ? acc : T.line; b.style.background = dark ? '#0e1830' : '#fffdf7'; b.style.color = T.ink;
      b.addEventListener('click', function () { ig.querySelectorAll('.ftsk-ico').forEach(function (x) { x.classList.remove('on'); x.style.borderColor = T.line; }); b.classList.add('on'); b.style.borderColor = acc; iconType = p[0]; });
      ig.appendChild(b);
    });
    size.addEventListener('input', function () { brush = +this.value; bnum.textContent = brush; });
    clearB.addEventListener('click', function () { pushUndo(); LAY.forEach(function (a) { a.fill(0); }); icons.length = 0; selIcon = -1; renderMap(); compose(); });

    function pack() { var u = new Uint8Array(NL * GW * GH); for (var L = 0; L < NL; L++) { var off = L * GW * GH, arr = LAY[L]; for (var k = 0; k < GW * GH; k++) u[off + k] = cl(arr[k] * 255); } return u; }
    function unpack(u) { for (var L = 0; L < NL; L++) { var off = L * GW * GH, arr = LAY[L]; for (var k = 0; k < GW * GH; k++) arr[k] = u[off + k] / 255; } }
    function hasContent() { for (var k = 0; k < land.length; k++) if (land[k] > 0.05) return true; return icons.length > 0; }

    /* ---- undo / redo (snapshots of the painted layers + icons) ---- */
    var undoStack = [], redoStack = [], UCAP = 30;
    function snap() { return { p: pack(), ic: icons.map(function (o) { return { type: o.type, x: o.x, y: o.y, size: o.size }; }) }; }
    function restoreSnap(s) { unpack(s.p); icons = s.ic.map(function (o) { return { type: o.type, x: o.x, y: o.y, size: o.size }; }); selIcon = -1; }
    function pushUndo() { undoStack.push(snap()); if (undoStack.length > UCAP) undoStack.shift(); redoStack.length = 0; }
    function undo() { if (!undoStack.length) return; redoStack.push(snap()); restoreSnap(undoStack.pop()); renderMap(); compose(); }
    function redo() { if (!redoStack.length) return; undoStack.push(snap()); restoreSnap(redoStack.pop()); renderMap(); compose(); }

    /* Close a rough outline: any water fully enclosed by land becomes land, so you can
       scribble a loop and the middle fills itself. Lake cells are left as water, so a
       lake inside the loop is preserved (land fills only around it). */
    function fillHoles() {
      var W = GW, H = GH, reach = new Uint8Array(W * H), stack = [];
      function seed(x, y) { var i = y * W + x; if (!reach[i] && land[i] < 0.4) { reach[i] = 1; stack.push(i); } }
      for (var x = 0; x < W; x++) { seed(x, 0); seed(x, H - 1); }
      for (var y = 0; y < H; y++) { seed(0, y); seed(W - 1, y); }
      while (stack.length) {
        var i = stack.pop(), ix = i % W, iy = (i / W) | 0, a;
        if (ix > 0) { a = i - 1; if (!reach[a] && land[a] < 0.4) { reach[a] = 1; stack.push(a); } }
        if (ix < W - 1) { a = i + 1; if (!reach[a] && land[a] < 0.4) { reach[a] = 1; stack.push(a); } }
        if (iy > 0) { a = i - W; if (!reach[a] && land[a] < 0.4) { reach[a] = 1; stack.push(a); } }
        if (iy < H - 1) { a = i + W; if (!reach[a] && land[a] < 0.4) { reach[a] = 1; stack.push(a); } }
      }
      for (var k = 0; k < W * H; k++) { if (land[k] < 0.4 && !reach[k] && lake[k] < 0.4) land[k] = 1; }
    }

    function close() { window.removeEventListener('pointerup', up); window.removeEventListener('resize', onResize); document.removeEventListener('keydown', onKey, true); if (ov.parentNode) ov.parentNode.removeChild(ov); }
    function onKey(e) {
      if (e.key === 'Escape') { if (selActive) { e.stopPropagation(); deselect(); } else close(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selActive) { e.preventDefault(); e.stopPropagation(); deleteSel(); return; }
      var mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) redo(); else undo(); }
      else if (mod && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); e.stopPropagation(); redo(); }
    }
    function onResize() { fit(); }
    window.addEventListener('resize', onResize);
    document.addEventListener('keydown', onKey, true);  // capture, so it beats the app's own Ctrl+Z
    cancelB.addEventListener('click', close);

    saveB.addEventListener('click', function () {
      if (!hasContent()) { close(); return; }
      // bake a crisp map image (upscale the low-res buffer + draw icons on top)
      var W = 1500, H = 1000, out = document.createElement('canvas'); out.width = W; out.height = H;
      var octx = out.getContext('2d'); octx.imageSmoothingEnabled = true; octx.imageSmoothingQuality = 'high';
      octx.drawImage(buf, 0, 0, W, H); if (vis.icons) drawIcons(octx, W, H);
      var dataUrl = out.toDataURL('image/png');
      var r = opts.onSave ? opts.onSave(dataUrl, { w: W, h: H, name: 'Sketched map' }, pack(), icons) : null;
      if (r && typeof r.then === 'function') { saveB.disabled = true; saveB.textContent = 'Saving…'; r.then(function (ok) { if (ok !== false) close(); else { saveB.disabled = false; saveB.textContent = '✓ Use this map'; } }); }
      else close();
    });

    /* ---- Select tool: flood-fill a region (land / lake / water) then move or delete it ---- */
    var selMask = new Uint8Array(GW * GH), selActive = false, selType = null;
    var movingSel = false, moveStart = null, moveOff = { x: 0, y: 0 };
    var selCanvas = document.createElement('canvas'); selCanvas.width = GW; selCanvas.height = GH;
    var selCtx = selCanvas.getContext('2d');
    // reshape handles (radial anchors around a land region — drag to widen/shorten that part)
    var HN = 20, hCX = 0, hCY = 0, hAng = [], hR = [], curSel = new Uint8Array(GW * GH), dragHandle = -1;

    function computeHandles() {
      var sum = 0, sx = 0, sy = 0, i;
      for (i = 0; i < selMask.length; i++) if (selMask[i]) { sx += i % GW; sy += (i / GW) | 0; sum++; }
      hAng = []; hR = [];
      if (!sum) return;
      hCX = sx / sum; hCY = sy / sum;
      var maxr = new Float32Array(HN);
      for (i = 0; i < selMask.length; i++) {
        if (!selMask[i]) continue;
        var x = i % GW - hCX, y = ((i / GW) | 0) - hCY, a = Math.atan2(y, x); if (a < 0) a += 2 * Math.PI;
        var k = Math.round(a / (2 * Math.PI) * HN) % HN, d = Math.hypot(x, y); if (d > maxr[k]) maxr[k] = d;
      }
      for (var kk = 0; kk < HN; kk++) { hAng[kk] = 2 * Math.PI * kk / HN; hR[kk] = maxr[kk]; }
      for (kk = 0; kk < HN; kk++) if (hR[kk] === 0) { var p = hR[(kk + HN - 1) % HN], n = hR[(kk + 1) % HN]; hR[kk] = (p + n) / 2 || 3; }
      curSel = selMask.slice();
    }
    function interpR(a) { if (a < 0) a += 2 * Math.PI; var f = a / (2 * Math.PI) * HN, i0 = Math.floor(f) % HN, i1 = (i0 + 1) % HN, fr = f - Math.floor(f); return hR[i0] * (1 - fr) + hR[i1] * fr; }
    function rasterizeHandles() {
      if (!hR.length) return;
      var maxr = 0, k; for (k = 0; k < HN; k++) if (hR[k] > maxr) maxr = hR[k]; maxr += 2;
      var x0 = Math.max(0, Math.floor(hCX - maxr)), x1 = Math.min(GW - 1, Math.ceil(hCX + maxr));
      var y0 = Math.max(0, Math.floor(hCY - maxr)), y1 = Math.min(GH - 1, Math.ceil(hCY + maxr));
      var ns = new Uint8Array(GW * GH);
      for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
        var dx = x - hCX, dy = y - hCY; if (Math.hypot(dx, dy) <= interpR(Math.atan2(dy, dx))) ns[y * GW + x] = 1;
      }
      for (var i = 0; i < curSel.length; i++) if (curSel[i] && !ns[i]) land[i] = 0;
      for (i = 0; i < ns.length; i++) if (ns[i]) land[i] = 1;
      curSel = ns; selMask = ns;
    }
    function handleHit(ev) {
      if (!hR.length) return -1;
      var r = disp.getBoundingClientRect();
      for (var k = 0; k < HN; k++) {
        var gx = hCX + Math.cos(hAng[k]) * hR[k], gy = hCY + Math.sin(hAng[k]) * hR[k];
        var px = gx / GW * r.width + r.left, py = gy / GH * r.height + r.top;
        if (Math.hypot(ev.clientX - px, ev.clientY - py) < 11) return k;
      }
      return -1;
    }
    function drawHandles() {
      if (selType !== 'land' || !hR.length || movingSel) return;
      var r = disp.getBoundingClientRect();
      dctx.save(); dctx.lineWidth = 2; dctx.strokeStyle = '#2f7cf6'; dctx.fillStyle = '#fff';
      for (var k = 0; k < HN; k++) {
        var gx = hCX + Math.cos(hAng[k]) * hR[k], gy = hCY + Math.sin(hAng[k]) * hR[k];
        dctx.beginPath(); dctx.arc(gx / GW * r.width, gy / GH * r.height, 5, 0, 7); dctx.fill(); dctx.stroke();
      }
      dctx.restore();
    }

    function floodSelect(gx, gy) {
      var cx = Math.max(0, Math.min(GW - 1, Math.round(gx))), cy = Math.max(0, Math.min(GH - 1, Math.round(gy)));
      var start = cy * GW + cx, pred, type;
      if (lake[start] > 0.4) { type = 'lake'; pred = function (i) { return lake[i] > 0.4; }; }
      else if (land[start] > 0.4) { type = 'land'; pred = function (i) { return land[i] > 0.4; }; }
      else { type = 'water'; pred = function (i) { return land[i] < 0.4 && lake[i] <= 0.4; }; }
      selMask = new Uint8Array(GW * GH);
      if (!pred(start)) { selActive = false; selType = null; hideSelBar(); return; }
      var stack = [start]; selMask[start] = 1;
      while (stack.length) {
        var i = stack.pop(), ix = i % GW, iy = (i / GW) | 0, j;
        if (ix > 0) { j = i - 1; if (!selMask[j] && pred(j)) { selMask[j] = 1; stack.push(j); } }
        if (ix < GW - 1) { j = i + 1; if (!selMask[j] && pred(j)) { selMask[j] = 1; stack.push(j); } }
        if (iy > 0) { j = i - GW; if (!selMask[j] && pred(j)) { selMask[j] = 1; stack.push(j); } }
        if (iy < GH - 1) { j = i + GW; if (!selMask[j] && pred(j)) { selMask[j] = 1; stack.push(j); } }
      }
      selActive = true; selType = type; showSelBar();
      if (type === 'land') computeHandles(); else hR = [];
    }
    function inSel(gx, gy) { var cx = Math.round(gx), cy = Math.round(gy); if (cx < 0 || cy < 0 || cx >= GW || cy >= GH) return false; return !!selMask[cy * GW + cx]; }
    function deselect() { selActive = false; selType = null; movingSel = false; dragHandle = -1; hR = []; selMask = new Uint8Array(GW * GH); hideSelBar(); compose(); }

    function drawSel(offX, offY) {
      if (!selActive) return;
      var d = selCtx.createImageData(GW, GH), p = d.data;
      for (var i = 0; i < selMask.length; i++) {
        if (!selMask[i]) continue;
        var ix = i % GW, iy = (i / GW) | 0;
        var edge = (ix === 0 || !selMask[i - 1]) || (ix === GW - 1 || !selMask[i + 1]) || (iy === 0 || !selMask[i - GW]) || (iy === GH - 1 || !selMask[i + GW]);
        var px = i * 4; p[px] = 90; p[px + 1] = 200; p[px + 2] = 255; p[px + 3] = edge ? 235 : 42;
      }
      selCtx.putImageData(d, 0, 0);
      var r = disp.getBoundingClientRect();
      dctx.imageSmoothingEnabled = true;
      dctx.drawImage(selCanvas, (offX || 0) / GW * r.width, (offY || 0) / GH * r.height, r.width, r.height);
      drawHandles();
    }
    function commitMove(dx, dy) {
      pushUndo();
      var saved = [], i;
      for (i = 0; i < selMask.length; i++) if (selMask[i]) saved.push([i, land[i], relief[i], river[i], snow[i], lake[i], road[i], borderM[i]]);
      saved.forEach(function (s) { var k = s[0]; land[k] = relief[k] = river[k] = snow[k] = lake[k] = road[k] = borderM[k] = 0; });
      var ns = new Uint8Array(GW * GH);
      saved.forEach(function (s) {
        var k = s[0], x = k % GW + dx, y = (k / GW | 0) + dy;
        if (x < 0 || x >= GW || y < 0 || y >= GH) return;
        var j = y * GW + x;
        land[j] = Math.min(1, land[j] + s[1]); relief[j] = Math.min(1, relief[j] + s[2]); river[j] = Math.min(1, river[j] + s[3]);
        snow[j] = Math.min(1, snow[j] + s[4]); lake[j] = Math.min(1, lake[j] + s[5]); road[j] = Math.min(1, road[j] + s[6]); borderM[j] = Math.min(1, borderM[j] + s[7]);
        ns[j] = 1;
      });
      selMask = ns;
    }
    function deleteSel() {
      if (!selActive || selType === 'water') return;
      pushUndo();
      for (var i = 0; i < selMask.length; i++) {
        if (!selMask[i]) continue;
        if (selType === 'lake') lake[i] = 0;
        else { land[i] = relief[i] = river[i] = snow[i] = lake[i] = road[i] = borderM[i] = 0; }
      }
      deselect(); renderMap(); compose();
    }

    /* floating selection toolbar */
    var selBar = document.createElement('div');
    selBar.style.cssText = 'position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:5;display:none;align-items:center;gap:10px;border-radius:12px;padding:7px 10px 7px 14px;box-shadow:0 8px 24px rgba(0,0,0,.3);font-size:12.5px;font-weight:600';
    selBar.style.background = T.panel; selBar.style.border = '1px solid ' + T.line; selBar.style.color = T.ink;
    var selMsg = document.createElement('span'); selMsg.style.opacity = '.8'; selBar.appendChild(selMsg);
    function selBtn(txt) { var b = document.createElement('button'); b.textContent = txt; b.style.cssText = 'border-radius:8px;padding:6px 11px;cursor:pointer;font:600 12px inherit;background:transparent;color:' + T.ink + ';border:1px solid ' + T.line; return b; }
    var delBtn = selBtn('🗑 Delete'), dsBtn = selBtn('✕ Deselect');
    delBtn.addEventListener('click', deleteSel); dsBtn.addEventListener('click', deselect);
    selBar.appendChild(delBtn); selBar.appendChild(dsBtn);
    stage.appendChild(selBar);
    function showSelBar() {
      selMsg.textContent = selType === 'water' ? 'Water selected' : (selType === 'lake' ? 'Lake selected — drag to move' : 'Land selected — drag to move');
      delBtn.style.display = selType === 'water' ? 'none' : '';
      selBar.style.display = 'flex';
    }
    function hideSelBar() { selBar.style.display = 'none'; }

    /* ---- Layers panel (Photoshop-style: show / hide / clear each layer) ---- */
    function clearLayer(k) {
      var map = { land: land, relief: relief, river: river, snow: snow, lake: lake, road: road, border: borderM };
      if (k === 'icons') { icons.length = 0; selIcon = -1; }
      else if (map[k]) map[k].fill(0);
    }
    var layPanel = document.createElement('div'); layPanel.className = 'ftsk-layers';
    layPanel.style.background = T.panel; layPanel.style.border = '1px solid ' + T.line; layPanel.style.color = T.ink;
    layPanel.innerHTML = '<span class="t">Layers</span>';
    var LAYDEF = [['icons', 'Places', '🏰'], ['border', 'Borders', '🖊️'], ['road', 'Roads', '🛤️'],
      ['river', 'Rivers', '🌊'], ['snow', 'Snow', '❄️'], ['relief', 'Mountains', '⛰️'],
      ['lake', 'Lakes', '💧'], ['land', 'Land', '✏️']];
    LAYDEF.forEach(function (d) {
      var row = document.createElement('div'); row.className = 'ftsk-lrow';
      var eye = document.createElement('span'); eye.className = 'eye'; eye.textContent = '👁'; eye.title = 'Show / hide layer';
      var nm = document.createElement('span'); nm.className = 'nm'; nm.innerHTML = '<span class="le">' + d[2] + '</span>' + d[1];
      var del = document.createElement('button'); del.className = 'del'; del.textContent = '🗑'; del.title = 'Clear this layer';
      eye.addEventListener('click', function () {
        vis[d[0]] = !vis[d[0]]; row.classList.toggle('off', !vis[d[0]]); eye.textContent = vis[d[0]] ? '👁' : '🙈';
        if (d[0] === 'icons') compose(); else { renderMap(); compose(); }
      });
      del.addEventListener('click', function () { pushUndo(); clearLayer(d[0]); renderMap(); compose(); });
      row.appendChild(eye); row.appendChild(nm); row.appendChild(del); layPanel.appendChild(row);
    });
    stage.appendChild(layPanel);

    requestAnimationFrame(fit);
  }

  window.ftSketch = { open: open, GW: GW, GH: GH, layers: NL };
})();

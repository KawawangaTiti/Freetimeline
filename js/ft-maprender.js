/* ============================================================================
 * ft-maprender.js — shared map renderer with selectable art styles (Map P2.5).
 *
 * Takes an elevation grid (Float32Array, values 0..1) and paints it onto a
 * canvas in one of several cartographic STYLES. Used by the procedural
 * generator (ft-mapgen) and, later, the painter (ft-mappaint) so a world can be
 * shown as a hand-drawn atlas, a coloured relief map, etc. — all procedural, in
 * the browser, no external assets.
 *
 *   window.ftMapRender.render(canvas, {
 *     elevation: Float32Array(gw*gh), gw, gh,
 *     seaLevel: 0..1, seed: int, style: 'atlas'|'relief'
 *   })
 *
 * Styles are self-contained here; add a new one by adding a draw function and
 * an entry to STYLES.
 * ==========================================================================*/
(function () {
  'use strict';
  if (window.ftMapRender) return;

  /* --- noise (for moisture / stipple / grain; elevation is passed in) --- */
  function h2(x, y, s) { var h = (x * 374761393 + y * 668265263 + s * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function sm(t) { return t * t * (3 - 2 * t); }
  function vn(x, y, s) { var x0 = Math.floor(x), y0 = Math.floor(y), fx = sm(x - x0), fy = sm(y - y0); var a = h2(x0, y0, s), b = h2(x0 + 1, y0, s), c = h2(x0, y0 + 1, s), d = h2(x0 + 1, y0 + 1, s); return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; }
  function fbm(x, y, s, o) { var v = 0, a = .5, f = 1, t = 0; for (var i = 0; i < o; i++) { v += a * vn(x * f, y * f, s + i * 31); t += a; f *= 2; a *= .5; } return v / t; }
  function L(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  function landAt(E, gw, gh, x, y, seaT) { if (x < 0 || y < 0 || x >= gw || y >= gh) return false; return E[y * gw + x] >= seaT; }

  /* ---------------- RELIEF (coloured, hillshaded) ---------------- */
  function relief(ctx, W, H, o) {
    var E = o.elevation, gw = o.gw, gh = o.gh, seaT = o.seaLevel, seed = o.seed;
    var small = document.createElement('canvas'); small.width = gw; small.height = gh;
    var sc = small.getContext('2d'), img = sc.createImageData(gw, gh), D = img.data;
    var deep = [14, 38, 60], sea = [30, 74, 104], shore = [86, 150, 156], beach = [216, 202, 158],
        grass = [120, 150, 84], forest = [58, 100, 60], hill = [150, 150, 98], rock = [120, 110, 98], snow = [236, 240, 244];
    var isW = function (x, y) { return !landAt(E, gw, gh, x, y, seaT); };
    for (var j = 0; j < gh; j++) for (var i = 0; i < gw; i++) {
      var e = E[j * gw + i], k = (j * gw + i) * 4, col;
      if (e < seaT) {
        col = L(deep, sea, e / seaT);
        if (!isW(i + 1, j) || !isW(i - 1, j) || !isW(i, j + 1) || !isW(i, j - 1)) col = L(col, shore, 0.6);
      } else {
        var t = (e - seaT) / (1 - seaT), m = fbm(i / gw * 4 + 20, j / gh * 4 + 20, seed + 3, 4);
        if (t < 0.04) col = beach.slice();
        else if (t < 0.45) col = L(forest, grass, m < 0.5 ? m * 2 : 1);
        else if (t < 0.7) col = L(grass, hill, (t - 0.45) / 0.25);
        else if (t < 0.86) col = L(hill, rock, (t - 0.7) / 0.16);
        else col = L(rock, snow, (t - 0.86) / 0.14);
        var eL = E[j * gw + Math.max(0, i - 1)], eR = E[j * gw + Math.min(gw - 1, i + 1)],
            eU = E[Math.max(0, j - 1) * gw + i], eD = E[Math.min(gh - 1, j + 1) * gw + i];
        var gx = (eL - eR) * 3.2, gy = (eU - eD) * 3.2, ln = Math.sqrt(gx * gx + gy * gy + 1);
        var shd = (gx / ln) * (-0.52) + (gy / ln) * (-0.60) + (1 / ln) * 0.61;
        var f = 0.72 + shd * 0.7; if (f < 0.45) f = 0.45; if (f > 1.35) f = 1.35;
        col = [col[0] * f, col[1] * f, col[2] * f];
      }
      D[k] = col[0]; D[k + 1] = col[1]; D[k + 2] = col[2]; D[k + 3] = 255;
    }
    sc.putImageData(img, 0, 0); ctx.imageSmoothingEnabled = true; ctx.drawImage(small, 0, 0, W, H);
    var vg = ctx.createRadialGradient(W / 2, H * 0.44, H * 0.28, W / 2, H / 2, W * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(4,10,20,0.5)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }

  /* ---------------- ATLAS (parchment / hand-drawn) ---------------- */
  function atlas(ctx, W, H, o) {
    var E = o.elevation, gw = o.gw, gh = o.gh, seaT = o.seaLevel, seed = o.seed;
    var land = function (x, y) { return landAt(E, gw, gh, x, y, seaT); };
    var small = document.createElement('canvas'); small.width = gw; small.height = gh;
    var sc = small.getContext('2d'), img = sc.createImageData(gw, gh), D = img.data;
    var seaC = [176, 196, 196], land1 = [224, 214, 182], land2 = [206, 197, 158], hi = [196, 186, 150];
    for (var j = 0; j < gh; j++) for (var i = 0; i < gw; i++) {
      var e = E[j * gw + i], k = (j * gw + i) * 4, c;
      if (e < seaT) c = seaC; else { var t = (e - seaT) / (1 - seaT); c = t < 0.5 ? L(land1, land2, t * 2) : L(land2, hi, (t - 0.5) * 2); }
      D[k] = c[0]; D[k + 1] = c[1]; D[k + 2] = c[2]; D[k + 3] = 255;
    }
    ctx.fillStyle = '#e9ddc2'; ctx.fillRect(0, 0, W, H);
    sc.putImageData(img, 0, 0); ctx.imageSmoothingEnabled = true; ctx.drawImage(small, 0, 0, W, H);
    var cw = W / gw, ch = H / gh;
    function coast(off, width, alpha, color) {
      ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = width; ctx.beginPath();
      for (var y = 0; y < gh; y++) for (var x = 0; x < gw; x++) {
        if (!land(x, y)) continue;
        if (!land(x + 1, y)) { ctx.moveTo((x + 1) * cw + off, y * ch - off); ctx.lineTo((x + 1) * cw + off, (y + 1) * ch + off); }
        if (!land(x - 1, y)) { ctx.moveTo(x * cw - off, y * ch - off); ctx.lineTo(x * cw - off, (y + 1) * ch + off); }
        if (!land(x, y + 1)) { ctx.moveTo(x * cw - off, (y + 1) * ch + off); ctx.lineTo((x + 1) * cw + off, (y + 1) * ch + off); }
        if (!land(x, y - 1)) { ctx.moveTo(x * cw - off, y * ch - off); ctx.lineTo((x + 1) * cw + off, y * ch - off); }
      }
      ctx.stroke(); ctx.globalAlpha = 1;
    }
    coast(9, 1, 0.10, '#5b6b6b'); coast(6, 1, 0.16, '#5b6b6b'); coast(3, 1, 0.24, '#5b6b6b');
    coast(0, 2.2, 0.9, '#4a4030');
    // mountains as little peaks on high ground
    ctx.strokeStyle = '#5a4a33'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    for (var y2 = 2; y2 < gh - 2; y2 += 4) for (var x2 = 2; x2 < gw - 2; x2 += 4) {
      var ev = E[y2 * gw + x2]; if (ev < seaT + 0.28) continue; if (h2(x2, y2, 7) > 0.55) continue;
      var px = x2 * cw, py = y2 * ch, s = 2.2 + ev * 3;
      ctx.beginPath(); ctx.moveTo(px - s, py + s * 0.7); ctx.lineTo(px, py - s); ctx.lineTo(px + s, py + s * 0.7); ctx.stroke();
    }
    // forest stipple
    ctx.fillStyle = 'rgba(70,92,52,0.5)';
    for (var y3 = 1; y3 < gh - 1; y3 += 2) for (var x3 = 1; x3 < gw - 1; x3 += 2) {
      var e3 = E[y3 * gw + x3]; if (e3 < seaT + 0.03 || e3 > seaT + 0.26) continue;
      var mo = fbm(x3 / gw * 4 + 20, y3 / gh * 4 + 20, seed + 3, 4); if (mo < 0.58) continue;
      if (h2(x3, y3, 3) > 0.4) continue;
      ctx.beginPath(); ctx.arc(x3 * cw, y3 * ch, 1.3, 0, 7); ctx.fill();
    }
    // paper grain
    ctx.globalAlpha = 0.05;
    for (var n = 0; n < 2600; n++) { ctx.fillStyle = h2(n, n * 3, 1) > 0.5 ? '#000' : '#fff'; ctx.fillRect(h2(n, 1, 2) * W, h2(n, 2, 3) * H, 1, 1); }
    ctx.globalAlpha = 1;
  }

  var DRAW = { atlas: atlas, relief: relief };

  window.ftMapRender = {
    STYLES: [
      { id: 'atlas', name: 'Atlas (parchment)' },
      { id: 'relief', name: 'Relief (coloured)' }
    ],
    render: function (canvas, o) {
      var ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height);
      (DRAW[o.style] || relief)(ctx, canvas.width, canvas.height, o);
    }
  };
})();

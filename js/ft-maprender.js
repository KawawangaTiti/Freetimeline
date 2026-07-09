/* ============================================================================
 * ft-maprender.js — shared map renderer with selectable art styles.
 *
 * Paints a world onto a canvas in a chosen cartographic STYLE. It accepts two
 * data sources so the same styles work for the procedural generator and the
 * hand painter:
 *   - elevation: Float32Array(gw*gh), 0..1   (from ft-mapgen)
 *   - terrain:   Array(gw*gh) of type ids     (from ft-mappaint)
 *       0 deep water · 1 water · 2 sand · 3 grass · 4 forest · 5 mountain · 6 snow
 *
 * Both are reduced to a common set of per-cell facts (land mask, height, and
 * beach/forest/mountain/snow flags) which the styles draw from — so painted
 * forests and mountains are honoured, not guessed.
 *
 *   window.ftMapRender.render(canvas, {
 *     elevation | terrain, gw, gh, seaLevel, seed, style, climate
 *   })
 * ==========================================================================*/
(function () {
  'use strict';
  if (window.ftMapRender) return;

  function h2(x, y, s) { var h = (x * 374761393 + y * 668265263 + s * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function sm(t) { return t * t * (3 - 2 * t); }
  function vn(x, y, s) { var x0 = Math.floor(x), y0 = Math.floor(y), fx = sm(x - x0), fy = sm(y - y0); var a = h2(x0, y0, s), b = h2(x0 + 1, y0, s), c = h2(x0, y0 + 1, s), d = h2(x0 + 1, y0 + 1, s); return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; }
  function fbm(x, y, s, o) { var v = 0, a = .5, f = 1, t = 0; for (var i = 0; i < o; i++) { v += a * vn(x * f, y * f, s + i * 31); t += a; f *= 2; a *= .5; } return v / t; }
  function L(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  var RELIEF_PAL = {
    temperate: { deep: [14, 38, 60], sea: [30, 74, 104], shore: [86, 150, 156], beach: [216, 202, 158], grass: [120, 150, 84], forest: [58, 100, 60], hill: [150, 150, 98], rock: [120, 110, 98], snow: [236, 240, 244] },
    arid:      { deep: [20, 55, 72], sea: [36, 92, 110], shore: [96, 156, 150], beach: [224, 206, 150], grass: [172, 152, 96], forest: [132, 120, 74], hill: [156, 134, 92], rock: [142, 120, 92], snow: [222, 214, 196] },
    tropical:  { deep: [10, 60, 78], sea: [26, 120, 124], shore: [82, 184, 168], beach: [228, 214, 150], grass: [88, 162, 74], forest: [40, 118, 60], hill: [122, 152, 80], rock: [120, 120, 92], snow: [236, 240, 236] },
    frozen:    { deep: [24, 52, 78], sea: [54, 96, 124], shore: [132, 172, 192], beach: [196, 206, 214], grass: [150, 170, 168], forest: [110, 140, 140], hill: [172, 182, 182], rock: [150, 158, 164], snow: [240, 245, 250] }
  };
  var ATLAS_TINT = {
    temperate: { l1: [224, 214, 182], l2: [206, 197, 158], hi: [196, 186, 150], sea: [176, 196, 196] },
    arid:      { l1: [228, 214, 168], l2: [212, 192, 140], hi: [200, 180, 132], sea: [188, 200, 190] },
    tropical:  { l1: [216, 214, 172], l2: [196, 200, 148], hi: [186, 196, 140], sea: [168, 204, 194] },
    frozen:    { l1: [220, 220, 214], l2: [204, 206, 204], hi: [196, 200, 204], sea: [196, 208, 210] }
  };
  var TERRAIN_H = [0.16, 0.34, 0.46, 0.55, 0.57, 0.82, 0.95];

  /* Reduce either data source to common per-cell facts. */
  function build(o) {
    var gw = o.gw, gh = o.gh, N = gw * gh, seaT = (o.seaLevel != null ? o.seaLevel : 0.44), seed = o.seed || 1;
    var HT = new Float32Array(N), LAND = new Uint8Array(N), MT = new Uint8Array(N), FR = new Uint8Array(N), SN = new Uint8Array(N), BE = new Uint8Array(N);
    if (o.terrain) {
      for (var i = 0; i < N; i++) {
        var tp = o.terrain[i] | 0; HT[i] = TERRAIN_H[tp] != null ? TERRAIN_H[tp] : 0;
        LAND[i] = tp >= 2 ? 1 : 0; BE[i] = tp === 2 ? 1 : 0; FR[i] = tp === 4 ? 1 : 0; MT[i] = tp === 5 ? 1 : 0; SN[i] = tp === 6 ? 1 : 0;
      }
    } else {
      var E = o.elevation;
      for (var y = 0; y < gh; y++) for (var x = 0; x < gw; x++) {
        var j = y * gw + x, e = E[j]; HT[j] = e;
        if (e >= seaT) {
          LAND[j] = 1; var t = (e - seaT) / (1 - seaT);
          if (t < 0.04) BE[j] = 1;
          if (t > 0.86) SN[j] = 1;
          if (t > 0.6) MT[j] = 1;
          else { var m = fbm(x / gw * 4 + 20, y / gh * 4 + 20, seed + 3, 4); if (t > 0.03 && m > 0.58) FR[j] = 1; }
        }
      }
    }
    return { gw: gw, gh: gh, N: N, seaT: seaT, seed: seed, climate: o.climate || 'temperate', terrain: !!o.terrain, HT: HT, LAND: LAND, MT: MT, FR: FR, SN: SN, BE: BE };
  }

  /* ---------------- RELIEF (coloured) ---------------- */
  function relief(ctx, W, H, S) {
    var gw = S.gw, gh = S.gh, seaT = S.seaT, P = RELIEF_PAL[S.climate] || RELIEF_PAL.temperate;
    var HT = S.HT, LAND = S.LAND, MT = S.MT, FR = S.FR, SN = S.SN, BE = S.BE;
    var small = document.createElement('canvas'); small.width = gw; small.height = gh;
    var sc = small.getContext('2d'), img = sc.createImageData(gw, gh), D = img.data;
    function isW(x, y) { if (x < 0 || y < 0 || x >= gw || y >= gh) return true; return !LAND[y * gw + x]; }
    for (var y = 0; y < gh; y++) for (var x = 0; x < gw; x++) {
      var j = y * gw + x, k = j * 4, col;
      if (!LAND[j]) {
        col = L(P.deep, P.sea, Math.min(1, HT[j] / seaT));
        if (!isW(x + 1, y) || !isW(x - 1, y) || !isW(x, y + 1) || !isW(x, y - 1)) col = L(col, P.shore, 0.6);
      } else {
        var t = Math.max(0, Math.min(1, (HT[j] - seaT) / (1 - seaT)));
        if (SN[j]) col = P.snow;
        else if (MT[j]) col = L(P.hill, P.rock, 0.6);
        else if (FR[j]) col = P.forest;
        else if (BE[j]) col = P.beach;
        else col = L(P.grass, P.hill, Math.max(0, Math.min(1, (t - 0.06) / 0.5)));
        if (!S.terrain) { /* hillshade from the continuous elevation gradient */
          var eL = HT[y * gw + Math.max(0, x - 1)], eR = HT[y * gw + Math.min(gw - 1, x + 1)],
              eU = HT[Math.max(0, y - 1) * gw + x], eD = HT[Math.min(gh - 1, y + 1) * gw + x];
          var gx = (eL - eR) * 3.2, gy = (eU - eD) * 3.2, ln = Math.sqrt(gx * gx + gy * gy + 1);
          var shd = (gx / ln) * (-0.52) + (gy / ln) * (-0.60) + (1 / ln) * 0.61;
          var f = 0.72 + shd * 0.7; if (f < 0.45) f = 0.45; if (f > 1.35) f = 1.35;
          col = [col[0] * f, col[1] * f, col[2] * f];
        }
      }
      D[k] = col[0]; D[k + 1] = col[1]; D[k + 2] = col[2]; D[k + 3] = 255;
    }
    sc.putImageData(img, 0, 0); ctx.imageSmoothingEnabled = true; ctx.drawImage(small, 0, 0, W, H);
    var vg = ctx.createRadialGradient(W / 2, H * 0.44, H * 0.28, W / 2, H / 2, W * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(4,10,20,0.5)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }

  /* ---------------- ATLAS (parchment) ---------------- */
  function atlas(ctx, W, H, S) {
    var gw = S.gw, gh = S.gh, HT = S.HT, LAND = S.LAND, MT = S.MT, FR = S.FR, seaT = S.seaT;
    var AT = ATLAS_TINT[S.climate] || ATLAS_TINT.temperate;
    var seaC = AT.sea, land1 = AT.l1, land2 = AT.l2, hi = AT.hi;
    var small = document.createElement('canvas'); small.width = gw; small.height = gh;
    var sc = small.getContext('2d'), img = sc.createImageData(gw, gh), D = img.data;
    for (var j = 0; j < S.N; j++) {
      var k = j * 4, c;
      if (!LAND[j]) c = seaC; else { var t = Math.max(0, Math.min(1, (HT[j] - seaT) / (1 - seaT))); c = t < 0.5 ? L(land1, land2, t * 2) : L(land2, hi, (t - 0.5) * 2); }
      D[k] = c[0]; D[k + 1] = c[1]; D[k + 2] = c[2]; D[k + 3] = 255;
    }
    ctx.fillStyle = '#e9ddc2'; ctx.fillRect(0, 0, W, H);
    sc.putImageData(img, 0, 0); ctx.imageSmoothingEnabled = true; ctx.drawImage(small, 0, 0, W, H);
    var cw = W / gw, ch = H / gh;
    function land(x, y) { if (x < 0 || y < 0 || x >= gw || y >= gh) return false; return !!LAND[y * gw + x]; }
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
    coast(9, 1, 0.10, '#5b6b6b'); coast(6, 1, 0.16, '#5b6b6b'); coast(3, 1, 0.24, '#5b6b6b'); coast(0, 2.2, 0.9, '#4a4030');
    var step = Math.max(2, Math.round(gw / 90));
    ctx.strokeStyle = '#5a4a33'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    for (var y2 = 1; y2 < gh - 1; y2 += step) for (var x2 = 1; x2 < gw - 1; x2 += step) {
      if (!MT[y2 * gw + x2]) continue; if (h2(x2, y2, 7) > 0.7) continue;
      var px = x2 * cw, py = y2 * ch, s = 2.4 + HT[y2 * gw + x2] * 3;
      ctx.beginPath(); ctx.moveTo(px - s, py + s * 0.7); ctx.lineTo(px, py - s); ctx.lineTo(px + s, py + s * 0.7); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(70,92,52,0.5)';
    var fstep = Math.max(1, Math.round(gw / 240));
    for (var y3 = 1; y3 < gh - 1; y3 += fstep) for (var x3 = 1; x3 < gw - 1; x3 += fstep) {
      if (!FR[y3 * gw + x3]) continue; if (h2(x3, y3, 3) > 0.5) continue;
      ctx.beginPath(); ctx.arc(x3 * cw, y3 * ch, 1.3, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 0.05;
    for (var n = 0; n < 2600; n++) { ctx.fillStyle = h2(n, n * 3, 1) > 0.5 ? '#000' : '#fff'; ctx.fillRect(h2(n, 1, 2) * W, h2(n, 2, 3) * H, 1, 1); }
    ctx.globalAlpha = 1;
  }

  var DRAW = { atlas: atlas, relief: relief };

  window.ftMapRender = {
    STYLES: [{ id: 'atlas', name: 'Atlas (parchment)' }, { id: 'relief', name: 'Relief (coloured)' }],
    render: function (canvas, o) {
      var ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height);
      (DRAW[o.style] || relief)(ctx, canvas.width, canvas.height, build(o));
    }
  };
})();

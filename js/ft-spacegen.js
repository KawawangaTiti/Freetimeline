/* FreeTimeline — space-map generator (universe / galaxy / star system).

   The space sibling of ft-mapgen: procedural star fields, spiral galaxies and
   star systems with orbits, rendered on canvas with zero dependencies and a
   seeded PRNG (same seed → same map at any resolution; preview and final render
   share the 3:2 aspect so pin coordinates stay identical).

   Bridge API (used by ft-places.js):
     window.ftSpaceGen.open({
       scale:   'universe' | 'galaxy' | 'system',   // preselects the mode tab
       onApply: function(dataUrl, {w,h,name,scale}) -> Promise<bool>,
       onAddPlaces: function(pins)                  // [{name,x,y,color,icon}] normalized 0..1
     })
*/
(function () {
  'use strict';
  if (window.ftSpaceGen) return;

  /* ---------- seeded randomness ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hashSeed(str) {
    var h = 2166136261; str = String(str || '');
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function gauss(rnd) { return (rnd() + rnd() + rnd() - 1.5) / 1.5; } // ~N(0,0.4), cheap

  /* ---------- palettes ---------- */
  var PALETTES = {
    deep:   { label: 'Deep space',    bg0: '#020308', bg1: '#0a1026', neb: ['#20345f', '#2a4a8a', '#173057'], glow: '#9db8f0' },
    violet: { label: 'Violet nebula', bg0: '#050308', bg1: '#140a26', neb: ['#3d2a6a', '#6a2a8a', '#2a1a57'], glow: '#c9a8f0' },
    ember:  { label: 'Ember drift',   bg0: '#060304', bg1: '#1c0d12', neb: ['#5f2020', '#8a4a2a', '#571717'], glow: '#f0b89d' },
    void:   { label: 'Emerald void',  bg0: '#020606', bg1: '#0a2020', neb: ['#1f5f52', '#2a8a6a', '#175748'], glow: '#9df0d2' }
  };

  /* ---------- name generator ---------- */
  var SYL_A = ['Al', 'Ba', 'Ce', 'Da', 'El', 'Fa', 'Ga', 'Ha', 'Ith', 'Ka', 'Lu', 'Ma', 'Ne', 'Or', 'Pra', 'Qua', 'Ra', 'Se', 'Ta', 'Ur', 'Va', 'Wy', 'Xe', 'Ya', 'Za'];
  var SYL_B = ['ba', 'ce', 'dal', 'del', 'dor', 'eth', 'gar', 'ion', 'ith', 'lan', 'lor', 'mar', 'mir', 'nar', 'nis', 'ra', 'rin', 'ris', 'sar', 'thi', 'ur', 'vex', 'zor'];
  var SYL_C = ['a', 'ae', 'ar', 'eus', 'ia', 'ion', 'is', 'os', 'ua', 'um', 'us'];
  function genName(rnd, kind, used) {
    for (var tries = 0; tries < 24; tries++) {
      var n = SYL_A[(rnd() * SYL_A.length) | 0] + SYL_B[(rnd() * SYL_B.length) | 0] +
        (rnd() < 0.55 ? SYL_C[(rnd() * SYL_C.length) | 0] : '');
      if (kind === 'system' && rnd() < 0.3) n += ' ' + ['Prime', 'Major', 'Minor', 'II', 'III'][(rnd() * 5) | 0];
      if (kind === 'galaxy' && rnd() < 0.45) n += ' Galaxy';
      if (!used[n]) { used[n] = 1; return n; }
    }
    return 'Sector ' + (((rnd() * 899) | 0) + 100);
  }

  /* ============================ layout (size-independent) ============================
     All shapes live in normalized page coords (x,y in 0..1 on a 3:2 canvas); radial
     sizes are in "min-dimension units" (fractions of canvas height, since H < W). */
  var ASPECT = 1.5; // W/H everywhere (preview + final) so pins are stable

  function makeLayout(mode, seedInt) {
    var rnd = mulberry32(seedInt), used = {};
    var L = { mode: mode, stars: [], blobs: [], pins: [] };
    var i, k;

    for (i = 0; i < 950; i++) {
      L.stars.push({
        x: rnd(), y: rnd(),
        r: rnd() < 0.86 ? (0.3 + rnd() * 0.8) : (1.1 + rnd() * 1.7),   // px at 1× height=480; scaled by H/480
        a: 0.2 + rnd() * 0.75,
        tint: rnd() < 0.1 ? 'warm' : (rnd() < 0.2 ? 'cool' : 'white')
      });
    }
    for (i = 0; i < 9; i++) {
      L.blobs.push({ x: rnd(), y: rnd(), r: 0.16 + rnd() * 0.26, c: (rnd() * 3) | 0, a: 0.05 + rnd() * 0.08 });
    }

    if (mode === 'galaxy') {
      var arms = 2 + ((rnd() * 3) | 0);
      var rot = 2.0 + rnd() * 1.4;              // total winding (× π)
      var tilt = rnd() * Math.PI;
      var squash = 0.5 + rnd() * 0.35;
      var maxR = 0.4;
      var g = { arms: arms, tilt: tilt, pts: [], coreR: 0.05 + rnd() * 0.025 };
      var candidates = [];
      for (var a = 0; a < arms; a++) {
        for (k = 0; k < 1500; k++) {
          var t = Math.pow(rnd(), 0.62);
          var th = t * rot * Math.PI + (a * 2 * Math.PI / arms) + gauss(rnd) * (0.34 * (1 - t) + 0.05);
          var r = maxR * (0.05 + 0.95 * t) * (1 + gauss(rnd) * 0.05);
          var lx = r * Math.cos(th), ly = r * Math.sin(th) * squash;
          var dx = lx * Math.cos(tilt) - ly * Math.sin(tilt);
          var dy = lx * Math.sin(tilt) + ly * Math.cos(tilt);
          g.pts.push({ dx: dx, dy: dy, a: 0.04 + rnd() * 0.14, w: rnd() < 0.2 ? 2 : 1, hot: rnd() < 0.1 });
          if (t > 0.22 && t < 0.95 && rnd() < 0.02) candidates.push({ dx: dx, dy: dy });
        }
      }
      L.gal = g;
      var want = 9 + ((rnd() * 5) | 0);
      pickSpaced(candidates, want, 0.07).forEach(function (c) {
        L.pins.push({ name: genName(rnd, 'system', used), icon: '☀️', color: '#ffd9a0',
          x: 0.5 + c.dx / ASPECT, y: 0.5 + c.dy });
      });
    }

    if (mode === 'system') {
      var n = 4 + ((rnd() * 5) | 0);
      var sys = {
        starR: 0.05 + rnd() * 0.02,
        starC: ['#ffd9a0', '#ffe9c9', '#ff8b6a', '#cfe0ff', '#fff3e0'][(rnd() * 5) | 0],
        orbits: [], belt: null
      };
      var r0 = 0.12, r1 = 0.46;
      for (i = 0; i < n; i++) {
        var rr = r0 + (r1 - r0) * (i / Math.max(1, n - 1)) + gauss(rnd) * 0.012;
        sys.orbits.push({
          r: rr, ang: rnd() * 2 * Math.PI,
          pr: 0.009 + rnd() * 0.017,
          color: ['#b7906a', '#8fa4b8', '#c46a4f', '#7fae8f', '#d8c07a', '#9a7fc4', '#6f8fd8'][(rnd() * 7) | 0],
          ring: rnd() < 0.22, moons: rnd() < 0.3 ? 1 + ((rnd() * 2) | 0) : 0
        });
      }
      if (rnd() < 0.45 && n > 2) {
        var bi = 1 + ((rnd() * (n - 2)) | 0);
        var br = (sys.orbits[bi].r + sys.orbits[bi + 1 < n ? bi + 1 : bi].r) / 2 + 0.02;
        var pts = [];
        for (k = 0; k < 320; k++) pts.push({ ang: rnd() * 2 * Math.PI, dr: gauss(rnd) * 0.012, a: 0.15 + rnd() * 0.35 });
        sys.belt = { r: br, pts: pts };
      }
      L.sys = sys;
      var starName = genName(rnd, 'system', used);
      L.pins.push({ name: starName, icon: '☀️', color: sys.starC, x: 0.5, y: 0.5 });
      sys.orbits.forEach(function (o, idx) {
        L.pins.push({ name: genName(rnd, 'planet', used), icon: '🪐', color: o.color,
          x: 0.5 + Math.cos(o.ang) * o.r / ASPECT, y: 0.5 + Math.sin(o.ang) * o.r });
      });
    }

    if (mode === 'universe') {
      var gals = [], wantG = 7 + ((rnd() * 5) | 0);
      for (i = 0; i < wantG; i++) {
        var pos = null;
        for (var tr = 0; tr < 40 && !pos; tr++) {
          var cx = 0.1 + rnd() * 0.8, cy = 0.12 + rnd() * 0.76, ok = true;
          for (k = 0; k < gals.length; k++) {
            var ddx = (cx - gals[k].x) * ASPECT, ddy = cy - gals[k].y;
            if (Math.sqrt(ddx * ddx + ddy * ddy) < 0.34) { ok = false; break; }
          }
          if (ok) pos = { x: cx, y: cy };
        }
        if (!pos) break;
        var kind = rnd() < 0.6 ? 'spiral' : (rnd() < 0.5 ? 'elliptical' : 'irregular');
        var gr = 0.055 + rnd() * 0.075;
        var garms = 2 + ((rnd() * 2) | 0), gtilt = rnd() * Math.PI, gsq = 0.4 + rnd() * 0.4;
        var gpts = [];
        for (k = 0; k < 420; k++) {
          var gt = Math.pow(rnd(), 0.6), gth, grr;
          if (kind === 'spiral') {
            gth = gt * 2.4 * Math.PI + ((k % garms) * 2 * Math.PI / garms) + gauss(rnd) * 0.3 * (1 - gt);
            grr = gr * (0.08 + 0.92 * gt);
          } else {
            gth = rnd() * 2 * Math.PI;
            grr = gr * Math.pow(rnd(), kind === 'elliptical' ? 0.5 : 0.8);
          }
          var glx = grr * Math.cos(gth), gly = grr * Math.sin(gth) * gsq;
          gpts.push({
            dx: glx * Math.cos(gtilt) - gly * Math.sin(gtilt),
            dy: glx * Math.sin(gtilt) + gly * Math.cos(gtilt),
            a: 0.05 + rnd() * 0.16
          });
        }
        gals.push({ x: pos.x, y: pos.y, r: gr, kind: kind, pts: gpts, hue: (rnd() * 3) | 0 });
      }
      L.unis = gals;
      /* faint cosmic-web filaments between neighbouring galaxies */
      L.fils = [];
      for (i = 0; i < gals.length; i++) {
        var best = -1, bd = 1e9;
        for (k = 0; k < gals.length; k++) {
          if (k === i) continue;
          var fdx = (gals[i].x - gals[k].x) * ASPECT, fdy = gals[i].y - gals[k].y;
          var d = fdx * fdx + fdy * fdy;
          if (d < bd) { bd = d; best = k; }
        }
        if (best > i) L.fils.push([i, best]);
      }
      gals.forEach(function (g) {
        L.pins.push({ name: genName(rnd, 'galaxy', used), icon: '🌀', color: '#c9a8f0', x: g.x, y: g.y });
      });
    }
    return L;
  }

  /* greedy spaced sampling of candidate points (normalized offsets from centre) */
  function pickSpaced(cands, want, minD) {
    var out = [];
    for (var i = 0; i < cands.length && out.length < want; i++) {
      var c = cands[i], ok = true;
      for (var k = 0; k < out.length; k++) {
        var dx = c.dx - out[k].dx, dy = c.dy - out[k].dy;
        if (Math.sqrt(dx * dx + dy * dy) < minD) { ok = false; break; }
      }
      if (ok) out.push(c);
    }
    return out;
  }

  /* ============================ rendering ============================ */
  function render(cv, L, pal) {
    var W = cv.width, H = cv.height, M = H; // min dimension (3:2 → H)
    var ctx = cv.getContext('2d');
    var X = function (nx) { return nx * W; }, Y = function (ny) { return ny * H; };
    var CX = W / 2, CY = H / 2;

    /* background */
    var bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, pal.bg0); bg.addColorStop(1, pal.bg1);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    /* nebula blobs */
    ctx.globalCompositeOperation = 'lighter';
    L.blobs.forEach(function (b) {
      var r = b.r * M;
      var g = ctx.createRadialGradient(X(b.x), Y(b.y), 0, X(b.x), Y(b.y), r);
      g.addColorStop(0, pal.neb[b.c]);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = b.a;
      ctx.fillStyle = g;
      ctx.fillRect(X(b.x) - r, Y(b.y) - r, r * 2, r * 2);
    });
    ctx.globalAlpha = 1;

    /* far stars */
    var sc = H / 480;
    L.stars.forEach(function (s) {
      var px = X(s.x), py = Y(s.y), r = s.r * sc;
      ctx.globalAlpha = s.a;
      ctx.fillStyle = s.tint === 'warm' ? '#ffe0b8' : s.tint === 'cool' ? '#c2d4ff' : '#f2f4fa';
      ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fill();
      if (s.r > 1.3) { // bright star: glow + flare
        var g2 = ctx.createRadialGradient(px, py, 0, px, py, r * 7);
        g2.addColorStop(0, 'rgba(255,255,255,.5)'); g2.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g2; ctx.globalAlpha = s.a * 0.6;
        ctx.fillRect(px - r * 7, py - r * 7, r * 14, r * 14);
        ctx.globalAlpha = s.a * 0.4; ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(0.6, r * 0.22);
        ctx.beginPath();
        ctx.moveTo(px - r * 5, py); ctx.lineTo(px + r * 5, py);
        ctx.moveTo(px, py - r * 5); ctx.lineTo(px, py + r * 5);
        ctx.stroke();
      }
    });
    ctx.globalAlpha = 1;

    if (L.mode === 'galaxy') drawGalaxy(ctx, L.gal, pal, CX, CY, M, W, H);
    if (L.mode === 'system') drawSystem(ctx, L.sys, pal, CX, CY, M);
    if (L.mode === 'universe') drawUniverse(ctx, L, pal, M, X, Y);

    ctx.globalCompositeOperation = 'source-over';
    /* vignette keeps the eye in the middle */
    var vg = ctx.createRadialGradient(CX, CY, M * 0.45, CX, CY, M * 1.05);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.42)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }

  function drawGalaxy(ctx, g, pal, CX, CY, M, W, H) {
    ctx.globalCompositeOperation = 'lighter';
    g.pts.forEach(function (p) {
      ctx.globalAlpha = p.a;
      ctx.fillStyle = p.hot ? '#ffffff' : pal.glow;
      var px = CX + p.dx * M, py = CY + p.dy * M, w = p.w * (M / 480);
      ctx.fillRect(px, py, w, w);
    });
    /* core */
    var cr = g.coreR * M;
    var c1 = ctx.createRadialGradient(CX, CY, 0, CX, CY, cr * 3.2);
    c1.addColorStop(0, 'rgba(255,248,230,.95)');
    c1.addColorStop(0.25, 'rgba(255,235,200,.45)');
    c1.addColorStop(1, 'rgba(255,235,200,0)');
    ctx.globalAlpha = 1; ctx.fillStyle = c1;
    ctx.fillRect(CX - cr * 3.2, CY - cr * 3.2, cr * 6.4, cr * 6.4);
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawSystem(ctx, sys, pal, CX, CY, M) {
    /* orbits */
    ctx.globalCompositeOperation = 'source-over';
    sys.orbits.forEach(function (o) {
      ctx.strokeStyle = 'rgba(255,255,255,.09)';
      ctx.lineWidth = Math.max(1, M / 620);
      ctx.beginPath(); ctx.arc(CX, CY, o.r * M, 0, 7); ctx.stroke();
    });
    /* asteroid belt */
    if (sys.belt) {
      ctx.fillStyle = '#c9c2b4';
      sys.belt.pts.forEach(function (p) {
        ctx.globalAlpha = p.a * 0.5;
        var rr = (sys.belt.r + p.dr) * M;
        ctx.fillRect(CX + Math.cos(p.ang) * rr, CY + Math.sin(p.ang) * rr, M / 480, M / 480);
      });
      ctx.globalAlpha = 1;
    }
    /* star */
    var sr = sys.starR * M;
    ctx.globalCompositeOperation = 'lighter';
    var sg = ctx.createRadialGradient(CX, CY, 0, CX, CY, sr * 4);
    sg.addColorStop(0, '#fff'); sg.addColorStop(0.18, sys.starC); sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg; ctx.fillRect(CX - sr * 4, CY - sr * 4, sr * 8, sr * 8);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(CX, CY, sr * 0.66, 0, 7); ctx.fill();
    /* planets */
    sys.orbits.forEach(function (o) {
      var px = CX + Math.cos(o.ang) * o.r * M, py = CY + Math.sin(o.ang) * o.r * M;
      var pr = o.pr * M;
      if (o.ring) {
        ctx.save(); ctx.translate(px, py); ctx.rotate(-0.5); ctx.scale(1, 0.36);
        ctx.strokeStyle = 'rgba(230,220,190,.65)'; ctx.lineWidth = Math.max(1, pr * 0.28);
        ctx.beginPath(); ctx.arc(0, 0, pr * 1.9, 0, 7); ctx.stroke();
        ctx.restore();
      }
      var pg = ctx.createRadialGradient(px - pr * 0.4, py - pr * 0.4, pr * 0.1, px, py, pr);
      pg.addColorStop(0, '#fff');
      pg.addColorStop(0.25, o.color);
      pg.addColorStop(1, 'rgba(0,0,0,.85)');
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.arc(px, py, pr, 0, 7); ctx.fill();
      for (var mi = 0; mi < o.moons; mi++) {
        var ma = o.ang * 3 + mi * 2.1, mr = pr * (1.8 + mi * 0.7);
        ctx.fillStyle = '#cfd4dc';
        ctx.beginPath(); ctx.arc(px + Math.cos(ma) * mr, py + Math.sin(ma) * mr, Math.max(1, pr * 0.22), 0, 7); ctx.fill();
      }
    });
  }

  function drawUniverse(ctx, L, pal, M, X, Y) {
    /* filaments first (behind the galaxies) */
    ctx.globalCompositeOperation = 'lighter';
    (L.fils || []).forEach(function (f) {
      var a = L.unis[f[0]], b = L.unis[f[1]];
      var g = ctx.createLinearGradient(X(a.x), Y(a.y), X(b.x), Y(b.y));
      g.addColorStop(0, 'rgba(120,140,200,.14)'); g.addColorStop(0.5, 'rgba(120,140,200,.05)'); g.addColorStop(1, 'rgba(120,140,200,.14)');
      ctx.strokeStyle = g; ctx.lineWidth = M * 0.012;
      ctx.beginPath(); ctx.moveTo(X(a.x), Y(a.y));
      var mx = (a.x + b.x) / 2 + (a.y - b.y) * 0.18, my = (a.y + b.y) / 2 + (b.x - a.x) * 0.18;
      ctx.quadraticCurveTo(X(mx), Y(my), X(b.x), Y(b.y));
      ctx.stroke();
    });
    (L.unis || []).forEach(function (g) {
      var cx = X(g.x), cy = Y(g.y);
      g.pts.forEach(function (p) {
        ctx.globalAlpha = p.a;
        ctx.fillStyle = pal.neb[g.hue] || pal.glow;
        ctx.fillRect(cx + p.dx * M, cy + p.dy * M, Math.max(1, M / 620), Math.max(1, M / 620));
      });
      ctx.globalAlpha = 1;
      var cr = g.r * M * 0.32;
      var cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr * 2.4);
      cg.addColorStop(0, 'rgba(255,250,235,.9)'); cg.addColorStop(1, 'rgba(255,250,235,0)');
      ctx.fillStyle = cg;
      ctx.fillRect(cx - cr * 2.4, cy - cr * 2.4, cr * 4.8, cr * 4.8);
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ============================ UI ============================ */
  var MODES = [
    { id: 'universe', label: '🌌 Universe', hint: 'Galaxies drifting in the void — each pin is a galaxy.' },
    { id: 'galaxy', label: '🌀 Galaxy', hint: 'A spiral of a few hundred billion stars — each pin is a star system.' },
    { id: 'system', label: '☀️ Star system', hint: 'One star, its orbits and planets — each pin is a world.' }
  ];
  var PIN_KIND = { universe: 'galaxies', galaxy: 'star systems', system: 'planets' };

  function open(cfg) {
    cfg = cfg || {};
    var mode = (cfg.scale === 'universe' || cfg.scale === 'system') ? cfg.scale : 'galaxy';
    var palKey = 'deep';
    var seedTxt = 'ft-' + Math.floor(Math.random() * 1e6);
    var layout = null;

    var dark = (function () { var m = (getComputedStyle(document.body).backgroundColor || '').match(/\d+/g); return m ? (0.299 * +m[0] + 0.587 * +m[1] + 0.114 * +m[2]) < 128 : true; })();
    var T = dark
      ? { panel: '#141d33', line: '#26365c', ink: '#e7ecf7', sub: '#9fb0cf', field: '#0e1830' }
      : { panel: '#fffdf8', line: '#e6dac6', ink: '#3d2b1f', sub: '#7a6a55', field: '#fff' };

    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:9600;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);padding:14px';
    var card = document.createElement('div');
    card.style.cssText = 'width:min(820px,96vw);max-height:94vh;overflow:auto;border-radius:16px;padding:16px 18px;box-shadow:0 24px 70px rgba(0,0,0,.55);' +
      'background:' + T.panel + ';color:' + T.ink + ';border:1px solid ' + T.line;
    var inCss = 'padding:8px 10px;border-radius:9px;font:inherit;font-size:12.5px;background:' + T.field + ';border:1px solid ' + T.line + ';color:' + T.ink;

    card.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px">' +
        '<div style="font-weight:800;font-size:15.5px;flex:1">🌌 Space map</div>' +
        '<button data-x style="border:0;background:transparent;color:inherit;opacity:.6;font-size:19px;cursor:pointer;line-height:1">×</button></div>' +
      '<div data-hint style="font-size:12.5px;color:' + T.sub + ';margin:2px 0 10px"></div>' +
      '<div data-tabs style="display:flex;gap:6px;margin-bottom:10px"></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">' +
        '<input data-seed style="' + inCss + ';width:130px" placeholder="seed">' +
        '<button data-dice style="' + inCss + ';cursor:pointer">🎲 Regenerate</button>' +
        '<select data-pal style="' + inCss + ';cursor:pointer"></select>' +
        '<label style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:' + T.sub + ';margin-left:auto">' +
          '<input type="checkbox" data-pins checked> add named pins</label></div>' +
      '<canvas data-cv width="720" height="480" style="width:100%;border-radius:12px;border:1px solid ' + T.line + ';display:block"></canvas>' +
      '<div data-pincount style="font-size:11.5px;color:' + T.sub + ';margin:6px 0 10px"></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end">' +
        '<button data-cancel style="border:0;background:transparent;color:inherit;opacity:.7;cursor:pointer;font:600 12.5px inherit;padding:9px 8px">Cancel</button>' +
        '<button data-use style="border:0;border-radius:9px;padding:10px 16px;cursor:pointer;font:700 13px inherit;background:#2f7cf6;color:#fff">Use this map</button></div>';
    ov.appendChild(card);
    document.body.appendChild(ov);

    var cv = card.querySelector('[data-cv]');
    var tabs = card.querySelector('[data-tabs]');
    var seedIn = card.querySelector('[data-seed]');
    var palSel = card.querySelector('[data-pal]');
    seedIn.value = seedTxt;
    Object.keys(PALETTES).forEach(function (k) {
      var o = document.createElement('option'); o.value = k; o.textContent = PALETTES[k].label; palSel.appendChild(o);
    });

    function closeOv() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    function paintTabs() {
      tabs.innerHTML = '';
      MODES.forEach(function (mo) {
        var b = document.createElement('button');
        var on = mo.id === mode;
        b.style.cssText = 'flex:1;padding:8px;border-radius:9px;cursor:pointer;font:700 12.5px inherit;border:1px solid ' +
          (on ? '#2f7cf6;background:#2f7cf6;color:#fff' : T.line + ';background:transparent;color:' + T.ink);
        b.textContent = mo.label;
        b.addEventListener('click', function () { mode = mo.id; paintTabs(); regen(false); });
        tabs.appendChild(b);
      });
      card.querySelector('[data-hint]').textContent = MODES.filter(function (mo) { return mo.id === mode; })[0].hint;
    }
    function regen(newSeed) {
      if (newSeed) { seedTxt = 'ft-' + Math.floor(Math.random() * 1e6); seedIn.value = seedTxt; }
      else seedTxt = seedIn.value || seedTxt;
      layout = makeLayout(mode, hashSeed(mode + '|' + seedTxt));
      render(cv, layout, PALETTES[palKey]);
      card.querySelector('[data-pincount]').textContent =
        layout.pins.length + ' ' + (PIN_KIND[mode] || 'pins') + ' will be pinned (toggle above).';
    }
    card.querySelector('[data-dice]').addEventListener('click', function () { regen(true); });
    seedIn.addEventListener('change', function () { regen(false); });
    palSel.addEventListener('change', function () { palKey = palSel.value; regen(false); });
    card.querySelector('[data-x]').addEventListener('click', closeOv);
    card.querySelector('[data-cancel]').addEventListener('click', closeOv);
    ov.addEventListener('click', function (e) { if (e.target === ov) closeOv(); });

    card.querySelector('[data-use]').addEventListener('click', function () {
      var useBtn = card.querySelector('[data-use]');
      useBtn.disabled = true; useBtn.textContent = 'Rendering…';
      var full = document.createElement('canvas'); full.width = 1500; full.height = 1000;
      render(full, layout, PALETTES[palKey]);
      var name = MODES.filter(function (mo) { return mo.id === mode; })[0].label.replace(/^\S+\s/, '') + ' map';
      var wantPins = card.querySelector('[data-pins]').checked;
      var pins = layout.pins.slice();
      Promise.resolve(cfg.onApply && cfg.onApply(full.toDataURL('image/png'), { w: 1500, h: 1000, name: name, scale: mode }))
        .then(function (ok) {
          if (ok !== false && wantPins && cfg.onAddPlaces) cfg.onAddPlaces(pins);
          closeOv();
        })
        .catch(function () { useBtn.disabled = false; useBtn.textContent = 'Use this map'; });
    });

    paintTabs();
    regen(false);
  }

  window.ftSpaceGen = { open: open };
})();

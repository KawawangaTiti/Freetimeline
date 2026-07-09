/* ============================================================================
 * ft-mapgen.js — "Create a map" for FreeTimeline.
 *
 * Two 100%-offline paths so a user with no drawing skills can get a real world
 * map:
 *   1. Describe it   → a procedural generator draws a stylised continent live
 *                      in the browser (value-noise + island falloff + biomes).
 *   2. Bring your own AI → the app hands the user a ready prompt; they paste it
 *                      into their OWN ChatGPT/Claude, paste the JSON back, and
 *                      the app draws it AND creates real Places with pins.
 *
 * No backend, no network — matches FreeTimeline's "data never leaves the
 * browser" contract. The AI runs on the user's side; we only define the
 * contract and render.
 *
 * Public API:  window.ftMapGen.open({ dark, onApply(dataUrl, meta)->Promise|any,
 *                                     onAddPlaces(arr) })
 *   onApply     receives a PNG dataURL of the finished map + {name,w,h}.
 *   onAddPlaces receives [{name, x, y, color}]  (x,y normalised 0..1) so the
 *               host can create pinned Places. Optional.
 * ==========================================================================*/
(function () {
  'use strict';
  if (window.ftMapGen) return;

  /* ---------------- deterministic noise ---------------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hash2(x, y, s) {
    var h = (x * 374761393 + y * 668265263 + s * 1274126177) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function sm(t) { return t * t * (3 - 2 * t); }
  function vnoise(x, y, s) {
    var x0 = Math.floor(x), y0 = Math.floor(y), fx = sm(x - x0), fy = sm(y - y0);
    var a = hash2(x0, y0, s), b = hash2(x0 + 1, y0, s), c = hash2(x0, y0 + 1, s), d = hash2(x0 + 1, y0 + 1, s);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  function fbm(x, y, s, oct) {
    var v = 0, amp = 0.5, f = 1, tot = 0;
    for (var i = 0; i < oct; i++) { v += amp * vnoise(x * f, y * f, s + i * 31); tot += amp; f *= 2; amp *= 0.5; }
    return v / tot;
  }

  /* ---------------- biome palettes ---------------- */
  var PAL = {
    temperate: { sea: [[15, 44, 66], [28, 74, 94]], beach: [201, 189, 142], land: [[79, 122, 74], [53, 96, 63], [110, 122, 69]], peak: [125, 116, 102], snow: [223, 230, 234] },
    arid:      { sea: [[20, 55, 72], [36, 92, 104]], beach: [214, 198, 150], land: [[176, 150, 90], [150, 120, 72], [120, 96, 58]], peak: [130, 112, 92], snow: [222, 215, 200] },
    tropical:  { sea: [[12, 64, 80], [30, 120, 120]], beach: [224, 208, 150], land: [[64, 140, 74], [40, 110, 60], [96, 150, 66]], peak: [120, 120, 96], snow: [230, 236, 232] },
    frozen:    { sea: [[24, 52, 74], [54, 92, 120]], beach: [196, 206, 214], land: [[120, 140, 150], [96, 120, 132], [150, 164, 172]], peak: [180, 192, 200], snow: [236, 242, 247] }
  };
  function lerp(a, b, t) { return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)]; }

  var REGION_NAMES = ['North Reach', 'Emberfall', 'Greymoor', 'Sunhollow', 'Ashvale', 'Kelmark', 'Duskmere', 'Thornwood', 'Frostpeak', 'Saltmarch', 'Wyrmrest', 'Highfen'];

  /* Draw a generated world onto `cv`. Returns [{x,y} normalised] region seeds. */
  function generate(cv, opts) {
    var W = cv.width, H = cv.height, ctx = cv.getContext('2d');
    var SW = 260, SH = Math.round(SW * H / W);
    var small = document.createElement('canvas'); small.width = SW; small.height = SH;
    var sctx = small.getContext('2d'), img = sctx.createImageData(SW, SH), data = img.data;
    var pal = PAL[opts.climate] || PAL.temperate;
    var seed = (parseInt(opts.seed, 10) || 1) % 100000;
    var seaT = (opts.sea != null ? opts.sea : 48) / 100;
    var arch = opts.shape === 'archipelago', pang = opts.shape === 'pangaea';
    var scale = arch ? 5.2 : (pang ? 2.1 : 3.1);
    var feats = opts.features || [];
    var mtn = feats.indexOf('mountains') >= 0;

    function elev(nx, ny) {
      var e = fbm(nx * scale, ny * scale, seed, 6);
      if (mtn) { var ridge = 1 - Math.abs(2 * fbm(nx * scale * 1.3 + 5, ny * scale * 1.3 + 5, seed + 9, 4) - 1); e = e * 0.7 + ridge * 0.35; }
      var dx = (nx - 0.5) * 2, dy = (ny - 0.5) * 2, d = Math.sqrt(dx * dx + dy * dy);
      var edge = arch ? 0.55 : (pang ? 0.95 : 0.78);
      e = e - Math.pow(d, 2.2) * (pang ? 0.55 : 1.0) * edge + (pang ? 0.12 : 0.05);
      return Math.max(0, Math.min(1, e));
    }
    for (var j = 0; j < SH; j++) {
      for (var i = 0; i < SW; i++) {
        var nx = i / SW, ny = j / SH, e = elev(nx, ny), idx = (j * SW + i) * 4, col;
        if (e < seaT) { col = lerp(pal.sea[0], pal.sea[1], e / seaT); }
        else {
          var t = (e - seaT) / (1 - seaT);
          if (t < 0.06) col = pal.beach;
          else if (t < 0.55) { var m = fbm(nx * 4 + 20, ny * 4 + 20, seed + 3, 4); col = lerp(pal.land[1], pal.land[0], m); if (m > 0.62) col = pal.land[2]; }
          else if (t < 0.82) col = lerp(pal.land[0], pal.peak, (t - 0.55) / 0.27);
          else col = lerp(pal.peak, pal.snow, (t - 0.82) / 0.18);
          var shd = (fbm(nx * 8, ny * 8, seed + 50, 2) - 0.5) * 20; col = [col[0] + shd, col[1] + shd, col[2] + shd];
        }
        data[idx] = col[0]; data[idx + 1] = col[1]; data[idx + 2] = col[2]; data[idx + 3] = 255;
      }
    }
    sctx.putImageData(img, 0, 0);
    ctx.clearRect(0, 0, W, H); ctx.imageSmoothingEnabled = true; ctx.drawImage(small, 0, 0, W, H);
    var vg = ctx.createRadialGradient(W / 2, H * 0.42, H * 0.2, W / 2, H / 2, W * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.4)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

    /* region seeds on land */
    var regions = [], rnd = mulberry32(seed + 777), tries = 0, want = opts.regions || 4;
    while (regions.length < want && tries < 800) {
      tries++;
      var px = 0.12 + rnd() * 0.76, py = 0.14 + rnd() * 0.72;
      if (elev(px, py) > seaT + 0.04) {
        var ok = true;
        for (var k = 0; k < regions.length; k++) { if (Math.abs(regions[k].x - px) < 0.13 && Math.abs(regions[k].y - py) < 0.13) { ok = false; break; } }
        if (ok) regions.push({ x: px, y: py });
      }
    }
    return regions;
  }

  /* draw name labels onto the finished canvas */
  function drawLabels(cv, regions, names) {
    var ctx = cv.getContext('2d'), W = cv.width;
    ctx.textAlign = 'center'; ctx.font = '700 ' + Math.round(W / 52) + 'px -apple-system,Segoe UI,Roboto,sans-serif';
    regions.forEach(function (r, i) {
      var nm = (names && names[i]) || REGION_NAMES[i % REGION_NAMES.length];
      var x = r.x * cv.width, y = r.y * cv.height;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(nm, x + 1.5, y + 1.5);
      ctx.fillStyle = '#fff'; ctx.fillText(nm, x, y);
    });
  }

  /* ---------------- modal UI ---------------- */
  var PIN_COLORS = ['#5a8fe6', '#e0607a', '#57b98a', '#e0a24a', '#9a7ae0', '#4ec5c1'];
  var els = null;

  function css(dark) {
    if (document.getElementById('ftmg-css')) return;
    var st = document.createElement('style'); st.id = 'ftmg-css';
    st.textContent = [
      '.ftmg-scrim{position:fixed;inset:0;z-index:1200;background:rgba(6,9,18,.66);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:20px}',
      '.ftmg{width:min(900px,100%);max-height:min(650px,94vh);background:var(--ftmg-bg);color:var(--ftmg-ink);border:1px solid var(--ftmg-line);border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,.55);display:flex;flex-direction:column;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif}',
      '.ftmg-head{display:flex;align-items:center;gap:12px;padding:15px 18px;border-bottom:1px solid var(--ftmg-line)}',
      '.ftmg-head .ic{width:32px;height:32px;border-radius:9px;background:var(--ftmg-acc);display:grid;place-items:center;color:#fff;font-size:17px;flex:0 0 auto}',
      '.ftmg-head h2{margin:0;font-size:15.5px;font-weight:650}.ftmg-head p{margin:2px 0 0;font-size:11.5px;opacity:.6}',
      '.ftmg-x{margin-left:auto;width:30px;height:30px;border-radius:8px;border:0;background:transparent;color:inherit;font-size:20px;cursor:pointer;opacity:.6}.ftmg-x:hover{opacity:1;background:var(--ftmg-raise)}',
      '.ftmg-tabs{display:flex;gap:4px;padding:11px 16px 0;border-bottom:1px solid var(--ftmg-line)}',
      '.ftmg-tab{height:35px;padding:0 14px;border:1px solid transparent;border-bottom:none;border-radius:8px 8px 0 0;background:transparent;color:inherit;opacity:.6;font-size:13px;font-weight:600;cursor:pointer}',
      '.ftmg-tab.on{opacity:1;background:var(--ftmg-raise);border-color:var(--ftmg-line)}',
      '.ftmg-body{flex:1;overflow:auto;padding:18px;display:none;grid-template-columns:1fr 1fr;gap:20px}.ftmg-body.on{display:grid}',
      '.ftmg-pane{display:flex;flex-direction:column;gap:13px;min-width:0}',
      '.ftmg-f{display:flex;flex-direction:column;gap:5px}.ftmg-f label{font-size:12px;font-weight:600;opacity:.75}',
      '.ftmg-in{height:35px;padding:0 11px;background:var(--ftmg-raise);border:1px solid var(--ftmg-line);border-radius:8px;color:inherit;font-size:13px;box-sizing:border-box}',
      'select.ftmg-in{appearance:none}',
      '.ftmg-2{display:grid;grid-template-columns:1fr 1fr;gap:11px}',
      '.ftmg-chips{display:flex;flex-wrap:wrap;gap:6px}',
      '.ftmg-chip{font-size:12px;font-weight:600;padding:5px 11px;border-radius:99px;border:1px solid var(--ftmg-line);background:var(--ftmg-raise);color:inherit;opacity:.7;cursor:pointer}.ftmg-chip.on{background:var(--ftmg-acc);border-color:var(--ftmg-acc);color:#fff;opacity:1}',
      '.ftmg-rw{display:flex;align-items:center;gap:10px}.ftmg-rw input[type=range]{flex:1;accent-color:var(--ftmg-acc)}.ftmg-rw .v{font-size:12px;font-weight:700;min-width:42px;text-align:right}',
      '.ftmg-prev{position:relative;background:#081521;border:1px solid var(--ftmg-line);border-radius:12px;overflow:hidden;aspect-ratio:10/7;display:flex;align-items:center;justify-content:center}',
      '.ftmg-prev canvas{width:100%;height:100%;display:block}.ftmg-prev .empty{opacity:.5;font-size:12.5px;text-align:center;padding:20px;line-height:1.5;color:#cdd6ee}',
      '.ftmg-acts{display:flex;gap:8px}',
      '.ftmg-btn{height:36px;padding:0 14px;border-radius:8px;border:1px solid var(--ftmg-line);background:var(--ftmg-raise);color:inherit;font-size:13px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:7px}.ftmg-btn:hover{filter:brightness(1.12)}',
      '.ftmg-btn.pri{background:var(--ftmg-acc);border-color:var(--ftmg-acc);color:#fff}.ftmg-btn[disabled]{opacity:.45;cursor:default}',
      '.ftmg-hint{font-size:11px;opacity:.55;text-align:center;margin:0}',
      '.ftmg-steps{display:flex;flex-direction:column;gap:8px}.ftmg-step{display:flex;gap:9px;font-size:12.5px;opacity:.8;line-height:1.5}.ftmg-step .n{width:19px;height:19px;border-radius:50%;background:var(--ftmg-raise);border:1px solid var(--ftmg-line);color:var(--ftmg-acc);font-size:11px;font-weight:800;display:grid;place-items:center;flex:0 0 auto;margin-top:1px}',
      '.ftmg-code{background:#0a1120;border:1px solid var(--ftmg-line);border-radius:8px;padding:10px 11px;font-family:ui-monospace,Consolas,monospace;font-size:11px;line-height:1.5;color:#aeb9d6;max-height:130px;overflow:auto;white-space:pre-wrap}',
      '.ftmg-json{width:100%;min-height:120px;resize:vertical;background:#0a1120;border:1px solid var(--ftmg-line);border-radius:8px;padding:10px 11px;color:#cdd6ee;font-family:ui-monospace,Consolas,monospace;font-size:11px;box-sizing:border-box}',
      '@media(max-width:760px){.ftmg-body{grid-template-columns:1fr}}'
    ].join('');
    document.head.appendChild(st);
  }

  function setTheme(dark) {
    var r = document.documentElement.style;
    r.setProperty('--ftmg-bg', dark ? '#141b2e' : '#fffdf8');
    r.setProperty('--ftmg-raise', dark ? '#1b2338' : '#f1ece1');
    r.setProperty('--ftmg-line', dark ? '#2a3350' : '#e0d7c6');
    r.setProperty('--ftmg-ink', dark ? '#e8ecf6' : '#3d2b1f');
    r.setProperty('--ftmg-acc', '#4f9cff');
  }

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  function close() {
    if (els) { els.scrim.remove(); els = null; }
    document.removeEventListener('keydown', onKey, true);
  }
  function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }

  function open(opts) {
    opts = opts || {};
    var dark = opts.dark;
    if (dark == null) {
      var m = (getComputedStyle(document.body).backgroundColor || '').match(/\d+/g);
      dark = !m || (0.299 * +m[0] + 0.587 * +m[1] + 0.114 * +m[2]) < 128;
    }
    css(); setTheme(dark);
    close();

    var scrim = el('div', 'ftmg-scrim');
    scrim.addEventListener('click', function (e) { if (e.target === scrim) close(); });
    var modal = el('div', 'ftmg');
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-label', 'Create a map');
    modal.addEventListener('click', function (e) { e.stopPropagation(); });

    modal.appendChild(el('div', 'ftmg-head',
      '<div class="ic">✨</div><div><h2>Create a map for your world</h2>' +
      '<p>No drawing needed — describe it, or let your own AI sketch it. 100% offline.</p></div>'));
    modal.querySelector('.ftmg-head').appendChild(mkX());

    var tabs = el('div', 'ftmg-tabs');
    var tD = tabBtn('Describe it', true), tA = tabBtn('Bring your own AI', false);
    tabs.appendChild(tD); tabs.appendChild(tA); modal.appendChild(tabs);

    var bodyD = buildDescribe(opts), bodyA = buildAI(opts);
    bodyD.classList.add('on'); modal.appendChild(bodyD); modal.appendChild(bodyA);

    tD.addEventListener('click', function () { swap(tD, tA, bodyD, bodyA); });
    tA.addEventListener('click', function () { swap(tA, tD, bodyA, bodyD); });

    scrim.appendChild(modal);
    document.body.appendChild(scrim);
    document.addEventListener('keydown', onKey, true);
    els = { scrim: scrim };

    function mkX() { var b = el('button', 'ftmg-x'); b.type = 'button'; b.setAttribute('aria-label', 'Close'); b.textContent = '×'; b.addEventListener('click', close); return b; }
  }
  function tabBtn(label, on) { var b = el('button', 'ftmg-tab' + (on ? ' on' : '')); b.type = 'button'; b.textContent = label; return b; }
  function swap(onTab, offTab, onBody, offBody) { onTab.classList.add('on'); offTab.classList.remove('on'); onBody.classList.add('on'); offBody.classList.remove('on'); }

  /* -------- Describe pane -------- */
  function buildDescribe(opts) {
    var body = el('div', 'ftmg-body');
    var left = el('div', 'ftmg-pane'), right = el('div', 'ftmg-pane');

    left.innerHTML =
      '<div class="ftmg-f"><label>World name</label><input class="ftmg-in" id="ftmg-name" value="Aethelgard"></div>' +
      '<div class="ftmg-2"><div class="ftmg-f"><label>Climate</label><select class="ftmg-in" id="ftmg-clim">' +
        '<option value="temperate">Temperate</option><option value="arid">Arid / desert</option><option value="tropical">Tropical</option><option value="frozen">Frozen</option></select></div>' +
      '<div class="ftmg-f"><label>Landmass</label><select class="ftmg-in" id="ftmg-shape">' +
        '<option value="continent">Single continent</option><option value="archipelago">Archipelago</option><option value="pangaea">Supercontinent</option></select></div></div>' +
      '<div class="ftmg-f"><label>Terrain features</label><div class="ftmg-chips" id="ftmg-feat">' +
        '<button type="button" class="ftmg-chip on" data-f="mountains">Mountains</button>' +
        '<button type="button" class="ftmg-chip" data-f="forest">Forests</button>' +
        '<button type="button" class="ftmg-chip" data-f="volcano">Volcanic</button></div></div>' +
      '<div class="ftmg-f"><label>Sea level</label><div class="ftmg-rw"><input type="range" id="ftmg-sea" min="30" max="70" value="48"><span class="v" id="ftmg-seav">48%</span></div></div>' +
      '<div class="ftmg-2"><div class="ftmg-f"><label>Regions</label><div class="ftmg-rw"><input type="range" id="ftmg-reg" min="1" max="7" value="4"><span class="v" id="ftmg-regv">4</span></div></div>' +
      '<div class="ftmg-f"><label>Seed</label><div class="ftmg-rw"><input class="ftmg-in" id="ftmg-seed" value="7421" style="flex:1"><button class="ftmg-btn" id="ftmg-shuf" title="Shuffle" style="padding:0 11px">↻</button></div></div></div>';

    right.innerHTML =
      '<div class="ftmg-prev" id="ftmg-prevbox"><canvas id="ftmg-canvas" width="640" height="448" style="display:none"></canvas>' +
        '<div class="empty" id="ftmg-empty">Fill it in and hit <b>Generate</b> —<br>your world is drawn here, live.</div></div>' +
      '<div class="ftmg-acts"><button class="ftmg-btn pri" id="ftmg-gen" style="flex:1">✨ Generate</button>' +
        '<button class="ftmg-btn" id="ftmg-use" style="flex:1" disabled>Use this map</button></div>' +
      '<p class="ftmg-hint">Nothing leaves your browser.</p>';

    body.appendChild(left); body.appendChild(right);

    var q = function (s) { return body.querySelector(s); };
    q('#ftmg-sea').addEventListener('input', function () { q('#ftmg-seav').textContent = this.value + '%'; });
    q('#ftmg-reg').addEventListener('input', function () { q('#ftmg-regv').textContent = this.value; });
    q('#ftmg-shuf').addEventListener('click', function () { q('#ftmg-seed').value = Math.floor(1000 + Math.random() * 89999); });
    q('#ftmg-feat').addEventListener('click', function (e) { var c = e.target.closest('.ftmg-chip'); if (c) c.classList.toggle('on'); });

    function readOpts() {
      return {
        name: q('#ftmg-name').value.trim() || 'My world',
        climate: q('#ftmg-clim').value, shape: q('#ftmg-shape').value,
        features: Array.prototype.map.call(body.querySelectorAll('#ftmg-feat .ftmg-chip.on'), function (c) { return c.dataset.f; }),
        sea: +q('#ftmg-sea').value, regions: +q('#ftmg-reg').value, seed: q('#ftmg-seed').value
      };
    }
    var lastRegions = null;
    q('#ftmg-gen').addEventListener('click', function () {
      var cv = q('#ftmg-canvas'); cv.style.display = 'block'; q('#ftmg-empty').style.display = 'none';
      var o = readOpts(); lastRegions = generate(cv, o); drawLabels(cv, lastRegions, null);
      var u = q('#ftmg-use'); u.disabled = false; u.classList.add('pri');
    });
    q('#ftmg-use').addEventListener('click', function () {
      var cv = q('#ftmg-canvas'); if (!lastRegions) return;
      applyMap(cv, readOpts().name, lastRegions, null, opts);
    });
    return body;
  }

  /* -------- AI pane -------- */
  function buildAI(opts) {
    var body = el('div', 'ftmg-body');
    var left = el('div', 'ftmg-pane'), right = el('div', 'ftmg-pane');

    left.innerHTML =
      '<div class="ftmg-steps">' +
        '<div class="ftmg-step"><span class="n">1</span><div>Describe your world below, then <b>Copy the prompt</b>.</div></div>' +
        '<div class="ftmg-step"><span class="n">2</span><div>Paste it into <b>ChatGPT, Claude or Gemini</b> — whatever you use.</div></div>' +
        '<div class="ftmg-step"><span class="n">3</span><div>Paste its JSON answer on the right and hit <b>Build map</b>. It becomes your map, with a pin per place.</div></div>' +
      '</div>' +
      '<div class="ftmg-f"><label>Your world, in a sentence</label><input class="ftmg-in" id="ftmg-aidesc" value="A windswept archipelago of feuding sea-kingdoms, a frozen north, a volcanic south."></div>' +
      '<div class="ftmg-f"><label>Prompt to copy</label><div class="ftmg-code" id="ftmg-prompt"></div>' +
        '<div class="ftmg-acts" style="margin-top:6px"><button class="ftmg-btn" id="ftmg-copy" style="flex:1">Copy prompt</button></div></div>';

    right.innerHTML =
      '<div class="ftmg-f"><label>Paste the AI\'s JSON here</label><textarea class="ftmg-json" id="ftmg-aijson" spellcheck="false"></textarea></div>' +
      '<div class="ftmg-acts"><button class="ftmg-btn pri" id="ftmg-build" style="flex:1">Build map from JSON</button></div>' +
      '<div class="ftmg-prev" id="ftmg-aibox" style="aspect-ratio:10/6"><canvas id="ftmg-aicanvas" width="600" height="360" style="display:none"></canvas>' +
        '<div class="empty" id="ftmg-aiempty">The parsed world previews here.</div></div>' +
      '<button class="ftmg-btn" id="ftmg-aiuse" disabled>Use this map</button>';

    body.appendChild(left); body.appendChild(right);
    var q = function (s) { return body.querySelector(s); };

    function prompt() {
      var d = q('#ftmg-aidesc').value.replace(/"/g, '’');
      return 'You are a fantasy cartographer. Based on this world:\n"' + d + '"\n\n' +
        'Return ONLY valid JSON, no prose, matching exactly:\n{\n' +
        '  "world": "<name>",\n  "climate": "temperate|arid|tropical|frozen",\n' +
        '  "shape": "continent|archipelago|pangaea",\n  "seed": <integer 1-99999>,\n' +
        '  "regions": [ {"name":"<region>", "x":<0-100>, "y":<0-100>} ],\n' +
        '  "places": [ {"name":"<city/landmark>", "x":<0-100>, "y":<0-100>} ]\n}\n' +
        'x,y are percentages across the map (0,0 = top-left). Give 3-6 regions and 3-8 places.';
    }
    function refresh() { q('#ftmg-prompt').textContent = prompt(); }
    refresh();
    q('#ftmg-aidesc').addEventListener('input', refresh);
    q('#ftmg-copy').addEventListener('click', function () {
      var txt = prompt(), btn = this;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(function () { btn.textContent = 'Copied ✓'; setTimeout(function () { btn.textContent = 'Copy prompt'; }, 1500); },
          function () { btn.textContent = 'Select & copy'; });
      } else { btn.textContent = 'Select & copy'; }
    });
    q('#ftmg-aijson').value = JSON.stringify({
      world: 'Aethelgard', climate: 'frozen', shape: 'archipelago', seed: 4821,
      regions: [{ name: 'Frostmark', x: 26, y: 20 }, { name: 'The Emberwastes', x: 70, y: 74 }, { name: 'Saltmarch', x: 44, y: 52 }, { name: 'Wyrmrest', x: 60, y: 34 }],
      places: [{ name: 'Highspire', x: 40, y: 30 }, { name: 'Coldharbor', x: 24, y: 60 }, { name: 'Ashport', x: 72, y: 64 }]
    }, null, 2);

    var parsed = null;
    q('#ftmg-build').addEventListener('click', function () {
      var obj; try { obj = JSON.parse(q('#ftmg-aijson').value); } catch (e) { alert('That JSON didn’t parse — check the AI’s output.'); return; }
      var cv = q('#ftmg-aicanvas'); cv.style.display = 'block'; q('#ftmg-aiempty').style.display = 'none';
      var regions = (obj.regions || []).map(function (r) { return { x: (r.x || 50) / 100, y: (r.y || 50) / 100 }; });
      var names = (obj.regions || []).map(function (r) { return r.name; });
      var o = { climate: obj.climate || 'temperate', shape: obj.shape || 'continent', features: ['mountains'], sea: 46, regions: regions.length || 4, seed: obj.seed || 1234 };
      generate(cv, o); drawLabels(cv, regions, names);
      /* regions -> baked area labels (above); places -> interactive pins */
      var pins = (obj.places || []).map(function (p, i) {
        return { name: p.name || ('Place ' + (i + 1)), x: (p.x || 50) / 100, y: (p.y || 50) / 100, color: PIN_COLORS[i % PIN_COLORS.length] };
      });
      parsed = { name: obj.world || 'My world', opts: o, regions: regions, names: names, pins: pins };
      var u = q('#ftmg-aiuse'); u.disabled = false; u.classList.add('pri');
    });
    q('#ftmg-aiuse').addEventListener('click', function () {
      if (!parsed) return;
      var cv = q('#ftmg-aicanvas');
      applyMap(cv, parsed.name, parsed.regions, parsed.names, opts, parsed.pins);
    });
    return body;
  }

  /* -------- apply the finished canvas as the app's map image -------- */
  function applyMap(previewCanvas, name, regions, names, opts, pins) {
    /* Upscale the preview into a crisp stored map (the preview is small for speed). */
    var big = document.createElement('canvas'); big.width = 1500; big.height = 1050;
    var ctx = big.getContext('2d'); ctx.imageSmoothingEnabled = true;
    ctx.drawImage(previewCanvas, 0, 0, big.width, big.height);
    var dataUrl = big.toDataURL('image/png');
    var meta = { name: (name || 'Generated map') + ' (generated)', w: big.width, h: big.height };
    var finish = function () {
      if (typeof opts.onAddPlaces === 'function' && pins && pins.length) {
        try { opts.onAddPlaces(pins); } catch (_) {}
      }
      close();
    };
    if (typeof opts.onApply === 'function') {
      var r = opts.onApply(dataUrl, meta);
      if (r && typeof r.then === 'function') r.then(finish, finish); else finish();
    } else { finish(); }
  }

  window.ftMapGen = { open: open, _generate: generate };
})();

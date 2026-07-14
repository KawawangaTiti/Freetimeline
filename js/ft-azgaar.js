/* FreeTimeline — Pro Map Studio bridge (Azgaar's Fantasy Map Generator, MIT).
   Opens the full Azgaar generator in an in-app overlay (iframe, its own origin so it
   stays fully sandboxed from our data by the browser). Azgaar has rivers, biomes,
   relief, states/countries, labels, custom sizes & scales, image export — everything
   the DIY painter can't do. Because it runs cross-origin we can't read its canvas, so
   the bridge is explicit: the user exports a PNG from Azgaar, then imports it here; our
   pins / epochs / timeline layer rides on top of that image exactly like an upload.
   Public API: window.ftAzgaar.open({ onImport(file):Promise|void }). */
(function () {
  if (window.ftAzgaar) return;

  var AZGAAR_URL = 'https://azgaar.github.io/Fantasy-Map-Generator/';

  function lum(c) { var m = (c || '').match(/\d+/g); return m ? (0.299 * +m[0] + 0.587 * +m[1] + 0.114 * +m[2]) : 255; }
  function theme() {
    var dark = lum(getComputedStyle(document.body).backgroundColor) < 128;
    return dark
      ? { bg: '#0c1424', bar: '#111c31', line: '#26365c', ink: '#e7ecf7', sub: '#9fb0cf', acc: '#2f7cf6', accInk: '#fff' }
      : { bg: '#f4efe4', bar: '#fffdf8', line: '#e6dac6', ink: '#3d2b1f', sub: '#7a6a55', acc: '#2f7cf6', accInk: '#fff' };
  }

  function open(opts) {
    opts = opts || {};
    var T = theme();

    var ov = document.createElement('div');
    ov.className = 'ftaz-ov';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-label', 'Pro Map Studio');
    ov.style.cssText =
      'position:fixed;inset:0;z-index:9000;display:flex;flex-direction:column;background:' + T.bg + ';' +
      'font-family:inherit;color:' + T.ink + '';

    /* --- header --- */
    var bar = document.createElement('div');
    bar.style.cssText =
      'display:flex;align-items:center;gap:12px;padding:9px 14px;background:' + T.bar + ';' +
      'border-bottom:1px solid ' + T.line + ';flex-shrink:0;box-shadow:0 2px 10px rgba(0,0,0,.12)';

    var title = document.createElement('div');
    title.style.cssText = 'display:flex;flex-direction:column;line-height:1.2;min-width:0';
    title.innerHTML =
      '<strong style="font-size:14px">🗺️ Pro Map Studio</strong>' +
      '<span style="font-size:11px;color:' + T.sub + '">Design a detailed world — rivers, biomes, countries, labels, any scale. ' +
      'When it’s ready, <b>export a PNG</b> and bring it back with <b>Use this map</b>.</span>';

    var spacer = document.createElement('div'); spacer.style.cssText = 'flex:1 1 auto';

    function btn(label, primary) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText =
        'border:1px solid ' + (primary ? T.acc : T.line) + ';border-radius:9px;padding:8px 14px;cursor:pointer;' +
        'font-weight:700;font-size:13px;white-space:nowrap;' +
        (primary ? 'background:' + T.acc + ';color:' + T.accInk + ';' : 'background:transparent;color:' + T.ink + ';');
      return b;
    }
    var howB = btn('How it works', false);
    var useB = btn('⬇ Use this map', true);
    var closeB = btn('✕ Close', false);
    closeB.setAttribute('aria-label', 'Close Pro Map Studio');

    bar.appendChild(title);
    bar.appendChild(spacer);
    bar.appendChild(howB);
    bar.appendChild(useB);
    bar.appendChild(closeB);
    ov.appendChild(bar);

    /* --- the generator --- */
    var frameWrap = document.createElement('div');
    frameWrap.style.cssText = 'flex:1 1 auto;position:relative;min-height:0';

    var loading = document.createElement('div');
    loading.style.cssText =
      'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;' +
      'color:' + T.sub + ';font-size:13px;pointer-events:none';
    loading.innerHTML = '<div style="font-size:26px">🌍</div><div>Loading the map studio…</div>';
    frameWrap.appendChild(loading);

    /* The studio is a cross-origin github.io app — with no internet the iframe never
       fires `load`, leaving the "Loading…" spinner forever. Warn after ~12s. */
    var loaded = false, noNetTimer = null;

    var frame = document.createElement('iframe');
    frame.src = AZGAAR_URL;
    frame.title = 'Fantasy Map Generator';
    frame.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;display:block;background:#fff';
    frame.allow = 'clipboard-write; fullscreen';
    frame.addEventListener('load', function () {
      loaded = true;
      if (noNetTimer) { clearTimeout(noNetTimer); noNetTimer = null; }
      loading.style.display = 'none';
    });
    frameWrap.appendChild(frame);
    ov.appendChild(frameWrap);

    noNetTimer = setTimeout(function () {
      noNetTimer = null;
      if (loaded) return;
      loading.style.pointerEvents = 'auto';
      loading.innerHTML =
        '<div style="font-size:26px">📡</div>' +
        '<div style="max-width:320px;text-align:center;line-height:1.5">Sem ligação — o Pro Studio precisa de internet. ' +
        'Usa <b>Desenhar</b> ou <b>Quick map</b> para trabalhar offline.</div>';
      var closeWarn = document.createElement('button');
      closeWarn.type = 'button';
      closeWarn.textContent = 'Fechar';
      closeWarn.style.cssText = 'margin-top:6px;border:1px solid ' + T.acc + ';background:' + T.acc + ';color:' + T.accInk +
        ';border-radius:9px;padding:8px 16px;cursor:pointer;font-weight:700;font-size:13px';
      closeWarn.addEventListener('click', close);
      loading.appendChild(closeWarn);
    }, 12000);

    /* --- hidden importer (reads the PNG the user exported from Azgaar) --- */
    var fileIn = document.createElement('input');
    fileIn.type = 'file';
    fileIn.accept = 'image/*';
    fileIn.style.display = 'none';
    ov.appendChild(fileIn);

    function close() {
      if (noNetTimer) { clearTimeout(noNetTimer); noNetTimer = null; }
      document.removeEventListener('keydown', onKey);
      if (ov.parentNode) ov.parentNode.removeChild(ov);
    }
    function onKey(e) { if (e.key === 'Escape' && !howOpen()) close(); }

    /* --- guidance sheet --- */
    var sheet = null;
    function howOpen() { return !!sheet; }
    function showHow() {
      if (sheet) { sheet.remove(); sheet = null; return; }
      sheet = document.createElement('div');
      sheet.style.cssText =
        'position:absolute;top:0;right:0;bottom:0;width:min(380px,86vw);z-index:5;overflow-y:auto;' +
        'background:' + T.bar + ';border-left:1px solid ' + T.line + ';padding:20px 22px;' +
        'box-shadow:-14px 0 40px rgba(0,0,0,.28);font-size:13.5px;line-height:1.6;color:' + T.ink;
      sheet.innerHTML =
        '<h3 style="margin:0 0 12px;font-size:16px">Bring your map back in 3 steps</h3>' +
        '<ol style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:12px">' +
          '<li><b>Design it here.</b> Use the studio to shape land, water, mountains, rivers, ' +
            'countries and labels. The menu (top-left ☰) has generators, editors and a style panel; ' +
            'you can set any canvas size and zoom to city or world scale.</li>' +
          '<li><b>Export a PNG.</b> Open <b>Menu → Export</b> (or press the export icon) and choose ' +
            '<b>Export to PNG</b>. The image downloads to your device.</li>' +
          '<li><b>Come back and press <span style="color:' + T.acc + '">⬇ Use this map</span></b>, ' +
            'then pick the PNG you just saved. It becomes your timeline map — drop Places and pins on ' +
            'top, and it moves through time with your epochs.</li>' +
        '</ol>' +
        '<p style="margin:16px 0 0;color:' + T.sub + ';font-size:12px">The studio keeps its own autosave in ' +
          'this browser, so you can reopen and keep editing. Your FreeTimeline data is never shared with it.</p>';
      var x = document.createElement('button');
      x.type = 'button'; x.textContent = 'Got it';
      x.style.cssText = 'margin-top:18px;border:1px solid ' + T.acc + ';background:' + T.acc + ';color:' + T.accInk +
        ';border-radius:9px;padding:8px 16px;cursor:pointer;font-weight:700;font-size:13px';
      x.addEventListener('click', function () { sheet.remove(); sheet = null; });
      sheet.appendChild(x);
      frameWrap.appendChild(sheet);
    }

    howB.addEventListener('click', showHow);
    closeB.addEventListener('click', close);
    useB.addEventListener('click', function () { fileIn.click(); });

    fileIn.addEventListener('change', function () {
      var f = fileIn.files && fileIn.files[0];
      if (!f) return;
      var r = opts.onImport ? opts.onImport(f) : null;
      if (r && typeof r.then === 'function') {
        useB.disabled = true; useB.textContent = 'Importing…';
        r.then(function (ok) { if (ok !== false) close(); else { useB.disabled = false; useB.textContent = '⬇ Use this map'; } });
      } else {
        close();
      }
    });

    document.addEventListener('keydown', onKey);
    document.body.appendChild(ov);

    /* First-time users get the guide opened automatically. */
    try {
      var KEY = 'ft_azgaar_seen_v1';
      if (!localStorage.getItem(KEY)) { showHow(); localStorage.setItem(KEY, '1'); }
    } catch (_) {}
  }

  window.ftAzgaar = { open: open, url: AZGAAR_URL };
})();

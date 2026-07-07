/* FreeTimeline — command palette (Ctrl+K / Cmd+K).
   The discoverability escape hatch of the 3-tier interaction model (docs/GDD.md §4):
   nothing needs to be visible to be findable. Actions are harvested live from the
   #toolbar (including buttons the de-clutter moved into dropdowns) plus a small
   declarative list for features with no button. Vanilla, zero dependencies;
   silent no-op if the page has no #toolbar. */
(function () {
  if (!document.getElementById('toolbar')) return;

  function lum(c) { var m = (c || '').match(/\d+/g); return m ? (0.299 * +m[0] + 0.587 * +m[1] + 0.114 * +m[2]) : 255; }
  var dark = lum(getComputedStyle(document.body).backgroundColor) < 128;
  var T = dark
    ? { panel: '#111a31', line: '#26365c', ink: '#e7ecf7', dim: '#8ea0c4', hover: 'rgba(255,255,255,0.09)', scrim: 'rgba(4,8,20,0.55)' }
    : { panel: '#fffdf8', line: '#e6dac6', ink: '#3d2b1f', dim: '#8a7a66', hover: 'rgba(120,80,30,0.09)', scrim: 'rgba(40,28,12,0.35)' };

  var st = document.createElement('style');
  st.textContent =
    '#ft-palette-scrim{position:fixed;inset:0;z-index:900;background:' + T.scrim + '}' +
    '#ft-palette{position:fixed;z-index:901;top:12vh;left:50%;transform:translateX(-50%);' +
      'width:min(560px,92vw);background:' + T.panel + ';border:1px solid ' + T.line + ';border-radius:14px;' +
      'box-shadow:0 24px 60px rgba(0,0,0,.4);overflow:hidden;font-size:14px;color:' + T.ink + '}' +
    '#ft-palette input{width:100%;box-sizing:border-box;background:transparent;border:0;outline:0;' +
      'padding:14px 16px;font-size:15px;color:' + T.ink + ';border-bottom:1px solid ' + T.line + '}' +
    '#ft-palette-list{max-height:46vh;overflow-y:auto;padding:6px;margin:0;list-style:none}' +
    '#ft-palette-list li{display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:8px;cursor:pointer}' +
    '#ft-palette-list li[aria-selected="true"],#ft-palette-list li:hover{background:' + T.hover + '}' +
    '#ft-palette-list li .ft-pal-hint{margin-left:auto;font-size:11.5px;color:' + T.dim + ';white-space:nowrap}' +
    '#ft-palette-empty{padding:16px;color:' + T.dim + ';font-size:13px}';
  document.head.appendChild(st);

  var open = false, items = [], sel = 0, elScrim, elBox, elInput, elList;

  /* ---- action registry ---- */
  function harvest() {
    var acts = [], seen = {};
    function add(label, hint, keywords, run, disabled) {
      var key = (label || '').toLowerCase();
      if (!key || seen[key]) return;
      seen[key] = 1;
      acts.push({ label: label, hint: hint || '', kw: (label + ' ' + (keywords || '')).toLowerCase(), run: run, disabled: !!disabled });
    }
    var tb = document.getElementById('toolbar');
    Array.prototype.slice.call(tb.querySelectorAll('button')).forEach(function (b) {
      if (b.classList.contains('ft-dd-trigger') || b.id === 'tlb-mobile-menu') return;
      var label = (b.textContent || '').replace(/\s+/g, ' ').trim();
      if (!label) return;
      var section = '';
      var menu = b.closest && b.closest('.ft-dd-menu');
      if (menu) {
        var trg = menu.parentElement && menu.parentElement.querySelector('.ft-dd-trigger');
        section = trg ? (trg.textContent || '').replace('▾', '').trim() : '';
      }
      add(label, section, (b.getAttribute('title') || '') + ' ' + (b.getAttribute('onclick') || ''),
        function () { b.click(); }, b.disabled);
    });
    /* features with no toolbar button */
    if (window.UI && typeof window.UI.shareView === 'function') {
      add('Share view', 'Link', 'share url copy link view-only', function () { window.UI.shareView(); });
    }
    return acts;
  }

  /* ---- rendering ---- */
  function render() {
    var q = elInput.value.trim().toLowerCase();
    var terms = q ? q.split(/\s+/) : [];
    items = harvest().filter(function (a) {
      return !a.disabled && terms.every(function (t) { return a.kw.indexOf(t) !== -1; });
    });
    if (sel >= items.length) sel = Math.max(0, items.length - 1);
    elList.innerHTML = '';
    if (!items.length) {
      var d = document.createElement('div');
      d.id = 'ft-palette-empty';
      d.textContent = 'No matching action.';
      elList.appendChild(d);
      return;
    }
    items.forEach(function (a, i) {
      var li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', i === sel ? 'true' : 'false');
      li.textContent = a.label;
      if (a.hint) {
        var h = document.createElement('span');
        h.className = 'ft-pal-hint';
        h.textContent = a.hint;
        li.appendChild(h);
      }
      li.addEventListener('click', function () { exec(a); });
      li.addEventListener('mousemove', function () { if (sel !== i) { sel = i; paintSel(); } });
      elList.appendChild(li);
    });
    var s = elList.children[sel];
    if (s && s.scrollIntoView) s.scrollIntoView({ block: 'nearest' });
  }
  function paintSel() {
    Array.prototype.forEach.call(elList.children, function (li, i) {
      li.setAttribute('aria-selected', i === sel ? 'true' : 'false');
    });
    var s = elList.children[sel];
    if (s && s.scrollIntoView) s.scrollIntoView({ block: 'nearest' });
  }
  function exec(a) {
    close();
    setTimeout(function () { try { a.run(); } catch (_) {} }, 30);
  }

  /* ---- open/close ---- */
  function openPal() {
    if (open) return;
    open = true;
    elScrim = document.createElement('div'); elScrim.id = 'ft-palette-scrim';
    elScrim.addEventListener('click', close);
    elBox = document.createElement('div'); elBox.id = 'ft-palette';
    elBox.setAttribute('role', 'dialog'); elBox.setAttribute('aria-modal', 'true');
    elBox.setAttribute('aria-label', 'Command palette');
    elInput = document.createElement('input');
    elInput.type = 'text';
    elInput.placeholder = 'Type a command…  (e.g. save, read, tour, fit)';
    elInput.setAttribute('aria-label', 'Search actions');
    elList = document.createElement('ul');
    elList.id = 'ft-palette-list'; elList.setAttribute('role', 'listbox');
    elBox.appendChild(elInput); elBox.appendChild(elList);
    document.body.appendChild(elScrim); document.body.appendChild(elBox);
    sel = 0;
    elInput.addEventListener('input', function () { sel = 0; render(); });
    elInput.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (items.length) { sel = (sel + 1) % items.length; paintSel(); } }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (items.length) { sel = (sel - 1 + items.length) % items.length; paintSel(); } }
      else if (e.key === 'Enter') { e.preventDefault(); if (items[sel]) exec(items[sel]); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    });
    render();
    elInput.focus();
  }
  function close() {
    if (!open) return;
    open = false;
    if (elScrim) elScrim.remove();
    if (elBox) elBox.remove();
    elScrim = elBox = elInput = elList = null;
  }

  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      if (open) close(); else openPal();
    }
  });

  window.ftPalette = { open: openPal, close: close, _harvest: harvest };
})();

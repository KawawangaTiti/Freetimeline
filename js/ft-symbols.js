/* ============================================================================
 * ft-symbols.js — original cartographic map symbols (Map editor P2).
 *
 * A small, curated set of simple line symbols a user can stamp on the map to
 * mean things — a castle for a kingdom, houses for a town, crossed swords for a
 * battle. All ORIGINAL geometric art (no third-party assets, no attribution),
 * drawn on a 24x24 grid and coloured with currentColor so each takes the colour
 * of the place it marks. Kept deliberately simple: readable at a glance beats
 * detailed. game-icons.net (CC BY 3.0) remains an option to expand this later.
 *
 * API: window.ftSymbols = { GROUPS, list(), byId(id), svg(id) }
 *   svg(id) -> an inline <svg> string (inherits color via currentColor).
 * ==========================================================================*/
(function () {
  'use strict';
  if (window.ftSymbols) return;

  var S = 'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"';
  var F = 'fill="currentColor"';

  /* each symbol: [id, name, innerMarkup] */
  var GROUPS = [
    { name: 'Settlements', items: [
      ['village', 'Village', '<g ' + S + '><path d="M4 20V13l4-3 4 3v7z"/><path d="M13 20v-5l3.5-2.5L20 15v5z"/></g>'],
      ['town', 'Town', '<g ' + S + '><path d="M5 20V11l7-5 7 5v9z"/><rect x="10.5" y="14" width="3" height="6"/></g>'],
      ['city', 'City', '<g ' + S + '><rect x="4" y="9" width="5" height="11"/><rect x="10" y="5" width="5" height="15"/><rect x="16" y="12" width="4" height="8"/></g>'],
      ['castle', 'Castle', '<g ' + S + '><path d="M4 20V9l2 1V7l2 1V6h2v2l2-1v3l2-1v3l2-1v9z"/><path d="M4 20h16"/><rect x="10.5" y="14" width="3" height="6"/></g>'],
      ['capital', 'Capital', '<g ' + S + '><path d="M5 20V10l3 1.5V8l4 2 4-2v3.5L19 10v10z"/><path d="M5 20h14"/><path d="M12 3l1.4 2.8 3.1.5-2.2 2.2.5 3.1L12 10.2 9.2 11.6l.5-3.1L7.5 6.3l3.1-.5z" ' + F + ' stroke="none"/></g>'],
      ['tower', 'Tower', '<g ' + S + '><path d="M8.5 20V8l1 1V6l1 1V5h3v2l1-1v3l1-1v12z"/><rect x="10.5" y="13" width="3" height="7"/></g>']
    ]},
    { name: 'Terrain', items: [
      ['mountain', 'Mountain', '<g ' + S + '><path d="M3 19l6-11 4 6 2-3 6 8z"/><path d="M7.5 12.5l1.5-1 1.5 1.5"/></g>'],
      ['forest', 'Forest', '<g ' + S + '><path d="M7 18l-2.5-4h1.5L4 10h2L5 7l3 3.5H6.5L8.5 14H7v4z" ' + F + ' stroke="none"/><path d="M15.5 19l-2.5-4h1.5L12.5 11h2L13 8l3 3.5h-1.5L16.5 15H15v4z" ' + F + ' stroke="none"/></g>'],
      ['hills', 'Hills', '<g ' + S + '><path d="M3 18c2-4 4-4 6 0M11 18c2.5-5 4.5-5 7 0"/></g>'],
      ['volcano', 'Volcano', '<g ' + S + '><path d="M4 19l5-8h2l5 8z"/><path d="M9 11l1-3 1 2 1.5-2.5"/></g>'],
      ['cave', 'Cave', '<g ' + S + '><path d="M4 20v-4a8 8 0 0 1 16 0v4"/><path d="M9 20v-3a3 3 0 0 1 6 0v3"/></g>'],
      ['island', 'Island', '<g ' + S + '><path d="M3 17h18M6 17c0-3 2-5 6-5s6 2 6 5"/><path d="M12 12V7M12 9l2-2M12 9l-2-1.5"/></g>']
    ]},
    { name: 'Structures', items: [
      ['temple', 'Temple', '<g ' + S + '><path d="M4 9l8-4 8 4z"/><path d="M6 9v8M10 9v8M14 9v8M18 9v8M4 20h16"/></g>'],
      ['ruins', 'Ruins', '<g ' + S + '><path d="M6 20V8l2 2V7M12 20v-9l2 1.5"/><path d="M4 20h16M17 20v-6l-2-1"/></g>'],
      ['port', 'Port', '<g ' + S + '><circle cx="12" cy="5" r="1.6"/><path d="M12 7v12M8 11h8M6 15a6 6 0 0 0 12 0"/></g>'],
      ['bridge', 'Bridge', '<g ' + S + '><path d="M3 15a9 9 0 0 1 18 0"/><path d="M3 15v3M21 15v3M8 13v4M16 13v4"/></g>'],
      ['lighthouse', 'Lighthouse', '<g ' + S + '><path d="M9 20l1-9h4l1 9z"/><path d="M10 11V8h4v3M12 5v1M9 7l-2-1M15 7l2-1"/></g>'],
      ['mine', 'Mine', '<g ' + S + '><path d="M12 4v6M12 10c-3 0-6 2-6 6M12 10c3 0 6 2 6 6"/><path d="M5 16h4M15 16h4"/></g>']
    ]},
    { name: 'Markers', items: [
      ['battle', 'Battle', '<g ' + S + '><path d="M5 5l10 10M6 14l-2 2 2 2 2-2M19 5l-8 8"/><path d="M18 14l2 2-2 2-2-2"/></g>'],
      ['crown', 'Crown', '<g ' + S + '><path d="M4 17l-1-8 4 4 5-7 5 7 4-4-1 8z"/><path d="M4 17h16"/></g>'],
      ['flag', 'Flag', '<g ' + S + '><path d="M7 21V4"/><path d="M7 5h10l-2.5 3.5L17 12H7z" ' + F + ' stroke="none"/></g>'],
      ['skull', 'Skull', '<g ' + S + '><path d="M6 11a6 6 0 1 1 12 0c0 2-1 3-1 4v2H7v-2c0-1-1-2-1-4z"/><circle cx="9.5" cy="11" r="1.3" ' + F + ' stroke="none"/><circle cx="14.5" cy="11" r="1.3" ' + F + ' stroke="none"/></g>'],
      ['star', 'Star', '<path d="M12 3l2.5 6.3L21 10l-4.8 4 1.5 6.5L12 17l-5.7 3.5L7.8 14 3 10l6.5-0.7z" ' + F + '/>'],
      ['camp', 'Camp', '<g ' + S + '><path d="M12 6L4 19h16z"/><path d="M12 6v13"/></g>']
    ]}
  ];

  var byId = {};
  GROUPS.forEach(function (g) { g.items.forEach(function (it) { byId[it[0]] = it; }); });

  function svg(id, cls) {
    var it = byId[id];
    if (!it) return '';
    return '<svg class="' + (cls || 'ftsym') + '" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">' + it[2] + '</svg>';
  }

  window.ftSymbols = {
    GROUPS: GROUPS,
    list: function () { var a = []; GROUPS.forEach(function (g) { g.items.forEach(function (it) { a.push(it[0]); }); }); return a; },
    byId: function (id) { return byId[id] || null; },
    svg: svg
  };
})();

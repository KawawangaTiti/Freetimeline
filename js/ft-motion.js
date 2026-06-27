/* FreeTimeline — GSAP motion layer.
   Non-invasive: wraps the global switchView() to cross-fade the incoming view and
   stagger-reveal the character/people cards. No engine logic, data, or view keys are
   touched — if GSAP or switchView is missing, this is a silent no-op. */
(function () {
  if (typeof window.gsap === 'undefined' || typeof window.switchView !== 'function') return;

  // view key -> the container the engine makes visible (covers both apps; missing keys skipped)
  var CONTAINER = {
    timeline: 'canvas-wrap',
    characters: 'chars-view', people: 'people-view',
    connections: 'map-view', map: 'map-view',
    stats: 'stats-full-view'
  };

  var _orig = window.switchView;
  window.switchView = function (view) {
    var r = _orig.apply(this, arguments);   // run the real engine logic first
    try { animate(view); } catch (e) { /* never let motion break navigation */ }
    return r;
  };

  function animate(view) {
    var el = document.getElementById(CONTAINER[view]);
    if (!el) return;
    gsap.killTweensOf(el);
    // gentle cross-fade of the whole view (opacity only — safe over the canvas)
    gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.32, ease: 'power2.out', clearProps: 'opacity' });

    // stagger the character / people cards in
    if (view === 'characters' || view === 'people') {
      var grid = el.querySelector('.cv-grid, .pv-grid');
      if (grid && grid.children.length) {
        var cards = Array.prototype.slice.call(grid.children);
        gsap.from(cards, { opacity: 0, y: 14, duration: 0.42, stagger: 0.045, ease: 'power3.out', clearProps: 'all' });
      }
    }
  }
})();

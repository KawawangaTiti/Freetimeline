/* FreeTimeline — keep chrome off the canvas.
   The persistent "Drag to pan · Scroll · … · Keyboard Shortcuts" bar (#kbd-hint) sits over the
   timeline and eats space. Fade it out once the user actually touches the timeline (or after a
   few seconds) and hand the room back to the canvas. The shortcuts stay reachable via Help ▸ Keys. */
(function () {
  var hint = document.getElementById('kbd-hint');
  if (!hint) return;
  hint.style.transition = 'opacity .5s ease';

  var done = false, timer;
  function hide() {
    if (done) return; done = true;
    hint.style.opacity = '0';
    setTimeout(function () {
      hint.style.display = 'none';
      try { window.dispatchEvent(new Event('resize')); } catch (e) {} // let the engine reclaim the height
    }, 520);
    cleanup();
  }
  function cleanup() {
    clearTimeout(timer);
    var cw = document.getElementById('canvas-wrap');
    if (cw) { cw.removeEventListener('pointerdown', hide, true); cw.removeEventListener('wheel', hide, true); }
  }

  // fallback: auto-dismiss after a few seconds
  timer = setTimeout(hide, 7000);
  // or the moment the user interacts with the timeline itself
  var cw = document.getElementById('canvas-wrap');
  if (cw) {
    cw.addEventListener('pointerdown', hide, true);
    cw.addEventListener('wheel', hide, { capture: true, passive: true });
  }
})();
/* NB: the timeline now auto-frames on the data from inside each engine's load handler
   (fitRangeToData), where YEAR_MIN/MAX can actually be mutated — external assignment can't. */


/* Appended after the standalone deck's original script. No desktop overrides. */
(() => {
  const compact = matchMedia('(max-width: 900px), (max-width: 1400px) and (pointer: coarse)');
  const hint = document.getElementById('imageLightboxHint');
  const originalHint = hint?.textContent;
  const originalShowSlide = showSlide;
  const sync = () => {
    if (hint) hint.textContent = compact.matches ? 'ŤUKNITE MIMO NÁHĽADU ALEBO NA TLAČIDLO ZAVRIEŤ' : originalHint;
    if (compact.matches) slides[current]?.scrollTo(0, 0);
  };
  showSlide = function(index) {
    originalShowSlide(index);
    if (compact.matches) slides[current]?.scrollTo(0, 0);
  };
  compact.addEventListener('change', sync);
  sync();

  // A horizontal swipe changes slides; vertical gestures remain native scrolling.
  const deck = document.getElementById('deck');
  let gesture = null;
  deck.addEventListener('touchstart', event => {
    gesture = null;
    if (!compact.matches || event.touches.length !== 1 || imageLightbox.classList.contains('open') || startOverlay.style.display !== 'none') return;
    if (event.target.closest('button, a, video, audio')) return;
    const touch = event.touches[0];
    gesture = {x: touch.clientX, y: touch.clientY, started: performance.now()};
  }, {passive: true});
  deck.addEventListener('touchmove', event => {
    if (!gesture) return;
    if (event.touches.length !== 1 || Math.abs(event.touches[0].clientY - gesture.y) > 30) gesture = null;
  }, {passive: true});
  deck.addEventListener('touchcancel', () => { gesture = null; }, {passive: true});
  deck.addEventListener('touchend', event => {
    if (!gesture) return;
    const start = gesture;
    gesture = null;
    const touch = event.changedTouches[0];
    if (!touch || !compact.matches || imageLightbox.classList.contains('open')) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 72 || Math.abs(dx) < Math.abs(dy) * 2 || performance.now() - start.started > 800) return;
    dx < 0 ? next() : prev();
  }, {passive: true});
})();

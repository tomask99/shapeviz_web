// Share the page's animation frame so hit testing runs after scroll transforms.
export function mountClientPreviews(requestFrame) {
  const lists = [...document.querySelectorAll('.client-list')];
  const hover = matchMedia('(hover: hover) and (pointer: fine)');
  let x = 0, y = 0, pointerPresent = false, focusedRow = null, activeRow = null, dirty = true;
  const rowFor = element => {
    const row = element?.closest('.client-list > li');
    return row?.querySelector('.client-preview') ? row : null;
  };
  function invalidate() { dirty = true; requestFrame(); }
  function clear() {
    pointerPresent = false;
    focusedRow = null;
    activeRow?.classList.remove('is-preview-active');
    activeRow = null;
    invalidate();
  }
  function pointer(event) {
    if (event.pointerType === 'touch') { clear(); return; }
    x = event.clientX; y = event.clientY;
    pointerPresent = true;
    focusedRow = null;
    invalidate();
  }
  addEventListener('pointermove', pointer, {passive:true});
  addEventListener('pointerdown', pointer, {passive:true});
  // Scrolling can move another row underneath a completely stationary pointer.
  addEventListener('scroll', invalidate, {passive:true, capture:true});
  addEventListener('resize', invalidate, {passive:true});
  addEventListener('blur', clear);
  document.documentElement.addEventListener('pointerleave', clear);
  document.addEventListener('pointercancel', clear);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
  document.addEventListener('focusin', event => {
    focusedRow = event.target.matches(':focus-visible') ? rowFor(event.target) : null;
    invalidate();
  });
  document.addEventListener('focusout', () => { focusedRow = null; invalidate(); });
  hover.addEventListener('change', clear);
  lists.forEach(list => list.classList.add('previews-ready'));
  return function syncClientPreviews() {
    if (!dirty) return;
    dirty = false;
    let next = focusedRow;
    if (!next && pointerPresent && hover.matches && !document.hidden) {
      next = rowFor(document.elementFromPoint(x, y));
    }
    if (next) {
      const bounds = next.getBoundingClientRect();
      if (bounds.bottom <= 0 || bounds.top >= innerHeight) next = null;
    }
    if (next === activeRow) return;
    activeRow?.classList.remove('is-preview-active');
    next?.classList.add('is-preview-active');
    activeRow = next;
  };
}

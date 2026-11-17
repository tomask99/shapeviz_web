// Share the page's animation frame so hit testing runs after scroll transforms.
export function mountClientPreviews(requestFrame) {
  const lists = [...document.querySelectorAll('.client-list')];
  const hover = matchMedia('(hover: hover) and (pointer: fine)');
  let x = 0, y = 0, pointerPresent = false, focusedRow = null, activeRow = null, tappedRow = null, dirty = true;
  const rowFor = element => {
    const row = element?.closest('.client-list > li');
    return row?.querySelector('.client-preview') ? row : null;
  };
  function invalidate() { dirty = true; requestFrame(); }
  function clear() {
    pointerPresent = false;
    focusedRow = null;
    tappedRow = null;
    activeRow?.classList.remove('is-preview-active');
    activeRow?.querySelector('.client-toggle')?.setAttribute('aria-expanded', 'false');
    activeRow = null;
    invalidate();
  }
  function pointer(event) {
    if (event.pointerType === 'touch') { pointerPresent = false; focusedRow = null; invalidate(); return; }
    x = event.clientX; y = event.clientY;
    pointerPresent = true;
    focusedRow = null;
    tappedRow = null;
    invalidate();
  }
  addEventListener('pointermove', pointer, {passive:true});
  addEventListener('pointerdown', pointer, {passive:true});
  // Scrolling can move another row underneath a completely stationary pointer.
  addEventListener('scroll', invalidate, {passive:true, capture:true});
  addEventListener('resize', invalidate, {passive:true});
  addEventListener('blur', clear);
  document.documentElement.addEventListener('pointerleave', event => { if (event.pointerType !== 'touch') clear(); });
  document.addEventListener('pointercancel', event => { if (event.pointerType !== 'touch') clear(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
  document.addEventListener('focusin', event => {
    focusedRow = !event.target.matches('.client-toggle') && event.target.matches(':focus-visible') ? rowFor(event.target) : null;
    invalidate();
  });
  document.addEventListener('focusout', () => { focusedRow = null; invalidate(); });
  hover.addEventListener('change', clear);
  lists.forEach(list => {
    list.querySelectorAll(':scope > li').forEach((row, index) => {
      if (!row.querySelector('.client-preview')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'client-toggle';
      button.setAttribute('aria-label', row.querySelector('.client-name').textContent);
      button.setAttribute('aria-expanded', 'false');
      const panel = row.querySelector('.client-description') || row.querySelector('.client-preview');
      panel.id ||= `client-details-${lists.indexOf(list)}-${index}`;
      button.setAttribute('aria-controls', panel.id);
      button.addEventListener('click', () => {
        tappedRow = tappedRow === row ? null : row;
        focusedRow = null;
        pointerPresent = false;
        invalidate();
      });
      row.append(button);
    });
    list.classList.add('previews-ready');
  });
  document.addEventListener('click', event => {
    if (tappedRow && !event.target.closest('.client-list')) { tappedRow = null; invalidate(); }
  });
  return function syncClientPreviews() {
    if (!dirty) return;
    dirty = false;
    let next = tappedRow || focusedRow;
    if (!next && pointerPresent && hover.matches && !document.hidden) {
      next = rowFor(document.elementFromPoint(x, y));
    }
    if (next) {
      const bounds = next.getBoundingClientRect();
      if (bounds.bottom <= 0 || bounds.top >= innerHeight) next = null;
    }
    if (next === activeRow) return;
    activeRow?.classList.remove('is-preview-active');
    activeRow?.querySelector('.client-toggle')?.setAttribute('aria-expanded', 'false');
    next?.classList.add('is-preview-active');
    next?.querySelector('.client-toggle')?.setAttribute('aria-expanded', 'true');
    activeRow = next;
  };
}

// Reorder the existing nodes so pointer capture and keyboard focus survive a move.
export function gallerySort({grid, move, changed, announce, disabled}) {
  let drag = null;
  let frame = 0;
  const settling = new Set();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  function reorder(id, target) {
    const nodes = [...grid.children];
    const from = nodes.findIndex(node => node.dataset.id === id);
    if (from === target || target < 0 || target >= nodes.length) return;
    const bounds = new Map(nodes.map(node => [node, node.getBoundingClientRect()]));
    nodes.forEach(node => node.getAnimations().forEach(animation => animation.cancel()));
    move(from, target);
    const [node] = nodes.splice(from, 1);
    nodes.splice(target, 0, node);
    grid.insertBefore(node, nodes[target + 1] || null);
    if (drag?.pointerActive && drag.handle.isConnected) drag.handle.setPointerCapture(drag.pointerId);
    nodes.forEach((child, index) => {
      child.querySelector('[data-order]').textContent = String(index + 1).padStart(2, '0');
      const before = bounds.get(child);
      const after = child.getBoundingClientRect();
      if (!reducedMotion.matches && child !== drag?.card) child.animate([
        {transform:`translate(${before.left - after.left}px, ${before.top - after.top}px)`},
        {transform:'translate(0, 0)'}
      ], {duration:280, easing:'cubic-bezier(.22,1,.36,1)'});
    });
    announce(`Moved to position ${target + 1} of ${nodes.length}.`);
  }

  function finish(cancel = false) {
    if (!drag) return;
    if (cancel) {
      drag.order.forEach((id, index) => reorder(id, index));
      announce('Move cancelled.');
    } else if (drag.active) changed();
    const {card, ghost} = drag;
    // Keep the floating image visible until it reaches its final grid position.
    if (ghost && !reducedMotion.matches) {
      const destination = card.getBoundingClientRect();
      const animation = ghost.animate([
        {transform:ghost.style.transform},
        {transform:`translate3d(${destination.left}px, ${destination.top}px, 0)`}
      ], {duration:200, easing:'cubic-bezier(.22,1,.36,1)', fill:'forwards'});
      const cleanup = () => {
        if (!settling.delete(cleanup)) return;
        ghost.remove();
        card.classList.remove('is-moving');
      };
      settling.add(cleanup);
      animation.finished.then(cleanup, cleanup);
    } else {
      card.classList.remove('is-moving');
      ghost?.remove();
    }
    drag.handle.setAttribute('aria-pressed', 'false');
    if (drag.pointerId != null && drag.handle.hasPointerCapture(drag.pointerId)) drag.handle.releasePointerCapture(drag.pointerId);
    drag = null;
    cancelAnimationFrame(frame);
    grid.classList.remove('is-sorting');
  }

  function tick(time = performance.now()) {
    if (!drag?.active || drag.keyboard) return;
    const {x, y} = drag;
    drag.ghost.style.transform = `translate3d(${x - drag.offsetX}px, ${y - drag.offsetY}px, 0)`;
    const elapsed = Math.min(32, time - drag.lastTime);
    drag.lastTime = time;
    // Horizontal gestures near the viewport edge must not start vertical scrolling.
    const edge = 72;
    let speed = 0;
    if (y < edge && y < drag.startY - 12) speed = -Math.min(1, (edge - y) / edge);
    if (y > innerHeight - edge && y > drag.startY + 12) speed = Math.min(1, (y - innerHeight + edge) / edge);
    if (speed) window.scrollBy({top:speed * elapsed * .6, behavior:'instant'});
    const pageX = x + window.scrollX;
    const pageY = y + window.scrollY;
    // Hit-test the original slots, independent of cards animating across the pointer.
    // Using their immutable indices also prevents a stationary pointer from sorting twice.
    const target = drag.slots.find(slot => {
      const inset = Math.min(24, slot.width * .1);
      return pageX >= slot.left + inset && pageX <= slot.left + slot.width - inset &&
        pageY >= slot.top && pageY <= slot.top + slot.height;
    });
    if (target && target.index !== drag.targetIndex) {
      reorder(drag.card.dataset.id, target.index);
      drag.targetIndex = target.index;
    }
    frame = requestAnimationFrame(tick);
  }

  const pointerDown = event => {
    const handle = event.target.closest('[data-drag]');
    if (!handle || event.button !== 0 || disabled()) return;
    if (drag) finish(true);
    settling.forEach(cleanup => cleanup());
    const card = handle.closest('[data-id]');
    const rect = card.getBoundingClientRect();
    const gridRect = grid.getBoundingClientRect();
    const slots = [...grid.children].map((node, index) => ({index, left:gridRect.left + window.scrollX + node.offsetLeft, top:gridRect.top + window.scrollY + node.offsetTop, width:node.offsetWidth, height:node.offsetHeight}));
    drag = {card, handle, pointerId:event.pointerId, pointerActive:true, x:event.clientX, y:event.clientY, startX:event.clientX, startY:event.clientY, offsetX:event.clientX - rect.left, offsetY:event.clientY - rect.top, order:[...grid.children].map(node => node.dataset.id), slots, targetIndex:[...grid.children].indexOf(card), lastTime:performance.now(), active:false};
    handle.setPointerCapture(event.pointerId);
  };
  const pointerMove = event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (!drag.active && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) > 6) {
      drag.active = true;
      const rect = drag.card.getBoundingClientRect();
      drag.ghost = drag.card.cloneNode(true);
      drag.ghost.classList.add('gallery-drag-ghost');
      drag.ghost.setAttribute('aria-hidden', 'true');
      drag.ghost.inert = true;
      drag.ghost.style.width = `${rect.width}px`;
      drag.ghost.style.height = `${rect.height}px`;
      document.body.append(drag.ghost);
      drag.card.classList.add('is-moving');
      drag.handle.setAttribute('aria-pressed', 'true');
      grid.classList.add('is-sorting');
      tick();
    }
    if (drag.active) event.preventDefault();
  };
  const pointerUp = event => {
    if (drag?.pointerId !== event.pointerId) return;
    drag.pointerActive = false;
    drag.x = event.clientX;
    drag.y = event.clientY;
    cancelAnimationFrame(frame);
    tick();
    finish();
  };
  const pointerCancel = event => {
    if (drag?.pointerId !== event.pointerId) return;
    drag.pointerActive = false;
    finish(true);
  };
  const focusOut = event => {
    if (drag?.keyboard && event.relatedTarget && !drag.handle.contains(event.relatedTarget)) finish();
  };
  const keydown = event => {
    if (event.key === 'Escape' && drag) {event.preventDefault(); finish(true); return;}
    const handle = event.target.closest('[data-drag]');
    if (!handle || disabled()) return;
    if ([' ', 'Enter'].includes(event.key)) {
      event.preventDefault();
      if (drag) {finish(); return;}
      const card = handle.closest('[data-id]');
      drag = {card, handle, keyboard:true, active:true, order:[...grid.children].map(node => node.dataset.id)};
      card.classList.add('is-moving');
      handle.setAttribute('aria-pressed', 'true');
      announce('Use arrow keys to move. Press Space to finish or Escape to cancel.');
    } else if (drag?.keyboard && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const index = [...grid.children].indexOf(drag.card);
      reorder(drag.card.dataset.id, index + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1));
      handle.focus({preventScroll:true});
    }
  };
  grid.addEventListener('pointerdown', pointerDown);
  grid.addEventListener('focusout', focusOut);
  window.addEventListener('pointermove', pointerMove, {passive:false});
  window.addEventListener('pointerup', pointerUp);
  window.addEventListener('pointercancel', pointerCancel);
  window.addEventListener('keydown', keydown);
  const resize = () => finish(true);
  window.addEventListener('resize', resize);
  const blur = () => {if (drag) {drag.pointerActive = false; finish(true);}};
  window.addEventListener('blur', blur);
  return () => {
    finish(true);
    settling.forEach(cleanup => cleanup());
    grid.removeEventListener('pointerdown', pointerDown);
    grid.removeEventListener('focusout', focusOut);
    window.removeEventListener('pointermove', pointerMove);
    window.removeEventListener('pointerup', pointerUp);
    window.removeEventListener('pointercancel', pointerCancel);
    window.removeEventListener('keydown', keydown);
    window.removeEventListener('resize', resize);
    window.removeEventListener('blur', blur);
  };
}

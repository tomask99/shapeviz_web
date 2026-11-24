const wordmark = document.querySelector('.portfolio-wordmark');
const motion = matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');

wordmark?.addEventListener('pointermove', event => {
  if (!motion.matches || event.pointerType === 'touch') return;
  const bounds = wordmark.getBoundingClientRect();
  wordmark.style.setProperty('--light-x', `${event.clientX - bounds.left}px`);
  wordmark.style.setProperty('--light-y', `${event.clientY - bounds.top}px`);
});

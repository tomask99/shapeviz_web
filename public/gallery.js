const toggle = document.querySelector('#gallery-toggle');
const gallery = document.querySelector('#expanded-gallery');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const visibleImages = new Set();
let frame = 0;

function draw() {
  frame = 0;
  if (gallery.hidden || document.hidden) return;
  visibleImages.forEach(image => {
    const bounds = image.getBoundingClientRect();
    const progress = Math.max(-1, Math.min(1, (bounds.top + bounds.height / 2 - innerHeight / 2) / innerHeight));
    image.style.setProperty('--gallery-drift', reducedMotion.matches ? '0px' : `${progress * 12}px`);
  });
}
function requestDraw() { if (!frame && !gallery.hidden) frame = requestAnimationFrame(draw); }
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => entry.isIntersecting ? visibleImages.add(entry.target) : visibleImages.delete(entry.target));
  requestDraw();
});
gallery.querySelectorAll('img').forEach(image => observer.observe(image));

function setExpanded(expanded) {
  // If closing from deep inside the gallery, return to its trigger before removing
  // the document height. This avoids jumping into the contact section below it.
  if (!expanded) {
    const top = toggle.getBoundingClientRect().top + scrollY - 90;
    if (toggle.getBoundingClientRect().top < 0) scrollTo({ top, behavior: 'instant' });
    gallery.querySelectorAll('video').forEach(video => video.pause());
  }
  gallery.hidden = !expanded;
  toggle.setAttribute('aria-expanded', String(expanded));
  toggle.querySelector('span').textContent = expanded ? 'COLLAPSE GALLERY' : 'EXPAND GALLERY';
  if (expanded) {
    gallery.querySelectorAll('[data-gallery-src]').forEach(image => {
      image.srcset = image.dataset.gallerySrcset;
      image.src = image.dataset.gallerySrc;
      delete image.dataset.gallerySrc;
    });
    gallery.querySelectorAll('[data-gallery-poster]').forEach(video => {
      video.poster = video.dataset.galleryPoster;
      delete video.dataset.galleryPoster;
    });
  } else toggle.focus({ preventScroll: true });
  dispatchEvent(new Event('resize'));
  dispatchEvent(new Event('gallerychange'));
  requestDraw();
}
toggle.addEventListener('click', () => setExpanded(gallery.hidden));
gallery.querySelectorAll('.gallery-collapse').forEach(button => button.addEventListener('click', () => setExpanded(false)));
addEventListener('scroll', requestDraw, { passive: true });
addEventListener('resize', requestDraw, { passive: true });
reducedMotion.addEventListener('change', requestDraw);

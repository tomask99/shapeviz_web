const toggle = document.querySelector('#gallery-toggle');
const gallery = document.querySelector('#expanded-gallery');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const slots = [...gallery.querySelectorAll('.gallery-slot')];
const smooth = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
let frame = 0;

function draw() {
  frame = 0;
  if (gallery.hidden || document.hidden) return;
  // Measure stationary slots, then animate their children: transforms never feed
  // back into the scroll calculation or fight with the media's hover transform.
  const bounds = slots.map(slot => slot.getBoundingClientRect());
  slots.forEach((slot, index) => {
    const rect = bounds[index];
    const enter = smooth((innerHeight - rect.top) / Math.min(240, innerHeight * .28));
    const leave = smooth((-rect.top - rect.height * .35) / (rect.height * .65));
    const amount = reducedMotion.matches ? 0 : Math.max(1 - enter, leave);
    const direction = [...slot.parentElement.children].indexOf(slot) % 2 ? 1 : -1;
    const distance = Math.min(90, innerWidth * .09);
    slot.style.setProperty('--gallery-x', `${direction * amount * distance}px`);
    slot.style.setProperty('--gallery-opacity', String(1 - amount));
    slot.style.setProperty('--gallery-scale', String(1 - amount * .065));
  });
}
function requestDraw() { if (!frame && !gallery.hidden) frame = requestAnimationFrame(draw); }

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
document.addEventListener('visibilitychange', requestDraw);

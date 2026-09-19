const toggle = document.querySelector('#gallery-toggle');
const gallery = document.querySelector('#expanded-gallery');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const smooth = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
const track = document.createElement('div');
track.className = 'gallery-track';
const stage = document.createElement('div');
stage.className = 'gallery-stage';
const viewport = document.createElement('div');
viewport.className = 'gallery-viewport';
const pages = [];
for (const section of gallery.querySelectorAll('.gallery-section')) {
  const items = [...section.querySelectorAll('.gallery-slot')];
  for (let i = 0; i < items.length; i += 2) {
    const page = document.createElement('section');
    page.className = 'gallery-page';
    const heading = section.querySelector('.gallery-heading').cloneNode(true);
    heading.removeAttribute('data-reveal');
    heading.querySelector('h3').removeAttribute('id');
    page.setAttribute('aria-label', heading.querySelector('h3').textContent + ', pair ' + (i / 2 + 1));
    page.append(heading);
    const pair = document.createElement('div');
    pair.className = 'gallery-pair';
    pair.append(...items.slice(i, i + 2));
    page.append(pair);
    viewport.append(page);
    pages.push(page);
  }
  section.remove();
}
stage.append(gallery.querySelector('.gallery-toolbar'), viewport);
const navigation = document.createElement('div');
navigation.className = 'gallery-navigation micro';
navigation.innerHTML = '<button type="button" class="gallery-prev" aria-label="Previous image pair">PREVIOUS</button><span class="gallery-position" aria-live="polite"></span><button type="button" class="gallery-next" aria-label="Next image pair">NEXT</button>';
stage.append(navigation);
track.append(stage);
gallery.prepend(track);
let frame = 0, position = 0, lastTime = 0, active = -1, step = 400;

function loadPage(page) {
  page?.querySelectorAll('[data-gallery-src]').forEach(image => {
    image.loading = 'eager';
    image.srcset = image.dataset.gallerySrcset;
    image.src = image.dataset.gallerySrc;
    delete image.dataset.gallerySrc;
  });
  page?.querySelectorAll('[data-gallery-poster]').forEach(video => {
    video.poster = video.dataset.galleryPoster;
    delete video.dataset.galleryPoster;
  });
}
function layout() {
  step = Math.min(460, Math.max(280, innerHeight * .48));
  gallery.classList.toggle('gallery-static', reducedMotion.matches);
  track.style.height = reducedMotion.matches ? '' : (innerHeight + (pages.length - 1) * step + 100) + 'px';
  if (reducedMotion.matches) {
    pages.forEach(page => { page.inert = false; page.removeAttribute('aria-hidden'); if (!gallery.hidden) loadPage(page); });
  }
  requestDraw();
}
function draw(time) {
  frame = 0;
  if (gallery.hidden || document.hidden) return;
  if (reducedMotion.matches) return;
  const target = Math.max(0, Math.min(pages.length - 1, -track.getBoundingClientRect().top / step));
  const elapsed = lastTime ? Math.min(64, time - lastTime) : 16;
  lastTime = time;
  position += (target - position) * (1 - Math.exp(-elapsed / 65));
  if (Math.abs(target - position) < .001) position = target;
  const nextActive = Math.min(pages.length - 1, Math.floor(position + .5));
  pages.forEach((page, index) => {
    const delta = position - index;
    const outgoing = smooth(delta);
    const incoming = smooth(1 + delta);
    const visible = delta >= -1 && delta <= 1;
    page.style.visibility = visible ? 'visible' : 'hidden';
    page.style.setProperty('--pair-opacity', String(delta >= 0 ? 1 - outgoing : incoming));
    page.style.setProperty('--pair-y', (delta >= 0 ? 0 : (1 - incoming) * innerHeight * .55) + 'px');
    page.style.setProperty('--pair-split', (outgoing * Math.min(240, innerWidth * .22)) + 'px');
    page.style.setProperty('--pair-scale', String(delta >= 0 ? 1 - outgoing * .12 : .94 + incoming * .06));
    page.style.zIndex = String(index + 1);
    page.inert = index !== nextActive;
    page.setAttribute('aria-hidden', String(index !== nextActive));
  });
  loadPage(pages[nextActive]); loadPage(pages[nextActive + 1]);
  if (active !== nextActive) {
    active = nextActive;
    navigation.querySelector('.gallery-position').textContent = String(active + 1).padStart(2, '0') + ' / ' + String(pages.length).padStart(2, '0') + ' — SCROLL TO EXPLORE';
    navigation.querySelector('.gallery-prev').disabled = active === 0;
    navigation.querySelector('.gallery-next').disabled = active === pages.length - 1;
    dispatchEvent(new Event('gallerychange'));
  }
  if (position !== target) requestDraw();
}
function requestDraw() { if (!frame && !gallery.hidden) frame = requestAnimationFrame(draw); }
function goTo(index) {
  scrollTo({ top: track.getBoundingClientRect().top + scrollY + Math.max(0, Math.min(pages.length - 1, index)) * step, behavior: 'smooth' });
}
navigation.querySelector('.gallery-prev').addEventListener('click', () => goTo(active - 1));
navigation.querySelector('.gallery-next').addEventListener('click', () => goTo(active + 1));
function setExpanded(expanded) {
  if (!expanded) {
    const top = toggle.getBoundingClientRect().top + scrollY - 90;
    if (toggle.getBoundingClientRect().top < 0) scrollTo({ top, behavior: 'instant' });
    gallery.querySelectorAll('video').forEach(video => video.pause());
  }
  gallery.hidden = !expanded;
  toggle.setAttribute('aria-expanded', String(expanded));
  toggle.querySelector('span').textContent = expanded ? 'COLLAPSE GALLERY' : 'EXPAND GALLERY';
  position = 0; lastTime = 0; active = -1;
  layout();
  if (expanded && !reducedMotion.matches) {
    draw(performance.now());
    goTo(0);
  } else if (!expanded) toggle.focus({ preventScroll: true });
  dispatchEvent(new Event('resize'));
  dispatchEvent(new Event('gallerychange'));
}
toggle.addEventListener('click', () => setExpanded(gallery.hidden));
gallery.querySelectorAll('.gallery-collapse').forEach(button => button.addEventListener('click', () => setExpanded(false)));
addEventListener('scroll', requestDraw, { passive: true });
addEventListener('resize', layout, { passive: true });
reducedMotion.addEventListener('change', () => { layout(); dispatchEvent(new Event('gallerychange')); });
document.addEventListener('visibilitychange', () => { lastTime = 0; requestDraw(); });
layout();

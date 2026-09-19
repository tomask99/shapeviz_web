const toggle = document.querySelector('#gallery-toggle');
const gallery = document.querySelector('#expanded-gallery');

function loadMedia(panel) {
  panel.querySelectorAll('[data-gallery-src]').forEach(image => {
    image.srcset = image.dataset.gallerySrcset;
    image.src = image.dataset.gallerySrc;
    delete image.dataset.gallerySrc;
  });
  panel.querySelectorAll('[data-gallery-poster]').forEach(video => {
    video.poster = video.dataset.galleryPoster;
    delete video.dataset.galleryPoster;
  });
}
function setExpanded(expanded) {
  if (!expanded) {
    if (toggle.getBoundingClientRect().top < 0) scrollTo({ top: toggle.getBoundingClientRect().top + scrollY - 90, behavior: 'instant' });
    gallery.querySelectorAll('video').forEach(video => video.pause());
  }
  gallery.hidden = !expanded;
  toggle.setAttribute('aria-expanded', String(expanded));
  toggle.querySelector('span').textContent = expanded ? 'CLOSE GALLERY' : 'EXPAND GALLERY';
  if (expanded) loadMedia(gallery);
  else toggle.focus({ preventScroll: true });
  dispatchEvent(new Event('resize'));
  dispatchEvent(new Event('gallerychange'));
}
toggle.addEventListener('click', () => setExpanded(gallery.hidden));
gallery.querySelectorAll('.gallery-collapse').forEach(button => button.addEventListener('click', () => setExpanded(false)));

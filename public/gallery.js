const toggle = document.querySelector('#gallery-toggle');
const gallery = document.querySelector('#expanded-gallery');
const tabs = [...gallery.querySelectorAll('[role="tab"]')];
const panels = [...gallery.querySelectorAll('[role="tabpanel"]')];

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
function selectCategory(index, focus = false) {
  // Category content always starts at the same place in the document.
  const top = panels.find(panel => !panel.hidden).getBoundingClientRect().top;
  if (top < 100) scrollTo({ top: top + scrollY - 100, behavior: 'instant' });
  gallery.querySelectorAll('video').forEach(video => video.pause());
  tabs.forEach((tab, i) => {
    tab.setAttribute('aria-selected', String(i === index));
    tab.tabIndex = i === index ? 0 : -1;
    panels[i].hidden = i !== index;
  });
  loadMedia(panels[index]);
  if (focus) tabs[index].focus({ preventScroll: true });
  dispatchEvent(new Event('resize'));
  dispatchEvent(new Event('gallerychange'));
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectCategory(index));
  tab.addEventListener('keydown', event => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next !== undefined) { event.preventDefault(); selectCategory(next, true); }
  });
});
function setExpanded(expanded) {
  if (!expanded) {
    if (toggle.getBoundingClientRect().top < 0) scrollTo({ top: toggle.getBoundingClientRect().top + scrollY - 90, behavior: 'instant' });
    gallery.querySelectorAll('video').forEach(video => video.pause());
  }
  gallery.hidden = !expanded;
  toggle.setAttribute('aria-expanded', String(expanded));
  toggle.querySelector('span').textContent = expanded ? 'CLOSE GALLERY' : 'EXPAND GALLERY';
  if (expanded) loadMedia(panels.find(panel => !panel.hidden));
  else toggle.focus({ preventScroll: true });
  dispatchEvent(new Event('resize'));
  dispatchEvent(new Event('gallerychange'));
}
toggle.addEventListener('click', () => setExpanded(gallery.hidden));
gallery.querySelectorAll('.gallery-collapse').forEach(button => button.addEventListener('click', () => setExpanded(false)));

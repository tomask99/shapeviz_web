import {t} from './i18n/runtime.js';
import {svgIcon} from './ui/icons.js';
import './gallery.js';
import './dialog-dismiss.js';
import {finePointer, reducedMotion, requestFrame} from './site/hero-motion.js';
const dialog = document.querySelector('.lightbox');

const revealObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('revealed'); revealObserver.unobserve(entry.target); }
  });
}, { threshold: .1 });
document.querySelectorAll('[data-reveal]').forEach(element => revealObserver.observe(element));

// Videos are silent by default, load close to the viewport and pause offscreen.
const videos = [...document.querySelectorAll('video[data-autoplay]')];
const videoStates = new Map(videos.map(video => [video, { visible: false, userPaused: false, userStarted: false }]));
function loadVideo(video) {
  if (!video.src) { video.src = video.dataset.src; video.load(); }
}
function syncVideo(video) {
  const state = videoStates.get(video);
  const canPlay = state.visible && !video.closest('[hidden], [inert]') && !state.userPaused && (!reducedMotion.matches || state.userStarted) && !document.hidden && !dialog.open;
  if (canPlay) { loadVideo(video); video.play().catch(() => updateVideoControls(video)); }
  else video.pause();
}
function updateVideoControls(video) {
  const controls = video.parentElement.querySelector('.video-controls');
  const play = controls.querySelector('.video-play');
  play.setAttribute('aria-label', video.paused ? t('Play video') : t('Pause video'));
  play.firstElementChild.innerHTML = svgIcon(video.paused ? 'play' : 'pause');
  const sound = controls.querySelector('.video-sound');
  sound.setAttribute('aria-label', video.muted ? t('Unmute video') : t('Mute video'));
  sound.setAttribute('aria-pressed', String(!video.muted));
}
const videoObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    videoStates.get(entry.target).visible = entry.isIntersecting;
    syncVideo(entry.target);
  });
}, { threshold: .25 });
const videoPreload = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting && !entry.target.closest('[inert]') && !reducedMotion.matches) { loadVideo(entry.target); videoPreload.unobserve(entry.target); }
  });
}, { rootMargin: '250px' });
videos.forEach(video => {
  video.muted = true;
  const controls = video.parentElement.querySelector('.video-controls');
  video.controls = false;
  controls.hidden = false;
  controls.querySelector('.video-play').addEventListener('click', () => {
    const state = videoStates.get(video);
    if (video.paused) {
      state.userPaused = false; state.userStarted = true;
      loadVideo(video);
      video.play().catch(() => { video.controls = true; controls.hidden = true; });
    } else { state.userPaused = true; video.pause(); }
  });
  controls.querySelector('.video-sound').addEventListener('click', () => { video.muted = !video.muted; });
  ['play', 'pause', 'volumechange'].forEach(event => video.addEventListener(event, () => updateVideoControls(video)));
  video.addEventListener('error', () => { video.controls = true; controls.hidden = true; });
  videoObserver.observe(video);
  videoPreload.observe(video);
});

let lightboxTrigger;
addEventListener('gallerychange', () => videos.forEach(syncVideo));
function closeLightbox() { dialog.close(); }
document.querySelectorAll('[data-lightbox]').forEach(button => {
  button.addEventListener('click', () => {
    lightboxTrigger = button;
    dialog.querySelector('img').src = button.dataset.lightbox;
    dialog.querySelector('img').alt = button.querySelector('img').alt;
    dialog.querySelector('p').textContent = button.querySelector('img').alt;
    dialog.showModal();
    document.body.classList.add('modal-open');
    videos.forEach(syncVideo);
    dialog.querySelector('button').focus();
  });
});
dialog.querySelector('button').addEventListener('click', closeLightbox);
dialog.querySelector('img').addEventListener('click', closeLightbox);
dialog.addEventListener('keydown', event => {
  if (event.key !== 'Tab') return;
  const focusable = [...dialog.querySelectorAll('button, a[href], input, [tabindex="0"]')];
  const first = focusable[0], last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
dialog.addEventListener('close', () => {
  document.body.classList.remove('modal-open');
  lightboxTrigger?.focus({ preventScroll: true });
  videos.forEach(syncVideo);
  requestFrame();
});

function syncVideoPreference() {
  if (reducedMotion.matches) videos.forEach(video => { videoStates.get(video).userStarted = false; });
  videos.forEach(syncVideo);
}
reducedMotion.addEventListener('change', syncVideoPreference);
finePointer.addEventListener('change', syncVideoPreference);
document.addEventListener('visibilitychange', () => videos.forEach(syncVideo));

const form = document.querySelector('#project-form');
const formStatus = form.querySelector('.form-status');
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  form.setAttribute('aria-busy', 'true');
  formStatus.dataset.error = 'false';
  formStatus.textContent = t('Sending your inquiry…');
  try {
    const response = await fetch('/api/contact', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: data.get('name'), email: data.get('email'), company: data.get('company'), services: data.getAll('services'), message: data.get('message'), website: data.get('website') }),
      signal: AbortSignal.timeout(15_000),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(t(result.message) || t('Your message could not be sent. Please try again.'));
    formStatus.textContent = t(result.message);
    form.querySelectorAll('input[name="services"]').forEach(input => {
      input.defaultChecked = false;
    });
    form.reset();
  } catch (error) {
    formStatus.dataset.error = 'true';
    formStatus.textContent = error.name === 'TypeError' || error.name === 'TimeoutError' ? t('The connection failed. Your details are still here — please try again.') : error.message;
  } finally {
    submit.disabled = false;
    form.removeAttribute('aria-busy');
    formStatus.focus({ preventScroll: true });
  }
});
document.querySelector('#year').textContent = new Date().getFullYear();

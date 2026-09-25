import './gallery.js';
import './dialog-dismiss.js';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(pointer: fine)');
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const heroStage = document.querySelector('.hero-stage');
const letters = [...document.querySelectorAll('#hero-title span')];
const heroDetails = [...document.querySelectorAll('.hero-fade')];
const dissolving = [...document.querySelectorAll('[data-dissolve]')];
const progressBar = document.querySelector('.reading-progress');
const glow = document.querySelector('#fluid-glow');
const head = glow.querySelector('.glow-head');
const tail = glow.querySelector('.glow-tail');
const dialog = document.querySelector('.lightbox');
let pointerX = innerWidth * .72, pointerY = innerHeight * .28;
let headX = pointerX, headY = pointerY, tailX = headX, tailY = headY;
let lastPointer = 0, lastFrame = 0, frame = 0, scrollDirty = true;

function drawScroll() {
  const height = innerHeight;
  const range = document.documentElement.scrollHeight - height;
  progressBar.style.transform = `scaleX(${range > 0 ? clamp(scrollY / range) : 0})`;
  if (reducedMotion.matches) return;
  const rect = heroStage.getBoundingClientRect();
  const progress = clamp(-rect.top / Math.max(1, rect.height - height));
  letters.forEach((letter, index) => {
    const amount = smooth((progress - .12 - index * .024) / .65);
    letter.style.opacity = 1 - amount;
    letter.style.filter = `blur(${amount * 20}px)`;
    letter.style.transform = `translate3d(0,${amount * (-35 - index * 3)}px,0)`;
  });
  heroDetails.forEach(element => {
    const amount = smooth((progress - .05) / .62);
    element.style.opacity = 1 - amount;
    element.style.filter = `blur(${amount * 5}px)`;
  });
  dissolving.forEach(element => {
    const bounds = element.getBoundingClientRect();
    const enter = smooth((height * .96 - bounds.top) / (height * .26));
    const leave = smooth((-bounds.top - bounds.height * .14) / Math.max(80, bounds.height * .7));
    const visibility = Math.min(enter, 1 - leave);
    element.style.opacity = visibility;
    element.style.filter = `blur(${(1 - visibility) * 9}px)`;
    element.style.transform = `translate3d(0,${(1 - enter) * 18 - leave * 12}px,0)`;
  });
}

function render(time) {
  frame = 0;
  if (document.hidden) return;
  if (scrollDirty) { drawScroll(); scrollDirty = false; }
  if (!finePointer.matches || reducedMotion.matches || dialog.open) return;
  const elapsed = lastFrame ? clamp((time - lastFrame) / 16.667, .25, 3) : 1;
  lastFrame = time;
  const previousX = headX, previousY = headY;
  headX += (pointerX - headX) * (1 - Math.pow(1 - .105, elapsed));
  headY += (pointerY - headY) * (1 - Math.pow(1 - .105, elapsed));
  tailX += (headX - tailX) * (1 - Math.pow(1 - .047, elapsed));
  tailY += (headY - tailY) * (1 - Math.pow(1 - .047, elapsed));
  const speed = Math.min(46, Math.hypot(headX - previousX, headY - previousY) / elapsed);
  const distance = Math.hypot(headX - tailX, headY - tailY);
  const angle = Math.atan2(headY - previousY, headX - previousX);
  const tailAngle = Math.atan2(headY - tailY, headX - tailX);
  const moving = time - lastPointer < 900;
  head.style.opacity = moving ? .42 : .36;
  tail.style.opacity = moving ? .22 : .16;
  head.style.transform = `translate3d(${headX}px,${headY}px,0) rotate(${angle}rad) scale(${1 + Math.min(.34, speed * .013)},${1 - Math.min(.13, speed * .0048)})`;
  tail.style.transform = `translate3d(${tailX}px,${tailY}px,0) rotate(${tailAngle}rad) scale(${1.06 + Math.min(.72, distance / 340)},${.94 - Math.min(.18, distance / 1500)})`;
  if (moving || Math.hypot(pointerX - headX, pointerY - headY) > .1 || distance > .1) requestFrame();
}
function requestFrame() { if (!frame && !document.hidden) frame = requestAnimationFrame(render); }
addEventListener('scroll', () => { scrollDirty = true; requestFrame(); }, { passive: true });
addEventListener('resize', () => { scrollDirty = true; requestFrame(); }, { passive: true });
addEventListener('pointermove', event => {
  if (!finePointer.matches || reducedMotion.matches || event.pointerType === 'touch') return;
  pointerX = event.clientX; pointerY = event.clientY; lastPointer = performance.now(); requestFrame();
}, { passive: true });

const revealObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('revealed'); revealObserver.unobserve(entry.target); }
  });
}, { threshold: .1 });
document.querySelectorAll('[data-reveal]').forEach(element => revealObserver.observe(element));
document.documentElement.classList.add('motion-ready');
requestFrame();

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
  play.setAttribute('aria-label', video.paused ? 'Play video' : 'Pause video');
  play.firstElementChild.textContent = video.paused ? '▶' : 'Ⅱ';
  const sound = controls.querySelector('.video-sound');
  sound.setAttribute('aria-label', video.muted ? 'Unmute video' : 'Mute video');
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

function motionPreferenceChanged() {
  scrollDirty = true;
  if (reducedMotion.matches) {
    [...letters, ...heroDetails, ...dissolving].forEach(element => { element.style.opacity = ''; element.style.filter = ''; element.style.transform = ''; });
    videos.forEach(video => { videoStates.get(video).userStarted = false; });
  }
  videos.forEach(syncVideo);
  requestFrame();
}
reducedMotion.addEventListener('change', motionPreferenceChanged);
finePointer.addEventListener('change', motionPreferenceChanged);
document.addEventListener('visibilitychange', () => { videos.forEach(syncVideo); lastFrame = 0; scrollDirty = true; requestFrame(); });

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
  formStatus.textContent = 'Sending your inquiry…';
  try {
    const response = await fetch('/api/contact', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: data.get('name'), email: data.get('email'), company: data.get('company'), services: data.getAll('services'), message: data.get('message'), website: data.get('website'), consent: data.get('consent') === 'on' }),
      signal: AbortSignal.timeout(15_000),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.message || 'Your message could not be sent. Please try again.');
    formStatus.textContent = result.message;
    form.reset();
  } catch (error) {
    formStatus.dataset.error = 'true';
    formStatus.textContent = error.name === 'TypeError' || error.name === 'TimeoutError' ? 'We couldn’t reach the studio. Your details are still here — please try again.' : error.message;
  } finally {
    submit.disabled = false;
    form.removeAttribute('aria-busy');
    formStatus.focus({ preventScroll: true });
  }
});
document.querySelector('#year').textContent = new Date().getFullYear();

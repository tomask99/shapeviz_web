import {t} from './i18n/runtime.js';
import {svgIcon} from './ui/icons.js';
import './gallery.js';
import './dialog-dismiss.js';
import {mountClientPreviews} from './site/client-previews.js';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(pointer: fine)');
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const heroStage = document.querySelector('.hero-stage');
const heroBackdrop = document.querySelector('.hero-backdrop');
const heroWireframe = document.querySelector('.hero-wireframe');
const studioIntro = document.querySelector('.about .section-label');
const letters = [...document.querySelectorAll('#hero-title span')];
const letterMotion = letters.map(element => ({ element, x: 0, followX: 0, scrollY: 0, bounds: null }));
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
let pointerPresent = false;
const syncClientPreviews = mountClientPreviews(requestFrame);
heroWireframe?.addEventListener('load', () => heroWireframe.classList.add('is-loaded'));
function hideWireframe() {
  const wasPresent = pointerPresent;
  pointerPresent = false;
  heroWireframe?.classList.remove('is-active');
  if (wasPresent) requestFrame();
}

function measureLetters() {
  // Measure resting positions so displaced letters never chase their own hit area.
  letterMotion.forEach(state => {
    const rect = state.element.getBoundingClientRect();
    state.bounds = { x: rect.left + rect.width / 2 - state.x, y: rect.top + rect.height / 2 - state.scrollY, left: rect.left - state.x, right: rect.right - state.x, height: rect.height };
  });
}

function drawLetterRepulsion(elapsed, enabled) {
  const response = elapsed * 16 / 60;
  const decay = Math.exp(-response);
  const targets = letterMotion.map(state => {
    if (enabled && pointerPresent && state.bounds) {
      const { x, y, height } = state.bounds;
      const radius = clamp(height * 1.15, 110, 300);
      const dx = x - pointerX, dy = y + state.scrollY - pointerY;
      const distance = Math.hypot(dx, dy);
      const force = smooth(1 - distance / radius) * Math.min(58, height * .25);
      // A soft center avoids a sudden direction flip while crossing a letter.
      const falloff = Math.hypot(radius * .24, distance);
      return dx / falloff * force;
    }
    return 0;
  });
  // Pass each push outward through its neighbours. Ordered displacements keep
  // every resting gap intact, including while easing back or changing direction.
  for (let i = targets.length - 2; i >= 0; i--) {
    if (targets[i + 1] < 0) targets[i] = Math.min(targets[i], targets[i + 1]);
  }
  for (let i = 1; i < targets.length; i++) {
    if (targets[i - 1] > 0) targets[i] = Math.max(targets[i], targets[i - 1]);
  }
  // Reduce the whole push near viewport edges without compressing any gaps.
  const leftRoom = Math.max(0, (letterMotion[0]?.bounds?.left ?? 16) - 16);
  const rightRoom = Math.max(0, innerWidth - (letterMotion.at(-1)?.bounds?.right ?? innerWidth - 16) - 16);
  const scale = Math.min(1, targets[0] < 0 ? leftRoom / -targets[0] : 1, targets.at(-1) > 0 ? rightRoom / targets.at(-1) : 1);
  const settling = enabled && letterMotion.some((state, i) => Math.max(Math.abs(targets[i] * scale - state.x), Math.abs(targets[i] * scale - state.followX)) >= .005);
  letterMotion.forEach((state, i) => {
    const targetX = targets[i] * scale;
    // Exact critically damped response: velocity stays continuous when the
    // pointer changes direction. Positive weights preserve the ordered gaps.
    const previousFollow = state.followX;
    state.followX = settling ? targetX + (previousFollow - targetX) * decay : targetX;
    state.x = settling ? targetX + (state.x - targetX + response * (previousFollow - targetX)) * decay : targetX;
    // Individual translate composes with the existing scroll-exit transform.
    const translate = `${state.x.toFixed(3)}px 0px`;
    if (state.translate !== translate) {
      state.element.style.translate = translate;
      state.translate = translate;
    }
  });
  return settling;
}

function drawScroll() {
  const height = innerHeight;
  const range = document.documentElement.scrollHeight - height;
  progressBar.style.transform = `scaleX(${range > 0 ? clamp(scrollY / range) : 0})`;
  if (reducedMotion.matches) return;
  measureLetters();
  const rect = heroStage.getBoundingClientRect();
  // The extra 20svh in the stage holds the image after the original text exit.
  const imageHoldDistance = height * .2;
  const progress = clamp(-rect.top / Math.max(1, rect.height - height - imageHoldDistance));
  if (heroBackdrop) {
    const imageFade = smooth((height - studioIntro.getBoundingClientRect().top) / (height * .35));
    heroBackdrop.style.setProperty('--hero-image-opacity', 1 - imageFade);
    heroBackdrop.style.setProperty('--hero-image-blur', `${imageFade * 22}px`);
  }
  letters.forEach((letter, index) => {
    const amount = smooth((progress - .12 - index * .024) / .65);
    letter.style.opacity = 1 - amount;
    letter.style.filter = `blur(${amount * 20}px)`;
    letterMotion[index].scrollY = amount * (-35 - index * 3);
    letter.style.transform = `translate3d(0,${letterMotion[index].scrollY}px,0)`;
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
  syncClientPreviews();
  const elapsed = lastFrame ? clamp((time - lastFrame) / 16.667, .25, 3) : 1;
  lastFrame = time;
  const motionEnabled = finePointer.matches && !reducedMotion.matches && !dialog.open;
  const lettersSettling = drawLetterRepulsion(elapsed, motionEnabled);
  if (!motionEnabled) { hideWireframe(); lastFrame = 0; return; }
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
  if (heroWireframe && pointerPresent) {
    // Share the glow's smoothed head and trailing motion; both renders keep the same crop.
    heroWireframe.style.setProperty('--wire-head-x', `${headX}px`);
    heroWireframe.style.setProperty('--wire-head-y', `${headY}px`);
    heroWireframe.style.setProperty('--wire-tail-x', `${tailX}px`);
    heroWireframe.style.setProperty('--wire-tail-y', `${tailY}px`);
    heroWireframe.classList.add('is-active');
  }
  if (lettersSettling || moving || Math.hypot(pointerX - headX, pointerY - headY) > .1 || distance > .1) requestFrame();
  else lastFrame = 0;
}
function requestFrame() { if (!frame && !document.hidden) frame = requestAnimationFrame(render); }
addEventListener('scroll', () => { scrollDirty = true; requestFrame(); }, { passive: true });
addEventListener('resize', () => { scrollDirty = true; requestFrame(); }, { passive: true });
addEventListener('pointermove', event => {
  if (!finePointer.matches || reducedMotion.matches || event.pointerType === 'touch') { hideWireframe(); return; }
  if (!pointerPresent) { headX = tailX = event.clientX; headY = tailY = event.clientY; }
  pointerPresent = true;
  if (heroWireframe && !heroWireframe.hasAttribute('src')) {
    heroWireframe.srcset = heroWireframe.dataset.srcset;
    heroWireframe.src = heroWireframe.dataset.src;
  }
  pointerX = event.clientX; pointerY = event.clientY; lastPointer = performance.now(); requestFrame();
}, { passive: true });
document.documentElement.addEventListener('pointerleave', hideWireframe);
addEventListener('blur', hideWireframe);
document.fonts.ready.then(() => { scrollDirty = true; requestFrame(); });

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

function motionPreferenceChanged() {
  hideWireframe();
  scrollDirty = true;
  if (reducedMotion.matches) {
    letterMotion.forEach(state => { state.scrollY = 0; });
    [...letters, ...heroDetails, ...dissolving].forEach(element => { element.style.opacity = ''; element.style.filter = ''; element.style.transform = ''; });
    videos.forEach(video => { videoStates.get(video).userStarted = false; });
  }
  videos.forEach(syncVideo);
  requestFrame();
}
reducedMotion.addEventListener('change', motionPreferenceChanged);
finePointer.addEventListener('change', motionPreferenceChanged);
document.addEventListener('visibilitychange', () => { if (document.hidden) hideWireframe(); videos.forEach(syncVideo); lastFrame = 0; scrollDirty = true; requestFrame(); });

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

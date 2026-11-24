import {mountClientPreviews} from './client-previews.js';
export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
export const finePointer = matchMedia('(pointer: fine)');
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const heroStage = document.querySelector('.hero-stage');
const heroBackdrop = document.querySelector('.hero-backdrop');
const heroWireframe = document.querySelector('.hero-wireframe');
const nextSection = document.querySelector('.about .section-label') ?? heroStage.nextElementSibling;
const letters = [...document.querySelectorAll('#hero-title span')];
const letterMotion = letters.map(element => ({ element, x: 0, followX: 0, scrollY: 0, bounds: null }));
const heroDetails = [...document.querySelectorAll('.hero-fade')];
const dissolving = [...document.querySelectorAll('[data-dissolve]')];
const progressBar = document.querySelector('.reading-progress');
const glow = document.querySelector('#fluid-glow');
const head = glow.querySelector('.glow-head');
const tail = glow.querySelector('.glow-tail');
const dialog = document.querySelector('.lightbox, .portfolio-viewer');
let pointerX = innerWidth * .72, pointerY = innerHeight * .28;
let headX = pointerX, headY = pointerY, tailX = headX, tailY = headY;
let lastPointer = 0, lastFrame = 0, frame = 0, scrollDirty = true;
let pointerPresent = false;
const syncClientPreviews = document.querySelector('.client-list') ? mountClientPreviews(requestFrame) : null;
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
  if (heroBackdrop && nextSection) {
    const imageFade = smooth((height - nextSection.getBoundingClientRect().top) / (height * .35));
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
  syncClientPreviews?.();
  const elapsed = lastFrame ? clamp((time - lastFrame) / 16.667, .25, 3) : 1;
  lastFrame = time;
  const motionEnabled = finePointer.matches && !reducedMotion.matches && !dialog?.open;
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
export function requestFrame() { if (!frame && !document.hidden) frame = requestAnimationFrame(render); }
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

function motionPreferenceChanged() {
  hideWireframe();
  scrollDirty = true;
  if (reducedMotion.matches) {
    letterMotion.forEach(state => { state.scrollY = 0; });
    [...letters, ...heroDetails, ...dissolving].forEach(element => { element.style.opacity = ''; element.style.filter = ''; element.style.transform = ''; });
  }
  requestFrame();
}
reducedMotion.addEventListener('change', motionPreferenceChanged);
finePointer.addEventListener('change', motionPreferenceChanged);
document.addEventListener('visibilitychange', () => { if (document.hidden) hideWireframe(); lastFrame = 0; scrollDirty = true; requestFrame(); });

document.documentElement.classList.add('motion-ready');
requestFrame();

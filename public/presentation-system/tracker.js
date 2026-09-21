(() => {
  const script = document.currentScript;
  if (!script || script.dataset.analytics !== 'true' || !globalThis.crypto?.getRandomValues) return;
  const deck = script.dataset.deck;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(deck || '')) return;
  const uuid = () => {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
  const sessionId = uuid();
  const endpoint = new URL('/api/presentation-events', script.src).href;
  const slides = [...document.querySelectorAll('[data-slide], .slide')];
  const videos = [...document.querySelectorAll('video')];
  const completedVideos = new Set();
  let maxSlide = 0;
  let lastSlide = 0;
  let lastActivity = performance.now();
  let activeSince = performance.now();
  let pendingSeconds = 0;
  let wasVisible = document.visibilityState === 'visible';

  const send = (eventType, detail = {}, beacon = false) => {
    const body = JSON.stringify({ deck, sessionId, eventId: uuid(), eventType, ...detail });
    // A safelisted content type avoids an unload-time CORS preflight from
    // the presentation's opaque sandbox origin. The server still validates JSON.
    if (beacon && navigator.sendBeacon) {
      try { if (navigator.sendBeacon(endpoint, new Blob([body], { type: 'text/plain;charset=UTF-8' }))) return; }
      catch { /* Fall back if the browser refuses to queue the beacon. */ }
    }
    fetch(endpoint, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body, keepalive: true }).catch(() => {});
  };
  const slideIndex = () => {
    const explicit = slides.findIndex(slide => slide.classList.contains('active'));
    if (explicit >= 0) return explicit + 1;
    const center = innerHeight / 2;
    let best = 0, distance = Infinity;
    slides.forEach((slide, index) => {
      const rect = slide.getBoundingClientRect();
      const current = Math.abs(rect.top + rect.height / 2 - center);
      if (current < distance) { distance = current; best = index + 1; }
    });
    return best || 1;
  };
  const accumulate = () => {
    const now = performance.now();
    const playing = videos.some(video => !video.paused && !video.ended);
    if (wasVisible) pendingSeconds += Math.max(0, Math.min(now, playing ? now : lastActivity + 60_000) - activeSince) / 1000;
    activeSince = now;
  };
  const flush = (beacon = false) => {
    accumulate();
    const seconds = Math.min(300, Math.floor(pendingSeconds));
    pendingSeconds -= seconds;
    if (seconds && lastSlide) send('session_heartbeat', { activeSeconds: seconds, slideIndex: lastSlide }, beacon);
  };
  const recordSlide = () => {
    const index = slideIndex();
    if (!index || index === lastSlide) return;
    flush();
    lastSlide = index;
    maxSlide = Math.max(maxSlide, index);
    send('slide_viewed', { slideIndex: index });
    send('slide_reached_max', { slideIndex: maxSlide });
  };
  const activity = () => { accumulate(); lastActivity = performance.now(); };
  ['pointerdown', 'pointermove', 'keydown', 'scroll'].forEach(type => addEventListener(type, activity, { passive: true }));
  send('session_started', { slideCount: slides.length || null });
  recordSlide();
  new MutationObserver(recordSlide).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
  addEventListener('scroll', recordSlide, { passive: true });
  document.addEventListener('shapeviz:slidechange', recordSlide);
  videos.forEach((video, index) => {
    const videoId = video.dataset.videoId || video.id || `video-${index + 1}`;
    let started = false;
    video.addEventListener('play', () => { if (!started) { started = true; send('video_started', { videoId }); } });
    video.addEventListener('timeupdate', () => {
      if (!completedVideos.has(videoId) && video.duration && video.currentTime / video.duration >= .9) {
        completedVideos.add(videoId); send('video_completed', { videoId, videoProgress: video.currentTime / video.duration });
      }
    });
  });
  setInterval(() => flush(), 15_000);
  document.addEventListener('visibilitychange', () => { flush(true); wasVisible = !document.hidden; activeSince = performance.now(); if (!document.hidden) activity(); });
  addEventListener('pagehide', () => { flush(true); wasVisible = false; send('session_ended', { slideIndex: maxSlide }, true); });
  addEventListener('pageshow', () => { wasVisible = !document.hidden; activeSince = performance.now(); });
})();

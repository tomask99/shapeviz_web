(() => {
  const script = document.currentScript;
  if (!script || script.dataset.analytics !== 'true' || !globalThis.crypto?.randomUUID) return;
  const deck = script.dataset.deck;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(deck || '')) return;
  const sessionId = crypto.randomUUID();
  const endpoint = '/api/presentation-events';
  const slides = [...document.querySelectorAll('[data-slide], .slide')];
  const videos = [...document.querySelectorAll('video')];
  const sentSlides = new Set();
  const completedVideos = new Set();
  let maxSlide = 0;
  let lastSlide = 0;
  let lastActivity = performance.now();
  let activeSince = performance.now();

  const send = (eventType, detail = {}, beacon = false) => {
    const body = JSON.stringify({ deck, sessionId, eventId: crypto.randomUUID(), eventType, ...detail });
    if (beacon && navigator.sendBeacon) return navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
    fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
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
  const recordSlide = () => {
    const index = slideIndex();
    if (!index || index === lastSlide) return;
    lastSlide = index;
    maxSlide = Math.max(maxSlide, index);
    if (!sentSlides.has(index)) { sentSlides.add(index); send('slide_viewed', { slideIndex: index }); }
    send('slide_reached_max', { slideIndex: maxSlide });
  };
  const activity = () => { lastActivity = performance.now(); };
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
  setInterval(() => {
    const now = performance.now();
    const engaged = document.visibilityState === 'visible' && now - lastActivity < 60_000;
    const activeSeconds = engaged ? Math.max(0, Math.round((now - activeSince) / 1000)) : 0;
    activeSince = now;
    if (activeSeconds) send('session_heartbeat', { activeSeconds, slideIndex: maxSlide });
  }, 15_000);
  document.addEventListener('visibilitychange', () => { activeSince = performance.now(); if (!document.hidden) activity(); });
  addEventListener('pagehide', () => send('session_ended', { slideIndex: maxSlide }, true));
})();

const dialog = document.querySelector('.service-lightbox');

if (dialog && typeof dialog.showModal === 'function') {
  const image = dialog.querySelector('img');
  const caption = dialog.querySelector('p');
  const close = dialog.querySelector('.service-lightbox-close');
  const navigation = dialog.querySelector('[data-gallery-nav]');
  const previous = dialog.querySelector('[data-gallery-prev]');
  const next = dialog.querySelector('[data-gallery-next]');
  const title = dialog.querySelector('[data-gallery-title]');
  const count = dialog.querySelector('[data-gallery-count]');
  const destination = dialog.querySelector('[data-gallery-link]');
  let trigger;
  let startedOutside = false;
  let slides = [];
  let position = 0;

  function showSlide() {
    const slide = slides[position];
    const thumbnail = slide.querySelector('img');
    image.alt = thumbnail.alt;
    image.width = Number(thumbnail.getAttribute('width'));
    image.height = Number(thumbnail.getAttribute('height'));
    image.src = slide.dataset.portfolioSlide || slide.href;
    caption.textContent = slide.closest('figure')?.querySelector('figcaption')?.textContent || '';
    caption.hidden = !caption.textContent;
    if (caption.hidden) dialog.removeAttribute('aria-describedby');
    else if (caption.id) dialog.setAttribute('aria-describedby', caption.id);
    if (count) {
      count.hidden = slides.length < 2;
      count.textContent = `${position + 1} / ${slides.length}`;
    }
    if (destination) {
      const linked = slide.hasAttribute('data-portfolio-link');
      if (!linked && document.activeElement === destination) close.focus({preventScroll:true});
      destination.hidden = !linked;
      if (linked) {
        destination.href = slide.href;
        destination.target = slide.target;
        destination.rel = slide.rel;
      } else destination.removeAttribute('href');
    }
  }

  function advance(step) {
    if (slides.length < 2) return;
    position = (position + step + slides.length) % slides.length;
    showSlide();
  }

  document.querySelectorAll('[data-service-image], [data-portfolio-open-gallery]').forEach(link => {
    link.setAttribute('aria-haspopup', 'dialog');
    link.addEventListener('click', event => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      trigger = link;
      const group = link.closest('[data-portfolio-gallery]');
      slides = group ? [...group.querySelectorAll('[data-portfolio-slide]')] : [link];
      position = Math.max(0, slides.indexOf(link));
      if (title) title.textContent = group?.dataset.portfolioGallery || '';
      if (navigation) navigation.hidden = slides.length < 2;
      showSlide();
      dialog.showModal();
      document.body.classList.add('modal-open');
      close.focus({preventScroll: true});
    });
  });

  close.addEventListener('click', () => dialog.close());
  previous?.addEventListener('click', () => advance(-1));
  next?.addEventListener('click', () => advance(1));
  destination?.addEventListener('click', () => {
    if (destination.target !== '_blank') dialog.close();
  });
  // A backdrop click closes the preview; dragging from the image does not.
  const outside = event => {
    const bounds = dialog.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
  };
  dialog.addEventListener('pointerdown', event => { startedOutside = outside(event); });
  dialog.addEventListener('click', event => {
    if (event.target === dialog && startedOutside && outside(event)) dialog.close();
    startedOutside = false;
  });
  dialog.addEventListener('keydown', event => {
    if (slides.length > 1 && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      advance(event.key === 'ArrowRight' ? 1 : -1);
    } else if (event.key === 'Tab') {
      event.preventDefault();
      const controls = [close, previous, next, destination].filter(control => control && !control.closest('[hidden]'));
      const index = controls.indexOf(document.activeElement);
      const step = event.shiftKey ? -1 : 1;
      const target = index < 0 ? (event.shiftKey ? controls.at(-1) : controls[0]) : controls[(index + step + controls.length) % controls.length];
      target.focus();
    }
  });
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    document.body.classList.remove('modal-open');
    trigger?.focus({preventScroll: true});
    image.removeAttribute('src');
    slides = [];
  });
}

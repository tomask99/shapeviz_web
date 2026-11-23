const dialog = document.querySelector('.service-lightbox');

if (dialog && typeof dialog.showModal === 'function') {
  const image = dialog.querySelector('img');
  const caption = dialog.querySelector('p');
  const close = dialog.querySelector('button');
  let trigger;
  let startedOutside = false;

  document.querySelectorAll('[data-service-image]').forEach(link => {
    link.setAttribute('aria-haspopup', 'dialog');
    link.addEventListener('click', event => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      trigger = link;
      const thumbnail = link.querySelector('img');
      image.alt = thumbnail.alt;
      image.width = Number(thumbnail.getAttribute('width'));
      image.height = Number(thumbnail.getAttribute('height'));
      image.src = link.href;
      caption.textContent = link.closest('figure')?.querySelector('figcaption')?.textContent || '';
      caption.hidden = !caption.textContent;
      if (caption.hidden) dialog.removeAttribute('aria-describedby');
      else if (caption.id) dialog.setAttribute('aria-describedby', caption.id);
      dialog.showModal();
      document.body.classList.add('modal-open');
      close.focus({preventScroll: true});
    });
  });

  close.addEventListener('click', () => dialog.close());
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
    if (event.key === 'Tab') {
      event.preventDefault();
      close.focus();
    }
  });
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    document.body.classList.remove('modal-open');
    trigger?.focus({preventScroll: true});
    image.removeAttribute('src');
  });
}

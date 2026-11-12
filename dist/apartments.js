(() => {
  'use strict';
  const data = document.querySelector('#rooms-data');
  if (!data) return;
  const rooms = JSON.parse(data.textContent);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const section = document.querySelector('#apartments');
  const states = [];
  const pad = (value) => String(value).padStart(2, '0');
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const fullMask = 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)';
  const autoplayDelay = 4500;
  const lightbox = document.querySelector('#photo-lightbox');
  const lightboxImage = lightbox.querySelector('img');
  const lightboxStage = lightbox.querySelector('.photo-lightbox-stage');
  let lightboxState = null;
  let lightboxIndex = 0;
  let requestedLightboxIndex = 0;
  let lightboxRequest = 0;

  function clearAutoplay(state) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  function syncAutoplay(state) {
    const canPlay =
      state.inView &&
      !state.manualStopped &&
      !state.autoFailed &&
      !document.hidden &&
      !reducedMotion.matches &&
      !document.querySelector('dialog[open]');
    state.row.dataset.autoplay = state.manualStopped ? 'manual' : canPlay ? 'playing' : 'paused';
    state.row
      .querySelector('.room-count')
      .setAttribute('aria-live', state.manualStopped ? 'polite' : 'off');
    if (!canPlay) {
      clearAutoplay(state);
      return;
    }
    if (state.timer || state.busy) return;
    state.timer = setTimeout(() => {
      state.timer = null;
      if (
        state.inView &&
        !state.manualStopped &&
        !document.hidden &&
        !reducedMotion.matches &&
        !document.querySelector('dialog[open]')
      )
        changePhoto(state, 1);
      else syncAutoplay(state);
    }, autoplayDelay);
  }
  function syncAllAutoplay() {
    states.forEach(syncAutoplay);
  }
  function stopAutoplay(state) {
    state.manualStopped = true;
    syncAutoplay(state);
  }
  function manualStep(state, direction) {
    stopAutoplay(state);
    if (state.busy) {
      state.pendingStep = direction;
      state.animations.forEach((animation) => animation.finish());
    } else changePhoto(state, direction);
  }

  // A swipe must never also be interpreted as a tap opening the viewer.
  function wireSwipe(element, onSwipe) {
    let start = null;
    let suppressClick = false;
    element.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary || event.button !== 0) return;
      start = { x: event.clientX, y: event.clientY };
      suppressClick = false;
    });
    element.addEventListener('pointermove', (event) => {
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8)
        suppressClick = true;
    });
    element.addEventListener('pointerup', (event) => {
      if (!start) return;
      const dx = event.clientX - start.x,
        dy = event.clientY - start.y;
      start = null;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        suppressClick = true;
        onSwipe(dx < 0 ? 1 : -1);
      }
    });
    element.addEventListener('pointercancel', () => {
      start = null;
      suppressClick = true;
    });
    element.addEventListener('pointerleave', () => {
      if (start) suppressClick = true;
      start = null;
    });
    return () => {
      const suppressed = suppressClick;
      suppressClick = false;
      return suppressed;
    };
  }

  function updateLightboxCounter() {
    lightbox.querySelector('.photo-lightbox-count').textContent =
      `${pad(lightboxIndex + 1)} / ${pad(lightboxState.room.photos.length)}`;
  }
  function fitLightboxImage() {
    if (!lightboxState || !lightbox.open) return;
    const [left, top, width, height] = lightboxState.room.photos[lightboxIndex].crop;
    const scale = Math.min(lightboxStage.clientWidth / width, lightboxStage.clientHeight / height);
    const crop = lightbox.querySelector('.photo-lightbox-crop');
    crop.style.width = `${width * scale}px`;
    crop.style.height = `${height * scale}px`;
    lightboxImage.style.width = `${1000 * scale}px`;
    lightboxImage.style.height = `${662 * scale}px`;
    lightboxImage.style.left = `${-left * scale}px`;
    lightboxImage.style.top = `${-top * scale}px`;
  }
  new ResizeObserver(fitLightboxImage).observe(lightboxStage);
  function openLightbox(state) {
    stopAutoplay(state);
    if (state.busy) {
      state.pendingOpen = true;
      state.pendingStep = null;
      state.animations.forEach((animation) => animation.finish());
      return;
    }
    lightboxState = state;
    lightboxIndex = requestedLightboxIndex = state.index;
    const photo = state.room.photos[state.index];
    lightboxImage.src = photo.src;
    lightboxImage.alt = photo.alt;
    lightbox.querySelector('#photo-lightbox-title').textContent = state.room.name;
    lightbox.querySelector('.photo-lightbox-error').textContent = '';
    lightboxStage.setAttribute('aria-busy', 'false');
    updateLightboxCounter();
    lightbox.showModal();
    fitLightboxImage();
    document.documentElement.classList.add('has-photo-dialog');
    syncAllAutoplay();
  }
  async function stepLightbox(direction) {
    if (!lightbox.open || !lightboxState) return;
    const room = lightboxState.room;
    const index = (requestedLightboxIndex + direction + room.photos.length) % room.photos.length;
    requestedLightboxIndex = index;
    const request = ++lightboxRequest;
    const photo = room.photos[index];
    const image = new Image();
    image.src = photo.src;
    lightboxStage.setAttribute('aria-busy', 'true');
    lightbox.querySelector('.photo-lightbox-error').textContent = '';
    try {
      await image.decode();
      if (request !== lightboxRequest || !lightbox.open) return;
      lightboxImage.src = photo.src;
      lightboxImage.alt = photo.alt;
      lightboxIndex = index;
      fitLightboxImage();
      updateLightboxCounter();
    } catch {
      if (request === lightboxRequest && lightbox.open) {
        requestedLightboxIndex = lightboxIndex;
        lightbox.querySelector('.photo-lightbox-error').textContent =
          'This photo could not load. Please try again.';
      }
    } finally {
      if (request === lightboxRequest) lightboxStage.setAttribute('aria-busy', 'false');
    }
  }
  lightbox.querySelector('.photo-lightbox-close').addEventListener('click', () => lightbox.close());
  lightbox
    .querySelectorAll('[data-lightbox-step]')
    .forEach((button) =>
      button.addEventListener('click', () => stepLightbox(Number(button.dataset.lightboxStep))),
    );
  lightbox.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      stepLightbox(event.key === 'ArrowRight' ? 1 : -1);
    }
  });
  wireSwipe(lightboxStage, stepLightbox);
  lightbox.addEventListener('close', () => {
    lightboxRequest++;
    document.documentElement.classList.remove('has-photo-dialog');
    if (lightboxState) {
      const state = lightboxState;
      if (state.index !== lightboxIndex) {
        const photo = state.room.photos[lightboxIndex];
        const slide = createSlide(photo);
        slide.removeAttribute('aria-hidden');
        state.slide.replaceWith(slide);
        state.slide = slide;
        state.index = lightboxIndex;
        fitImage(state, slide, photo);
        state.row.querySelector('.room-current').textContent = pad(lightboxIndex + 1);
      }
      state.frame.focus({ preventScroll: true });
    }
    lightboxState = null;
    syncAllAutoplay();
    requestParallax();
  });

  // Fit the real photograph, excluding any white margins baked into its source.
  // This only changes its on-page crop; the original image files stay intact.
  function fitImage(state, slide, photo) {
    const [left, top, width, height] = photo.crop;
    const frameWidth = state.frame.clientWidth;
    const frameHeight = state.frame.clientHeight * 1.2;
    const scale = Math.max(frameWidth / width, frameHeight / height);
    const image = slide.querySelector('img');
    image.style.width = `${1000 * scale}px`;
    image.style.height = `${662 * scale}px`;
    image.style.left = `${(frameWidth - width * scale) * (photo.focus ?? 0.5) - left * scale}px`;
    image.style.top = `${(frameHeight - height * scale) / 2 - top * scale}px`;
  }

  function setBusy(state, busy) {
    state.busy = busy;
    state.buttons.forEach((button) => {
      button.dataset.transitioning = String(busy);
    });
    state.frame.setAttribute('aria-busy', String(busy));
  }

  function preloadNext(state) {
    const source = state.room.photos[(state.index + 1) % state.room.photos.length].src;
    if (state.preloaded === source) return;
    state.preloaded = source;
    const next = new Image();
    next.src = source;
    next.decode().catch(() => {});
  }

  function createSlide(photo) {
    const slide = document.createElement('div');
    slide.className = 'room-slide';
    slide.setAttribute('aria-hidden', 'true');
    const zoom = document.createElement('div');
    zoom.className = 'room-zoom';
    const pan = document.createElement('div');
    pan.className = 'room-pan';
    const img = new Image(1000, 662);
    img.className = 'room-image';
    img.alt = photo.alt;
    img.decoding = 'async';
    img.draggable = false;
    img.src = photo.src;
    pan.append(img);
    zoom.append(pan);
    slide.append(zoom);
    return slide;
  }

  async function changePhoto(state, direction) {
    if (state.busy) return;
    clearAutoplay(state);
    setBusy(state, true);
    state.error.textContent = '';
    const index = (state.index + direction + state.room.photos.length) % state.room.photos.length;
    const photo = state.room.photos[index];
    const incoming = createSlide(photo);
    state.incoming = { slide: incoming, photo };
    try {
      // Keep the current photograph visible until the next one is decoded.
      await incoming.querySelector('img').decode();
      const outgoing = state.slide;
      incoming.style.zIndex = '1';
      const fromMask =
        direction > 0
          ? 'polygon(100% 0%, 100% 0%, 125% 100%, 125% 100%)'
          : 'polygon(0% 0%, 0% 0%, -25% 100%, -25% 100%)';
      incoming.style.clipPath = reducedMotion.matches ? fullMask : fromMask;
      state.frame.insertBefore(incoming, state.frame.querySelector('figcaption'));
      fitImage(state, incoming, photo);
      if (!reducedMotion.matches) {
        const timing = { duration: 1200, easing: 'cubic-bezier(.76, 0, .24, 1)', fill: 'forwards' };
        const animations = [
          incoming.animate([{ clipPath: fromMask }, { clipPath: fullMask }], timing),
          incoming
            .querySelector('.room-zoom')
            .animate(
              [
                { transform: `translateX(${direction * 25}%) scale(1.5)` },
                { transform: 'translateX(0%) scale(1)' },
              ],
              timing,
            ),
          outgoing
            .querySelector('.room-zoom')
            .animate(
              [
                { transform: 'translateX(0%) scale(1)' },
                { transform: `translateX(${-direction * 10}%) scale(1.12)` },
              ],
              timing,
            ),
        ];
        state.animations = animations;
        await Promise.all(animations.map((animation) => animation.finished.catch(() => {})));
        incoming.style.clipPath = fullMask;
        animations.forEach((animation) => animation.cancel());
        state.animations = [];
      }
      outgoing.remove();
      incoming.removeAttribute('aria-hidden');
      incoming.style.removeProperty('z-index');
      incoming.style.removeProperty('clip-path');
      state.slide = incoming;
      state.index = index;
      state.row.querySelector('.room-current').textContent = pad(index + 1);
      preloadNext(state);
    } catch {
      incoming.remove();
      state.autoFailed = true;
      state.error.textContent = 'This photo could not load. Please try again.';
    } finally {
      state.incoming = null;
      setBusy(state, false);
      if (state.pendingOpen) {
        state.pendingOpen = false;
        openLightbox(state);
      } else if (state.pendingStep) {
        const direction = state.pendingStep;
        state.pendingStep = null;
        changePhoto(state, direction);
      } else syncAutoplay(state);
    }
  }

  let frameRequest = 0;
  let previousTime = 0;
  function updateParallax(time) {
    frameRequest = 0;
    const elapsed = previousTime ? Math.min(time - previousTime, 50) : 16;
    previousTime = time;
    let settling = false;
    const viewportHeight = innerHeight;
    for (const state of states) {
      const rect = state.frame.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > viewportHeight) continue;
      const progress = clamp((viewportHeight - rect.top) / (viewportHeight + rect.height), 0, 1);
      const target = reducedMotion.matches ? 0 : (progress - 0.5) * rect.height * 0.14;
      state.drift += (target - state.drift) * (1 - Math.exp(-elapsed / 90));
      if (Math.abs(target - state.drift) < 0.05) state.drift = target;
      else settling = true;
      state.frame.style.setProperty('--room-drift', `${state.drift.toFixed(2)}px`);
    }
    if (settling && !document.hidden) frameRequest = requestAnimationFrame(updateParallax);
    else previousTime = 0;
  }
  function requestParallax() {
    if (!frameRequest && !document.hidden) frameRequest = requestAnimationFrame(updateParallax);
  }

  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const state = states.find((item) => item.frame === entry.target);
      if (!state) continue;
      fitImage(state, state.slide, state.room.photos[state.index]);
      if (state.incoming) fitImage(state, state.incoming.slide, state.incoming.photo);
    }
    requestParallax();
  });

  for (const room of rooms) {
    const row = document.querySelector(`[data-room="${room.slug}"]`);
    if (!row) continue;
    const frame = row.querySelector('.room-frame');
    const state = {
      room,
      row,
      frame,
      slide: frame.querySelector('.room-slide'),
      index: 0,
      busy: false,
      drift: 0,
      inView: false,
      manualStopped: false,
      timer: null,
      pendingStep: null,
      pendingOpen: false,
      buttons: [...row.querySelectorAll('[data-gallery-step]')],
      error: row.querySelector('.room-gallery-error'),
      animations: [],
    };
    states.push(state);
    frame.setAttribute('role', 'button');
    frame.setAttribute('aria-haspopup', 'dialog');
    frame.setAttribute('aria-label', `Open ${room.name} photos full screen`);
    frame.querySelector('img').draggable = false;
    const expandCue = document.createElement('span');
    expandCue.className = 'room-expand-cue';
    expandCue.setAttribute('aria-hidden', 'true');
    expandCue.innerHTML =
      '<svg viewBox="0 0 20 20"><path d="M7 3H3v4M13 3h4v4M3 13v4h4M17 13v4h-4"/></svg>';
    frame.append(expandCue);
    fitImage(state, state.slide, room.photos[0]);
    resizeObserver.observe(frame);
    for (const button of state.buttons)
      button.addEventListener('click', () => manualStep(state, Number(button.dataset.galleryStep)));
    frame.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        manualStep(state, event.key === 'ArrowRight' ? 1 : -1);
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openLightbox(state);
      }
    });
    const wasSwipe = wireSwipe(frame, (direction) => manualStep(state, direction));
    frame.addEventListener('click', () => {
      if (!wasSwipe()) openLightbox(state);
    });
  }

  const autoplayObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const state = states.find((item) => item.frame === entry.target);
        state.inView = entry.intersectionRatio >= 0.45;
        syncAutoplay(state);
      }
    },
    { threshold: [0, 0.45] },
  );
  states.forEach((state) => {
    autoplayObserver.observe(state.frame);
    syncAutoplay(state);
  });

  // Animate the photo, headline and reading blocks separately. A tall room
  // description must not finish its entrance while still below the viewport.
  section.classList.add('stays-motion');
  const watchPart = (element, delay = 240) => {
    element.classList.add('room-part');
    window.CasaBrisaReveal.watch({ element, className: 'is-in-view', delay });
  };
  section
    .querySelectorAll('.stays-heading > *')
    .forEach((element, index) => watchPart(element, 180 + index * 60));
  states.forEach((state) => {
    state.frame.classList.add('room-photo-reveal');
    window.CasaBrisaReveal.watch({
      element: state.frame,
      className: 'is-in-view',
      delay: 240,
      entryRatio: 0.16,
      onPresence(coverage) {
        const presence = reducedMotion.matches ? 1 : clamp((coverage - 0.03) / 0.52, 0, 1);
        state.row.querySelector('.room-visual').style.setProperty('--photo-presence', presence);
      },
      onEnter() {
        preloadNext(state);
        requestParallax();
      },
    });
    state.row.querySelectorAll('.room-info > *').forEach((element) => {
      if (element.matches('h3')) element.classList.add('room-title-reveal');
      watchPart(element, element.matches('h3') ? 240 : 180);
    });
    state.frame.querySelectorAll('.room-caption > *').forEach((element) => watchPart(element, 320));
  });
  addEventListener('scroll', requestParallax, { passive: true });
  addEventListener('resize', requestParallax, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(frameRequest);
      frameRequest = 0;
      previousTime = 0;
    } else requestParallax();
    syncAllAutoplay();
  });
  addEventListener('pagehide', () => states.forEach(clearAutoplay));
  addEventListener('pageshow', syncAllAutoplay);
  reducedMotion.addEventListener('change', () => {
    for (const state of states) {
      state.drift = 0;
      state.frame.style.setProperty('--room-drift', '0px');
      if (reducedMotion.matches) state.animations.forEach((animation) => animation.finish());
    }
    requestParallax();
    syncAllAutoplay();
  });
  requestParallax();

  // Keep the border's rounded ends circular at every button width, including
  // translated labels. The SVG is decorative and never intercepts a click.
  const bookingOutlines = new Map();
  const fitBookingOutline = (button) => {
    const { svg, rects } = bookingOutlines.get(button);
    const { width, height } = button.getBoundingClientRect();
    if (!width || !height) return;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    rects.forEach((rect) => {
      rect.setAttribute('width', width - 2);
      rect.setAttribute('height', height - 2);
      rect.setAttribute('rx', (height - 2) / 2);
    });
    button.classList.add('has-booking-orbit');
  };
  const bookingResizeObserver = new ResizeObserver((entries) => {
    entries.forEach(({ target }) => fitBookingOutline(target));
  });
  section.querySelectorAll('[data-book-room]').forEach((button) => {
    const namespace = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(namespace, 'svg');
    svg.classList.add('booking-orbit');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const rects = ['booking-orbit-track', 'booking-orbit-snake'].map((className) => {
      const rect = document.createElementNS(namespace, 'rect');
      rect.classList.add(className);
      rect.setAttribute('x', '1');
      rect.setAttribute('y', '1');
      rect.setAttribute('pathLength', '100');
      svg.append(rect);
      return rect;
    });
    button.append(svg);
    bookingOutlines.set(button, { svg, rects });
    fitBookingOutline(button);
    bookingResizeObserver.observe(button);
  });

  const dialog = document.querySelector('#stay-dialog');
  let opener = null;
  section.querySelectorAll('[data-book-room]').forEach((button) =>
    button.addEventListener('click', () => {
      const room = rooms.find((item) => item.slug === button.dataset.bookRoom);
      if (!room) return;
      opener = button;
      dialog.querySelector('#stay-dialog-title').textContent = room.name;
      dialog.querySelector('.stay-dialog-details').textContent =
        `${room.area} m² · Up to ${room.guests} guests · ${room.floor} · Private sea-view terrace`;
      dialog.showModal();
      document.documentElement.classList.add('has-stay-dialog');
      syncAllAutoplay();
    }),
  );
  dialog
    .querySelectorAll('.stay-dialog-close, .stay-dialog-back')
    .forEach((button) => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      dialog.close();
  });
  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('has-stay-dialog');
    opener?.focus({ preventScroll: true });
    syncAllAutoplay();
  });
})();

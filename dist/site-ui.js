(() => {
  'use strict';
  const overlays = [
    ...document.querySelectorAll('.site-fixed-nav > *, .site-scroll, .scene-nav button'),
  ];
  const navigation = document.querySelector('.scene-nav');
  const chapterButtons = [...(navigation?.querySelectorAll('button') || [])];
  const stage = document.querySelector('.stage');
  const contact = document.querySelector('#contact');
  const scrollHint = document.querySelector('.site-scroll');
  const chapters = chapterButtons
    .filter((button) => button.dataset.section)
    .map((button) => ({
      button,
      element: document.getElementById(button.dataset.section),
    }));
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  chapters.forEach(({ button, element }) =>
    button.addEventListener('click', () => {
      if (!element) return;
      window.scrollTo({
        top: scrollY + element.getBoundingClientRect().top,
        behavior: motion.matches ? 'instant' : 'smooth',
      });
    }),
  );
  function updateNavigation() {
    // The first five chapters share the horizontal presentation. The remaining
    // three are normal page sections, with the apartments treated as one chapter.
    let active = chapterButtons.find(
      (button) => Number(button.dataset.scene) === Number(stage?.dataset.scene || 0),
    );
    const readingLine = innerHeight * 0.45;
    chapters.forEach(({ button, element }) => {
      if (element && element.getBoundingClientRect().top <= readingLine) active = button;
    });
    const atEnd = scrollY + innerHeight >= document.documentElement.scrollHeight - 3;
    const atContact = contact && (contact.getBoundingClientRect().top <= readingLine || atEnd);
    if (atContact) active = chapterButtons.find((button) => button.dataset.section === 'contact');
    chapterButtons.forEach((button) => {
      if (button === active) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    // Hide the hint as soon as its position lies over the final contact chapter.
    const hintOnContact =
      contact &&
      scrollHint &&
      contact.getBoundingClientRect().top <= scrollHint.getBoundingClientRect().bottom;
    scrollHint?.classList.toggle('is-hidden', Boolean(atContact || hintOnContact));
  }
  const view = document.querySelector('.island-view');
  const clouds = view?.querySelector('.island-clouds');
  const plants = [...document.querySelectorAll('.branch')];
  const posters = new WeakMap();
  let frame = 0;

  function plantToneAt(x, y) {
    let rgb = [255, 255, 255];
    for (const plant of plants) {
      const img = plant.querySelector('img');
      const rect = img.getBoundingClientRect();
      if (
        !img.complete ||
        !img.naturalWidth ||
        !rect.width ||
        x < rect.left ||
        x > rect.right ||
        y < rect.top ||
        y > rect.bottom
      )
        continue;
      let pixels = posters.get(img);
      if (!pixels) {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 192;
          canvas.height = Math.max(1, Math.round((192 * img.naturalHeight) / img.naturalWidth));
          const context = canvas.getContext('2d', { willReadFrequently: true });
          context.drawImage(img, 0, 0, canvas.width, canvas.height);
          pixels = {
            width: canvas.width,
            height: canvas.height,
            data: context.getImageData(0, 0, canvas.width, canvas.height).data,
          };
          posters.set(img, pixels);
        } catch {
          continue;
        }
      }
      let u = (x - rect.left) / rect.width;
      let v = (y - rect.top) / rect.height;
      const transform = new DOMMatrixReadOnly(getComputedStyle(plant).transform);
      if (transform.a < 0) u = 1 - u;
      if (transform.d < 0) v = 1 - v;
      const px = Math.max(0, Math.min(pixels.width - 1, Math.floor(u * pixels.width)));
      const py = Math.max(0, Math.min(pixels.height - 1, Math.floor(v * pixels.height)));
      const i = (py * pixels.width + px) * 4;
      const alpha = pixels.data[i + 3] / 255;
      rgb = rgb.map((value, c) => pixels.data[i + c] * alpha + value * (1 - alpha));
    }
    const linear = rgb.map((value) => {
      const c = value / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2] < 0.25 ? 'light' : 'dark';
  }

  function toneAt(x, y) {
    const painted = document.elementsFromPoint(x, y);
    for (const element of painted) {
      if (element.closest('.site-fixed-nav, .site-scroll, .scene-nav')) continue;
      const surface = element.closest('[data-ui-surface]');
      if (!surface) continue;
      // The white cloud transition needs dark controls even above a photograph.
      if (surface === view && clouds) {
        const bounds = clouds.getBoundingClientRect();
        if (y >= bounds.top && y < bounds.top + bounds.height * 0.6) return 'dark';
      }
      return surface.dataset.uiSurface === 'light' ? plantToneAt(x, y) : 'light';
    }
    return 'dark';
  }
  function update() {
    frame = 0;
    updateNavigation();
    overlays.forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= innerHeight) return;
      const x = Math.max(1, Math.min(innerWidth - 1, rect.left + rect.width / 2));
      const y = Math.max(1, Math.min(innerHeight - 1, rect.top + rect.height / 2));
      if (element.closest('.site-fixed-nav')) {
        const tones = [0.15, 0.5, 0.85].map((part) => toneAt(rect.left + rect.width * part, y));
        element.dataset.uiTone =
          tones.filter((tone) => tone === 'dark').length >= 2 ? 'dark' : 'light';
      } else element.dataset.uiTone = toneAt(x, y);
    });
  }
  function schedule() {
    // The presentation paints its scroll transforms in its own animation frame.
    // Sample afterwards, including when a short gesture stops at a colour boundary.
    if (!frame)
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(update);
      });
  }
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('pageshow', schedule);
  document.addEventListener('casa-brisa:scenechange', schedule);
  document.addEventListener('load', schedule, true);
  document.fonts.ready.then(schedule);
  schedule();
})();

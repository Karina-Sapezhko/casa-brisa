(() => {
  'use strict';
  const view = document.querySelector('.island-view');
  if (!view) return;
  const photo = view.querySelector('.island-view-image img');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;
  let visible = false;
  let offset = 0;
  let previousTime = 0;
  window.CasaBrisaReveal.watch({
    element: view.querySelector('.island-view-caption'),
    className: 'is-revealed',
    delay: 180,
  });

  function render(time = performance.now()) {
    frame = 0;
    const bounds = view.getBoundingClientRect();
    visible = bounds.bottom > 1 && bounds.top < innerHeight - 1;
    view.classList.toggle('is-visible', visible);
    view.classList.toggle('is-paused', document.hidden || !visible || motion.matches);
    if (!visible || document.hidden) {
      previousTime = 0;
      return;
    }
    const elapsed = previousTime ? Math.min(time - previousTime, 50) : 16;
    previousTime = time;
    // Like the arrival photograph: travel 20% more slowly than the page.
    // Clamp to the visible part of the section so fast reversals never expose an edge.
    const minimum = Math.min(innerHeight, bounds.bottom) - (bounds.top + bounds.height * 1.04);
    const maximum = Math.max(0, bounds.top) - (bounds.top - bounds.height * 0.04);
    const clamp = (value) => Math.max(minimum, Math.min(maximum, value));
    const target = motion.matches ? 0 : clamp(-bounds.top * 0.2);
    offset = motion.matches
      ? 0
      : clamp(offset + (target - offset) * (1 - Math.exp(-elapsed / 140)));
    if (Math.abs(target - offset) < 0.1) offset = target;
    photo.style.transform = `translate3d(0, ${offset.toFixed(2)}px, 0)`;
    if (offset !== target) frame = requestAnimationFrame(render);
    else previousTime = 0;
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(render);
  }
  new IntersectionObserver(schedule, { rootMargin: '80px' }).observe(view);
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  document.addEventListener('visibilitychange', schedule);
  motion.addEventListener('change', schedule);
  render();
})();

(() => {
  'use strict';
  // Measure the painted position, not the scroll destination. The short lead-in
  // starts at the edge, so reaching the reading area never adds a second wait.
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const items = [];
  let frame = 0;

  function intersection(rect, clip) {
    return {
      width: Math.max(0, Math.min(rect.right, clip.right) - Math.max(rect.left, clip.left)),
      height: Math.max(0, Math.min(rect.bottom, clip.bottom) - Math.max(rect.top, clip.top)),
    };
  }
  function intersects(rect, clip) {
    const area = intersection(rect, clip);
    return area.width > 0 && area.height > 0;
  }
  function enter(item) {
    item.entered = true;
    item.since = null;
    item.element.dataset.revealState = 'visible';
    if (item.className) item.element.classList.add(item.className);
    item.onEnter?.();
  }
  function reset(item) {
    item.since = null;
    item.coverage = 0;
    item.onPresence?.(0);
    item.element.dataset.revealState = 'waiting';
    if (!item.entered) return;
    item.entered = false;
    if (item.className) item.element.classList.remove(item.className);
    item.onExit?.();
  }
  function update(now) {
    frame = 0;
    if (document.hidden) return;
    let pending = false;
    for (const item of items) {
      const root = item.clip?.getBoundingClientRect();
      const viewport = {
        left: Math.max(0, root?.left ?? 0),
        right: Math.min(innerWidth, root?.right ?? innerWidth),
        top: Math.max(0, root?.top ?? 0),
        bottom: Math.min(innerHeight, root?.bottom ?? innerHeight),
      };
      const rect = (item.trigger || item.element).getBoundingClientRect();
      const overlap = intersection(rect, viewport);
      const axis = item.axis || 'y';
      const extent = axis === 'x' ? overlap.width : overlap.height;
      const available =
        axis === 'x' ? viewport.right - viewport.left : viewport.bottom - viewport.top;
      const size = Math.min(axis === 'x' ? rect.width : rect.height, available);
      const onScreen = intersects(rect, viewport);
      const exitMargin = item.exitMargin ?? 24;
      const expanded = {
        left: viewport.left - exitMargin,
        right: viewport.right + exitMargin,
        top: viewport.top - exitMargin,
        bottom: viewport.bottom + exitMargin,
      };
      const inScreen =
        viewport.right > viewport.left &&
        viewport.bottom > viewport.top &&
        item.related.some((element) => {
          const part = intersection(element.getBoundingClientRect(), expanded);
          return part.width > 0 && part.height > 0;
        });
      const focused = item.element.contains(document.activeElement);
      const gate = item.gate?.getBoundingClientRect();
      const threshold = viewport.top + (viewport.bottom - viewport.top) * (item.gateAt ?? 1);
      const entryDistance = Math.min(item.entryPx ?? 96, size * (item.entryRatio ?? 0.18));
      const eligible =
        onScreen &&
        extent >= entryDistance &&
        (!gate || gate.top <= threshold) &&
        (!item.canEnter || item.canEnter());
      // Some layered scenes need their pause to begin only once the surface
      // is readable, not while an invisible panel is approaching.
      if (!item.entered && item.delayFromReady && !eligible) item.since = null;
      if (onScreen) {
        if (!item.delayFromReady || eligible) item.since ??= now;
        item.coverage = Math.max(item.coverage, Math.min(1, extent / Math.max(1, size)));
        item.onPresence?.(motion.matches ? 1 : item.coverage);
      }
      // Once started, continue while any of the element is on screen, even
      // when scrolling back across its entry threshold. Only a full exit resets.
      const ready = motion.matches || focused || (item.entered ? inScreen : eligible);
      if (ready !== item.ready) {
        item.ready = ready;
        item.onReadinessChange?.(ready);
      }
      if (!inScreen && !motion.matches && !focused) reset(item);
      if (item.entered) continue;
      if (!ready) {
        item.element.dataset.revealState = 'waiting';
        continue;
      }
      if (motion.matches || focused) {
        item.coverage = 1;
        item.onPresence?.(1);
        enter(item);
        continue;
      }
      item.since ??= now;
      item.element.dataset.revealState = 'pending';
      if (now - item.since >= (item.delay ?? 240)) enter(item);
      else pending = true;
    }
    if (pending) schedule();
  }
  function schedule() {
    if (!frame && !document.hidden) frame = requestAnimationFrame(update);
  }
  window.CasaBrisaReveal = {
    watch(options) {
      const item = {
        related: [options.element],
        ...options,
        entered: false,
        ready: false,
        since: null,
        coverage: 0,
      };
      items.push(item);
      item.element.dataset.revealState = 'waiting';
      schedule();
    },
    refresh: schedule,
  };
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule, { passive: true });
  addEventListener('pageshow', schedule);
  document.addEventListener('focusin', schedule);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
      items
        .filter((item) => !item.entered)
        .forEach((item) => {
          item.since = null;
        });
    } else schedule();
  });
  motion.addEventListener('change', () => {
    items.forEach(reset);
    schedule();
  });
})();

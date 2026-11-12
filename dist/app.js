(() => {
  'use strict';

  const stage = document.querySelector('.stage');
  const presentation = document.querySelector('.presentation-scroll');
  if (!stage || !presentation) return;
  let flowerPlayback;
  let stageVisible = true;
  let scrollFrame = 0;
  let textFrame = 0;
  const lineBlocks = Array.from(stage.querySelectorAll('[data-line-reveal]'), (element) => ({
    element,
    text: element.textContent.trim(),
    metrics: '',
  }));

  function layoutText() {
    textFrame = 0;
    for (const block of lineBlocks) {
      const { element, text } = block;
      const style = getComputedStyle(element);
      const metrics = [
        element.clientWidth,
        style.fontSize,
        style.lineHeight,
        style.letterSpacing,
      ].join('|');
      if (block.metrics === metrics) continue;

      const accessible = document.createElement('span');
      accessible.className = 'sr-only';
      accessible.textContent = text;
      const visual = document.createElement('span');
      visual.className = 'text-lines';
      visual.setAttribute('aria-hidden', 'true');
      const words = text.split(/\s+/).map((word, index) => {
        if (index) visual.append(document.createTextNode(' '));
        const span = document.createElement('span');
        span.className = 'text-measure-word';
        span.textContent = word;
        visual.append(span);
        return span;
      });
      element.replaceChildren(accessible, visual);

      const lines = [];
      for (const word of words) {
        const top = word.offsetTop;
        const last = lines[lines.length - 1];
        if (!last || Math.abs(top - last.top) > 1) lines.push({ top, words: [word.textContent] });
        else last.words.push(word.textContent);
      }
      const masks = lines.map((line, index) => {
        const mask = document.createElement('span');
        mask.className = 'text-line-mask';
        mask.style.setProperty('--text-line-delay', `${index * 100}ms`);
        const inner = document.createElement('span');
        inner.className = 'text-line';
        inner.textContent = line.words.join(' ');
        mask.append(inner);
        return mask;
      });
      visual.replaceChildren(...masks);
      block.metrics = metrics;
    }
    if (stage.classList.contains('is-playing')) {
      collectAnimations();
      render();
    }
  }

  function scheduleTextLayout() {
    if (!textFrame) textFrame = requestAnimationFrame(layoutText);
  }

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const arrival = stage.querySelector('.arrival');
  const arrivalPhoto = arrival.querySelector('.arrival-photo');
  const white = stage.querySelector('.white-screen');
  const track = stage.querySelector('.story-track');
  const conceptSurface = stage.querySelector('.intro-reveal-surface');
  const gardenWords = [...stage.querySelectorAll('.garden-title > .garden-word')];
  const wordDrifts = [
    [-5, 5],
    [25, -25],
    [-15, 25],
  ];
  const groups = [
    {
      selector: '.intro, .intro-note',
      trigger: '.intro-panel',
      concept: true,
      duration: 3550,
      delay: 0,
    },
    { selector: '.garden-title, .garden-place', duration: 1850, presence: true },
    { selector: '.garden-photo', duration: 1250, presence: true },
    { selector: '.garden-copy', duration: 3800, presence: true, delay: 200 },
    { selector: '.apartments-invitation', duration: 1450, delay: 180 },
    { selector: '.location-title, .location-eyebrow', duration: 2200, presence: true },
    { selector: '.route-diagram', duration: 800, presence: true, delay: 180 },
    { selector: '.location-route-action', duration: 1300, delay: 180 },
  ].map((group) => ({
    ...group,
    elements: [...stage.querySelectorAll(group.selector)],
    animations: [],
    elapsed: 0,
    entered: false,
    ready: false,
  }));
  const routeLine = stage.querySelector('.route-line');
  const routeContent = groups.filter((group) =>
    /location-title|route-diagram|location-route-action/.test(group.selector),
  );
  const routeGroup = routeContent.find((group) => group.selector === '.route-diagram');

  function syncRouteLine() {
    if (!routeGroup.entered) {
      routeLine.classList.remove('is-drawing');
      return;
    }
    // Only the line waits: finish the labels, title and action first. The CSS
    // transition adds a short beat after this, and resets on the map's full exit.
    const complete = routeContent.every(
      (group) =>
        group.entered &&
        group.elapsed >= group.duration &&
        (!group.presence || group.presenceValue >= 0.99),
    );
    if (motion.matches || complete) routeLine.classList.add('is-drawing');
  }

  let points = [];
  let selected = -1;
  let motionFrame = 0;
  let lastFrame = 0;
  let viewportHeight = 0;
  let horizontal = 0;
  let horizontalTarget = 0;
  let vertical = 0;
  let conceptPresence = 0;
  let conceptTarget = 0;
  let photoOffset = 0;
  let photoTarget = 0;
  let gardenProgress = 0;
  let gardenTarget = 0;
  let gardenStrength = 1;

  function drawArrivalPhoto() {
    // The photograph travels a little slower than the copy. Clamp the trailing
    // offset on a fast return so no empty strip can appear at the top.
    photoOffset = Math.max(0, Math.min(photoOffset, vertical * viewportHeight));
    arrivalPhoto.style.transform = `translate3d(0, ${photoOffset}px, 0)`;
  }
  function hasPendingMotion() {
    return (
      Math.abs(photoTarget - photoOffset) > 0.1 ||
      Math.abs(horizontalTarget - horizontal) > 0.1 ||
      Math.abs(conceptTarget - conceptPresence) > 0.001 ||
      Math.abs(gardenTarget - gardenProgress) > 0.0001 ||
      groups.some((g) => g.entered && g.ready && g.elapsed < g.duration)
    );
  }
  function drawGardenWords() {
    // Move the line wrappers, leaving each letter's entrance transform intact.
    gardenWords.forEach((word, index) => {
      const [from, to] = wordDrifts[index];
      const offset = motion.matches ? 0 : (from + (to - from) * gardenProgress) * gardenStrength;
      word.style.transform = `translate3d(${offset}%, 0, 0)`;
    });
  }

  function drawCanvas() {
    track.style.transform = `translate3d(${-horizontal}px, 0, 0)`;
    conceptSurface.style.opacity = conceptPresence;
    conceptSurface.style.transform = `scale(${0.88 + conceptPresence * 0.12})`;
    gardenTarget = horizontal / (stage.clientWidth * 2.4);
    stage.querySelectorAll('.white-panel').forEach((panel) => {
      const rect = panel.getBoundingClientRect();
      panel.inert =
        rect.right <= 0 || rect.left >= innerWidth || rect.top >= innerHeight || rect.bottom <= 0;
    });
    // Reveal checks follow the position actually painted by this frame.
    window.CasaBrisaReveal.refresh();
  }

  function collectAnimations() {
    groups.forEach((group) => {
      group.animations = group.elements
        .flatMap((e) => e.getAnimations({ subtree: true }))
        .filter((a) => a instanceof CSSAnimation);
      group.animations.forEach((a) => a.pause());
      drawGroup(group);
    });
  }
  function drawGroup(group) {
    const time = motion.matches ? group.duration : Math.min(group.duration, group.elapsed);
    group.animations.forEach((animation) => {
      animation.currentTime = group.entered
        ? time
        : Math.min(0, animation.effect.getTiming().delay);
    });
    syncRouteLine();
  }
  function measure() {
    viewportHeight = stage.offsetHeight;
    const width = stage.clientWidth;
    gardenStrength = width <= 700 ? 0.45 : 1;
    const rise = viewportHeight * 0.85;
    points = [0, rise, rise + width, rise + width * 1.4, rise + width * 2.4];
    presentation.style.height = `${points[4] + viewportHeight}px`;
  }
  function render() {
    const distance = Math.max(0, -presentation.getBoundingClientRect().top);
    vertical = Math.min(1, distance / points[1]);
    horizontalTarget = Math.max(0, Math.min(stage.clientWidth * 2.4, distance - points[1]));
    let index = 0;
    points.forEach((point, i) => {
      if (Math.abs(distance - point) < Math.abs(distance - points[index])) index = i;
    });
    if (motion.matches) {
      vertical = index === 0 ? 0 : 1;
      horizontalTarget = Math.max(0, points[index] - points[1]);
    }
    // A short follow-through, never a page lock or an extra wheel gesture.
    if (
      motion.matches ||
      vertical < 1 ||
      Math.abs(horizontalTarget - horizontal) > stage.clientWidth * 1.5
    )
      horizontal = horizontalTarget;
    conceptTarget = motion.matches ? 1 : Math.max(0, Math.min(1, (vertical - 0.7) / 0.3));
    if (motion.matches || vertical === 0) conceptPresence = conceptTarget;
    arrival.style.transform = `translate3d(0, ${-vertical * viewportHeight}px, 0)`;
    photoTarget = motion.matches ? 0 : vertical * viewportHeight * 0.2;
    if (motion.matches || vertical === 0 || vertical === 1) photoOffset = photoTarget;
    drawArrivalPhoto();
    white.style.transform = `translate3d(0, ${(1 - vertical) * viewportHeight}px, 0)`;
    drawCanvas();
    if (motion.matches || gardenTarget === 0 || gardenTarget === 1) gardenProgress = gardenTarget;
    drawGardenWords();
    if (selected !== index) {
      selected = index;
      stage.dataset.scene = String(index);
      document.dispatchEvent(new Event('casa-brisa:scenechange'));
    }
    syncPlayback();
  }
  function tick(now) {
    motionFrame = 0;
    if (document.hidden || !stageVisible) return;
    const elapsed = lastFrame ? Math.min(64, now - lastFrame) : 0;
    lastFrame = now;
    horizontal += (horizontalTarget - horizontal) * (1 - Math.exp(-elapsed / 100));
    if (Math.abs(horizontalTarget - horizontal) <= 0.1) horizontal = horizontalTarget;
    conceptPresence += (conceptTarget - conceptPresence) * (1 - Math.exp(-elapsed / 160));
    if (Math.abs(conceptTarget - conceptPresence) <= 0.001) conceptPresence = conceptTarget;
    drawCanvas();
    photoOffset += (photoTarget - photoOffset) * (1 - Math.exp(-elapsed / 140));
    if (Math.abs(photoTarget - photoOffset) <= 0.1) photoOffset = photoTarget;
    drawArrivalPhoto();
    gardenProgress += (gardenTarget - gardenProgress) * (1 - Math.exp(-elapsed / 100));
    if (Math.abs(gardenTarget - gardenProgress) <= 0.0001) gardenProgress = gardenTarget;
    drawGardenWords();
    groups.forEach((group) => {
      if (group.entered && group.ready && group.elapsed < group.duration) {
        group.elapsed += elapsed;
        drawGroup(group);
      }
    });
    if (hasPendingMotion()) motionFrame = requestAnimationFrame(tick);
    else lastFrame = 0;
  }
  function syncPlayback() {
    const rect = stage.getBoundingClientRect();
    stageVisible = rect.bottom > 1 && rect.top < innerHeight - 1;
    const paused = document.hidden || !stageVisible;
    flowerPlayback?.setPaused(paused);
    if (paused) {
      cancelAnimationFrame(motionFrame);
      motionFrame = 0;
      lastFrame = 0;
    } else if (!motionFrame && hasPendingMotion()) motionFrame = requestAnimationFrame(tick);
  }
  function scheduleViewportCheck() {
    if (!scrollFrame)
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        render();
      });
  }
  function resizePresentation() {
    const oldPoints = points;
    const distance = Math.max(0, -presentation.getBoundingClientRect().top);
    const wasInside = distance <= oldPoints[4];
    let part = 0;
    while (part < 3 && distance > oldPoints[part + 1]) part++;
    const fraction = (distance - oldPoints[part]) / (oldPoints[part + 1] - oldPoints[part]);
    measure();
    if (wasInside)
      window.scrollTo({
        top:
          scrollY +
          presentation.getBoundingClientRect().top +
          points[part] +
          fraction * (points[part + 1] - points[part]),
        behavior: 'instant',
      });
    scheduleTextLayout();
    scheduleViewportCheck();
  }
  document.querySelectorAll('.scene-nav button[data-scene]').forEach((button) =>
    button.addEventListener('click', () => {
      window.scrollTo({
        top:
          scrollY + presentation.getBoundingClientRect().top + points[Number(button.dataset.scene)],
        behavior: motion.matches ? 'instant' : 'smooth',
      });
    }),
  );
  motion.addEventListener('change', () => {
    collectAnimations();
    render();
  });
  // Text/scroll controls must not wait for every decorative image to decode.
  // All scene dimensions are defined in CSS; remeasure lines when fonts arrive.
  {
    measure();
    layoutText();
    stage.classList.add('is-playing');
    collectAnimations();
    groups.forEach((group) => {
      const element =
        group.elements.find((e) => e.matches('.garden-title, .location-title')) ||
        group.elements[0];
      const trigger = group.trigger ? stage.querySelector(group.trigger) : element;
      window.CasaBrisaReveal.watch({
        element,
        trigger,
        related: [trigger, ...group.elements],
        axis: 'x',
        clip: stage,
        gate: group.concept ? trigger : null,
        gateAt: 0.3,
        delay: group.delay ?? 300,
        // The first entrance rises from the hero behind a fading surface;
        // returning from the next scene has that surface visible already.
        // Start both immediately once the panel is readable, without a timed pause.
        canEnter: group.concept ? () => conceptPresence >= 0.85 : undefined,
        delayFromReady: group.concept,
        entryRatio: group.concept ? 0.8 : 0.22,
        entryPx: group.concept ? Infinity : 120,
        exitMargin: group.concept ? 0 : 24,
        onPresence: group.presence
          ? (coverage) => {
              // Slow scrolling still reveals the composition as it moves into view,
              // even if the individual letter animation has already finished.
              const presence = motion.matches
                ? 1
                : Math.max(0, Math.min(1, (coverage - 0.04) / 0.72));
              group.presenceValue = presence;
              group.elements.forEach((e) => e.style.setProperty('--entry-presence', presence));
              syncRouteLine();
            }
          : undefined,
        onEnter() {
          group.entered = true;
          group.elapsed = motion.matches ? group.duration : 0;
          drawGroup(group);
          syncPlayback();
        },
        onExit() {
          group.entered = false;
          group.elapsed = 0;
          drawGroup(group);
        },
        onReadinessChange(ready) {
          group.ready = ready;
          syncPlayback();
        },
      });
    });
    flowerPlayback = window.CasaBrisaFlowerVideos?.(stage);
    document.addEventListener('visibilitychange', syncPlayback);
    window.addEventListener('scroll', scheduleViewportCheck, { passive: true });
    window.addEventListener('resize', resizePresentation, { passive: true });
    document.fonts.addEventListener('loadingdone', scheduleTextLayout);
    document.fonts.ready.then(scheduleTextLayout);
    render();
  }
})();

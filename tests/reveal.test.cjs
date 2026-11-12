const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
test('Reveal timing, visibility and replay', () => {
  const source = readFileSync(join(__dirname, '../dist/reveal.js'), 'utf8');
  let now = 0,
    serial = 0;
  const frames = new Map(),
    events = new Map(),
    motionEvents = new Map();
  const media = { matches: false, addEventListener: (name, fn) => motionEvents.set(name, fn) };
  const document = {
    hidden: false,
    activeElement: null,
    documentElement: { scrollHeight: 5000 },
    addEventListener: (name, fn) => events.set(name, fn),
  };
  const context = {
    document,
    innerWidth: 1000,
    innerHeight: 1000,
    scrollY: 0,
    matchMedia: () => media,
    addEventListener: (name, fn) => events.set(name, fn),
    requestAnimationFrame: (fn) => {
      frames.set(++serial, fn);
      return serial;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
  };
  context.window = context;
  vm.runInNewContext(source, context);
  const step = (ms) => {
    now += ms;
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((fn) => fn(now));
  };
  const move = (element, top) => {
    element.top = top;
    events.get('scroll')();
    step(0);
  };
  const element = (top, height = 400) => ({
    top,
    height,
    dataset: {},
    classList: { add() {}, remove() {} },
    contains: () => false,
    getBoundingClientRect() {
      return {
        top: this.top,
        bottom: this.top + this.height,
        left: 100,
        right: 900,
        width: 800,
        height: this.height,
      };
    },
  });
  const item = element(995);
  let entrances = 0,
    exits = 0;
  context.CasaBrisaReveal.watch({
    element: item,
    delay: 300,
    onEnter: () => entrances++,
    onExit: () => exits++,
  });
  step(0);
  step(299);
  assert.equal(entrances, 0, 'Entering the viewport arms the configured delay');
  move(item, -450);
  move(item, 400);
  step(150);
  assert.equal(entrances, 0, 'Do not start during a short pass through the reading area');
  move(item, -450);
  step(1000);
  assert.equal(entrances, 0, 'Cancel the pending reveal when navigation passes the block');
  move(item, 400);
  step(299);
  assert.equal(entrances, 0);
  step(1);
  assert.equal(entrances, 1);
  move(item, 800);
  step(400);
  assert.equal(exits, 0, 'Keep content visible at a partially visible edge');
  move(item, 1030);
  assert.equal(exits, 1, 'Reset only after leaving completely');
  move(item, 400);
  step(300);
  assert.equal(entrances, 2, 'Replay on a return from below');
  move(item, -450);
  move(item, 0);
  step(300);
  assert.equal(entrances, 3, 'Replay on a return from above');
  const immediate = element(995, 600);
  let immediateEntered = false;
  context.CasaBrisaReveal.watch({ element: immediate, onEnter: () => (immediateEntered = true) });
  step(0);
  step(1000);
  assert.equal(immediateEntered, false, 'A tiny edge must not consume the entrance');
  move(immediate, 800);
  assert.equal(
    immediateEntered,
    true,
    'Approach time counts: no second delay when reaching the reading area',
  );
  const offscreen = element(1100, 400);
  let offscreenEntered = false;
  context.CasaBrisaReveal.watch({ element: offscreen, onEnter: () => (offscreenEntered = true) });
  step(0);
  step(1000);
  assert.equal(offscreenEntered, false, 'Do not consume the animation before entering');
  const tall = element(100, 1600);
  let tallEntered = false;
  context.CasaBrisaReveal.watch({ element: tall, onEnter: () => (tallEntered = true) });
  step(0);
  step(300);
  assert.equal(tallEntered, true, 'An element taller than the screen must remain reachable');
  const footer = element(950, 48);
  let footerEntered = false;
  context.scrollY = 4000;
  context.CasaBrisaReveal.watch({ element: footer, onEnter: () => (footerEntered = true) });
  step(0);
  step(300);
  assert.equal(footerEntered, true, 'The last footer must be visible at the page end');
  context.scrollY = 0;
  const scene = element(0, 1000),
    bottomCaption = element(850, 80);
  let captionEntered = false;
  context.CasaBrisaReveal.watch({
    element: bottomCaption,
    clip: scene,
    gate: scene,
    onEnter: () => (captionEntered = true),
  });
  step(0);
  step(300);
  assert.equal(captionEntered, true, 'A caption near the bottom of a complete scene must play');
  const introPanel = element(310, 1000),
    introText = element(700, 200);
  let introEntered = 0,
    introReady = false;
  context.CasaBrisaReveal.watch({
    element: introText,
    gate: introPanel,
    gateAt: 0.3,
    delay: 0,
    onEnter: () => introEntered++,
    onReadinessChange: (value) => (introReady = value),
  });
  step(0);
  step(1000);
  assert.equal(introEntered, 0, 'Concept waits until panel top reaches 30% viewport');
  move(introPanel, 300);
  assert.equal(introEntered, 1);
  move(introPanel, 350);
  assert.equal(introReady, true, 'An entrance already playing must not freeze at the trigger');
  move(introText, 1030);
  assert.equal(introReady, false);
  move(introPanel, 200);
  move(introText, 700);
  assert.equal(introEntered, 2, 'Concept replays after a full exit');
  document.hidden = true;
  events.get('visibilitychange')();
  assert.equal(item.dataset.revealState, 'visible');
  document.hidden = false;
  events.get('visibilitychange')();
  step(0);
  step(300);
  assert.equal(entrances, 3, 'Changing tabs must not reset a visible section');
  media.matches = true;
  motionEvents.get('change')();
  step(0);
  assert.equal(item.dataset.revealState, 'visible', 'Reduced motion reveals without waiting');
  const side = element(100, 200);
  side.left = 990;
  side.getBoundingClientRect = function () {
    return {
      left: this.left,
      right: this.left + 400,
      top: 100,
      bottom: 300,
      width: 400,
      height: 200,
    };
  };
  let sideEntered = 0,
    presence = 0;
  context.CasaBrisaReveal.watch({
    element: side,
    axis: 'x',
    onEnter: () => sideEntered++,
    onPresence: (v) => (presence = v),
  });
  media.matches = false;
  motionEvents.get('change')();
  step(0);
  step(1000);
  assert.equal(sideEntered, 0, 'Horizontal entrance measures the visible width');
  side.left = 800;
  events.get('scroll')();
  step(0);
  assert.equal(sideEntered, 1);
  assert.equal(presence, 0.5);
  side.left = 300;
  events.get('scroll')();
  step(0);
  assert.equal(presence, 1);
  side.left = 900;
  events.get('scroll')();
  step(0);
  assert.equal(presence, 1, 'An exit does not fade finished content');
  side.left = 1030;
  events.get('scroll')();
  step(0);
  assert.equal(presence, 0, 'Full exit rearms the spatial entrance');
  const focused = element(1200);
  focused.contains = () => true;
  let focusPresence = 0;
  context.CasaBrisaReveal.watch({ element: focused, onPresence: (v) => (focusPresence = v) });
  step(0);
  assert.equal(focused.dataset.revealState, 'visible');
  assert.equal(focusPresence, 1, 'Keyboard focus opens both visibility layers immediately');
  const layered = element(0, 1000);
  let surfaceReady = false,
    layeredEntrances = 0,
    layeredExits = 0;
  context.CasaBrisaReveal.watch({
    element: layered,
    delay: 100,
    delayFromReady: true,
    exitMargin: 0,
    canEnter: () => surfaceReady,
    onEnter: () => layeredEntrances++,
    onExit: () => layeredExits++,
  });
  step(0);
  step(2000);
  assert.equal(layeredEntrances, 0, 'Do not animate text behind an invisible surface');
  surfaceReady = true;
  context.CasaBrisaReveal.refresh();
  step(0);
  step(99);
  assert.equal(
    layeredEntrances,
    0,
    'Approach time must not consume the requested readable-surface pause',
  );
  step(1);
  assert.equal(layeredEntrances, 1, 'Start 100ms after the surface is readable');
  surfaceReady = false;
  context.CasaBrisaReveal.refresh();
  step(0);
  assert.equal(layeredExits, 0, 'Do not restart an entered group on a partial reverse');
  move(layered, 1000);
  assert.equal(
    layeredExits,
    1,
    'Reset at the hero boundary even without 24px of further scrolling',
  );
  surfaceReady = true;
  move(layered, 0);
  step(99);
  assert.equal(layeredEntrances, 1);
  step(1);
  assert.equal(layeredEntrances, 2, 'Returning from the hero repeats the same pause and effect');
});

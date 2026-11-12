(() => {
  'use strict';
  const section = document.querySelector('#contact');
  if (!section) return;
  section.classList.add('contact-motion');
  section.querySelectorAll('.contact-reveal').forEach((element) => {
    const delay = element.matches('.contact-heading') ? 200 : 220;
    window.CasaBrisaReveal.watch({ element, className: 'is-visible', delay, entryRatio: 0.18 });
  });
})();

/* Первый экран страниц направлений (hub-2026-11): «Цифровые решения» и «Оборудование под задачу».
   Картинка [data-hero-pic]: центр и узлы вокруг. Открыли страницу напрямую: логотип собирается в центре экрана
   (там же, где при переходе), потом спутники втягиваются в глобус и вылетают из него на значки узлов,
   знак уходит в шапку. Пришли с другой страницы: то же самое с логотипом перехода (transit.js). */
(function () {
  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pic = document.querySelector('[data-hero-pic]'), beams = pic && pic.querySelector('.sp-beams');
  const hero = pic && pic.closest('.ph');
  if (!pic) return;
  const root = document.documentElement;

  // Лучи от сайта к узлам: пересчитываются под размер
  function drawBeams() {
    const r0 = pic.getBoundingClientRect(), site = pic.querySelector('.sp-center').getBoundingClientRect();
    const cx = site.left + site.width / 2 - r0.left, cy = site.top + site.height / 2 - r0.top;
    beams.setAttribute('viewBox', `0 0 ${r0.width} ${r0.height}`);
    beams.innerHTML = [...pic.querySelectorAll('.sp-node .ico')].map(n => {
      const r = n.getBoundingClientRect(), x = r.left + r.width / 2 - r0.left, y = r.top + r.height / 2 - r0.top;
      return `<line x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
    }).join('');
  }
  drawBeams(); addEventListener('resize', drawBeams);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawBeams);

  const targets = [...pic.querySelectorAll('[data-morph]')];
  const finish = () => { pic.classList.add('on'); hero.classList.add('on'); targets.forEach(t => t.classList.add('mo-in')); };

  function rebuild(logo) {
    // картинка проявляется сразу, текст после того, как спутники ушли из центра и знак поднялся в шапку
    pic.classList.add('on'); setTimeout(() => hero.classList.add('on'), 1100);
    return SarmatLogo.morph(logo, targets, { dur: 1500 }).then(() => {
      // знак уходит в шапку, на место логотипа
      const b = document.querySelector('.sh-brand img');
      const r = b ? b.getBoundingClientRect() : { left: 20, top: 12, width: 48, height: 40 };
      logo.parts.gMark.style.transition = 'opacity .5s .35s';
      logo.parts.globeG.style.transition = 'opacity .5s .35s';
      logo.parts.glowG.style.transition = 'opacity .3s';
      logo.parts.glowG.style.opacity = 0;
      const p = logo.moveTo({ left: r.left, top: r.top, width: r.width, height: r.height }, 'mark', 800);
      requestAnimationFrame(() => { logo.parts.gMark.style.opacity = 0; logo.parts.globeG.style.opacity = 0; });
      return p;
    });
  }
  // На телефоне картинка ниже первого экрана: пересборка в неё не видна, логотип просто уходит
  // Картинка первого экрана на экране? Открыли по ссылке с якорем или уже прокрутили: сборки нет
  const seen = () => { const r = pic.getBoundingClientRect(); return !location.hash && r.bottom > 0 && r.top < innerHeight * 0.55; };
  window.SarmatPage = { arrive(logo, ov) { ov.clear(); if (!seen() || matchMedia('(max-width: 760px)').matches) { finish(); ov.end(); return; } rebuild(logo).then(() => ov.end()); } };

  // Телефон: без сборки, текст сразу (мобильная ревизия 24.11.2026)
  const NARROW = matchMedia('(max-width: 760px)').matches;
  if (!window.SarmatLogo || REDUCE || NARROW || !seen()) { finish(); }
  else if (!window.__trArrive) {
    const layer = document.createElement('div'); layer.className = 'sl-layer'; document.body.appendChild(layer);
    const logo = SarmatLogo.create(); logo.mount(layer);
    logo.fit(SarmatLogo.stageBox(), 'full');
    logo.set(0);
    const skip = () => { logo.skip = true; };
    ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(ev => addEventListener(ev, skip, { once: true, passive: true }));
    setTimeout(() => logo.play(3000).then(() => rebuild(logo)).then(() => layer.remove()), 250);
  }
  setTimeout(() => { root.classList.add('mo-off'); finish(); }, 9000);
})();

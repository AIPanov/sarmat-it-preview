/* «Цифровые решения», первый экран (hub-2026-11). Картинка: сайт в центре, вокруг программы.
   Открыли страницу напрямую: логотип собирается над картинкой, потом спутники разлетаются по значкам узлов,
   знак уходит в шапку. Пришли с другой страницы: то же самое с логотипом перехода (transit.js). */
(function () {
  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pic = document.getElementById('solPic'), beams = document.getElementById('spBeams');
  if (!pic) return;
  const root = document.documentElement;

  // Лучи от сайта к узлам: пересчитываются под размер
  function drawBeams() {
    const r0 = pic.getBoundingClientRect(), site = pic.querySelector('.sp-site').getBoundingClientRect();
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
  const finish = () => { pic.classList.add('on'); root.classList.add('brand-on'); targets.forEach(t => t.classList.add('mo-in')); };

  function rebuild(logo) {
    pic.classList.add('on');
    return SarmatLogo.morph(logo, targets, { dur: 1150 }).then(() => {
      // знак уходит в шапку, на место логотипа
      const b = document.querySelector('.hdr .brand img');
      const r = b ? b.getBoundingClientRect() : { left: 20, top: 12, width: 48, height: 40 };
      root.classList.add('brand-on');
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
  const seen = () => pic.getBoundingClientRect().top < innerHeight * 0.55;
  window.SarmatPage = { arrive(logo, ov) { ov.clear(); if (!seen()) { finish(); ov.end(); return; } rebuild(logo).then(() => ov.end()); } };

  if (!window.SarmatLogo || REDUCE || !seen()) { finish(); }
  else if (!window.__trArrive) {
    const layer = document.createElement('div'); layer.className = 'sl-layer'; document.body.appendChild(layer);
    const logo = SarmatLogo.create(); logo.mount(layer);
    const r = pic.getBoundingClientRect(), s = Math.min(r.width * 0.8, innerHeight * 0.62, 520);
    logo.fit({ left: r.left + (r.width - s) / 2, top: Math.max(70, r.top + (r.height - s) / 2), width: s, height: s }, 'full');
    logo.set(0);
    const skip = () => { logo.skip = true; };
    ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(ev => addEventListener(ev, skip, { once: true, passive: true }));
    setTimeout(() => logo.play(3000).then(() => rebuild(logo)).then(() => layer.remove()), 250);
  }
  setTimeout(() => { root.classList.add('mo-off'); finish(); }, 9000);
})();

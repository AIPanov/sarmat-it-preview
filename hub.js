/* Главная hub-2026-11: небо, сборка эмблемы, шапка, меню на телефоне, форма-макет */
(function () {
  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Небо: спокойные звёзды, как на страницах направлений, но без параллакса
  const cv = document.getElementById('sky'), g = cv.getContext('2d');
  let W, H, D, stars = [];
  function build() {
    D = Math.min(1.5, devicePixelRatio || 1); W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * D); cv.height = Math.round(H * D);
    const n = Math.min(700, Math.round(W * H / 2600));
    stars = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, r: .4 + Math.random() * 1.2, a: .2 + Math.random() * .6, t: Math.random() * 6.3, s: .4 + Math.random() }));
  }
  function draw(t) {
    g.setTransform(D, 0, 0, D, 0, 0);
    g.fillStyle = '#03050b'; g.fillRect(0, 0, W, H);
    const gr = g.createRadialGradient(W * .5, H * .42, 0, W * .5, H * .42, Math.max(W, H) * .6);
    gr.addColorStop(0, 'rgba(40,90,190,.16)'); gr.addColorStop(1, 'rgba(40,90,190,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (const s of stars) {
      g.fillStyle = `rgba(200,222,255,${(s.a * (.75 + .25 * Math.sin(t * .001 * s.s + s.t))).toFixed(3)})`;
      g.fillRect(s.x, s.y, s.r, s.r);
    }
  }
  build(); draw(0);
  addEventListener('resize', () => { build(); draw(performance.now()); });
  if (!REDUCE) { let on = true; const loop = t => { if (on) draw(t); requestAnimationFrame(loop); }; requestAnimationFrame(loop); document.addEventListener('visibilitychange', () => { on = !document.hidden; }); }

  // Первый экран. Логотип собирается крупно по центру, как на боевом сайте. Потом знак уходит в круг
  // между направлениями, а спутники разлетаются по значкам двух списков: из логотипа собирается главная.
  // Пришли с другой страницы: логотип уже собран переходом (transit.js), сразу пересборка.
  const hero = document.querySelector('.hero'), duo = document.getElementById('duo'), holder = document.getElementById('duoEmblem');
  const targets = [...document.querySelectorAll('.duo [data-morph]')];
  let homeLogo = null;
  function settle(logo) {
    // знак остаётся жить в круге между направлениями
    holder.appendChild(logo.root);
    const fitCore = () => { const r = holder.getBoundingClientRect(); logo.fit({ left: 0, top: 0, width: r.width, height: r.height }, 'core'); };
    fitCore(); addEventListener('resize', fitCore);
    logo.orbit(true);
    homeLogo = logo;
  }
  function rebuild(logo) {
    // сначала логотип уходит в центр, круг под ним проявляется к его приходу, страница чуть позже
    duo.classList.add('on'); setTimeout(() => duo.classList.add('core-on'), 550); setTimeout(() => hero.classList.add('on'), 350);
    const r = holder.getBoundingClientRect();
    return Promise.all([
      logo.moveTo({ left: r.left, top: r.top, width: r.width, height: r.height }, 'core', 1000),
      new Promise(res => setTimeout(res, 120)).then(() => SarmatLogo.morph(logo, targets, { dur: 1150 }))
    ]).then(() => settle(logo));
  }
  function finishAll() { hero.classList.add('on'); duo.classList.add('on', 'core-on'); targets.forEach(t => t.classList.add('mo-in')); }
  window.SarmatPage = { arrive(logo, ov) { ov.clear(); rebuild(logo).then(() => ov.end()); } };
  if (!window.SarmatLogo || REDUCE) {
    finishAll();
    if (window.SarmatLogo) { const l = SarmatLogo.create(); l.mount(holder); l.set(1); const r = holder.getBoundingClientRect(); l.fit({ left: 0, top: 0, width: r.width, height: r.height }, 'core'); }
  } else if (!window.__trArrive) {
    const layer = document.createElement('div'); layer.className = 'sl-layer'; document.body.appendChild(layer);
    const logo = SarmatLogo.create(); logo.mount(layer);
    const hh = document.getElementById('hdr').offsetHeight;
    const s = Math.min((innerHeight - hh) * 0.8, innerWidth * 0.8, 600);
    logo.fit({ left: (innerWidth - s) / 2, top: hh + (innerHeight - hh - s) / 2, width: s, height: s }, 'full');
    logo.set(0);
    // любое действие посетителя досрочно заканчивает сборку
    const skip = () => { logo.skip = true; };
    ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(ev => addEventListener(ev, skip, { once: true, passive: true }));
    setTimeout(() => logo.play(3600).then(() => rebuild(logo)).then(() => layer.remove()), 300);
  }
  // запасной выход: что бы ни случилось, через 9 секунд всё видно
  setTimeout(() => { document.documentElement.classList.add('mo-off'); finishAll(); }, 9000);

  // Шапка
  const hdr = document.getElementById('hdr');
  const upd = () => hdr.classList.toggle('solid', scrollY > innerHeight * .55);
  addEventListener('scroll', upd, { passive: true }); upd();

  const burger = document.getElementById('burger'), nav = document.getElementById('nav');
  const close = () => { nav.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); };
  burger.addEventListener('click', () => { const o = nav.classList.toggle('open'); burger.setAttribute('aria-expanded', String(o)); });
  nav.addEventListener('click', e => { if (e.target.closest('a')) close(); });
  addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  // Блоки ниже первого экрана появляются один раз
  const els = document.querySelectorAll('.sec .h2, .ly, .how li, .work, .form');
  if ('IntersectionObserver' in window && !REDUCE) {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
    els.forEach(el => { el.classList.add('rv'); io.observe(el); });
  }

  // Кнопка с data-topic ведёт в заявку и сразу ставит нужный пункт
  document.querySelectorAll('a[data-topic]').forEach(a => a.addEventListener('click', () => {
    const r = document.querySelector(`input[name="topic"][value="${a.dataset.topic}"]`); if (r) r.checked = true;
  }));

  // Форма в макете не отправляет: только проверка полей
  const form = document.getElementById('reqForm'), msg = document.getElementById('reqMsg');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const phone = form.querySelector('#f-phone'), consent = form.querySelector('.check input');
    if (!phone.value.trim()) { msg.textContent = 'Укажите телефон.'; msg.hidden = false; phone.focus(); return; }
    if (!consent.checked) { msg.textContent = 'Без согласия заявку отправить нельзя.'; msg.hidden = false; return; }
    msg.textContent = 'Это макет: отсюда ничего не отправляется.'; msg.hidden = false;
  });
})();

/* Единая шапка (hub-2026-11): меню на телефоне. Ссылки и подсветку текущего раздела задаёт разметка */
(function () {
  const h = document.querySelector('.sh'); if (!h) return;
  const b = h.querySelector('.sh-burger'), nav = h.querySelector('.sh-nav'), root = document.documentElement;
  const set = on => { h.classList.toggle('sh-open', on); root.classList.toggle('sh-lock', on); b.setAttribute('aria-expanded', on ? 'true' : 'false'); };
  b.addEventListener('click', () => set(!h.classList.contains('sh-open')));
  nav.addEventListener('click', e => { if (e.target.closest('a')) set(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape') set(false); });
  addEventListener('resize', () => { if (innerWidth > 960) set(false); });

  // Главная кнопка страницы (та же, что в шапке) дублируется в меню и в нижнюю панель на телефоне
  const cta = h.querySelector('.sh-cta');
  if (cta) {
    const extra = h.querySelector('.sh-panel-extra');
    const mc = document.createElement('a'); mc.className = 'sh-panel-cta'; mc.href = cta.getAttribute('href'); mc.textContent = cta.textContent; extra.appendChild(mc);
    const bar = document.createElement('div'); bar.className = 'sh-bar';
    bar.innerHTML = '<a class="sh-bar-call" href="tel:+74994606265"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>Позвонить</a>';
    const main = document.createElement('a'); main.className = 'sh-bar-main'; main.href = cta.getAttribute('href'); main.textContent = cta.textContent; bar.appendChild(main);
    document.body.appendChild(bar);
    const form = document.getElementById('request');
    let formIn = false;
    if (form && 'IntersectionObserver' in window) new IntersectionObserver(es => { formIn = es[0].isIntersecting; upd(); }, { threshold: .15 }).observe(form);
    const upd = () => { const on = scrollY > innerHeight * .6 && !formIn; bar.classList.toggle('on', on); root.classList.toggle('sh-bar-on', on && innerWidth <= 760); };
    addEventListener('scroll', upd, { passive: true }); addEventListener('resize', upd); upd();
  }
})();

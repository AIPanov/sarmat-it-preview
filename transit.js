/* Переходы между страницами через пересборку логотипа (макет hub-2026-11). Нужен sarmat-logo.js.
   Уход: клик по ссылке на другую страницу сайта -> экран темнеет, логотип собирается как на боевом сайте,
   под ним название раздела -> открывается страница.
   Приход: собранный логотип стоит на том же месте, фон уходит, и страница сама решает, во что он
   пересобирается (window.SarmatPage.arrive). Нет такой функции: логотип просто гаснет.
   Без анимации (prefers-reduced-motion) ссылки работают как обычно. */
(function () {
  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const KEY = 'sarmat-transit';
  const NAMES = [[/oborudovanie\/configurator\.html$/, 'Конфигуратор'], [/oborudovanie\/(index\.html)?$/, 'Оборудование под задачу'], [/solutions\.html$/, 'Цифровые решения'], [/privacy\.html$/, 'Документы'], [/(index\.html)?$/, 'Сармат-ИТ']];
  const nameOf = u => { for (const [re, n] of NAMES) if (re.test(u.pathname)) return n; return 'Сармат-ИТ'; };

  // Логотип перехода стоит там же, где собирается при загрузке страницы (SarmatLogo.stageBox)
  const box = () => SarmatLogo.stageBox();
  function overlay(label) {
    const o = document.createElement('div'); o.className = 'tr'; o.setAttribute('aria-hidden', 'true');
    const stage = document.createElement('div'); stage.className = 'tr-stage'; o.appendChild(stage);
    const cap = document.createElement('p'); cap.className = 'tr-cap'; cap.textContent = label; o.appendChild(cap);
    document.body.appendChild(o);
    const logo = SarmatLogo.create(); logo.mount(stage); logo.fit(box(), 'full');
    const b = box(); cap.style.top = (b.top + b.height + 14) + 'px';
    return { o, logo };
  }

  // Телефон: короткий переход 0,5 с, логотип уже собран, только затемнение и название раздела (мобильная ревизия 24.11.2026)
  const narrow = () => matchMedia('(max-width: 760px)').matches;
  function go(url) {
    const { o, logo } = overlay(nameOf(url));
    try { sessionStorage.setItem(KEY, nameOf(url)); } catch (e) {}
    if (narrow()) { logo.set(1); requestAnimationFrame(() => o.classList.add('tr-show', 'tr-named')); setTimeout(() => { location.href = url.href; }, 420); return; }
    logo.set(0);
    requestAnimationFrame(() => o.classList.add('tr-show'));
    logo.play(1500).then(() => { o.classList.add('tr-named'); setTimeout(() => { location.href = url.href; }, 260); });
  }

  if (!REDUCE) {
    document.addEventListener('click', e => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest && e.target.closest('a');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const href = a.getAttribute('href');
      if (!href || href[0] === '#' || /^(tel|mailto):/.test(href)) return;
      let url; try { url = new URL(href, location.href); } catch (err) { return; }
      if (url.protocol !== location.protocol || url.host !== location.host) return;
      if (url.pathname === location.pathname) return; // та же страница, якорь
      e.preventDefault(); e.stopPropagation();
      go(url);
    }, true);
  }

  function arrive() {
    let label = null; try { label = sessionStorage.getItem(KEY); sessionStorage.removeItem(KEY); } catch (e) {}
    const root = document.documentElement;
    if (!label || REDUCE) { root.classList.remove('tr-in'); return; }
    const { o, logo } = overlay(label);
    logo.set(1);
    o.classList.add('tr-show', 'tr-now', 'tr-named');
    root.classList.remove('tr-in');
    const clear = () => { o.classList.add('tr-clear'); };
    const end = () => { o.classList.add('tr-leave'); setTimeout(() => o.remove(), 700); };
    const P = window.SarmatPage;
    if (narrow()) { setTimeout(() => { clear(); end(); }, 60); }
    else if (P && P.arrive) { requestAnimationFrame(() => P.arrive(logo, { clear, end, overlay: o })); }
    else { setTimeout(() => { clear(); end(); }, 150); }
  }
  if (document.readyState === 'complete') arrive(); else addEventListener('DOMContentLoaded', arrive);
  addEventListener('pageshow', e => { if (e.persisted) document.querySelectorAll('.tr').forEach(n => n.remove()); });
})();

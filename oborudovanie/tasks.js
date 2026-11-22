/* Макет hub-2026-11: переключатель «Выберите задачу» на странице оборудования.
   Вкладка открывает свою панель со сборками. Ссылки и спутники на #catalog, #turnkey, #video, #net, #workplaces
   сначала открывают нужную вкладку, потом страница едет к ней (обработчик в фазе захвата, до main.js). */
(function () {
  const tabs = [...document.querySelectorAll('.tk-tab')];
  if (!tabs.length) return;
  const ids = tabs.map(t => t.getAttribute('aria-controls'));
  function open(id, focus) {
    if (!ids.includes(id)) return false;
    tabs.forEach(t => {
      const on = t.getAttribute('aria-controls') === id;
      t.setAttribute('aria-selected', on ? 'true' : 'false'); t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
      if (on && focus) t.focus();
      // на телефоне вкладки листаются вбок: выбранную показываем целиком
      if (on) { const row = t.parentElement; row.scrollLeft = t.offsetLeft - (row.clientWidth - t.offsetWidth) / 2; }
    });
    // Сцена в открытой панели перерисовывается под новый размер
    dispatchEvent(new Event('resize'));
    return true;
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => open(ids[i]));
    t.addEventListener('keydown', e => {
      const k = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (k === undefined) return;
      e.preventDefault(); open(ids[(k + tabs.length) % tabs.length], true);
    });
  });
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a');
    const h = a && a.getAttribute('href');
    if (h && h[0] === '#' && ids.includes(h.slice(1))) open(h.slice(1));
  }, true);
  // Пришли по ссылке на вид задачи: показываем ряд вкладок, а под ним открытую панель
  const toTabs = () => document.querySelector('.tk-tabs').scrollIntoView({ block: 'start' });
  const fromHash = () => { const id = location.hash.slice(1); if (open(id)) { requestAnimationFrame(toTabs); setTimeout(toTabs, 700); } };
  addEventListener('hashchange', fromHash);
  if (location.hash) fromHash();
  // Кнопка «Отправить ТЗ» внутри вкладки подставляет вид задачи в поле «что нужно»
  document.querySelectorAll('.tk-panel a[data-pos]').forEach(a => a.addEventListener('click', () => {
    const f = document.getElementById('f-msg'); if (f && !f.value) f.value = a.dataset.pos + ': ';
  }));
})();

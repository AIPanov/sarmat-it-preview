'use strict';
// Уведомление о cookie и Яндекс Метрике на всех страницах. Метрика работает сразу, баннер только сообщает
// (решение Антона 09.10.2026). Показывается, пока посетитель не нажмёт «Понятно»; отметка хранится в браузере.
// Пока баннер на экране, его высота лежит в --cookie-h: по ней на телефоне поднимается кнопка «Вопрос сотруднику».
(function () {
  var KEY = 'sarmat-cookie-notice';
  var box = document.getElementById('cookieNote');
  if (!box) return;
  try { if (localStorage.getItem(KEY)) return; } catch (e) { /* без хранилища баннер покажется снова, это не мешает */ }
  var root = document.documentElement;
  var fit = function () { root.style.setProperty('--cookie-h', box.offsetHeight + 'px'); };
  box.hidden = false;
  root.classList.add('cookie-open');
  fit();
  addEventListener('resize', fit);
  box.querySelector('button').addEventListener('click', function () {
    try { localStorage.setItem(KEY, new Date().toISOString().slice(0, 10)); } catch (e) { /* см. выше */ }
    box.hidden = true;
    root.classList.remove('cookie-open');
    removeEventListener('resize', fit);
  });
})();

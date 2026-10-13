'use strict';

/* Конфигуратор: собирает вводные заказчика и отправляет их письмом (kind=lead, как обычная заявка).
   Железо здесь не подбирается и не показывается: модели, совместимость и цены считаем мы после заявки.
   Единственный расчёт на странице - прикидка объёма видеоархива по цифрам, которые ввёл сам заказчик. */
(function () {
  const f = document.getElementById('confForm');
  if (!f) return;
  const SEND_URL = 'api/send.php';
  const FILE_MAX = 10 * 1024 * 1024, FILE_EXT = /\.(docx?|xlsx?|pdf)$/i;
  const FILE_TYPE_BAD = 'Подойдёт Word, Excel или PDF.';
  const FILE_SIZE_BAD = 'Файл больше 10 МБ.';
  const PHONE_BAD = 'Проверьте номер. Пример: +7 999 123‑45‑67.';
  const EMAIL_BAD = 'Проверьте адрес. Пример: name@company.ru.';
  const $ = id => document.getElementById(id);

  // Правила те же, что в main.js и api/send.php.
  function phoneProblem(v) {
    v = v.trim();
    if (!v) return 'Укажите телефон.';
    const d = v.replace(/\D/g, '');
    const ok = /^\+?[\d\s().-]+$/.test(v) && (v[0] === '+'
      ? (d[0] === '7' ? d.length === 11 : d.length >= 10 && d.length <= 15)
      : d.length === 10 || (d.length === 11 && /^[78]/.test(d)));
    return ok ? '' : PHONE_BAD;
  }
  function emailProblem(v) {
    v = v.trim();
    if (!v) return 'Укажите e-mail.';
    return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(v) ? '' : EMAIL_BAD;
  }
  function fileProblem(input) {
    const file = input.files && input.files[0];
    if (!file) return '';
    if (!FILE_EXT.test(file.name)) return FILE_TYPE_BAD;
    if (file.size > FILE_MAX) return FILE_SIZE_BAD;
    return '';
  }
  function fieldMsg(input, el, msg) {
    el.textContent = msg || el.textContent;
    el.hidden = !msg;
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    return !!msg;
  }
  function liveCheck(input, el, problem) {
    input.addEventListener('blur', () => fieldMsg(input, el, problem(input.value)));
    input.addEventListener('input', () => { if (!el.hidden && !problem(input.value)) fieldMsg(input, el, ''); });
  }

  /* ---------- шаги, которые зависят от выбранных задач ---------- */
  const tasks = [...f.querySelectorAll('input[name="task"]')];
  const whens = [...f.querySelectorAll('.conf-when')];
  function keys() { return new Set(tasks.filter(t => t.checked).map(t => t.dataset.k)); }
  function syncWhen() {
    const k = keys();
    whens.forEach(w => { w.hidden = !w.dataset.when.split(' ').some(x => k.has(x)); });
  }

  /* ---------- сводка ---------- */
  const sum = $('confSum'), est = $('confEst'), sumField = $('c-sum-field'), posField = $('c-pos-field');
  const val = id => { const el = $(id); return el ? String(el.value || '').trim() : ''; };
  const num = id => { const v = parseFloat(val(id)); return isFinite(v) && v > 0 ? v : 0; };
  // 1 камера, 2 камеры, 5 камер
  const plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return n + ' ' + (a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many); };

  function rows() {
    const out = [];
    const picked = tasks.filter(t => t.checked).map(t => t.value);
    const other = val('c-other');
    if (picked.length) out.push(['Задачи', picked.join(', ') + (other ? ' (' + other + ')' : '')]);
    const scale = [];
    if (num('c-users')) scale.push(plural(num('c-users'), 'пользователь', 'пользователя', 'пользователей'));
    if (num('c-vm')) scale.push(num('c-vm') + ' ВМ');
    if (num('c-cams')) scale.push(plural(num('c-cams'), 'камера', 'камеры', 'камер'));
    if (num('c-days')) scale.push('архив ' + plural(num('c-days'), 'день', 'дня', 'дней'));
    if (num('c-data')) scale.push(num('c-data') + ' ТБ данных');
    if (num('c-grow')) scale.push('+' + num('c-grow') + ' ТБ в год');
    if (scale.length) out.push(['Масштаб', scale.join(', ')]);
    if (val('c-count')) out.push(['Серверов', val('c-count')]);
    if (val('c-fail')) out.push(['Простой', val('c-fail')]);
    const place = ['c-rack', 'c-form', 'c-power', 'c-cool'].map(val).filter(Boolean);
    if (place.length) out.push(['Площадка', place.join(', ')]);
    if (val('c-mount')) out.push(['Монтаж и настройка', val('c-mount')]);
    if (val('c-city')) out.push(['Город или объект', val('c-city')]);
    const req = [];
    if (num('c-cores')) req.push(plural(num('c-cores'), 'ядро', 'ядра', 'ядер'));
    if (num('c-ram')) req.push(num('c-ram') + ' ГБ ОЗУ');
    if (num('c-disk')) req.push(num('c-disk') + ' ТБ дисков');
    if (val('c-disktype')) req.push(val('c-disktype'));
    if (val('c-net')) req.push(val('c-net'));
    if (val('c-os')) req.push(val('c-os'));
    if (req.length) out.push(['Требования заказчика', req.join(', ')]);
    if (val('c-have')) out.push(['Уже есть', val('c-have')]);
    if (val('c-when')) out.push(['Срок', val('c-when')]);
    if (val('c-msg')) out.push(['Комментарий', val('c-msg')]);
    return out;
  }

  // Прикидка видеоархива: камеры x поток x дни при круглосуточной записи. Цифры вводит заказчик.
  function archive() {
    const cams = num('c-cams'), days = num('c-days'), br = num('c-bitrate');
    if (!cams || !days || !br) return 0;
    return cams * br * 86400 * days / 8 / 1e6; // ТБ
  }

  function render() {
    const list = rows();
    const box = sum.closest('.conf-sum');
    if (box) box.classList.toggle('empty', !list.length); // на телефоне пустую сводку не показываем
    sum.innerHTML = '';
    if (!list.length) {
      const d = document.createElement('div');
      d.className = 'conf-sum-empty';
      d.innerHTML = '<dd>Пока пусто. Отметьте задачи выше.</dd>';
      sum.appendChild(d);
    } else {
      for (const [k, v] of list) {
        const wrap = document.createElement('div');
        const dt = document.createElement('dt'); dt.textContent = k;
        const dd = document.createElement('dd'); dd.textContent = v;
        wrap.appendChild(dt); wrap.appendChild(dd); sum.appendChild(wrap);
      }
    }
    const tb = archive();
    est.hidden = !tb;
    if (tb) est.textContent = 'Видеоархив, оценка по вашим цифрам: около ' + (tb < 10 ? tb.toFixed(1) : Math.round(tb)) + ' ТБ при круглосуточной записи. Точный объём считаем при подборе, с запасом.';

    const picked = tasks.filter(t => t.checked).map(t => t.value);
    posField.value = ('Конфигуратор: ' + (picked.join(', ') || 'задача не выбрана')).slice(0, 200);
    const text = list.map(([k, v]) => k + ': ' + v).join('\n');
    sumField.value = (text + (tb ? '\nВидеоархив, оценка по вводным: около ' + Math.round(tb) + ' ТБ' : '')).slice(0, 4000);
  }

  f.addEventListener('input', () => { syncWhen(); render(); });
  f.addEventListener('change', () => { syncWhen(); render(); });
  syncWhen(); render();

  /* ---------- отправка ---------- */
  const phone = $('c-phone'), phoneErr = $('c-phone-err');
  const email = $('c-email'), emailErr = $('c-email-err');
  const file = $('c-file'), fileErr = $('c-file-err');
  const consent = $('c-consent'), consentErr = $('c-consent-err'), consentWrap = consent.closest('.field-check');
  const ok = $('c-ok'), err = $('c-err'), btn = f.querySelector('button[type="submit"]');
  liveCheck(phone, phoneErr, phoneProblem);
  liveCheck(email, emailErr, emailProblem);
  const showFile = msg => { fileErr.textContent = msg; fileErr.hidden = !msg; file.setAttribute('aria-invalid', msg ? 'true' : 'false'); };
  const showConsent = bad => { consentErr.hidden = !bad; if (bad) consentWrap.setAttribute('data-invalid', 'true'); else consentWrap.removeAttribute('data-invalid'); };
  file.addEventListener('change', () => { const m = fileProblem(file); showFile(m); if (m) file.value = ''; });
  consent.addEventListener('change', () => { if (consent.checked) showConsent(false); });

  f.addEventListener('submit', e => {
    e.preventDefault();
    ok.hidden = true; err.hidden = true;
    render();
    const fm = fileProblem(file);
    const bad = [
      fieldMsg(phone, phoneErr, phoneProblem(phone.value)) && phone,
      fieldMsg(email, emailErr, emailProblem(email.value)) && email,
      (showFile(fm), fm && file),
      (showConsent(!consent.checked), !consent.checked && consent)
    ].filter(Boolean);
    if (bad.length) { bad[0].focus(); return; }
    btn.disabled = true;
    const fd = new FormData(f);
    fd.set('kind', 'lead');
    fd.set('page', location.href);
    fetch(SEND_URL, { method: 'POST', body: fd, headers: { 'Accept': 'application/json' } })
      .then(r => r.json().catch(() => ({})).then(j => { if (!r.ok || !j.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j; }))
      .then(() => { f.reset(); syncWhen(); render(); showConsent(false); showFile(''); ok.hidden = false; ok.focus(); })
      .catch(e2 => {
        const m = e2.message;
        if (m === 'phone') { fieldMsg(phone, phoneErr, PHONE_BAD); phone.focus(); }
        else if (m === 'email') { fieldMsg(email, emailErr, EMAIL_BAD); email.focus(); }
        else if (m === 'file_type' || m === 'file_size') { showFile(m === 'file_size' ? FILE_SIZE_BAD : FILE_TYPE_BAD); file.focus(); }
        else if (m === 'consent') { showConsent(true); consent.focus(); }
        else err.hidden = false;
      })
      .finally(() => { btn.disabled = false; });
  });
})();

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
  // Превью на GitHub Pages: PHP там нет, письмо не уйдёт.
  if (/\.github\.io$/.test(location.hostname)) {
    const e = $('c-err');
    if (e) e.textContent = 'Это превью сайта: заявка отсюда не отправляется. На рабочем сайте письмо уходит в Сармат-ИТ.';
  }

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
    whens.forEach(w => {
      const on = w.dataset.when.split(' ').some(x => k.has(x));
      if (!on && !w.hidden) w.querySelectorAll('input, select, textarea').forEach(el => {
        if (el.type === 'checkbox' || el.type === 'radio') el.checked = false;
        else el.value = el.defaultValue; // поле с ориентиром возвращается к значению по умолчанию
      });
      w.hidden = !on;
    });
  }

  /* ---------- сводка ---------- */
  const sum = $('confSum'), est = $('confEst'), sumField = $('c-sum-field'), posField = $('c-pos-field');
  const val = id => { const el = $(id); return el ? String(el.value || '').trim() : ''; };
  const num = id => { const v = parseFloat(val(id)); return isFinite(v) && v > 0 ? v : 0; };
  // 1 камера, 2 камеры, 5 камер
  const plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return n + ' ' + (a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many); };
  // объём везде в ГБ, от тысячи добавляем ТБ в скобках, чтобы не путаться
  const round1 = n => (n < 10 ? Math.round(n * 10) / 10 : Math.round(n));
  const ru = n => String(round1(n)).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  // в середине фразы строчная буква, но аббревиатуры (NAS, CAD, SMB) не трогаем
  const low = v => (/^[A-ZА-Я]{2,}/.test(v) ? v : v.charAt(0).toLowerCase() + v.slice(1));
  function gb(n) {
    if (!n) return '';
    const t = n / 1000;
    return ru(n) + ' ГБ' + (n >= 1000 ? ' (' + ru(t) + ' ТБ)' : '');
  }

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
    if (num('c-data')) scale.push(gb(num('c-data')) + ' данных');
    if (num('c-grow')) scale.push('+' + gb(num('c-grow')) + ' в год');
    const years = num('c-years');
    if (years) scale.push('срок ' + plural(years, 'год', 'года', 'лет'));
    if (scale.length) out.push(['Масштаб', scale.join(', ')]);
    // прирост за срок службы считаем по цифрам заказчика, чтобы объём дисков брали с запасом
    if (num('c-data') && num('c-grow') && years) {
      out.push(['Данных к концу срока', gb(num('c-data') + num('c-grow') * years) + ', без запаса']);
    }
    const virt = [];
    if (val('c-hyper')) virt.push('гипервизор ' + val('c-hyper'));
    if (virt.length) out.push(['Виртуализация', virt.join(', ')]);
    const s1c = [];
    if (num('c-u1c')) s1c.push(plural(num('c-u1c'), 'пользователь', 'пользователя', 'пользователей'));
    if (val('c-m1c')) s1c.push(low(val('c-m1c')) + ' режим');
    if (val('c-db1c')) s1c.push('СУБД ' + val('c-db1c'));
    if (s1c.length) out.push(['1С', s1c.join(', ')]);
    const db = [];
    if (val('c-dbms')) db.push(val('c-dbms'));
    if (num('c-dbsize')) db.push('база сейчас ' + gb(num('c-dbsize')));
    if (db.length) out.push(['Базы данных', db.join(', ')]);
    if (val('c-share')) out.push(['Доступ к файлам', val('c-share')]);
    const rdp = [];
    if (num('c-sess')) rdp.push(plural(num('c-sess'), 'сессия', 'сессии', 'сессий'));
    if (val('c-heavy')) rdp.push(val('c-heavy'));
    if (rdp.length) out.push(['Удалённые места', rdp.join(', ')]);
    const ai = [];
    if (val('c-aimode')) ai.push(low(val('c-aimode')));
    if (val('c-gpu')) ai.push('видеокарты: ' + low(val('c-gpu')));
    if (val('c-model')) ai.push(val('c-model'));
    if (ai.length) out.push(['Машинное обучение', ai.join(', ')]);
    const vid = [];
    if (val('c-res')) vid.push(val('c-res'));
    if (val('c-rec')) vid.push('запись ' + low(val('c-rec')));
    if (val('c-vms')) vid.push('программа видеонаблюдения: ' + low(val('c-vms')));
    if (vid.length) out.push(['Видеонаблюдение', vid.join(', ')]);
    const bk = [];
    if (num('c-keep')) bk.push('хранить ' + plural(num('c-keep'), 'день', 'дня', 'дней'));
    if (val('c-bplace')) bk.push('основное место: ' + low(val('c-bplace')));
    if (val('c-bplace2')) bk.push('вторая копия: ' + low(val('c-bplace2')));
    if (bk.length) out.push(['Резервные копии', bk.join(', ')]);
    const web = [];
    if (num('c-svc')) web.push(num('c-svc') + ' шт.');
    if (num('c-webdata')) web.push('данных и баз ' + gb(num('c-webdata')));
    if (web.length) out.push(['Веб-сервисы', web.join(', ')]);
    if (val('c-count')) out.push(['Серверов', val('c-count')]);
    if (val('c-fail')) out.push(['Простой', val('c-fail')]);
    const place = [];
    if (val('c-rack')) place.push('стойка 19 дюймов: ' + val('c-rack'));
    if (val('c-form')) place.push('исполнение: ' + val('c-form'));
    if (val('c-power')) place.push('питание: ' + val('c-power'));
    if (val('c-cool')) place.push('охлаждение: ' + val('c-cool'));
    if (place.length) out.push(['Площадка', place.join(', ')]);
    if (val('c-mount')) out.push(['Монтаж и настройка', val('c-mount')]);
    if (val('c-city')) out.push(['Город или объект', val('c-city')]);
    const req = [];
    if (num('c-cores')) req.push(plural(num('c-cores'), 'ядро', 'ядра', 'ядер'));
    if (num('c-ram')) req.push(num('c-ram') + ' ГБ ОЗУ');
    if (num('c-disk')) req.push(gb(num('c-disk')) + ' дисков');
    if (val('c-disktype')) req.push(val('c-disktype'));
    if (val('c-diskbus')) req.push('интерфейс ' + val('c-diskbus'));
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
    return cams * br * 86400 * days / 8 / 1000; // ГБ
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
    const arc = archive();
    est.hidden = !arc;
    if (arc) {
      const motion = /движению|Смешанно/i.test(val('c-rec'));
      est.textContent = 'Видеоархив, оценка по вашим цифрам: около ' + gb(arc) + ' при круглосуточной записи.'
        + (motion ? ' При записи по движению выйдет меньше, насколько, зависит от объекта.' : '')
        + ' Точный объём считаем при подборе, с запасом.';
    }

    const picked = tasks.filter(t => t.checked).map(t => t.value);
    posField.value = ('Конфигуратор: ' + (picked.join(', ') || 'задача не выбрана')).slice(0, 200);
    const text = list.map(([k, v]) => k + ': ' + v).join('\n');
    sumField.value = (text + (arc ? '\nВидеоархив, оценка по вводным: около ' + gb(arc) : '')).slice(0, 4000);
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

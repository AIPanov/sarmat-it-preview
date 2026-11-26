'use strict';
/* «Вопрос сотруднику» на главной (Антон 25.11.2026): тот же чат, что на «Цифровых решениях», почта не обязательна,
   хватает телефона или почты. Код взят из main.js без изменений логики. */
(function () {
if (!document.getElementById('asst')) return;
const PREVIEW = /\.github\.io$/.test(location.hostname);
if (PREVIEW) { const el = document.getElementById('asstErr'); if (el) el.textContent = 'Это превью сайта: отсюда ничего не отправляется. На рабочем сайте письмо уходит в Сармат-ИТ.'; }
const SEND_URL = 'api/send.php';
function send(kind, form) {
  const fd = new FormData(form);
  fd.set('kind', kind);
  fd.set('page', location.href);
  return fetch(SEND_URL, { method: 'POST', body: fd, headers: { 'Accept': 'application/json' } })
    .then(r => r.json().catch(() => ({})).then(j => { if (!r.ok || !j.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j; }));
}
const PHONE_BAD = 'Проверьте номер. Пример:\u00a0+7\u00a0999\u00a0123\u201145\u201167.';
const EMAIL_BAD = 'Проверьте адрес. Пример:\u00a0name@company.ru.';
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
  if (!v) return 'Укажите почту.'; // почта обязательна во всех формах (Антон, 25.11.2026)
  return v.length <= 254 && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/.test(v) ? '' : EMAIL_BAD;
}
// Показать или убрать ошибку под полем. Возвращает true, если ошибка есть.
function fieldMsg(input, el, msg) {
  el.textContent = msg || el.textContent; el.hidden = !msg;
  input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  return !!msg;
}
// Проверка поля, когда из него ушли (если что-то введено), и снятие ошибки, как только значение стало верным.
function liveCheck(input, el, problem) {
  input.addEventListener('blur', () => { if (input.value.trim()) fieldMsg(input, el, problem(input.value)); });
  input.addEventListener('input', () => { if (input.getAttribute('aria-invalid') === 'true' && !problem(input.value)) fieldMsg(input, el, ''); });
}
/* ============ 4. Assistant: shows after the first screen ============ */
(function () {
  const a = document.getElementById('asst'), panel = document.getElementById('asstPanel'), bubble = document.getElementById('asstBubble');
  const fab = document.getElementById('asstFab'), form = document.getElementById('asstForm'), q = document.getElementById('asstQ'), done = document.getElementById('asstDone');
  const open = () => { panel.hidden = false; bubble.hidden = true; a.classList.add('open'); fab.setAttribute('aria-expanded', 'true'); (form.hidden ? done : q).focus(); };
  const close = () => { panel.hidden = true; a.classList.remove('open'); fab.setAttribute('aria-expanded', 'false'); fab.focus(); };
  done.tabIndex = -1;
  const narrow = matchMedia('(max-width: 860px)');
  let bubbleTimer = 0;
  new IntersectionObserver(es => es.forEach(e => {
    const on = !e.isIntersecting && e.boundingClientRect.top < 0;
    a.classList.toggle('on', on);
    // On phones the bubble covers half the screen width, so it is a short invitation, not a permanent overlay.
    if (on && narrow.matches && !bubbleTimer) bubbleTimer = setTimeout(() => { bubble.hidden = true; }, 6000);
  })).observe(document.getElementById('firstScreenEnd'));
  new IntersectionObserver(es => es.forEach(e => a.classList.toggle('at-form', e.isIntersecting)), { threshold: .2 }).observe(document.getElementById('request'));
  new IntersectionObserver(es => es.forEach(e => a.classList.toggle('in-hero', e.isIntersecting))).observe(document.querySelector('.hero'));
  const inGal = new Set();
  const galIO = new IntersectionObserver(es => { es.forEach(e => e.isIntersecting ? inGal.add(e.target) : inGal.delete(e.target)); a.classList.toggle('in-gal', inGal.size > 0); }, { rootMargin: '-20% 0px -20% 0px' });
  document.querySelectorAll('.gal-view, .deck').forEach(g => galIO.observe(g)); // phones: the button would cover the arrows
  bubble.addEventListener('click', open);
  fab.addEventListener('click', () => panel.hidden ? open() : close());
  document.getElementById('asstClose').addEventListener('click', close);
  addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) close(); });
  const contact = document.getElementById('asstContact'), contactErr = document.getElementById('asstContactErr'), qErr = document.getElementById('asstQErr');
  const consent = document.getElementById('asstConsent'), consentErr = document.getElementById('asstConsentErr'), aErr = document.getElementById('asstErr');
  // Почта, если есть @, иначе телефон.
  const contactProblem = v => !v.trim() ? 'Укажите телефон или почту, иначе мы не сможем ответить.'
    : /@/.test(v) ? emailProblem(v) : (phoneProblem(v) && 'Проверьте телефон или адрес почты.');
  const qProblem = v => v.trim() ? '' : 'Напишите вопрос.';
  liveCheck(contact, contactErr, contactProblem);
  q.addEventListener('input', () => { if (!qProblem(q.value)) fieldMsg(q, qErr, ''); });
  const showConsent = bad => { consentErr.hidden = !bad; if (bad) consent.closest('.check').setAttribute('data-invalid', 'true'); else consent.closest('.check').removeAttribute('data-invalid'); };
  consent.addEventListener('change', () => { if (consent.checked) showConsent(false); });
  form.addEventListener('submit', e => {
    e.preventDefault();
    aErr.hidden = true;
    const bad = [
      fieldMsg(q, qErr, qProblem(q.value)) && q,
      fieldMsg(contact, contactErr, contactProblem(contact.value)) && contact,
      (showConsent(!consent.checked), !consent.checked && consent),
    ].filter(Boolean);
    if (bad.length) { bad[0].focus(); return; }
    const btn = form.querySelector('button[type="submit"]'); btn.disabled = true;
    send('question', form)
      .then(() => { form.hidden = true; done.hidden = false; done.focus(); })
      .catch(e => {
        btn.disabled = false;
        if (e.message === 'contact') { fieldMsg(contact, contactErr, 'Проверьте телефон или адрес почты.'); contact.focus(); }
        else if (e.message === 'question') { fieldMsg(q, qErr, qProblem('')); q.focus(); }
        else aErr.hidden = false;
      });
  });
})();

})();

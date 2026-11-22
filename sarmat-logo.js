/* Логотип Сармат-ИТ: сборка как на боевом sarmat-it.ru (main.js, «1. Hero»), вынесена в отдельный модуль.
   SarmatLogo.create() -> объект логотипа: set(p) рисует сборку в долях 0..1, play(ms) проигрывает её,
   fit(box, mode) вписывает в прямоугольник экрана. SarmatLogo.morph() разводит спутники логотипа
   по значкам следующей картинки: логотип «пересобирается» в страницу.
   Геометрия, тайминги и буквы взяты один в один с боевого сайта. */
(function () {
  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const lerp = (a, b, t) => a + (b - a) * t;
  const eIO = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const eOut = t => 1 - Math.pow(1 - t, 3);
  const eBack = t => { const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, parent) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; };
  const OX = 190, OY = 270;
  // Рамки для вписывания: весь логотип со словами и только знак (треугольник с кругом)
  // core: квадрат с центром в центре глобуса (495, 580), в него входит треугольник при любом повороте
  const BOX = { full: { x: 205, y: 296, w: 582, h: 640 }, mark: { x: 214, y: 296, w: 562, h: 488 }, core: { x: 181, y: 266, w: 628, h: 628 } };

  const ICON = {
    dish: '<path d="M5 8a10 10 0 0 0 11 11z"/><path d="M10.5 13.5 16 8"/><circle cx="17" cy="7" r="1.6"/><path d="M8 17l-2 4h7"/>',
    wifi: '<path d="M3 9.5a13 13 0 0 1 18 0"/><path d="M6 13a8.5 8.5 0 0 1 12 0"/><path d="M9 16.5a4 4 0 0 1 6 0"/><circle cx="12" cy="19.6" r="1"/>',
    server: '<rect x="4" y="4" width="16" height="5" rx="1"/><rect x="4" y="10" width="16" height="5" rx="1"/><rect x="4" y="16" width="16" height="4" rx="1"/><path d="M7 6.5h1M7 12.5h1M7 18h1"/>',
    camera: '<path d="M3 8l12-3.5 2 6L5 14z"/><path d="M17 9l4 .5v4l-4-1"/><path d="M8 13.5l1 4H5v3"/>',
    network: '<circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M12 7v5M12 12l-5.5 5.5M12 12l5.5 5.5"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    cable: '<path d="M9 3v4M15 3v4"/><path d="M6 7h12v4a6 6 0 0 1-12 0z"/><path d="M12 17v4"/>'
  };
  const ICON_POS = [['dish', -125, 142], ['wifi', -78, 140], ['server', -30, 138], ['camera', 22, 140], ['network', 76, 142], ['phone', 128, 140], ['cable', -178, 138]];
  const IR = 25;
  const DOTS = [[480, 457.5, 10], [560, 488, 9], [355.5, 508.5, 10], [656.5, 563.5, 10], [380.5, 627.5, 10], [585, 682.5, 10], [471, 696, 10]];
  let uid = 0;

  function create() {
    const id = 'sl' + (++uid);
    const root = document.createElement('div'); root.className = 'sl';
    const back = document.createElement('div'); back.className = 'sl-3d sl-back'; root.appendChild(back);
    const svg = el('svg', { class: 'sl-svg', viewBox: `${OX} ${OY} 620 690`, 'aria-hidden': 'true', focusable: 'false' }); root.appendChild(svg);
    svg.innerHTML = `<defs>
      <radialGradient id="${id}Disc" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#0a1630"/><stop offset=".75" stop-color="#060b18"/><stop offset="1" stop-color="#04070f"/></radialGradient>
      <radialGradient id="${id}Globe" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#1f5d9c"/><stop offset=".55" stop-color="#0b2d58"/><stop offset="1" stop-color="#051428"/></radialGradient>
      <radialGradient id="${id}Glow" cx="50%" cy="50%" r="50%"><stop offset=".35" stop-color="rgba(95,176,232,.38)"/><stop offset="1" stop-color="rgba(95,176,232,0)"/></radialGradient>
      <clipPath id="${id}Clip"><circle cx="495" cy="580" r="99"/></clipPath>
      <filter id="${id}Soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>`;
    const over = document.createElement('div'); over.className = 'sl-over'; root.appendChild(over);
    const front = document.createElement('div'); front.className = 'sl-3d sl-front'; root.appendChild(front);

    const gFx = el('g', {}, svg);
    const gMark = el('g', {}, gFx);
    const triA = { fill: 'none', stroke: '#e8eef7', 'stroke-width': 9.5, 'stroke-linejoin': 'miter', 'stroke-miterlimit': 8 };
    // треугольник с рунами в своей группе: в круге на главной он медленно идёт по кругу (orbit)
    const gSpin = el('g', {}, gMark);
    const tri = el('path', Object.assign({ d: 'M495 301 L771 713 L219 713 Z' }, triA), gSpin);
    const halves = ['M495 301 L771 713 L495 713', 'M495 301 L219 713 L495 713'].map(d => el('path', Object.assign({ d }, triA), gSpin));
    const halfLen = 771.9; // 495.9 + 276
    halves.forEach(h => { h.style.strokeDasharray = halfLen; });
    const runePts = [[11.6, -24.7], [-10.9, -7.2], [11.6, 7.2], [-11.5, 24.7]];
    const runes = [[490.3, 347.2], [283.7, 676.4], [703.4, 676.2]].map(([x, y]) => {
      const gg = el('g', { 'data-x': x, 'data-y': y }, gSpin);
      el('polyline', { points: runePts.map(p => p.join(',')).join(' '), fill: 'none', stroke: '#e8eef7', 'stroke-width': 4.2, 'stroke-linecap': 'round' }, gg);
      return gg;
    });
    const disc = el('circle', { cx: 495, cy: 580, r: 199, fill: `url(#${id}Disc)` }, gMark);
    const ring = el('circle', { cx: 495, cy: 580, r: 195, fill: 'none', stroke: '#e8eef7', 'stroke-width': 8, transform: 'rotate(-90 495 580)', filter: `url(#${id}Soft)` }, gMark);
    const ringLen = 2 * Math.PI * 195; ring.style.strokeDasharray = ringLen;
    const dash = el('circle', { cx: 495, cy: 580, r: 177, fill: 'none', stroke: '#e8eef7', 'stroke-width': 5, 'stroke-dasharray': '21 11.3', opacity: .85 }, gMark);
    const linesG = el('g', { stroke: 'rgba(95,176,232,.5)', 'stroke-width': 1.6, 'stroke-linecap': 'round' }, gFx);
    const dotsG = el('g', { fill: '#8fd0ff', filter: `url(#${id}Soft)` }, gFx);
    const glowG = el('g', {}, svg);
    el('circle', { class: 'sl-glow', cx: 495, cy: 580, r: 150, fill: `url(#${id}Glow)` }, glowG);
    const globeG = el('g', {}, svg);
    el('circle', { cx: 495, cy: 580, r: 99, fill: `url(#${id}Globe)` }, globeG);
    const grid = el('g', { 'clip-path': `url(#${id}Clip)`, fill: 'none', stroke: 'rgba(143,208,255,.34)', 'stroke-width': 1.1 }, globeG);
    [-60, -30, 0, 30, 60].forEach(lat => { const a = lat * Math.PI / 180, rx = 99 * Math.cos(a); el('ellipse', { cx: 495, cy: 580 + 99 * Math.sin(a), rx, ry: rx * .16 }, grid); });
    const mers = Array.from({ length: 6 }, () => el('ellipse', { cx: 495, cy: 580, rx: 50, ry: 99 }, grid));
    el('circle', { cx: 495, cy: 580, r: 99, fill: 'none', stroke: 'rgba(143,208,255,.7)', 'stroke-width': 1.6 }, globeG);
    el('path', { d: 'M420 540 A99 99 0 0 1 520 484', fill: 'none', stroke: 'rgba(255,255,255,.35)', 'stroke-width': 2.5, 'stroke-linecap': 'round' }, globeG);
    const iconsG = el('g', {}, svg);

    const all = ICON_POS.map(([k, deg, d]) => ({ kind: 'icon', key: k, x: 495 + Math.cos(deg * Math.PI / 180) * d, y: 580 + Math.sin(deg * Math.PI / 180) * d, r: IR }))
      .concat(DOTS.map(([x, y, r]) => ({ kind: 'dot', x, y, r: r * .7 })));
    all.forEach(s => { s.a = Math.atan2(s.y - 580, s.x - 495); s.d = Math.hypot(s.x - 495, s.y - 580); });
    all.sort((a, b) => ((a.a + 2.2 + 6.283) % 6.283) - ((b.a + 2.2 + 6.283) % 6.283));
    const sats = all.map((s, i) => {
      s.t0 = 0.06 + i * 0.022; s.t1 = s.t0 + 0.2;
      s.a0 = s.a - Math.PI * (1.25 + (i % 3) * 0.18); s.d0 = 430 + (i % 4) * 40; s.spin0 = (i % 2 ? -1 : 1) * (540 + i * 20);
      const x1 = 495 + Math.cos(s.a) * 104, y1 = 580 + Math.sin(s.a) * 104;
      const x2 = 495 + Math.cos(s.a) * (s.d - s.r - 1), y2 = 580 + Math.sin(s.a) * (s.d - s.r - 1);
      s.line = el('line', { x1, y1, x2, y2 }, linesG); s.len = Math.max(1, Math.hypot(x2 - x1, y2 - y1)); s.line.style.strokeDasharray = s.len;
      if (s.kind === 'dot') s.node = el('circle', { cx: 0, cy: 0, r: s.r }, dotsG);
      else {
        s.node = el('g', {}, iconsG);
        el('circle', { r: IR, fill: '#081226', stroke: 'rgba(143,208,255,.55)', 'stroke-width': 1.5 }, s.node);
        const ig = el('g', { transform: `scale(${(IR * 1.2 / 24).toFixed(3)}) translate(-12 -12)`, fill: 'none', stroke: '#e8eef7', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, s.node);
        ig.innerHTML = ICON[s.key];
      }
      return s;
    });

    // Слова: САРМАТ-ИТ буквами по цилиндру, линия, SARMAT-IT
    const WORD1 = 'САРМАТ-ИТ', WORD2 = 'SARMAT-IT';
    const W1 = { cx: 495 - OX, cy: 820 - OY, width: 570 }, W2 = { cx: 494 - OX, cy: 905 - OY, width: 516 };
    const rule = document.createElement('div'); rule.className = 'sl-rule';
    Object.assign(rule.style, { left: 208 - OX + 'px', top: 853.5 - OY + 'px', width: '575px', height: '6px' }); over.appendChild(rule);
    const line2 = document.createElement('div'); line2.className = 'sl-line2'; line2.textContent = WORD2; over.appendChild(line2);
    let letters = [], fs1 = 90;
    function measure(text, width) {
      const m = document.createElement('div'); m.className = 'sl-ch'; m.style.cssText = 'position:absolute;visibility:hidden;font-size:100px';
      const spans = [...text].map(c => { const s = document.createElement('span'); s.textContent = c; m.appendChild(s); return s; });
      root.appendChild(m);
      const total = m.offsetWidth, fs = 100 * width / total, k = fs / 100;
      const res = spans.map(s => ({ c: s.textContent, w: s.offsetWidth * k, dx: (s.offsetLeft + s.offsetWidth / 2 - total / 2) * k }));
      m.remove(); return { fs, res };
    }
    function buildWords() {
      if (!root.isConnected) return;
      back.innerHTML = ''; front.innerHTML = '';
      const m1 = measure(WORD1, W1.width); fs1 = m1.fs;
      letters = m1.res.map(o => {
        const mk = layer => { const d = document.createElement('div'); d.className = 'sl-ch'; d.textContent = o.c; d.style.fontSize = fs1 + 'px'; d.style.width = o.w + 'px'; d.style.textAlign = 'center'; layer.appendChild(d); return d; };
        return Object.assign(o, { f: mk(front), b: mk(back) });
      });
      const m2 = measure(WORD2, W2.width); line2.style.fontSize = m2.fs + 'px';
      line2.style.left = W2.cx + 'px'; line2.style.top = W2.cy - m2.fs / 2 + 'px';
      if (!obj.frozen) set(cur);
    }

    let cur = 0;
    function set(p) {
      cur = p = clamp(p);
      const gp = eOut(seg(p, 0, 0.1)), gs = lerp(.72, 1, gp);
      globeG.setAttribute('transform', `translate(495 580) scale(${gs}) translate(-495 -580)`);
      globeG.style.opacity = lerp(.35, 1, gp);
      for (const st of sats) {
        if (st.gone) continue;
        const t = seg(p, st.t0, st.t1), e = eOut(t), ea = eIO(t);
        const a = lerp(st.a0, st.a, ea), dd = lerp(st.d0, st.d, e);
        const x = 495 + Math.cos(a) * dd, y = 580 + Math.sin(a) * dd;
        const spin = st.spin0 * (1 - e), sc = lerp(.45, 1, eBack(t)), op = seg(t, 0, .12);
        st.node.setAttribute('transform', st.kind === 'dot' ? `translate(${x} ${y}) scale(${sc})` : `translate(${x} ${y}) rotate(${spin}) scale(${sc})`);
        st.node.style.opacity = op;
        st.line.style.strokeDashoffset = st.len * (1 - eOut(seg(p, st.t1 - 0.03, st.t1 + 0.05)));
      }
      disc.style.opacity = eOut(seg(p, 0.3, 0.46));
      const rc = eIO(seg(p, 0.42, 0.56));
      ring.style.strokeDashoffset = ringLen * (1 - rc); ring.style.opacity = rc > 0.001 ? 1 : 0;
      const dc = seg(p, 0.47, 0.6);
      dash.style.opacity = .85 * eOut(dc);
      dash.setAttribute('transform', `rotate(${-150 * (1 - eOut(dc))} 495 580)`);
      const tc = eIO(seg(p, 0.56, 0.7));
      halves.forEach(h => { h.style.strokeDashoffset = halfLen * (1 - tc); h.style.opacity = tc > 0 && tc < 1 ? 1 : 0; });
      tri.style.opacity = tc >= 1 ? 1 : 0;
      runes.forEach((gg, i) => { const t = seg(p, 0.66 + i * 0.015, 0.72 + i * 0.015); gg.style.opacity = seg(t, 0, .3); gg.setAttribute('transform', `translate(${gg.dataset.x} ${gg.dataset.y}) scale(${lerp(.2, 1, eBack(t))}) rotate(${-spinDeg})`); });
      const q = seg(p, 0.68, 0.95);
      const phi = -3.3 * (1 - eOut(seg(q, 0, 0.72)));
      const f = eIO(seg(q, 0.32, 1));
      const k0 = 1 / 250, k = Math.max(k0 * (1 - f), 1e-6);
      const yc = lerp(580 - OY, W1.cy, eIO(seg(q, 0.3, 1)));
      const tilt = 0.3 * (1 - f), vis = seg(q, 0, 0.06);
      for (const L of letters) {
        const th = L.dx * k + phi;
        const x = Math.sin(th) / k, z = (Math.cos(th) - 1) / k, zr = z * (1 - f);
        const y = yc + (zr + 250 * (1 - f)) * tilt;
        const tr = `translate3d(${W1.cx + x - L.w / 2}px, ${y - fs1 / 2}px, ${zr}px) rotateY(${th * 180 / Math.PI}deg)`;
        const isFront = Math.cos(th) > 0;
        L.f.style.transform = tr; L.b.style.transform = tr;
        L.f.style.opacity = isFront ? vis : 0; L.b.style.opacity = isFront ? 0 : vis * 0.8;
      }
      rule.style.transform = `scaleX(${eIO(seg(p, 0.9, 0.97))})`;
      const l2 = eOut(seg(p, 0.93, 1));
      line2.style.opacity = l2; line2.style.letterSpacing = lerp(0.35, 0, l2) + 'em';
      line2.style.transform = `translate(-50%, ${lerp(18, 0, l2)}px)`;
    }

    // Глобус в знаке крутится всё время, пока логотип на экране
    let phase = 0, prevT = 0, raf = 0, spinDeg = 0, orbitOn = false;
    function spin(t) {
      const dt = prevT ? Math.min(64, t - prevT) : 0; prevT = t;
      if (!REDUCE) phase += dt * 0.00022;
      // треугольник идёт по кругу: оборот за 60 секунд, руны остаются прямыми
      if (orbitOn && !REDUCE) {
        spinDeg = (spinDeg + dt * 360 / 60000) % 360;
        gSpin.setAttribute('transform', `rotate(${spinDeg.toFixed(2)} 495 580)`);
        runes.forEach(gg => gg.setAttribute('transform', `translate(${gg.dataset.x} ${gg.dataset.y}) rotate(${(-spinDeg).toFixed(2)})`));
      }
      mers.forEach((m, i) => { const a = phase + i * Math.PI / 6; m.setAttribute('rx', (99 * Math.abs(Math.sin(a))).toFixed(1)); });
      raf = root.isConnected ? requestAnimationFrame(spin) : 0;
    }

    // Вписать в прямоугольник экрана (координаты относительно родителя логотипа)
    const pos = { k: 1, x: 0, y: 0 };
    function place(k, x, y) { pos.k = k; pos.x = x; pos.y = y; root.style.transform = `translate(${x}px, ${y}px) scale(${k})`; }
    function fitCalc(box, mode) {
      const b = BOX[mode || 'full'], k = Math.min(box.width / b.w, box.height / b.h);
      return { k, x: box.left + box.width / 2 - (b.x + b.w / 2 - OX) * k, y: box.top + box.height / 2 - (b.y + b.h / 2 - OY) * k };
    }
    function fit(box, mode) { const f = fitCalc(box, mode); place(f.k, f.x, f.y); }
    function moveTo(box, mode, ms) {
      const f = fitCalc(box, mode), s = { ...pos }, t0 = performance.now();
      return new Promise(res => {
        const step = t => { const e = eIO(clamp((t - t0) / ms)); place(lerp(s.k, f.k, e), lerp(s.x, f.x, e), lerp(s.y, f.y, e)); if (e < 1) requestAnimationFrame(step); else res(); };
        requestAnimationFrame(step);
      });
    }
    function mount(parent) {
      parent.appendChild(root); buildWords();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(buildWords);
      if (!raf) raf = requestAnimationFrame(spin);
    }
    function play(ms) {
      if (REDUCE) { set(1); return Promise.resolve(); }
      const t0 = performance.now(), from = cur;
      return new Promise(res => {
        const step = t => { if (obj.skip) { set(1); res(); return; } const p = lerp(from, 1, clamp((t - t0) / ms)); set(p); if (p < 1) requestAnimationFrame(step); else res(); };
        requestAnimationFrame(step);
      });
    }
    function glide(k, x, y, ms) {
      const s = { ...pos }, t0 = performance.now();
      return new Promise(res => {
        const step = t => { const e = eIO(clamp((t - t0) / ms)); place(lerp(s.k, k, e), lerp(s.x, x, e), lerp(s.y, y, e)); if (e < 1) requestAnimationFrame(step); else res(); };
        requestAnimationFrame(step);
      });
    }
    const orbit = on => { orbitOn = on; };
    const obj = { root, sats, set, play, fit, moveTo, glide, mount, orbit, pos, parts: { gMark, linesG, dotsG, glowG, globeG, words: [back, front, over] }, skip: false };
    return obj;
  }

  /* Пересборка: спутники логотипа летят на значки следующей картинки ([data-morph]), каждый по дуге,
     на лету превращается в значок цели. Остальное (знак, слова, точки) гаснет или остаётся, как скажут opts.
     Пары спутник-цель подбираются по расстоянию: левые спутники уходят на левые значки, правые на правые. */
  function morph(logo, targets, opts) {
    opts = opts || {}; logo.frozen = true;
    const dur = REDUCE ? 1 : (opts.dur || 1100);
    const pool = logo.sats.map(s => { const r = s.node.getBoundingClientRect(); return { s, x: r.left + r.width / 2, y: r.top + r.height / 2, d: Math.max(r.width, r.height) }; })
      .filter(o => o.d > 0);
    const tg = targets.map(t => { const r = t.getBoundingClientRect(); return { t, x: r.left + r.width / 2, y: r.top + r.height / 2, d: Math.max(r.width, r.height) }; });
    // сначала цели, до которых дальше всего: им достаются ближайшие спутники без конфликтов
    const pairs = [];
    tg.slice().sort((a, b) => a.y - b.y).forEach(t => {
      let best = null, bd = 1e9;
      for (const o of pool) { if (o.used) continue; const pen = o.s.kind === 'dot' ? 90 : 0; const d = Math.hypot(o.x - t.x, o.y - t.y) + pen; if (d < bd) { bd = d; best = o; } }
      if (best) { best.used = true; pairs.push([best, t]); }
    });
    const layer = opts.layer || document.body;
    const done = pairs.map(([o, t], i) => new Promise(res => {
      const f = document.createElement('div'); f.className = 'sl-fly';
      const size = t.d;
      f.style.width = f.style.height = size + 'px';
      const ico = o.s.kind === 'icon' ? `<svg viewBox="-30 -30 60 60" class="sl-fly-a"><circle r="25" fill="#081226" stroke="rgba(143,208,255,.55)" stroke-width="1.5"/><g transform="scale(1.25) translate(-12 -12)" fill="none" stroke="#e8eef7" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICON[o.s.key]}</g></svg>`
        : `<svg viewBox="-30 -30 60 60" class="sl-fly-a"><circle r="9" fill="#8fd0ff"/></svg>`;
      f.innerHTML = ico + `<div class="sl-fly-b">${t.t.innerHTML}</div>`;
      layer.appendChild(f);
      o.s.gone = true; o.s.node.style.opacity = 0; o.s.line.style.opacity = 0;
      const s0 = o.d / size, x0 = o.x - size / 2, y0 = o.y - size / 2, x1 = t.x - size / 2, y1 = t.y - size / 2;
      // дуга: середина пути смещена поперёк направления полёта
      const mx = (x0 + x1) / 2 - (y1 - y0) * 0.22, my = (y0 + y1) / 2 + (x1 - x0) * 0.22;
      const anim = f.animate([
        { transform: `translate(${x0}px, ${y0}px) scale(${s0}) rotate(0deg)` },
        { transform: `translate(${mx}px, ${my}px) scale(${(s0 + 1) / 2 * 1.15}) rotate(${i % 2 ? -160 : 160}deg)`, offset: .5 },
        { transform: `translate(${x1}px, ${y1}px) scale(1) rotate(0deg)` }
      ], { duration: dur, delay: REDUCE ? 0 : i * 55, easing: 'cubic-bezier(.45,.05,.25,1)', fill: 'forwards' });
      f.querySelector('.sl-fly-a').animate([{ opacity: 1 }, { opacity: 1, offset: .55 }, { opacity: 0 }], { duration: dur, delay: REDUCE ? 0 : i * 55, fill: 'forwards' });
      f.querySelector('.sl-fly-b').animate([{ opacity: 0 }, { opacity: 0, offset: .5 }, { opacity: 1 }], { duration: dur, delay: REDUCE ? 0 : i * 55, fill: 'forwards' });
      anim.onfinish = () => { t.t.classList.add('mo-in'); f.remove(); res(); };
    }));
    // точки и спутники без пары гаснут вместе с лучами
    logo.sats.forEach(s => { if (!s.gone) { s.node.style.transition = 'opacity .4s'; s.node.style.opacity = 0; s.gone = true; } s.line.style.transition = 'opacity .4s'; s.line.style.opacity = 0; });
    if (opts.fadeMark) [logo.parts.gMark, logo.parts.glowG, logo.parts.globeG].forEach(n => { n.style.transition = 'opacity .5s'; n.style.opacity = 0; });
    logo.parts.words.forEach(n => { n.style.transition = 'opacity .45s'; n.style.opacity = 0; });
    return Promise.all(done);
  }

  window.SarmatLogo = { create, morph, REDUCE };
})();

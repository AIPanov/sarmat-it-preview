'use strict';

/* ============ shared helpers ============ */
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (p, a, b) => clamp((p - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;
const eIO = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const eOut = t => 1 - Math.pow(1 - t, 3);
const eBack = t => { const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

/* One rAF loop for every scene. A task returning false is removed until someone adds it again. */
const ticker = (() => {
  const tasks = new Set(); let id = 0;
  const run = t => {
    id = 0;
    for (const fn of [...tasks]) if (fn(t) === false) tasks.delete(fn);
    if (tasks.size) id = requestAnimationFrame(run);
  };
  return {
    add(fn) { tasks.add(fn); if (!id) id = requestAnimationFrame(run); },
    remove(fn) { tasks.delete(fn); }
  };
})();

/* Hero visibility drives the starfield and the logo: both stop once the hero is off screen. */
const heroView = (() => {
  const subs = []; let on = true;
  new IntersectionObserver(es => {
    const v = es[es.length - 1].isIntersecting;
    if (v === on) return; on = v; subs.forEach(f => f(on));
  }).observe(document.getElementById('hero'));
  return { get on() { return on; }, sub(f) { subs.push(f); } };
})();

/* ============ Starfield (canvas 2D, parallax) ============ */
(function () {
  const cv = document.getElementById('sky'), g = cv.getContext('2d');
  const hero = document.getElementById('hero');
  let W = 0, H = 0, D = 1, stars = [], mx = 0, my = 0, tmx = 0, tmy = 0, lastT = 0;
  const LAYERS = [{ k: .025, n: .56, r: [.5, 1.0], a: [.22, .55] }, { k: .07, n: .31, r: [.8, 1.4], a: [.4, .8] }, { k: .16, n: .13, r: [1.1, 2.0], a: [.6, 1] }];
  const NEB = [{ x: .74, y: .30, r: .55, c: '40,90,190', a: .17 }, { x: .18, y: .72, r: .5, c: '90,60,170', a: .10 }, { x: .5, y: .5, r: .32, c: '30,140,190', a: .08 }];
  const rnd = ([a, b]) => a + Math.random() * (b - a);
  function build() {
    D = Math.min(1.5, devicePixelRatio || 1); W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * D); cv.height = Math.round(H * D);
    const total = Math.min(1100, Math.max(320, Math.round(W * H / 1700)));
    stars = [];
    LAYERS.forEach((L, li) => {
      const n = Math.round(total * L.n);
      for (let i = 0; i < n; i++) {
        const q = Math.random();
        stars.push({ x: Math.random() * W, y: Math.random() * H, l: li, k: L.k, r: rnd(L.r), a: rnd(L.a), tw: Math.random() * 6.28, ts: .4 + Math.random() * 1.4,
          c: q < .1 ? '255,214,170' : q < .4 ? '170,205,255' : '235,242,255' });
      }
    });
  }
  function draw(t) {
    if (REDUCE) t = 0;
    lastT = t;
    const sy = scrollY, hh = hero.offsetHeight;
    const fade = 1 - .55 * clamp(sy / Math.max(1, hh - H));
    mx += (tmx - mx) * .04; my += (tmy - my) * .04;
    g.setTransform(D, 0, 0, D, 0, 0);
    g.fillStyle = '#03050b'; g.fillRect(0, 0, W, H);
    const nf = 1 - .75 * clamp(sy / Math.max(1, hh));
    for (const n of NEB) {
      const x = n.x * W + mx * 24, y = n.y * H - sy * .04 + my * 24, r = n.r * Math.max(W, H);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(${n.c},${n.a * nf})`); gr.addColorStop(1, `rgba(${n.c},0)`);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
    for (const s of stars) {
      let x = s.x - mx * s.k * 140, y = s.y - sy * s.k - t * .01 * s.k - my * s.k * 90;
      x = ((x % W) + W) % W; y = ((y % H) + H) % H;
      const al = s.a * (.72 + .28 * Math.sin(t * .001 * s.ts + s.tw)) * fade;
      g.fillStyle = `rgba(${s.c},${al.toFixed(3)})`;
      if (s.l === 2) {
        g.beginPath(); g.arc(x, y, s.r * .75, 0, 6.283); g.fill();
        if (s.r > 1.7) { g.fillStyle = `rgba(${s.c},${(al * .18).toFixed(3)})`; g.beginPath(); g.arc(x, y, s.r * 2.6, 0, 6.283); g.fill(); }
      } else g.fillRect(x, y, s.r, s.r);
    }
  }
  const step = t => { draw(t); };
  function sync(on) {
    if (on && !REDUCE) ticker.add(step);
    else { ticker.remove(step); draw(lastT); }
  }
  if (!REDUCE) addEventListener('pointermove', e => { tmx = e.clientX / W - .5; tmy = e.clientY / H - .5; }, { passive: true });
  addEventListener('resize', () => { build(); if (REDUCE || !heroView.on) draw(lastT); });
  build(); draw(0);
  heroView.sub(sync); sync(heroView.on);
})();

/* ============ Header state ============ */
(function () {
  const hdr = document.getElementById('hdr'), hero = document.getElementById('hero');
  let solid = null;
  const upd = () => {
    const s = scrollY > hero.offsetHeight - innerHeight * 1.05;
    if (s !== solid) { solid = s; hdr.classList.toggle('solid', s); }
  };
  addEventListener('scroll', upd, { passive: true }); addEventListener('resize', upd); upd();
})();

/* ============ 1. Logo assembly ============ */
(function () {
  const R = document.getElementById('hero');
  const logo = R.querySelector('.si-logo'), stage = R.querySelector('.si-stage'), track = R.querySelector('.si-track');
  const hint = R.querySelector('.si-hint'), bar = R.querySelector('.si-bar'), line = R.querySelector('.hero-line');
  const OX = 190, OY = 270, GY = 580 - OY;
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, parent) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; };

  const back = document.createElement('div'); back.className = 'si-3d si-back'; logo.appendChild(back);
  const svg = el('svg', { class: 'si-svg', viewBox: `${OX} ${OY} 620 690` }); logo.appendChild(svg);
  svg.innerHTML = `<defs>
    <radialGradient id="siDisc" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#0a1630"/><stop offset=".75" stop-color="#060b18"/><stop offset="1" stop-color="#04070f"/></radialGradient>
    <radialGradient id="siGlobe" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#1f5d9c"/><stop offset=".55" stop-color="#0b2d58"/><stop offset="1" stop-color="#051428"/></radialGradient>
    <radialGradient id="siGlow" cx="50%" cy="50%" r="50%"><stop offset=".35" stop-color="rgba(95,176,232,.38)"/><stop offset="1" stop-color="rgba(95,176,232,0)"/></radialGradient>
    <clipPath id="siClip"><circle cx="495" cy="580" r="99"/></clipPath>
    <filter id="siSoft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>`;
  const over = document.createElement('div'); over.style.cssText = 'width:620px;height:690px'; logo.appendChild(over);
  const front = document.createElement('div'); front.className = 'si-3d si-front'; logo.appendChild(front);

  const triA = { fill: 'none', stroke: 'var(--si-ink)', 'stroke-width': 9.5, 'stroke-linejoin': 'miter', 'stroke-miterlimit': 8 };
  const tri = el('path', Object.assign({ d: 'M495 301 L771 713 L219 713 Z' }, triA), svg);
  const halves = ['M495 301 L771 713 L495 713', 'M495 301 L219 713 L495 713'].map(d => el('path', Object.assign({ d }, triA), svg));
  const halfLen = halves[0].getTotalLength();
  halves.forEach(h => { h.style.strokeDasharray = halfLen; });
  const runePts = [[11.6, -24.7], [-10.9, -7.2], [11.6, 7.2], [-11.5, 24.7]];
  const runes = [[490.3, 347.2], [283.7, 676.4], [703.4, 676.2]].map(([x, y]) => {
    const gg = el('g', { 'data-x': x, 'data-y': y }, svg);
    el('polyline', { points: runePts.map(p => p.join(',')).join(' '), fill: 'none', stroke: 'var(--si-ink)', 'stroke-width': 4.2, 'stroke-linecap': 'round' }, gg);
    return gg;
  });
  const disc = el('circle', { cx: 495, cy: 580, r: 199, fill: 'url(#siDisc)' }, svg);
  const ring = el('circle', { cx: 495, cy: 580, r: 195, fill: 'none', stroke: 'var(--si-ink)', 'stroke-width': 8, transform: 'rotate(-90 495 580)', filter: 'url(#siSoft)' }, svg);
  const ringLen = 2 * Math.PI * 195; ring.style.strokeDasharray = ringLen;
  const dash = el('circle', { cx: 495, cy: 580, r: 177, fill: 'none', stroke: 'var(--si-ink)', 'stroke-width': 5, 'stroke-dasharray': '21 11.3', opacity: .85 }, svg);
  const linesG = el('g', { stroke: 'var(--si-line)', 'stroke-width': 1.6, 'stroke-linecap': 'round' }, svg);
  const dotsG = el('g', { fill: 'var(--si-dot)', filter: 'url(#siSoft)' }, svg);

  el('circle', { class: 'si-glow', cx: 495, cy: 580, r: 150, fill: 'url(#siGlow)' }, svg);
  const globeG = el('g', {}, svg);
  el('circle', { cx: 495, cy: 580, r: 99, fill: 'url(#siGlobe)' }, globeG);
  const grid = el('g', { 'clip-path': 'url(#siClip)', fill: 'none', stroke: 'rgba(143,208,255,.34)', 'stroke-width': 1.1 }, globeG);
  [-60, -30, 0, 30, 60].forEach(lat => { const a = lat * Math.PI / 180, rx = 99 * Math.cos(a); el('ellipse', { cx: 495, cy: 580 + 99 * Math.sin(a), rx, ry: rx * .16 }, grid); });
  const mers = Array.from({ length: 6 }, () => el('ellipse', { cx: 495, cy: 580, rx: 50, ry: 99 }, grid));
  el('circle', { cx: 495, cy: 580, r: 99, fill: 'none', stroke: 'rgba(143,208,255,.7)', 'stroke-width': 1.6 }, globeG);
  el('path', { d: 'M420 540 A99 99 0 0 1 520 484', fill: 'none', stroke: 'rgba(255,255,255,.35)', 'stroke-width': 2.5, 'stroke-linecap': 'round' }, globeG);
  const iconsG = el('g', {}, svg);

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

  const WORD1 = 'САРМАТ-ИТ', WORD2 = 'SARMAT-IT';
  const W1 = { cx: 495 - OX, cy: 820 - OY, width: 570 }, W2 = { cx: 494 - OX, cy: 905 - OY, width: 516 };
  const rule = document.createElement('div'); rule.className = 'si-rule';
  Object.assign(rule.style, { left: 208 - OX + 'px', top: 853.5 - OY + 'px', width: '575px', height: '6px' }); over.appendChild(rule);
  const line2 = document.createElement('div'); line2.className = 'si-line2'; line2.textContent = WORD2; over.appendChild(line2);
  let letters = [], fs1 = 90;
  function measure(text, width) {
    const m = document.createElement('div'); m.className = 'si-ch'; m.style.cssText = 'position:absolute;visibility:hidden;font-size:100px';
    const spans = [...text].map(c => { const s = document.createElement('span'); s.textContent = c; m.appendChild(s); return s; });
    logo.appendChild(m);
    const total = m.offsetWidth, fs = 100 * width / total, k = fs / 100;
    const res = spans.map(s => ({ c: s.textContent, w: s.offsetWidth * k, dx: (s.offsetLeft + s.offsetWidth / 2 - total / 2) * k }));
    m.remove(); return { fs, res };
  }
  function buildWords() {
    back.innerHTML = ''; front.innerHTML = '';
    const m1 = measure(WORD1, W1.width); fs1 = m1.fs;
    letters = m1.res.map(o => {
      const mk = layer => { const d = document.createElement('div'); d.className = 'si-ch'; d.textContent = o.c; d.style.fontSize = fs1 + 'px'; d.style.width = o.w + 'px'; d.style.textAlign = 'center'; layer.appendChild(d); return d; };
      return Object.assign(o, { f: mk(front), b: mk(back) });
    });
    const m2 = measure(WORD2, W2.width); line2.style.fontSize = m2.fs + 'px';
    line2.style.left = W2.cx + 'px'; line2.style.top = W2.cy - m2.fs / 2 + 'px';
    render(true);
  }
  function fit() {
    const W = stage.clientWidth, H = stage.clientHeight;
    const s = Math.min(W / 680, H * 0.72 / 740);
    logo.style.transform = `translate(-50%, -50%) scale(${s})`;
  }

  let cur = 0, last = -1;
  function progress() {
    if (REDUCE) return 1;
    const r = track.getBoundingClientRect();
    return clamp((0 - r.top) / Math.max(1, r.height - innerHeight) / 0.85);
  }
  function render(force) {
    const p = cur;
    if (!force && Math.abs(p - last) < 1e-4) return; last = p;
    bar.style.transform = `scaleX(${p})`;
    hint.style.opacity = 1 - seg(p, 0.01, 0.06);
    const gp = eOut(seg(p, 0, 0.1)), gs = lerp(.72, 1, gp);
    globeG.setAttribute('transform', `translate(495 580) scale(${gs}) translate(-495 -580)`);
    globeG.style.opacity = lerp(.35, 1, gp);
    for (const s of sats) {
      const t = seg(p, s.t0, s.t1), e = eOut(t), ea = eIO(t);
      const a = lerp(s.a0, s.a, ea), d = lerp(s.d0, s.d, e);
      const x = 495 + Math.cos(a) * d, y = 580 + Math.sin(a) * d;
      const spin = s.spin0 * (1 - e), sc = lerp(.45, 1, eBack(t)), op = seg(t, 0, .12);
      s.node.setAttribute('transform', s.kind === 'dot' ? `translate(${x} ${y}) scale(${sc})` : `translate(${x} ${y}) rotate(${spin}) scale(${sc})`);
      s.node.style.opacity = op;
      s.line.style.strokeDashoffset = s.len * (1 - eOut(seg(p, s.t1 - 0.03, s.t1 + 0.05)));
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
    runes.forEach((gg, i) => { const t = seg(p, 0.66 + i * 0.015, 0.72 + i * 0.015); gg.style.opacity = seg(t, 0, .3); gg.setAttribute('transform', `translate(${gg.dataset.x} ${gg.dataset.y}) scale(${lerp(.2, 1, eBack(t))})`); });
    const q = seg(p, 0.68, 0.95);
    const phi = -3.3 * (1 - eOut(seg(q, 0, 0.72)));
    const f = eIO(seg(q, 0.32, 1));
    const k0 = 1 / 250, k = Math.max(k0 * (1 - f), 1e-6);
    const yc = lerp(GY, W1.cy, eIO(seg(q, 0.3, 1)));
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
    const hl = eOut(seg(p, 0.9, 1));
    line.style.opacity = hl; line.style.transform = `translateY(${lerp(14, 0, hl)}px)`;
  }
  function spinGlobe(t) {
    const ph = REDUCE ? 0 : t * 0.00022;
    mers.forEach((m, i) => { const a = ph + i * Math.PI / 6; m.setAttribute('rx', (99 * Math.abs(Math.sin(a))).toFixed(1)); });
  }
  function tick(t) {
    const target = progress();
    cur = Math.abs(target - cur) < 1e-4 ? target : lerp(cur, target, 0.14);
    render(false);
    spinGlobe(t);
  }
  fit(); addEventListener('resize', fit); new ResizeObserver(fit).observe(stage);
  if (REDUCE) { cur = 1; hint.style.display = 'none'; }
  buildWords();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(buildWords);
  spinGlobe(0);
  if (!REDUCE) {
    const sync = on => on ? ticker.add(tick) : ticker.remove(tick);
    heroView.sub(sync); sync(heroView.on);
  }
})();

/* ============ 2. Process: draw once in view ============ */
(function () {
  const s = document.getElementById('steps4');
  new IntersectionObserver((es, io) => { es.forEach(e => { if (e.isIntersecting) { s.classList.add('in'); io.disconnect(); } }); }, { threshold: .35 }).observe(s);
})();

/* ============ 3a. Server 3D assembly inside card 1 ============ */
(function () {
  const card = document.getElementById('card1'), spacer = document.getElementById('spacer1');
  const cv = card.querySelector('canvas'), ctx = cv.getContext('2d');
  const V = { add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; } };
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  function euler(rx, ry, rz) {
    const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
    const Rz = [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]], Rx = [[1, 0, 0], [0, cx, -sx], [0, sx, cx]], Ry = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]];
    const m = (A, B) => A.map(r => [0, 1, 2].map(j => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
    return m(Ry, m(Rx, Rz));
  }
  const ap = (M, p) => [M[0][0] * p[0] + M[0][1] * p[1] + M[0][2] * p[2], M[1][0] * p[0] + M[1][1] * p[1] + M[1][2] * p[2], M[2][0] * p[0] + M[2][1] * p[1] + M[2][2] * p[2]];
  const parts = {};
  function part(name, center) { return (parts[name] = { name, c: center, faces: [], pos: center.slice(), rot: [0, 0, 0], alpha: 1 }); }
  function box(P, w, h, d, x, y, z, color, o = {}) {
    const hw = w / 2, hh = h / 2, hd = d / 2, c = [x - P.c[0], y - P.c[1], z - P.c[2]];
    const F = { top: [[0, hh, 0], [hw, 0, 0], [0, 0, hd], [0, 1, 0]], bottom: [[0, -hh, 0], [hw, 0, 0], [0, 0, -hd], [0, -1, 0]],
      front: [[0, 0, hd], [hw, 0, 0], [0, -hh, 0], [0, 0, 1]], back: [[0, 0, -hd], [-hw, 0, 0], [0, -hh, 0], [0, 0, -1]],
      right: [[hw, 0, 0], [0, 0, -hd], [0, -hh, 0], [1, 0, 0]], left: [[-hw, 0, 0], [0, 0, hd], [0, -hh, 0], [-1, 0, 0]] };
    const col = hex(color), max = o.tile || 0.42;
    for (const k in F) {
      if (o.skip && o.skip.includes(k)) continue;
      const [fc, u, v, n] = F[k];
      const lu = 2 * Math.hypot(...u), lv = 2 * Math.hypot(...v);
      const nu = Math.max(1, Math.ceil(lu / max)), nv = Math.max(1, Math.ceil(lv / max));
      const tx = o.tex && o.tex[k], fcol = (o.colors && o.colors[k]) ? hex(o.colors[k]) : col;
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
        const a0 = -1 + 2 * i / nu, a1 = -1 + 2 * (i + 1) / nu, b0 = -1 + 2 * j / nv, b1 = -1 + 2 * (j + 1) / nv;
        const pt = (a, b) => V.add(V.add(V.add(c, fc), V.mul(u, a)), V.mul(v, b));
        const face = { pts: [pt(a0, b0), pt(a1, b0), pt(a1, b1), pt(a0, b1)], n, col: fcol, key: o.key, bias: o.bias || 0 };
        if (tx) face.tex = { img: tx, uv: [i / nu, j / nv, (i + 1) / nu, (j + 1) / nv] };
        P.faces.push(face);
      }
    }
  }
  function tex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; }
  const T = {};
  T.pcb = tex(620, 760, (g, w, h) => {
    g.fillStyle = '#0d2f55'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(120,170,220,.22)'; g.lineWidth = 2;
    for (let i = 0; i < 70; i++) { const x = (i * 97) % w, y = (i * 53) % h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + ((i % 3) - 1) * 80, y + 60); g.lineTo(x + ((i % 3) - 1) * 80, y + 140); g.stroke(); }
    g.fillStyle = 'rgba(210,225,240,.55)'; g.font = '600 18px monospace'; g.fillText('C252  SERVER BOARD', 36, h - 40); g.fillText('LGA1200', 60, 250);
    g.strokeStyle = 'rgba(210,225,240,.4)'; g.lineWidth = 3; g.strokeRect(40, 150, 150, 150);
    g.fillStyle = '#c7a24a'; for (let k = 0; k < 10; k++) { g.beginPath(); g.arc(20 + k * 64, 20, 6, 0, 7); g.fill(); g.beginPath(); g.arc(20 + k * 64, h - 20, 6, 0, 7); g.fill(); }
  });
  T.pins = tex(128, 128, (g, w, h) => { g.fillStyle = '#2a2a2a'; g.fillRect(0, 0, w, h); g.fillStyle = '#c9a24c'; for (let x = 6; x < w; x += 7) for (let y = 6; y < h; y += 7) g.fillRect(x, y, 2.5, 2.5); });
  T.cpu = tex(300, 300, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#e9ecef'); gr.addColorStop(1, '#b9bfc6'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2b3036'; g.font = '700 30px Arial, sans-serif'; g.fillText('XEON', 34, 110); g.font = '700 42px Arial, sans-serif'; g.fillText('E-2314', 34, 160);
    g.font = '500 20px monospace'; g.fillText('2.80 GHz  4C/4T', 34, 200); g.fillText('LGA1200', 34, 230);
  });
  T.dimm = tex(520, 120, (g, w, h) => {
    g.fillStyle = '#18503a'; g.fillRect(0, 0, w, h); g.fillStyle = '#c9a24c'; g.fillRect(0, h - 14, w, 14);
    g.fillStyle = '#16181b'; for (let i = 0; i < 9; i++) g.fillRect(14 + i * 56, 18, 42, 50);
    g.fillStyle = '#e9eef3'; g.fillRect(150, 74, 220, 26); g.fillStyle = '#16181b'; g.font = '600 16px monospace'; g.fillText('16GB DDR4 ECC', 160, 93);
  });
  T.hdd = tex(300, 440, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#c9cfd6'); gr.addColorStop(1, '#aab2bb'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#17202b'; g.fillRect(24, 120, w - 48, 200);
    g.fillStyle = '#fff'; g.font = '700 46px Arial, sans-serif'; g.fillText('2 TB', 44, 190); g.font = '500 20px monospace'; g.fillStyle = '#9fc3e6'; g.fillText('3.5" SATA 7200', 44, 230); g.fillText('ENTERPRISE HDD', 44, 262);
    g.fillStyle = '#5fb0e8'; g.fillRect(44, 288, 120, 6);
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 3; g.beginPath(); g.arc(w / 2, 60, 30, 0, 7); g.stroke();
  });
  T.ssd = tex(280, 400, (g, w, h) => {
    g.fillStyle = '#1b1f25'; g.fillRect(0, 0, w, h); g.fillStyle = '#117ca7'; g.fillRect(0, 150, w, 10);
    g.fillStyle = '#fff'; g.font = '700 44px Arial, sans-serif'; g.fillText('SSD', 30, 230); g.font = '700 36px Arial, sans-serif'; g.fillText('480 GB', 30, 280);
    g.font = '500 18px monospace'; g.fillStyle = '#9fc3e6'; g.fillText('2.5" SATA  DC', 30, 316);
  });
  const caddy = accent => tex(300, 120, (g, w, h) => {
    g.fillStyle = '#2c323a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1a1e24'; for (let x = 16; x < 200; x += 14) for (let y = 16; y < h - 16; y += 14) { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
    g.fillStyle = '#3d444e'; g.fillRect(212, 14, 72, h - 28); g.fillStyle = accent; g.fillRect(222, 24, 6, h - 48);
  });
  T.caddyHdd = caddy('#8fa3b8'); T.caddySsd = caddy('#117ca7');
  T.blank = tex(300, 120, (g, w, h) => { g.fillStyle = '#2c323a'; g.fillRect(0, 0, w, h); g.fillStyle = '#23282e'; for (let x = 20; x < w - 20; x += 22) g.fillRect(x, 20, 10, h - 40); });
  T.fan = tex(200, 200, (g) => {
    g.fillStyle = '#1d2126'; g.fillRect(0, 0, 200, 200); g.fillStyle = '#0f1215'; g.beginPath(); g.arc(100, 100, 88, 0, 7); g.fill();
    g.strokeStyle = '#3a414a'; g.lineWidth = 12; for (let i = 0; i < 7; i++) { const a = i * Math.PI * 2 / 7; g.beginPath(); g.arc(100, 100, 55, a, a + .7); g.stroke(); }
    g.fillStyle = '#3a414a'; g.beginPath(); g.arc(100, 100, 26, 0, 7); g.fill();
  });
  T.psu = tex(300, 600, (g, w) => { g.fillStyle = '#737c86'; g.fillRect(0, 0, w, 600); g.fillStyle = '#5d656e'; for (let y = 20; y < 260; y += 16) g.fillRect(20, y, w - 40, 7); g.fillStyle = '#e9eef3'; g.fillRect(40, 330, 220, 120); g.fillStyle = '#2b3036'; g.font = '600 26px monospace'; g.fillText('PSU', 60, 380); });
  const drawSticker = (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = '#043168'; g.fillRect(0, 0, 14, h); g.fillStyle = '#0a0a0a'; g.font = '400 46px Tinos, "Times New Roman", serif'; g.fillText('САРМАТ-ИТ', 36, 70); g.fillStyle = '#56657a'; g.font = '500 22px monospace'; g.fillText('1С SERVER  E-2314  32GB', 36, 118); };
  T.sticker = tex(400, 160, drawSticker);
  T.ear = tex(80, 200, (g) => { g.fillStyle = '#23282e'; g.fillRect(0, 0, 80, 200); g.fillStyle = '#15181c'; g.beginPath(); g.arc(40, 40, 12, 0, 7); g.fill(); g.beginPath(); g.arc(40, 160, 12, 0, 7); g.fill(); });

  const CH = part('chassis', [0, 0, 0]);
  const MET = '#9ea7b1', MET2 = '#b4bcc5';
  box(CH, 4.4, 0.03, 6.2, 0, 0.015, 0, MET, { tile: 0.5, bias: 1.5 });
  box(CH, 0.03, 0.42, 6.2, -2.185, 0.24, 0, MET2, { tile: 0.5 });
  box(CH, 0.03, 0.42, 6.2, 2.185, 0.24, 0, MET2, { tile: 0.5 });
  box(CH, 4.34, 0.42, 0.03, 0, 0.24, -3.085, '#8d96a0', { tile: 0.5 });
  box(CH, 4.3, 0.38, 0.04, 0, 0.22, 1.56, '#14402e', { tile: 0.5 });
  [-1.05, 0, 1.05].forEach(x => box(CH, 0.02, 0.4, 1.46, x, 0.23, 2.33, '#7e8791'));
  box(CH, 1.02, 0.4, 0.05, 1.575, 0.23, 3.075, '#2c323a', { tex: { front: T.blank } });
  box(CH, 0.16, 0.44, 0.06, -2.28, 0.22, 3.08, '#23282e', { tex: { front: T.ear } });
  box(CH, 0.16, 0.44, 0.06, 2.28, 0.22, 3.08, '#23282e', { tex: { front: T.ear } });
  box(CH, 0.06, 0.06, 0.02, 2.28, 0.33, 3.115, '#3a414a', { key: 'pwrLed' });
  [-1.72, -0.86, 0, 0.86, 1.72].forEach(x => box(CH, 0.82, 0.4, 0.28, x, 0.22, 1.2, '#1d2126', { tex: { front: T.fan, back: T.fan } }));
  box(CH, 1.05, 0.4, 2.15, 1.63, 0.22, -1.98, '#737c86', { tex: { top: T.psu } });
  const B = part('board', [-0.6, 0.085, -1.0]);
  box(B, 3.1, 0.03, 3.8, -0.6, 0.085, -1.0, '#0d2f55', { tex: { top: T.pcb }, tile: 0.36, bias: 0.6 });
  box(B, 0.62, 0.05, 0.62, -1.0, 0.125, -1.2, '#c3c9cf', { skip: ['bottom'] });
  box(B, 0.44, 0.012, 0.44, -1.0, 0.156, -1.2, '#2a2a2a', { tex: { top: T.pins }, skip: ['bottom'] });
  box(B, 0.04, 0.04, 0.5, -0.66, 0.14, -1.2, '#c3c9cf', { skip: ['bottom'] });
  [-0.1, 0.05, 0.2, 0.35].forEach((x, i) => {
    box(B, 0.07, 0.08, 1.4, x, 0.14, -1.2, i % 2 ? '#1a1c20' : '#243a66', { skip: ['bottom'] });
    box(B, 0.07, 0.1, 0.05, x, 0.15, -1.92, '#e7ebef', { skip: ['bottom'] }); box(B, 0.07, 0.1, 0.05, x, 0.15, -0.48, '#e7ebef', { skip: ['bottom'] });
  });
  box(B, 0.38, 0.12, 0.38, -1.4, 0.16, 0.25, '#5f6770', { skip: ['bottom'] });
  for (let i = 0; i < 6; i++) box(B, 0.07, 0.1, 0.07, -1.45 + i * 0.1, 0.15, -1.62, '#23262b', { skip: ['bottom'] });
  for (let i = 0; i < 5; i++) box(B, 0.07, 0.1, 0.07, -1.45, 0.15, -1.52 + i * 0.1, '#23262b', { skip: ['bottom'] });
  box(B, 0.2, 0.15, 0.22, -1.9, 0.17, -2.75, '#c3c9cf'); box(B, 0.2, 0.15, 0.22, -1.62, 0.17, -2.75, '#c3c9cf'); box(B, 0.34, 0.12, 0.14, -1.15, 0.16, -2.8, '#2e56a6');
  [-0.3, -0.1, 0.1].forEach(x => box(B, 0.1, 0.06, 0.16, x, 0.13, 0.7, '#1a1c20', { skip: ['bottom'] }));
  const C = part('cpu', [-1.0, 0.18, -1.2]);
  box(C, 0.375, 0.02, 0.375, -1.0, 0.172, -1.2, '#1e5a3c');
  box(C, 0.3, 0.03, 0.3, -1.0, 0.197, -1.2, '#d3d8dd', { tex: { top: T.cpu } });
  const K = part('cooler', [-1.0, 0.33, -1.2]);
  box(K, 0.64, 0.05, 0.64, -1.0, 0.237, -1.2, '#b87333');
  for (let i = 0; i < 13; i++) box(K, 0.018, 0.17, 0.64, -1.3 + i * 0.05, 0.345, -1.2, '#c8cfd6');
  const mkRam = (name, x) => { const Rr = part(name, [x, 0.265, -1.2]); box(Rr, 0.03, 0.31, 1.33, x, 0.265, -1.2, '#18503a', { tex: { right: T.dimm, left: T.dimm }, tile: 0.7 }); };
  mkRam('ram1', -0.1); mkRam('ram2', 0.2);
  const drive = (name, x, kind) => {
    const P = part(name, [x, 0.2, 2.33]);
    box(P, 1.0, 0.4, 0.05, x, 0.23, 3.075, '#2c323a', { tex: { front: kind === 'ssd' ? T.caddySsd : T.caddyHdd } });
    box(P, 0.05, 0.05, 0.02, x + 0.36, 0.36, 3.11, '#3a414a', { key: 'led' });
    if (kind === 'ssd') { box(P, 1.0, 0.03, 1.45, x, 0.05, 2.32, '#2a3037', { tile: 0.8 }); box(P, 0.7, 0.07, 1.0, x, 0.1, 2.4, '#1b1f25', { tex: { top: T.ssd }, tile: 0.55 }); }
    else box(P, 1.0, 0.26, 1.46, x, 0.18, 2.32, '#8e98a3', { tex: { top: T.hdd }, tile: 0.55, colors: { bottom: '#3b4450' } });
  };
  drive('ssd', 0.525, 'ssd'); drive('hdd1', -1.575, 'hdd'); drive('hdd2', -0.525, 'hdd');
  const L = part('lid', [0, 0.46, 0]);
  box(L, 4.42, 0.025, 6.0, 0, 0.46, -0.1, '#aab2bb', { tile: 0.6 });
  box(L, 1.1, 0.004, 0.44, -0.9, 0.475, 1.4, '#ffffff', { tex: { top: T.sticker }, skip: ['bottom', 'left', 'right', 'back', 'front'] });

  const EXP = { board: { off: [0, 2.3, -0.2], rot: [-0.08, 0, 0.04] }, cpu: { off: [0, 3.4, 0], rot: [0, 0.9, 0] }, cooler: { off: [0, 4.5, 0], rot: [0, -0.4, 0] },
    ram1: { off: [0.9, 2.1, 0.3], rot: [0, 0, 0.35] }, ram2: { off: [1.5, 2.1, 0.3], rot: [0, 0, 0.35] }, ssd: { off: [0.6, 0.9, 3.1], rot: [0, -0.3, 0] },
    hdd1: { off: [-0.8, 1.1, 3.6], rot: [0, 0.35, 0] }, hdd2: { off: [0.1, 1.9, 4.3], rot: [0, 0.2, 0.08] }, lid: { off: [0, 3.2, -0.6], rot: [-0.25, 0, 0] } };
  // Step titles and specs live in the HTML (visible without JS); here only timing and the 3D label.
  const TIMING = {
    board: { t: [0.05, 0.16], tag: 'Плата C252' }, cpu: { t: [0.17, 0.27], tag: 'Xeon E-2314, 4 ядра' }, cooler: { t: [0.28, 0.35], tag: 'Радиатор CPU' },
    ram: { t: [0.36, 0.47], tag: '2 × 16 GB DDR4 ECC' }, ssd: { t: [0.48, 0.56], tag: 'SSD 480 GB' }, hdd: { t: [0.57, 0.69], tag: 'RAID 1, 2 × 2 TB' },
    lid: { t: [0.70, 0.79], tag: 'Корпус 1U' }, os: { t: [0.81, 0.97], tag: '' }
  };
  const STEPS = [...card.querySelectorAll('.step')].map(li => Object.assign({ key: li.dataset.key, el: li }, TIMING[li.dataset.key]));
  const partT = { board: [0.05, 0.16], cpu: [0.17, 0.27], cooler: [0.28, 0.35], ram1: [0.36, 0.43], ram2: [0.40, 0.47], ssd: [0.48, 0.56], hdd1: [0.57, 0.64], hdd2: [0.62, 0.69], lid: [0.70, 0.79] };
  const CAM = [[0.00, [8.6, 8.4, 11.6], [0, 1.9, 0.6]], [0.12, [6.2, 5.6, 6.8], [-0.4, 0.8, -0.6]], [0.30, [4.2, 4.8, 4.4], [-0.8, 0.6, -1.1]], [0.46, [4.8, 5.0, 5.2], [-0.4, 0.6, -0.9]],
    [0.55, [5.2, 3.6, 8.8], [-0.2, 0.3, 1.8]], [0.68, [4.4, 3.4, 9.2], [-0.4, 0.3, 1.6]], [0.78, [7.0, 6.0, 8.8], [0, 0.3, 0]], [0.90, [3.6, 2.2, 8.6], [0, 0.2, 1.6]], [1.00, [1.4, 1.7, 9.6], [0, 0.22, 2.2]]];

  const buildEl = card.querySelector('.build'), head = card.querySelector('.c1-head');
  const tagEl = card.querySelector('.tag'), bar = card.querySelector('.bar');
  const boot = card.querySelector('.boot'), pbar = card.querySelector('.pbar i'), bootText = card.querySelector('.bootText'), bootState = card.querySelector('.bootState'), bootList = card.querySelector('.bootList');
  const BOOT_LINES = ['Процессор: Xeon E-2314, 4 ядра', 'Память: 32 GB ECC, ОК', 'RAID 1: 2 × 2 TB, зеркало собрано', 'Сервер 1С:Предприятие запущен'];
  const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const LIGHT = V.norm([-0.35, 1, 0.55]);
  let W = 0, H = 0, DPR = 1, cur = 0, last = -1, stickTop = 80, headBottom = 0, visible = false;

  function resize() {
    W = cv.clientWidth; H = cv.clientHeight;
    if (!W || !H) return;
    // Full-card canvas at DPR 2 on a desktop is ~3M pixels per frame; 1.5 looks the same on this scene.
    DPR = Math.min(devicePixelRatio || 1, W * H > 600000 ? 1.5 : 2);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    stickTop = parseFloat(getComputedStyle(card).top) || 0;
    headBottom = head.offsetTop + head.offsetHeight;
    last = -1;
    if (REDUCE) frame(1); else kick();
  }
  function camAt(p) { let i = 0; while (i < CAM.length - 2 && p > CAM[i + 1][0]) i++; const [p0, a0, t0] = CAM[i], [p1, a1, t1] = CAM[i + 1], t = eIO(seg(p, p0, p1)); return [lerp3(a0, a1, t), lerp3(t0, t1, t)]; }

  function frame(p) {
    if (!W || !H) return;
    const power = seg(p, 0.82, 0.86);
    for (const k in parts) {
      const P = parts[k]; if (k === 'chassis') continue;
      const [a, b] = partT[k], t = eIO(seg(p, a, b)), e = EXP[k];
      P.pos = V.add(P.c, V.mul(e.off, 1 - t)); P.rot = V.mul(e.rot, 1 - t);
      P.alpha = k === 'lid' ? seg(p, 0.66, 0.71) : 1; P.t = t;
    }
    const [cam, tgt] = camAt(p);
    const f = V.norm(V.sub(tgt, cam)), r = V.norm(V.cross(f, [0, 1, 0])), u = V.cross(r, f);
    const aspect = W / H, fov = aspect < 0.8 ? 0.95 : 0.62;
    const FL = (H / 2) / Math.tan(fov / 2) * (aspect < 0.8 ? Math.min(1, aspect * 1.35) : 1);
    // On narrow cards centre the model in the free band between the title block and the step panel (~96px).
    const cx = W / 2 + (W > 860 ? 150 : 0), cy = W > 860 ? H / 2 + 10 : Math.max(H / 2, (headBottom + H - 96) / 2);
    const proj = q => { const d = V.sub(q, cam); const z = V.dot(d, f); return [cx + V.dot(d, r) / z * FL, cy - V.dot(d, u) / z * FL, z]; };
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const ctr = proj([0, 0, 0]);
    const fg = ctx.createRadialGradient(ctr[0], ctr[1], 0, ctr[0], ctr[1], Math.max(W, H) * .45);
    fg.addColorStop(0, 'rgba(95,176,232,.13)'); fg.addColorStop(1, 'rgba(95,176,232,0)');
    ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H);
    // Soft shadow as three stacked fills instead of ctx.filter blur: the filter costs a full offscreen pass every frame.
    const sh = [[-2.5, 0, -3.4], [2.5, 0, -3.4], [2.5, 0, 3.5], [-2.5, 0, 3.5]].map(proj);
    const shc = [(sh[0][0] + sh[2][0]) / 2, (sh[0][1] + sh[2][1]) / 2];
    ctx.fillStyle = 'rgba(0,0,0,.2)';
    for (const sc of [1.14, 1.06, 0.98]) {
      ctx.beginPath();
      sh.forEach((q, i) => { const x = shc[0] + (q[0] - shc[0]) * sc, y = shc[1] + (q[1] - shc[1]) * sc; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.fill();
    }
    const list = [];
    for (const k in parts) {
      const P = parts[k]; if (P.alpha <= 0.001) continue;
      const M = euler(P.rot[0], P.rot[1], P.rot[2]);
      for (const F of P.faces) {
        const n = ap(M, F.n), w = F.pts.map(q => V.add(ap(M, q), P.pos));
        const c4 = V.mul(V.add(V.add(w[0], w[1]), V.add(w[2], w[3])), 0.25);
        if (V.dot(n, V.sub(cam, c4)) <= 0) continue;
        const s = w.map(proj); if (s.some(q => q[2] < 0.2)) continue;
        const depth = Math.hypot(...V.sub(c4, cam)) + (F.bias && P.t !== undefined && P.t < 0.98 && k !== 'chassis' ? 0 : F.bias);
        list.push({ F, s, n, depth, alpha: P.alpha });
      }
    }
    list.sort((a, b) => b.depth - a.depth);
    for (const it of list) {
      const { F, s, n } = it;
      let shade = 0.5 + 0.5 * Math.max(0, V.dot(n, LIGHT)) + 0.08 * Math.max(0, V.dot(n, V.norm(V.sub(cam, tgt))));
      shade = Math.min(1.08, shade);
      let col = F.col;
      if (F.key === 'led' && power > 0) col = [40, 220, 120];
      if (F.key === 'pwrLed' && power > 0) col = [90, 180, 255];
      const lit = F.key && power > 0;
      const c = lit ? col : col.map(v => Math.round(v * shade));
      ctx.globalAlpha = it.alpha;
      ctx.beginPath(); ctx.moveTo(s[0][0], s[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(s[i][0], s[i][1]); ctx.closePath();
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 0.6;
      ctx.fill(); ctx.stroke();
      if (F.tex) {
        const img = F.tex.img, [u0, v0, u1, v1] = F.tex.uv, iw = img.width, ih = img.height;
        const sx0 = u0 * iw, sy0 = v0 * ih, dw = (u1 - u0) * iw, dh = (v1 - v0) * ih;
        const A = [(s[1][0] - s[0][0]) / dw, (s[1][1] - s[0][1]) / dw], Bv = [(s[3][0] - s[0][0]) / dh, (s[3][1] - s[0][1]) / dh];
        ctx.save(); ctx.clip();
        ctx.transform(A[0], A[1], Bv[0], Bv[1], s[0][0] - sx0 * A[0] - sy0 * Bv[0], s[0][1] - sx0 * A[1] - sy0 * Bv[1]);
        ctx.drawImage(img, sx0, sy0, dw + 0.5, dh + 0.5, sx0, sy0, dw + 0.5, dh + 0.5);
        ctx.restore();
        if (shade < 1) { ctx.fillStyle = `rgba(6,16,34,${(1 - shade) * 0.85})`; ctx.fill(); }
      }
      if (lit) { ctx.save(); ctx.globalAlpha = 0.5 * power; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 14; ctx.fill(); ctx.restore(); }
    }
    ctx.globalAlpha = 1;
    bar.style.transform = `scaleX(${p})`;
    let active = -1;
    STEPS.forEach((s, i) => { const done = p >= s.t[1]; const on = p >= s.t[0] - 0.035 && !done; if (on && active < 0) active = i; s.el.classList.toggle('done', done); s.el.classList.toggle('active', on); });
    if (active < 0 && p < STEPS[0].t[0]) { active = 0; STEPS[0].el.classList.add('active'); }
    buildEl.classList.toggle('idle', active < 0);
    card.classList.toggle('booting', p >= 0.82);
    const s = STEPS[active];
    if (s && s.tag) {
      const key = s.key === 'ram' ? 'ram1' : s.key === 'hdd' ? 'hdd1' : s.key, P = parts[key];
      const q = proj(V.add(P.pos, [0, 0.35, 0]));
      tagEl.textContent = s.tag; tagEl.style.transform = `translate(${q[0] - 14}px, ${q[1] - 40}px)`;
      // On narrow cards the label must not land on top of the title block.
      const clear = W > 860 ? q[1] > 40 : q[1] - 40 > headBottom + 6;
      tagEl.style.opacity = (q[0] > 0 && q[0] < W - 60 && clear) ? 1 : 0;
    } else tagEl.style.opacity = 0;
    const bp = seg(p, 0.84, 0.95);
    boot.style.opacity = seg(p, 0.82, 0.86); boot.style.transform = `translateY(${lerp(12, 0, seg(p, 0.82, 0.86))}px)`;
    pbar.style.transform = `scaleX(${bp})`;
    const shown = Math.min(4, Math.floor(bp * 4.2));
    if (bootList.childElementCount !== shown) bootList.innerHTML = BOOT_LINES.slice(0, shown).map(l => `<li>✓ ${l}</li>`).join('');
    const ready = bp >= 1;
    bootText.textContent = ready ? 'Готов к работе, до 20 пользователей' : bp > 0 ? 'Загрузка служб' : 'Подготовка системы';
    bootText.className = 'bootText' + (ready ? ' ready' : '');
    bootState.textContent = ready ? 'в работе' : 'загрузка';
  }
  function target() {
    const top = spacer.getBoundingClientRect().top;
    return clamp((stickTop + card.offsetHeight - top) / Math.max(1, spacer.offsetHeight));
  }
  // Runs only while the scene is catching up with the scroll position, then drops out of the ticker.
  function step() {
    const t = target();
    cur = Math.abs(t - cur) < 5e-4 ? t : lerp(cur, t, 0.12);
    if (Math.abs(cur - last) > 1e-4) { frame(cur); last = cur; }
    return cur !== t;
  }
  function kick() { if (visible && !REDUCE) ticker.add(step); }

  new ResizeObserver(resize).observe(cv);
  new IntersectionObserver(es => { visible = es[es.length - 1].isIntersecting; if (visible) kick(); else ticker.remove(step); }).observe(card);
  if (!REDUCE) addEventListener('scroll', kick, { passive: true });
  if (REDUCE) spacer.style.height = '0px';
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => {
    drawSticker(T.sticker.getContext('2d'), T.sticker.width, T.sticker.height);
    headBottom = head.offsetTop + head.offsetHeight;
    last = -1; if (REDUCE) frame(1); else kick();
  });
})();

/* ============ 3b. Stacking cards: tilt the card being covered ============ */
(function () {
  if (REDUCE) return;
  const cards = [...document.querySelectorAll('#stack .stack-card')];
  const prev = cards.map(() => -1);
  function upd() {
    const vh = innerHeight, top = parseFloat(getComputedStyle(cards[0]).top) || 0;
    for (let i = 0; i < cards.length - 1; i++) {
      const nt = cards[i + 1].getBoundingClientRect().top;
      const cov = clamp((vh - nt) / Math.max(1, vh - top));
      if (Math.abs(cov - prev[i]) < 0.002) continue; prev[i] = cov;
      cards[i].style.transform = cov > 0 ? `perspective(1400px) rotateX(${(-10 * cov).toFixed(2)}deg) translateZ(${(-70 * cov).toFixed(1)}px)` : '';
      cards[i].style.setProperty('--cov', cov.toFixed(3));
    }
    return false;
  }
  let near = false;
  new IntersectionObserver(es => { near = es[es.length - 1].isIntersecting; if (near) ticker.add(upd); }, { rootMargin: '100% 0px' }).observe(document.getElementById('stack'));
  addEventListener('scroll', () => { if (near) ticker.add(upd); }, { passive: true });
  addEventListener('resize', () => ticker.add(upd));
})();

/* ============ Submission stub ============ */
// TODO: подключить реальную отправку (email/Telegram/CRM) - обсудить с Антоном.
// Сейчас данные никуда не уходят: пишутся только в localStorage браузера посетителя. С этой заглушкой сайт не публиковать.
function sendStub(kind, data) {
  return new Promise((resolve, reject) => {
    try {
      const key = 'sarmat-stub-' + kind;
      const list = JSON.parse(localStorage.getItem(key) || '[]');
      list.push(Object.assign({ at: new Date().toISOString() }, data));
      localStorage.setItem(key, JSON.stringify(list));
      setTimeout(resolve, 300);
    } catch (e) { reject(e); }
  });
}

/* ============ Card buttons prefill the form ============ */
document.querySelectorAll('.js-pick').forEach(b => b.addEventListener('click', () => {
  document.getElementById('f-pos').value = b.dataset.pos;
  document.getElementById('request').scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth' });
  setTimeout(() => document.getElementById('f-name').focus({ preventScroll: true }), REDUCE ? 0 : 900);
}));

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
  new IntersectionObserver(es => es.forEach(e => a.classList.toggle('in-hero', e.isIntersecting))).observe(document.getElementById('hero'));
  new IntersectionObserver(es => es.forEach(e => a.classList.toggle('in-stack', e.isIntersecting)), { rootMargin: '-20% 0px -20% 0px' }).observe(document.getElementById('stack'));
  bubble.addEventListener('click', open);
  fab.addEventListener('click', () => panel.hidden ? open() : close());
  document.getElementById('asstClose').addEventListener('click', close);
  panel.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const text = q.value.trim(); if (!text) { q.focus(); return; }
    const btn = form.querySelector('button'); btn.disabled = true;
    sendStub('question', { question: text })
      .then(() => { form.hidden = true; done.hidden = false; done.focus(); })
      .catch(() => { btn.disabled = false; });
  });
})();

/* ============ 5. Request form ============ */
(function () {
  const f = document.getElementById('reqForm'), ok = document.getElementById('msgOk'), err = document.getElementById('msgErr');
  const phone = document.getElementById('f-phone'), phoneErr = document.getElementById('f-phone-err');
  const btn = f.querySelector('button[type="submit"]');
  const phoneOk = () => { const n = phone.value.replace(/\D/g, '').length; return n >= 10 && n <= 15; };
  const showPhone = bad => { phone.setAttribute('aria-invalid', bad ? 'true' : 'false'); phoneErr.hidden = !bad; };
  phone.addEventListener('blur', () => { if (phone.value.trim()) showPhone(!phoneOk()); });
  phone.addEventListener('input', () => { if (phone.getAttribute('aria-invalid') === 'true' && phoneOk()) showPhone(false); });
  f.addEventListener('submit', e => {
    e.preventDefault();
    ok.hidden = true; err.hidden = true;
    if (!phoneOk()) { showPhone(true); phone.focus(); return; }
    showPhone(false);
    btn.disabled = true;
    const data = Object.fromEntries(new FormData(f));
    sendStub('lead', data)
      .then(() => { ok.hidden = false; f.reset(); })
      .catch(() => { err.hidden = false; })
      .finally(() => { btn.disabled = false; });
  });
})();

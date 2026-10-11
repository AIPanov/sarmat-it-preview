'use strict';

/* ============ shared helpers ============ */
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SCREENS_ON = document.documentElement.classList.contains('screens'); // one gesture, one screen (set in the page head; SCREENS below)
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (p, a, b) => clamp((p - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;
const eIO = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const eOut = t => 1 - Math.pow(1 - t, 3);
const eBack = t => { const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const bell = (v, a, b, c) => v <= b ? smooth(a, b, v) : 1 - smooth(b, c, v);

/* Descent progress d (0 before, 1 after landing) and the tilt k after it (the camera looks down at the board).
   The hero writes them, the starfield and the board read them. */
const heroState = { d: 0, k: 0 };

/* Errors for the ?debug overlay at the end of the file. */
const ERRS = [];
addEventListener('error', e => ERRS.push(e.message));

/* One rAF loop for every scene. A task returning false is removed until someone adds it again.
   A task that throws is removed too, so one broken scene does not stop the others (and the hero ride). */
const ticker = (() => {
  const tasks = new Set(); let id = 0;
  const run = t => {
    id = 0;
    for (const fn of [...tasks]) {
      let r; try { r = fn(t); } catch (e) { r = false; ERRS.push(String(e && e.message || e)); console.error(e); }
      if (r === false) tasks.delete(fn);
    }
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
  }, { rootMargin: '-2px 0px 0px 0px' }).observe(document.getElementById('hero')); // a hero edge touching the top is off screen
  return { get on() { return on; }, sub(f) { subs.push(f); } };
})();

/* ============ Starfield (canvas 2D, parallax) ============ */
(function () {
  const cv = document.getElementById('sky'), g = cv.getContext('2d');
  let W = 0, H = 0, D = 1, stars = [], mx = 0, my = 0, tmx = 0, tmy = 0, lastT = 0;
  const LAYERS = [{ k: .025, n: .56, r: [.5, 1.0], a: [.22, .55] }, { k: .07, n: .31, r: [.8, 1.4], a: [.4, .8] }, { k: .16, n: .13, r: [1.1, 2.0], a: [.6, 1] }];
  const NEB = [{ x: .74, y: .30, r: .55, c: '40,90,190', a: .17 }, { x: .18, y: .72, r: .5, c: '90,60,170', a: .10 }, { x: .5, y: .5, r: .32, c: '30,140,190', a: .08 }];
  let seed = 3; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const rnd = ([a, b]) => a + rand() * (b - a);
  // Stars are made once and only rescaled: the phone address bar used to give a new sky on every resize.
  function build() {
    const w = cv.clientWidth || innerWidth, h = cv.clientHeight || innerHeight, d = Math.min(1.5, devicePixelRatio || 1);
    if (stars.length && w === W && h === H && d === D) return;
    if (!stars.length) {
      const total = Math.min(1100, Math.max(320, Math.round(w * h / 1700)));
      LAYERS.forEach((L, li) => {
        const n = Math.round(total * L.n);
        for (let i = 0; i < n; i++) {
          const q = rand();
          stars.push({ u: rand(), v: rand(), l: li, k: L.k, r: rnd(L.r), a: rnd(L.a), tw: rand() * 6.28, ts: .4 + rand() * 1.4,
            c: q < .1 ? '255,214,170' : q < .4 ? '170,205,255' : '235,242,255' });
        }
      });
    }
    W = w; H = h; D = d; cv.width = Math.round(W * D); cv.height = Math.round(H * D);
    for (const s of stars) { s.x = s.u * W; s.y = s.v * H; }
  }
  function draw(t) {
    if (REDUCE) t = 0;
    lastT = t;
    const sy = scrollY;
    // Stars and nebulae fade as the camera enters the atmosphere; after landing a faint sky stays.
    const fade = lerp(1, .22, seg(heroState.d, .5, .72));
    mx += (tmx - mx) * .04; my += (tmy - my) * .04;
    g.setTransform(D, 0, 0, D, 0, 0);
    g.fillStyle = '#03050b'; g.fillRect(0, 0, W, H);
    const nf = fade;
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
  const step = t => draw(t);
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


/* ============ 1. Hero: logo assembly, then descent to Earth ============ */
/* One sticky stage. Progress P: the logo assembles in [0, L_END], holds with the headline,
   then the camera flies into the globe of the emblem, turns to Russia, dives onto Moscow,
   passes through clouds and lands on the ground grid [D0, D1].
   The logo assembles by itself on load (люди принимали пустой первый экран за недогруженный, 10.10.2026);
   the scroll track covers only [L_END, 1]. One wheel turn, swipe or key plays the rest of the chapter
   down to «Как мы работаем» (see "one gesture" below). */
(function () {
  if (!REDUCE) document.documentElement.classList.add('world-on'); // the world canvas is the page background (styles: .world-on)
  const R = document.getElementById('hero');
  const logo = R.querySelector('.si-logo'), stage = R.querySelector('.si-stage'), track = R.querySelector('.si-track');
  const hint = R.querySelector('.si-hint'), bar = R.querySelector('.si-bar'), line = R.querySelector('.hero-line');
  const caps = [...R.querySelectorAll('.ds-cap')];
  const L_END = 0.40, D0 = 0.46, D1 = 0.85;
  const K0 = 0.855, K1 = 0.995; // after landing the Earth turns into a circuit board and the camera takes off (planet, ground)
  const OX = 190, OY = 270, GY = 580 - OY;
  const GLX = 495 - OX, GLY = 580 - OY; // globe centre inside the 620 x 690 logo box
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

  // Everything except the globe sits in gFx: during the descent it fades while the camera flies through it.
  const gFx = el('g', {}, svg);
  const triA = { fill: 'none', stroke: 'var(--si-ink)', 'stroke-width': 9.5, 'stroke-linejoin': 'miter', 'stroke-miterlimit': 8 };
  const tri = el('path', Object.assign({ d: 'M495 301 L771 713 L219 713 Z' }, triA), gFx);
  const halves = ['M495 301 L771 713 L495 713', 'M495 301 L219 713 L495 713'].map(d => el('path', Object.assign({ d }, triA), gFx));
  const halfLen = halves[0].getTotalLength();
  halves.forEach(h => { h.style.strokeDasharray = halfLen; });
  const runePts = [[11.6, -24.7], [-10.9, -7.2], [11.6, 7.2], [-11.5, 24.7]];
  const runes = [[490.3, 347.2], [283.7, 676.4], [703.4, 676.2]].map(([x, y]) => {
    const gg = el('g', { 'data-x': x, 'data-y': y }, gFx);
    el('polyline', { points: runePts.map(p => p.join(',')).join(' '), fill: 'none', stroke: 'var(--si-ink)', 'stroke-width': 4.2, 'stroke-linecap': 'round' }, gg);
    return gg;
  });
  const disc = el('circle', { cx: 495, cy: 580, r: 199, fill: 'url(#siDisc)' }, gFx);
  const ring = el('circle', { cx: 495, cy: 580, r: 195, fill: 'none', stroke: 'var(--si-ink)', 'stroke-width': 8, transform: 'rotate(-90 495 580)', filter: 'url(#siSoft)' }, gFx);
  const ringLen = 2 * Math.PI * 195; ring.style.strokeDasharray = ringLen;
  const dash = el('circle', { cx: 495, cy: 580, r: 177, fill: 'none', stroke: 'var(--si-ink)', 'stroke-width': 5, 'stroke-dasharray': '21 11.3', opacity: .85 }, gFx);
  const linesG = el('g', { stroke: 'var(--si-line)', 'stroke-width': 1.6, 'stroke-linecap': 'round' }, gFx);
  const dotsG = el('g', { fill: 'var(--si-dot)', filter: 'url(#siSoft)' }, gFx);

  // The pulse animation owns the circle's opacity, so the descent fades its wrapper instead.
  const glowG = el('g', {}, svg);
  el('circle', { class: 'si-glow', cx: 495, cy: 580, r: 150, fill: 'url(#siGlow)' }, glowG);
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

  let W = 0, H = 0, s = 1;
  // Screen position and radius of the emblem's globe; the canvas planet starts exactly there.
  function globeAt(d) {
    const ez = eIO(seg(d, 0, 0.2)), k = s * Math.exp(Math.log(3.4) * ez);
    const x = lerp(W / 2 - 5 * s, W / 2, ez), y = lerp(gy0, H / 2, ez);
    const r0 = 99 * s * 3.4, rc = Math.min(0.49 * W, clamp(0.41 * Math.min(W, H), r0 * 0.9, r0 * 1.4));
    let r = lerp(99 * k, rc, eIO(seg(d, 0.2, 0.44)));
    r *= Math.exp(Math.log(90 * Math.max(W, H) / rc) * eIO(seg(d, 0.46, 0.7)));
    return { x, y, r, k };
  }
  // The assembled logo fits between the header and the headline; the headline sits higher while
  // the hint and the cookie notice are on screen. Visible logo: 279 units above the globe centre, 370 below.
  let gy0 = 0;
  function fit() {
    W = stage.clientWidth; H = stage.clientHeight;
    const foot = R.querySelector('.hero-foot');
    const top = document.getElementById('hdr').offsetHeight + 12, room = Math.max(160, foot.offsetTop + line.offsetTop - 14 - top);
    s = Math.min(W / 680, H * 0.72 / 740, room / 649);
    gy0 = top + 279 * s + Math.max(0, room - 649 * s) / 2;
    planet.size(W, H);
    render(true);
    flightKick(true); // the flight relayouts its stations and redraws
  }

  let cur = 0, last = -1, logoOn = true, phase = 0, prevT = 0;
  // intro: 0..1, the logo assembly on load. Any scroll into the track finishes it at once.
  const INTRO_DELAY = 350, INTRO_MS = 3600;
  let intro = scrollY > 0 ? 1 : 0, introT0 = 0;
  function progress() {
    if (REDUCE) return L_END;
    const r = track.getBoundingClientRect();
    const f = clamp(-r.top / Math.max(1, r.height - stage.clientHeight)); // the stage is 100svh: it unpins at f = 1 whatever the address bar does
    if (f > 0) intro = 1;
    return f > 0 ? L_END + (1 - L_END) * f : L_END * intro;
  }
  const CAPW = [[0.24, 0.30, 0.42, 0.47], [0.50, 0.54, 0.60, 0.64], [0.86, 0.92, 2, 2]];
  function render(force) {
    const P = cur;
    if (!force && Math.abs(P - last) < 1e-5) return; last = P;
    const p = REDUCE ? 1 : clamp(P / L_END), d = REDUCE ? 0 : seg(P, D0, D1);
    heroState.d = d;
    const tk = REDUCE ? 0 : seg(P, K0, K1), land = 1 - seg(tk, 0.74, 0.84); // «Ближе к делу» stays through the wave
    if (tk !== heroState.k) { heroState.k = tk; stage.style.setProperty('--land', tk.toFixed(3)); if (tk >= 0.999) flightKick(); }
    bar.style.transform = `scaleX(${REDUCE ? 1 : P})`;
    const hl = eOut(seg(p, 0.9, 1));
    line.style.opacity = hl * (1 - seg(d, 0, 0.05)); line.style.transform = `translateY(${lerp(14, 0, hl)}px)`;
    caps.forEach((c, i) => {
      const [a, b, e, f] = CAPW[i], o = seg(d, a, b) * (1 - seg(d, e, f)) * land;
      c.style.opacity = o; c.style.visibility = o > 0.002 ? 'visible' : 'hidden';
      c.style.transform = `translateY(${lerp(18, 0, eOut(seg(d, a, b))) - 12 * seg(d, e, f)}px)`;
    });
    const on = d < 0.17;
    if (on !== logoOn) { logoOn = on; logo.style.visibility = on ? '' : 'hidden'; }
    if (!on) return;
    const G = globeAt(d);
    logo.style.transform = `translate(${G.x - GLX * G.k}px, ${G.y - GLY * G.k}px) scale(${G.k})`;
    const fo = 1 - seg(d, 0.03, 0.14);
    for (const n of [gFx, iconsG, glowG, back, front, over]) n.style.opacity = fo;

    const gp = eOut(seg(p, 0, 0.1)), gs = lerp(.72, 1, gp);
    globeG.setAttribute('transform', `translate(495 580) scale(${gs}) translate(-495 -580)`);
    globeG.style.opacity = lerp(.35, 1, gp) * (1 - seg(d, 0.1, 0.16));
    for (const st of sats) {
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
  }
  // The emblem's globe spins until the descent starts; the canvas planet picks up the same angle.
  function spinGlobe(t) {
    const dt = prevT ? Math.min(64, t - prevT) : 0; prevT = t;
    if (!REDUCE && heroState.d <= 0) phase += dt * 0.00022;
    if (!logoOn) return;
    mers.forEach((m, i) => { const a = phase + i * Math.PI / 6; m.setAttribute('rx', (99 * Math.abs(Math.sin(a))).toFixed(1)); });
  }

  /* ---------- canvas: planet, clouds, ground ---------- */
  // Camera of the flight over the board (FLIGHT); the world drawing reads it once the flight is on
  const FLY = { on: false, z: 0, h: 3.4, lit: [0, 0, 0, 0, 0], chips: [0, 0, 0, 0], sig: null, dimFast: 1, fast: false }; // fast: a screen change is running
  let flightKick = () => {};
  const planet = (() => {
    const cv = document.getElementById('world'), g = cv.getContext('2d');
    const RAD = Math.PI / 180;
    let D = 1, drawn = false;
    const ll = (la, lo) => { const a = la * RAD, b = lo * RAD, c = Math.cos(a); return [c * Math.cos(b), c * Math.sin(b), Math.sin(a)]; };
    const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

    // Moscow and regional centres (city coordinates, rounded). Arcs say "delivery and installation across Russia".
    const MSK = [55.7558, 37.6173];
    const CITIES = [[59.94, 30.31], [56.84, 60.61], [55.03, 82.92], [43.12, 131.89], [45.04, 38.98], [55.79, 49.12], [62.03, 129.73], [68.97, 33.08], [56.01, 92.87], [52.29, 104.28],
      [48.71, 44.51], [54.71, 20.51], [61.25, 73.4], [64.54, 40.54], [47.23, 39.72], [56.33, 44.0], [53.2, 50.15], [54.99, 73.37], [58.01, 56.25], [54.73, 55.96], [48.48, 135.08], [57.15, 65.53], [43.6, 39.73], [51.67, 39.18], [53.35, 83.77]];
    const mv = ll(MSK[0], MSK[1]);
    const ARCS = CITIES.slice(0, 14).map((c, i) => {
      const b = ll(c[0], c[1]), om = Math.acos(clamp(dot3(mv, b), -1, 1)), n = 40, sn = Math.sin(om), lift = 0.02 + om * 0.13;
      const pts = new Float32Array((n + 1) * 3);
      for (let j = 0; j <= n; j++) {
        const t = j / n, k0 = Math.sin((1 - t) * om) / sn, k1 = Math.sin(t * om) / sn, r = 1 + lift * Math.sin(Math.PI * t);
        pts[j * 3] = (mv[0] * k0 + b[0] * k1) * r; pts[j * 3 + 1] = (mv[1] * k0 + b[1] * k1) * r; pts[j * 3 + 2] = (mv[2] * k0 + b[2] * k1) * r;
      }
      return { pts, n, delay: i * 0.035, city: i };
    });
    const CV = CITIES.map(c => ll(c[0], c[1]));

    // Graticule: 30-degree lines match the emblem, 10-degree lines fade in as the planet grows.
    const latLine = (la, n = 96) => { const a = new Float32Array((n + 1) * 3); for (let i = 0; i <= n; i++) a.set(ll(la, -180 + 360 * i / n), i * 3); return a; };
    const lonLine = (lo, n = 48) => { const a = new Float32Array((n + 1) * 3); for (let i = 0; i <= n; i++) a.set(ll(-90 + 180 * i / n, lo), i * 3); return a; };
    const G30 = [], G10 = [];
    for (let la = -60; la <= 60; la += 30) G30.push(latLine(la));
    for (let lo = -180; lo < 180; lo += 30) G30.push(lonLine(lo));
    for (let la = -80; la <= 80; la += 10) if (la % 30) G10.push(latLine(la));
    for (let lo = -180; lo < 180; lo += 10) if (lo % 30) G10.push(lonLine(lo));

    /* City that turns into a circuit board (variant 3, Антон 11.10.2026: «Земля превращается в микросхемы»).
       The city round the landing point is laid out like a board already: 8 avenues at 45 degrees, two ring roads,
       districts and a core. Every road point and every light has a city place and a board place, and after the
       landing a wave from the landing point moves each one from the first to the second: avenues become straight
       traces, rings octagons, lights pads, districts chips, the core the central chip with the emblem. One model,
       so nothing is swapped: it changes in place. Units: world units on the ground, landing point at the origin. */
    /* The flight (FLIGHT below): after take-off the camera flies along the main bus (+z) and stops at one station per
       section. Each station has an object on the board, 16 units ahead of the camera, to the right of the bus (x < 0 is
       on the right of the screen). The board ends at ZE: an edge connector, then nothing but stars. */
    const ZE = 70, STN = { cam: [6, 18, 30, 42, 54], obj: [22, 34, 46, 58, ZE] };
    const RESERVED = [[-8, 21, -1.4, 23], [-8.4, 31.8, -1.2, 36.4], [-13.4, 42.6, -1.2, 51.2]]; // x0, z0, x1, z1 of the station objects
    const CITY = (() => {
      const roads = [], lights = [], blocks = [], parts = [], core = [];
      const inRes = (x, z, pad) => RESERVED.some(r => x > r[0] - pad && x < r[2] + pad && z > r[1] - pad && z < r[3] + pad) || z > ZE - 1.2 - pad;
      // a start point: two thirds in the city disk round the landing point, a third in the corridor along the bus
      const where = pw => { if (rnd() < 0.66) { const a = rnd() * 6.2832, r = 2.8 + 48 * Math.pow(rnd(), pw); return [Math.sin(a) * r, Math.cos(a) * r, a, r]; }
        const x = (rnd() - 0.5) * 52, z = 8 + rnd() * (ZE - 9); return [x, z, Math.atan2(x, z), Math.hypot(x, z)]; };
      const G = 0.25, snapG = v => Math.round(v / G) * G;
      const angOff = a => { const q = ((a % (Math.PI / 4)) + Math.PI / 4) % (Math.PI / 4); return Math.min(q, Math.PI / 4 - q); }; // to the nearest avenue
      // avenues: 0 runs to the horizon (+z) and becomes the main bus, 4 runs towards the viewer
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4, ux = Math.sin(a), uz = Math.cos(a), px = uz, pz = -ux;
        const org = [], snap = [], dist = [];
        let w = 0, dw = 0;
        for (let r = 0.32; r <= (i === 0 ? ZE - 0.8 : 64); r += 1) {
          dw = clamp(dw + (rnd() - 0.5) * 0.12, -0.08, 0.08); w = clamp(w + dw, -0.9, 0.9);
          const ww = w * Math.min(1, r / 3);
          snap.push(ux * r, uz * r); org.push(ux * r + px * ww, uz * r + pz * ww); dist.push(r);
        }
        roads.push({ org, snap, dist, main: i === 0 });
      }
      // ring roads: organic circles that become octagons with their corners on the avenues
      for (const R0 of [10, 22]) {
        const n = R0 === 10 ? 64 : 120, org = [], snap = [], dist = [], ph = rnd() * 6.283;
        for (let j = 0; j <= n; j++) {
          const a = j / n * 6.2832, r = R0 + 0.35 * Math.sin(a * 3 + ph) + 0.2 * Math.sin(a * 7 + 2 * ph);
          const ai = a - Math.floor(a / (Math.PI / 4)) * (Math.PI / 4) - Math.PI / 8, ro = R0 * Math.cos(Math.PI / 8) / Math.cos(ai);
          org.push(Math.sin(a) * r, Math.cos(a) * r); snap.push(Math.sin(a) * ro, Math.cos(a) * ro); dist.push(R0);
        }
        roads.push({ org, snap, dist, ring: true });
      }
      // districts: chip footprints between the avenues; their lights gather on the edges and become pins
      for (let i = 0, tries = 0; i < 70 && tries < 700; tries++) {
        const [x0, z0, a, r] = where(0.9), w = snapG(0.7 + 1.5 * rnd()), hh = snapG(0.5 + 1.0 * rnd());
        const x = snapG(x0), z = snapG(z0), hd = Math.hypot(w, hh) / 2;
        if (r < 3 || (r < 66 && r * Math.sin(angOff(a)) < hd + 0.45) || Math.abs(x) < hd + 0.6 || Math.abs(r - 10) < hd + 0.6 || Math.abs(r - 22) < hd + 0.6 || inRes(x, z, hd + 0.4)) continue;
        if (blocks.some(b => Math.abs(b.x - x) < (b.w + w) / 2 + 0.5 && Math.abs(b.z - z) < (b.h + hh) / 2 + 0.5)) continue;
        const b = { x, z, w, h: hh, d: r, pins: [] };
        const n = 5 + (w * hh * 5 | 0);
        for (let q = 0; q < n; q++) {
          const ox = x + (rnd() - 0.5) * w, oz = z + (rnd() - 0.5) * hh;
          const dx = ox - x, dz = oz - z, ex = w / 2 - Math.abs(dx), ez = hh / 2 - Math.abs(dz);
          let sx, sz;
          if (ex < ez) { sx = x + Math.sign(dx || 1) * (w / 2 + 0.05); sz = z + Math.round(dz / 0.16) * 0.16; }
          else { sz = z + Math.sign(dz || 1) * (hh / 2 + 0.05); sx = x + Math.round(dx / 0.16) * 0.16; }
          b.pins.push({ ox, oz, sx, sz, b: 0.5 + 0.5 * rnd() });
        }
        blocks.push(b); i++;
      }
      // streets between the avenues: short walks on a 0.25 grid, turning by 45 degrees, never crossing; in the city they
      // bend a little and carry a row of lights, on the board they are the dense thin traces
      const GC = 0.25, GN = 592, off = GN / 2, occ = new Uint8Array(GN * GN);
      const cellOf = v => Math.floor(v / GC) + off, cen = c => (c - off + 0.5) * GC;
      const markR = (x, z, rad) => { const c = cellOf(x), r = cellOf(z), q = Math.ceil(rad / GC); for (let y = Math.max(0, r - q); y <= Math.min(GN - 1, r + q); y++) for (let xx = Math.max(0, c - q); xx <= Math.min(GN - 1, c + q); xx++) occ[y * GN + xx] = 1; };
      for (const rd of roads) for (let j = 0; j + 3 < rd.snap.length; j += 2) for (let u = 0; u < 1; u += 0.25) markR(lerp(rd.snap[j], rd.snap[j + 2], u), lerp(rd.snap[j + 1], rd.snap[j + 3], u), 0.4);
      for (const bk of blocks) for (let x = bk.x - bk.w / 2; x <= bk.x + bk.w / 2 + 1e-6; x += GC) for (let z = bk.z - bk.h / 2; z <= bk.z + bk.h / 2 + 1e-6; z += GC) markR(x, z, 0.3);
      markR(0, 0, 2.6);
      for (const [x0, z0, x1, z1] of RESERVED) for (let x = x0; x <= x1; x += GC) for (let z = z0; z <= z1; z += GC) markR(x, z, 0.3);
      for (let x = -40; x <= 40; x += GC) for (let z = ZE - 1.2; z <= ZE + 4; z += GC) markR(x, z, 0); // nothing on the board past its edge
      const DIR = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
      const freeC = (c, r) => { if (c < 1 || r < 1 || c >= GN - 1 || r >= GN - 1) return false; for (let y = r - 1; y <= r + 1; y++) for (let x = c - 1; x <= c + 1; x++) if (occ[y * GN + x]) return false; return true; };
      for (let i = 0; i < 3400; i++) {
        const [sx0, sz0] = where(1.7); // denser near the landing point, where the camera is
        let c = cellOf(sx0), r = cellOf(sz0); if (!freeC(c, r)) continue;
        let d = rnd() < 0.6 ? (rnd() * 4 | 0) * 2 : rnd() * 8 | 0, rel = 0;
        const cells = [[c, r]], verts = [[c, r]], segs = 2 + (rnd() * 4 | 0);
        for (let sg = 0; sg < segs; sg++) {
          const len = 2 + (rnd() * 9 | 0); let n = 0;
          while (n < len) { const nc = c + DIR[d][0], nr = r + DIR[d][1]; if (!freeC(nc, nr)) break; c = nc; r = nr; cells.push([c, r]); n++; }
          if (!n) break;
          verts.push([c, r]);
          const turn = rel <= -2 ? 1 : rel >= 2 ? -1 : rnd() < 0.5 ? 1 : -1; rel += turn; d = (d + turn + 8) % 8;
        }
        if (cells.length < 5) continue;
        for (const [x, y] of cells) for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) occ[yy * GN + xx] = 1;
        const org = [], snap = [], dist = [];
        for (let v = 0; v < verts.length; v++) { // vertices and midpoints; the city version bends at both
          const sx = cen(verts[v][0]), sz = cen(verts[v][1]);
          snap.push(sx, sz); org.push(sx + (rnd() - 0.5) * 0.22, sz + (rnd() - 0.5) * 0.22); dist.push(Math.hypot(sx, sz));
          if (v < verts.length - 1) {
            const mx = (sx + cen(verts[v + 1][0])) / 2, mz = (sz + cen(verts[v + 1][1])) / 2;
            snap.push(mx, mz); org.push(mx + (rnd() - 0.5) * 0.34, mz + (rnd() - 0.5) * 0.34); dist.push(Math.hypot(mx, mz));
          }
        }
        roads.push({ org, snap, dist, street: true });
      }
      // scattered lights: most become pads, some pairs small parts, a few go out
      const nearRoad = (r, a) => (r < 66 && r * Math.sin(angOff(a)) < 0.35) || Math.abs(r * Math.sin(a)) < 0.35 || Math.abs(r - 10) < 0.5 || Math.abs(r - 22) < 0.5;
      const inBlock = (x, z) => blocks.some(b => Math.abs(b.x - x) < b.w / 2 + 0.25 && Math.abs(b.z - z) < b.h / 2 + 0.25);
      for (let i = 0; i < 760; i++) {
        const [x, z, a, r] = where(1.4);
        if (r < 1.6 || nearRoad(r, a) || inBlock(x, z) || inRes(x, z, 0.3)) continue;
        const q = rnd(), sx = snapG(x), sz = snapG(z);
        if (q < 0.2) { const o = rnd() < 0.5; parts.push({ x: sx, z: sz, o, d: r, a: { ox: x, oz: z, b: 0.5 + 0.5 * rnd() }, c: { ox: x + (o ? 0.22 : 0) + (rnd() - 0.5) * 0.1, oz: z + (o ? 0 : 0.22) + (rnd() - 0.5) * 0.1, b: 0.5 + 0.5 * rnd() } }); }
        else lights.push({ ox: x, oz: z, sx, sz, d: r, out: q > 0.9, b: 0.35 + 0.65 * rnd() });
      }
      // the core: lights round the landing point gather on the edges of the central chip (0.5 units)
      for (let i = 0; i < 72; i++) {
        const a = rnd() * 6.2832, r = 0.32 + 1.9 * Math.pow(rnd(), 0.8), ox = Math.sin(a) * r, oz = Math.cos(a) * r;
        const side = Math.abs(ox) > Math.abs(oz), t = clamp(Math.round((side ? oz : ox) / 0.08) * 0.08, -0.2, 0.2);
        core.push({ ox, oz, sx: side ? Math.sign(ox) * 0.3 : t, sz: side ? t : Math.sign(oz) * 0.3, b: 0.5 + 0.5 * rnd() });
      }
      for (const rd of roads) {
        rd.cur = new Float32Array(rd.org.length); rd.m = new Float32Array(rd.dist.length); rd.zmin = 1e9; rd.zmax = -1e9;
        for (let j = 1; j < rd.org.length; j += 2) { rd.zmin = Math.min(rd.zmin, rd.org[j], rd.snap[j]); rd.zmax = Math.max(rd.zmax, rd.org[j], rd.snap[j]); }
      }
      // lights along the roads (zigzag on both sides of the avenues, about one per unit on the streets);
      // they ride on the road and fade as it becomes a trace
      roads.forEach((rd, ri) => {
        for (let j = 0; j < rd.dist.length - 1; j++) {
          if (!rd.street) { for (const [t, o] of [[0.25, 0.15], [0.75, -0.15]]) lights.push({ road: ri, j, t, off: o, b: 0.45 + 0.55 * rnd() }); continue; }
          const L = Math.hypot(rd.snap[2 * j + 2] - rd.snap[2 * j], rd.snap[2 * j + 3] - rd.snap[2 * j + 1]);
          for (let t = 0.4 / L; t < 1; t += 0.9 / L) lights.push({ road: ri, j, t, off: (rnd() - 0.5) * 0.1, b: 0.3 + 0.5 * rnd() });
        }
      });
      return { roads, lights, blocks, parts, core };
    })();
    // one glow sprite for every signal head
    const GLOW = (() => { const c = document.createElement('canvas'), n = 54, x = c.getContext('2d'); c.width = c.height = n; const gr = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2); gr.addColorStop(0, 'rgba(143,208,255,.6)'); gr.addColorStop(1, 'rgba(143,208,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, n, n); return c; })();
    // Cloud sprite and puffs the camera flies through.
    const CLOUD = document.createElement('canvas'); CLOUD.width = CLOUD.height = 256;
    (() => {
      const c = CLOUD.getContext('2d');
      for (let i = 0; i < 26; i++) {
        const a = rnd() * 6.283, q = Math.pow(rnd(), 0.7) * 72, x = 128 + Math.cos(a) * q * 1.3, y = 128 + Math.sin(a) * q * 0.7, r = 14 + rnd() * 34;
        const gr = c.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(196,218,242,.34)'); gr.addColorStop(1, 'rgba(196,218,242,0)');
        c.fillStyle = gr; c.fillRect(0, 0, 256, 256);
      }
    })();
    const PUFFS = Array.from({ length: 34 }, () => ({ x: rnd() * 2 - 1, y: rnd() * 2 - 1, z: 0.25 + rnd() * 1.1, s: 0.5 + rnd() * 0.8, a: 0.35 + rnd() * 0.4 }));

    // The world canvas is fixed and takes the large viewport height; the scene keeps the stage's W x H geometry.
    let Wc = 0, Hc = 0;
    function size(w, h) {
      const cw = cv.clientWidth || w, ch = cv.clientHeight || h, d = clamp(Math.sqrt(2.2e6 / (cw * ch)), 0.75, Math.min(devicePixelRatio || 1, 1.5));
      if (cw === Wc && ch === Hc && d === D) return;
      Wc = cw; Hc = ch; D = d; cv.width = Math.round(cw * D); cv.height = Math.round(ch * D); drawn = true;
    }

    function strokeSet(list, B, r, gx, gy, front, a, lw) {
      if (a <= 0.004) return;
      const { e, u, n } = B;
      g.beginPath();
      for (const L of list) {
        let pen = false;
        for (let i = 0; i < L.length; i += 3) {
          const x = L[i], y = L[i + 1], z = L[i + 2];
          if ((x * n[0] + y * n[1] + z * n[2] > 0) === front) {
            const X = gx + r * (x * e[0] + y * e[1] + z * e[2]), Y = gy - r * (x * u[0] + y * u[1] + z * u[2]);
            if (pen) g.lineTo(X, Y); else { g.moveTo(X, Y); pen = true; }
          } else pen = false;
        }
      }
      g.strokeStyle = `rgba(143,208,255,${a.toFixed(3)})`; g.lineWidth = lw; g.stroke();
    }
    // Finer lines only around the view centre, so the grid keeps its density while zooming in.
    function fineGrid(step, lac, loc, B, r, gx, gy, a) {
      if (a <= 0.004) return;
      const hw = Math.min(60, Math.hypot(W, H) * 0.6 / r / RAD), hwl = Math.min(170, hw / Math.max(0.2, Math.cos(lac * RAD)));
      if (hw / step > 90) return;
      const lines = [], N = 24;
      for (let la = Math.ceil((lac - hw) / step) * step; la <= lac + hw; la += step) { const L = new Float32Array((N + 1) * 3); for (let i = 0; i <= N; i++) L.set(ll(la, loc - hwl + 2 * hwl * i / N), i * 3); lines.push(L); }
      for (let lo = Math.ceil((loc - hwl) / step) * step; lo <= loc + hwl; lo += step) { const L = new Float32Array((N + 1) * 3); for (let i = 0; i <= N; i++) L.set(ll(lac - hw + 2 * hw * i / N, lo), i * 3); lines.push(L); }
      strokeSet(lines, B, r, gx, gy, true, a, 1);
    }

    function orbit(d, t, A, G) {
      const eB = eIO(seg(d, 0.12, 0.44)), eC = eIO(seg(d, 0.44, 0.58));
      const lon0 = -phase / RAD, lonB = 72 + 360 * Math.round((lon0 - 72) / 360);
      const lac = lerp(lerp(9.2, 52, eB), MSK[0], eC), loc = lerp(lerp(lon0, lonB, eB), lonB - 72 + MSK[1], eC);
      const a = lac * RAD, b = loc * RAD;
      const B = { n: [Math.cos(a) * Math.cos(b), Math.cos(a) * Math.sin(b), Math.sin(a)], e: [-Math.sin(b), Math.cos(b), 0], u: [-Math.sin(a) * Math.cos(b), -Math.sin(a) * Math.sin(b), Math.cos(a)] };
      const { x: gx, y: gy, r } = G;
      g.globalAlpha = A;
      // atmosphere and body
      const at = g.createRadialGradient(gx, gy, r * 0.92, gx, gy, r * 1.22);
      at.addColorStop(0, 'rgba(95,176,232,.32)'); at.addColorStop(0.35, 'rgba(95,176,232,.12)'); at.addColorStop(1, 'rgba(95,176,232,0)');
      g.fillStyle = at; g.beginPath(); g.arc(gx, gy, r * 1.22, 0, 6.2832); g.fill();
      const hx = gx - r * 0.24, hy = gy - r * 0.36, bg = g.createRadialGradient(hx, hy, 0, hx, hy, r * 1.5);
      bg.addColorStop(0, '#1f5d9c'); bg.addColorStop(0.55, '#0b2d58'); bg.addColorStop(1, '#051428');
      g.fillStyle = bg; g.beginPath(); g.arc(gx, gy, r, 0, 6.2832); g.fill();
      // grid
      const lw = clamp(1.1 * G.k, 1, 1.6);
      strokeSet(G30, B, r, gx, gy, false, 0.13 * (1 - seg(d, 0.2, 0.34)), lw);
      strokeSet(G30, B, r, gx, gy, true, 0.34, lw);
      strokeSet(G10, B, r, gx, gy, true, 0.2 * seg(d, 0.16, 0.3), 1);
      for (const [st, lo, hi] of [[2, 16, 60], [0.5, 16, 60], [0.1, 16, 60]]) fineGrid(st, lac, loc, B, r, gx, gy, 0.24 * smooth(lo, hi, r * st * RAD));
      // rim and highlight, as on the emblem
      const rimA = 1 - seg(d, 0.3, 0.46);
      if (rimA > 0) {
        g.strokeStyle = `rgba(143,208,255,${(0.7 * rimA).toFixed(3)})`; g.lineWidth = clamp(1.6 * G.k, 1, 2.4); g.beginPath(); g.arc(gx, gy, r, 0, 6.2832); g.stroke();
        g.strokeStyle = `rgba(255,255,255,${(0.35 * (1 - seg(d, 0.14, 0.26))).toFixed(3)})`; g.lineWidth = clamp(2.5 * G.k, 1, 4); g.lineCap = 'round';
        g.beginPath(); g.arc(gx, gy, r, -151.9 * RAD, -75.4 * RAD); g.stroke(); g.lineCap = 'butt';
      }
      // routes from Moscow
      const ap = seg(d, 0.24, 0.46), arcA = 1 - seg(d, 0.5, 0.58), pe = (x, y, z) => [gx + r * (x * B.e[0] + y * B.e[1] + z * B.e[2]), gy - r * (x * B.u[0] + y * B.u[1] + z * B.u[2])];
      const reached = new Set();
      if (ap > 0) {
        g.lineWidth = 1.4; g.strokeStyle = `rgba(143,208,255,${(0.8 * arcA).toFixed(3)})`;
        for (const arc of ARCS) {
          const t0 = seg(ap, arc.delay, arc.delay + 0.5); if (t0 <= 0) continue;
          const m = Math.max(1, Math.round(t0 * arc.n)), P = arc.pts;
          g.beginPath(); let pen = false, hx2 = 0, hy2 = 0, hv = false;
          for (let j = 0; j <= m; j++) {
            const x = P[j * 3], y = P[j * 3 + 1], z = P[j * 3 + 2];
            const px = x * B.e[0] + y * B.e[1] + z * B.e[2], py = x * B.u[0] + y * B.u[1] + z * B.u[2], pz = x * B.n[0] + y * B.n[1] + z * B.n[2];
            const vis = pz > 0 || px * px + py * py > 1;
            if (vis) { const X = gx + r * px, Y = gy - r * py; if (pen) g.lineTo(X, Y); else { g.moveTo(X, Y); pen = true; } hx2 = X; hy2 = Y; hv = true; } else { pen = false; hv = false; }
          }
          g.stroke();
          if (t0 < 1 && hv) { g.fillStyle = `rgba(232,242,255,${(0.95 * arcA).toFixed(3)})`; g.beginPath(); g.arc(hx2, hy2, 2.2, 0, 6.2832); g.fill(); }
          if (t0 >= 1) reached.add(arc.city);
        }
      }
      // cities
      const ca = seg(d, 0.22, 0.3) * (1 - seg(d, 0.62, 0.66));
      if (ca > 0) {
        CV.forEach((v, i) => {
          const pz = dot3(v, B.n); if (pz <= 0.02) return;
          const [X, Y] = pe(v[0], v[1], v[2]), hot = reached.has(i);
          g.fillStyle = `rgba(255,214,170,${(ca * (hot ? 0.3 : 0.12)).toFixed(3)})`; g.beginPath(); g.arc(X, Y, hot ? 6 : 4, 0, 6.2832); g.fill();
          g.fillStyle = `rgba(255,226,190,${(ca * (hot ? 1 : 0.6)).toFixed(3)})`; g.beginPath(); g.arc(X, Y, hot ? 2 : 1.4, 0, 6.2832); g.fill();
        });
        const [MX, MY] = pe(mv[0], mv[1], mv[2]);
        if (dot3(mv, B.n) > 0) {
          for (let k = 0; k < 2; k++) {
            const ph = (t * 0.0005 + k / 2) % 1;
            g.strokeStyle = `rgba(143,208,255,${(ca * (1 - ph) * 0.8).toFixed(3)})`; g.lineWidth = 1.2; g.beginPath(); g.arc(MX, MY, 4 + ph * 20, 0, 6.2832); g.stroke();
          }
          g.fillStyle = `rgba(232,242,255,${ca.toFixed(3)})`; g.beginPath(); g.arc(MX, MY, 3, 0, 6.2832); g.fill();
          const la = ca * seg(d, 0.28, 0.34) * (1 - seg(d, 0.5, 0.56));
          if (la > 0) { g.fillStyle = `rgba(232,238,247,${la.toFixed(3)})`; g.font = '500 13px "Golos Text", system-ui, sans-serif'; g.fillText('Москва', MX + 10, MY - 9); }
        }
      }
      g.globalAlpha = 1;
    }

    /* After the landing (k 0..1, heroState.k): a snap (k 0-0.11: the beam goes into the ground, the core gathers
       into the central chip), the wave (0.11-0.63: a front runs from the landing point to the horizon and the city
       turns into the board behind it; the camera barely moves, the horizon stays in frame), a pause (0.63-0.78:
       signals run out along the avenues), take-off (0.78-1: the camera rises into the flight pose, the board quiets
       down to background level, the main bus and the central chip stay lit). Before k > 0 nothing here changes. */
    const BG = '#040d1c';
    function ground(u, t, A, k = 0) {
      const narrow = W / H < 0.8, fov = (narrow ? 76 : 60) * RAD, FL = (H / 2) / Math.tan(fov / 2), HH = Math.max(H, Hc);
      const h0 = Math.exp(lerp(Math.log(46), Math.log(1.5), eOut(u))), th0 = lerp(-89, -12, eIO(seg(u, 0.1, 0.95)));
      let h = h0, thd = th0, Cx = 0, Cz = h0 * 1.6 * eIO(seg(u, 0.35, 1)) - h0 / Math.tan(-th0 * RAD);
      const thF = narrow ? -27 : -20, CxF = narrow ? 0.5 : 1.0; // flight pose; the bus comes in from the lower right, not through the middle of the text
      if (FLY.on) { h = FLY.h; thd = thF; Cx = CxF; Cz = FLY.z; k = 1; }
      else if (k > 0) {
        const e1 = eIO(seg(k, 0.05, 0.63)), e2 = eIO(seg(k, 0.78, 1));
        h = lerp(lerp(1.5, 2.4, e1), 3.4, e2); thd = lerp(lerp(-12, -18, e1), thF, e2);
        Cz = lerp(Cz, flightZ0(), e2); Cx = CxF * e2;
      }
      const th = thd * RAD, st = Math.sin(th), ct = Math.cos(th), dist = h / -st;
      const C = [Cx, h, Cz], f = [0, st, ct], rv = [-1, 0, 0], up = [0, ct, -st];
      const cx = W / 2, cy = H / 2;
      const cam = (x, y, z) => { const dx = x - C[0], dy = y - C[1], dz = z - C[2]; return [dx * rv[0] + dy * rv[1] + dz * rv[2], dx * up[0] + dy * up[1] + dz * up[2], dx * f[0] + dy * f[1] + dz * f[2]]; };
      const NEAR = 0.05;
      const P = (x, z) => { const c = cam(x, 0, z); return c[2] < NEAR ? null : [cx + c[0] / c[2] * FL, cy - c[1] / c[2] * FL, c[2]]; };
      const snap = eOut(seg(k, 0.02, 0.11)), w = seg(k, 0.11, 0.63), ew = eOut(seg(w, 0, 0.45)), R = w > 0 ? 2.5 + 68 * Math.pow(w, 1.6) : 0;
      const dim = lerp(1, 0.45, eIO(seg(k, 0.8, 1))) * (FLY.on ? FLY.dimFast : 1); // after take-off the board is background, the bus stays lit
      // beyond the city disk (the corridor along the bus) there is no city: that part of the board appears at the end of the wave
      const mAt = d => R > 0 ? Math.max(smooth(0, 1, (R - d) / 4), d > 62 ? smooth(0.75, 1, w) : 0) : 0;
      const zLo = Cz - 1, zHi = Cz + 100; // what the camera can see along the bus
      const voidA = FLY.on ? smooth(STN.cam[2], STN.cam[3], Cz) : 0; // the edge of the board and the stars past it, near the end of the flight
      const fogD = z => 1 - smooth(30, 90, z);
      g.globalAlpha = A;
      const Yh = cy + st / ct * FL, top = Math.max(0, Yh);
      const gg = g.createLinearGradient(0, Math.max(Yh, -H), 0, H);
      gg.addColorStop(0, '#0d2d5c'); gg.addColorStop(0.25, '#071a38'); gg.addColorStop(1, '#030b1a');
      g.fillStyle = gg; g.fillRect(0, top, W, HH - top);
      if (w > 0) { g.globalAlpha = A * 0.7 * ew; g.fillStyle = BG; g.fillRect(0, top, W, HH - top); g.globalAlpha = A; }
      const hzA = lerp(1, 0.5, ew) * (1 - voidA);
      if (Yh > 0) {
        const sg = g.createLinearGradient(0, Yh, 0, Yh - H * 0.5);
        sg.addColorStop(0, `rgba(70,150,225,${(0.5 * hzA).toFixed(3)})`); sg.addColorStop(0.3, `rgba(30,80,160,${(0.18 * hzA).toFixed(3)})`); sg.addColorStop(1, 'rgba(10,30,70,0)');
        g.fillStyle = sg; g.fillRect(0, Yh - H * 0.5, W, H * 0.5);
      }
      // ground grid, several scales fading by on-screen spacing; the board keeps only the fine one, quiet (0.05)
      const seg3 = (x0, z0, x1, z1) => {
        let a = cam(x0, 0, z0), b = cam(x1, 0, z1);
        if (a[2] < NEAR && b[2] < NEAR) return;
        if (a[2] < NEAR) { const q = (NEAR - a[2]) / (b[2] - a[2]); a = [a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q, NEAR]; }
        if (b[2] < NEAR) { const q = (NEAR - b[2]) / (a[2] - b[2]); b = [b[0] + (a[0] - b[0]) * q, b[1] + (a[1] - b[1]) * q, NEAR]; }
        g.moveTo(cx + a[0] / a[2] * FL, cy - a[1] / a[2] * FL); g.lineTo(cx + b[0] / b[2] * FL, cy - b[1] / b[2] * FL);
      };
      if (ew >= 0.999) for (const [d0, d1, ga] of [[0, 18, 0.05], [18, 42, 0.025]]) {
        const za = Math.ceil((Cz + 0.5 + d0) * 2) / 2, zb = Math.min(Cz + d1, ZE);
        if (zb <= za) continue;
        g.beginPath();
        for (let x = Math.floor((Cx - 30) * 2) / 2; x <= Cx + 30; x += 0.5) seg3(x, za, x, zb);
        for (let z = za; z <= zb; z += 0.5) seg3(Cx - 30, z, Cx + 30, z);
        g.strokeStyle = `rgba(95,176,232,${ga})`; g.lineWidth = 1; g.stroke();
      }
      else for (const gs of [0.5, 2, 8, 32, 128]) {
        const sp = gs * FL / dist;
        const a = 0.2 * smooth(12, 46, sp) * (1 - 0.6 * smooth(300, 900, sp)) * (gs === 0.5 ? lerp(1, 0.25, ew) : 1 - ew);
        if (a <= 0.004) continue;
        const E = Math.min(gs * 36, 400);
        g.beginPath();
        for (let i = -E; i <= E + 1e-6; i += gs) { seg3(i, -E, i, E); seg3(-E, i, E, i); }
        g.strokeStyle = `rgba(95,176,232,${a.toFixed(3)})`; g.lineWidth = 1; g.stroke();
      }
      // the front of the wave: the last landing ring keeps growing to the horizon
      if (w > 0 && w < 1) {
        g.beginPath(); let pen = false;
        for (let i = 0; i <= 120; i++) { const a = i / 120 * 6.2832, q = P(Math.sin(a) * R, Math.cos(a) * R); if (!q) { pen = false; continue; } pen ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); pen = true; }
        g.strokeStyle = `rgba(143,208,255,${(0.6 * (1 - smooth(0.7, 1, w))).toFixed(3)})`; g.lineWidth = 1.5; g.stroke();
      }
      // roads: organic until the front passes, then straight traces (avenues) and octagons (rings)
      const traceB = new Map();
      for (const rd of CITY.roads) {
        rd.vis = rd.zmax > zLo && rd.zmin < zHi; if (!rd.vis) continue;
        const n = rd.dist.length, cur = rd.cur, mm = rd.m;
        for (let j = 0; j < n; j++) { const m = mAt(rd.dist[j]); mm[j] = m; cur[2 * j] = lerp(rd.org[2 * j], rd.snap[2 * j], m); cur[2 * j + 1] = lerp(rd.org[2 * j + 1], rd.snap[2 * j + 1], m); }
        if (R <= 0) continue;
        for (let j = 0; j < n - 1; j++) {
          const m = Math.min(mm[j], mm[j + 1]); if (m <= 0.02) continue;
          const a = cam(cur[2 * j], 0, cur[2 * j + 1]), b = cam(cur[2 * j + 2], 0, cur[2 * j + 3]);
          if (a[2] < NEAR || b[2] < NEAR) continue;
          const z = (a[2] + b[2]) / 2, key = (rd.main ? 100 : rd.street ? 200 : 0) + (m < 0.4 ? 0 : m < 0.8 ? 10 : 20) + (z < 5 ? 0 : z < 14 ? 1 : z < 35 ? 2 : 3);
          let L = traceB.get(key); if (!L) traceB.set(key, L = []);
          L.push(cx + a[0] / a[2] * FL, cy - a[1] / a[2] * FL, cx + b[0] / b[2] * FL, cy - b[1] / b[2] * FL);
        }
      }
      g.lineCap = 'round';
      for (const [key, L] of traceB) {
        const type = (key / 100) | 0, li = ((key % 100) / 10) | 0, di = key % 10, zm = [3, 9, 24, 60][di]; // type: 0 avenue or ring, 1 main bus, 2 street
        const a = [0.45 * dim, 0.55, 0.36 * dim][type] * [0.35, 0.7, 1][li] * fogD(zm);
        g.beginPath(); for (let i = 0; i < L.length; i += 4) { g.moveTo(L[i], L[i + 1]); g.lineTo(L[i + 2], L[i + 3]); }
        g.strokeStyle = `rgba(143,208,255,${a.toFixed(3)})`; g.lineWidth = clamp([0.04, 0.05, 0.03][type] * FL / zm, 0.5, [2, 2.6, 1.5][type]); g.stroke();
      }
      // districts become chips: a dark body with a thin outline appears as their lights gather on the edges
      const quad = (x0, z0, x1, z1) => { const a = P(x0, z0), b = P(x1, z0), c = P(x1, z1), d = P(x0, z1); if (!a || !b || !c || !d) return false; g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath(); return true; };
      for (const bk of CITY.blocks) {
        const m = mAt(bk.d); bk.mm = m; bk.vis = bk.z > zLo && bk.z < zHi; if (m <= 0.02 || !bk.vis) continue;
        g.beginPath(); if (!quad(bk.x - bk.w / 2, bk.z - bk.h / 2, bk.x + bk.w / 2, bk.z + bk.h / 2)) continue;
        g.fillStyle = `rgba(8,21,40,${(0.92 * m).toFixed(3)})`; g.fill();
        g.strokeStyle = `rgba(143,208,255,${(0.4 * m * dim * fogD(bk.d)).toFixed(3)})`; g.lineWidth = 1; g.stroke();
      }
      for (const pt of CITY.parts) { // pairs of lights become small parts: two pads and a body
        const m = mAt(pt.d); pt.mm = m; pt.vis = pt.z > zLo && pt.z < zHi; if (m <= 0.05 || !pt.vis) continue;
        const bx = pt.x + (pt.o ? 0.125 : 0), bz = pt.z + (pt.o ? 0 : 0.125);
        g.beginPath(); if (quad(bx - (pt.o ? 0.07 : 0.045), bz - (pt.o ? 0.045 : 0.07), bx + (pt.o ? 0.07 : 0.045), bz + (pt.o ? 0.045 : 0.07))) { g.fillStyle = `rgba(28,52,88,${(m * dim).toFixed(3)})`; g.fill(); }
      }
      // lights: warm while they are city, blue pads once the front has passed; batched by brightness
      const warm = Array.from({ length: 9 }, () => []), blue = Array.from({ length: 9 }, () => []);
      const put = (x, z, aw, ab, big) => {
        const q = P(x, z); if (!q || q[0] < -4 || q[0] > W + 4 || q[1] < -4 || q[1] > HH + 4) return;
        const fg = 1 - smooth(40, 160, q[2]);
        if (aw * fg > 0.03) warm[Math.min(8, Math.round(aw * fg * 8))].push(q[0], q[1], clamp(0.07 * FL / q[2], 0.8, 3.6));
        if (ab * fg > 0.03) blue[Math.min(8, Math.round(ab * fg * 8))].push(q[0], q[1], clamp((big ? 0.05 : 0.045) * FL / q[2], 0.8, big ? 3.6 : 3.2));
      };
      for (const L of CITY.lights) {
        if (L.road !== undefined) {
          const rd = CITY.roads[L.road], j = L.j, m = rd.m[j]; if (!rd.vis || m > 0.98 || rd.dist[j] > 62) continue;
          const ax = rd.cur[2 * j], az = rd.cur[2 * j + 1], bx = rd.cur[2 * j + 2], bz = rd.cur[2 * j + 3], ln = Math.hypot(bx - ax, bz - az) || 1;
          put(lerp(ax, bx, L.t) + (bz - az) / ln * L.off, lerp(az, bz, L.t) - (bx - ax) / ln * L.off, L.b * (1 - m), 0);
        } else { if (L.oz < zLo || L.oz > zHi) continue; const m = mAt(L.d); put(lerp(L.ox, L.sx, m), lerp(L.oz, L.sz, m), L.d > 62 ? 0 : L.b * (1 - m), L.out ? 0 : 0.75 * m * dim); }
      }
      for (const bk of CITY.blocks) { if (!bk.vis) continue; const m = bk.mm || 0; for (const q of bk.pins) put(lerp(q.ox, q.sx, m), lerp(q.oz, q.sz, m), bk.d > 62 ? 0 : q.b * (1 - m), 0.7 * m * dim); }
      for (const pt of CITY.parts) {
        if (!pt.vis) continue;
        const m = pt.mm || 0, x2 = pt.x + (pt.o ? 0.25 : 0), z2 = pt.z + (pt.o ? 0 : 0.25);
        put(lerp(pt.a.ox, pt.x, m), lerp(pt.a.oz, pt.z, m), pt.a.b * (1 - m), 0.6 * m * dim); put(lerp(pt.c.ox, x2, m), lerp(pt.c.oz, z2, m), pt.c.b * (1 - m), 0.6 * m * dim);
      }
      for (const q of CITY.core) put(lerp(q.ox, q.sx, snap), lerp(q.oz, q.sz, snap), q.b * (1 - snap), 0.9 * snap, true);
      for (let i = 0; i < 9; i++) {
        if (warm[i].length) { g.fillStyle = `rgba(255,208,150,${(i / 8).toFixed(3)})`; const L = warm[i]; for (let j = 0; j < L.length; j += 3) g.fillRect(L[j] - L[j + 2] / 2, L[j + 1] - L[j + 2] / 2, L[j + 2], L[j + 2]); }
        if (blue[i].length) { g.fillStyle = `rgba(143,208,255,${(i / 8).toFixed(3)})`; const L = blue[i]; for (let j = 0; j < L.length; j += 3) g.fillRect(L[j] - L[j + 2] / 2, L[j + 1] - L[j + 2] / 2, L[j + 2], L[j + 2]); }
      }
      // stations of the flight: an object for every section, at board level until the camera arrives (FLY.lit), then lit
      if (zHi > STN.obj[0] - 3) {
        const pk = (i, base) => Math.min(1, base + (FLY.lit[i] || 0));
        const stroke = (a, lw) => { g.strokeStyle = `rgba(143,208,255,${a.toFixed(3)})`; g.lineWidth = lw; g.stroke(); };
        const lwAt = z => clamp(0.045 * FL / Math.max(0.5, z - Cz), 0.6, 2.2);
        const dot = (x, z, k0, max) => { const q = P(x, z); if (q) { const sz = clamp(k0 * FL / q[2], 0.8, max); g.fillRect(q[0] - sz / 2, q[1] - sz / 2, sz, sz); } };
        const body = (x0, z0, x1, z1, a, lw = 1.2) => { g.beginPath(); if (quad(x0, z0, x1, z1)) { g.fillStyle = 'rgba(8,21,40,.95)'; g.fill(); stroke(a, lw); } };
        const glowAt = (x, z, rr, a) => { const q = P(x, z); if (q && a > 0) { const r = clamp(rr * FL / q[2], 10, 80); g.globalAlpha = A * a; g.drawImage(GLOW, q[0] - r, q[1] - r, 2 * r, 2 * r); g.globalAlpha = A; } };
        // 1. «Как мы работаем»: four chips in a row across the bus, fed by a branch; they power up with the steps on the page
        { const z = STN.obj[0], a = pk(0, 0.3 * dim);
          g.beginPath(); seg3(0, z, -1.75, z); for (let c = 0; c < 3; c++) seg3(-2.85 - c * 1.6, z, -3.35 - c * 1.6, z); stroke(a, lwAt(z));
          for (let c = 0; c < 4; c++) {
            const x = -2.3 - c * 1.6, pw = FLY.chips[c] || 0;
            glowAt(x, z, 1.6, 0.5 * pw);
            body(x - 0.55, z - 0.55, x + 0.55, z + 0.55, 0.25 + 0.55 * Math.max(pw, a));
            g.fillStyle = `rgba(143,208,255,${(0.3 + 0.65 * Math.max(pw, a * 0.5)).toFixed(3)})`;
            for (let j = 0; j < 5; j++) { const o = -0.4 + j * 0.2; dot(x + o, z - 0.66, 0.07, 3.2); dot(x + o, z + 0.66, 0.07, 3.2); dot(x - 0.66, z + o, 0.07, 3.2); dot(x + 0.66, z + o, 0.07, 3.2); }
          } }
        // 2. «Готовые конфигурации»: a processor socket with two memory slots on each side
        { const z = STN.obj[1], x = -4.4, a = pk(1, 0.3 * dim);
          g.beginPath(); seg3(0, z, -1.6, z); stroke(a, lwAt(z));
          glowAt(x, z, 2.4, 0.45 * (FLY.lit[1] || 0));
          body(x - 1.2, z - 1.2, x + 1.2, z + 1.2, 0.25 + 0.5 * a);
          g.beginPath(); if (quad(x - 0.92, z - 0.92, x + 0.92, z + 0.92)) stroke(0.18 + 0.4 * a, 1);
          g.fillStyle = `rgba(143,208,255,${(0.22 + 0.5 * a).toFixed(3)})`;
          for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) dot(x - 0.72 + i * 0.24, z - 0.72 + j * 0.24, 0.05, 2.6);
          for (const sx of [-1.75, -2.1, -6.7, -7.05]) body(sx - 0.1, z - 1.5, sx + 0.1, z + 1.5, 0.2 + 0.45 * a, 1); }
        // 3. «Объекты под ключ»: a network node with two rows of ports and a fan of traces to workplaces and cameras
        { const z = STN.obj[2], a = pk(2, 0.3 * dim);
          g.beginPath(); seg3(0, z, -3.1, z);
          const ends = [];
          for (let j = 0; j < 14; j++) {
            const zp = z - 0.36 + (j % 7) * 0.12, zt = z + (j - 6.5) * 0.62, xt = -8.6 - (j % 3) * 1.5, xb = -5.4 - (j % 2) * 0.2, dz = Math.abs(zt - zp);
            seg3(-4.9, zp, xb, zp); seg3(xb, zp, xb - dz, zt); seg3(xb - dz, zt, xt, zt); ends.push([xt, zt]);
          }
          stroke(0.25 + 0.5 * a, lwAt(z) * 0.8);
          glowAt(-4, z, 1.8, 0.45 * (FLY.lit[2] || 0));
          body(-4.9, z - 0.45, -3.1, z + 0.45, 0.25 + 0.5 * a);
          g.fillStyle = `rgba(143,208,255,${(0.3 + 0.55 * a).toFixed(3)})`;
          for (let i = 0; i < 8; i++) { dot(-4.72 + i * 0.2, z - 0.18, 0.08, 3); dot(-4.72 + i * 0.2, z + 0.18, 0.08, 3); }
          for (const [x2, z2] of ends) dot(x2, z2, 0.12, 4); }
        // 4. «Почему выбирают нас»: four checkpoints on a calm stretch of the bus
        { const a = pk(3, 0.35 * dim);
          for (let j = 0; j < 4; j++) { const q = P(0, STN.obj[3] - 1.5 + j); if (!q) continue; const r = clamp(0.22 * FL / q[2], 2, 10); g.beginPath(); g.ellipse(q[0], q[1], r, r * 0.45, 0, 0, 6.2832); g.fillStyle = BG; g.fill(); stroke(0.3 + 0.6 * a, 1.2); } }
        // 5. «Заявка»: the board ends with an edge connector; past the edge there is no board, only the stars
        if (voidA > 0) {
          const qe = P(Cx, ZE);
          if (qe && qe[1] > Yh) {
            g.globalCompositeOperation = 'destination-out'; g.globalAlpha = voidA;
            const y0 = Yh - H * 0.5, gr = g.createLinearGradient(0, qe[1] - 8, 0, qe[1]); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
            g.fillStyle = '#000'; g.fillRect(0, y0, W, qe[1] - 8 - y0); g.fillStyle = gr; g.fillRect(0, qe[1] - 8, W, 8);
            g.globalCompositeOperation = 'source-over'; g.globalAlpha = A;
          }
        }
        { const a = pk(4, 0.35 * dim);
          g.beginPath(); seg3(-40, ZE, 40, ZE); stroke((0.15 + 0.35 * a) * Math.max(voidA, 0.4), 1);
          glowAt(0, ZE - 0.4, 2, 0.45 * (FLY.lit[4] || 0));
          g.fillStyle = `rgba(143,208,255,${(0.35 + 0.5 * a).toFixed(3)})`;
          for (let j = 0; j < 14; j++) { const x = -1.95 + j * 0.3; g.beginPath(); if (quad(x - 0.08, ZE - 0.75, x + 0.08, ZE - 0.15)) g.fill(); } }
      }
      // glow of the landing point; it stays faint round the chip
      const M0 = cam(0, 0, 0);
      if (M0[2] > 0.1) {
        const MX = cx + M0[0] / M0[2] * FL, MY = cy - M0[1] / M0[2] * FL, gr = 22 * lerp(1, 1.8, snap), gl = g.createRadialGradient(MX, MY, 0, MX, MY, gr);
        gl.addColorStop(0, `rgba(143,208,255,${(0.55 * lerp(1, 0.5, snap)).toFixed(3)})`); gl.addColorStop(1, 'rgba(143,208,255,0)');
        g.fillStyle = gl; g.fillRect(MX - gr, MY - gr, 2 * gr, 2 * gr);
      }
      // the central chip with the emblem's triangle: the Sarmat itself has landed and become the centre of the board
      if (snap > 0) {
        g.beginPath();
        if (quad(-0.25, -0.25, 0.25, 0.25)) {
          g.fillStyle = `rgba(8,21,40,${(0.95 * snap).toFixed(3)})`; g.fill();
          g.strokeStyle = `rgba(143,208,255,${(0.8 * snap).toFixed(3)})`; g.lineWidth = 1.2; g.stroke();
        }
        const ta = 0.55 * seg(k, 0.09, 0.2), T = [P(0, 0.165), P(-0.145, -0.09), P(0.145, -0.09)];
        if (ta > 0 && T.every(Boolean)) {
          g.beginPath(); g.moveTo(T[0][0], T[0][1]); g.lineTo(T[1][0], T[1][1]); g.lineTo(T[2][0], T[2][1]); g.closePath();
          g.strokeStyle = `rgba(232,242,255,${ta.toFixed(3)})`; g.lineWidth = 1.1; g.lineJoin = 'miter'; g.stroke();
        }
      }
      if (Yh > -H * 0.3) {
        const hz = g.createLinearGradient(0, Yh, 0, Yh + H * 0.28);
        hz.addColorStop(0, `rgba(95,176,232,${(0.3 * hzA).toFixed(3)})`); hz.addColorStop(1, 'rgba(95,176,232,0)');
        g.fillStyle = hz; g.fillRect(0, Yh, W, H * 0.28);
        g.fillStyle = `rgba(143,208,255,${lerp(0.4, 0.25, ew).toFixed(3)})`; g.fillRect(0, Yh - 0.5, W, 1);
      }
      // landing marker: rings and the beam go into the ground on the snap, the glow stays faint under the chip
      const M = cam(0, 0, 0);
      if (M[2] > 0.1) {
        const MX = cx + M[0] / M[2] * FL, MY = cy - M[1] / M[2] * FL, ra = 1 - snap;
        if (ra > 0) for (let j = 0; j < 3; j++) {
          const ph = (t * 0.00035 + j / 3) % 1, rr = 0.25 + ph * 3.2;
          g.beginPath();
          for (let i = 0; i <= 48; i++) {
            const c = cam(Math.cos(i / 48 * 6.2832) * rr, 0, Math.sin(i / 48 * 6.2832) * rr); if (c[2] < NEAR) continue;
            const X = cx + c[0] / c[2] * FL, Y = cy - c[1] / c[2] * FL; i ? g.lineTo(X, Y) : g.moveTo(X, Y);
          }
          g.strokeStyle = `rgba(143,208,255,${((1 - ph) * 0.75 * ra).toFixed(3)})`; g.lineWidth = 1.3; g.stroke();
        }
        const T2 = cam(0, 5 * (1 - seg(k, 0, 0.07)), 0);
        if (T2[2] > NEAR && k < 0.07) {
          const TX = cx + T2[0] / T2[2] * FL, TY = cy - T2[1] / T2[2] * FL, bm = g.createLinearGradient(MX, MY, TX, TY);
          bm.addColorStop(0, 'rgba(143,208,255,.85)'); bm.addColorStop(1, 'rgba(143,208,255,0)');
          g.strokeStyle = bm; g.lineWidth = 2; g.beginPath(); g.moveTo(MX, MY); g.lineTo(TX, TY); g.stroke();
        }
        if (ra > 0) { g.fillStyle = `rgba(232,242,255,${ra.toFixed(3)})`; g.beginPath(); g.arc(MX, MY, 2.6, 0, 6.2832); g.fill(); }
      }
      // signals: in the pause three run out to the horizon and one towards the viewer, then one along the main bus every 4 s
      const sig = (ai, r, a) => {
        const an = ai * Math.PI / 4, q = P(Math.sin(an) * r, Math.cos(an) * r); if (!q || a <= 0) return;
        const s = clamp(0.12 * FL / q[2], 5, 18); g.globalAlpha = A * a; g.drawImage(GLOW, q[0] - s, q[1] - s, 2 * s, 2 * s);
        g.fillStyle = '#eaf6ff'; g.beginPath(); g.arc(q[0], q[1], clamp(0.012 * FL / q[2], 1.2, 2.6), 0, 6.2832); g.fill(); g.globalAlpha = A;
      };
      if (FLY.on) { const q = FLY.sig; if (q) { const zz = q.z0 + (t - q.t0) / 1000 * q.v; if (zz < q.z1) sig(0, zz, 1 - smooth(q.z1 - 1.5, q.z1, zz)); } } // one signal on the bus, to the next station
      else if (k > 0.63 && k < 0.78) { const sp = seg(k, 0.63, 0.78), fa = 1 - smooth(0.8, 1, sp); for (const ai of [0, 1, 7]) sig(ai, 0.4 + sp * 40, fa); sig(4, 0.4 + sp * 8, fa); }
      else if (k >= 0.78) { const r = 0.4 + ((t / 1000) % 4) * 9; sig(0, r, 1 - smooth(26, 36, r)); }
      g.globalAlpha = 1;
    }

    function clouds(d) {
      const env = bell(d, 0.55, 0.66, 0.78); if (env <= 0.004) return;
      const w = seg(d, 0.56, 0.76), big = Math.max(W, H);
      for (const c of PUFFS) {
        const rz = c.z - w * 1.3 + 0.08; if (rz < 0.04) continue;
        const k = 0.42 / rz, X = W / 2 + c.x * W * 0.5 * k, Y = H / 2 + c.y * H * 0.5 * k, S = c.s * big * 0.5 * k;
        const a = c.a * env * smooth(0.04, 0.2, rz) * (1 - smooth(0.9, 1.3, rz));
        if (a < 0.01 || X + S / 2 < 0 || X - S / 2 > W || Y + S / 2 < 0 || Y - S / 2 > H) continue;
        g.globalAlpha = a; g.drawImage(CLOUD, X - S / 2, Y - S / 2, S, S);
      }
      g.globalAlpha = 1;
      const hz = 0.62 * bell(d, 0.6, 0.66, 0.73);
      if (hz > 0.004) { g.fillStyle = `rgba(92,132,186,${hz.toFixed(3)})`; g.fillRect(0, 0, W, H); }
    }

    // camera z of the flight pose right after take-off: the central chip at 88% of the height (on phones just below the edge)
    function flightZ0() {
      const narrow = W / H < 0.8, FL = (H / 2) / Math.tan((narrow ? 76 : 60) * RAD / 2), thF = narrow ? -27 : -20;
      return -3.4 / Math.tan(-thF * RAD + Math.atan((narrow ? 0.56 : 0.38) * H / FL));
    }
    function draw(t, fromFlight) {
      if (FLY.on && !fromFlight) return; // after take-off the flight draws the world
      const d = heroState.d, k = heroState.k;
      if (d < 0.05 || REDUCE) { if (drawn) { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); drawn = false; } return; }
      drawn = true;
      g.setTransform(D, 0, 0, D, 0, 0);
      g.clearRect(0, 0, Wc, Hc);
      const oA = seg(d, 0.05, 0.09) * (1 - seg(d, 0.64, 0.68)), gA = seg(d, 0.64, 0.68);
      if (oA > 0) orbit(d, t, oA, globeAt(d));
      if (gA > 0) ground(seg(d, 0.66, 1), t, gA, k);
      clouds(d);
    }
    return { size, draw, flightZ0, STN };
  })();

  let hintOn = false, tickT = 0;
  function tick(t) {
    if (intro < 1) { introT0 = introT0 || t; intro = clamp((t - introT0 - INTRO_DELAY) / INTRO_MS); }
    const target = progress(), dt = tickT ? Math.min(100, t - tickT) : 16.7; tickT = t;
    // follow the scroll with a 110 ms time constant, the same on 60 and 120 Hz screens and when frames drop
    cur = Math.abs(target - cur) < 1e-5 ? target : lerp(cur, target, 1 - Math.exp(-dt / 110));
    render(false);
    spinGlobe(t);
    planet.draw(t);
    const h = intro >= 1 && cur < L_END + 0.012 && !chapter.running();
    if (h !== hintOn) { hintOn = h; hint.classList.toggle('on', h); }
  }

  /* ---------- one gesture plays the chapter ---------- */
  /* Inside the hero a wheel turn, a swipe or an arrow key does not scroll the page: it starts a ride.
     Down: the descent with its captions, then on to «Как мы работаем». Up: back to the assembled logo.
     The ride moves the real scroll position, so anchors, the scrollbar and the header keep working;
     while it runs, input in the same direction is swallowed, the opposite direction turns it around,
     and a link, the scrollbar or Home/End cancels it. On touch screens the ride does not compare scrollY with
     where it put the page: phones report the position late, and that check stopped every ride the moment
     the finger left the screen (Anton's phones, all browsers, 11.10.2026). With a mouse it checks loosely:
     a page far from all of the last few targets was moved by someone else (dragging the scrollbar). */
  const chapter = (() => {
    const proc = document.getElementById('process');
    const html = document.documentElement;
    // Seconds of the way down from the assembled logo, by descent progress d. Captions get time to read.
    const PLAN = [[0, 0.35], [0.24, 0.95], [0.47, 1.2], [0.64, 1.0], [0.86, 0.7], [1, 0.9]];
    const TAIL = [2.7, 1.0]; // landed: the Earth turns into the board and the camera takes off (stage still pinned), then on to the process section
    const UP = 0.4;           // the way up is the same path, faster
    const R_IN = 0.45, R_OUT = 0.7; // speed ramps at the start and the end, seconds
    // native: the ride failed to move the page on this device, so scrolling is left to the browser
    // (the hero still follows the scroll position, as a scrubbed animation).
    let run = null, touchY = null, native = false, last = '';
    const MOUSE = matchMedia('(hover: hover) and (pointer: fine)').matches;
    function path() {
      const top = track.getBoundingClientRect().top + scrollY, len = Math.max(1, track.offsetHeight - stage.clientHeight);
      const yOf = d => top + len * (D0 + d * (D1 - D0) - L_END) / (1 - L_END);
      const pts = [[0, 0]]; let t = 0;
      for (const [d, dt] of PLAN) { t += dt; pts.push([yOf(d), t]); }
      t += TAIL[0]; pts.push([top + len, t]);
      t += TAIL[1]; pts.push([proc.getBoundingClientRect().top + scrollY, t]);
      return pts;
    }
    // y -> plan time and back, piecewise linear between the points
    const timeAt = (pts, y) => { for (let i = 1; i < pts.length; i++) if (y <= pts[i][0]) return lerp(pts[i - 1][1], pts[i][1], seg(y, pts[i - 1][0], pts[i][0])); return pts[pts.length - 1][1]; };
    const yAt = (pts, t) => { for (let i = 1; i < pts.length; i++) if (t <= pts[i][1]) return lerp(pts[i - 1][0], pts[i][0], seg(t, pts[i - 1][1], pts[i][1])); return pts[pts.length - 1][0]; };
    const end = () => proc.getBoundingClientRect().top + scrollY;
    const inZone = () => scrollY < end() - 2;
    function start(dir) {
      const pts = path(), s0 = timeAt(pts, scrollY), S = dir > 0 ? pts[pts.length - 1][1] - s0 : s0;
      if (S < 0.02) return;
      const k = dir > 0 ? 1 : UP, T = S * k + (R_IN + R_OUT) / 2;
      const r = run = { dir, pts, s0, S: S * k, k, T, t0: performance.now(), y: scrollY, hist: [scrollY] };
      html.style.scrollBehavior = 'auto';
      ticker.add(step);
      // Watchdog: a ride that should go far but has not moved the page in 1.2 s means scrolling from script
      // does not work here (seen on a phone 11.10.2026). Never trap the visitor: hand scrolling back to the browser.
      const y0 = scrollY;
      if (Math.abs(yAt(pts, dir > 0 ? pts[pts.length - 1][1] : 0) - y0) > 60)
        setTimeout(() => { if ((run === r || !run) && Math.abs(scrollY - y0) < 8) { if (run) stop('watchdog'); native = true; } }, 1200);
    }
    function stop(why) { run = null; last = why || ''; html.style.scrollBehavior = ''; ticker.remove(step); }
    function step(now) {
      if (!run) return false;
      if (MOUSE && (scrollY < Math.min(...run.hist) - 40 || scrollY > Math.max(...run.hist) + 40)) { stop('scroll'); return false; }
      const t = Math.min(run.T, (now - run.t0) / 1000), { T, S } = run;
      // distance along the plan with smooth speed-up and slow-down
      const s = t < R_IN ? t * t / (2 * R_IN) : t > T - R_OUT ? S - (T - t) * (T - t) / (2 * R_OUT) : R_IN / 2 + (t - R_IN);
      const pt = run.s0 + run.dir * clamp(s, 0, S) / run.k;
      run.y = Math.round(yAt(run.pts, pt));
      run.hist.push(run.y); if (run.hist.length > 8) run.hist.shift();
      scrollTo(0, run.y);
      if (t >= T) { stop('done'); return false; }
    }
    function gesture(dir) {
      if (run && run.dir === dir) return;
      if (dir < 0 && scrollY <= 0) return;
      start(dir);
    }
    const skip = el => el && el.closest && el.closest('.asst, .cookie, input, textarea, select');
    if (!REDUCE) {
      addEventListener('wheel', e => {
        if (native || e.ctrlKey || !inZone() || skip(e.target) || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
        e.preventDefault();
        if (Math.abs(e.deltaY) >= 1) gesture(e.deltaY > 0 ? 1 : -1);
      }, { passive: false });
      addEventListener('touchstart', e => { touchY = e.touches.length === 1 && !skip(e.target) ? e.touches[0].clientY : null; }, { passive: true });
      addEventListener('touchmove', e => {
        if (native || touchY === null || e.touches.length > 1 || !inZone()) return;
        const dy = touchY - e.touches[0].clientY;
        if (scrollY <= 0 && dy <= 0 && !run) return; // at the very top a pull down stays the browser's (refresh)
        e.preventDefault();
        if (Math.abs(dy) > 12) { gesture(dy > 0 ? 1 : -1); touchY = e.touches[0].clientY; }
      }, { passive: false });
      addEventListener('keydown', e => {
        if (run && (e.key === 'Home' || e.key === 'End')) { stop('key'); return; }
        if (native || e.altKey || e.ctrlKey || e.metaKey || !inZone() || skip(e.target)) return;
        const onCtl = e.target.closest && e.target.closest('a, button');
        const dir = e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey && !onCtl) ? 1
          : e.key === 'ArrowUp' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey && !onCtl) ? -1 : 0;
        if (!dir) return;
        e.preventDefault(); gesture(dir);
      });
      hint.addEventListener('click', () => native ? proc.scrollIntoView({ behavior: 'smooth' }) : gesture(1));
      addEventListener('click', e => { if (run && e.target.closest && e.target.closest('a[href]')) stop('link'); }, true); // a link wins
      addEventListener('mousedown', e => { if (run && e.clientX >= html.clientWidth) stop('scrollbar'); });
    }
    return { running: () => !!run, up: () => start(-1), state: () => ({ ride: run ? run.dir : 0, native, last }) };
  })();

  // ?debug: ride state, screen and errors in a strip at the top, to check a phone without devtools
  if (/[?&]debug\b/.test(location.search)) {
    const box = document.createElement('pre');
    box.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:9999;margin:0;padding:6px 8px;font:11px/1.35 monospace;color:#cfe6fb;background:rgba(0,0,0,.82);white-space:pre-wrap;pointer-events:none';
    document.body.appendChild(box);
    setInterval(() => {
      const s = chapter.state();
      box.textContent = `${innerWidth}x${innerHeight} dpr ${devicePixelRatio} y ${Math.round(scrollY)} ride ${s.ride} native ${s.native} last ${s.last} reduce ${REDUCE}\n${navigator.userAgent}\n${ERRS.slice(-3).join('\n')}`;
    }, 250);
  }

  /* ---------- the flight over the board, section by section ---------- */
  /* After take-off (heroState.k = 1) this loop owns the world canvas. The camera flies along the main bus and has one
     station per section (STN.cam). While a section is read the camera stands and only sinks a little (the ground moves
     up with the text); it flies on to the next station while the next section comes in, with a speed limit, so a fast
     flick never makes the board race. A jump from the menu cuts to the station. On arrival the object on the board and
     its twin on the page light up together (class .arrived on the section). Designer and front-end review, 11.10.2026. */
  const FLIGHT = (() => {
    if (REDUCE) return { kick() {} };
    const STN = planet.STN;
    const secs = ['process', 'catalog', 'turnkey', 'why', 'request'].map(id => document.getElementById(id));
    const steps = document.getElementById('steps4'), ftr = document.querySelector('.ftr'), cards = [...document.querySelectorAll('.gal-card')];
    let tops = null, endY = 0, Ty = 0, running = false, z = null, last = 0, capT = 0, tIn = 0, sigT = 0, prevY = -1, drawnT = 0, movedT = 0;
    const arrived = [0, 0, 0, 0, 0];
    function layout() { tops = secs.map(e => e.getBoundingClientRect().top + scrollY); endY = ftr.getBoundingClientRect().top + scrollY; Ty = track.getBoundingClientRect().bottom + scrollY - stage.clientHeight; }
    function target() {
      const VH = innerHeight, y = scrollY + VH * 0.4, S = STN.cam;
      if (y < tops[0]) return { z: lerp(planet.flightZ0(), S[0], smooth(0, 1, (scrollY - Ty) / Math.max(1, tops[0] - VH * 0.4 - Ty))), h: 3.4, i: -1 };
      let i = 0; while (i < 4 && y >= tops[i + 1]) i++;
      const f = clamp((y - tops[i]) / Math.max(1, (i < 4 ? tops[i + 1] : endY) - tops[i]));
      if (i === 4) return { z: S[4], h: 3.4, i };
      return { z: lerp(S[i], S[i + 1], smooth(0.55, 1, f)), h: 3.4, i }; // stands while the section is read: nothing moves under the text
    }
    function arrive(i, t) { if (arrived[i]) return; arrived[i] = t; secs[i].classList.add('arrived'); }
    function frame(t) {
      if (heroState.k < 0.999) { running = false; FLY.on = false; last = 0; return false; }
      if (!tops) layout();
      const dt = last ? Math.min(100, t - last) : 16; last = t;
      const tg = target(), vmax = (FLY.fast ? 16 : W / H < 0.8 ? 5 : 7) * dt / 1000; // during a screen change the camera keeps up with it
      if (scrollY !== prevY) movedT = t;
      const gap = tg.z - z;
      if (z === null || Math.abs(gap) > 12) { // first frame or more than a station behind (a menu link): cut, no flight through half the board
        if (z !== null) FLY.dimFast = 0.3; // the cut is a short dip, then the board comes back
        z = tg.z; FLY.h = tg.h; for (let i = 0; i < tg.i; i++) arrive(i, t - 2000);
      } else if (t - movedT > 250 && Math.abs(gap) > 3) { // the page has stopped and the camera lags: cut close, fly the last bit
        FLY.dimFast = 0.3; z = tg.z - Math.sign(gap) * 3;
      } else {
        const dz = (tg.z - z) * (1 - Math.exp(-dt / 350)), c = clamp(dz, -vmax, vmax);
        capT = Math.abs(dz) > vmax ? capT + dt : 0; z += c;
        if (Math.abs(tg.z - z) < 0.004) z = tg.z;
        FLY.h = lerp(FLY.h, tg.h, 1 - Math.exp(-dt / 350));
      }
      FLY.z = z; FLY.on = true;
      FLY.dimFast = lerp(FLY.dimFast, capT > 500 ? 0.6 : 1, 1 - Math.exp(-dt / 150)); // held at the speed limit: the board quiets down
      for (let i = 0; i < tg.i; i++) if (!arrived[i] && z > STN.cam[i] - 0.5) arrive(i, t - 2000); // flown past on the way: visited
      if (tg.i >= 0 && Math.abs(z - STN.cam[tg.i]) < 0.5 && !arrived[tg.i]) { arrive(tg.i, t); FLY.sig = { z0: z + 2, z1: STN.obj[tg.i] - 0.6, t0: t, v: 12 }; }
      FLY.lit = arrived.map(a => a ? (t - a < 400 ? 0.6 * (t - a) / 400 : lerp(0.6, 0.35, seg(t - a, 400, 1200))) : 0);
      if (!tIn && steps.classList.contains('in')) tIn = t; // the chips on the board power up with the steps on the page
      for (let c = 0; c < 4; c++) FLY.chips[c] = tIn ? eOut(seg(t - tIn, c * 300 - 60, c * 300 + 300)) : 0;
      if (FLY.sig && FLY.sig.z0 + (t - FLY.sig.t0) / 1000 * FLY.sig.v > FLY.sig.z1) { FLY.sig = null; sigT = t; }
      const still = Math.abs(tg.z - z) < 0.004 && Math.abs(FLY.h - tg.h) < 0.002;
      if (!FLY.sig && still && t - sigT > 5000) FLY.sig = { z0: z + 2, z1: STN.obj[Math.max(0, tg.i)] - 0.6, t0: t, v: 6 }; // a quiet signal every 5 s
      // Redraw only when something moves: the camera every frame, signals and lighting up at 30 frames a second, else nothing
      const busy = FLY.sig || arrived.some(a => a && t - a < 1300) || (tIn && t - tIn < 1300) || Math.abs(FLY.dimFast - (capT > 500 ? 0.6 : 1)) > 0.01;
      // a gallery card over most of the window hides the board: do not draw what nobody sees (the card's own 3D scene is busy)
      const VH = innerHeight, hidden = cards.some(c => { const r = c.getBoundingClientRect(); return r.top <= VH * 0.12 && r.bottom >= VH * 0.88; });
      if (!hidden && (!still || drawnT === 0 || (busy && t - drawnT > 32))) { planet.draw(t, true); drawnT = t; }
      else if (hidden) drawnT = 0; // redraw as soon as the card moves away
      prevY = scrollY;
    }
    function kick(relayout) { if (relayout) { tops = null; drawnT = 0; } if (!running) { running = true; last = 0; drawnT = 0; ticker.add(frame); } }
    addEventListener('scroll', () => { if (heroState.k >= 0.999) kick(); }, { passive: true });
    new ResizeObserver(() => kick(true)).observe(document.querySelector('main'));
    return { kick };
  })();
  flightKick = FLIGHT.kick;

  /* ---------- screens: one gesture, one screen ---------- */
  /* Антон, 11.10.2026: «надо пробовать делать, чтобы была фиксация экрана» (the soft version was inconvenient). Below the first
     screen every wheel turn, swipe or arrow key moves the page to the next or previous screen: «Как мы работаем», the intro of
     each gallery and every card of it, «Почему выбирают нас», the request form. A screen taller than the window (the form, a
     small phone) scrolls as usual to its end first. The form and the footer below it scroll freely. The ride of the first screen
     handles everything above «Как мы работаем»; an upward gesture on that screen goes back into it. */
  const SCREENS = (() => {
    if (!SCREENS_ON) return null;
    const html = document.documentElement, hdr = document.getElementById('hdr');
    let anchors = null, tw = null, wheelT = 0, burstMine = false, touchY = null, touchMine = null;
    const skip = el => el && el.closest && el.closest('.asst, .cookie, input, textarea, select');
    function layout() {
      const y = scrollY, H = hdr.offsetHeight;
      anchors = [...document.querySelectorAll('#process, .sec-intro, .gal-card, #why, #request')]
        .map(e => Math.round(e.getBoundingClientRect().top + y - (e.classList.contains('gal-card') ? H + 12 : 0)));
    }
    const at = y => { let c = -1; for (let i = 0; i < anchors.length; i++) if (anchors[i] <= y + 3) c = i; return c; };
    // what a gesture would do: a screen index to go to, 'native' (scroll inside a tall screen or below the form) or 'hero'
    function plan(dir) {
      if (!anchors) layout();
      if (tw) return dir === tw.dir ? tw.i : tw.i - dir;
      const y = scrollY, c = at(y), VH = innerHeight, last = anchors.length - 1;
      if (c < 0) return 'none';
      if (dir > 0) {
        if (c === last) return 'native';
        return y + VH < anchors[c + 1] - 3 ? 'native' : c + 1; // more of this screen below the window: scroll it first
      }
      if (y > anchors[c] + 6) return 'native'; // back to the top of this screen first
      return c === 0 ? 'hero' : c - 1;
    }
    function go(i, dir) {
      i = clamp(i, 0, anchors.length - 1);
      const from = scrollY, to = anchors[i], d = to - from;
      if (Math.abs(d) < 2) return;
      const T = clamp(Math.abs(d) / 1400, 0.7, 1.1) * 1000, t0 = performance.now(), me = { i, dir };
      tw = me; FLY.fast = true; html.style.scrollBehavior = 'auto';
      ticker.add(now => {
        if (tw !== me) return false;
        const u = Math.min(1, (now - t0) / T);
        scrollTo(0, Math.round(from + d * eIO(u)));
        if (u >= 1) { tw = null; FLY.fast = false; html.style.scrollBehavior = ''; return false; }
      });
    }
    function gesture(dir) { // true: the screens took it
      const r = plan(dir);
      if (r === 'none' || r === 'native') return false;
      if (r === 'hero') { chapter.up(); return true; }
      if (!tw || tw.i !== r) go(r, dir);
      return true;
    }
    addEventListener('wheel', e => {
      if (e.ctrlKey || skip(e.target) || Math.abs(e.deltaY) < Math.abs(e.deltaX) || chapter.running()) return;
      const now = performance.now(), burst = now - wheelT > 220; wheelT = now;
      if (burst) burstMine = gesture(Math.sign(e.deltaY)); // the inertia tail of a trackpad swipe is part of the same gesture
      if (burstMine) e.preventDefault();
    }, { passive: false });
    addEventListener('touchstart', e => { touchY = e.touches.length === 1 && !skip(e.target) ? e.touches[0].clientY : null; touchMine = null; }, { passive: true });
    addEventListener('touchmove', e => {
      if (touchY === null || e.touches.length > 1 || chapter.running()) return;
      const dy = touchY - e.touches[0].clientY;
      if (touchMine === null) { if (!dy) return; const r = plan(dy > 0 ? 1 : -1); touchMine = r !== 'none' && r !== 'native'; } // decided on the first move: the browser cannot get a touch back
      if (!touchMine) return;
      e.preventDefault();
      if (Math.abs(dy) > 12) { gesture(dy > 0 ? 1 : -1); touchY = e.touches[0].clientY; }
    }, { passive: false });
    addEventListener('keydown', e => {
      if (e.altKey || e.ctrlKey || e.metaKey || skip(e.target) || chapter.running()) return;
      const onCtl = e.target.closest && e.target.closest('a, button');
      const dir = e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey && !onCtl) ? 1
        : e.key === 'ArrowUp' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey && !onCtl) ? -1 : 0;
      if (dir && gesture(dir)) e.preventDefault();
    });
    addEventListener('click', e => { if (tw && e.target.closest && e.target.closest('a[href]')) { tw = null; FLY.fast = false; html.style.scrollBehavior = ''; } }, true); // a link wins
    addEventListener('resize', () => { anchors = null; });
    new ResizeObserver(() => { anchors = null; }).observe(document.querySelector('main'));
    return { busy: () => !!tw };
  })();

  addEventListener('resize', fit); new ResizeObserver(fit).observe(stage);
  if (REDUCE) cur = L_END;
  fit();
  buildWords();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(buildWords);
  spinGlobe(0);
  if (!REDUCE) {
    // Back on screen: jump to the current scroll position instead of sliding there from a stale one. Off screen:
    // the fixed world canvas stays as the background of the page, so it gets one frame at the current position.
    const sync = on => { cur = progress(); if (!on) render(true); on ? ticker.add(tick) : ticker.remove(tick); };
    heroView.sub(sync); sync(heroView.on);
  }
})();

/* ============ 2. Process: draw once in view ============ */
(function () {
  const s = document.getElementById('steps4');
  new IntersectionObserver((es, io) => { es.forEach(e => { if (e.isIntersecting) { s.classList.add('in'); io.disconnect(); } }); }, { threshold: .35 }).observe(s);
})();

/* ============ 3a. Server scenes: one engine, three models ============ */
/* Tiny painter's-algorithm 3D on canvas 2D. A model is a set of parts made of textured boxes;
   each part flies in from its exploded offset while the build plays (progress 0..1 over def.dur seconds). */
const K3 = (() => {
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
  function model() {
    const parts = {};
    const part = (name, center) => (parts[name] = { name, c: center, faces: [], pos: center.slice(), rot: [0, 0, 0], alpha: 1 });
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
          const face = { pts: [pt(a0, b0), pt(a1, b0), pt(a1, b1), pt(a0, b1)], n, col: fcol, key: o.key, bias: o.bias || 0, noGlow: o.glow === false };
          if (tx) face.tex = { img: tx, uv: [i / nu, j / nv, (i + 1) / nu, (j + 1) / nv] };
          P.faces.push(face);
        }
      }
    }
    // Flat polygon of 3-4 world points (a triangle repeats its last point). twoSided: drawn from both sides.
    function quad(P, pts, color, o = {}) {
      const rel = pts.map(q => V.sub(q, P.c)); if (rel.length === 3) rel.push(rel[2]);
      const n = V.norm(V.cross(V.sub(rel[1], rel[0]), V.sub(rel[2], rel[0])));
      P.faces.push({ pts: rel, n: o.flip ? V.mul(n, -1) : n, col: hex(color), key: o.key, bias: o.bias || 0, two: !!o.twoSided, noGlow: o.glow === false });
    }
    return { parts, part, box, quad };
  }
  return { V, hex, euler, ap, model };
})();

/* Canvas textures. Ones with text in brand fonts are redrawn when the fonts arrive. */
const TX = (() => {
  const fontTex = [];
  function tex(w, h, draw, usesFont) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); if (usesFont) fontTex.push([c, draw]); return c; }
  const redraw = () => fontTex.forEach(([c, draw]) => { const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height); draw(g, c.width, c.height); });
  const X = {
    pcb: (label, sock) => tex(620, 760, (g, w, h) => {
      g.fillStyle = '#0d2f55'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(120,170,220,.22)'; g.lineWidth = 2;
      for (let i = 0; i < 70; i++) { const x = (i * 97) % w, y = (i * 53) % h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + ((i % 3) - 1) * 80, y + 60); g.lineTo(x + ((i % 3) - 1) * 80, y + 140); g.stroke(); }
      g.fillStyle = 'rgba(210,225,240,.55)'; g.font = '600 18px monospace'; g.fillText(label, 36, h - 40); g.fillText(sock, 60, 250);
      g.strokeStyle = 'rgba(210,225,240,.4)'; g.lineWidth = 3; g.strokeRect(40, 150, 150, 150);
      g.fillStyle = '#c7a24a'; for (let k = 0; k < 10; k++) { g.beginPath(); g.arc(20 + k * 64, 20, 6, 0, 7); g.fill(); g.beginPath(); g.arc(20 + k * 64, h - 20, 6, 0, 7); g.fill(); }
    }),
    pins: tex(128, 128, (g, w, h) => { g.fillStyle = '#2a2a2a'; g.fillRect(0, 0, w, h); g.fillStyle = '#c9a24c'; for (let x = 6; x < w; x += 7) for (let y = 6; y < h; y += 7) g.fillRect(x, y, 2.5, 2.5); }),
    cpu: (l1, l2, l3, l4, w = 300, h = 300) => tex(w, h, g => {
      const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#e9ecef'); gr.addColorStop(1, '#b9bfc6'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const y0 = (h - 300) / 2;
      g.fillStyle = '#2b3036'; g.font = '700 30px Arial, sans-serif'; g.fillText(l1, 34, y0 + 110); g.font = '700 42px Arial, sans-serif'; g.fillText(l2, 34, y0 + 160);
      g.font = '500 20px monospace'; g.fillText(l3, 34, y0 + 200); g.fillText(l4, 34, y0 + 230);
    }),
    dimm: label => tex(520, 120, (g, w, h) => {
      g.fillStyle = '#18503a'; g.fillRect(0, 0, w, h); g.fillStyle = '#c9a24c'; g.fillRect(0, h - 14, w, 14);
      g.fillStyle = '#16181b'; for (let i = 0; i < 9; i++) g.fillRect(14 + i * 56, 18, 42, 50);
      g.fillStyle = '#e9eef3'; g.fillRect(130, 74, 260, 26); g.fillStyle = '#16181b'; g.font = '600 16px monospace'; g.fillText(label, 140, 93);
    }),
    hdd: (cap, l1, l2) => tex(300, 440, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#c9cfd6'); gr.addColorStop(1, '#aab2bb'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = '#17202b'; g.fillRect(24, 120, w - 48, 200);
      g.fillStyle = '#fff'; g.font = '700 46px Arial, sans-serif'; g.fillText(cap, 44, 190); g.font = '500 20px monospace'; g.fillStyle = '#9fc3e6'; g.fillText(l1, 44, 230); g.fillText(l2, 44, 262);
      g.fillStyle = '#5fb0e8'; g.fillRect(44, 288, 120, 6);
      g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 3; g.beginPath(); g.arc(w / 2, 60, 30, 0, 7); g.stroke();
    }),
    ssd: (cap, l1, wide) => tex(wide ? 400 : 280, wide ? 280 : 400, (g, w, h) => {
      g.fillStyle = '#1b1f25'; g.fillRect(0, 0, w, h); g.fillStyle = '#117ca7';
      if (wide) g.fillRect(118, 0, 10, h); else g.fillRect(0, 150, w, 10);
      const x = wide ? 150 : 30, y = wide ? 100 : 230;
      g.fillStyle = '#fff'; g.font = '700 44px Arial, sans-serif'; g.fillText('SSD', x, y); g.font = '700 36px Arial, sans-serif'; g.fillText(cap, x, y + 50);
      g.font = '500 18px monospace'; g.fillStyle = '#9fc3e6'; g.fillText(l1, x, y + 86);
    }),
    caddy: accent => tex(300, 120, (g, w, h) => {
      g.fillStyle = '#2c323a'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1a1e24'; for (let x = 16; x < 200; x += 14) for (let y = 16; y < h - 16; y += 14) { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
      g.fillStyle = '#3d444e'; g.fillRect(212, 14, 72, h - 28); g.fillStyle = accent; g.fillRect(222, 24, 6, h - 48);
    }),
    blank: tex(300, 120, (g, w, h) => { g.fillStyle = '#2c323a'; g.fillRect(0, 0, w, h); g.fillStyle = '#23282e'; for (let x = 20; x < w - 20; x += 22) g.fillRect(x, 20, 10, h - 40); }),
    // 2.5" drive standing on its edge (2U front): narrow caddy and filler
    sff: accent => tex(60, 200, (g, w, h) => {
      g.fillStyle = '#2c323a'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1a1e24'; for (let y = 14; y < 120; y += 12) for (let x = 12; x < w - 8; x += 12) { g.beginPath(); g.arc(x, y, 3.4, 0, 7); g.fill(); }
      g.fillStyle = '#3d444e'; g.fillRect(8, 132, w - 16, 58); g.fillStyle = accent; g.fillRect(14, 140, w - 28, 5);
    }),
    sffBlank: tex(60, 200, (g, w, h) => { g.fillStyle = '#262b32'; g.fillRect(0, 0, w, h); g.fillStyle = '#1e2228'; for (let y = 14; y < h - 12; y += 16) g.fillRect(12, y, w - 24, 7); }),
    ssdSide: (cap, cls, accent) => tex(420, 240, (g, w, h) => {
      g.fillStyle = '#1b1f25'; g.fillRect(0, 0, w, h); g.fillStyle = accent; g.fillRect(0, 0, w, 10);
      g.fillStyle = '#fff'; g.font = '700 40px Arial, sans-serif'; g.fillText('SSD ' + cap, 30, 100);
      g.font = '500 22px monospace'; g.fillStyle = '#9fc3e6'; g.fillText(cls, 30, 140); g.fillText('2.5" SAS/SATA', 30, 172);
    }),
    m2: label => tex(80, 320, (g, w, h) => {
      g.fillStyle = '#16211b'; g.fillRect(0, 0, w, h); g.fillStyle = '#c9a24c'; g.fillRect(8, h - 16, w - 16, 12);
      g.fillStyle = '#0c0e10'; g.fillRect(12, 20, w - 24, 80); g.fillRect(12, 120, w - 24, 80); g.fillRect(18, 220, w - 36, 40);
      g.save(); g.translate(w / 2 + 6, h / 2); g.rotate(-Math.PI / 2); g.fillStyle = '#9fc3e6'; g.font = '600 15px monospace'; g.textAlign = 'center'; g.fillText(label, 0, 0); g.restore();
    }),
    // PCIe card seen from the side: chips, heatsink area, gold fingers at the bottom edge
    card: (title, sub) => tex(512, 220, (g, w, h) => {
      g.fillStyle = '#14402e'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(160,220,180,.18)'; g.lineWidth = 2; for (let i = 0; i < 24; i++) { const x = (i * 71) % w, y = 30 + (i * 37) % 140; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 60, y); g.lineTo(x + 60, y + 30); g.stroke(); }
      g.fillStyle = '#0c0e10'; g.fillRect(170, 50, 90, 90); g.fillRect(290, 60, 50, 36); g.fillRect(290, 104, 50, 36);
      g.fillStyle = '#c9a24c'; g.fillRect(90, h - 18, 330, 18);
      g.fillStyle = 'rgba(230,240,250,.8)'; g.font = '600 20px monospace'; g.fillText(title, 24, 34); g.font = '500 16px monospace'; g.fillText(sub, 24, 176);
    }),
    ocp: label => tex(420, 300, (g, w, h) => {
      g.fillStyle = '#14402e'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#0c0e10'; g.fillRect(150, 90, 110, 110);
      g.fillStyle = '#c3c9cf'; g.fillRect(40, h - 60, 130, 50); g.fillRect(230, h - 60, 130, 50);
      g.fillStyle = 'rgba(230,240,250,.8)'; g.font = '600 20px monospace'; g.fillText(label, 24, 40);
    }),
    fan: tex(200, 200, g => {
      g.fillStyle = '#1d2126'; g.fillRect(0, 0, 200, 200); g.fillStyle = '#0f1215'; g.beginPath(); g.arc(100, 100, 88, 0, 7); g.fill();
      g.strokeStyle = '#3a414a'; g.lineWidth = 12; for (let i = 0; i < 7; i++) { const a = i * Math.PI * 2 / 7; g.beginPath(); g.arc(100, 100, 55, a, a + .7); g.stroke(); }
      g.fillStyle = '#3a414a'; g.beginPath(); g.arc(100, 100, 26, 0, 7); g.fill();
    }),
    psu: tex(300, 600, (g, w) => { g.fillStyle = '#737c86'; g.fillRect(0, 0, w, 600); g.fillStyle = '#5d656e'; for (let y = 20; y < 260; y += 16) g.fillRect(20, y, w - 40, 7); g.fillStyle = '#e9eef3'; g.fillRect(40, 330, 220, 120); g.fillStyle = '#2b3036'; g.font = '600 26px monospace'; g.fillText('PSU', 60, 380); }),
    ear: tex(80, 200, g => { g.fillStyle = '#23282e'; g.fillRect(0, 0, 80, 200); g.fillStyle = '#15181c'; g.beginPath(); g.arc(40, 40, 12, 0, 7); g.fill(); g.beginPath(); g.arc(40, 160, 12, 0, 7); g.fill(); }),
    sticker: line => tex(400, 160, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = '#043168'; g.fillRect(0, 0, 14, h); g.fillStyle = '#0a0a0a'; g.font = '400 46px Tinos, "Times New Roman", serif'; g.fillText('САРМАТ-ИТ', 36, 70); g.fillStyle = '#56657a'; g.font = '500 22px monospace'; g.fillText(line, 36, 118); }, true),
    // Virtualisation: a hypervisor slab (4.2 x 3.8) with three VM rows (3.4 x 0.9) above the server
    slab: (over, title) => tex(520, 470, (g, w, h) => {
      g.fillStyle = '#0f3a70'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(143,208,255,.16)'; g.lineWidth = 2; for (let x = 26; x < w; x += 26) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      g.strokeStyle = 'rgba(143,208,255,.85)'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
      g.fillStyle = '#8fd0ff'; g.font = '500 20px "JetBrains Mono", monospace'; g.fillText(over, 24, h - 24);
      g.fillStyle = '#ffffff'; g.font = '500 28px "Golos Text", system-ui, sans-serif'; g.fillText(title, 200, h - 22);
    }, true),
    layer: (over, title, spec) => tex(680, 180, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1b5aa0'); gr.addColorStop(1, '#123f78'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(143,208,255,.9)'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
      g.fillStyle = '#8fd0ff'; g.font = '500 30px "JetBrains Mono", monospace'; g.fillText(over, 32, 84);
      if (spec) g.fillText(spec, 150, 148);
      g.fillStyle = '#ffffff'; g.font = '500 52px "Golos Text", system-ui, sans-serif'; g.fillText(title, 150, 92);
      g.fillStyle = '#7fe0a6'; g.beginPath(); g.arc(w - 44, 90, 12, 0, 7); g.fill();
    }, true),
    // Rack and turnkey scenes
    rail: tex(40, 1800, (g, w, h) => {
      g.fillStyle = '#2a313b'; g.fillRect(0, 0, w, h);
      const uh = h / 42;
      for (let u = 0; u < 42; u++) {
        const y = h - (u + 1) * uh;
        g.fillStyle = '#12161c'; for (const k of [0.2, 0.5, 0.8]) g.fillRect(6, y + uh * k - 3, 7, 6);
        if ((u + 1) % 5 === 0 || u === 0) { g.fillStyle = 'rgba(220,232,245,.7)'; g.font = '600 14px monospace'; g.fillText(String(u + 1), 17, y + uh * 0.5 + 5); }
      }
    }),
    ups: tex(440, 180, (g, w, h) => {
      g.fillStyle = '#1c2129'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#12161c'; for (let x = 24; x < 220; x += 14) g.fillRect(x, 24, 7, h - 48);
      g.fillStyle = '#0b2440'; g.fillRect(250, 36, 160, 60); g.strokeStyle = '#5fb0e8'; g.lineWidth = 2; g.strokeRect(250, 36, 160, 60);
      g.fillStyle = '#8fd0ff'; g.font = '600 22px monospace'; g.fillText('6 kVA', 266, 62); g.font = '500 14px monospace'; g.fillText('ONLINE  AC OK', 266, 86);
      g.fillStyle = '#3a414a'; [260, 300, 340].forEach(x => { g.beginPath(); g.arc(x, 132, 10, 0, 7); g.fill(); });
      g.fillStyle = 'rgba(220,232,245,.6)'; g.font = '600 16px monospace'; g.fillText('UPS', 370, 138);
    }),
    nasFront: tex(480, 100, (g, w, h) => {
      g.fillStyle = '#2a3038'; g.fillRect(0, 0, w, h);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
        const x = 40 + c * 104, y = 8 + r * 29, full = r * 4 + c < 6;
        g.fillStyle = full ? '#3d444e' : '#1e2329'; g.fillRect(x, y, 98, 25);
        if (full) { g.fillStyle = '#1a1e24'; for (let k = 0; k < 7; k++) g.fillRect(x + 6 + k * 9, y + 5, 5, 15); g.fillStyle = '#8fa3b8'; g.fillRect(x + 76, y + 6, 4, 13); }
      }
      g.fillStyle = 'rgba(220,232,245,.6)'; g.font = '600 12px monospace'; g.fillText('NAS', 6, 56);
    }),
    srvFront: lab => tex(480, 100, (g, w, h) => {
      g.fillStyle = '#2c323a'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(220,232,245,.75)'; g.font = '600 18px monospace'; g.fillText(lab, 10, 30);
      for (let i = 0; i < 16; i++) { const x = 84 + i * 22; g.fillStyle = i < 8 ? '#3d444e' : '#1e2329'; g.fillRect(x, 10, 19, 80); if (i < 8) { g.fillStyle = i < 4 ? '#5fb0e8' : '#f2b84b'; g.fillRect(x + 4, 74, 11, 4); } }
    }),
    sw1u: lab => tex(480, 50, (g, w, h) => {
      g.fillStyle = '#1f252d'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(220,232,245,.7)'; g.font = '600 13px monospace'; g.fillText(lab, 10, 30);
      g.fillStyle = '#0c0f13'; for (let i = 0; i < 24; i++) g.fillRect(150 + (i >> 1) * 20, i % 2 ? 27 : 8, 16, 14);
      g.fillStyle = '#9aa5b1'; for (let i = 0; i < 4; i++) g.fillRect(400 + i * 18, 14, 14, 22);
    }),
    fw1u: tex(480, 50, (g, w, h) => {
      g.fillStyle = '#2a1d23'; g.fillRect(0, 0, w, h); g.fillStyle = '#ff8a7a'; g.fillRect(0, 0, 6, h);
      g.fillStyle = 'rgba(255,214,208,.85)'; g.font = '600 13px monospace'; g.fillText('FIREWALL  NGFW', 16, 30);
      g.fillStyle = '#0c0f13'; for (let i = 0; i < 8; i++) g.fillRect(250 + i * 24, 16, 18, 16);
    }),
    // VM plate: on (working), copy (switched-off replica), fail
    plate: (title, sub, mode) => tex(420, 200, (g, w, h) => {
      const lin = mode === 'lin' || mode === 'linOn';
      g.fillStyle = mode === 'on' ? '#1b5aa0' : lin ? '#123a63' : mode === 'fail' ? '#3a1418' : '#0b1a33'; g.fillRect(0, 0, w, h);
      g.strokeStyle = mode === 'on' || mode === 'linOn' ? '#8fd0ff' : mode === 'lin' ? 'rgba(143,208,255,.75)' : mode === 'fail' ? '#ff8a7a' : 'rgba(143,208,255,.6)'; g.lineWidth = 6;
      if (mode === 'copy') g.setLineDash([18, 12]);
      g.strokeRect(4, 4, w - 8, h - 8); g.setLineDash([]);
      g.fillStyle = mode === 'copy' ? '#a8c4e4' : '#ffffff'; g.font = '600 56px "Golos Text", system-ui, sans-serif'; g.fillText(title, 26, 90);
      g.fillStyle = mode === 'linOn' ? '#7fe0a6' : mode === 'on' || lin ? '#cfe6fb' : mode === 'fail' ? '#ffb4a8' : '#7f96b2'; g.font = '500 25px "JetBrains Mono", monospace'; g.fillText(sub, 28, 150);
    }, true),
    // Video surveillance
    poe: tex(240, 30, (g, w, h) => { g.fillStyle = '#1f252d'; g.fillRect(0, 0, w, h); g.fillStyle = '#0c0f13'; for (let i = 0; i < 10; i++) g.fillRect(40 + i * 19, 7, 15, 16); g.fillStyle = '#7fe0a6'; g.fillRect(10, 12, 12, 6); }),
    nvr: tex(240, 60, (g, w, h) => {
      g.fillStyle = '#2a3038'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#3d444e'; for (let i = 0; i < 4; i++) g.fillRect(90 + i * 36, 8, 32, 44);
      g.fillStyle = '#ff8a7a'; g.beginPath(); g.arc(24, 30, 7, 0, 7); g.fill(); g.fillStyle = 'rgba(220,232,245,.75)'; g.font = '600 14px monospace'; g.fillText('REC', 38, 35);
    }),
    upsSmall: tex(240, 90, (g, w, h) => { g.fillStyle = '#1c2129'; g.fillRect(0, 0, w, h); g.fillStyle = '#0b2440'; g.fillRect(130, 20, 90, 40); g.fillStyle = '#8fd0ff'; g.font = '600 15px monospace'; g.fillText('UPS', 150, 46); g.fillStyle = '#12161c'; for (let x = 16; x < 110; x += 12) g.fillRect(x, 14, 6, 62); }),
    // Monitor with nine feeds: drawn scenes, not real video
    feeds: tex(600, 360, (g, w, h) => {
      g.fillStyle = '#05080e'; g.fillRect(0, 0, w, h);
      const cw = 196, ch = 116;
      for (let i = 0; i < 9; i++) {
        const x = 4 + (i % 3) * (cw + 2), y = 4 + Math.floor(i / 3) * (ch + 2);
        if (i === 8) { // ninth cell: the site plan with camera points
          g.fillStyle = '#0b1424'; g.fillRect(x, y, cw, ch); g.strokeStyle = 'rgba(143,208,255,.7)'; g.lineWidth = 2; g.strokeRect(x + 24, y + 26, 96, 60);
          g.beginPath(); g.moveTo(x + 72, y + 26); g.lineTo(x + 72, y + 86); g.stroke(); g.strokeRect(x + 120, y + 26, 50, 70);
          g.fillStyle = '#7fe0a6'; [[40, 94], [110, 106], [26, 84], [70, 28], [74, 28], [118, 84], [168, 28], [122, 60]].forEach(([a, b]) => { g.beginPath(); g.arc(x + a, y + b, 3.5, 0, 7); g.fill(); });
          g.fillStyle = 'rgba(232,242,255,.85)'; g.font = '500 12px "JetBrains Mono", monospace'; g.fillText('ПЛАН', x + 8, y + 16); continue;
        }
        const gr = g.createLinearGradient(x, y, x, y + ch); gr.addColorStop(0, i % 2 ? '#1d3148' : '#23384f'); gr.addColorStop(1, '#0d1826'); g.fillStyle = gr; g.fillRect(x, y, cw, ch);
        g.fillStyle = 'rgba(160,190,220,.28)';
        if (i % 3 === 0) { for (let k = 0; k < 3; k++) g.fillRect(x + 20 + k * 58, y + 30, 36, 70); }
        else if (i % 3 === 1) { g.fillRect(x + 40, y + 70, 70, 26); g.fillRect(x + 56, y + 56, 40, 16); g.fillRect(x + 120, y + 74, 50, 22); }
        else { g.beginPath(); g.moveTo(x, y + ch); g.lineTo(x + cw * 0.45, y + 40); g.lineTo(x + cw * 0.55, y + 40); g.lineTo(x + cw, y + ch); g.fill(); }
        g.fillStyle = 'rgba(232,242,255,.85)'; g.font = '500 12px "JetBrains Mono", monospace'; g.fillText('CAM ' + String(i + 1).padStart(2, '0'), x + 8, y + 16);
        g.fillText('12:04:' + String(10 + i * 5).padStart(2, '0'), x + cw - 64, y + ch - 8);
        g.fillStyle = '#ff6a5a'; g.beginPath(); g.arc(x + cw - 12, y + 12, 4, 0, 7); g.fill();
      }
    }, true)
  };
  return { X, redraw };
})();

const SCENES = {
  /* Сервер для 1С: конфигурация от Антона 29.09.2026. Xeon E-2488 (intel.com), 2 × 32 ГБ DDR5 ECC, 2 × NVMe в RAID 1 под базы,
     SSD под систему, опционально 2-4 × SATA под копии. Корпус 1U условный */
  c1: {
    dur: 9.5, // seconds of the build in the gallery
    build({ part, box }, X) {
      const T = { pcb: X.pcb('SERVER BOARD  DDR5 ECC', 'LGA1700'), cpu: X.cpu('XEON', 'E-2488', '3.20 GHz  8C/16T', 'LGA1700'), dimm: X.dimm('32GB DDR5 ECC'), hdd: X.hdd('2-4 TB', '3.5" SATA', 'BACKUP'),
        ssd: X.ssd('480 GB', '2.5" SATA  OS'), caddyHdd: X.caddy('#8fa3b8'), caddySsd: X.caddy('#117ca7'), m2: X.m2('NVMe'), sticker: X.sticker('1С SERVER  E-2488  64GB') };
      const CH = part('chassis', [0, 0, 0]);
      const MET = '#9ea7b1', MET2 = '#b4bcc5';
      box(CH, 4.4, 0.03, 6.2, 0, 0.015, 0, MET, { tile: 0.5, bias: 1.5 });
      box(CH, 0.03, 0.42, 6.2, -2.185, 0.24, 0, MET2, { tile: 0.5 });
      box(CH, 0.03, 0.42, 6.2, 2.185, 0.24, 0, MET2, { tile: 0.5 });
      box(CH, 4.34, 0.42, 0.03, 0, 0.24, -3.085, '#8d96a0', { tile: 0.5 });
      box(CH, 4.3, 0.38, 0.04, 0, 0.22, 1.56, '#14402e', { tile: 0.5 });
      [-1.05, 0, 1.05].forEach(x => box(CH, 0.02, 0.4, 1.46, x, 0.23, 2.33, '#7e8791'));
      box(CH, 1.02, 0.4, 0.05, 1.575, 0.23, 3.075, '#2c323a', { tex: { front: X.blank } });
      box(CH, 0.16, 0.44, 0.06, -2.28, 0.22, 3.08, '#23282e', { tex: { front: X.ear } });
      box(CH, 0.16, 0.44, 0.06, 2.28, 0.22, 3.08, '#23282e', { tex: { front: X.ear } });
      box(CH, 0.06, 0.06, 0.02, 2.28, 0.33, 3.115, '#3a414a', { key: 'pwrLed' });
      [-1.72, -0.86, 0, 0.86, 1.72].forEach(x => box(CH, 0.82, 0.4, 0.28, x, 0.22, 1.2, '#1d2126', { tex: { front: X.fan, back: X.fan } }));
      box(CH, 1.05, 0.4, 2.15, 1.63, 0.22, -1.98, '#737c86', { tex: { top: X.psu } });
      const B = part('board', [-0.6, 0.085, -1.0]);
      box(B, 3.1, 0.03, 3.8, -0.6, 0.085, -1.0, '#0d2f55', { tex: { top: T.pcb }, tile: 0.36, bias: 0.6 });
      box(B, 0.62, 0.05, 0.62, -1.0, 0.125, -1.2, '#c3c9cf', { skip: ['bottom'] });
      box(B, 0.44, 0.012, 0.44, -1.0, 0.156, -1.2, '#2a2a2a', { tex: { top: X.pins }, skip: ['bottom'] });
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
      const mkRam = (name, x) => { const P = part(name, [x, 0.265, -1.2]); box(P, 0.03, 0.31, 1.33, x, 0.265, -1.2, '#18503a', { tex: { right: T.dimm, left: T.dimm }, tile: 0.7 }); };
      mkRam('ram1', -0.1); mkRam('ram2', 0.2);
      // two NVMe drives for the 1C databases, mirrored
      [['nvme1', 0.35], ['nvme2', 0.65]].forEach(([n, x]) => { const P = part(n, [x, 0.12, 0.15]); box(P, 0.22, 0.02, 0.8, x, 0.115, 0.15, '#16211b', { tex: { top: T.m2 }, tile: 1 }); });
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
    },
    exp: { board: { off: [0, 2.3, -0.2], rot: [-0.08, 0, 0.04] }, cpu: { off: [0, 3.4, 0], rot: [0, 0.9, 0] }, cooler: { off: [0, 4.5, 0], rot: [0, -0.4, 0] },
      ram1: { off: [0.9, 2.1, 0.3], rot: [0, 0, 0.35] }, ram2: { off: [1.5, 2.1, 0.3], rot: [0, 0, 0.35] }, ssd: { off: [0.6, 0.9, 3.1], rot: [0, -0.3, 0] },
      nvme1: { off: [0.4, 1.8, 0.8], rot: [0, 0.6, 0.2] }, nvme2: { off: [0.9, 2.3, 1.1], rot: [0, 0.4, 0.2] },
      hdd1: { off: [-0.8, 1.1, 3.6], rot: [0, 0.35, 0] }, hdd2: { off: [0.1, 1.9, 4.3], rot: [0, 0.2, 0.08] }, lid: { off: [0, 3.2, -0.6], rot: [-0.25, 0, 0] } },
    partT: { board: [0.04, 0.13], cpu: [0.14, 0.22], cooler: [0.23, 0.29], ram1: [0.30, 0.36], ram2: [0.33, 0.39], nvme1: [0.40, 0.45], nvme2: [0.43, 0.48], ssd: [0.49, 0.56],
      hdd1: [0.57, 0.63], hdd2: [0.61, 0.67], lid: [0.69, 0.78] },
    fade: { lid: [0.66, 0.70] },
    steps: { board: { t: [0.04, 0.13], tag: 'Плата, сокет LGA1700' }, cpu: { t: [0.14, 0.22], tag: 'Xeon E-2488, 8 ядер' }, cooler: { t: [0.23, 0.29], tag: 'Радиатор CPU' },
      ram: { t: [0.30, 0.39], tag: '2 × 32 GB DDR5 ECC', part: 'ram1' }, nvme: { t: [0.40, 0.48], tag: 'RAID 1, 2 × NVMe', part: 'nvme1' }, ssd: { t: [0.49, 0.56], tag: 'SSD под систему' },
      hdd: { t: [0.57, 0.67], tag: 'Копии, 2 × SATA', part: 'hdd1' }, lid: { t: [0.69, 0.78], tag: 'Корпус 1U' }, os: { t: [0.80, 0.97] } },
    cam: [[0.00, [8.6, 8.4, 11.6], [0, 1.9, 0.6]], [0.12, [6.2, 5.6, 6.8], [-0.4, 0.8, -0.6]], [0.26, [4.2, 4.8, 4.4], [-0.8, 0.6, -1.1]], [0.39, [4.8, 5.0, 5.2], [-0.4, 0.6, -0.9]],
      [0.48, [4.2, 4.6, 6.6], [0.3, 0.3, 0.1]], [0.56, [5.2, 3.6, 8.8], [-0.2, 0.3, 1.8]], [0.67, [4.4, 3.4, 9.2], [-0.4, 0.3, 1.6]], [0.78, [7.0, 6.0, 8.8], [0, 0.3, 0]],
      [0.90, [3.6, 2.2, 8.6], [0, 0.2, 1.6]], [1.00, [1.4, 1.7, 9.6], [0, 0.22, 2.2]]],
    power: [0.81, 0.85],
    boot: { show: [0.81, 0.85], bar: [0.83, 0.94],
      lines: [[0.86, 'Процессор: Xeon E-2488, 8 ядер'], [0.88, 'Память: 64 GB ECC, ОК'], [0.9, 'NVMe: зеркало RAID 1 собрано'], [0.92, 'СУБД запущена'], [0.935, 'Сервер 1С:Предприятие запущен']],
      states: [[0, 'Подготовка системы', 'загрузка'], [0.8301, 'Загрузка служб', 'загрузка'], [0.94, 'Готов к работе, до 20 пользователей', 'в работе', 'ready']] }
  },

  /* Файловый сервер: 2U на 8 × 3,5", Xeon E-2336 (intel.com), 2 × 16 ГБ, RAID-контроллер, 2 × 480 ГБ RAID 1, 4 × 8 ТБ RAID 10 (правка Антона 29.09.2026), 2 × 10 Гбит/с, 2 БП.
     Примерная конфигурация под сайт, 28.09.2026: подтвердить у Антона (mockups/configurations.md) */
  fs: {
    dur: 10, // seconds of the build in the gallery
    zoom: 0.84,
    build({ part, box }, X) {
      const T = { pcb: X.pcb('C252  FILE SERVER', 'LGA1200'), cpu: X.cpu('XEON', 'E-2336', '2.90 GHz  6C/12T', 'LGA1200'), dimm: X.dimm('16GB DDR4 ECC'),
        hdd: X.hdd('8 TB', '3.5" SATA', 'ENTERPRISE HDD'), ssd: X.ssd('480 GB', '2.5" SATA', true), caddy: X.caddy('#8fa3b8'),
        raid: X.card('RAID CONTROLLER', 'CACHE  PROTECTED'), nic: X.card('NIC  2 × 10GbE', 'SFP+'), sticker: X.sticker('FILE SERVER  E-2336  4×8TB') };
      const CH = part('chassis', [0, 0, 0]);
      const MET = '#9ea7b1', MET2 = '#b4bcc5';
      box(CH, 4.4, 0.03, 6.2, 0, 0.015, 0, MET, { tile: 0.5, bias: 1.5 });
      box(CH, 0.03, 0.88, 6.2, -2.185, 0.47, 0, MET2, { tile: 0.5 });
      box(CH, 0.03, 0.88, 6.2, 2.185, 0.47, 0, MET2, { tile: 0.5 });
      box(CH, 4.34, 0.88, 0.03, 0, 0.47, -3.085, '#8d96a0', { tile: 0.5 });
      box(CH, 4.3, 0.84, 0.04, 0, 0.45, 1.56, '#14402e', { tile: 0.5 });
      [-1.05, 0, 1.05].forEach(x => box(CH, 0.02, 0.84, 1.46, x, 0.45, 2.33, '#7e8791'));
      box(CH, 4.3, 0.02, 1.46, 0, 0.45, 2.33, '#7e8791');
      [-1.575, -0.525, 0.525, 1.575].forEach(x => box(CH, 1.02, 0.4, 0.05, x, 0.67, 3.075, '#2c323a', { tex: { front: X.blank } }));
      box(CH, 0.16, 0.88, 0.06, -2.28, 0.45, 3.08, '#23282e', { tex: { front: X.ear } });
      box(CH, 0.16, 0.88, 0.06, 2.28, 0.45, 3.08, '#23282e', { tex: { front: X.ear } });
      box(CH, 0.06, 0.06, 0.02, 2.28, 0.78, 3.115, '#3a414a', { key: 'pwrLed' });
      [-1.6, -0.535, 0.535, 1.6].forEach(x => box(CH, 0.98, 0.8, 0.3, x, 0.43, 1.2, '#1d2126', { tex: { front: X.fan, back: X.fan } }));
      box(CH, 2.3, 0.02, 0.86, -1.0, 0.045, 0.62, '#7e8791', { skip: ['bottom'] });
      const B = part('board', [-0.65, 0.085, -1.35]);
      box(B, 2.9, 0.03, 3.1, -0.65, 0.085, -1.35, '#0d2f55', { tex: { top: T.pcb }, tile: 0.36, bias: 0.6 });
      box(B, 0.62, 0.05, 0.62, -1.3, 0.125, -0.9, '#c3c9cf', { skip: ['bottom'] });
      box(B, 0.44, 0.012, 0.44, -1.3, 0.156, -0.9, '#2a2a2a', { tex: { top: X.pins }, skip: ['bottom'] });
      box(B, 0.04, 0.04, 0.5, -0.96, 0.14, -0.9, '#c3c9cf', { skip: ['bottom'] });
      [-0.55, -0.4, -0.25, -0.1].forEach((x, i) => {
        box(B, 0.07, 0.08, 1.4, x, 0.14, -0.9, i % 2 ? '#1a1c20' : '#243a66', { skip: ['bottom'] });
        box(B, 0.07, 0.1, 0.05, x, 0.15, -1.62, '#e7ebef', { skip: ['bottom'] }); box(B, 0.07, 0.1, 0.05, x, 0.15, -0.18, '#e7ebef', { skip: ['bottom'] });
      });
      box(B, 0.38, 0.12, 0.38, -1.75, 0.16, -0.05, '#5f6770', { skip: ['bottom'] });
      for (let i = 0; i < 5; i++) box(B, 0.07, 0.1, 0.07, -1.72 + i * 0.1, 0.15, -1.32, '#23262b', { skip: ['bottom'] });
      for (let i = 0; i < 4; i++) box(B, 0.07, 0.1, 0.07, -1.72, 0.15, -1.22 + i * 0.1, '#23262b', { skip: ['bottom'] });
      [0.2, 0.6].forEach(x => box(B, 0.07, 0.08, 1.2, x, 0.14, -2.2, '#1a1c20', { skip: ['bottom'] }));
      box(B, 0.2, 0.15, 0.22, -1.9, 0.17, -2.75, '#c3c9cf'); box(B, 0.2, 0.15, 0.22, -1.62, 0.17, -2.75, '#c3c9cf'); box(B, 0.34, 0.12, 0.14, -1.15, 0.16, -2.8, '#2e56a6');
      [-0.9, -0.75, -0.6].forEach(x => box(B, 0.1, 0.06, 0.16, x, 0.13, 0.05, '#1a1c20', { skip: ['bottom'] }));
      const C = part('cpu', [-1.3, 0.18, -0.9]);
      box(C, 0.375, 0.02, 0.375, -1.3, 0.172, -0.9, '#1e5a3c');
      box(C, 0.3, 0.03, 0.3, -1.3, 0.197, -0.9, '#d3d8dd', { tex: { top: T.cpu } });
      const K = part('cooler', [-1.3, 0.45, -0.9]);
      box(K, 0.64, 0.05, 0.64, -1.3, 0.237, -0.9, '#b87333');
      for (let i = 0; i < 13; i++) box(K, 0.018, 0.38, 0.64, -1.6 + i * 0.05, 0.45, -0.9, '#c8cfd6');
      [['ram1', -0.55], ['ram2', -0.25]].forEach(([n, x]) => { const P = part(n, [x, 0.265, -0.9]); box(P, 0.03, 0.31, 1.33, x, 0.265, -0.9, '#18503a', { tex: { right: T.dimm, left: T.dimm }, tile: 0.7 }); });
      const card = (name, x, len, img, extra) => {
        const zc = -2.9 + len / 2, P = part(name, [x, 0.46, zc]);
        box(P, 0.03, 0.56, len, x, 0.46, zc, '#14402e', { tex: { left: img, right: img }, tile: 0.8 });
        box(P, 0.12, 0.64, 0.02, x - 0.03, 0.47, -3.06, '#b4bcc5');
        extra(P, zc);
      };
      card('raid', 0.2, 1.4, T.raid, (P, zc) => box(P, 0.08, 0.22, 0.34, 0.255, 0.46, zc + 0.2, '#8e98a3'));
      card('nic', 0.6, 1.0, T.nic, P => { box(P, 0.1, 0.13, 0.3, 0.66, 0.34, -2.92, '#c3c9cf'); box(P, 0.1, 0.13, 0.3, 0.66, 0.54, -2.92, '#c3c9cf'); });
      [['ssd1', -1.55], ['ssd2', -0.45]].forEach(([n, x]) => { const P = part(n, [x, 0.09, 0.62]); box(P, 1.05, 0.07, 0.73, x, 0.09, 0.62, '#1b1f25', { tex: { top: T.ssd }, tile: 0.55 }); });
      [['hdd1', -1.575, 'led'], ['hdd2', -0.525, 'led2'], ['hdd3', 0.525, 'led'], ['hdd4', 1.575, 'led']].forEach(([n, x, led]) => {
        const P = part(n, [x, 0.2, 2.33]);
        box(P, 1.0, 0.4, 0.05, x, 0.24, 3.075, '#2c323a', { tex: { front: T.caddy } });
        box(P, 0.05, 0.05, 0.02, x + 0.36, 0.37, 3.11, '#3a414a', { key: led });
        box(P, 1.0, 0.26, 1.46, x, 0.18, 2.32, '#8e98a3', { tex: { top: T.hdd }, tile: 0.55, colors: { bottom: '#3b4450' } });
      });
      [['psu1', 0.24], ['psu2', 0.67]].forEach(([n, y]) => { const P = part(n, [1.675, y, -2.0]); box(P, 0.95, 0.4, 2.1, 1.675, y, -2.0, '#737c86', { tex: { top: X.psu }, tile: 0.6 }); });
      const L = part('lid', [0, 0.92, 0]);
      box(L, 4.42, 0.025, 6.0, 0, 0.92, -0.1, '#aab2bb', { tile: 0.6, bias: -1 });
      box(L, 1.1, 0.004, 0.44, -0.9, 0.935, 1.4, '#ffffff', { tex: { top: T.sticker }, skip: ['bottom', 'left', 'right', 'back', 'front'], bias: -1.2 });
    },
    exp: { board: { off: [0, 2.6, -0.2], rot: [-0.08, 0, 0.04] }, cpu: { off: [0, 3.6, 0], rot: [0, 0.9, 0] }, cooler: { off: [0, 4.6, 0], rot: [0, -0.4, 0] },
      ram1: { off: [0.9, 2.2, 0.3], rot: [0, 0, 0.35] }, ram2: { off: [1.5, 2.2, 0.3], rot: [0, 0, 0.35] },
      raid: { off: [0.2, 2.6, -0.4], rot: [0, 0, 0.35] }, nic: { off: [0.6, 2.9, -0.8], rot: [0, 0, 0.35] },
      ssd1: { off: [-0.4, 1.9, 1.3], rot: [0, 0.35, 0] }, ssd2: { off: [0.3, 2.5, 1.5], rot: [0, -0.3, 0] },
      hdd1: { off: [-0.8, 1.0, 3.4], rot: [0, 0.35, 0] }, hdd2: { off: [-0.2, 1.5, 3.8], rot: [0, 0.25, 0] }, hdd3: { off: [0.3, 2.0, 4.2], rot: [0, 0.15, 0.06] }, hdd4: { off: [0.8, 2.5, 4.6], rot: [0, -0.1, 0.08] },
      psu1: { off: [0.3, 0.3, -3.6], rot: [0, 0.3, 0] }, psu2: { off: [0.6, 1.0, -4.2], rot: [0, 0.2, 0] }, lid: { off: [0, 3.4, -0.6], rot: [-0.25, 0, 0] } },
    partT: { board: [0.04, 0.12], cpu: [0.13, 0.19], cooler: [0.17, 0.22], ram1: [0.23, 0.28], ram2: [0.26, 0.31], raid: [0.32, 0.39], nic: [0.40, 0.46], ssd1: [0.47, 0.51], ssd2: [0.49, 0.53],
      hdd1: [0.54, 0.59], hdd2: [0.56, 0.61], hdd3: [0.58, 0.63], hdd4: [0.60, 0.65], psu1: [0.66, 0.70], psu2: [0.68, 0.72], lid: [0.73, 0.79] },
    fade: { lid: [0.70, 0.75] },
    steps: { board: { t: [0.04, 0.12], tag: 'Плата, чипсет C252' }, cpu: { t: [0.13, 0.22], tag: 'Xeon E-2336, 6 ядер' }, ram: { t: [0.23, 0.31], tag: '2 × 16 GB DDR4 ECC', part: 'ram1' },
      raid: { t: [0.32, 0.39], tag: 'RAID-контроллер' }, nic: { t: [0.40, 0.46], tag: '2 × 10 Гбит/с' }, ssd: { t: [0.47, 0.53], tag: 'RAID 1, 2 × 480 GB', part: 'ssd1' },
      hdd: { t: [0.54, 0.65], tag: 'RAID 10, 4 × 8 TB', part: 'hdd1' }, psu: { t: [0.66, 0.72], tag: '2 блока питания', part: 'psu2' }, lid: { t: [0.73, 0.79], tag: 'Корпус 2U' }, os: { t: [0.81, 0.99] } },
    cam: [[0.00, [8.6, 9.2, 11.6], [0, 2.2, 0.6]], [0.10, [6.4, 6.0, 6.8], [-0.6, 0.9, -0.9]], [0.20, [4.2, 5.4, 4.2], [-1.2, 0.8, -0.9]], [0.30, [4.6, 5.2, 5.0], [-0.6, 0.7, -0.9]],
      [0.44, [6.4, 5.0, 0.6], [0.4, 0.6, -2.1]], [0.52, [3.2, 4.6, 5.2], [-1.0, 0.3, 0.5]], [0.64, [4.8, 3.8, 9.8], [0, 0.5, 2.0]], [0.72, [6.6, 4.6, -5.8], [1.2, 0.5, -2.0]],
      [0.80, [7.6, 6.6, 9.0], [0, 0.5, 0]], [0.90, [4.0, 2.8, 9.2], [0, 0.45, 1.6]], [1.00, [2.2, 2.0, 9.4], [-0.4, 0.4, 2.6]]],
    power: [0.81, 0.84],
    boot: { show: [0.81, 0.84], bar: [0.83, 0.89],
      lines: [[0.845, 'RAID 10: 4 × 8 TB, массив собран'], [0.86, 'Общие папки и права доступа, ОК'], [0.875, 'Теневые копии: по расписанию'], [0.915, 'Диск 2 извлечён: файлы доступны', 'warn'], [0.965, 'Диск заменён: массив восстанавливается']],
      states: [[0, 'Подготовка системы', 'загрузка'], [0.8301, 'Загрузка служб', 'загрузка'], [0.89, 'Готов к работе, 16 ТБ под файлы', 'в работе', 'ready'],
        [0.915, 'Отказ диска: RAID 10 держит данные', 'отказ диска', 'warn'], [0.965, 'Работает, массив восстанавливается', 'в работе', 'ready']] },
    // Hot swap at the end: disk 2 goes red and slides out, the new one comes in amber (rebuild)
    led: (key, p) => key !== 'led2' ? null : p >= 0.955 ? [242, 184, 75] : p >= 0.91 ? [255, 90, 70] : null,
    anim(p, parts) { const o = eIO(seg(p, 0.91, 0.935)) * (1 - eIO(seg(p, 0.945, 0.97))); if (o > 0) parts.hdd2.pos[2] += 1.1 * o; }
  },

  /* Сервер виртуализации: узел Hyper-V из нашей сделки 09.2026; память и ВМ по расчёту Антона 29.09.2026 (8 + 32 + 48 = 88 ГБ, с запасом 128 ГБ).
     2U, 1 × Xeon Gold 6544Y (второй сокет пуст), 8 × 16 ГБ DDR5,
     BOSS 2 × 960 ГБ RAID 1, RAID-контроллер с кэшем, 4 × 1,92 ТБ SSD в RAID 10 (пул под файлы убран 29.09.2026: файловой ВМ нет), 2 × 10/25 GbE, 2 БП */
  vs: {
    dur: 10, // seconds of the build in the gallery
    zoom: 0.84,
    build({ part, box }, X) {
      const T = { pcb: X.pcb('2S  DDR5  SERVER BOARD', 'LGA4677'), cpu: X.cpu('XEON GOLD', '6544Y', '3.60 GHz  16C/32T', 'LGA4677', 300, 420), dimm: X.dimm('16GB DDR5 RDIMM'),
        sffMU: X.sff('#5fb0e8'), sideMU: X.ssdSide('1.92 TB', 'MIXED USE', '#5fb0e8'),
        m2: X.m2('NVMe 960GB'), raid: X.card('RAID CONTROLLER', 'CACHE  PROTECTED'), ocp: X.ocp('OCP 3.0  2 × 25GbE'), sticker: X.sticker('VIRT  6544Y  128GB  4×SSD'),
        hv: X.slab('ГИПЕРВИЗОР', 'Hyper-V'), vm1: X.layer('ВМ 1', 'Контроллер домена', '2 vCPU  8 ГБ'), vm2: X.layer('ВМ 2', 'Сервер 1С', '6 vCPU  32 ГБ'), vm3: X.layer('ВМ 3', 'СУБД', '4 vCPU  48 ГБ') };
      const CH = part('chassis', [0, 0, 0]);
      const MET = '#9ea7b1', MET2 = '#b4bcc5';
      box(CH, 4.4, 0.03, 6.2, 0, 0.015, 0, MET, { tile: 0.5, bias: 1.5 });
      box(CH, 0.03, 0.88, 6.2, -2.185, 0.47, 0, MET2, { tile: 0.5 });
      box(CH, 0.03, 0.88, 6.2, 2.185, 0.47, 0, MET2, { tile: 0.5 });
      box(CH, 4.34, 0.88, 0.03, 0, 0.47, -3.085, '#8d96a0', { tile: 0.5 });
      box(CH, 4.3, 0.84, 0.04, 0, 0.45, 1.72, '#14402e', { tile: 0.5 });
      for (let i = 4; i < 16; i++) box(CH, 0.24, 0.8, 0.05, -1.875 + i * 0.25, 0.45, 3.075, '#262b32', { tex: { front: X.sffBlank } });
      box(CH, 0.17, 0.84, 0.05, -2.09, 0.45, 3.075, '#23282e'); box(CH, 0.17, 0.84, 0.05, 2.09, 0.45, 3.075, '#23282e');
      box(CH, 0.16, 0.88, 0.06, -2.28, 0.45, 3.08, '#23282e', { tex: { front: X.ear } });
      box(CH, 0.16, 0.88, 0.06, 2.28, 0.45, 3.08, '#23282e', { tex: { front: X.ear } });
      box(CH, 0.06, 0.06, 0.02, 2.28, 0.78, 3.115, '#3a414a', { key: 'pwrLed' });
      [-1.8, -1.08, -0.36, 0.36, 1.08, 1.8].forEach(x => box(CH, 0.66, 0.8, 0.3, x, 0.43, 1.3, '#1d2126', { tex: { front: X.fan, back: X.fan } }));
      const B = part('board', [-0.585, 0.085, -0.95]);
      box(B, 3.07, 0.03, 3.9, -0.585, 0.085, -0.95, '#0d2f55', { tex: { top: T.pcb }, tile: 0.36, bias: 0.6 });
      const DX = [-0.7, -0.615, -0.53, -0.445, 0.445, 0.53, 0.615, 0.7];
      [-1.35, 0.15].forEach(cx => {
        box(B, 0.62, 0.05, 0.84, cx, 0.125, -0.3, '#c3c9cf', { skip: ['bottom'] });
        box(B, 0.46, 0.012, 0.66, cx, 0.156, -0.3, '#2a2a2a', { tex: { top: X.pins }, skip: ['bottom'] });
        DX.forEach((dx, i) => {
          box(B, 0.055, 0.08, 1.3, cx + dx, 0.14, -0.3, i % 2 ? '#1a1c20' : '#243a66', { skip: ['bottom'], tile: 0.7 });
          box(B, 0.055, 0.1, 0.05, cx + dx, 0.15, -0.97, '#e7ebef', { skip: ['bottom'] }); box(B, 0.055, 0.1, 0.05, cx + dx, 0.15, 0.37, '#e7ebef', { skip: ['bottom'] });
        });
      });
      box(B, 0.52, 0.05, 0.74, 0.15, 0.172, -0.3, '#15181c', { skip: ['bottom'] }); // cover on the empty second socket
      box(B, 0.2, 0.15, 0.22, -1.95, 0.17, -2.75, '#c3c9cf'); box(B, 0.34, 0.12, 0.14, -1.95, 0.16, -2.45, '#2e56a6');
      box(B, 0.07, 0.08, 1.2, -0.3, 0.14, -2.2, '#1a1c20', { skip: ['bottom'] });
      box(B, 0.9, 0.05, 0.1, 0.35, 0.125, -2.24, '#1a1c20', { skip: ['bottom'] });
      const Bo = part('boss', [-1.35, 0.2, -2.1]);
      box(Bo, 0.9, 0.03, 0.95, -1.35, 0.2, -2.1, '#14402e', { tile: 0.5 });
      [-1.58, -1.12].forEach(x => box(Bo, 0.24, 0.02, 0.8, x, 0.225, -2.1, '#16211b', { tex: { top: T.m2 } }));
      const Rc = part('raid', [-0.3, 0.46, -2.2]);
      box(Rc, 0.03, 0.56, 1.4, -0.3, 0.46, -2.2, '#14402e', { tex: { left: T.raid, right: T.raid }, tile: 0.8 });
      box(Rc, 0.08, 0.22, 0.34, -0.245, 0.46, -2.0, '#8e98a3');
      box(Rc, 0.12, 0.64, 0.02, -0.33, 0.47, -3.06, '#b4bcc5');
      const N = part('nic', [0.35, 0.16, -2.6]);
      box(N, 0.9, 0.03, 0.62, 0.35, 0.16, -2.6, '#14402e', { tex: { top: T.ocp }, tile: 0.5 });
      [0.17, 0.53].forEach(x => box(N, 0.18, 0.12, 0.3, x, 0.24, -2.9, '#c3c9cf'));
      const C = part('cpu', [-1.35, 0.18, -0.3]);
      box(C, 0.5, 0.02, 0.7, -1.35, 0.172, -0.3, '#1e5a3c');
      box(C, 0.4, 0.03, 0.58, -1.35, 0.197, -0.3, '#d3d8dd', { tex: { top: T.cpu } });
      const K = part('cooler', [-1.35, 0.5, -0.3]);
      box(K, 0.66, 0.05, 0.86, -1.35, 0.237, -0.3, '#b87333');
      for (let i = 0; i < 13; i++) box(K, 0.018, 0.48, 0.86, -1.65 + i * 0.05, 0.5, -0.3, '#c8cfd6');
      DX.forEach((dx, i) => { const x = -1.35 + dx, P = part('ram' + (i + 1), [x, 0.265, -0.3]); box(P, 0.03, 0.31, 1.23, x, 0.265, -0.3, '#18503a', { tex: { right: T.dimm, left: T.dimm }, tile: 0.7 }); });
      const sff = (name, i, face, side) => {
        const x = -1.875 + i * 0.25, P = part(name, [x, 0.45, 2.42]);
        box(P, 0.24, 0.8, 0.05, x, 0.45, 3.075, '#2c323a', { tex: { front: face } });
        box(P, 0.04, 0.04, 0.02, x + 0.06, 0.8, 3.11, '#3a414a', { key: 'led' });
        box(P, 0.16, 0.7, 1.25, x, 0.45, 2.42, '#1b1f25', { tex: { left: side, right: side }, tile: 0.7 });
      };
      for (let i = 0; i < 4; i++) sff('mu' + (i + 1), i, T.sffMU, T.sideMU);
      [['psu1', 0.24], ['psu2', 0.67]].forEach(([n, y]) => { const P = part(n, [1.675, y, -2.0]); box(P, 0.95, 0.4, 2.1, 1.675, y, -2.0, '#737c86', { tex: { top: X.psu }, tile: 0.6 }); });
      const L = part('lid', [0, 0.92, 0]);
      box(L, 4.42, 0.025, 6.0, 0, 0.92, -0.1, '#aab2bb', { tile: 0.6, bias: -1 });
      box(L, 1.1, 0.004, 0.44, -0.9, 0.935, 1.4, '#ffffff', { tex: { top: T.sticker }, skip: ['bottom', 'left', 'right', 'back', 'front'], bias: -1.2 });
      const Hv = part('hv', [0, 1.3, 0.2]);
      box(Hv, 4.2, 0.06, 3.8, 0, 1.3, 0.2, '#0f3a70', { tex: { top: T.hv }, tile: 1.1, colors: { front: '#1b5aa0' }, bias: -2 });
      [['vm1', -1.0], ['vm2', 0.1], ['vm3', 1.2]].forEach(([n, z]) => {
        const P = part(n, [0, 1.6, z]);
        box(P, 3.4, 0.2, 0.9, 0, 1.6, z, '#0f3a70', { tex: { top: T[n] }, tile: 1.2, colors: { front: '#1a4f8f', left: '#15457d', right: '#15457d', back: '#15457d' }, bias: -2.6 });
      });
    },
    exp: (() => {
      const e = { board: { off: [0, 2.6, -0.2], rot: [-0.08, 0, 0.04] }, cpu: { off: [0, 3.6, 0], rot: [0, 0.9, 0] }, cooler: { off: [0, 4.8, 0], rot: [0, -0.4, 0] },
        boss: { off: [-0.6, 2.6, -0.6], rot: [0.3, 0.4, 0] }, raid: { off: [0, 2.6, -0.6], rot: [0, 0, 0.35] }, nic: { off: [0.6, 2.2, -1.6], rot: [0.25, 0, 0] },
        psu1: { off: [0.3, 0.3, -3.6], rot: [0, 0.3, 0] }, psu2: { off: [0.6, 1.0, -4.2], rot: [0, 0.2, 0] }, lid: { off: [0, 3.4, -0.6], rot: [-0.25, 0, 0] },
        hv: { off: [0, -0.35, 0] }, vm1: { off: [0, 1.2, -0.4] }, vm2: { off: [0, 1.2, -0.4] }, vm3: { off: [0, 1.2, -0.4] } };
      for (let i = 0; i < 8; i++) e['ram' + (i + 1)] = { off: [(i < 4 ? -1 : 1) * (0.5 + 0.18 * (i % 4)), 2.1 + 0.12 * i, 0.3], rot: [0, 0, (i < 4 ? -1 : 1) * 0.35] };
      for (let i = 0; i < 4; i++) e['mu' + (i + 1)] = { off: [0.1 * i, 1.2 + 0.2 * i, 1.0], rot: [0, 0.25, 0] };
      return e;
    })(),
    partT: (() => {
      const t = { board: [0.04, 0.11], cpu: [0.12, 0.17], cooler: [0.16, 0.21], boss: [0.34, 0.39], raid: [0.40, 0.45], nic: [0.46, 0.51], psu1: [0.66, 0.70], psu2: [0.68, 0.72], lid: [0.73, 0.79],
        hv: [0.85, 0.89], vm1: [0.88, 0.92], vm2: [0.91, 0.95], vm3: [0.94, 0.98] };
      for (let i = 0; i < 8; i++) t['ram' + (i + 1)] = [0.22 + i * 0.01, 0.26 + i * 0.01];
      ['mu1', 'mu2', 'mu3', 'mu4'].forEach((k, i) => { t[k] = [0.52 + i * 0.022, 0.57 + i * 0.022]; });
      return t;
    })(),
    fade: { lid: [0.70, 0.75], mu1: [0.53, 0.55], mu2: [0.552, 0.572], mu3: [0.574, 0.594], mu4: [0.596, 0.616], hv: [0.85, 0.89, 0.92], vm1: [0.88, 0.92, 0.94], vm2: [0.91, 0.95, 0.94], vm3: [0.94, 0.98, 0.94] },
    steps: { board: { t: [0.04, 0.11], tag: 'Плата, 2 сокета' }, cpu: { t: [0.12, 0.21], tag: 'Xeon Gold 6544Y, 16 ядер' }, ram: { t: [0.22, 0.33], tag: '8 × 16 GB DDR5', part: 'ram1' },
      boss: { t: [0.34, 0.39], tag: 'RAID 1, 2 × 960 GB NVMe' }, raid: { t: [0.40, 0.45], tag: 'RAID-контроллер' }, nic: { t: [0.46, 0.51], tag: '2 × 10/25 GbE' },
      ssd: { t: [0.52, 0.64], tag: 'RAID 10, 4 × 1,92 TB', part: 'mu1' }, psu: { t: [0.66, 0.72], tag: '2 блока питания', part: 'psu2' }, lid: { t: [0.73, 0.79], tag: 'Корпус 2U' }, os: { t: [0.81, 0.99] } },
    cam: [[0.00, [8.6, 9.4, 11.6], [0, 2.2, 0.4]], [0.10, [6.2, 6.2, 5.8], [-0.6, 0.9, -0.9]], [0.20, [3.8, 5.4, 3.6], [-1.3, 0.8, -0.4]], [0.32, [4.4, 5.0, 4.0], [-0.9, 0.6, -0.4]],
      [0.39, [2.4, 5.0, 1.8], [-1.2, 0.4, -2.0]], [0.51, [5.8, 5.0, -0.2], [0, 0.5, -2.3]], [0.64, [4.4, 3.6, 9.6], [-0.9, 0.5, 2.0]], [0.72, [6.6, 4.6, -5.8], [1.2, 0.5, -2.0]],
      [0.80, [7.6, 6.6, 9.0], [0, 0.5, 0]], [0.90, [6.8, 6.4, 9.6], [0.3, 0.7, 0.4]], [1.00, [6.2, 5.8, 10.2], [0.6, 0.55, 0.6]]],
    power: [0.81, 0.84],
    boot: { show: [0.81, 0.84], bar: [0.83, 0.88],
      lines: [[0.84, 'Процессор: Xeon Gold 6544Y, 16 ядер'], [0.855, 'Память: 128 GB ECC, ОК'], [0.87, 'RAID 10: 3,84 ТБ под машины и базы, ОК'],
        [0.9, 'ВМ «Контроллер домена»: запущена'], [0.93, 'ВМ «СУБД»: запущена'], [0.96, 'ВМ «Сервер 1С»: запущена']],
      states: [[0, 'Подготовка системы', 'загрузка'], [0.8301, 'Загрузка гипервизора', 'загрузка'], [0.88, 'Hyper-V работает, запуск машин', 'загрузка'], [0.965, 'Готов к работе, 3 ВМ запущены', 'в работе', 'ready']] }
  },

  /* Серверная под ключ: объект из нашего КП по ТЗ (сделка 2026-09, КП v3, схема «Архитектура» и таблица отказов). Без заказчика, цен и дат.
     Стойка 42U, ИБП онлайн 6 кВА, 2 сервера Hyper-V, NAS 2U 6 × 8 ТБ RAID 6, 2 коммутатора L3 10 GbE, межсетевой экран, 50 ПК.
     Высота устройств в юнитах условная: в КП её нет. */
  rk: {
    dur: 11, // seconds of the build in the gallery
    shadow: [-3.2, 3.2, -4, 4],
    grid: { x: [-15, 24], z: [-9, 9], step: 1.5, a: 0.09 },
    build({ part, box }, X) {
      const U = 0.46, yU = (k, n) => 0.5 + (k - 1) * U + n * U / 2; // centre of an n-unit device mounted from unit k
      const T = { hv1: X.srvFront('HV01'), hv2: X.srvFront('HV02'), sw: X.sw1u('CORE L3  10GbE'),
        dc1: X.plate('DC01', 'домен, DNS', 'on'), app1: X.plate('APP01', '1С, файлы', 'on'), db1: X.plate('DB01', 'база 1С', 'lin'), monc: X.plate('MON01', 'копия', 'copy'),
        dc2: X.plate('DC02', 'домен, DNS', 'on'), rep: X.plate('APP01', 'копия, 5 мин', 'copy'), repOn: X.plate('APP01', 'запущена', 'on'),
        db2: X.plate('DB02', 'реплика базы', 'lin'), db2On: X.plate('DB02', 'основная база', 'linOn'), mon: X.plate('MON01', 'мониторинг', 'lin') };
      part('chassis', [0, 0, 0]);
      const RK = part('rack', [0, 10, 0]);
      [[-2.85, -3.55], [2.85, -3.55], [-2.85, 3.55], [2.85, 3.55]].forEach(([x, z]) => box(RK, 0.3, 20.3, 0.3, x, 10.15, z, '#1c222b', { tile: 2.5 }));
      box(RK, 6.0, 0.5, 7.4, 0, 0.25, 0, '#161b22', { tile: 2 });
      box(RK, 6.0, 0.4, 7.4, 0, 20.1, 0, '#161b22', { tile: 2 });
      [-2.4, 2.4].forEach(x => {
        box(RK, 0.18, 42 * U, 0.12, x, 0.5 + 21 * U, 3.1, '#2a313b', { tex: { front: X.rail }, tile: 1.0 });
        box(RK, 0.18, 42 * U, 0.12, x, 0.5 + 21 * U, -3.1, '#2a313b', { tile: 2.5 });
      });
      [-2.85, 2.85].forEach(x => box(RK, 0.12, 0.12, 7.1, x, 10.15, 0, '#1c222b', { tile: 2.5 }));
      [5, 12, 15].forEach(k => box(RK, 4.6, U - 0.02, 0.05, 0, yU(k, 1), 3.12, '#1d232c', { tile: 5 }));
      const dev = (name, k, n, depth, img, color, led) => {
        const y = yU(k, n), z = 3.1 - depth / 2, P = part(name, [0, y, z]);
        box(P, 4.4, n * U - 0.03, depth, 0, y, z, color, { tex: { front: img }, tile: 1.2 });
        box(P, 0.07, 0.07, 0.02, 1.95, y + (n > 1 ? 0.25 : 0), 3.12, '#3a414a', { key: led, tile: 1 });
      };
      dev('ups', 1, 4, 5.4, X.ups, '#1c2129', 'pwrLed');
      dev('nas', 6, 2, 5.6, X.nasFront, '#2a3038', 'led');
      dev('hv2', 8, 2, 6.0, T.hv2, '#2c323a', 'led');
      dev('hv1', 10, 2, 6.0, T.hv1, '#2c323a', 'hv1');
      dev('sw1', 13, 1, 3.6, T.sw, '#1f252d', 'led');
      dev('sw2', 14, 1, 3.6, T.sw, '#1f252d', 'led');
      dev('fw', 16, 1, 3.6, X.fw1u, '#2a1d23', 'led');
      // 50 workplaces on the floor: monitors light up as each PC joins the domain
      const PC = part('pcs', [14.75, 0.4, 0]);
      for (let r = 0; r < 5; r++) for (let c = 0; c < 10; c++) {
        const i = r * 10 + c, x = 8 + c * 1.5, z = -4 + r * 2;
        box(PC, 0.08, 0.26, 0.08, x, 0.13, z, '#1a1f27', { tile: 1 });
        box(PC, 0.9, 0.52, 0.06, x, 0.52, z, '#1a1f27', { tile: 1 });
        box(PC, 0.82, 0.44, 0.01, x, 0.52, z + 0.036, '#10151c', { key: 'pc' + i, tile: 1, glow: false, skip: ['back', 'left', 'right', 'top', 'bottom'] });
      }
      // Virtual machines, as on the scheme in the proposal
      const plate = (name, x, y, img, z = 3.3) => { const P = part(name, [x, y, z]); box(P, 2.1, 1.0, 0.05, x, y, z, '#0b1a33', { tex: { front: img }, tile: 2.5 }); };
      plate('dc1', 5.2, 7.4, T.dc1); plate('app1', 7.5, 7.4, T.app1); plate('db1', 9.8, 7.4, T.db1); plate('monc', 12.1, 7.4, T.monc);
      plate('dc2', 5.2, 5.6, T.dc2); plate('rep', 7.5, 5.6, T.rep); plate('repOn', 7.5, 5.6, T.repOn, 3.34);
      plate('db2', 9.8, 5.6, T.db2); plate('db2On', 9.8, 5.6, T.db2On, 3.34); plate('mon', 12.1, 5.6, T.mon);
    },
    exp: { rack: { off: [0, 6, 0] }, ups: { off: [0, 0.3, 8] }, nas: { off: [0, 0.3, 8] }, hv2: { off: [0, 0.3, 8] }, hv1: { off: [0, 0.3, 8] },
      sw1: { off: [0, 0.3, 7] }, sw2: { off: [0, 0.3, 7] }, fw: { off: [0, 0.3, 7] }, pcs: { off: [0, -0.6, 0] },
      dc1: { off: [0, 0, 1] }, app1: { off: [0, 0, 1] }, db1: { off: [0, 0, 1] }, monc: { off: [0, 0, 1] }, dc2: { off: [0, 0, 1] }, rep: { off: [0, 0, 1] }, db2: { off: [0, 0, 1] }, mon: { off: [0, 0, 1] } },
    partT: { rack: [0.02, 0.09], ups: [0.11, 0.18], hv1: [0.21, 0.27], hv2: [0.26, 0.33], nas: [0.35, 0.42], sw1: [0.44, 0.48], sw2: [0.46, 0.5], fw: [0.49, 0.53], pcs: [0.55, 0.58],
      dc1: [0.7, 0.73], dc2: [0.71, 0.74], app1: [0.72, 0.75], rep: [0.73, 0.76], db1: [0.735, 0.765], db2: [0.745, 0.775], monc: [0.75, 0.78], mon: [0.755, 0.785] },
    fade: { rack: [0.02, 0.06], ups: [0.1, 0.12], hv1: [0.2, 0.22], hv2: [0.25, 0.27], nas: [0.34, 0.36], sw1: [0.43, 0.45], sw2: [0.45, 0.47], fw: [0.48, 0.5], pcs: [0.55, 0.58], dc1: [0.7, 0.73], dc2: [0.71, 0.74], app1: [0.72, 0.75], rep: [0.73, 0.76], db1: [0.735, 0.765], db2: [0.745, 0.775], monc: [0.75, 0.78], mon: [0.755, 0.785] },
    // Failure of HV01: its machines dim, the base moves to the replica DB02, the copy of APP01 starts on HV02
    anim(p, parts) {
      const f = 1 - 0.7 * seg(p, 0.85, 0.88), db = seg(p, 0.89, 0.92), sw = seg(p, 0.92, 0.95);
      parts.dc1.alpha *= f; parts.app1.alpha *= f; parts.db1.alpha *= f; parts.monc.alpha *= f;
      parts.db2.alpha *= 1 - db; parts.db2On.alpha = db;
      parts.rep.alpha *= 1 - sw; parts.repOn.alpha = sw;
    },
    led(key, p) {
      if (key === 'hv1') return p >= 0.85 ? [255, 90, 70] : p >= 0.34 ? [40, 220, 120] : null;
      if (key.startsWith('pc')) return p >= 0.58 + (+key.slice(2)) * 0.0018 ? [95, 176, 232] : null;
      return null;
    },
    lines(p) {
      const L = [{ pts: [[2.2, 6.25, 3.15], [3.4, 6.25, 3.4], [3.4, 0.05, 3.4], [3.4, 0.05, 5.4], [7.0, 0.05, 5.4], [7.0, 0.05, -3.6]], t: seg(p, 0.56, 0.6), rgb: '143,208,255', a: 0.85 }];
      for (let r = 0; r < 5; r++) L.push({ pts: [[7.0, 0.05, -3.55 + r * 2], [22, 0.05, -3.55 + r * 2]], t: seg(p, 0.58 + r * 0.012, 0.64 + r * 0.012), rgb: '143,208,255', a: 0.7, w: 1.2 });
      const vm = seg(p, 0.72, 0.76), bk = seg(p, 0.77, 0.81);
      L.push({ pts: [[4.15, 7.4, 3.3], [3.3, 7.4, 3.3], [3.3, 5.1, 3.3], [2.25, 5.1, 3.15]], t: vm, rgb: '143,208,255', a: 0.6, w: 1.2 });
      L.push({ pts: [[4.15, 5.6, 3.3], [3.6, 5.6, 3.3], [3.6, 4.18, 3.3], [2.25, 4.18, 3.15]], t: vm, rgb: '143,208,255', a: 0.6, w: 1.2 });
      L.push({ pts: [[5.2, 6.9, 3.3], [5.2, 6.1, 3.3]], t: seg(p, 0.75, 0.78), rgb: '143,208,255', a: 0.8 });
      L.push({ pts: [[7.5, 6.9, 3.3], [7.5, 6.1, 3.3]], t: seg(p, 0.76, 0.79), rgb: '127,224,166', a: 0.9 * (1 - seg(p, 0.85, 0.88)), dash: true });
      L.push({ pts: [[9.8, 6.9, 3.3], [9.8, 6.1, 3.3]], t: seg(p, 0.765, 0.795), rgb: '190,150,255', a: 0.9 * (1 - seg(p, 0.85, 0.88)) });
      L.push({ pts: [[12.1, 6.1, 3.3], [12.1, 6.9, 3.3]], t: seg(p, 0.775, 0.805), rgb: '127,224,166', a: 0.8, dash: true });
      L.push({ pts: [[-2.2, 5.1, 3.15], [-2.95, 5.1, 3.3], [-2.95, 3.26, 3.3], [-2.2, 3.26, 3.15]], t: bk, rgb: '242,184,75', a: 0.85, dash: true });
      L.push({ pts: [[-2.2, 4.18, 3.15], [-2.95, 4.18, 3.3]], t: bk, rgb: '242,184,75', a: 0.85, dash: true });
      return L;
    },
    labels(p) {
      return [
        { at: [0, 20.3, 3.6], text: 'Стойка 42U', a: seg(p, 0.03, 0.07) * (1 - seg(p, 0.12, 0.16)) },
        { at: [0, 12.5, 3.2], text: 'Место под рост', a: seg(p, 0.5, 0.54) * (1 - seg(p, 0.6, 0.64)) },
        { at: [14.75, 1.1, -4.4], text: '50 рабочих мест', a: seg(p, 0.6, 0.64) * (1 - seg(p, 0.69, 0.72)) },
        { at: [0.9, 5.3, 3.2], text: 'HV01: отказ', a: seg(p, 0.85, 0.88), warn: true },
        { at: [7.5, 5.1, 3.35], text: 'Копия APP01 запущена', a: seg(p, 0.94, 0.97) }
      ];
    },
    steps: { rack: { t: [0.02, 0.1] }, ups: { t: [0.11, 0.19], tag: 'ИБП 6 кВА' }, srv: { t: [0.21, 0.34], tag: 'HV01 и HV02', part: 'hv1' }, nas: { t: [0.35, 0.43], tag: 'NAS, RAID 6' },
      net: { t: [0.44, 0.54], tag: 'Ядро сети и экран', part: 'fw' }, pcs: { t: [0.55, 0.68] }, vms: { t: [0.7, 0.81] }, fail: { t: [0.83, 0.98] } },
    cam: [[0.00, [20, 18, 42], [0, 9.5, 0]], [0.10, [16, 14, 34], [0, 9, 0]], [0.19, [8, 4.5, 13], [0, 2, 1]], [0.33, [8.5, 7, 13], [0, 4.6, 1]], [0.43, [8, 5, 12.5], [0, 3.4, 1]],
      [0.54, [8, 9, 12.5], [0, 6.8, 1]], [0.68, [24, 24, 30], [9, 1, 0]], [0.81, [10.5, 10.5, 25], [6.2, 5.4, 0.5]], [0.98, [10, 10, 24], [6.0, 5.3, 0.5]], [1.00, [10, 10, 24], [6.0, 5.3, 0.5]]],
    power: [0.34, 0.37],
    boot: { show: [0.7, 0.73], bar: [0.71, 0.8],
      lines: [[0.74, 'Домен: DC01 и DC02, репликация ОК'], [0.765, 'База 1С: реплика на DB02 отстаёт на секунды'], [0.785, 'APP01: копия на HV02 каждые 5 минут'], [0.8, 'Копии на NAS: ежедневно'],
        [0.86, 'HV01 не отвечает', 'warn'], [0.91, 'База переведена на DB02'], [0.945, 'Копия APP01 запущена на HV02'], [0.965, 'Пользователи работают, домен на DC02']],
      states: [[0, 'Запуск машин', 'проверка'], [0.8, 'Всё работает', 'в работе', 'ready'], [0.86, 'Отказ сервера HV01', 'отказ', 'warn'], [0.96, 'Отказ отработан: база теряет секунды, файлы до 5 минут', 'в работе', 'ready']] }
  },

  /* Видеонаблюдение под ключ: условный объект (офис, склад, двор, парковка), 8 камер. Без марок и цифр до ответов Антона */
  cv: {
    dur: 9, // seconds of the build in the gallery
    shadow: null,
    grid: { x: [-12, 17], z: [-9, 13], step: 1, a: 0.08 },
    build({ part, box, quad }, X) {
      const CH = part('chassis', [0, 0, 0]);
      box(CH, 12, 0.06, 8, 0, 0.03, 0, '#15243a', { tile: 3, bias: 3 });
      box(CH, 6.4, 0.05, 9.8, 9.2, 0.025, 0.5, '#161c27', { tile: 3, bias: 3 });
      box(CH, 10, 0.05, 4.6, -1, 0.025, 7.1, '#161c27', { tile: 3, bias: 3 });
      for (let i = 0; i < 8; i++) box(CH, 0.05, 0.01, 2.6, -5.5 + i * 1.3, 0.06, 7.9, '#8a96a6', { tile: 3, bias: 2.5 });
      const WL = part('walls', [0, 0.5, 0]), wc = '#aab4c0', th = 0.12;
      const wx = (x0, x1, z) => box(WL, x1 - x0, 1, th, (x0 + x1) / 2, 0.5, z, wc, { tile: 1.5 });
      const wz = (z0, z1, x) => box(WL, th, 1, z1 - z0, x, 0.5, (z0 + z1) / 2, wc, { tile: 1.5 });
      wx(-6, 6, -4); wx(-6, -3.6, 4); wx(-2.4, 6, 4);
      wz(-4, 4, -6); wz(-4, -0.8, 6); wz(1.8, 4, 6);
      wz(-4, 1, 0); wz(2.2, 4, 0);
      const FU = part('furn', [2, 0.4, 0]);
      [1.6, 2.9, 4.2].forEach(x => box(FU, 0.5, 0.85, 4.2, x, 0.43, -1.2, '#5d6b7c', { tile: 1.5 }));
      [[-4.6, 0.2], [-2.6, 0.2], [-4.6, 1.8], [-2.6, 1.8]].forEach(([x, z]) => box(FU, 1.3, 0.4, 0.7, x, 0.2, z, '#2f3a4a', { tile: 1.5 }));
      box(FU, 1.8, 0.42, 0.7, -3, 0.21, -3.3, '#2f3a4a', { tile: 1.5 });
      box(FU, 1.3, 0.8, 0.06, -3, 0.85, -3.55, '#1a1f27', { tile: 1.5 });
      [[-4.9, 7.9, '#3b4a5e'], [-1.0, 7.9, '#4a3b3b']].forEach(([x, z, c]) => box(FU, 1.0, 0.45, 2.0, x, 0.28, z, c, { tile: 1.2 }));
      const fc = '#6b7888';
      box(FU, 6.4, 0.7, 0.05, 9.2, 0.35, -4.4, fc, { tile: 1.6 }); box(FU, 6.4, 0.7, 0.05, 9.2, 0.35, 5.4, fc, { tile: 1.6 });
      box(FU, 0.05, 0.7, 4.4, 12.4, 0.35, -2.2, fc, { tile: 1.6 }); box(FU, 0.05, 0.7, 2.8, 12.4, 0.35, 4.0, fc, { tile: 1.6 });
      // cameras: position, view direction in degrees on the plan, reach of the sector
      [[-3.0, 0.95, 4.16, 90, 4.2], [4.0, 1.9, 9.4, 213, 6.5], [-5.8, 0.95, 3.8, -19, 4], [-0.2, 0.95, -3.8, 135, 5],
        [0.2, 0.95, -3.8, 45, 5.5], [5.8, 0.95, 3.8, -135, 5.5], [12.2, 1.9, -4.2, 107, 6.5], [6.16, 0.95, 2.2, 0, 5]].forEach(([x, y, z, deg, R], i) => {
        const a = deg * Math.PI / 180, dx = Math.cos(a), dz = Math.sin(a), P = part('cam' + (i + 1), [x, y, z]);
        if (y > 1.2) box(P, 0.08, y, 0.08, x, y / 2, z, '#6b7888', { tile: 2 });
        box(P, 0.3, 0.16, 0.3, x + dx * 0.12, y, z + dz * 0.12, '#dfe6ee', { tile: 1 });
        box(P, 0.12, 0.12, 0.12, x + dx * 0.3, y - 0.02, z + dz * 0.3, '#1b1f25', { tile: 1 });
        box(P, 0.05, 0.05, 0.05, x + dx * 0.12, y + 0.1, z + dz * 0.12, '#3a414a', { key: 'led', tile: 1 });
        const C = part('cone' + (i + 1), [x, 0.08, z]), ha = 0.66, N = 6;
        for (let k = 0; k < N; k++) {
          const a0 = a - ha + 2 * ha * k / N, a1 = a - ha + 2 * ha * (k + 1) / N;
          quad(C, [[x, 0.08, z], [x + Math.cos(a0) * R, 0.08, z + Math.sin(a0) * R], [x + Math.cos(a1) * R, 0.08, z + Math.sin(a1) * R]], '#5fb0e8', { twoSided: true, bias: -0.3 });
        }
      });
      // cabinet: PoE switch, recorder, UPS
      const CB = part('cab', [-5.35, 0.78, -3.45]);
      [[-0.42, -0.27], [0.42, -0.27], [-0.42, 0.27], [0.42, 0.27]].forEach(([dx, dz]) => box(CB, 0.06, 1.5, 0.06, -5.35 + dx, 0.78, -3.45 + dz, '#1c222b', { tile: 2 }));
      box(CB, 0.9, 0.05, 0.6, -5.35, 1.53, -3.45, '#1c222b', { tile: 1 }); box(CB, 0.9, 0.05, 0.6, -5.35, 0.05, -3.45, '#1c222b', { tile: 1 });
      const dv = (name, y, h, img) => { const P = part(name, [-5.35, y, -3.45]); box(P, 0.8, h, 0.5, -5.35, y, -3.45, '#1f252d', { tex: { front: img }, tile: 1 }); box(P, 0.04, 0.04, 0.02, -5.05, y, -3.19, '#3a414a', { key: 'led', tile: 1 }); };
      dv('poe', 1.3, 0.1, X.poe); dv('nvr', 1.02, 0.24, X.nvr); dv('ups', 0.32, 0.4, X.upsSmall);
      const S = part('screen', [-3, 0.85, -3.51]);
      box(S, 1.2, 0.7, 0.01, -3, 0.85, -3.51, '#05080e', { tex: { front: X.feeds }, tile: 1.5, glow: false, skip: ['back', 'left', 'right', 'top', 'bottom'] });
    },
    exp: (() => { const e = { walls: { off: [0, 1.6, 0] }, furn: { off: [0, 1.0, 0] }, cab: { off: [0, 1.5, 0] }, poe: { off: [0, 0.2, 1.4] }, nvr: { off: [0, 0.2, 1.8] }, ups: { off: [0, 0.2, 2.2] } };
      for (let i = 1; i <= 8; i++) e['cam' + i] = { off: [0, 1.2, 0] }; return e; })(),
    partT: (() => { const t = { walls: [0.03, 0.11], furn: [0.07, 0.15], cab: [0.58, 0.62], poe: [0.61, 0.65], nvr: [0.63, 0.67], ups: [0.65, 0.69] };
      for (let i = 0; i < 8; i++) t['cam' + (i + 1)] = [0.17 + i * 0.022, 0.21 + i * 0.022]; return t; })(),
    fade: (() => { const f = { walls: [0.03, 0.08], furn: [0.07, 0.12], cab: [0.58, 0.61], poe: [0.61, 0.63], nvr: [0.63, 0.65], ups: [0.65, 0.67], screen: [0.74, 0.78] };
      for (let i = 0; i < 8; i++) f['cam' + (i + 1)] = [0.17 + i * 0.022, 0.19 + i * 0.022]; return f; })(),
    // sectors: faint while designing, brighter once the cameras record
    anim(p, parts) { for (let i = 0; i < 8; i++) parts['cone' + (i + 1)].alpha = 0.12 * seg(p, 0.19 + i * 0.022, 0.23 + i * 0.022) + 0.12 * seg(p, 0.74, 0.8); },
    lines(p) {
      const cab = [-5.35, 1.55, -3.45];
      const R = [
        [[-3, 0.95, 4.16], [-3, 0.99, 3.88], [-5.88, 0.99, 3.88], [-5.88, 0.99, -3.45], cab],
        [[4, 1.9, 9.4], [4, 0.07, 9.4], [4, 0.07, 4.12], [4, 0.99, 3.88], [-5.88, 0.99, 3.88], [-5.88, 0.99, -3.45], cab],
        [[-5.8, 0.95, 3.8], [-5.88, 0.99, 3.8], [-5.88, 0.99, -3.45], cab],
        [[-0.2, 0.95, -3.8], [-0.2, 0.99, -3.88], [-5.35, 0.99, -3.88], cab],
        [[0.2, 0.95, -3.8], [0.2, 0.99, -3.88], [-5.35, 0.99, -3.88], cab],
        [[5.8, 0.95, 3.8], [5.88, 0.99, 3.8], [5.88, 0.99, -3.88], [-5.35, 0.99, -3.88], cab],
        [[12.2, 1.9, -4.2], [12.2, 0.07, -4.2], [6.12, 0.07, -4.2], [6.12, 0.99, -3.88], [-5.35, 0.99, -3.88], cab],
        [[6.16, 0.95, 2.2], [5.88, 0.99, 2.2], [5.88, 0.99, -3.88], [-5.35, 0.99, -3.88], cab]
      ];
      const on = seg(p, 0.72, 0.76);
      // Board style (Антон, 11.10.2026): bends along the walls cut at 45 degrees, vias at the bends, and once the
      // system starts one signal runs along every trace from its camera to the cabinet, like the traces on the board.
      const cut = pts => {
        const out = [pts[0]];
        for (let i = 1; i < pts.length - 1; i++) {
          const a = pts[i - 1], b = pts[i], n = pts[i + 1];
          const flat = Math.abs(a[1] - b[1]) < 0.05 && Math.abs(n[1] - b[1]) < 0.05;
          const d1 = Math.hypot(b[0] - a[0], b[2] - a[2]), d2 = Math.hypot(n[0] - b[0], n[2] - b[2]), r = Math.min(0.45, d1 / 2, d2 / 2);
          if (!flat || r < 0.05) { out.push(b); continue; }
          out.push([b[0] - (b[0] - a[0]) / d1 * r, b[1], b[2] - (b[2] - a[2]) / d1 * r], [b[0] + (n[0] - b[0]) / d2 * r, b[1], b[2] + (n[2] - b[2]) / d2 * r]);
        }
        out.push(pts[pts.length - 1]); return out;
      };
      return R.map((pts, i) => ({ pts: cut(pts), t: seg(p, 0.38 + i * 0.02, 0.44 + i * 0.02), rgb: '143,208,255', a: 0.7 + 0.25 * on, w: 1.5, vias: true,
        sig: seg(p, 0.72 + i * 0.008, 0.8 + i * 0.008) }));
    },
    labels(p) {
      const z = seg(p, 0.05, 0.1) * (1 - seg(p, 0.3, 0.36));
      const L = [['Вход', [-3, 1.1, 4.3]], ['Парковка', [-1, 0.5, 8.6]], ['Офис', [-3, 1.1, 1.0]], ['Склад', [3, 1.1, -1]], ['Ворота', [12.4, 0.9, 1.3]], ['Двор', [9.2, 0.5, -1.5]]]
        .map(([text, at]) => ({ text, at, a: z }));
      L.push({ text: 'Шкаф', at: [-5.35, 1.6, -3.45], a: seg(p, 0.46, 0.5) * (1 - seg(p, 0.57, 0.6)) });
      L.push({ text: 'Просмотр с телефона', at: [-3, 1.3, -3.55], a: seg(p, 0.9, 0.94) });
      return L;
    },
    steps: { obj: { t: [0.03, 0.16] }, cams: { t: [0.17, 0.36], tag: '8 камер', part: 'cam5' }, cable: { t: [0.38, 0.57] }, cab: { t: [0.58, 0.7], tag: 'Коммутатор, запись, ИБП', part: 'nvr' },
      launch: { t: [0.72, 0.86] }, hand: { t: [0.88, 0.98] } },
    cam: [[0.00, [15, 21, 23], [2.5, 0, 1.5]], [0.14, [13, 17, 19], [2.5, 0, 1.2]], [0.30, [11, 15, 17], [2.0, 0, 1.2]], [0.50, [7, 13, 13], [0, 0.5, 0]],
      [0.64, [-1.2, 3.6, 1.6], [-5.3, 0.8, -3.4]], [0.76, [0.5, 4.8, 3.2], [-3.2, 0.8, -3.3]], [0.90, [13, 16, 19], [2.5, 0, 1.5]], [1.00, [14, 18, 21], [2.5, 0, 1.8]]],
    power: [0.72, 0.75],
    boot: { show: [0.72, 0.75], bar: [0.73, 0.8],
      lines: [[0.77, 'Камеры: 8 из 8 в сети'], [0.8, 'Запись в архив идёт'], [0.84, 'Изображение с каждой камеры проверено'], [0.9, 'Просмотр с телефона настроен'], [0.94, 'Схема камер и трасс передана']],
      states: [[0, 'Подключение камер', 'запуск'], [0.8, 'Все камеры пишут в архив', 'в работе', 'ready'], [0.94, 'Объект сдан', 'сдан', 'ready']] }
  }
};

function serverScene(card, def) {
  const { V, euler, ap } = K3;
  const cv = card.querySelector('canvas'), ctx = cv.getContext('2d');
  const M = K3.model(); def.build(M, TX.X);
  const parts = M.parts;
  const side = card.querySelector('.sc-side'), head = card.querySelector('.sc-head'), buildEl = card.querySelector('.build');
  const tagEl = card.querySelector('.tag'), bar = card.querySelector('.bar');
  const boot = card.querySelector('.boot'), pbar = card.querySelector('.pbar i'), bootText = card.querySelector('.bootText'), bootState = card.querySelector('.bootState'), bootList = card.querySelector('.bootList');
  const STEPS = [...card.querySelectorAll('.step')].map(li => Object.assign({ key: li.dataset.key, el: li }, def.steps[li.dataset.key]));
  const BT = def.boot, CAM = def.cam;
  // Phones (Антон, 11.10.2026: тексты шагов «перебираются один за одним, очень мелькают»): no step texts; the result panel is
  // there from the start and fills up line by line as the build goes, each check lighting a moment after its line, and the final
  // state lights up at the end. Lines up to a failure demo are spread over the build; the failure demo keeps its own time.
  const NARROW = matchMedia('(max-width: 860px)');
  const MOB = (() => {
    const w = BT.lines.findIndex(l => l[2] === 'warn'), k = w < 0 ? BT.lines.length : w;
    const tA = (STEPS[1] || STEPS[0]).t[1], tB = k ? BT.lines[k - 1][0] : BT.show[1];
    return { lines: BT.lines.map((l, i) => i < k ? [k > 1 ? lerp(tA, tB, i / (k - 1)) : tB, l[1], l[2]] : l),
      endT: BT.states[BT.states.length - 1][0], first: [0, card.closest('#turnkey') ? 'Монтаж' : 'Сборка', 'идёт'] };
  })();
  const bootLi = (l, fresh) => `<li class="${(l[2] || '') + (fresh ? ' fresh' : '')}"><i>${l[2] === 'warn' ? '!' : '✓'}</i> ${l[1]}</li>`;
  const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const LIGHT = V.norm([-0.35, 1, 0.55]);
  let W = 0, H = 0, DPR = 1, cur = 0, last = -1, headBottom = 0, visible = false, shownLines = -1, lastState = null;

  function resize() {
    W = cv.clientWidth; H = cv.clientHeight;
    if (!W || !H) return;
    // Full-card canvas at DPR 2 on a desktop is ~3M pixels per frame; 1.5 looks the same on these scenes.
    DPR = Math.min(devicePixelRatio || 1, W * H > 600000 ? 1.5 : 2);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    headBottom = side.offsetTop + head.offsetTop + head.offsetHeight;
    last = -1;
    frame(REDUCE ? 1 : cur); last = cur;
  }
  function camAt(p) { let i = 0; while (i < CAM.length - 2 && p > CAM[i + 1][0]) i++; const [p0, a0, t0] = CAM[i], [p1, a1, t1] = CAM[i + 1], t = eIO(seg(p, p0, p1)); return [lerp3(a0, a1, t), lerp3(t0, t1, t)]; }
  function ledCol(key, p, power) {
    const c = def.led && def.led(key, p, power); if (c) return c;
    if (power <= 0) return null;
    if (key === 'led' || key === 'led2') return [40, 220, 120];
    if (key === 'pwrLed') return [90, 180, 255];
    return null;
  }

  function frame(p) {
    if (!W || !H) return;
    const power = seg(p, def.power[0], def.power[1]);
    for (const k in parts) {
      const P = parts[k]; if (k === 'chassis') continue;
      const tt = def.partT[k], e = def.exp[k], t = tt ? eIO(seg(p, tt[0], tt[1])) : 1;
      P.pos = e ? V.add(P.c, V.mul(e.off, 1 - t)) : P.c.slice();
      P.rot = e && e.rot ? V.mul(e.rot, 1 - t) : [0, 0, 0];
      const fd = def.fade && def.fade[k];
      P.alpha = fd ? seg(p, fd[0], fd[1]) * (fd[2] || 1) : 1; P.t = t;
    }
    if (def.anim) def.anim(p, parts);
    const [cam, tgt] = camAt(p);
    const f = V.norm(V.sub(tgt, cam)), r = V.norm(V.cross(f, [0, 1, 0])), u = V.cross(r, f);
    const aspect = W / H, fov = aspect < 0.8 ? 0.95 : 0.62;
    const FL = (H / 2) / Math.tan(fov / 2) * (aspect < 0.8 ? Math.min(1, aspect * 1.35) : 1) * (def.zoom || 1);
    // On narrow cards centre the model in the free band between the title block and the step panel (~96px).
    const cx = W / 2 + (W > 860 ? 150 : 0), cy = W > 860 ? H / 2 + 10 : Math.max(H / 2, (headBottom + H - 96) / 2);
    const proj = q => { const d = V.sub(q, cam); const z = V.dot(d, f); return [cx + V.dot(d, r) / z * FL, cy - V.dot(d, u) / z * FL, z]; };
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const ctr = proj([0, 0, 0]);
    const fg = ctx.createRadialGradient(ctr[0], ctr[1], 0, ctr[0], ctr[1], Math.max(W, H) * .45);
    fg.addColorStop(0, 'rgba(95,176,232,.13)'); fg.addColorStop(1, 'rgba(95,176,232,0)');
    ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H);
    // Floor grid: the same ground the descent landed on
    if (def.grid) {
      const G = def.grid; ctx.beginPath();
      const ln = (a, b) => { const A = proj(a), B = proj(b); if (A[2] < 0.2 || B[2] < 0.2) return; ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); };
      for (let x = G.x[0]; x <= G.x[1] + 1e-6; x += G.step) ln([x, 0, G.z[0]], [x, 0, G.z[1]]);
      for (let z = G.z[0]; z <= G.z[1] + 1e-6; z += G.step) ln([G.x[0], 0, z], [G.x[1], 0, z]);
      ctx.strokeStyle = `rgba(95,176,232,${G.a || 0.1})`; ctx.lineWidth = 1; ctx.stroke();
    }
    // Soft shadow as three stacked fills instead of ctx.filter blur: the filter costs a full offscreen pass every frame.
    const SH = def.shadow === undefined ? [-2.5, 2.5, -3.4, 3.5] : def.shadow;
    if (SH) {
      const sh = [[SH[0], 0, SH[2]], [SH[1], 0, SH[2]], [SH[1], 0, SH[3]], [SH[0], 0, SH[3]]].map(proj);
      const shc = [(sh[0][0] + sh[2][0]) / 2, (sh[0][1] + sh[2][1]) / 2];
      ctx.fillStyle = 'rgba(0,0,0,.2)';
      for (const sc of [1.14, 1.06, 0.98]) {
        ctx.beginPath();
        sh.forEach((q, i) => { const x = shc[0] + (q[0] - shc[0]) * sc, y = shc[1] + (q[1] - shc[1]) * sc; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.fill();
      }
    }
    const list = [];
    for (const k in parts) {
      const P = parts[k]; if (P.alpha <= 0.001) continue;
      const Mx = euler(P.rot[0], P.rot[1], P.rot[2]);
      for (const F of P.faces) {
        let n = ap(Mx, F.n); const w = F.pts.map(q => V.add(ap(Mx, q), P.pos));
        const c4 = V.mul(V.add(V.add(w[0], w[1]), V.add(w[2], w[3])), 0.25);
        if (V.dot(n, V.sub(cam, c4)) <= 0) { if (!F.two) continue; n = V.mul(n, -1); }
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
      const lc = F.key ? ledCol(F.key, p, power) : null;
      const c = lc || F.col.map(v => Math.round(v * shade));
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
      if (lc && !F.noGlow) { ctx.save(); ctx.globalAlpha = 0.5 * Math.max(power, 0.6) * it.alpha; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 14; ctx.fill(); ctx.restore(); }
    }
    ctx.globalAlpha = 1;
    // Cables, network links and backup routes: drawn over the model like a schematic, revealed along their length
    if (def.lines) for (const L of def.lines(p)) {
      if (L.t <= 0 || L.a <= 0) continue;
      const P3 = L.pts, lens = []; let total = 0;
      for (let i = 1; i < P3.length; i++) { const d = Math.hypot(...V.sub(P3[i], P3[i - 1])); lens.push(d); total += d; }
      let left = total * L.t; const Q = [proj(P3[0])];
      for (let i = 1; i < P3.length && left > 0; i++) {
        const k = Math.min(1, left / lens[i - 1]); left -= lens[i - 1];
        Q.push(proj(k < 1 ? V.add(P3[i - 1], V.mul(V.sub(P3[i], P3[i - 1]), k)) : P3[i]));
      }
      if (Q.some(q => q[2] < 0.2)) continue;
      ctx.beginPath(); Q.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]));
      ctx.setLineDash(L.dash ? [6, 5] : []); ctx.lineJoin = 'round';
      ctx.strokeStyle = `rgba(${L.rgb},${(L.a * 0.25).toFixed(3)})`; ctx.lineWidth = (L.w || 1.6) + 4; ctx.stroke();
      ctx.strokeStyle = `rgba(${L.rgb},${L.a.toFixed(3)})`; ctx.lineWidth = L.w || 1.6; ctx.stroke();
      ctx.setLineDash([]);
      if (L.t < 1) { const h = Q[Q.length - 1]; ctx.fillStyle = `rgba(232,242,255,${L.a.toFixed(3)})`; ctx.beginPath(); ctx.arc(h[0], h[1], 2.4, 0, 6.2832); ctx.fill(); }
      if (L.vias && L.t >= 1) { // board style: small rings where the trace bends
        ctx.fillStyle = '#0b1424'; ctx.strokeStyle = `rgba(${L.rgb},${L.a.toFixed(3)})`; ctx.lineWidth = 1;
        for (let i = 1; i < Q.length - 1; i++) { ctx.beginPath(); ctx.arc(Q[i][0], Q[i][1], 2.2, 0, 6.2832); ctx.fill(); ctx.stroke(); }
      }
      if (L.sig > 0 && L.sig < 1 && L.t >= 1) { // one signal along the finished trace
        let s = total * L.sig, i = 1; while (i < P3.length - 1 && s > lens[i - 1]) { s -= lens[i - 1]; i++; }
        const q = proj(V.add(P3[i - 1], V.mul(V.sub(P3[i], P3[i - 1]), Math.min(1, s / lens[i - 1]))));
        if (q[2] > 0.2) {
          const gr = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], 10); gr.addColorStop(0, 'rgba(143,208,255,.7)'); gr.addColorStop(1, 'rgba(143,208,255,0)');
          ctx.fillStyle = gr; ctx.fillRect(q[0] - 10, q[1] - 10, 20, 20);
          ctx.fillStyle = '#eaf6ff'; ctx.beginPath(); ctx.arc(q[0], q[1], 2.4, 0, 6.2832); ctx.fill();
        }
      }
    }
    // Labels pinned to points of the model
    if (def.labels) {
      ctx.font = '500 11px "JetBrains Mono", ui-monospace, monospace'; ctx.textBaseline = 'middle';
      for (const Lb of def.labels(p)) {
        if (Lb.a <= 0.01) continue;
        const q = proj(Lb.at); if (q[2] < 0.2) continue;
        const tw = ctx.measureText(Lb.text).width, bw = tw + 16, bx = q[0] - bw / 2, by = q[1] - 30;
        if (W <= 860 && by < headBottom + 6) continue;   // narrow cards: not under the title and button
        ctx.globalAlpha = Lb.a;
        ctx.fillStyle = Lb.warn ? 'rgba(40,10,12,.9)' : 'rgba(7,12,24,.86)'; ctx.strokeStyle = Lb.warn ? 'rgba(255,138,122,.8)' : 'rgba(143,208,255,.55)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.rect(bx, by, bw, 20); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(q[0], by + 20); ctx.lineTo(q[0], q[1] - 3); ctx.stroke();
        ctx.fillStyle = Lb.warn ? '#ffb4a8' : '#cfe6fb'; ctx.fillText(Lb.text, bx + 8, by + 10.5);
        ctx.beginPath(); ctx.arc(q[0], q[1], 2.2, 0, 6.2832); ctx.fill();
      }
      ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
    }
    bar.style.transform = `scaleX(${p})`;
    let active = -1;
    STEPS.forEach((s, i) => { const done = p >= s.t[1]; const on = p >= s.t[0] - 0.035 && !done; if (on && active < 0) active = i; s.el.classList.toggle('done', done); s.el.classList.toggle('active', on); });
    if (active < 0 && p < STEPS[0].t[0]) { active = 0; STEPS[0].el.classList.add('active'); }
    buildEl.classList.toggle('idle', active < 0);
    card.classList.toggle('booting', p >= BT.show[0]);
    const st = STEPS[active], P = st && st.tag && parts[st.part || st.key];
    if (P) {
      const q = proj(V.add(P.pos, [0, 0.35, 0]));
      tagEl.textContent = st.tag; tagEl.style.transform = `translate(${q[0] - 14}px, ${q[1] - 40}px)`;
      // On narrow cards the label must not land on top of the title block.
      const clear = W > 860 ? q[1] > 40 : q[1] - 40 > headBottom + 6;
      tagEl.style.opacity = (q[0] > 0 && q[0] < W - 60 && clear) ? 1 : 0;
    } else tagEl.style.opacity = 0;
    const mob = NARROW.matches, LINES = mob ? MOB.lines : BT.lines;
    const bs = mob ? seg(p, 0.004, 0.04) : seg(p, BT.show[0], BT.show[1]);
    boot.style.opacity = bs; boot.style.transform = `translateY(${lerp(12, 0, bs)}px)`;
    pbar.style.transform = `scaleX(${mob ? seg(p, 0.01, MOB.endT) : seg(p, BT.bar[0], BT.bar[1])})`;
    let n = 0; while (n < LINES.length && p >= LINES[n][0]) n++;
    if (n !== shownLines) {
      // new lines are added, not redrawn: only they animate in (CSS .fresh)
      if (n > shownLines && shownLines >= 0 && bootList.children.length === shownLines) for (let i = shownLines; i < n; i++) bootList.insertAdjacentHTML('beforeend', bootLi(LINES[i], true));
      else bootList.innerHTML = LINES.slice(0, n).map(l => bootLi(l, false)).join('');
      shownLines = n;
    }
    let state = mob && p < BT.show[0] ? MOB.first : BT.states[0];
    if (!(mob && p < BT.show[0])) for (const s of BT.states) if (p >= s[0]) state = s;
    if (state !== lastState) {
      lastState = state;
      bootText.textContent = state[1]; bootText.className = 'bootText' + (state[3] ? ' ' + state[3] : '');
      bootState.textContent = state[2]; bootState.className = 'bootState' + (state[3] === 'warn' ? ' warn' : '');
    }
  }
  // Playback (галерея, 10.10.2026): the build runs by itself in def.dur seconds while the card is the open slide
  // and at least half on screen. Pauses when either stops being true, resumes where it was.
  const DUR = (def.dur || 10) * 1000;
  let active = false, playing = false, tPrev = 0;
  function step(now) {
    if (!playing) return false;
    const dt = tPrev ? Math.min(64, now - tPrev) : 0; tPrev = now;
    cur = Math.min(1, cur + dt / DUR);
    if (Math.abs(cur - last) > 1e-4 || (cur >= 1 && last < 1)) { frame(cur); last = cur; }
    if (cur >= 1) { playing = false; card.classList.add('built'); card.dispatchEvent(new Event('built', { bubbles: true })); return false; }
  }
  function update() {
    const go = active && visible && !REDUCE && cur < 1 && !document.hidden;
    if (go === playing) return;
    playing = go; tPrev = 0;
    if (go) ticker.add(step); else ticker.remove(step);
  }
  function seek(p) { cur = clamp(p); card.classList.toggle('built', cur >= 1); frame(cur); last = cur; update(); }
  function redraw() { headBottom = side.offsetTop + head.offsetTop + head.offsetHeight; last = -1; frame(REDUCE ? 1 : cur); last = cur; }

  new ResizeObserver(resize).observe(cv);
  new IntersectionObserver(es => { visible = es[es.length - 1].intersectionRatio >= 0.45; update(); }, { threshold: [0, 0.45, 0.6] }).observe(card);
  document.addEventListener('visibilitychange', update);
  // A click on a step jumps the build to it.
  if (!REDUCE) STEPS.forEach(st => st.el.addEventListener('click', () => { if (active) seek(Math.max(0, st.t[0] - 0.03)); }));
  return { redraw, seek, setActive(on) { active = on; update(); }, get done() { return cur >= 1; } };
}

/* ============ 3b. Galleries: configurations and turnkey objects ============ */
/* Slides side by side, the next one peeks in from the right. Tabs (built from data-tab, data-short on phones),
   arrows, swipe and the keyboard switch them; «Заново» replays the open build. When a build is done, the arrow
   to the next slide pulses. Off-screen slides are inert. An anchor with data-slide (#video) opens its slide. */
const ARROW = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
function gallery(root) {
  const view = root.querySelector('.gal-view'), track = root.querySelector('.gal-track');
  const cards = [...track.children];
  const scenes = cards.map(c => serverScene(c, SCENES[c.dataset.scene]));
  const name = root.getAttribute('aria-label');
  if (SCREENS_ON) {
    // Screens (Антон, 11.10.2026: «свайпать вправо… неудобно»): the cards stand one under another, a screen each, and every
    // build plays when its card is on screen. Instead of tabs the section intro lists the cards; a tap scrolls to the card.
    const intro = root.closest('.sec').querySelector('.sec-intro');
    const to = c => c.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (intro) {
      const toc = document.createElement('ol'); toc.className = 'sec-toc'; toc.setAttribute('aria-label', name);
      cards.forEach((c, i) => { const li = document.createElement('li'), b = document.createElement('button'); b.type = 'button'; b.innerHTML = `<span>${String(i + 1).padStart(2, '0')}</span>${c.dataset.tab}`; b.addEventListener('click', () => to(c)); li.appendChild(b); toc.appendChild(li); });
      intro.appendChild(toc);
    }
    cards.forEach((c, j) => { c.inert = false; c.classList.add('cur'); scenes[j].setActive(true); });
    document.querySelectorAll('.anchor[data-slide]').forEach(an => { const c = cards.find(k => k.id === an.dataset.slide); if (c) c.before(an); }); // #video lands right on its card
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { TX.redraw(); scenes.forEach(s => s.redraw()); });
    return { show: j => cards[j] && to(cards[j]), has: id => cards.findIndex(c => c.id === id) };
  }
  root.setAttribute('role', 'region'); root.setAttribute('aria-roledescription', 'галерея');

  const bar = document.createElement('div'); bar.className = 'gal-bar';
  const tabsEl = document.createElement('div'); tabsEl.className = 'gal-tabs'; tabsEl.setAttribute('role', 'tablist'); tabsEl.setAttribute('aria-label', name);
  const tabs = cards.map((c, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'gal-tab'; b.id = c.id + '-tab';
    b.setAttribute('role', 'tab'); b.setAttribute('aria-controls', c.id);
    b.innerHTML = `<span class="full">${c.dataset.tab}</span><span class="short" aria-hidden="true">${c.dataset.short}</span>`;
    b.addEventListener('click', () => show(i));
    c.setAttribute('role', 'tabpanel');
    tabsEl.appendChild(b); return b;
  });
  const mk = (cls, label, html) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.setAttribute('aria-label', label); b.innerHTML = html; return b; };
  const replay = mk('gal-replay', 'Собрать заново', '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 8A5.5 5.5 0 1 1 11.9 4.1" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M12.6 1.6v3.2H9.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Заново</span>');
  const prev = mk('gal-arrow gal-prev', 'Предыдущая', ARROW), next = mk('gal-arrow gal-next', 'Следующая', ARROW);
  const ctl = document.createElement('div'); ctl.className = 'gal-ctl'; ctl.append(replay, prev, next);
  bar.append(tabsEl, ctl);
  root.insertBefore(bar, view);
  // Phones: arrows sit on the card edges instead of the bar
  const sPrev = mk('gal-side gal-prev', 'Предыдущая', ARROW), sNext = mk('gal-side gal-next', 'Следующая', ARROW);
  view.append(sPrev, sNext);

  let idx = -1, offset = 0;
  function place(dx) {
    const w = cards[0].offsetWidth + parseFloat(getComputedStyle(track).columnGap || 0);
    const max = Math.max(0, track.scrollWidth - view.clientWidth);
    offset = Math.min(idx * w, max);
    track.style.transform = `translateX(${-offset + (dx || 0)}px)`;
  }
  function show(i, focusTab) {
    i = clamp(i, 0, cards.length - 1);
    if (i === idx) return;
    idx = i;
    cards.forEach((c, j) => {
      const on = j === i;
      c.inert = !on; c.classList.toggle('cur', on);
      tabs[j].setAttribute('aria-selected', on ? 'true' : 'false'); tabs[j].tabIndex = on ? 0 : -1;
      scenes[j].setActive(on);
    });
    for (const b of [prev, sPrev]) b.disabled = i === 0;
    for (const b of [next, sNext]) b.disabled = i === cards.length - 1;
    nudge();
    if (focusTab) tabs[i].focus();
    place();
  }
  const nudge = () => { const on = scenes[idx].done && idx < cards.length - 1; next.classList.toggle('nudge', on); sNext.classList.toggle('nudge', on); };
  root.addEventListener('built', nudge);
  for (const b of [prev, sPrev]) b.addEventListener('click', () => show(idx - 1));
  for (const b of [next, sNext]) b.addEventListener('click', () => show(idx + 1));
  replay.addEventListener('click', () => { scenes[idx].seek(0); nudge(); });
  tabsEl.addEventListener('keydown', e => {
    const k = { ArrowRight: idx + 1, ArrowLeft: idx - 1, Home: 0, End: cards.length - 1 }[e.key];
    if (k === undefined) return;
    e.preventDefault(); show(k, true);
  });
  // A click on the peeking neighbour opens it (inert cards get no events, so find it by position).
  track.addEventListener('click', e => {
    const j = cards.findIndex(c => { const r = c.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right; });
    if (j >= 0 && j !== idx) show(j);
  });
  // Swipe: the track follows the finger, a long enough move switches the slide. Vertical moves stay page scroll (touch-action: pan-y).
  let sx = 0, sy = 0, drag = 0, pid = null;
  view.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') return; pid = e.pointerId; sx = e.clientX; sy = e.clientY; drag = 0; });
  view.addEventListener('pointermove', e => {
    if (e.pointerId !== pid) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (!drag && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) { drag = 1; track.classList.add('drag'); }
    if (drag) { const edge = (idx === 0 && dx > 0) || (idx === cards.length - 1 && dx < 0); place(edge ? dx * 0.3 : dx); }
  });
  const end = e => {
    if (e.pointerId !== pid) return;
    pid = null;
    if (!drag) return;
    track.classList.remove('drag');
    const dx = e.clientX - sx;
    if (e.type === 'pointerup' && Math.abs(dx) > Math.min(90, view.clientWidth * 0.18)) show(idx + (dx < 0 ? 1 : -1)); else place();
  };
  view.addEventListener('pointerup', end); view.addEventListener('pointercancel', end);
  // Anchors and focus must never scroll the clipped viewport sideways.
  view.addEventListener('scroll', () => { view.scrollLeft = 0; });
  new ResizeObserver(() => place()).observe(view);
  show(0);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { TX.redraw(); scenes.forEach(s => s.redraw()); });
  return { show, has: id => cards.findIndex(c => c.id === id) };
}

(function () {
  const gals = [...document.querySelectorAll('.gal')].map(gallery);
  // #video and other anchors with data-slide: scroll as usual, then open the slide
  function fromHash() {
    const a = location.hash && document.getElementById(location.hash.slice(1));
    const id = a && a.dataset.slide; if (!id) return;
    for (const g of gals) { const j = g.has(id); if (j >= 0) g.show(j); }
  }
  addEventListener('hashchange', fromHash);
  document.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', () => { if (a.getAttribute('href') === location.hash) fromHash(); }));
  fromHash();
})();

/* ============ 5. Projects: a deck of pictures ============ */
/* The next picture slides in from the right over the current one, which sinks back. Flips by itself every
   AUTO ms while at least half on screen and not hovered; the first click, swipe or key makes it manual. */
(function () {
  const root = document.getElementById('deck');
  if (!root) return;
  const AUTO = 6000;
  const stage = root.querySelector('.deck-stage'), cards = [...stage.children];
  root.setAttribute('role', 'region'); root.setAttribute('aria-roledescription', 'галерея');
  const mk = (cls, label, html) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.setAttribute('aria-label', label); b.innerHTML = html; return b; };
  const prev = mk('gal-arrow gal-prev', 'Предыдущий проект', ARROW), next = mk('gal-arrow gal-next', 'Следующий проект', ARROW);
  const dotsEl = document.createElement('div'); dotsEl.className = 'deck-dots';
  const dots = cards.map((c, i) => { const b = mk('deck-dot', `Проект ${i + 1} из ${cards.length}`, '<i></i>'); b.addEventListener('click', () => go(i, true)); dotsEl.appendChild(b); return b; });
  const bar = document.createElement('div'); bar.className = 'deck-bar'; bar.append(prev, dotsEl, next);
  const live = document.createElement('p'); live.className = 'sr-only'; live.setAttribute('aria-live', 'polite');
  root.append(bar, live);

  let idx = 0, elapsed = 0, tPrev = 0, visible = false, hover = false, manual = REDUCE;
  if (manual) root.classList.add('manual');
  const running = () => visible && !hover && !manual && !document.hidden;
  function go(i, user) {
    if (user && !manual) { manual = true; root.classList.add('manual'); }
    idx = (i + cards.length) % cards.length;
    cards.forEach((c, j) => {
      c.style.zIndex = j; c.inert = j !== idx;
      c.classList.toggle('cur', j === idx); c.classList.toggle('under', j === idx - 1); c.classList.toggle('gone', j < idx - 1);
    });
    dots.forEach((d, j) => { d.setAttribute('aria-current', j === idx ? 'true' : 'false'); d.style.setProperty('--p', 0); });
    if (user) live.textContent = `${idx + 1} из ${cards.length}: ${cards[idx].querySelector('b').textContent}`;
    elapsed = 0; kick();
  }
  function tick(now) {
    if (!running()) { tPrev = 0; return false; }
    const dt = tPrev ? Math.min(64, now - tPrev) : 0; tPrev = now;
    elapsed += dt;
    dots[idx].style.setProperty('--p', Math.min(1, elapsed / AUTO).toFixed(3));
    if (elapsed >= AUTO) go(idx + 1);
  }
  const kick = () => { if (running()) ticker.add(tick); };
  prev.addEventListener('click', () => go(idx - 1, true));
  next.addEventListener('click', () => go(idx + 1, true));
  root.addEventListener('keydown', e => { const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (d && !e.target.closest('input, textarea')) { e.preventDefault(); go(idx + d, true); } });
  root.addEventListener('mouseenter', () => { hover = true; });
  root.addEventListener('mouseleave', () => { hover = false; kick(); });
  let sx = 0, sy = 0, pid = null;
  stage.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') { pid = e.pointerId; sx = e.clientX; sy = e.clientY; } });
  stage.addEventListener('pointerup', e => {
    if (e.pointerId !== pid) return; pid = null;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(idx + (dx < 0 ? 1 : -1), true);
  });
  stage.addEventListener('pointercancel', () => { pid = null; });
  // Pictures off to the right are lazy and would arrive empty: load the whole deck once it comes near.
  new IntersectionObserver((es, io) => { if (es.some(e => e.isIntersecting)) { stage.querySelectorAll('img').forEach(i => { i.loading = 'eager'; }); io.disconnect(); } }, { rootMargin: '400px 0px' }).observe(stage);
  new IntersectionObserver(es => { visible = es[es.length - 1].intersectionRatio >= 0.5; kick(); }, { threshold: [0, 0.5] }).observe(stage);
  document.addEventListener('visibilitychange', kick);
  go(0);
})();

/* ============ 6. Values: reveal once in view ============ */
(function () {
  const v = document.getElementById('vals');
  if (!v) return;
  new IntersectionObserver((es, io) => es.forEach(e => {
    if (!e.isIntersecting) return;
    v.classList.add('in'); io.disconnect();
    setTimeout(() => v.classList.add('settled'), 2200); // drop the stagger so hover reacts at once
  }), { threshold: .3 }).observe(v);
})();

/* ============ Submission ============ */
// Отправка на обработчик api/send.php (PHP на хостинге). Он ещё раз проверяет поля и шлёт письмо с ящика site@sarmat-it.ru.
const SEND_URL = 'api/send.php';
const FILE_MAX = 10 * 1024 * 1024;
const FILE_EXT = /\.(doc|docx|xls|xlsx|pdf)$/i;
const FILE_TYPE_BAD = 'Такой файл не подойдёт. Нужен Word (.doc, .docx), Excel (.xls, .xlsx) или PDF.';
const FILE_SIZE_BAD = 'Файл больше 10 МБ. Сожмите его или пришлите на sarmat-it@ya.ru.';
function send(kind, form) {
  const fd = new FormData(form);
  fd.set('kind', kind);
  fd.set('page', location.href);
  return fetch(SEND_URL, { method: 'POST', body: fd, headers: { 'Accept': 'application/json' } })
    .then(r => r.json().catch(() => ({})).then(j => { if (!r.ok || !j.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j; }));
}
// Проверка файла до отправки: тип по расширению и размер. Возвращает текст ошибки или пустую строку.
function fileProblem(input) {
  const f = input.files && input.files[0];
  if (!f) return '';
  if (!FILE_EXT.test(f.name)) return FILE_TYPE_BAD;
  if (f.size > FILE_MAX) return FILE_SIZE_BAD;
  return '';
}
// Телефон и почта: те же правила в api/send.php. Возвращают текст ошибки или пустую строку.
// Телефон: цифры, пробелы, скобки, дефисы, точки, плюс только первым. С +7 ровно 11 цифр,
// с другим кодом страны 10-15 цифр, без плюса 10 цифр или 11, если первая 7 или 8.
// Пример склеен неразрывными пробелами и дефисами, чтобы не переносился по частям.
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
  if (!v) return 'Укажите e-mail.';
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
  const inGal = new Set();
  const galIO = new IntersectionObserver(es => { es.forEach(e => e.isIntersecting ? inGal.add(e.target) : inGal.delete(e.target)); a.classList.toggle('in-gal', inGal.size > 0); }, { rootMargin: '-20% 0px -20% 0px' });
  document.querySelectorAll('.gal-view, .deck').forEach(g => galIO.observe(g)); // phones: the button would cover the arrows
  bubble.addEventListener('click', open);
  fab.addEventListener('click', () => panel.hidden ? open() : close());
  document.getElementById('asstClose').addEventListener('click', close);
  panel.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
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

/* ============ 5. Request form ============ */
(function () {
  const f = document.getElementById('reqForm'), ok = document.getElementById('msgOk'), err = document.getElementById('msgErr');
  const phone = document.getElementById('f-phone'), phoneErr = document.getElementById('f-phone-err');
  const email = document.getElementById('f-email'), emailErr = document.getElementById('f-email-err');
  const btn = f.querySelector('button[type="submit"]');
  liveCheck(phone, phoneErr, phoneProblem);
  liveCheck(email, emailErr, emailProblem);
  const file = document.getElementById('f-file'), fileErr = document.getElementById('f-file-err');
  const consent = document.getElementById('f-consent'), consentErr = document.getElementById('f-consent-err'), consentWrap = consent.closest('.field-check');
  const showFile = msg => { fileErr.textContent = msg; fileErr.hidden = !msg; file.setAttribute('aria-invalid', msg ? 'true' : 'false'); };
  const showConsent = bad => { consentErr.hidden = !bad; if (bad) consentWrap.setAttribute('data-invalid', 'true'); else consentWrap.removeAttribute('data-invalid'); };
  file.addEventListener('change', () => { const m = fileProblem(file); showFile(m); if (m) file.value = ''; });
  consent.addEventListener('change', () => { if (consent.checked) showConsent(false); });
  f.addEventListener('submit', e => {
    e.preventDefault();
    ok.hidden = true; err.hidden = true;
    // Все ошибки сразу, фокус на первую.
    const fm = fileProblem(file);
    const bad = [
      fieldMsg(phone, phoneErr, phoneProblem(phone.value)) && phone,
      fieldMsg(email, emailErr, emailProblem(email.value)) && email,
      (showFile(fm), fm && file),
      (showConsent(!consent.checked), !consent.checked && consent),
    ].filter(Boolean);
    if (bad.length) { bad[0].focus(); return; }
    btn.disabled = true;
    send('lead', f)
      .then(() => { f.reset(); showConsent(false); showFile(''); ok.hidden = false; ok.focus(); })
      .catch(e => {
        // Сервер проверяет те же поля; его отказ показываем у поля, остальное общим сообщением.
        const m = e.message;
        if (m === 'phone') { fieldMsg(phone, phoneErr, PHONE_BAD); phone.focus(); }
        else if (m === 'email') { fieldMsg(email, emailErr, EMAIL_BAD); email.focus(); }
        else if (m === 'file_type' || m === 'file_size') { showFile(m === 'file_size' ? FILE_SIZE_BAD : FILE_TYPE_BAD); file.focus(); }
        else if (m === 'consent') { showConsent(true); consent.focus(); }
        else err.hidden = false;
      })
      .finally(() => { btn.disabled = false; });
  });
})();

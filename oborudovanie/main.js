'use strict';

/* ============ shared helpers ============ */
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (p, a, b) => clamp((p - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;
const eIO = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const eOut = t => 1 - Math.pow(1 - t, 3);
const eBack = t => { const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const bell = (v, a, b, c) => v <= b ? smooth(a, b, v) : 1 - smooth(b, c, v);

/* Descent progress (0 before, 1 after landing). The hero writes it, the starfield reads it. */
const heroState = { d: 0 };

/* Превью на GitHub Pages: PHP там нет, письмо не уйдёт. Пишем это прямо в сообщении об ошибке,
   чтобы при показе превью было понятно, что отправка проверяется на рабочем сайте. */
const PREVIEW = /\.github\.io$/.test(location.hostname);
const PREVIEW_MSG = 'Это превью сайта: заявка отсюда не отправляется. На рабочем сайте письмо уходит в Сармат-ИТ.';
if (PREVIEW) addEventListener('DOMContentLoaded', () => {
  ['msgErr', 'p-err', 'asstErr'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = PREVIEW_MSG; });
});

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
  }).observe(document.getElementById('hero'));
  return { get on() { return on; }, sub(f) { subs.push(f); } };
})();

/* ============ Starfield (canvas 2D, parallax) ============ */
(function () {
  const cv = document.getElementById('sky'), g = cv.getContext('2d');
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


/* 1. Hero: первый экран со сборкой логотипа, спутниками-меню и спуском к Земле снят 24.11.2026 (hub-2026-11), новый в ../pagehero.js */

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
      return R.map((pts, i) => ({ pts, t: seg(p, 0.38 + i * 0.02, 0.44 + i * 0.02), rgb: '143,208,255', a: 0.7 + 0.25 * on, w: 1.5 }));
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
    const bs = seg(p, BT.show[0], BT.show[1]);
    boot.style.opacity = bs; boot.style.transform = `translateY(${lerp(12, 0, bs)}px)`;
    pbar.style.transform = `scaleX(${seg(p, BT.bar[0], BT.bar[1])})`;
    let n = 0; while (n < BT.lines.length && p >= BT.lines[n][0]) n++;
    if (n !== shownLines) { shownLines = n; bootList.innerHTML = BT.lines.slice(0, n).map(l => `<li${l[2] ? ` class="${l[2]}"` : ''}>${l[2] === 'warn' ? '!' : '✓'} ${l[1]}</li>`).join(''); }
    let state = BT.states[0]; for (const s of BT.states) if (p >= s[0]) state = s;
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
const FILE_SIZE_BAD = 'Файл больше 10 МБ. Сожмите его или пришлите на info@sarmat-it.ru.';
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
  if (!v) return ''; // почта необязательна, обязателен только телефон (24.11.2026)
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
/* ============ 3c. «Отправить на проработку»: окно у готовой сборки ============ */
/* Кнопка на карточке открывает окно: контакты и что поправить под задачу. Письмо уходит как обычная
   заявка (kind=lead), в нём название сборки и её состав со страницы, чтобы мы видели, о чём речь. */
(function () {
  const dlg = document.getElementById('pickModal');
  const picks = [...document.querySelectorAll('.js-pick')];
  if (!dlg || !picks.length) return;
  const form = document.getElementById('pickForm'), nameEl = document.getElementById('pickName');
  const pos = document.getElementById('p-pos'), sumField = document.getElementById('p-sum');
  const phone = document.getElementById('p-phone'), phoneErr = document.getElementById('p-phone-err');
  const email = document.getElementById('p-email'), emailErr = document.getElementById('p-email-err');
  const comment = document.getElementById('p-msg');
  const consent = document.getElementById('p-consent'), consentErr = document.getElementById('p-consent-err'), consentWrap = consent.closest('.field-check');
  const ok = document.getElementById('p-ok'), err = document.getElementById('p-err');
  const btn = form.querySelector('button[type="submit"]');
  liveCheck(phone, phoneErr, phoneProblem);
  liveCheck(email, emailErr, emailProblem);
  const showConsent = bad => { consentErr.hidden = !bad; if (bad) consentWrap.setAttribute('data-invalid', 'true'); else consentWrap.removeAttribute('data-invalid'); };
  consent.addEventListener('change', () => { if (consent.checked) showConsent(false); });

  // состав сборки берём со страницы: заголовок, описание и строки сборки
  function cardText(card, title) {
    const desc = card.querySelector('.card-desc');
    const steps = [...card.querySelectorAll('.steps .step')].map(li => {
      const b = li.querySelector('b'), v = li.querySelector('span');
      return b ? '- ' + b.textContent.trim() + (v ? ': ' + v.textContent.trim() : '') : '';
    }).filter(Boolean);
    return ['Интересует готовая сборка с сайта: ' + title,
      desc ? desc.textContent.trim() : '',
      steps.length ? 'Состав на странице:\n' + steps.join('\n') : ''].filter(Boolean).join('\n');
  }

  let body = null;
  const open = card => {
    const title = card.querySelector('.card-title');
    const name = title ? title.textContent.trim() : 'Готовая конфигурация';
    nameEl.textContent = name;
    pos.value = ('Готовая сборка: ' + name).slice(0, 200);
    sumField.dataset.card = cardText(card, name);
    ok.hidden = true; err.hidden = true;
    body = document.body.style.overflow; document.body.style.overflow = 'hidden';
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    setTimeout(() => document.getElementById('p-name').focus({ preventScroll: true }), 60);
  };
  const close = () => { document.body.style.overflow = body || ''; if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); };
  picks.forEach(b => b.addEventListener('click', () => {
    const card = b.closest('.gal-card, .sc, article');
    if (card) open(card);
  }));
  document.getElementById('pickClose').addEventListener('click', close);
  dlg.addEventListener('close', () => { document.body.style.overflow = body || ''; });
  dlg.addEventListener('click', e => { if (e.target === dlg) close(); }); // клик по тёмному фону

  form.addEventListener('submit', e => {
    e.preventDefault();
    ok.hidden = true; err.hidden = true;
    const bad = [
      fieldMsg(phone, phoneErr, phoneProblem(phone.value)) && phone,
      fieldMsg(email, emailErr, emailProblem(email.value)) && email,
      (showConsent(!consent.checked), !consent.checked && consent)
    ].filter(Boolean);
    if (bad.length) { bad[0].focus(); return; }
    const note = comment.value.trim();
    sumField.value = ((sumField.dataset.card || '') + (note ? '\n\nЧто поправить: ' + note : '')).slice(0, 4000);
    btn.disabled = true;
    send('lead', form)
      .then(() => { const c = sumField.dataset.card; form.reset(); sumField.dataset.card = c; showConsent(false); ok.hidden = false; ok.focus(); })
      .catch(e2 => {
        const m = e2.message;
        if (m === 'phone') { fieldMsg(phone, phoneErr, PHONE_BAD); phone.focus(); }
        else if (m === 'email') { fieldMsg(email, emailErr, EMAIL_BAD); email.focus(); }
        else if (m === 'consent') { showConsent(true); consent.focus(); }
        else err.hidden = false;
      })
      .finally(() => { btn.disabled = false; });
  });
})();

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

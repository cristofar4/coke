import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource-variable/inter-tight';
import '@fontsource/norican/400.css';
import './styles/main.css';

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';

import { createScene } from './gl/scene.js';
import { Surface } from './gl/surface.js';
import { Bubbles } from './gl/bubbles.js';
import { paintTitle, titleWaterline } from './gl/title.js';
import { FizzChapter } from './sections/fizz.js';
import { ShapeChapter } from './sections/shape.js';
import { CapChapter } from './sections/cap.js';
import { createTilt } from './lib/tilt.js';
import { sound } from './lib/sound.js';
import { prefersReducedMotion, isFinePointer, clamp, rand, damp } from './lib/math.js';

gsap.registerPlugin(ScrollTrigger, SplitText);

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const root = document.documentElement;
const reduced = prefersReducedMotion();
const fine = isFinePointer();
const small = matchMedia('(max-width: 860px)').matches;

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

/* ---------------- pointer ---------------- */
const pointer = { x: -1e4, y: -1e4, vx: 0, vy: 0, px: -1e4, py: -1e4, active: false };
window.addEventListener(
  'pointermove',
  (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.active = true;
  },
  { passive: true }
);
root.addEventListener('pointerleave', () => {
  pointer.active = false;
});

/* ---------------- boot ---------------- */
const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
withTimeout(
  Promise.all([
    document.fonts.load('400 100px "Instrument Serif"'),
    document.fonts.load('italic 400 100px "Instrument Serif"'),
    document.fonts.load('40px Norican'),
    document.fonts.load('400 16px "Inter Tight Variable"'),
  ]).catch(() => {}),
  2500
).then(boot);

function boot() {
  const W0 = window.innerWidth;
  const canvas = $('.drink__canvas');
  const drinkEl = $('.drink');
  const maxBubbles = small ? 2200 : 4200;
  const scene = createScene(canvas, { maxBubbles });
  root.classList.add(scene ? 'gl' : 'no-gl');

  const surface = new Surface();
  if (reduced) surface.calm = 0.35;
  const bubbles = new Bubbles(maxBubbles, reduced ? 70 : small ? 150 : Math.round(clamp(W0 / 5, 180, 320)));
  bubbles.onPop = (r) => sound.pop(r);

  const lenis = reduced ? null : new Lenis({ lerp: 0.085, smoothWheel: true });
  if (lenis) {
    lenis.on('scroll', ScrollTrigger.update);
    lenis.stop();
  }

  const titleEl = $('.hero__title');
  const footEl = $('.foot');
  const state = {
    t: 0,
    scroll: 0,
    surf: 0,
    restSurf: 0,
    level: reduced ? 0 : 1,
    titleA: reduced ? 1 : 0,
    pour: 0,
    pourX: 0,
    pourTop: 0,
    flash: 0,
    bottom: 1e6,
    glow: 1,
    dark: 0,
    torchX: -999,
    torchY: -999,
    surface,
  };
  let W = W0;
  let H = window.innerHeight;
  let dpr = 1;
  let quality = 1;

  const surfaceAt = (x) => state.surf - state.scroll - surface.height(x, state.t, W);

  /* ---- layout ---- */
  const layout = () => {
    W = window.innerWidth;
    H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, (fine ? 1.5 : 1.25) * quality);
    const sy = window.scrollY;
    state.restSurf = titleWaterline(titleEl, 0.6);
    state.bottom = footEl.getBoundingClientRect().top + sy - 34;
    if (scene) {
      scene.resize(W, H, dpr);
      const heroH = $('.hero').offsetHeight;
      scene.setTitle(paintTitle(titleEl, W, heroH, Math.min(2, window.devicePixelRatio || 1)), W, heroH);
    }
  };
  layout();
  state.pourX = W * 0.6;

  /* ---- chapters ---- */
  const shakeDrink = (p) => {
    if (reduced || p <= 0.001) {
      drinkEl.style.transform = '';
      return;
    }
    const j = p * p * 9;
    drinkEl.style.transform = `translate(${rand(-j, j).toFixed(1)}px, ${rand(-j, j).toFixed(1)}px)`;
  };
  const fizz = new FizzChapter($('.chapter--fizz'), {
    reduced,
    onPressure: (p) => {
      bubbles.pressure = reduced ? 0 : p;
      shakeDrink(p);
      sound.rumble(p);
    },
    onBurst: (p, rect) => {
      const n = Math.round((small ? 0.55 : 1) * (300 + 1500 * p));
      bubbles.burst(rect.left + rect.width / 2, rect.top + rect.height / 2, n * 0.35, 1.1 + p, { spread: Math.PI });
      for (let k = 0; k < 8; k++) bubbles.burst((W * (k + 0.5)) / 8, H + 10, n * 0.08, 1.3 + p, { spread: 0.35, jx: W / 16 });
      state.flash = 0.25 + 0.6 * p;
      sound.pssht();
    },
  });
  const shape = new ShapeChapter($('.chapter--shape'), {
    reduced,
    onFound: (x, y) => {
      bubbles.burst(x, y, small ? 90 : 180, 0.9, { spread: 1.2 });
      state.flash = 0.3;
      sound.fizz(0.9);
    },
  });
  const cap = new CapChapter($('.chapter--cap'), {
    reduced,
    onSeal: (x, y) => {
      bubbles.burst(x, y, small ? 140 : 260, 1.1, { spread: Math.PI });
      state.flash = 0.35;
      sound.pssht();
    },
  });

  /* ---- the pour ---- */
  let pouring = false;
  let pourAcc = 0;
  const pour = () => {
    if (reduced) {
      state.level = 0;
      state.titleA = 1;
      return gsap.timeline();
    }
    pouring = true;
    state.level = 1;
    state.pour = 0;
    state.pourTop = 0;
    state.pourX = W * (0.56 + Math.random() * 0.08);
    sound.pour(3);
    const tl = gsap.timeline();
    tl.to(state, { pour: 1, duration: 0.25, ease: 'power1.in' }, 0.1);
    tl.to(state, { level: 0, duration: 2.9, ease: 'power2.out' }, 0.3);
    tl.to(state, { titleA: 1, duration: 1.4, ease: 'power2.inOut' }, 0.9);
    tl.to(state, { pourTop: () => surfaceAt(state.pourX) + 12, duration: 0.55, ease: 'power2.in' }, 2.75);
    tl.call(() => {
      pouring = false;
      surface.kick(-24);
    }, null, 3.25);
    tl.set(state, { pour: 0 }, 3.3);
    return tl;
  };

  /* ---- tilt (phones) ---- */
  const tilt = createTilt(surface);
  const hint = $('[data-hint]');
  const hintText = $('.hint__text', hint);
  if (!fine && tilt.supported) {
    if (tilt.needsPermission) {
      hintText.textContent = 'Tap to tilt the drink';
      hint.dataset.action = 'tilt';
      hint.addEventListener('click', async () => {
        if (await tilt.enable()) {
          hintText.textContent = 'Tilt your phone';
          delete hint.dataset.action;
        }
      });
    } else {
      tilt.enable();
      hintText.textContent = 'Tilt your phone';
    }
  } else if (!fine) hintText.textContent = 'Touch the drink';

  /* ---- touching the drink ---- */
  let lastRel = 0;
  let rippleDist = 0;
  window.addEventListener('pointerdown', (e) => {
    if (e.target.closest('a, button, input, label, .shape__stage')) return;
    const sY = surfaceAt(e.clientX);
    const rel = e.clientY - sY;
    if (Math.abs(rel) < 90) surface.ripple(e.clientX, 12, state.t);
    if (rel > 0 && !reduced) bubbles.burst(e.clientX, e.clientY, small ? 14 : 26, 0.6, { spread: Math.PI });
    sound.fizz(0.3);
  });

  /* ---- reveals ---- */
  $$('[data-reveal]').forEach((el) => {
    if (reduced) return;
    const split = SplitText.create(el, { type: 'lines', mask: 'lines', linesClass: 'line' });
    gsap.from(split.lines, {
      yPercent: 110,
      filter: 'blur(8px)',
      duration: 1.3,
      ease: 'expo.out',
      stagger: 0.09,
      scrollTrigger: { trigger: el, start: 'top 86%', once: true },
    });
  });
  if (!reduced) {
    $$('.label, .shake-wrap, .capform, .shape__hint').forEach((el) =>
      gsap.from(el, { y: 30, opacity: 0, duration: 1.1, ease: 'expo.out', clearProps: 'opacity,transform', scrollTrigger: { trigger: el, start: 'top 88%', once: true } })
    );
  }

  /* ---- header + nav ---- */
  const header = $('.site-header');
  ScrollTrigger.create({ start: 60, end: 'max', onToggle: (s) => header.classList.toggle('is-scrolled', s.isActive) });
  const navLinks = $$('.site-nav a');
  ['fizz', 'shape', 'moment', 'find'].forEach((id) =>
    ScrollTrigger.create({
      trigger: `#${id}`,
      start: 'top 55%',
      end: 'bottom 55%',
      onToggle: (s) => navLinks.forEach((a) => a.classList.toggle('is-active', s.isActive && a.getAttribute('href') === `#${id}`)),
    })
  );

  /* ---- anchors, sound, pour again ---- */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href');
    const target = id.length > 1 && document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(target, { duration: 1.8 });
    else target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  });
  const toggles = $$('.sound-toggle');
  const setSound = (on) => {
    sound.set(on);
    toggles.forEach((t) => {
      t.setAttribute('aria-pressed', String(on));
      t.classList.toggle('is-on', on);
      t.querySelector('.sound-toggle__label').textContent = on ? 'Sound on' : 'Sound off';
    });
    if (on) sound.fizz(0.7);
  };
  toggles.forEach((t) => t.addEventListener('click', () => setSound(!sound.enabled)));
  $('[data-pour]').addEventListener('click', () => {
    const go = () => pour();
    if (lenis) lenis.scrollTo(0, { duration: 1.6, onComplete: go });
    else {
      window.scrollTo(0, 0);
      go();
    }
  });

  /* ---- gauge ---- */
  const gauge = $('.gauge');
  const marker = $('.gauge__marker');
  const gaugeVal = $('.gauge__val');

  /* ---- resize ---- */
  let rt;
  let lastW = W;
  let lastH = H;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      if (window.innerWidth === lastW && Math.abs(window.innerHeight - lastH) < 120) {
        // phone URL bar: keep the canvas filling the screen, nothing else moves
        H = window.innerHeight;
        if (scene) scene.resize(W, H, dpr);
        return;
      }
      lastW = window.innerWidth;
      lastH = window.innerHeight;
      layout();
      ScrollTrigger.refresh();
    }, 150);
  });
  ScrollTrigger.addEventListener('refresh', () => {
    state.bottom = footEl.getBoundingClientRect().top + window.scrollY - 34;
  });

  /* ---- the loop ---- */
  let lastScroll = window.scrollY;
  let slow = 0;
  const shapeEl = $('.chapter--shape');
  bubbles.seed({ W, H, surfaceAt, bottomY: state.bottom - state.scroll });

  gsap.ticker.add((time, deltaMs) => {
    const dt = Math.min(deltaMs / 1000, 1 / 20);
    state.t = time;
    if (lenis) lenis.raf(time * 1000);
    state.scroll = window.scrollY;
    const scrollDelta = state.scroll - lastScroll;
    lastScroll = state.scroll;

    // quality governor: if frames are consistently slow, render fewer pixels
    if (deltaMs < 250) slow = slow * 0.97 + (deltaMs > 30 ? 0.03 : 0);
    if (slow > 0.6 && quality > 0.67) {
      quality = 0.67;
      slow = 0;
      layout();
    }

    // the surface
    const vel = lenis ? lenis.velocity : scrollDelta;
    if (Math.abs(vel) > 0.5 && state.scroll < H * 1.2) surface.sloshV += clamp(vel, -50, 50) * 0.16;
    surface.update(dt);
    state.surf = state.restSurf + state.level * (H - state.restSurf + 120);
    state.glow = 1 - clamp(state.scroll / H);

    // pointer velocity, and the pointer breaking the surface
    if (pointer.active && pointer.px > -1e3) {
      const a = 1 - Math.exp(-dt * 25);
      pointer.vx += ((pointer.x - pointer.px) / Math.max(dt, 1 / 240) - pointer.vx) * a;
      pointer.vy += ((pointer.y - pointer.py) / Math.max(dt, 1 / 240) - pointer.vy) * a;
      const sY = surfaceAt(pointer.x);
      const rel = pointer.y - sY;
      if (rel * lastRel < 0 && Math.abs(pointer.vy) > 60) {
        surface.ripple(pointer.x, clamp(Math.abs(pointer.vy) * 0.012, 3, 14), state.t);
        if (rel > 0 && !reduced) bubbles.burst(pointer.x, sY + 4, 14, 0.45, { dir: Math.PI / 2, spread: 0.9 });
      }
      rippleDist += Math.hypot(pointer.x - pointer.px, pointer.y - pointer.py);
      if (Math.abs(rel) < 24 && rippleDist > 48) {
        rippleDist = 0;
        surface.ripple(pointer.x, clamp(Math.hypot(pointer.vx, pointer.vy) * 0.004, 1.5, 6), state.t);
      }
      lastRel = rel;
    } else {
      pointer.vx = pointer.vy = 0;
    }
    pointer.px = pointer.x;
    pointer.py = pointer.y;

    // the pour keeps hitting the surface
    if (pouring && state.pour > 0.5) {
      pourAcc += dt;
      if (pourAcc > 0.09) {
        pourAcc = 0;
        const sY = surfaceAt(state.pourX);
        surface.ripple(state.pourX + rand(-6, 6), 8, state.t);
        if (sY < H) bubbles.burst(state.pourX, sY + 6, small ? 4 : 7, 0.7, { dir: Math.PI / 2, spread: 0.6, jx: 6 });
      }
    }

    // 02 — shape: the page goes dark around a warm torch
    const sr = shapeEl.getBoundingClientRect();
    const vis = 1 - clamp(Math.abs(sr.top + sr.height / 2 - H / 2) / (sr.height * 0.62));
    shape.active = vis > 0;
    if (!fine && shape.active) shape.scrollTorch(clamp((H * 0.7 - sr.top) / (sr.height * 0.75)), W, H);
    else if (shape.active && pointer.active) shape.moveTo(pointer.x, pointer.y);
    const targetDark = vis * (shape.found ? 0.4 : 0.92);
    state.dark = damp(state.dark, targetDark, 4, dt);
    const useP = fine && pointer.active;
    state.torchX = damp(state.torchX, useP ? pointer.x : shape.screenTorch.x, 12, dt);
    state.torchY = damp(state.torchY, useP ? pointer.y : shape.screenTorch.y, 12, dt);

    fizz.update(dt);
    shape.update(time, dt);
    cap.update(time, dt, pointer);

    state.flash = damp(state.flash, 0, 3.5, dt);
    bubbles.update(dt, { W, H, scrollDelta, pointer, t: time, surfaceAt, bottomY: state.bottom - state.scroll });
    if (scene) scene.render(state, bubbles);

    // the measuring glass
    if (gauge.offsetParent !== null) {
      const max = Math.max(1, document.documentElement.scrollHeight - H);
      const p = clamp(state.scroll / max);
      marker.style.transform = `translateY(calc(${(p * gauge.offsetHeight).toFixed(1)}px - 50%))`;
      gaugeVal.textContent = String(Math.round(p * 330));
    }
  });
  gsap.ticker.lagSmoothing(0);

  /* ---- intro ---- */
  const heroBits = ['.site-header', '.hero__kicker', '.hero__below', '.hint', '.gauge'];
  if (reduced) {
    pour();
  } else {
    gsap.set(heroBits, { opacity: 0 });
    const tl = pour();
    tl.to('.site-header', { opacity: 1, duration: 1.2, ease: 'power2.out' }, 1.2);
    tl.fromTo('.hero__kicker', { opacity: 0, y: -12 }, { opacity: 1, y: 0, duration: 1.2, ease: 'expo.out' }, 1.6);
    tl.fromTo('.hero__below', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 1.4, ease: 'expo.out' }, 2.4);
    tl.to(['.hint', '.gauge'], { opacity: 1, duration: 1.2 }, 2.9);
    tl.call(() => lenis && lenis.start(), null, 2.6);
  }

  window.__fir = { state, surface, bubbles, scene, lenis, pour, shape, cap, fizz, sound };
}

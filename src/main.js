import '@fontsource/montserrat/300.css';
import '@fontsource/montserrat/400.css';
import '@fontsource/montserrat/500.css';
import '@fontsource/norican/400.css';
import '@fontsource/cormorant-garamond/500-italic.css';
import '@fontsource/cormorant-garamond/600-italic.css';
import './styles/main.css';

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';

import bottleUrl from './assets/bottle.webp';
import maskUrl from './assets/bottle-liquid-mask.png';
import peopleUrl from './assets/people.webp';
import canUrl from './assets/can.webp';

import { initPointer, updateField, onField, pointer } from './lib/field.js';
import { Fizz } from './lib/fizz.js';
import { sound } from './lib/sound.js';
import { prefersReducedMotion, clamp, rand } from './lib/math.js';
import { Hero } from './sections/hero.js';
import { Band, peopleBand, iconBand, createBand, Strand } from './sections/bands.js';
import { MomentMaker } from './sections/moment.js';
import { Menu, Loader } from './sections/menu.js';
import { initCursor } from './sections/cursor.js';

gsap.registerPlugin(ScrollTrigger, SplitText);

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = prefersReducedMotion();
const root = document.documentElement;
root.classList.toggle('reduced-motion', reduced);

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

/* ---------------- assets ---------------- */
let loaded = 0;
const TOTAL = 4;
const loader = new Loader($('.loader'), { reduced });
const tick = () => loader.setProgress(++loaded / TOTAL);
const loadImg = (url) =>
  new Promise((res) => {
    const i = new Image();
    i.decoding = 'async';
    i.onload = i.onerror = () => {
      tick();
      res(i);
    };
    i.src = url;
  });

// paint the preloader while we wait
let booted = false;
const preTick = (time) => loader.update(time);
gsap.ticker.add(preTick);

const fontsReady = Promise.all([
  document.fonts.load('300 40px Montserrat'),
  document.fonts.load('400 20px Montserrat'),
  document.fonts.load('40px Norican'),
  document.fonts.load('italic 600 30px "Cormorant Garamond"'),
])
  .catch(() => {})
  .then(() => document.fonts.ready)
  .then(tick);

const minTime = new Promise((r) => setTimeout(r, reduced ? 0 : 900));

Promise.all([loadImg(peopleUrl), loadImg(canUrl), loadImg(bottleUrl), fontsReady, minTime]).then(([people, can]) => boot(people, can));

/* ---------------- boot ---------------- */
function boot(peopleImg, canImg) {
  if (booted) return;
  booted = true;

  const lenis = reduced ? null : new Lenis({ lerp: 0.09, smoothWheel: true, wheelMultiplier: 0.95 });
  if (lenis) {
    lenis.stop();
    lenis.on('scroll', ScrollTrigger.update);
  }

  // bottle extras: liquid mask + glint mask
  const mask = `url(${maskUrl})`;
  const fizzCanvas = $('.bottle__fizz');
  fizzCanvas.style.webkitMaskImage = mask;
  fizzCanvas.style.maskImage = mask;
  const glint = $('.bottle__glint');
  glint.style.webkitMaskImage = `url(${bottleUrl})`;
  glint.style.maskImage = `url(${bottleUrl})`;

  initPointer();
  const fizz = new Fizz($('.fizz-layer'), { onPop: (r) => sound.pop(r) });
  const hero = new Hero($('.hero'), { fizz, reduced });
  const people = new Band($('.band--people'), peopleBand(peopleImg), { reduced });
  const iconCfg = iconBand(canImg);
  const icon = new Band($('.band--icon'), iconCfg, { reduced });
  const create = new Band($('.band--create'), createBand($('.create')), { reduced });
  const bands = [people, icon, create];
  const strand = new Strand($('.site-footer'), { reduced });
  const moment = new MomentMaker($('.band--create'), { fizz, reduced });
  const menu = new Menu($('#menu'), $('.menu-btn'), { lenis, reduced });
  const cursor = initCursor();

  // the people band is on screen at load: it unfurls as part of the intro
  people.gate = icon.gate = reduced ? 1 : 0;
  create.gate = 1;

  /* ---- "An icon, up close": scroll pushes the camera into the can ---- */
  let sprayed = false;
  iconCfg.beforeDraw = (b) => {
    const pr = b.progress;
    iconCfg.can.zoom = 1.02 + pr * 0.2;
    iconCfg.can.focusX = 0.5 + pr * 0.08;
    iconCfg.can.focusY = 0.48 - pr * 0.06;
  };
  iconCfg.can.after = (ctx, r, L) => {
    // a specular glint sweeping across the aluminium as you scroll
    const P = { x: 0, y: 0 };
    r.centre(L.u0, P);
    const xa = P.x;
    r.centre(L.u1, P);
    const xb = P.x;
    const pos = xa + (xb - xa) * (icon.progress * 1.6 - 0.3);
    const g = ctx.createLinearGradient(pos - 160, 0, pos + 160, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.38)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = g;
    ctx.fillRect(pos - 160, -50, 320, b_h());
    ctx.restore();
  };
  const b_h = () => icon.ch + 100;
  iconCfg.afterUpdate = (b) => {
    if (b.reveal > 0.93 && !sprayed && !reduced) {
      sprayed = true;
      // pssht — the can opens: spray from the opening
      const pt = b.ribbon.imagePoint(iconCfg.can, 0.58, 0.42, { x: 0, y: 0 });
      const c = b.clientPoint(pt.x, pt.y);
      fizz.burst(c.x, c.y, 70, 1.25, { spread: Math.PI * 0.45, dir: -Math.PI / 2 - 0.25 });
      sound.pssht();
      b.ribbon.sim.impulse(0.3, -220, 0.08);
    }
    if (b.reveal < 0.3) sprayed = false;
  };

  /* ---- reveal section copy with split text ---- */
  const revealCopy = (el) => {
    if (reduced || el.dataset.revealed) return;
    el.dataset.revealed = '1';
    const title = el.querySelector('.band__title, .create__title');
    const rest = [...el.querySelectorAll('.eyebrow, .link-arrow, .moods, .field, .create__actions, .card-stage')];
    if (title) {
      const split = SplitText.create(title, { type: 'lines,words', mask: 'lines' });
      gsap.from(split.words, { yPercent: 110, duration: 1.1, ease: 'expo.out', stagger: 0.045 });
    }
    gsap.from(rest, { y: 24, opacity: 0, duration: 0.9, ease: 'power3.out', stagger: 0.08, delay: 0.15 });
  };
  bands.forEach((b) => (b.onShow = revealCopy));

  /* ---- layout ---- */
  const layout = () => {
    hero.layout();
    bands.forEach((b) => b.layout());
    // tuck the people band under the bottle, as in the poster
    const g = people.g;
    const mt = hero.bandTop() - hero.H - (g.height - g.T) / 2 - g.T * 0.035;
    people.section.style.marginTop = `${mt.toFixed(1)}px`;
    strand.layout();
    fizz.resize();
    menu.resize();
    loader.resize();
    moment.layout();
  };
  layout();
  let rt;
  let lastW = window.innerWidth;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      // ignore mobile URL-bar height jitter
      if (window.innerWidth === lastW && Math.abs(window.innerHeight - (hero.vh || 0)) < 120 && hero.vh) return;
      lastW = window.innerWidth;
      hero.vh = window.innerHeight;
      layout();
      ScrollTrigger.refresh();
    }, 160);
  });
  hero.vh = window.innerHeight;

  /* ---- scroll-driven state ---- */
  bands.forEach((b) => {
    ScrollTrigger.create({
      trigger: b.section,
      start: 'top 96%',
      end: b === create ? 'top 40%' : 'top 34%',
      onUpdate: (s) => (b.scrollReveal = s.progress),
      onRefresh: (s) => (b.scrollReveal = s.progress),
    });
    ScrollTrigger.create({
      trigger: b.section,
      start: 'top bottom',
      end: 'bottom top',
      onUpdate: (s) => (b.progress = s.progress),
      onRefresh: (s) => (b.progress = s.progress),
    });
  });
  ScrollTrigger.create({
    trigger: '.site-footer',
    start: 'top 92%',
    once: true,
    onEnter: () => (reduced ? (strand.draw01 = 1) : gsap.to(strand, { draw01: 1, duration: 2.2, ease: 'power2.inOut' })),
  });

  /* ---- header state + active section ---- */
  const header = $('.site-header');
  const navRibbon = $('.primary-nav__ribbon');
  const navLinks = $$('.primary-nav a');
  let active = '';
  const setActive = (id) => {
    if (id === active) return;
    active = id;
    navLinks.forEach((a) => a.classList.toggle('is-active', a.dataset.nav === id));
    const a = navLinks.find((l) => l.dataset.nav === id);
    if (!a) return;
    gsap.to(navRibbon, { x: a.offsetLeft, width: a.offsetWidth, opacity: 1, duration: reduced ? 0 : 0.7, ease: 'expo.out' });
  };
  $$('[data-section]').forEach((sec) =>
    ScrollTrigger.create({
      trigger: sec,
      start: 'top 55%',
      end: 'bottom 55%',
      onToggle: (s) => s.isActive && setActive(sec.dataset.section),
    })
  );
  ScrollTrigger.create({
    start: 40,
    end: 'max',
    onToggle: (s) => header.classList.toggle('is-scrolled', s.isActive),
  });

  /* ---- anchors through Lenis ---- */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href');
    const target = id.length > 1 && document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    const offset = target.classList.contains('band') ? -40 : 0;
    if (lenis) lenis.scrollTo(target, { offset, duration: 1.6, force: true });
    else target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  });

  /* ---- fizz on clicks and plucks ---- */
  let lastPluck = 0;
  onField('pluck', (item, x, y, k) => {
    lastPluck = performance.now();
    if (!reduced) fizz.burst(x, y, (26 * k) | 0, 0.8 + k * 0.4);
    sound.pluck(k);
    sound.fizz(0.35 * k);
  });
  window.addEventListener('click', (e) => {
    if (performance.now() - lastPluck < 120 || reduced) return;
    if (e.target.closest('input, textarea, label, .menu')) return;
    fizz.burst(e.clientX, e.clientY, e.target.closest('a, button') ? 10 : 16, 0.6, { size: 0.8 });
    sound.fizz(0.25);
  });

  /* ---- sound toggle ---- */
  const toggles = $$('.sound-toggle');
  const setSound = (on) => {
    sound.set(on);
    toggles.forEach((st) => {
      st.setAttribute('aria-pressed', String(on));
      st.querySelector('.sound-toggle__label').textContent = on ? 'Sound on' : 'Sound off';
      st.classList.toggle('is-on', on);
    });
    if (on) sound.fizz(0.6);
  };
  toggles.forEach((st) => st.addEventListener('click', () => setSound(!sound.enabled)));

  /* ---- hero headline: letters that react like bubbles ---- */
  const title = $('.hero__title');
  const split = SplitText.create(title, { type: 'chars,words' });
  const chars = split.chars.map((el) => ({ el, x: 0, y: 0, lift: 0 }));
  const measureChars = () => {
    chars.forEach((c) => {
      const r = c.el.getBoundingClientRect();
      c.x = r.left + r.width / 2;
      c.y = r.top + r.height / 2 + window.scrollY;
    });
  };

  /* ---- quality governor: step down resolution on devices that struggle ---- */
  let slow = 0;
  let lowered = false;
  const govern = (deltaMs) => {
    if (lowered || !charsLive || document.hidden || deltaMs > 250) return;
    slow = slow * 0.98 + (deltaMs > 28 ? 1 : 0) * 0.02;
    if (slow > 0.6) {
      lowered = true;
      Band.maxDpr = 1;
      Hero.maxDpr = 1;
      layout();
    }
  };

  /* ---- main loop ---- */
  gsap.ticker.remove(preTick);
  let charsLive = false;
  gsap.ticker.add((time, deltaMs) => {
    govern(deltaMs);
    const dt = Math.min(deltaMs / 1000, 1 / 20);
    if (lenis) lenis.raf(time * 1000);
    const vel = lenis ? lenis.velocity : 0;
    updateField(dt, time, vel);
    loader.update(time);
    hero.update(time, dt);
    for (const b of bands) b.update(time, dt);
    strand.update(time, dt);
    moment.update(time, dt);
    menu.update(time);
    if (!reduced) {
      fizz.update(dt);
      fizz.draw();
    }
    cursor.update(dt);
    if (charsLive && pointer.active) {
      const sy = window.scrollY;
      for (const c of chars) {
        const dx = pointer.x - c.x;
        const dy = pointer.y - (c.y - sy);
        const d = Math.hypot(dx, dy);
        const target = d < 140 ? (1 - d / 140) ** 2 : 0;
        c.lift += (target - c.lift) * (1 - Math.exp(-dt * 10));
        c.el.style.translate = `0 ${(-c.lift * 14).toFixed(2)}px`;
        c.el.style.rotate = `${(c.lift * (dx > 0 ? -8 : 8)).toFixed(2)}deg`;
      }
    }
  });
  gsap.ticker.lagSmoothing(0);

  /* ---- intro ---- */
  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
  loader.exit(tl, 0);
  const at = reduced ? 0.2 : 0.75;
  if (reduced) {
    hero.carb.on = false;
    tl.call(() => lenis && lenis.start(), null, at);
  } else {
    tl.from('.site-header > *', { y: -30, opacity: 0, duration: 1, stagger: 0.08 }, at + 0.2);
    tl.from(split.chars, {
      yPercent: 120,
      opacity: 0,
      rotate: () => rand(-18, 18),
      filter: 'blur(6px)',
      duration: 1.1,
      ease: 'back.out(2.2)',
      stagger: { each: 0.028, from: 'random' },
      clearProps: 'filter',
    }, at + 0.25);
    tl.from('.hero__sub', { y: 18, opacity: 0, duration: 1 }, at + 0.75);
    tl.from('.hero .link-arrow', { y: 18, opacity: 0, duration: 1 }, at + 0.85);
    tl.from('.scroll-cue', { y: 18, opacity: 0, duration: 1 }, at + 1.0);
    hero.intro(tl, at, {
      onLand: (cap) => {
        fizz.burst(cap.x, cap.y, 54, 1.05, { spread: Math.PI * 0.35, lifeMul: 1.3 });
        sound.fizz(0.9);
      },
    });
    tl.to(people, { gate: 1, duration: 2.2, ease: 'power2.inOut' }, at + 0.9);
    tl.to(icon, { gate: 1, duration: 2, ease: 'power2.inOut' }, at + 1.5);
    tl.call(() => {
      lenis && lenis.start();
      measureChars();
      charsLive = true;
    }, null, at + 1.6);
    // a glint sweeps the bottle now and then
    const sweep = () => gsap.fromTo(glint, { '--glint': '130%' }, { '--glint': '-30%', duration: 1.6, ease: 'power2.inOut', onComplete: () => gsap.delayedCall(rand(4, 7), sweep) });
    tl.call(sweep, null, at + 1.2);
  }
  window.addEventListener('resize', () => charsLive && setTimeout(measureChars, 400));
  ScrollTrigger.addEventListener('refresh', () => charsLive && measureChars());

  // expose for debugging in the console
  window.__ftf = { hero, bands, strand, moment, menu, fizz, lenis, sound };
}

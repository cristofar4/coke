import gsap from 'gsap';
import { Ribbon } from '../lib/ribbon.js';
import { smooth, TAU } from '../lib/math.js';

/* A full-screen ribbon that unfurls diagonally across the viewport. */
function sweepRibbon() {
  return new Ribbon({ samples: 140, front: [222, 12, 28], back: [176, 4, 18], frontSpec: 0.3, sim: { k: 30 } });
}

function buildSweep(r, W, H, p, t, dir = 1) {
  const L = Math.hypot(W, H);
  const dx = W / L;
  const dy = -H / L;
  const cx = W / 2;
  const cy = H / 2;
  for (let i = 0; i < r.n; i++) {
    const s = (r.u[i] - 0.5) * L * 1.35;
    r.x0[i] = cx + dx * s;
    r.y0[i] = cy + dy * s;
  }
  const hw = ((W * H) / L) * 1.12 + 60;
  const w = 0.5;
  const q = p * (1 + w);
  r.build({
    disp: (u) => Math.sin(TAU * u * 1.2 - t * 0.8) * 30,
    width: () => hw,
    twist: (u) => {
      const uu = dir > 0 ? u : 1 - u;
      return (Math.PI / 2) * (1 - smooth((q - uu) / w));
    },
  });
}

export class Menu {
  constructor(el, button, { lenis, reduced }) {
    this.el = el;
    this.button = button;
    this.lenis = lenis;
    this.reduced = reduced;
    this.canvas = el.querySelector('.menu__canvas');
    this.ctx = this.canvas.getContext('2d');
    this.ribbon = sweepRibbon();
    this.state = { p: 0 };
    this.isOpen = false;
    this.items = [...el.querySelectorAll('[data-menu-item]')];
    button.addEventListener('click', () => (this.isOpen ? this.close() : this.open()));
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    });
    el.addEventListener('click', (e) => {
      if (e.target.closest('a')) this.close(true);
    });
  }

  resize() {
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.resize();
    this.el.hidden = false;
    document.documentElement.classList.add('menu-open');
    this.button.setAttribute('aria-expanded', 'true');
    this.button.querySelector('.menu-btn__label').textContent = 'Close';
    this.lenis && this.lenis.stop();
    gsap.killTweensOf([this.state, ...this.items]);
    if (this.reduced) {
      this.state.p = 1;
      gsap.set(this.items, { opacity: 1, y: 0 });
    } else {
      gsap.to(this.state, { p: 1, duration: 1.05, ease: 'power3.inOut' });
      gsap.fromTo(this.items, { yPercent: 110, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.9, stagger: 0.06, ease: 'expo.out', delay: 0.45 });
    }
    setTimeout(() => this.items[0] && this.items[0].querySelector('a, button')?.focus({ preventScroll: true }), 500);
  }

  close(fromLink = false) {
    if (!this.isOpen) return;
    this.isOpen = false;
    document.documentElement.classList.remove('menu-open');
    this.button.setAttribute('aria-expanded', 'false');
    this.button.querySelector('.menu-btn__label').textContent = 'Menu';
    this.lenis && this.lenis.start();
    gsap.killTweensOf([this.state, ...this.items]);
    const done = () => {
      if (!this.isOpen) this.el.hidden = true;
    };
    if (this.reduced) {
      this.state.p = 0;
      done();
      return;
    }
    gsap.to(this.items, { yPercent: -60, opacity: 0, duration: 0.35, stagger: 0.03, ease: 'power2.in' });
    gsap.to(this.state, { p: 0, duration: fromLink ? 0.8 : 0.9, ease: 'power3.inOut', delay: 0.15, onComplete: done });
    if (!fromLink) this.button.focus({ preventScroll: true });
  }

  update(t) {
    if (this.el.hidden) return;
    const { ctx, dpr, W, H } = this;
    buildSweep(this.ribbon, W, H, this.state.p, t, 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    this.ribbon.drawBase(ctx, 0, 1);
  }
}

/* Preloader: the screen is a red label that flips away into a single thread. */
export class Loader {
  constructor(el, { reduced }) {
    this.el = el;
    this.reduced = reduced;
    this.canvas = el.querySelector('.loader__canvas');
    this.ctx = this.canvas.getContext('2d');
    this.ribbon = sweepRibbon();
    this.state = { q: 0, lift: 0, fade: 1 };
    this.count = el.querySelector('[data-count]');
    this.done = false;
    this.resize();
  }

  resize() {
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
  }

  setProgress(p) {
    if (this.count) this.count.textContent = String(Math.round(p * 100)).padStart(2, '0');
  }

  update(t) {
    if (this.done) return;
    const { ctx, dpr, W, H, ribbon: r } = this;
    const L = W * 1.2;
    for (let i = 0; i < r.n; i++) {
      r.x0[i] = -W * 0.1 + r.u[i] * L;
      r.y0[i] = H / 2 - this.state.lift * H * 0.32 + Math.sin(r.u[i] * TAU * 0.8 + t) * 10 * this.state.q;
    }
    const w = 0.55;
    const q = this.state.q * (1 + w);
    r.build({
      width: () => H * 0.56 + 40,
      twist: (u) => (Math.PI / 2) * smooth((q - u) / w),
      disp: (u) => Math.sin(TAU * (u * 1.4) - t * 2) * 14 * this.state.q,
    });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = this.state.fade;
    r.drawBase(ctx, 0, 1);
    ctx.globalAlpha = 1;
  }

  exit(tl, at = 0) {
    const inner = this.el.querySelector('.loader__inner');
    if (this.reduced) {
      tl.to(this.el, { opacity: 0, duration: 0.4 }, at).call(() => this.finish());
      return;
    }
    tl.set(this.el, { background: 'transparent' }, at);
    tl.to(inner, { opacity: 0, y: -20, scale: 0.96, duration: 0.45, ease: 'power2.in' }, at);
    tl.to(this.state, { q: 1, duration: 1.25, ease: 'power3.inOut' }, at + 0.1);
    tl.to(this.state, { lift: 1, duration: 1.1, ease: 'power2.inOut' }, at + 0.35);
    tl.to(this.state, { fade: 0, duration: 0.35, ease: 'none' }, at + 1.15);
    tl.call(() => this.finish(), null, at + 1.55);
  }

  finish() {
    this.done = true;
    this.el.remove();
    document.body.classList.remove('is-loading');
  }
}

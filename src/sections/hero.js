import { Ribbon } from '../lib/ribbon.js';
import { Carbonation } from '../lib/fizz.js';
import { registerRibbon, pointer } from '../lib/field.js';
import { clamp, lerp, smooth, TAU, sampleSplineByLength, damp } from '../lib/math.js';

// Where things sit inside bottle.webp (normalised 0..1)
const LABEL = { x: 0.95, top: 0.49, bottom: 0.79 };
const CAP = { x: 0.72, y: 0.035 };
const ORIGIN = { x: 0.5, y: 0.62 };

/*
 * Hero: the bottle drops in, its carbonation comes alive, and a ribbon
 * unspools out of the label — twisting at its tip as it travels — to carry
 * the navigation across the page before curling over the edge.
 */
export class Hero {
  static maxDpr = 2;

  constructor(root, { fizz, reduced }) {
    this.root = root;
    this.canvas = root.querySelector('.hero__ribbon');
    this.ctx = this.canvas.getContext('2d');
    this.bottle = root.querySelector('.bottle');
    this.inner = root.querySelector('.bottle__inner');
    this.copy = root.querySelector('.hero__copy');
    this.cue = root.querySelector('.scroll-cue');
    // words sit at fractions of the ribbon's visible run (bottle → edge of the screen)
    this.words = [...root.querySelectorAll('.ribbon-nav a')].map((el) => ({ el, f: parseFloat(el.dataset.f), u: 0.5, shown: 0 }));
    this.dividerF = [0.5, 0.735];
    this.dividers = [0.4, 0.6];
    this.uEdge = 0.6;
    this.fizz = fizz;
    this.reduced = reduced;
    this.ribbon = new Ribbon({
      samples: 220,
      front: [226, 14, 30],
      back: [244, 239, 235],
      backSpec: 0.35,
      ambientBack: 0.8,
      sim: { pinStart: true, c2: 5400, k: 16, damp: 2.1, maxDisp: 160, tk: 22 },
      simNodes: 80,
    });
    this.carb = new Carbonation(root.querySelector('.bottle__fizz'));
    this.state = { dy: reduced ? 0 : -1, rot: reduced ? 0 : -16, unspool: reduced ? 1 : 0, float: reduced ? 0 : 1 };
    this.bt = { y: 0, rot: 0 };
    this.A = { x: 0, y: 0, a: 0 };
    this.P = { x: 0, y: 0 };
    this.C = {};
    this.mx = 0;
    this.my = 0;
    this.visible = true;
    this.pts = Array.from({ length: 10 }, () => [0, 0]);

    registerRibbon({
      ribbon: this.ribbon,
      el: this.canvas,
      active: () => this.visible && this.state.unspool > 0.55,
      gain: 1,
      maxPull: 130,
      name: 'hero',
    });
    new IntersectionObserver(([e]) => (this.visible = e.isIntersecting), { rootMargin: '100px' }).observe(root);

    this.words.forEach((w) => {
      w.el.addEventListener('pointerenter', () => {
        this.ribbon.sim.impulse(w.u, -140, 0.05);
        this.ribbon.sim.impulseTwist(w.u, 0.9, 0.06);
      });
    });
  }

  layout() {
    const W = (this.W = this.root.clientWidth);
    const H = (this.H = this.root.clientHeight);
    const dpr = (this.dpr = Math.min(Hero.maxDpr, window.devicePixelRatio || 1));
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.mobile = W < 760;
    this.bx = this.bottle.offsetLeft;
    this.by = this.bottle.offsetTop;
    this.bw = this.bottle.offsetWidth;
    this.bh = this.bottle.offsetHeight;
    this.carb.resize(this.bw, this.bh);
    this.h0 = (LABEL.bottom - LABEL.top) * this.bh * 0.5;
    this.root.style.setProperty('--ribbon-font', `${Math.max(14, this.h0 * 0.34).toFixed(1)}px`);
  }

  /** bottle bottom in page-section coordinates (used to tuck the next band under it) */
  bottleBottom() {
    return this.by + this.bh;
  }

  capClientPoint() {
    const r = this.inner.getBoundingClientRect();
    return { x: r.left + r.width * CAP.x, y: r.top + r.height * CAP.y };
  }

  anchor() {
    const ox = this.bx + this.bw * ORIGIN.x;
    const oy = this.by + this.bh * ORIGIN.y;
    const lx = this.bx + this.bw * LABEL.x;
    const ly = this.by + this.bh * (LABEL.top + LABEL.bottom) * 0.5;
    const a = (this.bt.rot * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const dx = lx - ox;
    const dy = ly - oy;
    this.A.x = ox + dx * c - dy * s;
    this.A.y = oy + dx * s + dy * c + this.bt.y;
    this.A.a = a;
    return this.A;
  }

  spine() {
    const A = this.anchor();
    const W = this.W;
    const H = this.H;
    const dx = Math.max(80, W - A.x);
    const rise = this.mobile ? this.bh * 0.3 : Math.min(A.y - H * 0.13, dx * 0.5);
    const p = this.pts;
    const set = (i, x, y) => {
      p[i][0] = x;
      p[i][1] = y;
    };
    const ca = Math.cos(this.A.a);
    const sa = Math.sin(this.A.a);
    // start tucked behind the label, leaving along the label's own direction
    set(0, A.x - this.bw * 0.16 * ca, A.y - this.bw * 0.16 * sa + this.bh * 0.012);
    set(1, A.x + dx * 0.03, A.y - rise * 0.015);
    set(2, A.x + dx * 0.26, A.y - rise * 0.25);
    set(3, A.x + dx * 0.53, A.y - rise * 0.57);
    set(4, A.x + dx * 0.8, A.y - rise * 0.86);
    set(5, W + dx * 0.07, A.y - rise * 1.04);
    set(6, W + dx * 0.15, A.y - rise * 0.9);
    set(7, W + dx * 0.07, A.y - rise * 0.72);
    set(8, W - dx * 0.07, A.y - rise * 0.68);
    set(9, W - dx * 0.22, A.y - rise * 0.74);
    const r = this.ribbon;
    sampleSplineByLength(p, r.x0, r.y0);
    // where does the ribbon leave the screen? everything is placed relative to that
    let e = r.n - 1;
    for (let i = 0; i < r.n; i++) {
      if (r.x0[i] >= W - 2) {
        e = i;
        break;
      }
    }
    this.uEdge = r.u[e];
    this.uStart = 0.06;
    const span = this.uEdge - this.uStart;
    for (const w of this.words) w.u = this.uStart + span * w.f;
    this.dividerF.forEach((f, k) => (this.dividers[k] = this.uStart + span * f));
  }

  update(t, dt) {
    if (!this.visible || !this.W) return;
    const s = this.state;
    const sc = Math.min(window.scrollY, this.H * 1.2);
    if (pointer.active) {
      this.mx = damp(this.mx, pointer.x / window.innerWidth - 0.5, 2.5, dt);
      this.my = damp(this.my, pointer.y / window.innerHeight - 0.5, 2.5, dt);
    }

    // bottle: drop-in, idle float, pointer parallax, scroll parallax
    this.bt.y = s.dy * this.H * 1.15 + Math.sin(t * 0.9) * 6 * s.float + this.my * 10 * s.float + sc * 0.16;
    this.bt.rot = s.rot + Math.sin(t * 0.66 + 1) * 0.8 * s.float + this.mx * 2.4 * s.float;
    this.inner.style.transform = `translate3d(0, ${this.bt.y.toFixed(2)}px, 0) rotate(${this.bt.rot.toFixed(3)}deg)`;

    // copy drifts away as you scroll
    if (this.copy) {
      const k = clamp(sc / (this.H * 0.6));
      this.copy.style.transform = `translate3d(0, ${(-sc * 0.12).toFixed(1)}px, 0)`;
      this.copy.style.opacity = (1 - k * 0.9).toFixed(3);
    }

    const r = this.ribbon;
    const h0 = this.h0;
    const unspool = s.unspool;
    r.sim.step(dt);
    this.spine();
    r.drawTo = unspool;
    const ue = this.uEdge;
    r.build({
      disp: (u) => Math.sin(TAU * (u * 1.25) - t * 1.2) * 7 * smooth(u / 0.3) + Math.sin(TAU * (u * 2.4) + t * 0.7) * 2.5 * smooth(u / 0.5),
      width: (u) => {
        const base = h0 * lerp(1, 0.6, smooth(u / (ue * 0.85)));
        return base * (1 + 0.12 * smooth((u - ue) / 0.12));
      },
      twist: (u) => {
        let th = 0.13 * Math.sin(TAU * (u * 1.15) - t * 1.05) * smooth(u / 0.35);
        // the ribbon rolls over the edge of the screen and comes back showing its paper-white back
        th += (Math.PI + 0.38 * Math.sin(t * 0.8)) * smooth((u - ue + 0.01) / 0.13) - 0.3 * smooth((u - ue - 0.16) / 0.12);
        if (unspool < 1) {
          const d = (unspool - u) / 0.2;
          th += (1 - smooth(d)) * 2.8; // the travelling tip corkscrews as it unspools
        }
        return th;
      },
    });
    this.draw();
    this.placeWords(dt);
    this.carb.update(dt);
    this.carb.draw();
  }

  draw() {
    const { ctx, dpr, ribbon: r } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    const end = this.state.unspool;
    if (end <= 0) return;
    const split = Math.min(0.97, this.uEdge + 0.04);
    if (end > split) r.drawBase(ctx, split - 0.01, end);
    r.drawBase(ctx, 0, Math.min(end, split));
    r.drawEdges(ctx, 0.03, Math.min(end, split - 0.04), 0.2);
    // hairline dividers between the words
    ctx.lineWidth = 1;
    for (const du of this.dividers) {
      const a = clamp((end - du - 0.02) / 0.06);
      if (a <= 0 || this.mobile) continue;
      r.point(du, 0.2, this.P);
      const x1 = this.P.x;
      const y1 = this.P.y;
      r.point(du, 0.8, this.P);
      ctx.strokeStyle = `rgba(255,255,255,${(0.55 * a).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(this.P.x, this.P.y);
      ctx.stroke();
    }
  }

  placeWords(dt) {
    if (this.mobile) return;
    const end = this.state.unspool;
    for (const w of this.words) {
      const target = end > w.u + 0.06 ? 1 : 0;
      w.shown = this.reduced ? target : damp(w.shown, target, 5, dt);
      const c = this.ribbon.centre(w.u, this.C);
      const ang = Math.atan2(c.ty, c.tx);
      const sy = Math.max(0.05, c.c);
      w.el.style.transform = `translate3d(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px, 0) rotate(${ang.toFixed(4)}rad) scale(1, ${sy.toFixed(3)}) translate(-50%, calc(-50% + ${((1 - w.shown) * 14).toFixed(1)}px))`;
      w.el.style.opacity = w.shown.toFixed(3);
      w.el.style.visibility = w.shown < 0.01 ? 'hidden' : 'visible';
    }
  }

  /** intro choreography, appended to the main timeline */
  intro(tl, at, { onLand }) {
    tl.to(this.state, { dy: 0, duration: 1.35, ease: 'elastic.out(0.55, 0.42)' }, at);
    tl.to(this.state, { rot: 0, duration: 1.6, ease: 'elastic.out(0.5, 0.35)' }, at);
    tl.call(() => {
      this.carb.on = true;
      onLand && onLand(this.capClientPoint());
    }, null, at + 0.42);
    tl.to(this.state, { unspool: 1, duration: 2.1, ease: 'power2.inOut' }, at + 0.55);
  }
}

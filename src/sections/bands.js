import { Ribbon, paperPattern } from '../lib/ribbon.js';
import { registerRibbon } from '../lib/field.js';
import { clamp, lerp, smooth, TAU, crScalar, sampleSplineByLength } from '../lib/math.js';

const RED = [224, 14, 30];
const RED_BACK = [196, 8, 24];
const PAPER = [251, 250, 248];
const CREAM = [248, 245, 240];

/*
 * Band: a wide ribbon that carries a section. It arrives as a single red
 * thread and unfurls — a twist travelling along its length — to reveal the
 * photograph printed on it. Scroll speed blows through it like wind, the
 * pointer brushes it, and you can grab it and pull.
 */
export class Band {
  static maxDpr = 1.5;

  constructor(section, cfg, { reduced }) {
    this.section = section;
    this.cfg = cfg;
    this.canvas = section.querySelector('.band__canvas');
    this.ctx = this.canvas.getContext('2d');
    this.reduced = reduced;
    this.ribbon = new Ribbon({
      samples: cfg.samples ?? 300,
      front: cfg.front ?? RED,
      back: cfg.back ?? RED_BACK,
      frontSpec: cfg.frontSpec,
      backSpec: cfg.backSpec,
      sim: { c2: 7800, k: 22, damp: 2.4, maxDisp: 150, ...(cfg.sim || {}) },
      simNodes: 84,
    });
    this.followers = [...section.querySelectorAll('[data-follow]')].map((el) => ({
      el,
      u: parseFloat(el.dataset.u ?? '0.5'),
      shown: false,
    }));
    this.reveal = reduced ? 1 : 0; // live (smoothed)
    this.scrollReveal = 0; // from ScrollTrigger
    this.gate = reduced ? 1 : 0; // intro gate for bands visible on load
    this.progress = 0;
    this.visible = false;
    this.C = {};
    this.P = { x: 0, y: 0 };
    this.onShow = null;
    new IntersectionObserver(([e]) => (this.visible = e.isIntersecting), { rootMargin: '25% 0px' }).observe(section);
    registerRibbon({
      ribbon: this.ribbon,
      el: this.canvas,
      active: () => this.visible && this.reveal > 0.35,
      gain: cfg.gain ?? 1,
      twistGain: cfg.twistGain ?? 1,
      maxPull: cfg.maxPull ?? 120,
      name: section.id,
    });
  }

  layout() {
    const W = (this.W = this.section.clientWidth);
    const mobile = (this.mobile = W < 760);
    const g = (this.g = this.cfg.geometry(W, mobile, this));
    this.dpr = Math.min(window.devicePixelRatio || 1, Band.maxDpr);
    this.section.style.setProperty('--band-h', `${g.height}px`);
    this.section.style.setProperty('--band-t', `${g.T}px`);
    this.section.style.setProperty('--band-top', `${(g.height - g.T) / 2}px`);
    this.ch = g.height + g.ext * 2;
    this.canvas.style.top = `${-g.ext}px`;
    this.canvas.style.height = `${this.ch}px`;
    this.canvas.width = Math.round(W * this.dpr);
    this.canvas.height = Math.round(this.ch * this.dpr);
    this.cy = g.ext + g.height / 2;
    // bends and ambient waves scale with the band, but never more than the screen can take
    this.unit = Math.min(g.T, W * 0.42);
    this.ribbon.restLength = g.x1 - g.x0;
    this.ribbon.restThickness = g.T;
    if (g.texture === true) g.layers.forEach((L) => L.texture === true && (L.texture = paperPattern(this.ctx)));
  }

  restY(u) {
    return this.cy + crScalar(this.g.spineY, u) * this.unit;
  }

  update(t, dt) {
    if (!this.visible || !this.g) return;
    const g = this.g;
    const r = this.ribbon;
    // ease toward the scroll-driven reveal so it feels like fabric, not a scrubber
    const target = Math.min(this.scrollReveal, this.gate);
    // when the band is only breathing, redraw every other frame (saves weak GPUs)
    this._acc = (this._acc || 0) + dt;
    const calm = Math.abs(target - this.reveal) < 0.002 && r.sim.energy < 30 && !r.sim.grab;
    this._skip = calm ? !this._skip : false;
    if (this._skip) return;
    dt = Math.min(this._acc, 1 / 15);
    this._acc = 0;
    this.reveal = this.reduced ? 1 : this.reveal + (target - this.reveal) * (1 - Math.exp(-dt * 7));
    const rev = this.reveal;
    const w = 0.42;
    const p = rev * (1 + w);
    const A = this.cfg.revealAngle ?? Math.PI / 2;
    const amb = this.reduced ? 0 : 1;
    const T = g.T;
    const U = this.unit;

    for (let i = 0; i < r.n; i++) {
      const u = r.u[i];
      r.x0[i] = lerp(g.x0, g.x1, u);
      r.y0[i] = this.restY(u);
    }
    r.sim.step(dt);
    r.build({
      disp: (u) => amb * (Math.sin(TAU * (u * 0.85) - t * 0.75) * U * 0.016 + Math.sin(TAU * (u * 2.1) + t * 1.2) * U * 0.005),
      width: (u) => (T / 2) * (g.width ? g.width(u) : 1),
      twist: (u) => {
        let th = amb * 0.06 * Math.sin(TAU * (u * 1.3) - t * 0.95);
        if (g.ends) th += g.ends(u, rev);
        th += A * (1 - smooth((p - u) / w));
        return th;
      },
    });
    if (this.cfg.beforeDraw) this.cfg.beforeDraw(this, t, dt);
    this.draw();
    this.follow(dt);
    if (this.cfg.afterUpdate) this.cfg.afterUpdate(this, t, dt);
  }

  draw() {
    const { ctx, dpr, ribbon: r, W, ch } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, ch);
    r.drawBaseFast(ctx, W, ch);
    for (const L of this.g.layers) {
      if (L.img) r.drawImageLayer(ctx, L, dpr, W, ch);
      else r.drawColorLayer(ctx, L, W, ch);
    }
    r.drawEdges(ctx, 0, 1, this.cfg.edgeAlpha ?? 0.2);
  }

  follow() {
    for (const f of this.followers) {
      const c = this.ribbon.centre(f.u, this.C);
      const dy = c.y - this.restY(f.u);
      const on = this.reveal > Math.min(0.92, f.u + 0.18);
      f.el.style.transform = `translate3d(0, ${dy.toFixed(1)}px, 0)`;
      if (on !== f.shown) {
        f.shown = on;
        f.el.classList.toggle('is-shown', on);
        if (on && this.onShow) this.onShow(f.el);
      }
    }
  }

  clientPoint(x, y) {
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + x, y: r.top + y };
  }
}

/* ------------------------------------------------------------------ */
/*  Band configurations                                                 */
/* ------------------------------------------------------------------ */

export function peopleBand(img) {
  return {
    front: RED,
    back: RED_BACK,
    geometry(W, mobile) {
      if (mobile) {
        const T = clamp(W * 1.32, 430, 640);
        const vb = 0.045;
        return {
          T,
          height: T * 1.02,
          ext: T * 0.32,
          x0: -0.03 * W,
          x1: 1.03 * W,
          spineY: [0.02, -0.01, -0.02, 0.0, 0.02],
          ends: (u) => 0.4 * (1 - smooth(u / 0.07)),
          layers: [
            {
              img,
              u0: 0.0,
              u1: 1.0,
              vMin: (u) => lerp(0.47, 0.4, u),
              vMax: () => 1 - vb,
              rect: [0.0, 1.0, 0.4, 1 - vb],
              focusX: 0.42,
              focusY: 0.35,
            },
          ],
        };
      }
      const T = clamp(W * 0.31, 330, 560);
      const vb = 0.07;
      return {
        T,
        height: T * 1.04,
        ext: T * 0.34,
        x0: -0.02 * W,
        x1: 1.02 * W,
        spineY: [0.02, -0.03, -0.035, -0.01, 0.025, 0.055, 0.07],
        width: (u) => 1 + 0.04 * Math.sin(u * 5.5),
        ends: (u) => 0.55 * (1 - smooth(u / 0.07)),
        layers: [
          {
            img,
            u0: 0.12,
            u1: 1.0,
            vMin: (u) => vb + 0.012 * Math.sin(u * 9),
            // the red swoosh sweeping under the photo on the left
            vMax: (u) => vb + (1 - 2 * vb) * Math.pow(smooth((u - 0.125) / 0.31), 0.8),
            rect: [0.155, 1.0, vb - 0.03, 1 - vb],
            focusY: 0.3,
          },
        ],
      };
    },
  };
}

export function iconBand(img) {
  const can = {
    img,
    zoom: 1,
    focusX: 0.5,
    focusY: 0.5,
  };
  return {
    front: RED,
    back: RED_BACK,
    can,
    geometry(W, mobile) {
      const vb = mobile ? 0.04 : 0.06;
      if (mobile) {
        const T = clamp(W * 1.42, 470, 660);
        Object.assign(can, { u0: 0, u1: 1, vMin: () => vb, vMax: () => 0.56, rect: [0, 1, vb, 0.56], fade: null });
        return {
          T,
          height: T * 1.0,
          ext: T * 0.32,
          x0: -0.03 * W,
          x1: 1.03 * W,
          spineY: [0.0, 0.015, 0.0, -0.015, 0.0],
          ends: (u) => 0.4 * smooth((u - 0.93) / 0.07),
          layers: [{ rgb: PAPER, u0: 0, u1: 1, vMin: () => 0.53, vMax: () => 1 - vb }, can],
        };
      }
      const T = clamp(W * 0.3, 320, 540);
      Object.assign(can, { u0: 0.0, u1: 0.62, vMin: () => vb, vMax: () => 1 - vb, rect: [0.0, 0.62, vb, 1 - vb], fade: [0.5, 0.62, PAPER] });
      return {
        T,
        height: T * 1.02,
        ext: T * 0.36,
        x0: -0.015 * W,
        x1: 1.012 * W,
        spineY: [0.03, -0.01, -0.03, -0.015, 0.02, 0.02, -0.04],
        width: (u) => 1 + 0.06 * smooth((u - 0.9) / 0.1),
        ends: (u) => -0.4 * (1 - smooth(u / 0.05)) + Math.PI * 0.68 * smooth((u - 0.925) / 0.075),
        layers: [{ rgb: PAPER, u0: 0.45, u1: 0.958, vMin: () => vb, vMax: () => 1 - vb }, can],
      };
    },
  };
}

export function createBand(content) {
  return {
    front: CREAM,
    back: [210, 14, 30],
    frontSpec: 0.12,
    backSpec: 0.36,
    gain: 0.45,
    twistGain: 0.5,
    maxPull: 60,
    edgeAlpha: 0.1,
    revealAngle: Math.PI * 0.5,
    geometry(W, mobile) {
      const pad = mobile ? 44 : 64;
      const contentH = content.offsetHeight;
      const T = Math.max(contentH + pad * 2, mobile ? 0 : W * 0.33);
      const edge = mobile ? 3.5 / T : 4 / T;
      const curlL = mobile ? 0.06 : 0.085;
      const curlR = mobile ? 0.94 : 0.915;
      const curl = mobile ? 0.5 : 0.86;
      return {
        T,
        height: T * 1.0,
        ext: Math.max(90, T * 0.22),
        x0: (mobile ? -0.02 : 0.015) * W,
        x1: (mobile ? 1.02 : 0.985) * W,
        spineY: [0.02, 0.0, -0.008, 0.0, 0.006, 0.0, -0.02],
        texture: true,
        ends: (u) => -Math.PI * curl * (1 - smooth(u / curlL)) + Math.PI * curl * smooth((u - curlR) / (1 - curlR)),
        layers: [
          { rgb: CREAM, u0: 0, u1: 1, vMin: () => edge, vMax: () => 1 - edge, spec: 0.1, texture: true, textureAlpha: 0.55 },
          { rgb: RED, u0: 0, u1: 1, vMin: () => 0, vMax: () => edge, spec: 0.3 },
          { rgb: RED, u0: 0, u1: 1, vMin: () => 1 - edge, vMax: () => 1, spec: 0.3 },
        ],
      };
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Strand — the thin satin ribbon in the footer, spiralling forever    */
/* ------------------------------------------------------------------ */
export class Strand {
  constructor(root, { reduced }) {
    this.root = root;
    this.canvas = root.querySelector('.footer__ribbon');
    this.ctx = this.canvas.getContext('2d');
    this.reduced = reduced;
    this.ribbon = new Ribbon({ samples: 260, front: [228, 18, 32], back: [168, 6, 20], sim: { c2: 9000, k: 14, damp: 1.6, maxDisp: 120 }, simNodes: 90 });
    this.visible = false;
    this.draw01 = reduced ? 1 : 0;
    this.pts = Array.from({ length: 8 }, () => [0, 0]);
    new IntersectionObserver(([e]) => (this.visible = e.isIntersecting), { rootMargin: '10% 0px' }).observe(root);
    registerRibbon({ ribbon: this.ribbon, el: this.canvas, active: () => this.visible && this.draw01 > 0.9, gain: 1.5, maxPull: 90, name: 'strand' });
  }

  layout() {
    const W = (this.W = this.root.clientWidth);
    this.H = 150;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    const p = this.pts;
    const H = this.H;
    const m = W < 760;
    const coords = [
      [0.035, 0.86],
      [0.012, 0.6],
      [0.045, 0.42],
      [0.16, 0.5],
      [0.42, 0.44],
      [0.7, 0.36],
      [0.9, 0.3],
      [1.03, 0.22],
    ];
    coords.forEach(([x, y], i) => {
      p[i][0] = x * W * (m && i < 3 ? 2 : 1);
      p[i][1] = y * H;
    });
    sampleSplineByLength(p, this.ribbon.x0, this.ribbon.y0);
  }

  update(t, dt) {
    if (!this.visible || !this.W) return;
    const r = this.ribbon;
    r.sim.step(dt);
    r.drawTo = this.draw01;
    const tw = this.reduced ? 0 : t;
    r.build({
      disp: (u) => Math.sin(TAU * u * 2 - tw * 1.4) * 3,
      width: (u) => 4.6 * (0.6 + 0.4 * smooth(u / 0.1)),
      twist: (u) => u * TAU * 2.2 - tw * 0.9,
    });
    const { ctx, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    r.drawBase(ctx, 0, this.draw01);
  }
}

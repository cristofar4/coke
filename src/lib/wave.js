import { clamp } from './math.js';

/**
 * A 1D damped wave equation along the length of a ribbon.
 * Two channels: `y` = displacement along the ribbon normal (px),
 * `w` = extra twist around the ribbon's spine (radians).
 * Pointer pushes, plucks, scroll "wind" and grabs all feed into it,
 * and the ribbon geometry reads it back every frame.
 */
export class WaveSim {
  constructor(n = 72, o = {}) {
    this.n = n;
    this.c2 = o.c2 ?? 8200; // wave speed² (nodes²/s²)
    this.k = o.k ?? 24; // restoring stiffness
    this.damp = o.damp ?? 2.6;
    this.tc2 = o.tc2 ?? 5200;
    this.tk = o.tk ?? 28;
    this.tdamp = o.tdamp ?? 3.2;
    this.maxDisp = o.maxDisp ?? 180;
    this.maxTwist = o.maxTwist ?? 1.4;
    this.pinStart = !!o.pinStart;
    this.pinEnd = !!o.pinEnd;
    this.y = new Float32Array(n);
    this.v = new Float32Array(n);
    this.w = new Float32Array(n);
    this.wv = new Float32Array(n);
    this.grab = null; // { u, target, strength }
    this.energy = 0;
  }

  reset() {
    this.y.fill(0);
    this.v.fill(0);
    this.w.fill(0);
    this.wv.fill(0);
  }

  impulse(u, dv, radius = 0.06) {
    this._spread(this.v, u, dv, radius);
  }

  impulseTwist(u, dv, radius = 0.06) {
    this._spread(this.wv, u, dv, radius);
  }

  _spread(arr, u, amount, radius) {
    const n = this.n;
    const c = u * (n - 1);
    const r = Math.max(1, radius * (n - 1));
    const lo = Math.max(0, Math.floor(c - r * 2.2));
    const hi = Math.min(n - 1, Math.ceil(c + r * 2.2));
    for (let i = lo; i <= hi; i++) {
      const d = (i - c) / r;
      arr[i] += amount * Math.exp(-d * d);
    }
  }

  /** apply a travelling force field f(u) to the displacement velocity */
  force(fn, dt) {
    const n = this.n;
    for (let i = 0; i < n; i++) this.v[i] += fn(i / (n - 1)) * dt;
  }

  step(dt) {
    dt = Math.min(dt, 1 / 30);
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    const { n, y, v, w, wv } = this;
    let e = 0;
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < n; i++) {
        const yl = i > 0 ? y[i - 1] : y[i];
        const yr = i < n - 1 ? y[i + 1] : y[i];
        let a = this.c2 * (yl + yr - 2 * y[i]) - this.k * y[i] - this.damp * v[i];
        const wl = i > 0 ? w[i - 1] : w[i];
        const wr = i < n - 1 ? w[i + 1] : w[i];
        const aw = this.tc2 * (wl + wr - 2 * w[i]) - this.tk * w[i] - this.tdamp * wv[i];
        if (this.grab) {
          const g = this.grab;
          const d = (i / (n - 1) - g.u) / 0.035;
          const f = Math.exp(-d * d);
          if (f > 0.01) a += g.strength * f * (g.target - y[i]) - 30 * f * v[i];
        }
        v[i] += a * h;
        wv[i] += aw * h;
      }
      for (let i = 0; i < n; i++) {
        y[i] = clamp(y[i] + v[i] * h, -this.maxDisp, this.maxDisp);
        w[i] = clamp(w[i] + wv[i] * h, -this.maxTwist, this.maxTwist);
      }
      if (this.pinStart) y[0] = v[0] = w[0] = wv[0] = 0;
      if (this.pinEnd) y[n - 1] = v[n - 1] = w[n - 1] = wv[n - 1] = 0;
    }
    for (let i = 0; i < n; i += 4) e += Math.abs(v[i]) + Math.abs(y[i]);
    this.energy = e;
  }

  sample(u) {
    return this._sample(this.y, u);
  }

  sampleTwist(u) {
    return this._sample(this.w, u);
  }

  _sample(arr, u) {
    const f = clamp(u) * (this.n - 1);
    const i = Math.min(this.n - 2, Math.floor(f));
    const t = f - i;
    return arr[i] + (arr[i + 1] - arr[i]) * t;
  }
}

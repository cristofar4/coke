import { rand, TAU, clamp } from './math.js';
import { pointer } from './field.js';

/*
 * Fizz — page-wide carbonation. Bubbles live in page coordinates so they
 * scroll with the content, rise with buoyancy proportional to their size,
 * wobble, dodge the cursor, and pop into tiny rings.
 */
export class Fizz {
  constructor(canvas, { onPop } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ps = [];
    this.max = 650;
    this.onPop = onPop;
    this.trailAcc = 0;
    this.resize();
  }

  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
  }

  /** client coords */
  spawn(x, y, o = {}) {
    if (this.ps.length >= this.max) this.ps.shift();
    const r = o.r ?? rand(1.4, 4.2);
    this.ps.push({
      kind: 'bubble',
      x,
      y: y + window.scrollY,
      vx: o.vx ?? rand(-30, 30),
      vy: o.vy ?? rand(-80, -20),
      r,
      life: 0,
      max: o.life ?? rand(1.4, 3.2),
      ph: rand(0, TAU),
      wf: rand(3, 7),
      wa: rand(8, 26),
      tint: o.tint ?? 0,
    });
  }

  burst(x, y, count = 36, power = 1, o = {}) {
    const spread = o.spread ?? Math.PI * 0.55;
    const dir = o.dir ?? -Math.PI / 2;
    for (let i = 0; i < count; i++) {
      const a = dir + rand(-spread, spread);
      const sp = rand(60, 460) * power;
      this.spawn(x + rand(-6, 6), y + rand(-6, 6), {
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        r: rand(1, 5.2) * (o.size ?? 1),
        life: rand(0.9, 2.6) * (o.lifeMul ?? 1),
        tint: o.tint,
      });
    }
  }

  /** gentle stream of bubbles from a point, call each frame */
  stream(x, y, rate, dt, o = {}) {
    let n = rate * dt;
    while (n > 0) {
      const j = o.jitter ?? 4;
      if (Math.random() < n) this.spawn(x + rand(-j, j), y, { vy: rand(-90, -30), vx: rand(-14, 14), r: rand(0.8, 3) * (o.size ?? 1), life: rand(1, 2.4) });
      n -= 1;
    }
  }

  update(dt) {
    const sy = window.scrollY;
    // a whisper of fizz follows a fast-moving cursor
    if (pointer.active && pointer.type === 'mouse') {
      const sp = Math.hypot(pointer.vx, pointer.vy);
      if (sp > 900) {
        this.trailAcc += (sp - 900) * 0.022 * dt;
        while (this.trailAcc > 1) {
          this.trailAcc -= 1;
          this.spawn(pointer.x + rand(-8, 8), pointer.y + rand(-8, 8), {
            vx: -pointer.vx * 0.05 + rand(-20, 20),
            vy: -pointer.vy * 0.05 - rand(20, 60),
            r: rand(0.8, 2.6),
            life: rand(0.6, 1.4),
          });
        }
      }
    }
    const ps = this.ps;
    const px = pointer.x;
    const py = pointer.y + sy;
    const dragX = Math.exp(-dt * 1.8);
    const dragY = Math.exp(-dt * 1.2);
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life += dt;
      if (p.kind === 'ring') {
        if (p.life > p.max) ps.splice(i, 1);
        continue;
      }
      p.vy -= (34 + p.r * 26) * dt;
      p.vx *= dragX;
      p.vy *= dragY;
      p.x += Math.sin(p.life * p.wf + p.ph) * p.wa * dt;
      const dx = p.x - px;
      const dy = p.y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < 8100 && d2 > 1) {
        const d = Math.sqrt(d2);
        const f = (1 - d / 90) * 1400 * dt;
        p.vx += (dx / d) * f;
        p.vy += (dy / d) * f;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const screenY = p.y - sy;
      if (p.life >= p.max || screenY < -40) {
        ps[i] = { kind: 'ring', x: p.x, y: p.y, r: p.r, life: 0, max: 0.26 };
        if (this.onPop && screenY > 0) this.onPop(p.r);
      }
    }
  }

  draw() {
    const { ctx, dpr } = this;
    const sy = window.scrollY;
    if (!this.ps.length && this.clean) return;
    this.clean = !this.ps.length;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    for (let i = 0; i < this.ps.length; i++) {
      const p = this.ps[i];
      const y = p.y - sy;
      if (y < -20 || y > this.h + 20) continue;
      if (p.kind === 'ring') {
        const t = p.life / p.max;
        const a = 1 - t;
        ctx.beginPath();
        ctx.arc(p.x, y, p.r * (1 + t * 1.4), 0, TAU);
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(200,30,40,${(a * 0.45).toFixed(3)})`;
        ctx.stroke();
        continue;
      }
      const grow = clamp(p.life / 0.12);
      const fade = clamp((p.max - p.life) / (p.max * 0.2));
      const a = grow * fade;
      const r = p.r * (0.4 + 0.6 * grow);
      ctx.beginPath();
      ctx.arc(p.x, y, r, 0, TAU);
      ctx.fillStyle = `rgba(255,255,255,${(0.28 * a).toFixed(3)})`;
      ctx.fill();
      ctx.lineWidth = Math.max(0.7, r * 0.16);
      ctx.strokeStyle = p.tint ? `rgba(255,255,255,${(0.85 * a).toFixed(3)})` : `rgba(150,12,26,${(0.42 * a).toFixed(3)})`;
      ctx.stroke();
      if (r > 1.4) {
        ctx.beginPath();
        ctx.arc(p.x - r * 0.36, y - r * 0.38, r * 0.28, 0, TAU);
        ctx.fillStyle = `rgba(255,255,255,${(0.95 * a).toFixed(3)})`;
        ctx.fill();
      }
    }
  }
}

/*
 * Carbonation inside the bottle photo: nucleation sites release chains of
 * tiny bubbles that accelerate and grow as they rise. The canvas is masked
 * to the liquid, so bubbles slip behind the label and re-appear above it.
 */
export class Carbonation {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.b = [];
    this.sites = [];
    this.on = false;
    this.intensity = 1;
  }

  resize(w, h) {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.sites = [];
    for (let i = 0; i < 16; i++) {
      const low = i < 11;
      this.sites.push({
        x: rand(0.22, 0.8) * w,
        y: (low ? rand(0.86, 0.97) : rand(0.4, 0.47)) * h,
        rate: rand(3, 11),
        acc: rand(0, 1),
      });
    }
  }

  update(dt) {
    if (!this.on || !this.w) return;
    const s = this.h / 700;
    for (const site of this.sites) {
      site.acc += dt * site.rate * this.intensity;
      while (site.acc > 1) {
        site.acc -= 1;
        this.b.push({ x: site.x + rand(-1, 1), y: site.y, r: rand(0.5, 1) * s, vy: rand(16, 26) * s, ph: rand(0, TAU) });
      }
    }
    if (Math.random() < dt * 10 * this.intensity) {
      this.b.push({ x: rand(0.2, 0.82) * this.w, y: rand(0.8, 0.98) * this.h, r: rand(0.8, 2) * s, vy: rand(10, 22) * s, ph: rand(0, TAU) });
    }
    const top = this.h * 0.268;
    for (let i = this.b.length - 1; i >= 0; i--) {
      const p = this.b[i];
      p.vy += 26 * s * dt;
      p.y -= p.vy * dt;
      p.r += 0.35 * s * dt;
      p.ph += dt * 6;
      p.x += Math.sin(p.ph) * 0.12;
      if (p.y < top) this.b.splice(i, 1);
    }
    if (this.b.length > 900) this.b.splice(0, this.b.length - 900);
  }

  draw() {
    const { ctx, dpr } = this;
    if (!this.w) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.fillStyle = 'rgba(255,236,214,0.7)';
    ctx.beginPath();
    for (const p of this.b) {
      ctx.moveTo(p.x + p.r, p.y);
      ctx.arc(p.x, p.y, p.r, 0, TAU);
    }
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    for (const p of this.b) {
      if (p.r < 1) continue;
      const rr = p.r * 0.35;
      ctx.moveTo(p.x - p.r * 0.3 + rr, p.y - p.r * 0.3);
      ctx.arc(p.x - p.r * 0.3, p.y - p.r * 0.3, rr, 0, TAU);
    }
    ctx.fill();
  }
}

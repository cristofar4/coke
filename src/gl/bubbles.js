import { rand, TAU } from '../lib/math.js';

const AMBIENT = 0;
const EXTRA = 1;
const RING = 2;

/*
 * Carbonation. Every bubble has a depth (z): near bubbles are bigger, brighter
 * and move with the page; far ones drift slower — so scrolling feels like
 * sinking through the drink. Bubbles accelerate toward their terminal rise
 * speed, wobble, dodge the cursor and pop into rings at the surface.
 */
export class Bubbles {
  constructor(max, ambientTarget) {
    this.max = max;
    this.n = 0;
    const F = () => new Float32Array(max);
    this.x = F();
    this.y = F();
    this.vx = F();
    this.vy = F();
    this.r = F();
    this.z = F();
    this.age = F();
    this.life = F();
    this.ph = F();
    this.kind = new Uint8Array(max);
    this.gpu = new Float32Array(max * 4);
    this.ambient = 0;
    this.ambientTarget = ambientTarget;
    this.pressure = 0;
    this.trailAcc = 0;
    this.streams = [0.11, 0.23, 0.38, 0.62, 0.79, 0.91].map((f) => ({ f, acc: Math.random(), rate: rand(5, 11) }));
    this.onPop = null;
  }

  _alloc() {
    return this.n < this.max ? this.n++ : -1;
  }

  _kill(i) {
    if (this.kind[i] === AMBIENT) this.ambient--;
    const j = --this.n;
    if (i === j) return;
    this.x[i] = this.x[j];
    this.y[i] = this.y[j];
    this.vx[i] = this.vx[j];
    this.vy[i] = this.vy[j];
    this.r[i] = this.r[j];
    this.z[i] = this.z[j];
    this.age[i] = this.age[j];
    this.life[i] = this.life[j];
    this.ph[i] = this.ph[j];
    this.kind[i] = this.kind[j];
  }

  spawn(x, y, o = {}) {
    const i = this._alloc();
    if (i < 0) return;
    const z = o.z ?? rand(0.25, 1);
    const r = o.r ?? 0.8 + 3.6 * Math.random() ** 2;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = o.vx ?? 0;
    this.vy[i] = o.vy ?? -(30 + r * 16) * (0.55 + 0.45 * z);
    this.r[i] = r * (0.6 + 0.5 * z);
    this.z[i] = z;
    this.age[i] = o.age ?? 0;
    this.life[i] = o.life ?? 1e9;
    this.ph[i] = rand(0, TAU);
    this.kind[i] = o.kind ?? EXTRA;
    if (this.kind[i] === AMBIENT) this.ambient++;
  }

  burst(x, y, count, power = 1, o = {}) {
    const spread = o.spread ?? Math.PI * 0.6;
    const dir = o.dir ?? -Math.PI / 2;
    const jx = o.jx ?? 8;
    for (let k = 0; k < count; k++) {
      const a = dir + rand(-spread, spread);
      const sp = rand(80, 620) * power;
      this.spawn(x + rand(-jx, jx), y + rand(-8, 8), {
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        r: 0.8 + 4.6 * Math.random() ** 2 * (o.size ?? 1),
        z: rand(0.55, 1),
      });
    }
  }

  /** fill the visible drink with bubbles (first frame / after a jump) */
  seed(env) {
    let guard = 0;
    while (this.ambient < this.ambientTarget && guard++ < 5000) {
      const x = rand(0, env.W);
      const top = Math.max(0, env.surfaceAt(x) + 6);
      const bot = Math.min(env.H, env.bottomY - 10);
      if (bot <= top) break;
      this.spawn(x, rand(top, bot), { kind: AMBIENT, age: 1 });
    }
  }

  update(dt, env) {
    const { W, H, scrollDelta, pointer, t } = env;
    const bottom = Math.min(H, env.bottomY - 8);
    const spawnY = bottom;
    const canSpawn = env.surfaceAt(W * 0.5) < bottom - 20;

    // keep the drink fizzing: ambient bubbles enter from below
    if (canSpawn) {
      let guard = 0;
      while (this.ambient < this.ambientTarget && guard++ < 12) {
        this.spawn(rand(0, W), spawnY + rand(4, 70), { kind: AMBIENT });
      }
      // nucleation sites: chains of tiny bubbles, like a real glass
      for (const s of this.streams) {
        s.acc += dt * s.rate;
        while (s.acc > 1) {
          s.acc -= 1;
          this.spawn(s.f * W + rand(-1.5, 1.5), spawnY + 4, { r: rand(0.7, 1.4), z: 0.95, kind: EXTRA });
        }
      }
    }

    // moving a finger through soda leaves a trail of bubbles
    if (pointer.active && pointer.y > env.surfaceAt(pointer.x) + 8 && pointer.y < bottom) {
      const sp = Math.hypot(pointer.vx, pointer.vy);
      this.trailAcc += Math.min(70, sp * 0.06) * dt;
      while (this.trailAcc > 1) {
        this.trailAcc -= 1;
        this.spawn(pointer.x + rand(-6, 6), pointer.y + rand(-6, 6), {
          vx: -pointer.vx * 0.08 + rand(-30, 30),
          vy: -pointer.vy * 0.08 - rand(10, 60),
          r: rand(0.6, 2.6),
          z: rand(0.7, 1),
        });
      }
    }

    const shake = this.pressure;
    const drag = Math.exp(-dt * 2.6);
    const relax = 1 - Math.exp(-dt * 2.2);
    const px = pointer.x;
    const py = pointer.y;
    for (let i = this.n - 1; i >= 0; i--) {
      this.age[i] += dt;
      if (this.kind[i] === RING) {
        if (this.age[i] > this.life[i]) this._kill(i);
        continue;
      }
      const z = this.z[i];
      const r = this.r[i];
      const term = -(30 + r * 16) * (0.55 + 0.45 * z);
      this.vy[i] += (term - this.vy[i]) * relax;
      this.vx[i] *= drag;
      let x = this.x[i] + Math.sin(this.age[i] * (3 + r) + this.ph[i]) * (4 + r * 3) * dt;
      let y = this.y[i];
      if (shake > 0) {
        x += (Math.random() - 0.5) * shake * 5;
        y += (Math.random() - 0.5) * shake * 5;
      }
      if (pointer.active) {
        const dx = x - px;
        const dy = y - py;
        const d2 = dx * dx + dy * dy;
        if (d2 < 12100 && d2 > 1) {
          const d = Math.sqrt(d2);
          const f = (1 - d / 110) * 900 * dt * z;
          this.vx[i] += (dx / d) * f;
          this.vy[i] += (dy / d) * f;
        }
      }
      x += this.vx[i] * dt;
      y += this.vy[i] * dt - scrollDelta * (0.2 + 0.8 * z);
      if (x < -20) x += W + 40;
      else if (x > W + 20) x -= W + 40;
      this.x[i] = x;
      this.y[i] = y;

      const sY = env.surfaceAt(x);
      if (y - r < sY) {
        // reached the surface: pop
        if (sY > -10 && sY < H + 10 && this.age[i] > 0.2) {
          const k = this.kind[i] === AMBIENT;
          this._kill(i);
          const j = this._alloc();
          if (j >= 0) {
            this.x[j] = x;
            this.y[j] = sY + 1;
            this.r[j] = r * 1.3 + 1;
            this.age[j] = 0;
            this.life[j] = 0.3;
            this.kind[j] = RING;
            this.z[j] = 1;
          }
          if (this.onPop && (k ? Math.random() < 0.15 : Math.random() < 0.3)) this.onPop(r);
        } else this._kill(i);
        continue;
      }
      if (y < -30 || y > H + 160 || y > env.bottomY + r || this.age[i] > this.life[i]) this._kill(i);
    }

    // pack for the GPU
    const g = this.gpu;
    for (let i = 0; i < this.n; i++) {
      const o = i * 4;
      g[o] = this.x[i];
      g[o + 1] = this.y[i];
      if (this.kind[i] === RING) {
        const k = this.age[i] / this.life[i];
        g[o + 2] = -(this.r[i] * (1 + k * 1.6));
        g[o + 3] = (1 - k) * 0.7;
      } else {
        g[o + 2] = this.r[i];
        g[o + 3] = Math.min(1, this.age[i] / 0.3) * (0.3 + 0.7 * this.z[i]);
      }
    }
  }
}

import { WaveSim } from './wave.js';
import { clamp, lerp } from './math.js';

/*
 * Ribbon — a procedurally shaded, twisting 3D strip rendered with Canvas 2D.
 *
 * The strip is described by a spine (centre line), a half-width and a twist
 * angle at every sample. Twisting the strip around its spine foreshortens it
 * (|cos θ|) and, past 90°, flips it to its back face. Every quad is lit with a
 * satin Lambert + Blinn-Phong model, so a ribbon can curl, unfurl and ripple
 * like the real thing. Photos can be "printed" on the front face: they are
 * warped strip by strip with affine transforms so they bend with the fabric.
 */

const norm3 = (x, y, z) => {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
};
const LIGHT = norm3(-0.32, -0.8, 0.92);
const HALF = norm3(LIGHT[0], LIGHT[1], LIGHT[2] + 1);

function tangents(x, y, tx, ty, nx, ny, n) {
  for (let i = 0; i < n; i++) {
    const i0 = i > 0 ? i - 1 : 0;
    const i1 = i < n - 1 ? i + 1 : n - 1;
    let dx = x[i1] - x[i0];
    let dy = y[i1] - y[i0];
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    if (tx) {
      tx[i] = dx;
      ty[i] = dy;
    }
    nx[i] = dy;
    ny[i] = -dx;
  }
}

export class Ribbon {
  constructor(o = {}) {
    const n = (this.n = o.samples || 160);
    this.front = o.front || [226, 16, 30];
    this.back = o.back || [246, 243, 238];
    this.frontSpec = o.frontSpec ?? 0.38;
    this.backSpec = o.backSpec ?? 0.16;
    this.shininess = o.shininess ?? 38;
    this.ambient = o.ambient ?? 0.5;
    this.ambientBack = o.ambientBack ?? this.ambient;
    this.sim = new WaveSim(o.simNodes || 72, o.sim || {});
    const F = () => new Float32Array(n);
    this.u = F();
    for (let i = 0; i < n; i++) this.u[i] = i / (n - 1);
    this.x0 = F();
    this.y0 = F();
    this.nx0 = F();
    this.ny0 = F();
    this.x = F();
    this.y = F();
    this.tx = F();
    this.ty = F();
    this.nx = F();
    this.ny = F();
    this.hw = F();
    this.cs = F();
    this.sn = F();
    this.k = F();
    this.sp = F();
    this.ax = F();
    this.ay = F();
    this.bx = F();
    this.by = F();
    this.drawFrom = 0;
    this.drawTo = 1;
    this.restLength = 1;
    this.restThickness = 1;
    this._p = { x: 0, y: 0 };
    this._q = { x: 0, y: 0 };
    this._r = { x: 0, y: 0 };
    this._s = { x: 0, y: 0 };
  }

  /** Fill x0/y0 first (the rest spine), then build the live geometry. */
  build({ disp, width, twist }) {
    const { n, x0, y0, nx0, ny0, x, y, tx, ty, nx, ny, hw, cs, sn, ax, ay, bx, by, k, sp, u, sim } = this;
    tangents(x0, y0, null, null, nx0, ny0, n);
    for (let i = 0; i < n; i++) {
      const d = sim.sample(u[i]) + (disp ? disp(u[i], i) : 0);
      x[i] = x0[i] + nx0[i] * d;
      y[i] = y0[i] + ny0[i] * d;
    }
    tangents(x, y, tx, ty, nx, ny, n);
    const amb = this.ambient;
    for (let i = 0; i < n; i++) {
      const th = (twist ? twist(u[i], i) : 0) + sim.sampleTwist(u[i]);
      const c = Math.cos(th);
      const s = Math.sin(th);
      const h = width(u[i], i);
      cs[i] = c;
      sn[i] = s;
      hw[i] = h;
      const ox = nx[i] * h * c;
      const oy = ny[i] * h * c;
      ax[i] = x[i] + ox;
      ay[i] = y[i] + oy;
      bx[i] = x[i] - ox;
      by[i] = y[i] - oy;
      // surface normal of the twisted strip (facing the viewer)
      let Nx = -s * ty[i];
      let Ny = s * tx[i];
      let Nz = c;
      if (c < 0) {
        Nx = -Nx;
        Ny = -Ny;
        Nz = -Nz;
      }
      const diff = Math.max(0, Nx * LIGHT[0] + Ny * LIGHT[1] + Nz * LIGHT[2]);
      const a = c < 0 ? this.ambientBack : amb;
      k[i] = a + ((1 - a) * diff) / LIGHT[2];
      const sh = Math.max(0, Nx * HALF[0] + Ny * HALF[1] + Nz * HALF[2]);
      sp[i] = Math.pow(sh, this.shininess);
    }
  }

  /** point on the surface: u along, v across (0 = edge A, 1 = edge B) */
  point(u, v, out) {
    const f = clamp(u) * (this.n - 1);
    const i = Math.min(this.n - 2, Math.floor(f));
    const t = f - i;
    const ax = this.ax[i] + (this.ax[i + 1] - this.ax[i]) * t;
    const ay = this.ay[i] + (this.ay[i + 1] - this.ay[i]) * t;
    const bx = this.bx[i] + (this.bx[i + 1] - this.bx[i]) * t;
    const by = this.by[i] + (this.by[i + 1] - this.by[i]) * t;
    out.x = ax + (bx - ax) * v;
    out.y = ay + (by - ay) * v;
    return out;
  }

  centre(u, out) {
    const f = clamp(u) * (this.n - 1);
    const i = Math.min(this.n - 2, Math.floor(f));
    const t = f - i;
    out.x = this.x[i] + (this.x[i + 1] - this.x[i]) * t;
    out.y = this.y[i] + (this.y[i + 1] - this.y[i]) * t;
    out.tx = this.tx[i] + (this.tx[i + 1] - this.tx[i]) * t;
    out.ty = this.ty[i] + (this.ty[i + 1] - this.ty[i]) * t;
    out.c = this.cs[i] + (this.cs[i + 1] - this.cs[i]) * t;
    out.hw = this.hw[i] + (this.hw[i + 1] - this.hw[i]) * t;
    return out;
  }

  shadeColor(rgb, i, j, spec) {
    const kk = (this.k[i] + this.k[j]) * 0.5;
    const s = (this.sp[i] + this.sp[j]) * 0.5 * spec * 255;
    const r = Math.min(255, rgb[0] * kk + s) | 0;
    const g = Math.min(255, rgb[1] * kk + s) | 0;
    const b = Math.min(255, rgb[2] * kk + s) | 0;
    return `rgb(${r},${g},${b})`;
  }

  /** Draw the bare strip (front/back faces) between u0 and u1. */
  drawBase(ctx, u0 = this.drawFrom, u1 = this.drawTo) {
    const { n, ax, ay, bx, by, cs } = this;
    if (u1 <= u0) return;
    const f0 = clamp(u0) * (n - 1);
    const f1 = clamp(u1) * (n - 1);
    const i0 = Math.floor(f0);
    const iEnd = Math.ceil(f1);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 0.9;
    for (let i = i0; i < iEnd && i < n - 1; i++) {
      const j = i + 1;
      const front = cs[i] + cs[j] >= 0;
      const col = this.shadeColor(front ? this.front : this.back, i, j, front ? this.frontSpec : this.backSpec);
      ctx.fillStyle = col;
      ctx.strokeStyle = col;
      // fractional end segment so unspooling is smooth
      let t = 1;
      if (j === iEnd && f1 < iEnd) t = f1 - i;
      const jx = ax[i] + (ax[j] - ax[i]) * t;
      const jy = ay[i] + (ay[j] - ay[i]) * t;
      const kx = bx[i] + (bx[j] - bx[i]) * t;
      const ky = by[i] + (by[j] - by[i]) * t;
      ctx.beginPath();
      ctx.moveTo(ax[i], ay[i]);
      ctx.lineTo(jx, jy);
      ctx.lineTo(kx, ky);
      ctx.lineTo(bx[i], by[i]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  /**
   * Fast path for bands that run left→right: one silhouette fill + gradient
   * shading instead of hundreds of quads. Back-facing spans are patched on top.
   */
  drawBaseFast(ctx, W, H) {
    const { n, ax, ay, bx, by, cs } = this;
    const col = this.front;
    ctx.beginPath();
    ctx.moveTo(ax[0], ay[0]);
    for (let i = 1; i < n; i++) ctx.lineTo(ax[i], ay[i]);
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(bx[i], by[i]);
    ctx.closePath();
    ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 0.9;
    ctx.lineJoin = 'round';
    ctx.fill();
    ctx.stroke();
    ctx.save();
    ctx.clip();
    this._shadeOverlay(ctx, 0, n - 1, W, H, true);
    ctx.restore();
    // back-facing spans (curls) get their own colour
    for (let i = 0; i < n - 1; i++) {
      if (cs[i] + cs[i + 1] >= 0) continue;
      const c = this.shadeColor(this.back, i, i + 1, this.backSpec);
      ctx.fillStyle = c;
      ctx.strokeStyle = c;
      ctx.beginPath();
      ctx.moveTo(ax[i], ay[i]);
      ctx.lineTo(ax[i + 1], ay[i + 1]);
      ctx.lineTo(bx[i + 1], by[i + 1]);
      ctx.lineTo(bx[i], by[i]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  /** soft satin rim light along edge A and a darker crease along edge B */
  drawEdges(ctx, u0 = this.drawFrom, u1 = this.drawTo, alpha = 0.28) {
    const { n, ax, ay, bx, by, cs } = this;
    const i0 = Math.floor(clamp(u0) * (n - 1));
    const i1 = Math.min(n - 1, Math.floor(clamp(u1) * (n - 1)));
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
    ctx.beginPath();
    let pen = false;
    for (let i = i0; i <= i1; i++) {
      if (cs[i] > 0.15) {
        if (!pen) ctx.moveTo(ax[i], ay[i]);
        else ctx.lineTo(ax[i], ay[i]);
        pen = true;
      } else pen = false;
    }
    ctx.stroke();
    ctx.strokeStyle = `rgba(70,0,8,${alpha * 0.8})`;
    ctx.beginPath();
    pen = false;
    for (let i = i0; i <= i1; i++) {
      if (cs[i] > 0.15) {
        if (!pen) ctx.moveTo(bx[i], by[i]);
        else ctx.lineTo(bx[i], by[i]);
        pen = true;
      } else pen = false;
    }
    ctx.stroke();
  }

  _regionPath(ctx, L) {
    const P = this._p;
    const { n, u } = this;
    const i0 = Math.max(0, Math.floor(L.u0 * (n - 1)));
    const i1 = Math.min(n - 1, Math.ceil(L.u1 * (n - 1)));
    ctx.beginPath();
    this.point(L.u0, L.vMin(L.u0), P);
    ctx.moveTo(P.x, P.y);
    for (let i = i0 + 1; i < i1; i++) {
      this.point(u[i], L.vMin(u[i]), P);
      ctx.lineTo(P.x, P.y);
    }
    this.point(L.u1, L.vMin(L.u1), P);
    ctx.lineTo(P.x, P.y);
    this.point(L.u1, L.vMax(L.u1), P);
    ctx.lineTo(P.x, P.y);
    for (let i = i1 - 1; i > i0; i--) {
      this.point(u[i], L.vMax(u[i]), P);
      ctx.lineTo(P.x, P.y);
    }
    this.point(L.u0, L.vMax(L.u0), P);
    ctx.lineTo(P.x, P.y);
    ctx.closePath();
  }

  /** a flat-colour panel printed on the front face (shaded with the fabric) */
  drawColorLayer(ctx, L, W = 1e4, H = 1e4) {
    const { n, u, cs } = this;
    const P = this._p;
    const i0 = Math.max(0, Math.floor(L.u0 * (n - 1)));
    const i1 = Math.min(n - 1, Math.ceil(L.u1 * (n - 1)));
    const fill = `rgb(${L.rgb[0]},${L.rgb[1]},${L.rgb[2]})`;
    ctx.save();
    ctx.beginPath();
    // one polygon per run of front-facing samples
    let i = i0;
    while (i < i1) {
      while (i < i1 && cs[i] <= 0.02) i++;
      let j = i;
      while (j < i1 && cs[j + 1] > 0.02) j++;
      if (j > i) {
        const ua = Math.max(u[i], L.u0);
        const ub = Math.min(u[j], L.u1);
        this.point(ua, L.vMin(ua), P);
        ctx.moveTo(P.x, P.y);
        for (let k = i + 1; k < j; k++) {
          this.point(u[k], L.vMin(u[k]), P);
          ctx.lineTo(P.x, P.y);
        }
        this.point(ub, L.vMin(ub), P);
        ctx.lineTo(P.x, P.y);
        this.point(ub, L.vMax(ub), P);
        ctx.lineTo(P.x, P.y);
        for (let k = j - 1; k > i; k--) {
          this.point(u[k], L.vMax(u[k]), P);
          ctx.lineTo(P.x, P.y);
        }
        this.point(ua, L.vMax(ua), P);
        ctx.lineTo(P.x, P.y);
        ctx.closePath();
      }
      i = j + 1;
    }
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.clip();
    if (L.texture) {
      ctx.globalAlpha = L.textureAlpha ?? 0.5;
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = L.texture;
      ctx.fillRect(-50, -50, W + 100, H + 100);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    this._shadeOverlay(ctx, i0, i1, W, H);
    ctx.restore();
  }

  /** a photo printed on the front face: warped strip-by-strip with the fabric */
  drawImageLayer(ctx, L, dpr, canvasW, canvasH) {
    const img = L.img;
    if (!img || !(img.naturalWidth || img.width)) return;
    const { n, u, cs } = this;
    const i0 = Math.max(0, Math.floor(L.u0 * (n - 1)));
    const i1 = Math.min(n - 1, Math.ceil(L.u1 * (n - 1)));
    if (i1 <= i0) return;
    const [U0, U1, V0, V1] = L.rect;
    const { iw, ih, sx0, sy0, sw, sh } = this.mapImage(L);
    const P00 = this._p;
    const P10 = this._q;
    const P01 = this._r;
    const P11 = this._s;
    const T0 = this._t0 || (this._t0 = { x: 0, y: 0 });
    const T1 = this._t1 || (this._t1 = { x: 0, y: 0 });
    const T2 = this._t2 || (this._t2 = { x: 0, y: 0 });

    ctx.save();
    this._regionPath(ctx, L);
    ctx.clip();
    for (let i = i0, j = i0 + 1; i < i1; i = j, j = i + 1) {
      if (cs[i] <= 0.015 && cs[j] <= 0.015) continue;
      const ua = Math.max(u[i], U0);
      // merge neighbouring strips while one parallelogram still fits the fabric
      this.point(ua, V0, P00);
      this.point(ua, V1, P01);
      let ub = Math.min(u[j], U1);
      this.point(ub, V0, P10);
      this.point(ub, V1, P11);
      while (j < i1 && j - i < 5 && cs[j] > 0.3) {
        const uc = Math.min(u[j + 1], U1);
        if (uc <= ub) break;
        this.point(uc, V0, T0);
        this.point(uc, V1, T1);
        const m = Math.hypot(P01.x + T0.x - P00.x - T1.x, P01.y + T0.y - P00.y - T1.y);
        // midpoint check keeps the merged strip's top edge straight enough
        this.point(ub, V0, T2);
        const mx = (P00.x + T0.x) / 2 - T2.x;
        const my = (P00.y + T0.y) / 2 - T2.y;
        if (m > 0.5 || mx * mx + my * my > 0.09) break;
        ub = uc;
        P10.x = T0.x;
        P10.y = T0.y;
        P11.x = T1.x;
        P11.y = T1.y;
        j++;
      }
      if (ub <= ua) continue;
      const srcX = sx0 + ((ua - U0) / (U1 - U0)) * sw;
      const srcW = ((ub - ua) / (U1 - U0)) * sw;
      const ex = P10.x - P00.x;
      const ey = P10.y - P00.y;
      const len = Math.hypot(ex, ey) || 1;
      const ov = 1 + 1.5 / len;
      const w = Math.min(srcW * ov, iw - srcX);
      // how far an affine parallelogram would miss the strip's true 4th corner;
      // where the fabric twists fast, split the strip into rows so each row stays exact
      const mis = Math.hypot(P01.x + ex - P11.x, P01.y + ey - P11.y);
      const K = Math.min(12, Math.max(1, Math.ceil(mis / 0.6)));
      for (let k = 0; k < K; k++) {
        const va = V0 + ((V1 - V0) * k) / K;
        const vb = V0 + ((V1 - V0) * (k + 1)) / K;
        let ax = P00.x, ay = P00.y, bx = P10.x, by = P10.y, cx = P01.x, cy = P01.y;
        if (K > 1) {
          this.point(ua, va, T0);
          this.point(ub, va, T1);
          this.point(ua, vb, T2);
          ax = T0.x; ay = T0.y; bx = T1.x; by = T1.y; cx = T2.x; cy = T2.y;
        }
        const rowH = Math.hypot(cx - ax, cy - ay) || 1;
        const sy = sy0 + (sh * k) / K;
        const shk = sh / K;
        const ovy = K > 1 && k < K - 1 ? 1 + 1.2 / rowH : 1;
        const hk = Math.min(shk * ovy, ih - sy);
        ctx.setTransform((bx - ax) * dpr, (by - ay) * dpr, (cx - ax) * dpr, (cy - ay) * dpr, ax * dpr, ay * dpr);
        ctx.drawImage(img, srcX, sy, w, hk, 0, 0, w / srcW, hk / shk);
      }
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (L.fade) this._fade(ctx, L.fade, canvasW, canvasH);
    if (L.after) L.after(ctx, this, L);
    if (L.shade !== false) this._shadeOverlay(ctx, i0, i1, canvasW, canvasH);
    ctx.restore();
  }

  /** cover-fit an image into a layer's rect, honouring zoom / focus / pan */
  mapImage(L) {
    const img = L.img;
    const [U0, U1, V0, V1] = L.rect;
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const Lpx = (U1 - U0) * this.restLength;
    const Hpx = (V1 - V0) * this.restThickness;
    const sc = Math.max(Lpx / iw, Hpx / ih) * (L.zoom || 1);
    const sw = Lpx / sc;
    const sh = Hpx / sc;
    const sx0 = clamp((iw - sw) * (L.focusX ?? 0.5) + (L.panX || 0) * iw, 0, iw - sw);
    const sy0 = clamp((ih - sh) * (L.focusY ?? 0.5) + (L.panY || 0) * ih, 0, ih - sh);
    return { iw, ih, sx0, sy0, sw, sh };
  }

  /** where a normalised image coordinate currently sits on the canvas */
  imagePoint(L, ix, iy, out) {
    const [U0, U1, V0, V1] = L.rect;
    const m = this.mapImage(L);
    const u = U0 + ((ix * m.iw - m.sx0) / m.sw) * (U1 - U0);
    const v = V0 + ((iy * m.ih - m.sy0) / m.sh) * (V1 - V0);
    return this.point(u, v, out);
  }

  _fade(ctx, [ua, ub, rgb], W, H) {
    const P = this._p;
    this.centre(ua, P);
    const xa = P.x;
    this.centre(ub, P);
    const xb = P.x;
    const g = ctx.createLinearGradient(xa, 0, xb, 0);
    g.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
    g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},1)`);
    ctx.fillStyle = g;
    ctx.fillRect(xa, -50, Math.max(W, xb) - xa + 100, H + 100);
  }

  _shadeOverlay(ctx, i0, i1, W, H, base = false) {
    const { x, k, sp, cs } = this;
    const specAmt = base ? this.frontSpec : 0.28;
    const xa = x[i0];
    const xb = x[i1];
    const span = xb - xa;
    if (Math.abs(span) < 2) return;
    // one gradient carries both the shadow (dark stops) and the satin sheen (light stops)
    const g = ctx.createLinearGradient(xa, 0, xb, 0);
    const step = Math.max(1, ((i1 - i0) / 56) | 0);
    let last = 0;
    for (let i = i0; i <= i1; i += step) {
      let t = clamp((x[i] - xa) / span);
      if (t < last) t = last;
      last = t;
      const kk = cs[i] > 0 || base ? k[i] : 0.5;
      const lite = clamp((kk - 1) * 0.9 + sp[i] * specAmt, 0, 0.55);
      const dark = clamp((1 - kk) * 1.05, 0, 0.85);
      g.addColorStop(t, lite > dark ? `rgba(255,250,245,${lite.toFixed(3)})` : `rgba(30,0,6,${dark.toFixed(3)})`);
    }
    ctx.fillStyle = g;
    ctx.fillRect(-50, -50, W + 100, H + 100);
  }

  /** nearest-point hit test in canvas space */
  hit(px, py, margin = 10) {
    const { n, x, y, nx, ny, tx, ty, hw, cs } = this;
    const i0 = Math.floor(clamp(this.drawFrom) * (n - 1));
    const i1 = Math.floor(clamp(this.drawTo) * (n - 1));
    let best = -1;
    let bd = Infinity;
    for (let i = i0; i <= i1; i += 2) {
      const dx = px - x[i];
      const dy = py - y[i];
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if (best < 0) return null;
    for (let i = Math.max(i0, best - 2); i <= Math.min(i1, best + 2); i++) {
      const dx = px - x[i];
      const dy = py - y[i];
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    const dx = px - x[best];
    const dy = py - y[best];
    const off = dx * nx[best] + dy * ny[best];
    const along = dx * tx[best] + dy * ty[best];
    const half = hw[best] * Math.abs(cs[best]);
    const j = best < n - 1 ? best + 1 : best - 1;
    const spacing = Math.hypot(x[j] - x[best], y[j] - y[best]);
    if (Math.abs(off) <= half + margin && Math.abs(along) <= spacing * 1.6 + margin) {
      return { i: best, u: this.u[best], off, half, nx: nx[best], ny: ny[best] };
    }
    return null;
  }

  /** rest-pose point + normal at u (for grabbing) */
  rest(u, out) {
    const f = clamp(u) * (this.n - 1);
    const i = Math.min(this.n - 2, Math.floor(f));
    const t = f - i;
    out.x = lerp(this.x0[i], this.x0[i + 1], t);
    out.y = lerp(this.y0[i], this.y0[i + 1], t);
    out.nx = lerp(this.nx0[i], this.nx0[i + 1], t);
    out.ny = lerp(this.ny0[i], this.ny0[i + 1], t);
    return out;
  }
}

/** Build a subtle paper-fibre texture as a CanvasPattern */
export function paperPattern(ctx) {
  const c = document.createElement('canvas');
  c.width = c.height = 160;
  const g = c.getContext('2d');
  const id = g.createImageData(160, 160);
  for (let i = 0; i < id.data.length; i += 4) {
    const v = 236 + Math.random() * 19;
    id.data[i] = v;
    id.data[i + 1] = v - 1;
    id.data[i + 2] = v - 3;
    id.data[i + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  g.globalAlpha = 0.05;
  for (let k = 0; k < 140; k++) {
    g.strokeStyle = Math.random() > 0.5 ? '#000' : '#8a6d5a';
    g.beginPath();
    const x = Math.random() * 160;
    const y = Math.random() * 160;
    g.moveTo(x, y);
    g.lineTo(x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 8);
    g.stroke();
  }
  return ctx.createPattern(c, 'repeat');
}

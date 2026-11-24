import gsap from 'gsap';
import { crScalar, clamp, isFinePointer } from '../lib/math.js';

// The contour bottle as a radius profile: [y, r], both as fractions of height.
const PROFILE = [
  [0.0, 0.058],
  [0.012, 0.064],
  [0.03, 0.064],
  [0.038, 0.055],
  [0.052, 0.056],
  [0.064, 0.058],
  [0.075, 0.053],
  [0.13, 0.055],
  [0.21, 0.068],
  [0.29, 0.097],
  [0.37, 0.13],
  [0.445, 0.147],
  [0.505, 0.14],
  [0.565, 0.127],
  [0.64, 0.126],
  [0.72, 0.143],
  [0.8, 0.156],
  [0.875, 0.151],
  [0.935, 0.141],
  [0.972, 0.134],
  [1.0, 0.118],
];
const H = 300;
const NS = 'http://www.w3.org/2000/svg';

function sampleProfile(n = 160) {
  const ys = PROFILE.map((p) => p[0]);
  const rs = PROFILE.map((p) => p[1]);
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    pts.push([crScalar(rs, t) * H, crScalar(ys, t) * H]);
  }
  return pts;
}

function radiusAt(pts, y) {
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][1] >= y) {
      const a = pts[i - 1];
      const b = pts[i];
      const t = (y - a[1]) / (b[1] - a[1] || 1);
      return a[0] + (b[0] - a[0]) * t;
    }
  }
  return pts[pts.length - 1][0];
}

function buildBottle() {
  const pts = sampleProfile();
  const f = (v) => v.toFixed(2);
  let d = `M ${f(-pts[0][0])} 0 L ${f(pts[0][0])} 0`;
  for (const [r, y] of pts) d += ` L ${f(r)} ${f(y)}`;
  for (let k = pts.length - 1; k >= 0; k--) d += ` L ${f(-pts[k][0])} ${f(pts[k][1])}`;
  d += ' Z';

  // fluting: ridges wrapping the two bulges, drawn as projected meridians
  let flutes = '';
  const zones = [
    [0.27, 0.525],
    [0.665, 0.965],
  ];
  const angles = [-72, -54, -36, -18, 0, 18, 36, 54, 72];
  for (const [a, b] of zones) {
    for (const deg of angles) {
      const s = Math.sin((deg * Math.PI) / 180);
      let seg = '';
      for (let k = 0; k <= 30; k++) {
        const y = (a + ((b - a) * k) / 30) * H;
        const x = radiusAt(pts, y) * s * 0.97;
        seg += `${k ? 'L' : 'M'} ${f(x)} ${f(y)} `;
      }
      flutes += seg;
    }
  }
  // outline sample points, used to know how much of the bottle you have "felt"
  const probes = [];
  for (let k = 0; k < pts.length; k += 3) {
    probes.push([pts[k][0], pts[k][1]], [-pts[k][0], pts[k][1]]);
  }
  return { d, flutes, probes, pts };
}

/*
 * 02 — Shape. "A bottle you could recognise by touch, in the dark."
 * The bottle is invisible until you feel for it: your cursor (or finger) is a
 * warm torch. Once you have traced enough of it, it lights up and fills.
 */
export class ShapeChapter {
  constructor(root, { onFound, reduced }) {
    this.root = root;
    this.stage = root.querySelector('.shape__stage');
    this.holder = root.querySelector('.shape__bottle');
    this.status = root.querySelector('.shape__found');
    this.onFound = onFound;
    this.reduced = reduced;
    this.fine = isFinePointer();
    this.found = false;
    this.active = false;
    this.torch = { x: 0, y: H * 0.5, r: 58 };
    this.screenTorch = { x: -999, y: -999 };
    this.level = H + 10;
    this.phase = 0;

    const b = (this.geo = buildBottle());
    this.visited = new Uint8Array(b.probes.length);
    this.holder.innerHTML = `
      <svg viewBox="-70 -14 140 330" aria-hidden="true">
        <defs>
          <radialGradient id="torchGrad">
            <stop offset="0" stop-color="#fff"/>
            <stop offset="0.55" stop-color="#fff" stop-opacity="0.6"/>
            <stop offset="1" stop-color="#fff" stop-opacity="0"/>
          </radialGradient>
          <mask id="torchMask" maskUnits="userSpaceOnUse" x="-200" y="-200" width="400" height="800">
            <rect x="-200" y="-200" width="400" height="800" fill="#000"/>
            <circle class="torch" cx="0" cy="150" r="58" fill="url(#torchGrad)"/>
          </mask>
          <clipPath id="bottleClip"><path d="${b.d}"/></clipPath>
          <linearGradient id="colaFill" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#2a0a04"/>
            <stop offset="0.35" stop-color="#7a2a0c"/>
            <stop offset="0.55" stop-color="#a8461a"/>
            <stop offset="1" stop-color="#1d0603"/>
          </linearGradient>
          <linearGradient id="glassSheen" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#fff" stop-opacity="0"/>
            <stop offset="0.28" stop-color="#fff" stop-opacity="0.35"/>
            <stop offset="0.34" stop-color="#fff" stop-opacity="0"/>
            <stop offset="0.8" stop-color="#fff" stop-opacity="0"/>
            <stop offset="0.86" stop-color="#fff" stop-opacity="0.18"/>
            <stop offset="1" stop-color="#fff" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <g class="ghost">
          <path d="${b.d}" />
        </g>
        <g clip-path="url(#bottleClip)" class="liquid">
          <path class="liquid__fill" d="" fill="url(#colaFill)"/>
          <g class="liquid__bubbles"></g>
        </g>
        <g class="lit" mask="url(#torchMask)">
          <path class="lit__glow" d="${b.d}"/>
          <path class="lit__outline" d="${b.d}"/>
          <path class="lit__flutes" d="${b.flutes}"/>
          <path class="lit__label" d="M ${-0.126 * H} ${0.535 * H} L ${0.126 * H} ${0.535 * H} M ${-0.124 * H} ${0.652 * H} L ${0.124 * H} ${0.652 * H}"/>
          <text class="lit__mark" x="0" y="${0.607 * H}" text-anchor="middle">Coca-Cola</text>
          <rect x="${-0.17 * H}" y="0" width="${0.34 * H}" height="${H}" fill="url(#glassSheen)" clip-path="url(#bottleClip)"/>
        </g>
      </svg>`;
    this.svg = this.holder.querySelector('svg');
    this.torchEl = this.svg.querySelector('.torch');
    this.fillEl = this.svg.querySelector('.liquid__fill');
    this.bubblesG = this.svg.querySelector('.liquid__bubbles');
    this.bub = Array.from({ length: 22 }, () => {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('r', (0.6 + Math.random() * 1.6).toFixed(2));
      c.setAttribute('fill', 'rgba(255,225,190,0.75)');
      this.bubblesG.append(c);
      return { el: c, x: (Math.random() - 0.5) * 0.2 * H, y: H * Math.random(), v: 14 + Math.random() * 26 };
    });

    this.touching = false;
    this.stage.addEventListener('pointermove', (e) => this.moveTo(e.clientX, e.clientY));
    this.stage.addEventListener('pointerdown', (e) => {
      this.touching = e.pointerType !== 'mouse';
      this.moveTo(e.clientX, e.clientY);
    });
    const up = () => (this.touching = false);
    this.stage.addEventListener('pointerup', up);
    this.stage.addEventListener('pointercancel', up);
    if (reduced) this.reveal(true);
  }

  toSvg(cx, cy) {
    const m = this.svg.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(cx, cy).matrixTransform(m.inverse());
    return p;
  }

  moveTo(cx, cy) {
    const p = this.toSvg(cx, cy);
    if (!p) return;
    this.torch.x = p.x;
    this.torch.y = p.y;
    this.screenTorch.x = cx;
    this.screenTorch.y = cy;
    this.feel();
  }

  /** mark the outline points under the torch as felt */
  feel() {
    if (this.found) return;
    const { x, y, r } = this.torch;
    const rr = (r * 0.75) ** 2;
    let n = 0;
    this.geo.probes.forEach(([px, py], i) => {
      if (!this.visited[i] && (px - x) ** 2 + (py - y) ** 2 < rr) this.visited[i] = 1;
      n += this.visited[i];
    });
    if (n / this.visited.length > 0.5) this.reveal();
  }

  /** phones: as you scroll, the torch sweeps across the middle of the screen by itself */
  scrollTorch(p, W, H) {
    if (this.fine || this.found || this.touching) return;
    this.moveTo(W * 0.5 + Math.sin(p * Math.PI * 6) * W * 0.16, H * 0.55);
  }

  reveal(instant = false) {
    if (this.found) return;
    this.found = true;
    this.root.classList.add('is-found');
    this.status.textContent = 'There it is. Known by touch since 1915.';
    if (instant) {
      this.torch.r = 600;
      this.level = H * 0.2;
      return;
    }
    gsap.to(this.torch, { r: 520, duration: 1.6, ease: 'expo.inOut' });
    gsap.to(this, { level: H * 0.2, duration: 2.6, ease: 'power2.inOut', delay: 0.3 });
    const r = this.holder.getBoundingClientRect();
    this.onFound(r.left + r.width / 2, r.top + r.height * 0.85);
  }

  update(t, dt) {
    if (!this.active) return;
    this.torchEl.setAttribute('cx', this.torch.x.toFixed(1));
    this.torchEl.setAttribute('cy', this.torch.y.toFixed(1));
    this.torchEl.setAttribute('r', this.torch.r.toFixed(1));
    if (this.level < H) {
      const L = this.level;
      let d = `M -80 ${H + 20} L -80 ${L}`;
      for (let k = 0; k <= 16; k++) {
        const x = -80 + k * 10;
        d += ` L ${x} ${(L + Math.sin(x * 0.12 + t * 3) * 2.2).toFixed(2)}`;
      }
      d += ` L 80 ${H + 20} Z`;
      this.fillEl.setAttribute('d', d);
      for (const b of this.bub) {
        b.y -= b.v * dt;
        if (b.y < L + 3) {
          b.y = H - 4;
          b.x = (Math.random() - 0.5) * 0.2 * H;
        }
        b.el.setAttribute('cx', (b.x + Math.sin(t * 3 + b.v) * 1.2).toFixed(1));
        b.el.setAttribute('cy', b.y.toFixed(1));
      }
    }
  }
}

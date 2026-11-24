export const TAU = Math.PI * 2;

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a));
export const smooth = (t) => {
  t = clamp(t);
  return t * t * (3 - 2 * t);
};
export const smoother = (t) => {
  t = clamp(t);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
/** frame-rate independent exponential smoothing */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

/** Uniform Catmull-Rom through an array of numbers, t in [0,1] */
export function crScalar(values, t) {
  const m = values.length - 1;
  const f = clamp(t) * m;
  const i = Math.min(m - 1, Math.floor(f));
  const s = f - i;
  const p0 = values[Math.max(0, i - 1)];
  const p1 = values[i];
  const p2 = values[i + 1];
  const p3 = values[Math.min(m, i + 2)];
  const s2 = s * s;
  const s3 = s2 * s;
  return 0.5 * (2 * p1 + (-p0 + p2) * s + (2 * p0 - 5 * p1 + 4 * p2 - p3) * s2 + (-p0 + 3 * p1 - 3 * p2 + p3) * s3);
}

/**
 * Sample a 2D Catmull-Rom spline through `pts` ([[x,y],...]) evenly by arc length
 * into outX/outY (Float32Arrays of equal length). Returns total length.
 */
const DENSE = 360;
const dx = new Float32Array(DENSE + 1);
const dy = new Float32Array(DENSE + 1);
const dl = new Float32Array(DENSE + 1);
export function sampleSplineByLength(pts, outX, outY) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  let total = 0;
  for (let i = 0; i <= DENSE; i++) {
    const t = i / DENSE;
    dx[i] = crScalar(xs, t);
    dy[i] = crScalar(ys, t);
    if (i > 0) total += Math.hypot(dx[i] - dx[i - 1], dy[i] - dy[i - 1]);
    dl[i] = total;
  }
  const n = outX.length;
  let j = 1;
  for (let k = 0; k < n; k++) {
    const target = (k / (n - 1)) * total;
    while (j < DENSE && dl[j] < target) j++;
    const seg = dl[j] - dl[j - 1] || 1;
    const s = clamp((target - dl[j - 1]) / seg);
    outX[k] = lerp(dx[j - 1], dx[j], s);
    outY[k] = lerp(dy[j - 1], dy[j], s);
  }
  return total;
}

export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** phones, and tablets held upright, use the compact (poster-scaled) composition */
export const COMPACT_QUERY = '(max-width: 759px), (max-width: 1023px) and (orientation: portrait)';
export const isCompact = () => typeof window !== 'undefined' && window.matchMedia(COMPACT_QUERY).matches;

export const isFinePointer = () =>
  typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

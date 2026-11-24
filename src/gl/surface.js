/*
 * The liquid surface. One analytic height function, mirrored exactly in the
 * GLSL (see shaders.js), so the bubbles, the cursor and the pixels all agree
 * on where the drink ends and the air begins.
 *
 *   ambient swell  +  tilt (phone orientation)  +  slosh (scroll / shake)
 *   +  up to 12 travelling ripple packets (touch, pour, drops)
 *
 * Height is in CSS px, positive = up.
 */
export const RIPPLES = 12;

export class Surface {
  constructor() {
    this.rip = new Float32Array(RIPPLES * 4); // x, t0, amp, (unused)
    for (let i = 0; i < RIPPLES; i++) this.rip[i * 4 + 1] = -1000;
    this.next = 0;
    this.calm = 1;
    this.tilt = 0;
    this.tiltV = 0;
    this.tiltTarget = 0;
    this.slosh = 0;
    this.sloshV = 0;
  }

  ripple(x, amp, t) {
    const k = this.next++ % RIPPLES;
    this.rip[k * 4] = x;
    this.rip[k * 4 + 1] = t;
    this.rip[k * 4 + 2] = amp;
  }

  kick(v) {
    this.sloshV += v;
  }

  update(dt) {
    dt = Math.min(dt, 1 / 30);
    // the surface tilts toward the target like real liquid: overshoot, then settle
    const a = (this.tiltTarget - this.tilt) * 38 - this.tiltV * 4.2;
    this.tiltV += a * dt;
    this.tilt += this.tiltV * dt;
    const b = -this.slosh * 26 - this.sloshV * 1.3;
    this.sloshV += b * dt;
    this.slosh += this.sloshV * dt;
    this.slosh = Math.max(-60, Math.min(60, this.slosh));
  }

  height(x, t, W) {
    const c = this.calm;
    let h = c * (Math.sin(x * 0.006 + t * 0.9) * 3 + Math.sin(x * 0.013 - t * 1.3) * 1.6 + Math.sin(x * 0.027 + t * 2.1) * 0.7);
    h += this.tilt * (x - W * 0.5);
    h += this.slosh * Math.cos((Math.PI * x) / W);
    const r = this.rip;
    for (let i = 0; i < RIPPLES; i++) {
      const tau = t - r[i * 4 + 1];
      if (tau < 0 || tau > 4.5) continue;
      const d = Math.abs(x - r[i * 4]);
      const fr = d - 240 * tau;
      h += r[i * 4 + 2] * Math.exp(-tau * 1.1) * Math.sin(fr * 0.05) * Math.exp((-fr * fr) / (1800 + 9000 * tau));
    }
    return h;
  }
}

import gsap from 'gsap';
import { clamp, damp, TAU } from '../lib/math.js';

const CRIMPS = 21; // a real crown cap has 21 crimps
const R0 = 104;
const RA = 5;
const FACE = 86;
const MOODS = {
  celebrate: { word: 'CELEBRATE', line: 'Here’s to us' },
  'catch-up': { word: 'CATCH UP', line: 'Long time, no fizz' },
  pause: { word: 'PAUSE', line: 'Five quiet minutes' },
};
const DEFAULTS = new Set(Object.values(MOODS).map((m) => m.line));

const rimR = (a) => R0 + RA * Math.cos(CRIMPS * a);

function rimPath() {
  let d = '';
  const n = CRIMPS * 12;
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * TAU;
    const r = rimR(a);
    d += `${k ? 'L' : 'M'} ${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)} `;
  }
  return `${d}Z`;
}

/** light and shadow on each crimp, lit from the upper left */
function crimpShading() {
  const step = TAU / CRIMPS;
  const out = [];
  for (let k = 0; k < CRIMPS; k++) {
    for (const half of [0, 1]) {
      const a0 = k * step + half * step * 0.5;
      const a1 = a0 + step * 0.5;
      const mid = (a0 + a1) / 2;
      const facing = Math.cos(mid - (-2.3)); // light from the upper left
      const lightSide = half === 1;
      let pts = '';
      for (let j = 0; j <= 4; j++) {
        const a = a0 + ((a1 - a0) * j) / 4;
        pts += `${(Math.cos(a) * rimR(a)).toFixed(2)},${(Math.sin(a) * rimR(a)).toFixed(2)} `;
      }
      for (let j = 4; j >= 0; j--) {
        const a = a0 + ((a1 - a0) * j) / 4;
        pts += `${(Math.cos(a) * FACE).toFixed(2)},${(Math.sin(a) * FACE).toFixed(2)} `;
      }
      const alpha = lightSide ? 0.08 + 0.2 * Math.max(0, facing) : 0.12 + 0.22 * Math.max(0, -facing);
      out.push(`<polygon points="${pts}" fill="${lightSide ? '#fff' : '#000'}" fill-opacity="${alpha.toFixed(3)}"/>`);
    }
  }
  return out.join('');
}

/*
 * 03 — Moment. Write a line, pick a mood, and it is pressed into a crown cap.
 * The cap floats in the drink, tilts toward you, and "Seal it" stamps it with
 * a burst of fizz. Save it as a PNG.
 */
export class CapChapter {
  constructor(root, { onSeal, reduced }) {
    this.root = root;
    this.onSeal = onSeal;
    this.reduced = reduced;
    this.form = root.querySelector('.capform');
    this.input = root.querySelector('input[name="line"]');
    this.status = root.querySelector('.capform__status');
    this.stage = root.querySelector('.cap-stage');
    this.cap = root.querySelector('.cap');
    this.wave = root.querySelector('.cap-wave');
    this.mood = 'celebrate';
    this.tilt = { x: 0, y: 0 };
    this.visible = false;

    this.cap.innerHTML = `
      <svg viewBox="-122 -122 244 244" aria-hidden="true">
        <defs>
          <radialGradient id="capSkirt" cx="-0.25" cy="-0.3" r="1.2">
            <stop offset="0" stop-color="#ff4a4a"/>
            <stop offset="0.55" stop-color="#d6000f"/>
            <stop offset="1" stop-color="#6e0007"/>
          </radialGradient>
          <radialGradient id="capFace" cx="0.38" cy="0.32" r="0.8">
            <stop offset="0" stop-color="#ff3b3b"/>
            <stop offset="0.6" stop-color="#e4000f"/>
            <stop offset="1" stop-color="#a5000b"/>
          </radialGradient>
          <radialGradient id="capSpec">
            <stop offset="0" stop-color="#fff" stop-opacity="0.75"/>
            <stop offset="1" stop-color="#fff" stop-opacity="0"/>
          </radialGradient>
          <path id="arcTop" d="M -66 0 A 66 66 0 0 1 66 0"/>
          <path id="arcBottom" d="M -73 0 A 73 73 0 0 0 73 0"/>
          <clipPath id="capClip"><path d="${rimPath()}"/></clipPath>
        </defs>
        <path d="${rimPath()}" fill="url(#capSkirt)"/>
        <g>${crimpShading()}</g>
        <circle r="${FACE}" fill="url(#capFace)"/>
        <circle r="${FACE}" fill="none" stroke="#5a0006" stroke-opacity="0.55" stroke-width="2.5"/>
        <circle r="${FACE - 3}" fill="none" stroke="#fff" stroke-opacity="0.18" stroke-width="1.2"/>
        <circle r="76" fill="none" stroke="#fff" stroke-opacity="0.28" stroke-width="0.8" stroke-dasharray="1.5 3"/>
        <text class="cap__line" font-size="12"><textPath href="#arcTop" startOffset="50%" text-anchor="middle"></textPath></text>
        <text class="cap__mood" font-size="9.5"><textPath href="#arcBottom" startOffset="50%" text-anchor="middle"></textPath></text>
        <text class="cap__mark" x="0" y="13" text-anchor="middle" transform="rotate(-7)">Coca-Cola</text>
        <ellipse class="cap__spec" cx="-34" cy="-44" rx="58" ry="30" transform="rotate(-28 -34 -44)" fill="url(#capSpec)" clip-path="url(#capClip)"/>
      </svg>`;
    this.lineText = this.cap.querySelector('.cap__line textPath');
    this.moodText = this.cap.querySelector('.cap__mood textPath');
    this.spec = this.cap.querySelector('.cap__spec');
    this.render();

    root.querySelectorAll('input[name="mood"]').forEach((r) =>
      r.addEventListener('change', () => {
        if (!r.checked) return;
        this.mood = r.value;
        const v = this.input.value.trim();
        if (!v || DEFAULTS.has(v)) this.input.value = MOODS[this.mood].line;
        this.render();
        if (!reduced) gsap.fromTo(this.cap, { rotate: -14 }, { rotate: 0, duration: 1, ease: 'elastic.out(1, 0.4)' });
      })
    );
    this.input.addEventListener('input', () => this.render());
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.seal();
    });
    new IntersectionObserver(([e]) => (this.visible = e.isIntersecting)).observe(this.stage);
  }

  get line() {
    return (this.input.value.trim() || 'Your line here').toUpperCase();
  }

  render() {
    this.lineText.textContent = this.line;
    const fit = this.line.length > 20 ? 10.5 : 12;
    this.lineText.parentNode.setAttribute('font-size', fit);
    this.moodText.textContent = `•  ${MOODS[this.mood].word}  •  2026  •`;
    this.cap.setAttribute('aria-label', `A red crown cap that reads “${this.input.value.trim()}”, ${MOODS[this.mood].word.toLowerCase()}`);
  }

  seal() {
    this.status.innerHTML = '';
    const done = () => {
      const r = this.cap.getBoundingClientRect();
      this.onSeal(r.left + r.width / 2, r.top + r.height / 2);
      this.ready();
    };
    if (this.reduced) {
      done();
      return;
    }
    gsap
      .timeline()
      .to(this.cap, { y: -46, scale: 0.9, rotateX: 25, duration: 0.35, ease: 'power2.out' })
      .to(this.cap, { rotateY: '+=360', duration: 0.6, ease: 'power3.inOut' }, '<0.05')
      .to(this.cap, { y: 0, scale: 1.12, rotateX: 0, duration: 0.22, ease: 'power4.in' })
      .call(() => {
        done();
        gsap.fromTo(this.wave, { scale: 0.6, opacity: 0.9 }, { scale: 1.9, opacity: 0, duration: 0.9, ease: 'expo.out' });
      })
      .to(this.cap, { scale: 1, duration: 0.9, ease: 'elastic.out(1, 0.35)' });
  }

  ready() {
    const msg = document.createElement('span');
    msg.textContent = 'Sealed.';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'link';
    btn.textContent = 'Save your cap (PNG)';
    btn.addEventListener('click', () => this.download());
    this.status.append(msg, btn);
    if (!this.reduced) gsap.from(this.status.children, { y: 12, opacity: 0, stagger: 0.08, duration: 0.6, ease: 'expo.out' });
  }

  update(t, dt, pointer) {
    if (!this.visible) return;
    const r = this.stage.getBoundingClientRect();
    let tx = 0;
    let ty = 0;
    if (pointer.active && !this.reduced) {
      tx = clamp((pointer.x - (r.left + r.width / 2)) / (r.width * 0.6), -1, 1);
      ty = clamp((pointer.y - (r.top + r.height / 2)) / (r.height * 0.6), -1, 1);
    }
    this.tilt.x = damp(this.tilt.x, tx, 5, dt);
    this.tilt.y = damp(this.tilt.y, ty, 5, dt);
    this.stage.style.setProperty('--rx', `${(-this.tilt.y * 16).toFixed(2)}deg`);
    this.stage.style.setProperty('--ry', `${(this.tilt.x * 20).toFixed(2)}deg`);
    // the highlight slides across the metal as it tilts
    const sx = -34 + this.tilt.x * 40;
    const sy = -44 + this.tilt.y * 40;
    this.spec.setAttribute('cx', sx.toFixed(1));
    this.spec.setAttribute('cy', sy.toFixed(1));
    this.spec.setAttribute('transform', `rotate(-28 ${sx.toFixed(1)} ${sy.toFixed(1)})`);
  }

  async download() {
    const S = 1024;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const bg = g.createRadialGradient(S / 2, S * 0.42, 0, S / 2, S / 2, S * 0.75);
    bg.addColorStop(0, '#6b230b');
    bg.addColorStop(1, '#120403');
    g.fillStyle = bg;
    g.fillRect(0, 0, S, S);
    g.translate(S / 2, S / 2);
    const k = (S * 0.36) / R0;
    g.scale(k, k);
    // drop shadow
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.55)';
    g.shadowBlur = 40;
    g.shadowOffsetY = 18;
    g.beginPath();
    for (let i = 0; i <= CRIMPS * 12; i++) {
      const a = (i / (CRIMPS * 12)) * TAU;
      const r = rimR(a);
      i ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    const sk = g.createRadialGradient(-26, -31, 0, -26, -31, 125);
    sk.addColorStop(0, '#ff4a4a');
    sk.addColorStop(0.55, '#d6000f');
    sk.addColorStop(1, '#6e0007');
    g.fillStyle = sk;
    g.fill();
    g.restore();
    // crimp shading
    const step = TAU / CRIMPS;
    for (let i = 0; i < CRIMPS; i++) {
      for (const half of [0, 1]) {
        const a0 = i * step + half * step * 0.5;
        const a1 = a0 + step * 0.5;
        const facing = Math.cos((a0 + a1) / 2 + 2.3);
        g.beginPath();
        for (let j = 0; j <= 4; j++) {
          const a = a0 + ((a1 - a0) * j) / 4;
          g.lineTo(Math.cos(a) * rimR(a), Math.sin(a) * rimR(a));
        }
        for (let j = 4; j >= 0; j--) {
          const a = a0 + ((a1 - a0) * j) / 4;
          g.lineTo(Math.cos(a) * FACE, Math.sin(a) * FACE);
        }
        g.closePath();
        g.fillStyle = half ? `rgba(255,255,255,${0.08 + 0.2 * Math.max(0, facing)})` : `rgba(0,0,0,${0.12 + 0.22 * Math.max(0, -facing)})`;
        g.fill();
      }
    }
    const face = g.createRadialGradient(-20, -25, 0, -10, -10, FACE * 1.1);
    face.addColorStop(0, '#ff3b3b');
    face.addColorStop(0.6, '#e4000f');
    face.addColorStop(1, '#a5000b');
    g.fillStyle = face;
    g.beginPath();
    g.arc(0, 0, FACE, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(90,0,6,0.55)';
    g.lineWidth = 2.5;
    g.stroke();
    // wordmark
    g.save();
    g.rotate((-7 * Math.PI) / 180);
    g.fillStyle = '#fff';
    g.font = '36px Norican, cursive';
    g.textAlign = 'center';
    g.fillText('Coca-Cola', 0, 13);
    g.restore();
    // text on arcs
    const arc = (text, radius, size, top) => {
      g.font = `600 ${size}px "Inter Tight Variable", "Inter Tight", sans-serif`;
      g.fillStyle = '#fff';
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      const spacing = size * 0.12;
      const widths = [...text].map((ch) => g.measureText(ch).width + spacing);
      const total = widths.reduce((a, b) => a + b, 0);
      let a = (top ? -Math.PI / 2 : Math.PI / 2) + ((top ? -1 : 1) * total) / 2 / radius;
      [...text].forEach((ch, i) => {
        const w = widths[i];
        a += ((top ? 1 : -1) * w) / 2 / radius;
        g.save();
        g.rotate(a);
        g.translate(radius, 0);
        g.rotate(top ? Math.PI / 2 : -Math.PI / 2);
        g.fillText(ch, 0, 0);
        g.restore();
        a += ((top ? 1 : -1) * w) / 2 / radius;
      });
    };
    arc(this.line, 66, this.line.length > 20 ? 10.5 : 12, true);
    arc(`•  ${MOODS[this.mood].word}  •  2026  •`, 73, 9.5, false);
    const spec = g.createRadialGradient(-34, -44, 0, -34, -44, 60);
    spec.addColorStop(0, 'rgba(255,255,255,0.55)');
    spec.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = spec;
    g.beginPath();
    g.ellipse(-34, -44, 58, 30, (-28 * Math.PI) / 180, 0, TAU);
    g.fill();
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'my-sealed-moment.png';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
}

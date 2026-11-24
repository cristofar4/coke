import gsap from 'gsap';
import { clamp } from '../lib/math.js';

/*
 * 01 — Fizz. Press and hold to shake the drink: the pressure builds, the whole
 * scene trembles and every bubble jitters. Let go and it bursts.
 */
export class FizzChapter {
  constructor(root, { onBurst, onPressure, reduced }) {
    this.root = root;
    this.btn = root.querySelector('.shake');
    this.fill = root.querySelector('.shake__fill');
    this.label = root.querySelector('.shake__label');
    this.word = root.querySelector('.pssht');
    this.onBurst = onBurst;
    this.onPressure = onPressure;
    this.reduced = reduced;
    this.pressure = 0;
    this.holding = false;
    this.len = 2 * Math.PI * 54;
    this.fill.style.strokeDasharray = `${this.len}`;
    this.fill.style.strokeDashoffset = `${this.len}`;

    const start = (e) => {
      if (e && e.button && e.button !== 0) return;
      if (e && e.pointerId !== undefined) this.btn.setPointerCapture?.(e.pointerId);
      this.holding = true;
      this.btn.classList.add('is-holding');
      this.label.textContent = 'Shaking…';
    };
    const end = () => {
      if (!this.holding) return;
      this.holding = false;
      this.btn.classList.remove('is-holding');
      this.release();
    };
    this.btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      start(e);
    });
    this.btn.addEventListener('pointerup', end);
    this.btn.addEventListener('pointercancel', end);
    this.btn.addEventListener('lostpointercapture', end);
    this.btn.addEventListener('keydown', (e) => {
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
        e.preventDefault();
        start();
      }
    });
    this.btn.addEventListener('keyup', (e) => {
      if (e.key === ' ' || e.key === 'Enter') end();
    });
    this.btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  release() {
    const p = this.pressure;
    if (p > 0.12) {
      this.onBurst(p, this.btn.getBoundingClientRect());
      this.label.textContent = 'Again?';
      if (!this.reduced) {
        gsap.killTweensOf(this.word);
        gsap.fromTo(
          this.word,
          { opacity: 0, scale: 0.7, filter: 'blur(14px)', letterSpacing: '-0.08em' },
          { opacity: 1, scale: 1 + p * 0.15, filter: 'blur(0px)', letterSpacing: '-0.02em', duration: 0.5, ease: 'expo.out' }
        );
        gsap.to(this.word, { opacity: 0, y: -40, duration: 1.4, delay: 0.9, ease: 'power2.in', onComplete: () => gsap.set(this.word, { y: 0 }) });
      }
    } else {
      this.label.textContent = 'Hold to shake';
    }
    gsap.to(this, { pressure: 0, duration: 0.35, ease: 'power2.out' });
  }

  update(dt) {
    if (this.holding) this.pressure = clamp(this.pressure + dt / 1.7, 0, 1);
    const p = this.pressure;
    this.fill.style.strokeDashoffset = `${(this.len * (1 - p)).toFixed(1)}`;
    if (p > 0.001 && !this.reduced) {
      const j = p * p * 6;
      this.btn.style.transform = `translate(${((Math.random() - 0.5) * j).toFixed(2)}px, ${((Math.random() - 0.5) * j).toFixed(2)}px) scale(${(1 - p * 0.06).toFixed(3)})`;
    } else this.btn.style.transform = '';
    this.onPressure(p);
  }
}

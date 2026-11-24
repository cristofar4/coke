import gsap from 'gsap';
import { clamp, damp, lerp, TAU } from '../lib/math.js';
import { pointer } from '../lib/field.js';
import { sound } from '../lib/sound.js';

const MOODS = {
  celebrating: { amp: 9, speed: 1.9, freq: 1.6, line: 'Here’s to the little wins.', burst: 46, power: 1.15 },
  'catching-up': { amp: 6, speed: 1.0, freq: 1.15, line: 'Pull up a chair. It’s been too long.', burst: 18, power: 0.7 },
  break: { amp: 3.2, speed: 0.45, freq: 0.8, line: 'Pause. Sip. Breathe.', burst: 7, power: 0.4 },
};
const DEFAULT_LINES = new Set(Object.values(MOODS).map((m) => m.line));

/*
 * The moment maker: mood chips reshape the card's living waves, every typed
 * character is inked onto the card, and "Create" flips it with a fizz burst
 * and hands you a downloadable PNG.
 */
export class MomentMaker {
  constructor(root, { fizz, reduced }) {
    this.root = root;
    this.fizz = fizz;
    this.reduced = reduced;
    this.form = root.querySelector('.create__form');
    this.input = root.querySelector('input[name="line"]');
    this.pill = root.querySelector('.moods__pill');
    this.status = root.querySelector('.create__status');
    this.card = root.querySelector('.moment-card');
    this.flip = root.querySelector('.moment-card__flip');
    this.stage = root.querySelector('.card-stage');
    this.lineEl = root.querySelector('.moment-card__line p');
    this.glare = root.querySelector('.moment-card__glare');
    this.paths = {
      top: root.querySelector('.w-top'),
      topLine: root.querySelector('.w-top-line'),
      bot: root.querySelector('.w-bot'),
      botLine: root.querySelector('.w-bot-line'),
    };
    this.mood = 'celebrating';
    this.p = { ...MOODS.celebrating };
    this.phase = 0;
    this.text = '';
    this.visible = false;
    this.tilt = { x: 0, y: 0, gx: 50, gy: 30 };
    new IntersectionObserver(([e]) => (this.visible = e.isIntersecting)).observe(this.card);

    this.renderLine(this.input.value, Infinity);
    this.drawWaves(0);

    root.querySelectorAll('input[name="mood"]').forEach((r) =>
      r.addEventListener('change', () => {
        if (r.checked) this.setMood(r.value, true);
      })
    );
    this.input.addEventListener('input', () => this.renderLine(this.input.value));
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.create();
    });
    requestAnimationFrame(() => this.movePill(false));
  }

  layout() {
    this.movePill(false);
  }

  movePill(animate = true) {
    const checked = this.root.querySelector('input[name="mood"]:checked');
    if (!checked || !this.pill) return;
    const label = checked.closest('.mood');
    const x = label.offsetLeft;
    const y = label.offsetTop;
    const props = { x, y, width: label.offsetWidth, height: label.offsetHeight };
    if (animate && !this.reduced) gsap.to(this.pill, { ...props, duration: 0.55, ease: 'elastic.out(0.9, 0.7)' });
    else gsap.set(this.pill, props);
  }

  setMood(mood, fromUser) {
    this.mood = mood;
    this.card.dataset.mood = mood;
    this.movePill(true);
    const m = MOODS[mood];
    const current = this.input.value.trim();
    if (!current || DEFAULT_LINES.has(current)) {
      this.input.value = m.line;
      this.renderLine(m.line, 0);
    }
    if (fromUser) {
      const r = this.card.getBoundingClientRect();
      if (!this.reduced) this.fizz.burst(r.left + r.width * 0.5, r.top + r.height * 0.45, m.burst, m.power);
      sound.fizz(m.power * 0.6);
      if (!this.reduced) gsap.fromTo(this.flip, { scale: 0.97 }, { scale: 1, duration: 0.8, ease: 'elastic.out(1, 0.4)' });
    }
  }

  renderLine(text, animateFrom) {
    const prev = this.text;
    if (animateFrom === undefined) {
      let i = 0;
      while (i < prev.length && i < text.length && prev[i] === text[i]) i++;
      animateFrom = i;
    }
    this.text = text;
    const p = this.lineEl;
    p.textContent = '';
    const shown = text.trim() ? text : 'Write a line…';
    p.classList.toggle('is-empty', !text.trim());
    const len = shown.length;
    p.style.setProperty('--fit', len < 22 ? 1 : len < 32 ? 0.86 : 0.74);
    let idx = 0;
    for (const part of shown.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        p.append(document.createTextNode(' '));
        idx += part.length;
        continue;
      }
      const w = document.createElement('span');
      w.className = 'w';
      for (const ch of part) {
        const c = document.createElement('span');
        c.className = 'c';
        c.textContent = ch;
        if (idx >= animateFrom && !this.reduced) {
          c.classList.add('ink');
          c.style.animationDelay = `${Math.min(0.6, (idx - animateFrom) * 0.022).toFixed(3)}s`;
        }
        w.append(c);
        idx++;
      }
      p.append(w);
    }
  }

  wave(x, base, slope, amp, ph, freq) {
    return base + slope * (x / 400) + Math.sin((x / 400) * TAU * freq + ph) * amp + Math.sin((x / 400) * TAU * freq * 2.3 - ph * 0.7) * amp * 0.25;
  }

  pathsAt(phase, p) {
    const { amp, freq } = p;
    let top = 'M0 0 H400';
    let topLine = '';
    let bot = 'M0 250';
    let botLine = '';
    const pts = 24;
    for (let i = pts; i >= 0; i--) {
      const x = (i / pts) * 400;
      top += ` L${x.toFixed(1)} ${this.wave(x, 66, -30, amp, phase, freq).toFixed(2)}`;
    }
    for (let i = 0; i <= pts; i++) {
      const x = (i / pts) * 400;
      const y = this.wave(x, 52, -32, amp * 0.9, phase + 0.5, freq);
      topLine += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(2)} `;
      bot += ` L${x.toFixed(1)} ${this.wave(x, 222, -42, amp, -phase + 1.2, freq).toFixed(2)}`;
      botLine += `${i ? 'L' : 'M'}${x.toFixed(1)} ${this.wave(x, 236, -44, amp * 0.8, -phase + 1.7, freq).toFixed(2)} `;
    }
    top += ' Z';
    bot += ' L400 250 Z';
    return { top, topLine, bot, botLine };
  }

  drawWaves(phase) {
    const d = this.pathsAt(phase, this.p);
    this.paths.top.setAttribute('d', d.top);
    this.paths.topLine.setAttribute('d', d.topLine);
    this.paths.bot.setAttribute('d', d.bot);
    this.paths.botLine.setAttribute('d', d.botLine);
  }

  update(t, dt) {
    if (!this.visible) return;
    const m = MOODS[this.mood];
    for (const k of ['amp', 'speed', 'freq']) this.p[k] = damp(this.p[k], m[k], 3, dt);
    if (!this.reduced) this.phase += dt * this.p.speed;
    this.drawWaves(this.phase);

    // 3D tilt + glare toward the pointer
    const r = this.stage.getBoundingClientRect();
    let tx = 0;
    let ty = 0;
    let gx = 50;
    let gy = 30;
    if (pointer.active && !this.reduced) {
      const nx = (pointer.x - (r.left + r.width / 2)) / (r.width * 0.75);
      const ny = (pointer.y - (r.top + r.height / 2)) / (r.height * 0.75);
      if (Math.abs(nx) < 1.6 && Math.abs(ny) < 1.6) {
        tx = clamp(nx, -1, 1);
        ty = clamp(ny, -1, 1);
        gx = 50 + tx * 45;
        gy = 30 + ty * 45;
      }
    }
    this.tilt.x = damp(this.tilt.x, tx, 6, dt);
    this.tilt.y = damp(this.tilt.y, ty, 6, dt);
    this.tilt.gx = damp(this.tilt.gx, gx, 6, dt);
    this.tilt.gy = damp(this.tilt.gy, gy, 6, dt);
    this.card.style.transform = `rotateY(${(this.tilt.x * 11).toFixed(2)}deg) rotateX(${(-this.tilt.y * 9).toFixed(2)}deg)`;
    this.glare.style.setProperty('--gx', `${this.tilt.gx.toFixed(1)}%`);
    this.glare.style.setProperty('--gy', `${this.tilt.gy.toFixed(1)}%`);
  }

  create() {
    const m = MOODS[this.mood];
    const r = this.card.getBoundingClientRect();
    this.status.innerHTML = '';
    if (this.reduced) {
      this.ready();
      return;
    }
    const tl = gsap.timeline();
    tl.to(this.flip, { rotateY: 180, scale: 0.92, duration: 0.45, ease: 'power3.in' })
      .call(() => {
        this.fizz.burst(r.left + r.width / 2, r.top + r.height / 2, m.burst + 30, m.power + 0.3, { spread: Math.PI });
        sound.fizz(1);
      })
      .to(this.flip, { rotateY: 360, scale: 1, duration: 0.9, ease: 'elastic.out(0.8, 0.45)' })
      .set(this.flip, { rotateY: 0 })
      .call(() => this.ready());
  }

  ready() {
    this.status.innerHTML = '';
    const msg = document.createElement('span');
    msg.textContent = 'Your moment is ready.';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'link-arrow link-arrow--small';
    btn.innerHTML = 'Save the card <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v14m0 0-5-5m5 5 5-5"/></svg>';
    btn.addEventListener('click', () => this.download());
    this.status.append(msg, btn);
    if (!this.reduced) gsap.from(this.status.children, { y: 10, opacity: 0, stagger: 0.08, duration: 0.5, ease: 'power3.out' });
  }

  async download() {
    const S = 3;
    const W = 400 * S;
    const H = 250 * S;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    const radius = 26;
    g.save();
    g.beginPath();
    g.roundRect(0, 0, W, H, radius);
    g.clip();
    g.fillStyle = '#fbfaf8';
    g.fillRect(0, 0, W, H);
    g.scale(S, S);
    const d = this.pathsAt(this.phase, this.p);
    g.fillStyle = '#e4101f';
    g.fill(new Path2D(d.top));
    g.fill(new Path2D(d.bot));
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = 2.4;
    g.stroke(new Path2D(d.topLine));
    g.lineWidth = 2;
    g.stroke(new Path2D(d.botLine));
    g.restore();
    g.fillStyle = '#fff';
    g.font = `${34 * S}px Norican, cursive`;
    g.textBaseline = 'alphabetic';
    g.fillText('Coca-Cola', 22 * S, 42 * S);
    g.fillStyle = '#1c1c1c';
    const text = this.text.trim() || 'Here’s to the little wins.';
    const fit = text.length < 22 ? 1 : text.length < 32 ? 0.86 : 0.74;
    const fs = 31 * fit * S;
    g.font = `italic 600 ${fs}px "Cormorant Garamond", Georgia, serif`;
    g.textAlign = 'center';
    const lines = wrap(g, text, 300 * S);
    const lh = fs * 1.12;
    const y0 = 136 * S - ((lines.length - 1) * lh) / 2;
    lines.forEach((ln, i) => g.fillText(ln, W / 2, y0 + i * lh));
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'my-little-moment.png';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
}

function wrap(g, text, max) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (g.measureText(t).width > max && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

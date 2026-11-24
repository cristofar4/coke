/*
 * Synthesised carbonation — no audio files. Filtered noise plus a scatter of
 * micro-clicks makes a convincing fizz; a high-passed noise burst makes the
 * "pssht" of a can. Off by default; the visitor opts in.
 */
let ac = null;
let noise = null;
let master = null;
let enabled = false;
let lastPop = 0;

function ensure() {
  if (ac) return ac;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ac = new AC();
  master = ac.createGain();
  master.gain.value = 0.5;
  master.connect(ac.destination);
  const len = ac.sampleRate * 2;
  noise = ac.createBuffer(1, len, ac.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return ac;
}

function noiseBurst({ at = 0, dur = 0.4, freq = 4000, q = 0.8, type = 'bandpass', gain = 0.3, attack = 0.005 }) {
  const t = ac.currentTime + at;
  const src = ac.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.05);
  return f;
}

export const sound = {
  get enabled() {
    return enabled;
  },
  set(on) {
    enabled = on;
    if (on) {
      ensure();
      ac && ac.resume();
    }
    try {
      localStorage.setItem('ftf-sound', on ? '1' : '0');
    } catch (e) {
      /* storage unavailable */
    }
  },
  restore() {
    // never auto-enable audio; just remember the preference for the toggle label
    try {
      return localStorage.getItem('ftf-sound') === '1';
    } catch (e) {
      return false;
    }
  },
  fizz(intensity = 1) {
    if (!enabled || !ensure()) return;
    noiseBurst({ dur: 0.25 + 0.5 * intensity, freq: 5200, q: 0.6, gain: 0.08 * intensity, attack: 0.01 });
    const n = (18 + 40 * intensity) | 0;
    for (let i = 0; i < n; i++) {
      noiseBurst({ at: Math.random() * (0.25 + 0.7 * intensity), dur: 0.012 + Math.random() * 0.02, freq: 2500 + Math.random() * 6000, q: 3, gain: 0.05 + Math.random() * 0.08 });
    }
  },
  pssht() {
    if (!enabled || !ensure()) return;
    const f = noiseBurst({ dur: 0.75, freq: 1800, type: 'highpass', q: 0.5, gain: 0.22, attack: 0.004 });
    f.frequency.setValueAtTime(900, ac.currentTime);
    f.frequency.exponentialRampToValueAtTime(5000, ac.currentTime + 0.5);
    this.fizz(0.8);
  },
  pop(r = 2) {
    if (!enabled || !ac) return;
    const now = performance.now();
    if (now - lastPop < 45) return;
    lastPop = now;
    noiseBurst({ dur: 0.02, freq: 3000 + 9000 / (r + 1), q: 4, gain: 0.03 });
  },
  /** a low rumble that follows how hard the bottle is being shaken (0..1) */
  rumble(p) {
    if (!ac) return;
    if (!enabled) p = 0;
    if (!this._rum && p > 0) {
      const src = ac.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 220;
      f.Q.value = 3;
      const g = ac.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(master);
      src.start();
      this._rum = { src, f, g };
    }
    if (this._rum) {
      const now = ac.currentTime;
      this._rum.g.gain.setTargetAtTime(p * 0.55, now, 0.05);
      this._rum.f.frequency.setTargetAtTime(160 + p * 520, now, 0.05);
      if (p <= 0.001) {
        const r = this._rum;
        this._rum = null;
        setTimeout(() => r.src.stop(), 300);
      }
    }
  },
  pour(seconds = 2.6) {
    if (!enabled || !ensure()) return;
    const f = noiseBurst({ dur: seconds, freq: 700, type: 'bandpass', q: 0.7, gain: 0.16, attack: 0.25 });
    f.frequency.setValueAtTime(500, ac.currentTime);
    f.frequency.linearRampToValueAtTime(1400, ac.currentTime + seconds);
    this.fizz(0.7);
  },
  pluck(strength = 1) {
    if (!enabled || !ensure()) return;
    // a soft satin "whump" — low filtered noise sweep
    const f = noiseBurst({ dur: 0.35, freq: 300, type: 'lowpass', q: 1.2, gain: 0.25 * strength, attack: 0.01 });
    f.frequency.setValueAtTime(900, ac.currentTime);
    f.frequency.exponentialRampToValueAtTime(160, ac.currentTime + 0.3);
  },
};

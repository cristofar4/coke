import { clamp, TAU } from './math.js';

/*
 * The ribbon field: every ribbon on the page registers here. Each frame the
 * pointer is tested against all visible ribbons so that you can brush them,
 * flick them, grab them and pull — the ribbons answer with real waves.
 */

export const pointer = {
  x: -1e4,
  y: -1e4,
  vx: 0,
  vy: 0,
  _px: -1e4,
  _py: -1e4,
  down: false,
  type: 'mouse',
  active: false,
  downX: 0,
  downY: 0,
};

const items = [];
const listeners = { hover: [], pluck: [], grab: [] };
let grab = null;
let hovered = null;
const tmp = { x: 0, y: 0, nx: 0, ny: 0 };

export function onField(evt, fn) {
  listeners[evt].push(fn);
}
const emit = (evt, ...a) => listeners[evt].forEach((f) => f(...a));

export function registerRibbon(item) {
  // item: { ribbon, el, active(), gain, twistGain, grabbable, maxPull, name }
  items.push({ gain: 1, twistGain: 1, grabbable: true, maxPull: 140, ...item, rect: null });
  return item;
}

const isInteractive = (el) => !!(el && el.closest && el.closest('a,button,input,textarea,select,label,[data-no-grab]'));

export function initPointer() {
  window.addEventListener(
    'pointermove',
    (e) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.type = e.pointerType;
      pointer.active = true;
      pointer.target = e.target;
    },
    { passive: true }
  );
  window.addEventListener('pointerdown', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.downX = e.clientX;
    pointer.downY = e.clientY;
    pointer.down = true;
    pointer.type = e.pointerType;
    pointer.active = true;
    if (isInteractive(e.target)) return;
    const h = hitAll(e.clientX, e.clientY);
    if (!h) return;
    if (e.pointerType === 'mouse' && e.button === 0 && h.item.grabbable) {
      e.preventDefault();
      const r = h.item.ribbon;
      const disp = r.sim.sample(h.hit.u);
      grab = { item: h.item, u: h.hit.u, off: h.hit.off, startDisp: disp, t: performance.now(), moved: 0 };
      document.documentElement.classList.add('is-grabbing');
      emit('grab', true, h.item);
    } else {
      // touch / pen: a tap ripples the ribbon
      h.item.ribbon.sim.impulse(h.hit.u, (h.hit.off > 0 ? -1 : 1) * 260, 0.05);
      emit('pluck', h.item, e.clientX, e.clientY, 0.7);
    }
  });
  const release = (e) => {
    pointer.down = false;
    if (!grab) return;
    const g = grab;
    grab = null;
    g.item.ribbon.sim.grab = null;
    document.documentElement.classList.remove('is-grabbing');
    emit('grab', false, g.item);
    const quick = performance.now() - g.t < 260 && g.moved < 12;
    if (quick) {
      // a click on a ribbon plucks it like a string
      g.item.ribbon.sim.impulse(g.u, (g.off > 0 ? -1 : 1) * 420, 0.045);
      g.item.ribbon.sim.impulseTwist(g.u, 2.2 * (g.off > 0 ? 1 : -1), 0.06);
      emit('pluck', g.item, e.clientX ?? pointer.x, e.clientY ?? pointer.y, 1);
    } else {
      emit('pluck', g.item, pointer.x, pointer.y, 0.55);
    }
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  document.documentElement.addEventListener('pointerleave', () => {
    pointer.active = false;
    pointer.x = pointer.y = -1e4;
  });
}

function hitAll(cx, cy) {
  for (let k = items.length - 1; k >= 0; k--) {
    const it = items[k];
    if (!it.active()) continue;
    const r = it.el.getBoundingClientRect();
    it.rect = r;
    const hit = it.ribbon.hit(cx - r.left, cy - r.top, 6);
    if (hit) return { item: it, hit };
  }
  return null;
}

let lastHover = null;
export function updateField(dt, t, scrollVel = 0) {
  // pointer velocity (smoothed)
  if (pointer._px > -1e3 && pointer.x > -1e3) {
    const ivx = (pointer.x - pointer._px) / Math.max(dt, 1 / 240);
    const ivy = (pointer.y - pointer._py) / Math.max(dt, 1 / 240);
    const a = 1 - Math.exp(-dt * 30);
    pointer.vx += (ivx - pointer.vx) * a;
    pointer.vy += (ivy - pointer.vy) * a;
  } else {
    pointer.vx = pointer.vy = 0;
  }
  pointer._px = pointer.x;
  pointer._py = pointer.y;

  const fpsNorm = dt * 60;
  hovered = null;
  // scrolling moves content under a still pointer: refresh what it is over
  if (pointer.active && Math.abs(scrollVel) > 0.05 && pointer.x > -1e3) {
    pointer.target = document.elementFromPoint(pointer.x, pointer.y) || pointer.target;
  }
  const overUi = isInteractive(pointer.target);
  for (let k = items.length - 1; k >= 0; k--) {
    const it = items[k];
    if (!it.active()) continue;
    const r = (it.rect = it.el.getBoundingClientRect());
    const sim = it.ribbon.sim;

    // scroll "wind": fast scrolling makes every ribbon flutter
    if (Math.abs(scrollVel) > 0.2) {
      const wv = clamp(scrollVel, -60, 60);
      sim.force((u) => Math.sin(TAU * (u * 1.25) - t * 3.1) * wv * 9 * it.gain, dt);
      sim.wv[(sim.n * 0.5) | 0] += wv * 0.0008 * fpsNorm;
    }

    if (grab && grab.item === it) {
      const lx = pointer.x - r.left;
      const ly = pointer.y - r.top;
      it.ribbon.rest(grab.u, tmp);
      let target = (lx - tmp.x) * tmp.nx + (ly - tmp.y) * tmp.ny - grab.off;
      target = clamp(target, -it.maxPull, it.maxPull);
      sim.grab = { u: grab.u, target, strength: 1400 };
      grab.moved = Math.max(grab.moved, Math.hypot(pointer.x - pointer.downX, pointer.y - pointer.downY));
      hovered = it;
      continue;
    }

    if (!pointer.active || hovered || (overUi && pointer.target.closest('[data-no-grab]'))) continue;
    const lx = pointer.x - r.left;
    const ly = pointer.y - r.top;
    const hit = it.ribbon.hit(lx, ly, 4);
    if (!hit) continue;
    if (!overUi) hovered = it;
    // the pointer brushes the fabric: push along the normal, twist when catching an edge
    const vn = pointer.vx * hit.nx + pointer.vy * hit.ny;
    const edge = hit.half > 1 ? clamp(hit.off / hit.half, -1, 1) : 0;
    sim.impulse(hit.u, vn * 0.016 * it.gain * fpsNorm, 0.05);
    sim.impulseTwist(hit.u, vn * 0.00009 * edge * it.twistGain * fpsNorm, 0.07);
  }
  if (hovered !== lastHover) {
    emit('hover', hovered);
    lastHover = hovered;
  }
}

export const isGrabbing = () => !!grab;

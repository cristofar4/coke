import { onField } from '../lib/field.js';
import { damp, isFinePointer } from '../lib/math.js';

/* A bubble cursor: a dot, and a lagging ring that reacts to what it is over. */
export function initCursor() {
  const el = document.querySelector('.cursor');
  if (!el || !isFinePointer()) return { update() {} };
  document.documentElement.classList.add('has-cursor');
  const ring = el.querySelector('.cursor__ring');
  const dot = el.querySelector('.cursor__dot');
  const label = el.querySelector('.cursor__label');
  let x = -100;
  let y = -100;
  let rx = -100;
  let ry = -100;
  let over = '';
  let ribbon = false;
  let grabbing = false;
  let seen = false;

  const refresh = () => {
    let state = over;
    if (!state && ribbon) state = 'pull';
    if (grabbing) state = 'grab';
    el.dataset.state = state;
    label.textContent = state === 'pull' ? 'Pull' : state === 'grab' ? '' : '';
  };

  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      x = e.clientX;
      y = e.clientY;
      if (!seen) {
        rx = x;
        ry = y;
        seen = true;
        el.classList.add('is-visible');
      }
    },
    { passive: true }
  );
  document.addEventListener('pointerover', (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.closest('input[type="text"], textarea')) over = 'text';
    else if (t.closest('a, button, label, [data-cursor="link"]')) over = 'link';
    else over = '';
    refresh();
  });
  document.documentElement.addEventListener('pointerleave', () => el.classList.remove('is-visible'));
  document.documentElement.addEventListener('pointerenter', () => seen && el.classList.add('is-visible'));
  window.addEventListener('pointerdown', () => el.classList.add('is-down'));
  window.addEventListener('pointerup', () => el.classList.remove('is-down'));
  onField('hover', (it) => {
    ribbon = !!(it && it.grabbable);
    refresh();
  });
  onField('grab', (on) => {
    grabbing = on;
    refresh();
  });

  return {
    update(dt) {
      rx = damp(rx, x, 16, dt);
      ry = damp(ry, y, 16, dt);
      dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      ring.style.transform = `translate3d(${rx.toFixed(1)}px, ${ry.toFixed(1)}px, 0)`;
    },
  };
}

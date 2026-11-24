/*
 * Paint the real <h1> (word by word, using its live layout and font) into a
 * canvas, so the drink shader can show it half in the air and half refracted
 * under the surface. The DOM heading stays for screen readers and selection.
 */
export function paintTitle(el, width, height, dpr) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(width * dpr));
  c.height = Math.max(1, Math.round(height * dpr));
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'alphabetic';
  const sy = window.scrollY;
  for (const w of el.querySelectorAll('.w')) {
    const cs = getComputedStyle(w);
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
    const r = w.getBoundingClientRect();
    const m = ctx.measureText(w.textContent);
    // an inline box is exactly the font's ascent + descent tall
    const asc = m.fontBoundingBoxAscent ?? parseFloat(cs.fontSize) * 0.8;
    const desc = m.fontBoundingBoxDescent ?? parseFloat(cs.fontSize) * 0.2;
    const baseline = r.top + sy + (r.height - (asc + desc)) / 2 + asc;
    ctx.fillText(w.textContent, r.left, baseline);
  }
  return c;
}

/** the y (page px) where the surface should cut the headline: through its last line */
export function titleWaterline(el, k = 0.6) {
  const words = [...el.querySelectorAll('.w')];
  const last = words[words.length - 1] || el;
  const r = last.getBoundingClientRect();
  return r.top + window.scrollY + r.height * k;
}

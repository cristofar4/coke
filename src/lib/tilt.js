import { clamp } from './math.js';

/*
 * Tilt your phone and the drink stays level with the world — so on screen the
 * surface leans the other way, overshoots and settles. A shake sloshes it.
 */
export function createTilt(surface) {
  const DOE = typeof window !== 'undefined' ? window.DeviceOrientationEvent : undefined;
  const needsPermission = !!(DOE && typeof DOE.requestPermission === 'function');
  let on = false;
  const orient = (e) => {
    if (e.gamma == null) return;
    const g = (clamp(e.gamma, -70, 70) * Math.PI) / 180;
    surface.tiltTarget = clamp(Math.tan(g) * 0.9, -0.5, 0.5);
  };
  const motion = (e) => {
    const a = e.acceleration;
    if (a && a.x) surface.kick(clamp(-a.x * 3, -40, 40));
  };
  const start = () => {
    if (on) return;
    on = true;
    window.addEventListener('deviceorientation', orient);
    window.addEventListener('devicemotion', motion);
  };
  return {
    supported: !!DOE,
    needsPermission,
    get on() {
      return on;
    },
    async enable() {
      if (!DOE) return false;
      if (needsPermission) {
        try {
          if ((await DOE.requestPermission()) !== 'granted') return false;
        } catch (e) {
          return false;
        }
      }
      start();
      return true;
    },
  };
}

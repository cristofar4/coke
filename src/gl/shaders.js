// GLSL ES 1.00 — runs on WebGL1 everywhere.

export const fullscreenVert = /* glsl */ `
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const drinkFrag = /* glsl */ `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 uView;       // viewport, css px
uniform float uDpr;
uniform float uTime;
uniform float uScroll;    // css px
uniform float uSurf;      // page y of the surface at rest (css px)
uniform float uCalm;
uniform float uTilt;
uniform float uSlosh;
uniform vec4 uRip[12];
uniform sampler2D uTitle;
uniform vec2 uTitleSize;  // css px covered by the title texture
uniform float uTitleA;
uniform float uPour;      // 0..1 stream opacity
uniform float uPourX;
uniform float uPourTop;   // screen y where the stream begins
uniform float uFlash;
uniform float uBottom;    // page y of the bottom of the glass
uniform float uGlow;
uniform float uDark;      // extra darkness (the "in the dark" chapter)
uniform vec2 uTorch;      // screen px of the torch (dark chapter)

float sq(float x) { return x * x; }

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

float surfH(float x) {
  float t = uTime;
  float h = uCalm * (sin(x * 0.006 + t * 0.9) * 3.0 + sin(x * 0.013 - t * 1.3) * 1.6 + sin(x * 0.027 + t * 2.1) * 0.7);
  h += uTilt * (x - uView.x * 0.5);
  h += uSlosh * cos(3.14159265 * x / uView.x);
  for (int i = 0; i < 12; i++) {
    vec4 r = uRip[i];
    float tau = t - r.y;
    if (tau < 0.0 || tau > 4.5) continue;
    float d = abs(x - r.x);
    float fr = d - 240.0 * tau;
    h += r.z * exp(-tau * 1.1) * sin(fr * 0.05) * exp(-fr * fr / (1800.0 + 9000.0 * tau));
  }
  return h;
}

// tileable water caustics (after the classic joltz0r / Dave Hoskins shader)
float caustic(vec2 uv) {
  vec2 p = mod(uv * 6.28318, 6.28318) - 250.0;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float t = uTime * 0.35 * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.0);
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uView.y * uDpr - gl_FragCoord.y) / uDpr; // css px, y down
  float pageY = px.y + uScroll;
  float sY = uSurf - surfH(px.x);
  float d = pageY - sY; // > 0 means under the surface
  float dd = max(d, 0.0);

  // ---- the air above the drink: warm, dark studio
  vec3 air = mix(vec3(0.03, 0.012, 0.01), vec3(0.13, 0.05, 0.03), smoothstep(-900.0, 0.0, d));
  float g = exp(-sq((px.x - uView.x * 0.5) / (uView.x * 0.42)) - sq(d / 380.0));
  air += vec3(0.34, 0.12, 0.04) * g * uGlow;

  // ---- the drink: amber under the light, cola-black in the deep
  vec3 deep = mix(vec3(0.36, 0.11, 0.035), vec3(0.085, 0.025, 0.013), smoothstep(0.0, 1100.0, dd));
  deep = mix(deep, vec3(0.045, 0.014, 0.01), smoothstep(1100.0, 4600.0, dd));
  float ray = fbm(vec2(px.x * 0.0042 + dd * 0.0008, uTime * 0.05));
  ray = smoothstep(0.45, 0.85, ray) * exp(-dd / 1500.0);
  deep += vec3(0.45, 0.17, 0.05) * ray * 0.5;
  float c = caustic(vec2(px.x, pageY) * 0.0016);
  deep += vec3(1.0, 0.55, 0.22) * c * 0.2 * exp(-dd / 520.0);
  deep += vec3(0.6, 0.24, 0.08) * exp(-dd / 55.0) * 0.45;
  // slow drifting particles of light, deep down
  float mote = noise(vec2(px.x * 0.02, pageY * 0.02 - uTime * 0.6));
  deep += vec3(0.25, 0.09, 0.03) * smoothstep(0.82, 0.98, mote) * 0.25 * smoothstep(200.0, 900.0, dd);

  // ---- the bottom of the glass: a thick refracting edge with red light coming through
  float gb = pageY - uBottom;
  float glass = exp(-sq((gb + 6.0) / 3.5));
  deep += vec3(1.0, 0.8, 0.6) * glass * 0.45 + vec3(0.9, 0.08, 0.05) * exp(-abs(gb + 40.0) / 55.0) * 0.35;
  // red light through the bottom of the glass: the label is close
  deep += vec3(0.55, 0.03, 0.04) * exp(-max(-gb, 0.0) / 420.0) * 0.55;

  // ---- the headline, half in the air and half in the drink
  vec2 tuv = vec2(px.x, pageY) / uTitleSize;
  float tA = texture2D(uTitle, tuv).a * uTitleA;
  vec2 wob = vec2(sin(pageY * 0.045 + uTime * 2.2) * 3.5 + (noise(vec2(px.x * 0.02, pageY * 0.02 + uTime)) - 0.5) * 7.0,
                  sin(px.x * 0.03 + uTime * 1.7) * 2.5) * smoothstep(0.0, 24.0, dd);
  float tB = texture2D(uTitle, tuv + wob / uTitleSize).a * uTitleA;

  vec3 col;
  if (d < 0.0) {
    col = mix(air, vec3(1.0, 0.95, 0.89), tA);
  } else {
    col = deep;
    col = mix(col, vec3(1.0, 0.68, 0.4), tB * 0.5 * exp(-dd / 380.0));
  }

  // ---- foam and the bright meniscus line
  float foamT = 8.0 + 8.0 * noise(vec2(px.x * 0.04, uTime * 0.4));
  float foam = (1.0 - smoothstep(foamT * 0.3, foamT, d)) * smoothstep(-1.0, 0.5, d);
  float cells = noise(vec2(px.x * 0.28, d * 0.4 + uTime * 0.3));
  vec3 foamCol = mix(vec3(0.62, 0.38, 0.22), vec3(0.98, 0.88, 0.72), cells);
  col = mix(col, foamCol, foam * 0.8);
  col += vec3(1.0, 0.85, 0.66) * exp(-d * d / 1.4) * 0.55;

  // ---- the pour
  if (uPour > 0.001) {
    float w = 11.0 + 2.5 * sin(px.y * 0.07 - uTime * 28.0) + 2.0 * noise(vec2(px.y * 0.09 - uTime * 22.0, 3.0));
    float dx = (px.x - uPourX) / w;
    float inside = step(abs(dx), 1.0) * step(uPourTop, px.y) * step(d, 1.0);
    float shade = sqrt(max(0.0, 1.0 - dx * dx));
    vec3 sc = mix(vec3(0.14, 0.045, 0.02), vec3(0.78, 0.34, 0.12), shade * 0.85);
    sc += vec3(1.0, 0.9, 0.72) * pow(max(0.0, 1.0 - abs(dx + 0.42) * 4.0), 3.0) * 0.55;
    sc += vec3(0.5, 0.2, 0.06) * smoothstep(0.7, 1.0, noise(vec2(dx * 2.0, px.y * 0.05 - uTime * 18.0))) * 0.4;
    col = mix(col, sc, inside * smoothstep(1.0, 0.82, abs(dx)) * uPour);
  }

  // ---- "in the dark": the chapter dims everything but a warm torch
  if (uDark > 0.001) {
    float tl = exp(-sq(length(px - uTorch) / 260.0));
    col *= mix(1.0, 0.18 + 0.9 * tl, uDark);
  }

  col += vec3(1.0, 0.72, 0.42) * uFlash * 0.4;
  vec2 vv = px / uView - 0.5;
  col *= 1.0 - dot(vv, vv) * 0.6;
  // a whisper of grain, so the gradients never band
  col += (hash(px + fract(uTime) * 91.7) - 0.5) * 0.018;
  gl_FragColor = vec4(col, 1.0);
}
`;

export const bubbleVert = /* glsl */ `
attribute vec4 aP; // x, y (css px), radius (negative = a popping ring), alpha
uniform vec2 uView;
uniform float uDpr;
varying float vA;
varying float vRing;
void main() {
  gl_Position = vec4(aP.x / uView.x * 2.0 - 1.0, 1.0 - aP.y / uView.y * 2.0, 0.0, 1.0);
  float r = abs(aP.z);
  gl_PointSize = (r * 2.0 + 2.0) * uDpr;
  vA = aP.w;
  vRing = aP.z < 0.0 ? 1.0 : 0.0;
}
`;

export const bubbleFrag = /* glsl */ `
precision mediump float;
varying float vA;
varying float vRing;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r = length(c);
  if (r > 1.0) discard;
  vec3 col = vec3(1.0, 0.84, 0.64);
  float a;
  if (vRing > 0.5) {
    a = smoothstep(0.62, 0.86, r) * (1.0 - smoothstep(0.9, 1.0, r)) * vA;
  } else {
    float rim = smoothstep(0.5, 0.9, r) * (1.0 - smoothstep(0.9, 1.0, r));
    float hi = 1.0 - smoothstep(0.0, 0.3, length(c - vec2(-0.34, -0.38)));
    a = (rim * 0.75 + hi * 0.95 + 0.06) * vA;
    col = mix(col, vec3(1.0), hi);
  }
  gl_FragColor = vec4(col * a, a);
}
`;

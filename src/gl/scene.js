import { fullscreenVert, drinkFrag, bubbleVert, bubbleFrag } from './shaders.js';
import { RIPPLES } from './surface.js';

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(`shader: ${log}`);
  }
  return s;
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`link: ${gl.getProgramInfoLog(p)}`);
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    const name = info.name.replace(/\[0\]$/, '');
    u[name] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}

/*
 * One fixed full-screen canvas behind the page. Pass 1 paints the drink (air,
 * surface, foam, light, the half-submerged headline, the pour). Pass 2 draws
 * every bubble as a lit point sprite.
 */
export function createScene(canvas, { maxBubbles }) {
  let gl;
  try {
    gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    gl = null;
  }
  if (!gl) return null;

  let drink;
  let bub;
  try {
    drink = program(gl, fullscreenVert, drinkFrag);
    bub = program(gl, bubbleVert, bubbleFrag);
  } catch (e) {
    console.warn(e);
    return null;
  }

  const tri = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, tri);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(drink.p, 'aPos');

  const bubbleBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bubbleBuf);
  gl.bufferData(gl.ARRAY_BUFFER, maxBubbles * 16, gl.DYNAMIC_DRAW);
  const aP = gl.getAttribLocation(bub.p, 'aP');

  const titleTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, titleTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  let titleSize = [1, 1];

  let W = 1;
  let H = 1;
  let dpr = 1;
  let lost = false;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    lost = true;
  });

  return {
    gl,
    resize(w, h, ratio) {
      W = w;
      H = h;
      dpr = ratio;
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      gl.viewport(0, 0, canvas.width, canvas.height);
    },
    setTitle(source, cssW, cssH) {
      gl.bindTexture(gl.TEXTURE_2D, titleTex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      titleSize = [cssW, cssH];
    },
    render(s, bubbles) {
      if (lost) return;
      // ---- pass 1: the drink
      gl.disable(gl.BLEND);
      gl.useProgram(drink.p);
      const u = drink.u;
      gl.uniform2f(u.uView, W, H);
      gl.uniform1f(u.uDpr, dpr);
      gl.uniform1f(u.uTime, s.t);
      gl.uniform1f(u.uScroll, s.scroll);
      gl.uniform1f(u.uSurf, s.surf);
      gl.uniform1f(u.uCalm, s.surface.calm);
      gl.uniform1f(u.uTilt, s.surface.tilt);
      gl.uniform1f(u.uSlosh, s.surface.slosh);
      gl.uniform4fv(u.uRip, s.surface.rip);
      gl.uniform2f(u.uTitleSize, titleSize[0], titleSize[1]);
      gl.uniform1f(u.uTitleA, s.titleA);
      gl.uniform1f(u.uPour, s.pour);
      gl.uniform1f(u.uPourX, s.pourX);
      gl.uniform1f(u.uPourTop, s.pourTop);
      gl.uniform1f(u.uFlash, s.flash);
      gl.uniform1f(u.uBottom, s.bottom);
      gl.uniform1f(u.uGlow, s.glow);
      gl.uniform1f(u.uDark, s.dark);
      gl.uniform2f(u.uTorch, s.torchX, s.torchY);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, titleTex);
      gl.uniform1i(u.uTitle, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, tri);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disableVertexAttribArray(aPos);

      // ---- pass 2: the bubbles
      if (bubbles && bubbles.n) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(bub.p);
        gl.uniform2f(bub.u.uView, W, H);
        gl.uniform1f(bub.u.uDpr, dpr);
        gl.bindBuffer(gl.ARRAY_BUFFER, bubbleBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, bubbles.gpu.subarray(0, bubbles.n * 4));
        gl.enableVertexAttribArray(aP);
        gl.vertexAttribPointer(aP, 4, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.POINTS, 0, bubbles.n);
        gl.disableVertexAttribArray(aP);
      }
    },
  };
}

export { RIPPLES };

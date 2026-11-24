# Feel it rise

An independent, interactive design concept: a website poured into a glass of Coca‑Cola. The page opens with a live pour. After that the drink is always there behind the content: one WebGL scene with a real liquid surface, light coming through the cola, and thousands of bubbles. Scrolling sinks you down through it.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/ (relative paths, so it can be hosted from any folder)
npm run preview
```

## The experience

| | |
| --- | --- |
| **The pour** | A stream of cola falls into the empty screen and the level rises until the headline *Feel it rise.* is half submerged. The top half sits crisp in the air. The bottom half wobbles under the surface and takes on the amber of the drink. |
| **A living surface** | Move across the surface and it ripples. Cross it and it splashes. Click to drop a ripple. Scrolling fast makes the drink slosh. **On phones, tilt the device** and the surface stays level with the world, overshoots and settles. |
| **Sinking through the drink** | Bubbles have depth: near ones are bigger and move with the page, far ones drift slower. Light rays and moving caustics fade as you go deeper. Bubbles accelerate as they rise, wobble, move away from your cursor and pop into rings at the surface. Moving through the liquid leaves a trail of fizz. |
| **01 — Fizz** | Press and hold to shake the drink. The pressure builds, the whole scene trembles and every bubble jitters. Let go: *Pssht.* |
| **02 — Shape** | In 1915 the brief asked for a bottle you could recognise by touch in the dark. This chapter goes dark and the contour bottle is invisible: your cursor or finger is a warm torch. Trace enough of the bottle and it lights up and fills with cola. On phones the torch sweeps across the screen as you scroll. |
| **03 — Moment** | Write a line, pick a mood, and it is pressed into a red crown cap with 21 crimps, like the real thing. The cap floats and tilts toward the cursor, and its highlight slides across the metal. *Seal it* stamps the cap with a burst of fizz, and you can save it as a PNG. |
| **04 — Find** | You reach the bottom of the glass, where red light comes through. Then the red label: *Pour another* replays the pour. |
| **Measuring glass** | A gauge on the right edge shows how far down you are, in millilitres out of 330. |
| **Sound (opt-in)** | The pour, fizz, shake rumble, *pssht* and surface pops are generated live with WebAudio. There are no audio files. |

Accessibility and resilience: the headline and all copy are real HTML. Every interaction works with a keyboard (the shake button responds to Space or Enter held down). With `prefers-reduced-motion` the glass starts full and still. Without WebGL the page falls back to a static gradient and plain text. A frame-time governor lowers resolution on slow devices.

## How it works

- `src/gl/shaders.js`: one full-screen fragment shader paints the air, the surface, the foam, caustics, light rays, the bottom of the glass, the pour and the headline. The headline is sampled from a texture of the real `<h1>` and refracted below the surface. A second program draws the bubbles as lit point sprites.
- `src/gl/surface.js`: the surface height function. It combines an ambient swell, phone tilt, a slosh mode and up to 12 travelling ripples. The same function is mirrored in GLSL, so the bubbles, the cursor and the pixels agree on where the drink ends.
- `src/gl/bubbles.js`: CPU particles (up to ~4k) with buoyancy, terminal velocity, depth parallax, cursor wake, bursts and surface pops.
- `src/gl/title.js`: paints the live DOM headline into the texture, word by word.
- `src/sections/`: the three chapters (`fizz.js`, `shape.js`, `cap.js`).
- `src/lib/tilt.js`: device orientation and motion, including the permission prompt on iOS.

Built with Vite, GSAP (ScrollTrigger, SplitText) and Lenis. Fonts: Instrument Serif, Inter Tight and Norican (wordmark), self-hosted through Fontsource. No photography or image assets: everything is drawn in code.

---

*Independent design concept. Not affiliated with or endorsed by The Coca-Cola Company. Brand names and marks belong to their respective owners.*

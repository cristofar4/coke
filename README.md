# Follow the feeling

An independent, interactive design concept built from the "Follow the feeling" poster. It's a single page in which **every ribbon is a live, physically simulated 3D strip**: it unrolls as you scroll, ripples under the cursor, and you can grab it and pull.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/ (relative paths, so it can be hosted from any folder)
npm run preview
```

## What's inside

| Moment | What happens |
| --- | --- |
| **Preloader** | The whole screen is a red label. When the page is ready, a twist runs across it and it flips edge-on into a single thread. |
| **Bottle drop** | The bottle drops in on a spring. When it lands, the cap releases a burst of bubbles. |
| **Living carbonation** | Bubbles rise in chains from fixed points inside the bottle, growing and speeding up as they climb. The layer is masked to the liquid, so the bubbles pass behind the label and reappear above it. |
| **Unspooling ribbon nav** | The ribbon comes out of the label with a twisting tip. *Explore / Share / Create* are real links that ride on the moving ribbon. It rolls over the edge of the screen and shows its paper-white back. |
| **Thread → ribbon → photograph** | Each section band starts as a single red thread. As you scroll, a twist travels along it and unrolls it, showing the photo printed on it. The photo bends and catches the light with the fabric. |
| **Touch the fabric** | Moving the cursor across a ribbon pushes it. Catching an edge makes it twist. Click to pluck it like a string, or **grab and pull** and let go to watch the wave travel. |
| **Scroll wind** | Scrolling fast makes every ribbon on the page flutter. |
| **An icon, up close** | Scrolling zooms into the can and sweeps a light across it. When the band finishes unrolling, the can opens with a spray of fizz. |
| **Fizz everywhere** | Click anywhere for bubbles. They rise, wobble, move away from the cursor and pop into rings. A fast cursor leaves a faint trail of fizz. |
| **Moment maker** | Each mood changes how the card's waves move. Typed letters ink onto the card one at a time. *Create* flips the card with a burst, and *Save the card* downloads a PNG. |
| **Bubble letters** | Each letter of the headline floats up when the cursor comes near. |
| **Menu** | A full-screen ribbon unrolls diagonally across the viewport. |
| **Sound (opt-in)** | Fizz, the "pssht" of the can and the plucks are generated live with WebAudio. There are no audio files. |

Accessibility: everything is real HTML (headings, links, a proper form with radio buttons). With `prefers-reduced-motion`, ribbons render already unrolled and still, and the preloader fades. Touch devices get tap ripples instead of grabbing. A frame-time governor lowers canvas resolution on devices that struggle.

## How the ribbons work

`src/lib/ribbon.js` defines a strip by its spine, its half-width and a twist angle at every sample. Twisting the strip around its spine shortens it on screen (`|cos θ|`), and past 90° it flips to its back face. Each sample is lit with a satin Lambert + Blinn-Phong model. Photos are drawn onto the front face in strips, each with its own affine transform. Where the fabric twists quickly, a strip is split into rows so each row stays accurate.

`src/lib/wave.js` runs a damped 1D wave equation along each ribbon, with one channel for displacement and one for twist. The pointer, plucks, grabs and scroll "wind" (`src/lib/field.js`) feed into it.

```
src/
  main.js              boot, intro timeline, scroll wiring, main loop
  lib/ribbon.js        the 3D ribbon renderer
  lib/wave.js          wave simulation
  lib/field.js         pointer ↔ ribbon interaction (brush, pluck, grab)
  lib/fizz.js          page-wide bubbles + in-bottle carbonation
  lib/sound.js         synthesised fizz
  sections/hero.js     bottle + unspooling ribbon nav
  sections/bands.js    section bands + footer strand
  sections/moment.js   the card maker
  sections/menu.js     menu sweep + preloader
  sections/cursor.js   bubble cursor
  assets/              photos cut from the supplied poster
```

Built with Vite, GSAP (ScrollTrigger, SplitText) and Lenis. Fonts: Montserrat, Norican and Cormorant Garamond, all self-hosted through Fontsource.

---

*Independent design concept. Not affiliated with or endorsed by The Coca-Cola Company. Brand names, marks and product imagery belong to their respective owners. The photography was cut from the supplied concept poster.*

import { defineConfig } from 'vite';

// Relative base so the built site works from any sub-path (GitHub Pages, Netlify, a folder…)
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
  },
});

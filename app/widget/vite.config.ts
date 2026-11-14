import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'ChatWidget',
      // The iife build is what customer sites load from a single <script> tag,
      // so it keeps the plain `widget.js` name the embed snippet points at.
      formats: ['iife', 'es'],
      fileName: (format) => (format === 'iife' ? 'widget.js' : 'widget.mjs'),
    },
  },
});

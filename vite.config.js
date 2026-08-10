import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base path makes the build assets load correctly on any GitHub Pages subfolder
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
});

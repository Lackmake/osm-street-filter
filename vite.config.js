import { defineConfig } from 'vite'

export default defineConfig({
  base: './', // Ensures relative asset URLs for GitHub Pages deployment
  server: {
    port: 3000,
    open: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})

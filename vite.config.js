import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { ghPages } from 'vite-plugin-gh-pages';

export default defineConfig({
  base: '/biblical-timeline-vis/', // Set this to your repository name
  plugins: [react(), ghPages()],
  root: '.',
  build: {
    outDir: 'dist'
  },
  server: {
    port: 3000,
    open: true
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  }
});
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { ghPages } from 'vite-plugin-gh-pages';

export default defineConfig(({ command, mode }) => {
  // Set base path based on environment
  let basePath;
  if (command === 'serve') {
    // Local development - use root path
    basePath = '/';
  } else {
    // Production build - use relative path for GitHub Pages
    basePath = './';
  }

  return {
    base: basePath,
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
  };
});
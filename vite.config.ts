import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src/web'),
    },
  },
  build: {
    outDir: 'dist/web',
    emptyOutDir: true,
  },
  server: {
    port: 5310,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4321',
        changeOrigin: true,
      },
    },
  },
});

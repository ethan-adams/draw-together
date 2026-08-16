import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Built assets go to web/dist, which the Go gateway serves. `base: './'` keeps
// asset URLs relative so it works served from the gateway root. In dev, the
// Vite server proxies the WebSocket to a locally running gateway on :8080.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      '/ws': { target: 'ws://localhost:8080', ws: true },
    },
  },
});

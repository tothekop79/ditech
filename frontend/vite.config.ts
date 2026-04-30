import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://backend:5000',
        changeOrigin: true,
        // SSE/EventSource — disable buffering, allow long-lived connection
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.headers['cache-control'] = 'no-cache, no-transform';
            proxyRes.headers['x-accel-buffering'] = 'no';
          });
        },
      },
      '/uploads': {
        target: process.env.VITE_API_URL || 'http://backend:5000',
        changeOrigin: true,
      },
    },
  },
});

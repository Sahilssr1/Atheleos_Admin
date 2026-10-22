import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@atheleos/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/auth': {
        target: 'http://localhost:4000/api/admin',
        changeOrigin: true,
      },
    },
  },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./tests/setup.ts'] },
});

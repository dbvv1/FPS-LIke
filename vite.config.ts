import { defineConfig } from 'vite';
export default defineConfig({
  optimizeDeps: { exclude: ['recast-navigation'] },
  server: { host: '127.0.0.1' },
  build: { outDir: 'web-dist', chunkSizeWarningLimit: 7000 },
});

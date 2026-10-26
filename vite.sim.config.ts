import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    lib: { entry: 'src/sim/index.ts', formats: ['es'], fileName: 'fps-sim' },
    rollupOptions: { external: ['@dimforge/rapier3d-compat', 'recast-navigation'] },
  },
});

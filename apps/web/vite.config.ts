import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@raceproof/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
      '@raceproof/explorer': fileURLToPath(new URL('../../packages/explorer/src/index.ts', import.meta.url)),
      '@raceproof/examples': fileURLToPath(new URL('../../packages/examples/src/index.ts', import.meta.url)),
      '@raceproof/test-generator': fileURLToPath(new URL('../../packages/test-generator/src/index.ts', import.meta.url)),
    },
  },
  build: { target: 'es2022', sourcemap: true },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  // one page, no framework; three's WebGPU build is an ES module, nothing to configure
  build: { target: 'es2022', sourcemap: true },
  server: { port: 5173, open: false },
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});

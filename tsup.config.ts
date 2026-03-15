import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: 'inline',
  target: 'es2017',
  platform: 'node',
  clean: true,
  treeshake: true,
});

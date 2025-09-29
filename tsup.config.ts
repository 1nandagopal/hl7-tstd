import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    dts: true,
    sourcemap: true,
    format: 'cjs',
    target: 'es2017',
    platform: 'node',
  },
  {
    entry: ['src/index.ts'],
    dts: true,
    sourcemap: true,
    format: 'esm',
    target: 'es2017',
    platform: 'node',
  },
]);

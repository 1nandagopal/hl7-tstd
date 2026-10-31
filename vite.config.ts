import { defineConfig } from 'vite-plus';

export default defineConfig({
  staged: {
    '*': 'vp check --fix',
  },
  pack: {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    outExtensions({ format }) {
      if (format === 'es') {
        return { js: '.js', dts: '.d.ts' };
      }
      return { js: '.cjs', dts: '.d.cts' };
    },
    sourcemap: 'inline',
    target: 'es2017',
    platform: 'node',
    clean: true,
    treeshake: true,
  },
  fmt: {
    singleQuote: true,
  },
  lint: {
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    rules: { 'vite-plus/prefer-vite-plus-imports': 'error' },
    options: { typeAware: true, typeCheck: true },
  },
  test: {
    alias: {
      'node:test': 'vite-plus/test',
    },
  },
});

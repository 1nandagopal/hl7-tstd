import { existsSync, mkdirSync } from 'node:fs';
import { defineConfig } from 'vite-plus';

const isProfiling = process.env['PROFILE'] === 'true' || process.env['TEST_PROFILE'] === 'true';
const profileDir = process.env['PROFILE_DIR'] ?? 'test-runner-profile';

if (isProfiling && !existsSync(profileDir)) {
  mkdirSync(profileDir, { recursive: true });
}

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
    platform: 'neutral',
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
    reporters: ['verbose'],
    slowTestThreshold: 150,
    pool: 'forks',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      include: ['src/**/*.ts'],
      exclude: ['test/**', 'dist/**'],
    },
    experimental: {
      importDurations: {
        print: !process.env['CI'],
      },
    },
    ...(isProfiling
      ? {
          forks: {
            execArgv: [
              '--cpu-prof',
              `--cpu-prof-dir=${profileDir}`,
              '--heap-prof',
              `--heap-prof-dir=${profileDir}`,
            ],
            singleFork: true,
          },
        }
      : {}),
  },
});

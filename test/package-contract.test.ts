import { existsSync } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vite-plus/test';

const require = createRequire(import.meta.url);
const packageJsonUrl = new URL('../package.json', import.meta.url);
const readmeUrl = new URL('../README.md', import.meta.url);
const esmUrl = new URL('../dist/index.js', import.meta.url);
const cjsUrl = new URL('../dist/index.cjs', import.meta.url);

interface PackageJson {
  main: string;
  module: string;
  browser?: string;
  types: string;
  type: string;
  sideEffects: boolean;
  exports: {
    '.': {
      browser?: {
        types: string;
        import: string;
      };
      import: {
        types: string;
        import: string;
      };
      require: {
        types: string;
        require: string;
      };
    };
  };
  scripts?: Record<string, string>;
}

async function loadPackageJson(): Promise<PackageJson> {
  return JSON.parse(await readFile(packageJsonUrl, 'utf8'));
}

describe('NPM Package Artifacts & Distribution Contract', () => {
  it('should verify package.json entrypoints point to physically existing dist build artifacts', async () => {
    const pkg = await loadPackageJson();

    const checks = [
      access(new URL(pkg.main, packageJsonUrl)),
      access(new URL(pkg.module, packageJsonUrl)),
      access(new URL(pkg.types, packageJsonUrl)),
    ];
    if (pkg.browser) {
      checks.push(access(new URL(pkg.browser, packageJsonUrl)));
    }
    await Promise.all(checks);

    expect(pkg.type).toBe('module');
    expect(pkg.sideEffects).toBe(false);
  });

  it('should expose HL7 constructor as a named export across both ESM and CJS formats', async () => {
    expect(existsSync(esmUrl), 'Run `npm run build` before running package contract tests').toBe(
      true,
    );
    const esmModule = await import(esmUrl.href);
    const cjsModule = require(fileURLToPath(cjsUrl));

    expect(typeof esmModule.HL7).toBe('function');
    expect(typeof cjsModule.HL7).toBe('function');
  });

  it('should ensure package.json conditional exports match declared entry points', async () => {
    const pkg = await loadPackageJson();
    const rootExport = pkg.exports['.'];

    expect(rootExport.import.import).toBe(pkg.module);
    expect(rootExport.require.require).toBe(pkg.main);
    expect(rootExport.import.types).toBe(pkg.types);
    await access(new URL(rootExport.require.types, packageJsonUrl));
  });

  it('should maintain alignment between README import examples and published package API', async () => {
    const readme = await readFile(readmeUrl, 'utf8');

    expect(readme).toMatch(/import \{ HL7 \} from 'hl7-tstd';/);
    expect(readme).not.toMatch(/import HL7, \{[^}]*Segment[^}]*\} from 'hl7-tstd';/);
    expect(readme).toMatch(/import \{ HL7, type Segment \} from 'hl7-tstd';/);
  });

  it('should declare a test npm script for consistent suite execution', async () => {
    const pkg = await loadPackageJson();

    expect(typeof pkg.scripts?.['test']).toBe('string');
    expect(pkg.scripts?.['test'] ?? '').toMatch(/vp\s+test/);
  });
});

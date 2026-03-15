import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const packageJsonUrl = new URL('../package.json', import.meta.url);
const readmeUrl = new URL('../README.md', import.meta.url);
const esmUrl = new URL('../dist/index.js', import.meta.url);
const cjsUrl = new URL('../dist/index.cjs', import.meta.url);
const dtsUrl = new URL('../dist/index.d.ts', import.meta.url);
const dctsUrl = new URL('../dist/index.d.cts', import.meta.url);

async function loadPackageJson() {
  return JSON.parse(await readFile(packageJsonUrl, 'utf8'));
}

function parseValueExportNames(source) {
  const match = source.match(/export\s*\{\s*([^}]+)\s*\}/m);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !token.startsWith('type '))
    .map((token) => token.replace(/^type\s+/, '').trim());
}

describe('Published package contract', () => {
  test('package metadata points to existing build artifacts', async () => {
    const pkg = await loadPackageJson();

    await Promise.all([
      access(new URL(pkg.main, packageJsonUrl)),
      access(new URL(pkg.module, packageJsonUrl)),
      access(new URL(pkg.types, packageJsonUrl))
    ]);

    assert.equal(pkg.type, 'module');
    assert.equal(pkg.sideEffects, false);
  });

  test('ESM and CJS builds expose HL7 as a named export', async () => {
    const esmModule = await import(esmUrl.href);
    const cjsModule = require(fileURLToPath(cjsUrl));

    assert.equal(typeof esmModule.HL7, 'function');
    assert.equal(typeof cjsModule.HL7, 'function');
  });

  // TODO
  test.skip('declaration exports align with ESM and CJS runtime exports', async () => {
    const [dtsSource, dctsSource] = await Promise.all([
      readFile(dtsUrl, 'utf8'),
      readFile(dctsUrl, 'utf8')
    ]);
    const esmModule = await import(esmUrl.href);
    const cjsModule = require(fileURLToPath(cjsUrl));
    const dtsExports = parseValueExportNames(dtsSource);
    const dctsExports = parseValueExportNames(dctsSource);

    assert.deepEqual(dtsExports, dctsExports);
    for (const exportName of dtsExports) {
      assert.ok(exportName in esmModule, `Missing ESM runtime export: ${exportName}`);
      assert.ok(exportName in cjsModule, `Missing CJS runtime export: ${exportName}`);
    }
  });

  test('package.json exports map points to the declared entry points', async () => {
    const pkg = await loadPackageJson();
    const rootExport = pkg.exports['.'];

    assert.equal(rootExport.import.import, pkg.module);
    assert.equal(rootExport.require.require, pkg.main);
    assert.equal(rootExport.import.types, pkg.types);
    await access(new URL(rootExport.require.types, packageJsonUrl));
  });

  test('README import guidance stays aligned with named HL7 imports', async () => {
    const readme = await readFile(readmeUrl, 'utf8');

    assert.match(readme, /import \{ HL7 \} from 'hl7-tstd';/);
    assert.doesNotMatch(readme, /import HL7, \{[^}]*Segment[^}]*\} from 'hl7-tstd';/);
    assert.match(readme, /import \{ HL7, type Segment \} from 'hl7-tstd';/);
  });

  test('package declares a test script so the suite can be executed consistently', async () => {
    const pkg = await loadPackageJson();

    assert.equal(typeof pkg.scripts?.test, 'string');
    assert.match(pkg.scripts.test, /node\s+--test/);
  });
});

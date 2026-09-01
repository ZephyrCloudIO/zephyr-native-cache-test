'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {getZephyrMode, isZephyrBuild} = require('./zephyr-distribution.cjs');

test('selects local mode by default', () => {
  assert.equal(getZephyrMode({}), 'local');
  assert.equal(isZephyrBuild({}), false);
});

test('selects the existing e2e mode', () => {
  assert.equal(getZephyrMode({ZEPHYR_E2E: '1'}), 'e2e');
});

test('selects explicit TestFlight mode', () => {
  assert.equal(
    getZephyrMode({ZEPHYR_DISTRIBUTION: 'testflight'}),
    'testflight',
  );
  assert.equal(isZephyrBuild({ZEPHYR_DISTRIBUTION: 'testflight'}), true);
});

test('rejects mixed and unknown distribution modes', () => {
  assert.throws(
    () => getZephyrMode({ZEPHYR_E2E: '1', ZEPHYR_DISTRIBUTION: 'testflight'}),
    /cannot be combined/,
  );
  assert.throws(
    () => getZephyrMode({ZEPHYR_DISTRIBUTION: 'production'}),
    /Unsupported/,
  );
});

test('keeps DEMO aliases isolated to the existing E2E mode', async () => {
  process.env.ZEPHYR_E2E = '1';
  const e2eConfig = await import('../../apps/host/zephyr.config.mjs?mode=e2e');
  assert.equal(e2eConfig.default.remoteDependencies.mini.endsWith('@DEMO'), true);

  delete process.env.ZEPHYR_E2E;
  const releaseConfig = await import(
    '../../apps/host/zephyr.config.mjs?mode=testflight'
  );
  assert.equal(
    releaseConfig.default.remoteDependencies.mini.endsWith('@testflight'),
    true,
  );
});

test('inlines only the public E2E flag into application bundles', () => {
  const appRoot = require('node:path').resolve(__dirname, '../../apps/host');
  const babel = require(require.resolve('@babel/core', {paths: [appRoot]}));
  const plugin = require('../../apps/host/babel-plugin-inline-zephyr-e2e');
  const source =
    'const values = [process.env.ZEPHYR_E2E, process.env.ZE_SECRET_TOKEN];';

  process.env.ZEPHYR_E2E = '1';
  const e2e = babel.transformSync(source, {plugins: [plugin]}).code;
  assert.match(e2e, /\["1", process\.env\.ZE_SECRET_TOKEN\]/);

  delete process.env.ZEPHYR_E2E;
  const release = babel.transformSync(source, {plugins: [plugin]}).code;
  assert.match(release, /\["0", process\.env\.ZE_SECRET_TOKEN\]/);
});

test('host Babel config emits the E2E polling interval without runtime env access', () => {
  const path = require('node:path');
  const appRoot = path.resolve(__dirname, '../../apps/host');
  const babel = require(require.resolve('@babel/core', {paths: [appRoot]}));

  process.env.ZEPHYR_E2E = '1';
  const output = babel.transformFileSync(path.join(appRoot, 'index.js'), {
    babelrc: false,
    configFile: path.join(appRoot, 'babel.config.js'),
    envName: 'production',
  }).code;
  delete process.env.ZEPHYR_E2E;

  assert.doesNotMatch(output, /process\.env\.ZEPHYR_E2E/);
  assert.match(output, /pollIntervalMs="1"==='1'\?15000:300000/);
});

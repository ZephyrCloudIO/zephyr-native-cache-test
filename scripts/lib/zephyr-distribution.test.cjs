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

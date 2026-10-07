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

test('requires showcase mode and selects the platform-specific build-once pins', async () => {
  const original = {
    ZEPHYR_E2E: process.env.ZEPHYR_E2E,
    ZEPHYR_BUILD_ONCE_DEMO: process.env.ZEPHYR_BUILD_ONCE_DEMO,
    ZEPHYR_TARGET: process.env.ZEPHYR_TARGET,
  };
  try {
    process.env.ZEPHYR_E2E = '1';
    process.env.ZEPHYR_BUILD_ONCE_DEMO = '1';
    process.env.ZEPHYR_TARGET = 'ios';
    const ios = await import('../../apps/host/zephyr.config.mjs?build-once-ios');
    assert.deepEqual(ios.default.remoteDependencies, {
      mini: 'zephyr:cache-test-mini@BUILD_ONCE_DEMO_IOS',
      nestedMini: 'zephyr:cache-test-nested-mini@BUILD_ONCE_DEMO_IOS',
    });
    process.env.ZEPHYR_TARGET = 'android';
    const android = await import('../../apps/host/zephyr.config.mjs?build-once-android');
    assert.equal(android.default.remoteDependencies.mini, 'zephyr:cache-test-mini@BUILD_ONCE_DEMO_ANDROID');
    assert.equal(android.default.remoteDependencies.nestedMini, 'zephyr:cache-test-nested-mini@BUILD_ONCE_DEMO_ANDROID');
    delete process.env.ZEPHYR_E2E;
    await assert.rejects(import('../../apps/host/zephyr.config.mjs?build-once-not-e2e'), /Build-once host requires ZEPHYR_E2E=1/);
    process.env.ZEPHYR_E2E = '1';
    delete process.env.ZEPHYR_TARGET;
    await assert.rejects(import('../../apps/host/zephyr.config.mjs?build-once-missing-target'), /Build-once host requires ZEPHYR_TARGET=ios\\|android/);
    process.env.ZEPHYR_TARGET = 'web';
    await assert.rejects(import('../../apps/host/zephyr.config.mjs?build-once-invalid-target'), /Build-once host requires ZEPHYR_TARGET=ios\\|android/);
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

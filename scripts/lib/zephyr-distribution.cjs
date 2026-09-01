'use strict';

function getZephyrMode(env = process.env) {
  const isE2E = env.ZEPHYR_E2E === '1';
  const distribution = env.ZEPHYR_DISTRIBUTION;

  if (distribution && distribution !== 'testflight') {
    throw new Error(`Unsupported ZEPHYR_DISTRIBUTION: ${distribution}`);
  }
  if (isE2E && distribution) {
    throw new Error('ZEPHYR_E2E and ZEPHYR_DISTRIBUTION cannot be combined');
  }

  return isE2E ? 'e2e' : distribution === 'testflight' ? 'testflight' : 'local';
}

function isZephyrBuild(env = process.env) {
  return getZephyrMode(env) !== 'local';
}

module.exports = {getZephyrMode, isZephyrBuild};

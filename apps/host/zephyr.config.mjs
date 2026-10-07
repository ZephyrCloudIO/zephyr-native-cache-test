const isE2E = process.env.ZEPHYR_E2E === '1';
const isBuildOnce = process.env.ZEPHYR_BUILD_ONCE_DEMO === '1';

let remoteDependencies;
if (isBuildOnce) {
  if (!isE2E) throw new Error('Build-once host requires ZEPHYR_E2E=1');
  const target = process.env.ZEPHYR_TARGET;
  if (target !== 'ios' && target !== 'android') {
    throw new Error('Build-once host requires ZEPHYR_TARGET=ios|android');
  }
  const selector = `BUILD_ONCE_DEMO_${target.toUpperCase()}`;
  remoteDependencies = {
    mini: `zephyr:cache-test-mini@${selector}`,
    nestedMini: `zephyr:cache-test-nested-mini@${selector}`,
  };
} else {
  remoteDependencies = isE2E
    ? {
        mini: 'zephyr:cache-test-mini@DEMO',
        nestedMini: 'zephyr:cache-test-nested-mini@DEMO',
      }
    : {
        mini: 'zephyr:cache-test-mini.zephyr-native-cache-test.zephyrcloudio@testflight',
        nestedMini:
          'zephyr:cache-test-nested-mini.zephyr-native-cache-test.zephyrcloudio@testflight',
      };
}

export default {remoteDependencies};

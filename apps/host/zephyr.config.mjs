const isE2E = process.env.ZEPHYR_E2E === '1';

export default {
  remoteDependencies: isE2E
    ? {
        mini: 'zephyr:cache-test-mini@DEMO',
        nestedMini: 'zephyr:cache-test-nested-mini@DEMO',
      }
    : {
        mini: 'zephyr:cache-test-mini.zephyr-native-cache-test.zephyrcloudio@testflight',
        nestedMini:
          'zephyr:cache-test-nested-mini.zephyr-native-cache-test.zephyrcloudio@testflight',
      },
};

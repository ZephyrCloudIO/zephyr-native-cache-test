const path = require('node:path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const {withModuleFederation} = require('@module-federation/metro');

const {getZephyrMode, isZephyrBuild} = require('../../scripts/lib/zephyr-distribution.cjs');

const config = {
  resolver: {
    extraNodeModules: {
      '@babel/runtime': path.resolve(__dirname, 'node_modules/@babel/runtime'),
    },
    useWatchman: false,
  },
  watchFolders: [
    path.resolve(__dirname, '../../node_modules'),
    path.resolve(__dirname, '../../packages/demo-host-capabilities'),
  ],
};

const mfConfig = require('./federation.config.cjs').createFederationConfig();
const mfFlags = {
  flags: {
    unstable_patchHMRClient: true,
    unstable_patchInitializeCore: true,
    unstable_patchRuntimeRequire: true,
  },
};

async function buildZephyrConfig() {
  const {withZephyr} = require('zephyr-metro-plugin');
  const baseConfig = mergeConfig(getDefaultConfig(__dirname), config);
  const enhanced = await withZephyr({
    name: mfConfig.name,
    target: process.env.ZEPHYR_TARGET === 'android' ? 'android' : 'ios',
    failOnManifestError: getZephyrMode() === 'testflight',
  })(baseConfig);
  return withModuleFederation(enhanced, mfConfig, mfFlags);
}

module.exports = isZephyrBuild()
  ? buildZephyrConfig()
  : withModuleFederation(mergeConfig(getDefaultConfig(__dirname), config), mfConfig, mfFlags);

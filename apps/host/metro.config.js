const path = require('node:path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const {withModuleFederation} = require('@module-federation/metro');

const ZEPHYR_E2E = process.env.ZEPHYR_E2E === '1';

const config = {
  resolver: {
    extraNodeModules: {
      '@babel/runtime': path.resolve(__dirname, 'node_modules/@babel/runtime'),
    },
    useWatchman: false,
  },
  watchFolders: [
    path.resolve(__dirname, '../../node_modules'),
  ],
};

const mfConfig = {
  name: 'MFExampleHost',
  remotes: {
    mini: 'mini@http://localhost:8082/mf-manifest.json',
    nestedMini: 'nestedMini@http://localhost:8083/mf-manifest.json',
  },
  shared: {
    react: {
      singleton: true,
      eager: true,
      requiredVersion: '19.1.0',
      version: '19.1.0',
    },
    'react-native': {
      singleton: true,
      eager: true,
      requiredVersion: '0.80.0',
      version: '0.80.0',
    },
    lodash: {
      singleton: false,
      eager: false,
      requiredVersion: '4.17.23',
      version: '4.17.23',
    },
  },
  shareStrategy: 'loaded-first',
  runtimePlugins: [
    path.resolve(__dirname, './runtime-plugin.ts'),
    require.resolve('zephyr-native-cache/runtime-plugin'),
  ],
};

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
  // `withZephyr` only reads `remotes` from its first-argument options bag.
  // Passing it via the MF-shaped second arg — as zephyr-examples does —
  // leaves the resolve list empty and writes an empty zephyr-manifest.json.
  const enhanced = await withZephyr({
    name: mfConfig.name,
    remotes: mfConfig.remotes,
    target: process.env.ZEPHYR_TARGET === 'android' ? 'android' : 'ios',
  })(baseConfig);
  return withModuleFederation(enhanced, mfConfig, mfFlags);
}

module.exports = ZEPHYR_E2E
  ? buildZephyrConfig()
  : withModuleFederation(mergeConfig(getDefaultConfig(__dirname), config), mfConfig, mfFlags);

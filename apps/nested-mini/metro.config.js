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

const version = process.env.REMOTE_VERSION || 'v1';
const v2 = './src/v2';
const v3 = './src/v3';
const v1 = './src';
const exposePaths = {
  v1: { ActivityFeed: `${v1}/ActivityFeed.tsx`, CacheInfo: `${v1}/CacheInfo.tsx`, HydrationCard: `${v1}/HydrationCard.tsx` },
  v2: { ActivityFeed: `${v2}/ActivityFeed.tsx`, CacheInfo: `${v2}/CacheInfo.tsx`, HydrationCard: `${v2}/HydrationCard.tsx` },
  v3: { ActivityFeed: `${v2}/ActivityFeed.tsx`, CacheInfo: `${v3}/CacheInfo.tsx`, HydrationCard: `${v2}/HydrationCard.tsx` },
};
const exposes = exposePaths[version] || exposePaths.v1;

const mfConfig = {
  name: 'MFExampleNestedMini',
  filename: 'nestedMini.bundle',
  exposes: {
    './ActivityFeed': exposes.ActivityFeed,
    './CacheInfo': exposes.CacheInfo,
    './HydrationCard': exposes.HydrationCard,
  },
  shared: {
    react: {
      singleton: true,
      eager: false,
      requiredVersion: '19.1.0',
      version: '19.1.0',
      import: false,
    },
    'react-native': {
      singleton: true,
      eager: false,
      requiredVersion: '0.80.0',
      version: '0.80.0',
      import: false,
    },
    lodash: {
      singleton: false,
      eager: false,
      requiredVersion: '4.17.23',
      version: '4.17.23',
    },
  },
  shareStrategy: 'version-first',
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
  const zephyrMfConfig = await withZephyr()(mfConfig);
  return withModuleFederation(
    mergeConfig(getDefaultConfig(__dirname), config),
    zephyrMfConfig,
    mfFlags,
  );
}

module.exports = ZEPHYR_E2E
  ? buildZephyrConfig()
  : withModuleFederation(mergeConfig(getDefaultConfig(__dirname), config), mfConfig, mfFlags);

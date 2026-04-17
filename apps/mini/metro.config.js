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
// mini has v1 (./src) and v2 (./src/v2) content only — no v3. Phase 4 of the
// demo rolls nested-mini to v3 while mini stays on v2, so v3 falls back to v2.
const prefixByVersion = { v1: './src', v2: './src/v2', v3: './src/v2' };
const prefix = prefixByVersion[version] ?? prefixByVersion.v1;

const mfConfig = {
  name: 'MFExampleMini',
  filename: 'mini.bundle',
  exposes: {
    './StatsCard': `${prefix}/StatsCard.tsx`,
    './DeployCard': `${prefix}/DeployCard.tsx`,
    './CalorieCard': `${prefix}/CalorieCard.tsx`,
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

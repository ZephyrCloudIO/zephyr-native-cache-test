const path = require('node:path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const {withModuleFederation} = require('@module-federation/metro');

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

module.exports = withModuleFederation(
  mergeConfig(getDefaultConfig(__dirname), config),
  {
    name: 'MFExampleNestedMini',
    filename: 'nestedMini.bundle',
    exposes: {
      './ActivityFeed': './src/ActivityFeed.tsx',
      './CacheInfo': './src/CacheInfo.tsx',
      './HydrationCard': './src/HydrationCard.tsx',
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
  },
  {
    flags: {
      unstable_patchHMRClient: true,
      unstable_patchInitializeCore: true,
      unstable_patchRuntimeRequire: true,
    },
  },
);

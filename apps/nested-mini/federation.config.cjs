const buildOnce = process.env.ZEPHYR_BUILD_ONCE_DEMO === '1';
const v1 = './src';
const v2 = './src/v2';
const v3 = './src/v3';
const exposePaths = {
  v1: {ActivityFeed: `${v1}/ActivityFeed.tsx`, CacheInfo: `${v1}/CacheInfo.tsx`, HydrationCard: `${v1}/HydrationCard.tsx`},
  v2: {ActivityFeed: `${v2}/ActivityFeed.tsx`, CacheInfo: `${v2}/CacheInfo.tsx`, HydrationCard: `${v2}/HydrationCard.tsx`},
  v3: {ActivityFeed: `${v3}/ActivityFeed.tsx`, CacheInfo: `${v3}/CacheInfo.tsx`, HydrationCard: `${v3}/HydrationCard.tsx`},
};

exports.createFederationConfig = function createFederationConfig({version = process.env.REMOTE_VERSION || 'v1'} = {}) {
  const exposes = exposePaths[version] || exposePaths.v1;
  const shared = {
    react: {singleton: true, eager: false, requiredVersion: '19.1.0', version: '19.1.0', import: false},
    'react-native': {singleton: true, eager: false, requiredVersion: '0.80.0', version: '0.80.0', import: false},
    lodash: {singleton: false, eager: false, requiredVersion: '4.17.23', version: '4.17.23'},
  };
  return {
    name: 'MFExampleNestedMini', filename: 'nestedMini.bundle',
    exposes: {'./ActivityFeed': exposes.ActivityFeed, './CacheInfo': exposes.CacheInfo, './HydrationCard': exposes.HydrationCard},
    shared, shareStrategy: 'version-first',
  };
};

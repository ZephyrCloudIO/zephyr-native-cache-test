const buildOnce = process.env.ZEPHYR_BUILD_ONCE_DEMO === '1';
const prefixByVersion = {v1: './src', v2: './src/v2', v3: './src/v2'};

exports.createFederationConfig = function createFederationConfig({version = process.env.REMOTE_VERSION || 'v1', buildOnce: enabled = buildOnce} = {}) {
  const prefix = prefixByVersion[version] || prefixByVersion.v1;
  const exposes = {
    './StatsCard': `${prefix}/StatsCard.tsx`,
    './DeployCard': `${prefix}/DeployCard.tsx`,
    './CalorieCard': `${prefix}/CalorieCard.tsx`,
  };
  const shared = {
    react: {singleton: true, eager: false, requiredVersion: '19.1.0', version: '19.1.0', import: false},
    'react-native': {singleton: true, eager: false, requiredVersion: '0.80.0', version: '0.80.0', import: false},
    lodash: {singleton: false, eager: false, version: '4.17.23'},
  };
  if (enabled) {
    exposes['./NativeCapabilityCard'] = `${prefix}/NativeCapabilityCard.tsx`;
    shared['@zephyr-demo/host-capabilities'] = {singleton: true, eager: false, import: false, version: '1.0.0', requiredVersion: '1.0.0'};
  }
  return {name: 'MFExampleMini', filename: 'mini.bundle', exposes, shared, shareStrategy: 'version-first'};
};

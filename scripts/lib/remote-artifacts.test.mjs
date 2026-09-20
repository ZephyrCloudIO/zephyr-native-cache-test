import assert from 'node:assert/strict';
import test from 'node:test';
import {logicalArtifactMap, manifestArtifactMap} from './remote-artifacts.mjs';

const hash = character => character.repeat(64);
const manifest = {
  name: 'MFExampleMini',
  metaData: {
    publicPath: 'https://cdn.example.test/release',
    buildInfo: {hash: hash('a')},
    remoteEntry: {name: 'mini.bundle', path: ''},
  },
  exposes: [
    {name: 'StatsCard', hash: hash('b'), assets: {js: {sync: ['./src/StatsCard.tsx'], async: []}}},
  ],
  shared: [
    {name: 'lodash', hash: hash('c'), assets: {js: {sync: ['shared/lodash.chunk'], async: []}}},
  ],
};

test('derives the production bundle graph from publicPath', () => {
  const graph = manifestArtifactMap(
    manifest,
    'https://selector.example.test/mf-manifest.json',
  );
  assert.deepEqual(graph, {
    buildHash: hash('a'),
    artifacts: {
      'https://cdn.example.test/release/mini.bundle': hash('a'),
      'https://cdn.example.test/release/exposed/StatsCard.bundle?modulesOnly=true&runModule=false': hash('b'),
      'https://cdn.example.test/release/shared/lodash.bundle?modulesOnly=true&runModule=false': hash('c'),
    },
  });
});

test('rejects executable assets that cannot be verified independently', () => {
  assert.throws(
    () =>
      manifestArtifactMap(
        {
          ...manifest,
          exposes: [
            {
              ...manifest.exposes[0],
              assets: {js: {sync: [], async: ['chunk.js']}},
            },
          ],
        },
        'https://selector.example.test/mf-manifest.json',
      ),
    /unverifiable async executable/,
  );
});

test('normalizes artifact graphs independently of their host', () => {
  assert.deepEqual(
    logicalArtifactMap({'https://one.test/a.bundle?x=1': hash('a')}),
    logicalArtifactMap({'https://two.test/a.bundle?x=1': hash('a')}),
  );
});

test('ignores relative publicPath and preserves existing split parameters', () => {
  const graph = manifestArtifactMap(
    {
      ...manifest,
      metaData: {...manifest.metaData, publicPath: './relative/'},
      shared: [
        {
          name: 'lodash',
          hash: hash('c'),
          assets: {
            js: {
              sync: ['shared/lodash.xyz?modulesOnly=true&runModule=false'],
              async: [],
            },
          },
        },
      ],
    },
    'https://selector.example.test/path/mf-manifest.json',
  );
  assert.equal(
    graph.artifacts[
      'https://selector.example.test/path/shared/lodash.xyz?modulesOnly=true&runModule=false'
    ],
    hash('c'),
  );
});

test('rejects asynchronous shared executables', () => {
  assert.throws(
    () =>
      manifestArtifactMap(
        {
          ...manifest,
          shared: [
            {
              name: 'lodash',
              hash: hash('c'),
              assets: {js: {sync: [], async: ['shared/lodash.js']}},
            },
          ],
        },
        'https://selector.example.test/mf-manifest.json',
      ),
    /unverifiable async executable/,
  );
});

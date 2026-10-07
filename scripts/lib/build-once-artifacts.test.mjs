import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {verifyManifestArtifactSet} from './build-once-artifacts.mjs';

const sha256 = value => createHash('sha256').update(value).digest('hex');

test('rejects an executable whose served bytes disagree with the canonical compiler output', async t => {
  const canonicalEntry = Buffer.from('canonical remote entry');
  const canonicalExpose = Buffer.from('canonical exposed module');
  const manifest = {
    name: 'MFExampleMini',
    metaData: {
      publicPath: 'auto',
      buildInfo: {hash: sha256(canonicalEntry)},
      remoteEntry: {name: 'mini.bundle', path: ''},
    },
    exposes: [{name: 'StatsCard', hash: sha256(canonicalExpose), assets: {js: {sync: ['./src/StatsCard.tsx'], async: []}}}],
    shared: [],
  };
  const server = createServer((request, response) => {
    if (request.url === '/releases/mini/mf-manifest.json') {
      response.end(JSON.stringify(manifest));
    } else if (request.url === '/releases/mini/mini.bundle') {
      response.end(canonicalEntry);
    } else if (request.url?.startsWith('/releases/mini/exposed/StatsCard.bundle')) {
      response.end('corrupted executable bytes');
    } else {
      response.writeHead(404).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const manifestUrl = 'https://selector.example.test/releases/mini/mf-manifest.json';
  const request = (url, options) => fetch(`http://127.0.0.1:${address.port}${new URL(url).pathname}${new URL(url).search}`, options);
  const expected = {
    executableHashes: {'mini.bundle': sha256(canonicalEntry), 'exposed/StatsCard.bundle': sha256(canonicalExpose)},
    executableArtifactSetId: sha256(JSON.stringify([
      ['exposed/StatsCard.bundle', sha256(canonicalExpose)],
      ['mini.bundle', sha256(canonicalEntry)],
    ])),
    mfManifestSha256: sha256(JSON.stringify(manifest)),
    otherFileHashes: {},
  };
  await assert.rejects(
    verifyManifestArtifactSet(manifestUrl, expected, request),
    /Executable digest mismatch for exposed\/StatsCard\.bundle/,
  );
});

import {createHash} from 'node:crypto';
import type {NativeMFECacheSpec} from '@zephyr-demo/host-capabilities/native';
import {createDemoManifestCache, ManifestHttpError, ManifestNetworkError} from '../src/lib/demoManifestCache';

const url = 'https://cdn.example.test/releases/mini/mf-manifest.json';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const manifestText = JSON.stringify({
  name: 'MFExampleMini',
  metaData: {name: 'MFExampleMini', remoteEntry: {name: 'mini.bundle'}, buildInfo: {hash: 'a'.repeat(64)}},
  exposes: [{name: 'StatsCard', hash: 'b'.repeat(64), assets: {js: {async: []}}}],
  shared: [],
  remotes: [],
});

function createNative() {
  const files = new Map<string, string>();
  const native: NativeMFECacheSpec = {
    getDocumentDirectory: jest.fn(async () => '/documents'),
    fileExists: jest.fn(async path => files.has(path)),
    readFile: jest.fn(async path => {
      const body = files.get(path);
      if (body === undefined) throw new Error(`missing ${path}`);
      return body;
    }),
    writeFile: jest.fn(async (path, body) => { files.set(path, body); }),
    sha256File: jest.fn(async path => {
      const body = files.get(path);
      if (body === undefined) throw new Error(`missing ${path}`);
      return hash(body);
    }),
    sha256String: jest.fn(async value => hash(value)),
  };
  return {native, files};
}

const offline = () => Promise.reject(new ManifestNetworkError('network unavailable'));

describe('durable demo manifest cache', () => {
  it('reuses exact verified manifest text after a new cache instance loses network access', async () => {
    const {native} = createNative();
    const online = createDemoManifestCache({runId: 'run-1', native, requestText: async () => manifestText});
    await expect(online.get(url, 'mini')).resolves.toMatchObject({body: manifestText, source: 'network'});
    const restarted = createDemoManifestCache({runId: 'run-1', native, requestText: offline});
    await expect(restarted.get(url, 'mini')).resolves.toMatchObject({body: manifestText, source: 'native-cache'});
  });

  it('does not reuse a cache entry for another run, URL, or remote alias', async () => {
    const {native} = createNative();
    await createDemoManifestCache({runId: 'run-1', native, requestText: async () => manifestText}).get(url, 'mini');
    const otherRun = createDemoManifestCache({runId: 'run-2', native, requestText: offline});
    await expect(otherRun.get(url, 'mini')).rejects.toThrow('network unavailable');
    const otherUrl = createDemoManifestCache({runId: 'run-1', native, requestText: offline});
    await expect(otherUrl.get('https://cdn.example.test/other/mf-manifest.json', 'mini')).rejects.toThrow('network unavailable');
    await expect(createDemoManifestCache({runId: 'run-1', native, requestText: offline}).get(url, 'nestedMini')).rejects.toThrow('network unavailable');
  });

  it('rejects tampered cached bytes and never falls back for an HTTP or manifest error', async () => {
    const {native, files} = createNative();
    await createDemoManifestCache({runId: 'run-1', native, requestText: async () => manifestText}).get(url, 'mini');
    const [cachePath, encoded] = [...files.entries()][0]!;
    const envelope = JSON.parse(encoded) as {body: string};
    files.set(cachePath, JSON.stringify({...envelope, body: `${envelope.body} `}));
    await expect(createDemoManifestCache({runId: 'run-1', native, requestText: offline}).get(url, 'mini')).rejects.toThrow('network unavailable');

    await createDemoManifestCache({runId: 'run-1', native, requestText: async () => manifestText}).get(url, 'mini');
    const httpCache = createDemoManifestCache({runId: 'run-1', native, requestText: async () => { throw new ManifestHttpError('HTTP 503'); }});
    await expect(httpCache.get(url, 'mini')).rejects.toThrow('HTTP 503');
    const invalidCache = createDemoManifestCache({runId: 'run-1', native, requestText: async () => '{"name":"wrong"}'});
    await expect(invalidCache.get(url, 'mini')).rejects.toThrow('MF manifest metadata is missing');
  });
});

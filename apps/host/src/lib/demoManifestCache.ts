import type {NativeMFECacheSpec} from '@zephyr-demo/host-capabilities/native';

export class ManifestNetworkError extends Error {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'ManifestNetworkError';
    this.cause = cause;
  }
}
export class ManifestHttpError extends Error {
  constructor(message: string) { super(message); this.name = 'ManifestHttpError'; }
}

interface ManifestEnvelope {
  manifestUrl: string;
  remoteName: string;
  body: string;
  sha256: string;
}
interface ValidManifestInfo {
  executableHashes: Record<string, string>;
  executableArtifactSetId: string;
}
interface DemoManifestCacheOptions {
  runId: string;
  native: NativeMFECacheSpec;
  requestText?: (url: string) => Promise<string>;
}

const expectedName: Record<string, string> = {mini: 'MFExampleMini', nestedMini: 'MFExampleNestedMini'};
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const isHash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export async function requestManifestText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    let response: Response;
    try {
      response = await fetch(url, {method: 'GET', signal: controller.signal});
    } catch (cause) {
      throw new ManifestNetworkError(`Manifest transport failed: ${url}`, cause);
    }
    if (!response.ok) throw new ManifestHttpError(`Manifest GET failed with HTTP ${response.status}: ${url}`);
    try {
      return await response.text();
    } catch (cause) {
      throw new ManifestNetworkError(`Manifest transport failed while reading: ${url}`, cause);
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function inspectDemoManifest(body: string, remoteName: string, sha256String: (value: string) => Promise<string>): Promise<ValidManifestInfo> {
  const expected = expectedName[remoteName];
  if (!expected) throw new Error(`Unsupported demo remote alias: ${remoteName}`);
  const manifest: unknown = JSON.parse(body);
  if (!isObject(manifest) || !isObject(manifest.metaData)) throw new Error('MF manifest metadata is missing');
  const metadata = manifest.metaData;
  if (manifest.name !== expected || metadata.name !== expected) throw new Error(`MF manifest name does not match ${remoteName}`);
  if (!isObject(metadata.remoteEntry) || typeof metadata.remoteEntry.name !== 'string' || !isObject(metadata.buildInfo) || !isHash(metadata.buildInfo.hash)) throw new Error('MF manifest remoteEntry/buildInfo is malformed');
  if (!Array.isArray(manifest.exposes) || !Array.isArray(manifest.shared)) throw new Error('MF manifest exposes/shared must be arrays');
  if (!Array.isArray(manifest.remotes) || manifest.remotes.length !== 0) throw new Error('Build-once remotes must have an empty remote graph');
  const hashes: Record<string, string> = {};
  const add = (key: string, hash: unknown) => {
    if (!isHash(hash)) throw new Error(`MF manifest has no raw SHA-256 for ${key}`);
    hashes[key] = hash;
  };
  add(String(metadata.remoteEntry.name), metadata.buildInfo.hash);
  for (const expose of manifest.exposes) {
    if (!isObject(expose) || typeof expose.name !== 'string' || !isObject(expose.assets)) throw new Error('MF manifest expose is malformed');
    const js = isObject(expose.assets.js) ? expose.assets.js : {};
    if (!Array.isArray(js.async) || js.async.length) throw new Error(`Exposed module ${expose.name} has unverifiable async executable assets`);
    add(`exposed/${expose.name}.bundle`, expose.hash);
  }
  for (const shared of manifest.shared) {
    if (!isObject(shared) || typeof shared.name !== 'string' || !isObject(shared.assets)) throw new Error('MF manifest shared entry is malformed');
    const js = isObject(shared.assets.js) ? shared.assets.js : {};
    if (!Array.isArray(js.async) || js.async.length) throw new Error(`Shared module ${shared.name} has unverifiable async executable assets`);
    const sync = Array.isArray(js.sync) ? js.sync : [];
    if (!sync.length) continue;
    if (sync.length !== 1 || typeof sync[0] !== 'string') throw new Error(`Shared module ${shared.name} has unverifiable executable assets`);
    add(sync[0].replace(/^\.\//, '').replace(/\.\w+$/, '.bundle'), shared.hash);
  }
  const pairs = Object.entries(hashes).sort(([left], [right]) => left.localeCompare(right));
  return {executableHashes: hashes, executableArtifactSetId: await sha256String(JSON.stringify(pairs))};
}

function validateUrl(url: string): URL {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !parsed.pathname.endsWith('/mf-manifest.json')) throw new Error('Demo MF manifest URL must be HTTPS and end in /mf-manifest.json');
  return parsed;
}

function parseEnvelope(value: unknown): ManifestEnvelope | null {
  if (!isObject(value) || typeof value.manifestUrl !== 'string' || typeof value.remoteName !== 'string' || typeof value.body !== 'string' || typeof value.sha256 !== 'string') return null;
  return {manifestUrl: value.manifestUrl, remoteName: value.remoteName, body: value.body, sha256: value.sha256};
}

export function createDemoManifestCache({runId, native, requestText = requestManifestText}: DemoManifestCacheOptions) {
  if (!runId) throw new Error('Build-once manifest cache requires a run identifier');
  async function get(manifestUrl: string, remoteName: string): Promise<{body: string; source: 'network' | 'native-cache'}> {
    validateUrl(manifestUrl);
    if (!(remoteName in expectedName)) throw new Error(`Unsupported demo remote alias: ${remoteName}`);
    let body: string;
    try {
      body = await requestText(manifestUrl);
    } catch (error) {
      if (!(error instanceof ManifestNetworkError)) throw error;
      const directory = await native.getDocumentDirectory();
      if (!directory) throw new Error('Native document directory is unavailable');
      const urlDigest = await native.sha256String(manifestUrl);
      const cachePath = `${directory.replace(/\/$/, '')}/zephyr-build-once-demo/manifests/${runId}/${urlDigest}.json`;
      if (!(await native.fileExists(cachePath))) throw error;
      const storedText = await native.readFile(cachePath, 'utf8');
      let envelope: ManifestEnvelope | null = null;
      try { envelope = parseEnvelope(JSON.parse(storedText)); } catch { envelope = null; }
      if (!envelope || envelope.manifestUrl !== manifestUrl || envelope.remoteName !== remoteName || !isHash(envelope.sha256)) throw error;
      const actualDigest = await native.sha256String(envelope.body);
      if (actualDigest !== envelope.sha256) throw error;
      try { await inspectDemoManifest(envelope.body, remoteName, value => native.sha256String(value)); } catch { throw error; }
      return {body: envelope.body, source: 'native-cache'};
    }
    await inspectDemoManifest(body, remoteName, value => native.sha256String(value));
    const directory = await native.getDocumentDirectory();
    if (!directory) throw new Error('Native document directory is unavailable');
    const urlDigest = await native.sha256String(manifestUrl);
    const bodyDigest = await native.sha256String(body);
    const cachePath = `${directory.replace(/\/$/, '')}/zephyr-build-once-demo/manifests/${runId}/${urlDigest}.json`;
    const envelope: ManifestEnvelope = {manifestUrl, remoteName, body, sha256: bodyDigest};
    const encoded = JSON.stringify(envelope);
    await native.writeFile(cachePath, encoded, 'utf8');
    const persisted = parseEnvelope(JSON.parse(await native.readFile(cachePath, 'utf8')));
    if (!persisted || persisted.manifestUrl !== manifestUrl || persisted.remoteName !== remoteName || persisted.body !== body || persisted.sha256 !== bodyDigest || await native.sha256String(persisted.body) !== bodyDigest) {
      throw new Error('Native manifest write did not persist verified contents');
    }
    return {body, source: 'network'};
  }
  return {get};
}

import {createHash} from 'node:crypto';
import {readdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import {manifestArtifactMap, logicalArtifactMap} from './remote-artifacts.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const executableSetId = hashes => sha256(JSON.stringify(Object.entries(hashes).sort(([left], [right]) => left.localeCompare(right))));
const asPathMap = artifacts => Object.fromEntries(Object.entries(artifacts).map(([url, hash]) => {
  const parsed = new URL(url, 'https://canonical.invalid');
  return [decodeURIComponent(parsed.pathname).replace(/^\/+/, ''), hash];
}));

/**
 * @typedef {object} CanonicalArtifactSet
 * @property {Record<string,string>} executableHashes Raw SHA-256 digests keyed by bundle-relative path.
 * @property {string} executableArtifactSetId Identity of sorted executable path/digest pairs.
 * @property {string} mfManifestSha256 Raw SHA-256 of mf-manifest.json.
 * @property {Record<string,string>} otherFileHashes Raw digests of non-bundle, non-map published files.
 */
/** @typedef {{manifestUrl:string,servedManifestSha256:string,executableHashes:Record<string,string>,executableArtifactSetId:string}} ArtifactVerification */

async function listFiles(root, directory = root) {
  const result = [];
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(root, full));
    else if (entry.isFile()) result.push(path.relative(root, full).split(path.sep).join('/'));
  }
  return result.sort();
}

function expectedManifestHashes(manifestText) {
  const manifest = JSON.parse(manifestText);
  const parsed = manifestArtifactMap(manifest, 'https://canonical.invalid/mf-manifest.json');
  return asPathMap(logicalArtifactMap(parsed.artifacts));
}

/** @param {string} directory @returns {Promise<CanonicalArtifactSet>} */
export async function readCanonicalArtifactSet(directory) {
  const files = await listFiles(directory);
  if (!files.length) throw new Error(`Compiled artifact directory is empty: ${directory}`);
  const raw = new Map();
  for (const relative of files) raw.set(relative, await readFile(path.join(directory, relative)));
  const manifestBytes = raw.get('mf-manifest.json');
  if (!manifestBytes?.length) throw new Error('Compiled output is missing nonempty mf-manifest.json');
  const declared = expectedManifestHashes(manifestBytes.toString('utf8'));
  const executableHashes = Object.fromEntries([...raw.entries()].filter(([file]) => file.endsWith('.bundle')).map(([file, bytes]) => [file, sha256(bytes)]).sort(([left], [right]) => left.localeCompare(right)));
  if (!Object.keys(executableHashes).length) throw new Error('Compiled output has no executable bundle files');
  for (const [file, hash] of Object.entries(declared)) {
    if (executableHashes[file] !== hash.toLowerCase()) throw new Error(`MF manifest executable mismatch for ${file}: expected ${hash}, observed ${executableHashes[file] ?? 'missing'}`);
  }
  for (const file of Object.keys(executableHashes)) {
    if (!(file in declared)) throw new Error(`Compiled executable is not declared by MF manifest: ${file}`);
  }
  const otherFileHashes = Object.fromEntries([...raw.entries()].filter(([file]) => file !== 'mf-manifest.json' && !file.endsWith('.bundle') && !file.endsWith('.map')).map(([file, bytes]) => [file, sha256(bytes)]));
  return {executableHashes, executableArtifactSetId: executableSetId(executableHashes), mfManifestSha256: sha256(manifestBytes), otherFileHashes};
}

function timeoutFetch(request, url) {
  return request(url, {method: 'GET', signal: AbortSignal.timeout(10_000)});
}

function artifactBase(manifest, manifestUrl) {
  const publicPath = manifest.metaData?.publicPath;
  if (typeof publicPath === 'string' && publicPath !== 'auto' && /^https:\/\//i.test(publicPath)) return publicPath;
  return new URL('.', manifestUrl).toString().replace(/\/$/, '');
}

function remoteArtifacts(manifest, manifestUrl) {
  const base = new URL(`${artifactBase(manifest, manifestUrl).replace(/\/+$/, '')}/`);
  const basePath = decodeURIComponent(base.pathname);
  const artifactMap = manifestArtifactMap(manifest, manifestUrl).artifacts;
  return Object.fromEntries(Object.entries(artifactMap).map(([url, hash]) => {
    const pathname = decodeURIComponent(new URL(url).pathname);
    if (!pathname.startsWith(basePath)) throw new Error(`Artifact URL is outside its manifest public path: ${url}`);
    return [pathname.slice(basePath.length), hash];
  }));
}

/** @param {string} manifestUrl @param {CanonicalArtifactSet} expected @param {typeof fetch} [request] @returns {Promise<ArtifactVerification>} */
export async function verifyManifestArtifactSet(manifestUrl, expected, request = globalThis.fetch) {
  const parsedUrl = new URL(manifestUrl);
  if (parsedUrl.protocol !== 'https:') throw new Error(`Manifest URL must use HTTPS: ${manifestUrl}`);
  const manifestResponse = await timeoutFetch(request, manifestUrl);
  if (!manifestResponse.ok) throw new Error(`Manifest GET failed with HTTP ${manifestResponse.status}: ${manifestUrl}`);
  const manifestText = await manifestResponse.text();
  const servedManifestSha256 = sha256(Buffer.from(manifestText));
  const manifest = JSON.parse(manifestText);
  const artifacts = remoteArtifacts(manifest, manifestUrl);
  const actualBundlePaths = Object.keys(artifacts).filter(file => file.endsWith('.bundle')).sort();
  const expectedPaths = Object.keys(expected.executableHashes).sort();
  if (JSON.stringify(actualBundlePaths) !== JSON.stringify(expectedPaths)) throw new Error(`Executable path set mismatch: expected ${expectedPaths.join(',')}; observed ${actualBundlePaths.join(',')}`);
  const executableHashes = {};
  for (const [relativePath, declaredHash] of Object.entries(artifacts)) {
    const url = new URL(relativePath, `${artifactBase(manifest, manifestUrl)}/`);
    url.search = '';
    const response = await timeoutFetch(request, url.toString());
    if (!response.ok) throw new Error(`Artifact GET failed for ${relativePath}: HTTP ${response.status}`);
    const observed = sha256(Buffer.from(await response.arrayBuffer()));
    const canonical = expected.executableHashes[relativePath];
    if (relativePath.endsWith('.bundle')) {
      if (!canonical || observed !== canonical || observed !== declaredHash.toLowerCase()) throw new Error(`Executable digest mismatch for ${relativePath}: expected ${canonical ?? declaredHash}, observed ${observed}`);
      executableHashes[relativePath] = observed;
    } else if (relativePath in expected.otherFileHashes && observed !== expected.otherFileHashes[relativePath]) {
      throw new Error(`Artifact digest mismatch for ${relativePath}: expected ${expected.otherFileHashes[relativePath]}, observed ${observed}`);
    }
  }
  for (const [relativePath, expectedHash] of Object.entries(expected.otherFileHashes)) {
    const url = new URL(relativePath, `${artifactBase(manifest, manifestUrl)}/`);
    url.search = '';
    const response = await timeoutFetch(request, url.toString());
    if (!response.ok) throw new Error(`Artifact GET failed for ${relativePath}: HTTP ${response.status}`);
    const observed = sha256(Buffer.from(await response.arrayBuffer()));
    if (observed !== expectedHash) throw new Error(`Artifact digest mismatch for ${relativePath}: expected ${expectedHash}, observed ${observed}`);
  }
  return {manifestUrl, servedManifestSha256, executableHashes, executableArtifactSetId: executableSetId(executableHashes)};
}

/** @param {string} manifestUrl @param {CanonicalArtifactSet} expected @param {number} [timeoutMs] @returns {Promise<ArtifactVerification>} */
export async function waitForManifestArtifactSet(manifestUrl, expected, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  do {
    try { return await verifyManifestArtifactSet(manifestUrl, expected); }
    catch (error) { lastError = error; }
    if (Date.now() >= deadline) break;
    await new Promise(resolve => setTimeout(resolve, Math.min(3_000, Math.max(0, deadline - Date.now()))));
  } while (Date.now() < deadline);
  throw new Error(`Timed out waiting for artifact set at ${manifestUrl}: ${lastError instanceof Error ? lastError.message : String(lastError)}`, {cause: lastError});
}

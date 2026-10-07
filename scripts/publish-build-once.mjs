#!/usr/bin/env node
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {mkdir, readdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readCanonicalArtifactSet, waitForManifestArtifactSet} from './lib/build-once-artifacts.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const allowed = new Set(['mini:v1', 'mini:v2', 'nested-mini:v1']);
const secrets = ['ZE_SECRET_TOKEN', 'ZE_CI_TOKEN', 'ZE_SERVER_TOKEN'];

function usage() {
  console.log('Usage: node scripts/publish-build-once.mjs <mini|nested-mini> <v1|v2> --run-id <uuid>');
}
function requiredArg(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
function redact(text) {
  let safe = String(text);
  for (const key of secrets) if (process.env[key]) safe = safe.split(process.env[key]).join('[REDACTED]');
  return safe;
}
function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {...options, stdio: 'inherit'});
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve(0) : reject(Object.assign(new Error(`${command} exited with status ${code}`), {exitCode: code})));
  });
}
function gitRevision() {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['rev-parse', 'HEAD'], {cwd: repoRoot, env: process.env, stdio: ['ignore', 'pipe', 'ignore']});
    let output = '';
    child.stdout.setEncoding('utf8').on('data', part => { output += part; });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve(output.trim()) : reject(new Error('Unable to read source git revision')));
  });
}

const [remote, release, ...args] = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) { usage(); process.exit(0); }
const runId = requiredArg(args, '--run-id');
if (!allowed.has(`${remote}:${release}`) || !runId || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(runId)) {
  usage();
  throw new Error('Select mini v1/v2 or nested-mini v1 and provide --run-id <uuid>');
}
const targetApp = remote === 'mini' ? 'cache-test-mini' : 'cache-test-nested-mini';
const appDir = path.join(repoRoot, 'apps', remote);
const releaseDir = path.join(repoRoot, 'build', 'build-once', runId, remote, release);
const compiledParent = path.join(releaseDir, 'compiled');
const compiledDir = path.join(compiledParent, 'ios');
const evidence = {runId, remote, release, sourcePlatform: 'ios', canonicalDirectory: compiledDir, publications: []};
let compilerInvocation;
let failure;
let canonical;

try {
  const prior = await readdir(releaseDir).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
  if (prior?.length) throw new Error(`Release output directory must be new and empty: ${releaseDir}`);
  await mkdir(compiledParent, {recursive: true});
  evidence.sourceRevision = await gitRevision();
  const siblingDir = path.resolve(repoRoot, process.env.ZEPHYR_PACKAGES_DIR || '../zephyr-packages');
  const siblingPackageJson = path.join(siblingDir, 'libs/zephyr-metro-plugin/package.json');
  let publicationApi;
  try {
    const siblingRequire = createRequire(siblingPackageJson);
    publicationApi = siblingRequire('zephyr-metro-plugin');
    if (typeof publicationApi.publishPrebuiltMetroArtifacts !== 'function') throw new Error('missing public API');
  } catch (cause) {
    throw new Error('Build sibling zephyr-metro-plugin with prebuilt publication support before running this demo', {cause});
  }
  const appRequire = createRequire(path.join(appDir, 'package.json'));
  const factory = appRequire('./federation.config.cjs').createFederationConfig;
  const mfConfig = factory({version: release, buildOnce: true});
  const command = 'pnpm';
  const argv = ['--filter', targetApp, 'exec', 'rnef', 'bundle-mf-remote', '--platform', 'ios', '--dev', 'false', '--output', compiledParent];
  const childEnv = {...process.env};
  for (const name of secrets) delete childEnv[name];
  delete childEnv.ZEPHYR_DISTRIBUTION;
  childEnv.REMOTE_VERSION = release;
  childEnv.ZEPHYR_BUILD_ONCE_DEMO = '1';
  childEnv.ZEPHYR_E2E = '0';
  compilerInvocation = {command, argv, cwd: repoRoot, startedAt: new Date().toISOString(), exitCode: null};
  try {
    await run(command, argv, {cwd: repoRoot, env: childEnv, extendEnv: false});
    compilerInvocation.exitCode = 0;
  } catch (error) {
    compilerInvocation.exitCode = Number.isInteger(error.exitCode) ? error.exitCode : 1;
    throw error;
  } finally {
    compilerInvocation.endedAt = new Date().toISOString();
    evidence.compiler = compilerInvocation;
  }
  const canonicalSet = await readCanonicalArtifactSet(compiledDir);
  canonical = canonicalSet;
  Object.assign(evidence, canonicalSet);
  const results = await publicationApi.publishPrebuiltMetroArtifacts({context: appDir, artifactDirectory: compiledDir, mfConfig, targets: ['ios', 'android']});
  evidence.publications = results.map(result => ({...result, manifestUrl: `${result.versionUrl.replace(/\/+$/, '')}/mf-manifest.json`}));
  for (const publication of evidence.publications) {
    const verified = await waitForManifestArtifactSet(publication.manifestUrl, canonicalSet);
    publication.verifiedExecutableHashes = verified.executableHashes;
    publication.servedManifestSha256 = verified.servedManifestSha256;
  }
} catch (error) {
  failure = redact(error instanceof Error ? error.message : error);
  if (Array.isArray(error?.completed)) {
    evidence.publications = error.completed.map(result => ({...result, manifestUrl: `${result.versionUrl.replace(/\/+$/, '')}/mf-manifest.json`}));
  }
} finally {
  if (compilerInvocation) evidence.compiler = compilerInvocation;
  if (failure) evidence.failure = failure;
  await mkdir(releaseDir, {recursive: true});
  await writeFile(path.join(releaseDir, 'release.json'), `${JSON.stringify(evidence, null, 2)}\n`);
}
if (failure) {
  console.error(`Build-once publication failed: ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Published ${remote} ${release}: one iOS compilation, ${evidence.publications.length} verified target registrations.`);
}

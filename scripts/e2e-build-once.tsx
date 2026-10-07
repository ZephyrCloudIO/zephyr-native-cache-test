import {createHash, randomUUID} from 'node:crypto';
import {access, lstat, mkdir, readFile, readdir, readlink, writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execa} from 'execa';
import {androidApkPath, findIosAppPath, installDemoDevice, uninstallDemoDevice, type DemoDevice} from './lib/e2e-devices.js';
import {cleanHostBuildCaches, type TaskDef, pause, runTaskPipeline} from './lib/e2e-runtime.js';
import {waitForManifestArtifactSet} from './lib/build-once-artifacts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = path.join(ROOT, 'apps/host');
const RUN_ID = randomUUID();
const RUN_DIR = path.join(ROOT, 'build/build-once', RUN_ID);
const EVIDENCE_PATH = path.join(RUN_DIR, 'evidence.json');
const MESSAGE = `Zephyr build-once ${RUN_ID}`;
const MESSAGE_SHA256 = createHash('sha256').update(MESSAGE, 'utf8').digest('hex');
const TAG_GUIDE = 'https://docs.zephyr-cloud.io/features/tags-environments';
const releases = [
  {remote: 'mini', release: 'v1'},
  {remote: 'mini', release: 'v2'},
  {remote: 'nested-mini', release: 'v1'},
] as const;
const appIds = {ios: 'io.zephyr-cloud.health', android: 'com.mf.example.host'} as const;
let offlineNetworkRestoreRequired = false;
process.on('SIGINT', () => {
  if (offlineNetworkRestoreRequired) process.stderr.write('\nInterrupted during the offline gate; restore workstation internet manually.\n');
});

type Platform = 'ios' | 'android';
type ReleaseKey = 'mini:v1' | 'mini:v2' | 'nested-mini:v1';
interface ReleaseEvidence {
  runId: string;
  remote: string;
  release: string;
  sourcePlatform: 'ios';
  sourceRevision: string;
  canonicalDirectory: string;
  executableHashes: Record<string, string>;
  executableArtifactSetId: string;
  mfManifestSha256: string;
  otherFileHashes: Record<string, string>;
  compiler: {command: string; argv: string[]; cwd: string; startedAt: string; endedAt: string; exitCode: number};
  publications: Array<{target: Platform; applicationUid: string; buildId: string; snapshotId: string; versionUrl: string; manifestUrl: string; verifiedExecutableHashes?: Record<string, string>; servedManifestSha256?: string}>;
  failure?: string;
}
interface Evidence {
  runId: string;
  message: string;
  messageSha256: string;
  commands: Array<Record<string, unknown>>;
  stages: Record<string, {status: 'done' | 'failed'; startedAt: string; endedAt: string; error?: string}>;
  successfulRegistrations: ReleaseEvidence['publications'];
  screenshots: string[];
  hostBinaries: Partial<Record<Platform, {path: string; sha256: string; tree?: Record<string, string>}>>;
  selectorManifestUrls: Partial<Record<Platform, Record<string, string>>>;
  baselineCompletedAt?: string;
  remoteReleases: Record<ReleaseKey, ReleaseEvidence>;
  success?: boolean;
}
const evidence: Evidence = {runId: RUN_ID, message: MESSAGE, messageSha256: MESSAGE_SHA256, commands: [], stages: {}, successfulRegistrations: [], screenshots: [], hostBinaries: {}, selectorManifestUrls: {}, remoteReleases: {} as Evidence['remoteReleases']};
const devices: Record<Platform, DemoDevice> = {
  ios: {platform: 'ios', id: '', appId: appIds.ios},
  android: {platform: 'android', id: '', appId: appIds.android},
};

function logOutput(log: (message: string) => void, output: string) {
  for (const line of output.split(/\r?\n/)) if (line.trim()) log(line);
}
async function command(command: string, argv: string[], cwd: string, log: (message: string) => void, env?: NodeJS.ProcessEnv, metadata: Record<string, unknown> = {}) {
  const startedAt = new Date().toISOString();
  const record: Record<string, unknown> = {command, argv, cwd, ...metadata, startedAt};
  try {
    const result = await execa(command, argv, {cwd, env, reject: false, all: true});
    logOutput(log, result.all ?? '');
    record.endedAt = new Date().toISOString();
    record.exitCode = result.exitCode;
    if (result.exitCode !== 0) throw new Error(`${command} exited with status ${result.exitCode}`);
    return record;
  } catch (error) {
    record.endedAt = new Date().toISOString();
    record.exitCode = Number.isInteger((error as {exitCode?: number}).exitCode) ? (error as {exitCode: number}).exitCode : 1;
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), {commandRecord: record});
  }
}
async function saveEvidence() {
  await mkdir(RUN_DIR, {recursive: true});
  await writeFile(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
}
async function stage(name: string, log: (message: string) => void, work: () => Promise<void>) {
  const startedAt = new Date().toISOString();
  try {
    await work();
    evidence.stages[name] = {status: 'done', startedAt, endedAt: new Date().toISOString()};
    await saveEvidence();
  } catch (error) {
    if ((error as {commandRecord?: Record<string, unknown>}).commandRecord) evidence.commands.push((error as {commandRecord: Record<string, unknown>}).commandRecord);
    evidence.stages[name] = {status: 'failed', startedAt, endedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error)};
    await saveEvidence();
    throw error;
  }
}
function help() {
  console.log('Usage: pnpm run e2e:build-once [--ios-device <udid>] [--android-device <serial>] [--preflight]');
}
function argValue(args: string[], key: string) {
  const index = args.indexOf(key);
  return index >= 0 ? args[index + 1] : undefined;
}
function siblingApiAvailable(): boolean {
  try {
    const sibling = path.resolve(ROOT, process.env.ZEPHYR_PACKAGES_DIR || '../zephyr-packages');
    const anchor = path.join(sibling, 'libs/zephyr-metro-plugin/package.json');
    const plugin = createRequire(anchor)('zephyr-metro-plugin') as {publishPrebuiltMetroArtifacts?: unknown};
    return typeof plugin.publishPrebuiltMetroArtifacts === 'function';
  } catch { return false; }
}
async function checkTool(name: string) {
  const result = await execa('which', [name], {reject: false});
  if (result.exitCode !== 0) throw new Error(`Required tool is not on PATH: ${name}`);
}
async function checkOutputParent() {
  let directory = path.join(ROOT, 'build');
  while (true) {
    try { await access(directory, constants.W_OK); return directory; }
    catch {
      const parent = path.dirname(directory);
      if (parent === directory) throw new Error(`No writable parent directory for ${directory}`);
      directory = parent;
    }
  }
}
async function bootedIosDevices(): Promise<Array<{udid: string; name?: string}>> {
  const result = await execa('xcrun', ['simctl', 'list', 'devices', 'booted', '-j'], {reject: false});
  if (result.exitCode !== 0) return [];
  const data = JSON.parse(result.stdout) as {devices?: Record<string, Array<{udid: string; name?: string; state?: string}>>};
  return Object.values(data.devices ?? {}).flat().filter(device => device.state === 'Booted');
}
async function onlineAndroidEmulators(): Promise<string[]> {
  const result = await execa('adb', ['devices'], {reject: false});
  if (result.exitCode !== 0) return [];
  return result.stdout.split(/\r?\n/).slice(1).map(line => line.trim().split(/\s+/)).filter(parts => parts.length >= 2 && parts[1] === 'device' && parts[0].startsWith('emulator-')).map(parts => parts[0]!);
}
async function recordDeviceInstall(
  kind: 'install' | 'uninstall',
  stageName: string,
  platform: Platform,
  operation: (record: (binary: string, argv: string[]) => void) => Promise<void>,
) {
  let record: Record<string, unknown> | undefined;
  const startedAt = new Date().toISOString();
  try {
    await operation((commandName, argv) => {
      record = {kind, remote: 'host', release: stageName, platform, command: commandName, argv, startedAt};
    });
    if (record) Object.assign(record, {endedAt: new Date().toISOString(), exitCode: 0});
    if (record) evidence.commands.push(record);
  } catch (error) {
    if (record) {
      Object.assign(record, {endedAt: new Date().toISOString(), exitCode: 1});
      evidence.commands.push(record);
    }
    throw error;
  }
}
async function preflight(args: string[], log: (message: string) => void) {
  if (process.env.ZEPHYR_DISTRIBUTION || process.env.ZE_ENV) throw new Error('Build-once dashboard runs reject ZEPHYR_DISTRIBUTION and ZE_ENV');
  if (process.env.ZEPHYR_E2E !== '1' || process.env.ZEPHYR_BUILD_ONCE_DEMO !== '1') throw new Error('Build-once runner requires ZEPHYR_E2E=1 and ZEPHYR_BUILD_ONCE_DEMO=1');
  if (!process.env.ZE_SECRET_TOKEN) throw new Error('Missing required env var: ZE_SECRET_TOKEN. See .env.e2e.example.');
  const required = ['node', 'pnpm', 'git', 'maestro', 'xcrun', 'adb', 'xcodebuild'];
  for (const tool of required) await checkTool(tool);
  if (!siblingApiAvailable()) throw new Error('Build sibling zephyr-metro-plugin with prebuilt publication support before running this demo');
  const iosId = argValue(args, '--ios-device') || process.env.ZE_IOS_UDID;
  const androidId = argValue(args, '--android-device') || process.env.ZE_ANDROID_SERIAL;
  const iosAvailable = await bootedIosDevices();
  const androidAvailable = await onlineAndroidEmulators();
  if (!iosId || !iosAvailable.some(device => device.udid === iosId)) throw new Error(`Select one explicitly identified Booted iOS Simulator with --ios-device or ZE_IOS_UDID. Available booted IDs: ${iosAvailable.map(device => `${device.udid}${device.name ? ` (${device.name})` : ''}`).join(', ') || '(none)'}`);
  if (!androidId || !androidAvailable.includes(androidId)) throw new Error(`Select one explicitly identified online Android Emulator with --android-device or ZE_ANDROID_SERIAL. Available emulator IDs: ${androidAvailable.join(', ') || '(none)'}`);
  devices.ios.id = iosId;
  devices.android.id = androidId;
  await checkOutputParent();
  log(`Selected iOS Simulator ${iosId} and Android Emulator ${androidId}.`);
  log('ZE_SECRET_TOKEN=<set>');
}
async function captureTree(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  async function walk(directory: string) {
    for (const name of (await readdir(directory)).sort()) {
      const target = path.join(directory, name);
      const key = path.relative(root, target).split(path.sep).join('/');
      const stat = await lstat(target);
      if (stat.isSymbolicLink()) result[key] = `symlink:${await readlink(target)}`;
      else if (stat.isDirectory()) await walk(target);
      else if (stat.isFile()) result[key] = createHash('sha256').update(await readFile(target)).digest('hex');
    }
  }
  await walk(root);
  return result;
}
function treeDigest(tree: Record<string, string>) {
  return createHash('sha256').update(JSON.stringify(Object.entries(tree).sort(([left], [right]) => left.localeCompare(right)))).digest('hex');
}
async function collectScreenshots(directory: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(current: string) {
    for (const name of (await readdir(current)).sort()) {
      const target = path.join(current, name);
      const stat = await lstat(target);
      if (stat.isDirectory()) await walk(target);
      else if (stat.isFile() && /\.(?:png|jpe?g)$/i.test(name)) found.push(target);
    }
  }
  await walk(directory);
  return found;
}
async function getSelectorUrls(platform: Platform): Promise<Record<string, string>> {
  const manifestPath = path.join(HOST, 'assets/zephyr-manifest.json');
  const parsed = JSON.parse(await readFile(manifestPath, 'utf8')) as {dependencies?: Record<string, unknown>};
  if (!parsed.dependencies) throw new Error(`Host Zephyr manifest has no dependencies: ${manifestPath}`);
  const urls: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed.dependencies)) {
    if (!value || typeof value !== 'object') continue;
    const record = value as Record<string, unknown>;
    const name = key.toLowerCase().includes('nested') ? 'nestedMini' : key.toLowerCase().includes('mini') ? 'mini' : '';
    if (name && typeof record.manifest_url === 'string') urls[name] = record.manifest_url;
  }
  if (!urls.mini || !urls.nestedMini) throw new Error(`Host Zephyr manifest is missing the mini/nestedMini manifest_url entries for ${platform}`);
  return urls;
}
async function runMaestro(platform: Platform, stageName: string, flowName: string, expected: Record<string, string>, log: (message: string) => void, noReinstallDriver = false) {
  const output = path.join(RUN_DIR, platform, stageName);
  const debug = path.join(output, 'debug');
  await mkdir(output, {recursive: true});
  const argv = ['--platform', platform, '--device', devices[platform].id, 'test'];
  if (noReinstallDriver) argv.push('--no-reinstall-driver');
  for (const [key, value] of Object.entries({APP_ID: devices[platform].appId, PLATFORM: platform, RUN_ID: RUN_ID, MESSAGE, SHA256: MESSAGE_SHA256, ...expected})) argv.push('-e', `${key}=${value}`);
  argv.push('--test-output-dir', output, '--debug-output', debug, path.join(HOST, 'e2e/flows', flowName));
  try {
    const record = await command('maestro', argv, ROOT, log, undefined, {kind: 'flow', remote: 'host', release: stageName, platform});
    evidence.commands.push(record);
  } finally {
    evidence.screenshots = [...new Set([...evidence.screenshots, ...(await collectScreenshots(output))])];
    await saveEvidence();
  }
}
function canonical(release: string, remote: string): ReleaseEvidence {
  return evidence.remoteReleases[`${remote}:${release}` as ReleaseKey];
}
function expectedFlowEvidence(release: 'v1' | 'v2', mini: ReleaseEvidence, nested: ReleaseEvidence) {
  const requiredHash = (artifacts: ReleaseEvidence, key: string) => {
    const value = artifacts.executableHashes[key];
    if (!value) throw new Error(`Expected canonical executable hash is missing: ${key}`);
    return value;
  };
  return {
    MINI_VERSION: release,
    NESTED_MINI_VERSION: 'v1',
    MINI_ARTIFACT_ID: mini.executableArtifactSetId,
    NESTED_MINI_ARTIFACT_ID: nested.executableArtifactSetId,
    EXPECTED_MINI_BUNDLE_HASH: requiredHash(mini, 'mini.bundle'),
    EXPECTED_NESTED_MINI_BUNDLE_HASH: requiredHash(nested, 'nestedMini.bundle'),
    EXPECTED_STATS_HASH: requiredHash(mini, 'exposed/StatsCard.bundle'),
    EXPECTED_NATIVE_HASH: requiredHash(mini, 'exposed/NativeCapabilityCard.bundle'),
    EXPECTED_DEPLOY_HASH: requiredHash(mini, 'exposed/DeployCard.bundle'),
    EXPECTED_CALORIE_HASH: requiredHash(mini, 'exposed/CalorieCard.bundle'),
    EXPECTED_ACTIVITY_HASH: requiredHash(nested, 'exposed/ActivityFeed.bundle'),
    EXPECTED_CACHE_INFO_HASH: requiredHash(nested, 'exposed/CacheInfo.bundle'),
    EXPECTED_HYDRATION_HASH: requiredHash(nested, 'exposed/HydrationCard.bundle'),
    NATIVE_STATE: 'loaded',
  };
}
async function fetchIsReachable(manifestUrl: string): Promise<boolean> {
  const url = new URL(manifestUrl);
  url.searchParams.set('buildOnceOfflineProbe', randomUUID());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try { await fetch(url.toString(), {method: 'GET', cache: 'no-store', headers: {'cache-control': 'no-cache, no-store', pragma: 'no-cache'}, signal: controller.signal}); return true; }
  catch { return false; }
  finally { clearTimeout(timer); }
}
async function waitForInternet(log: (message: string) => void, urls: string[]) {
  while (true) {
    await pause('Restore workstation internet access, then continue. The runner never changes network settings.', log, {label: 'RESTORE INTERNET'});
    const results = await Promise.all(urls.map(fetchIsReachable));
    if (results.every(Boolean)) return;
    log('At least one workstation manifest probe still fails; restore connectivity and retry.');
  }
}
async function buildRemote(remote: string, release: string, log: (message: string) => void) {
  const key = `${remote}:${release}` as ReleaseKey;
  const argv = ['scripts/publish-build-once.mjs', remote, release, '--run-id', RUN_ID];
  let commandRecord: Record<string, unknown> | undefined;
  try {
    commandRecord = await command('node', argv, ROOT, log, undefined, {kind: 'publisher', remote, release, platform: 'ios'});
  } catch (error) {
    commandRecord = (error as {commandRecord?: Record<string, unknown>}).commandRecord;
    if (commandRecord) evidence.commands.push({...commandRecord, kind: 'publisher', remote, release, platform: 'ios'});
    const pathToRelease = path.join(RUN_DIR, remote, release, 'release.json');
    try { evidence.remoteReleases[key] = JSON.parse(await readFile(pathToRelease, 'utf8')) as ReleaseEvidence; }
    catch { /* publisher failure evidence may not yet have a release file */ }
    const partial = evidence.remoteReleases[key];
    if (partial) {
      if (partial.compiler) evidence.commands.push({...partial.compiler, kind: 'compiler', remote, release, platform: 'ios'});
      evidence.successfulRegistrations.push(...partial.publications);
    }
    throw error;
  }
  if (commandRecord) evidence.commands.push({...commandRecord, kind: 'publisher', remote, release, platform: 'ios'});
  const releasePath = path.join(RUN_DIR, remote, release, 'release.json');
  const built = JSON.parse(await readFile(releasePath, 'utf8')) as ReleaseEvidence;
  evidence.remoteReleases[key] = built;
  evidence.commands.push({...built.compiler, kind: 'compiler', remote, release, platform: 'ios'});
  evidence.successfulRegistrations.push(...built.publications);
  if (built.failure) throw new Error(built.failure);
  if (built.publications.length !== 2 || built.publications.some(publication => !publication.verifiedExecutableHashes)) throw new Error(`Expected two verified target registrations for ${remote} ${release}`);
}
async function verifySelectors(platform: Platform, release: 'v1' | 'v2', log: (message: string) => void) {
  const urls = await getSelectorUrls(platform);
  evidence.selectorManifestUrls[platform] = urls;
  const miniRelease = canonical('mini', release);
  const nestedRelease = canonical('v1', 'nested-mini');
  const mini = await waitForManifestArtifactSet(urls.mini, miniRelease);
  const nested = await waitForManifestArtifactSet(urls.nestedMini, nestedRelease);
  if (mini.executableArtifactSetId !== miniRelease.executableArtifactSetId || nested.executableArtifactSetId !== nestedRelease.executableArtifactSetId) throw new Error(`Selector returned an unexpected artifact set for ${platform}`);
  log(`Verified ${platform} mini ${release} and nested-mini v1 selector artifact sets.`);
}
function dashboardInstructions(action: 'baseline' | 'promote' | 'rollback', log: (message: string) => void) {
  const registrationLines = (remote: 'mini' | 'nested-mini', version: 'v1' | 'v2') => {
    const release = canonical(version, remote);
    return release.publications.map(item => `• ${remote} ${version} ${item.target}: applicationUid=${item.applicationUid}, buildId=${item.buildId}, snapshotId=${item.snapshotId}, version=${item.versionUrl}`).join('\n');
  };
  let message: string;
  if (action === 'baseline') message = `Create version-based BUILD_ONCE_DEMO_IOS and BUILD_ONCE_DEMO_ANDROID environments for mini and nested-mini. Pin each to the captured v1 registration below. Do not use tags/latest, DEMO, or TestFlight.\n${registrationLines('mini', 'v1')}\n${registrationLines('nested-mini', 'v1')}\nGuidance: ${TAG_GUIDE}`;
  else if (action === 'promote') message = `Promote ONLY mini by pinning both dedicated platform environments to the matching captured v2 registrations. Leave nested-mini at v1.\n${registrationLines('mini', 'v2')}\nGuidance: ${TAG_GUIDE}`;
  else message = `Rollback ONLY mini by pinning both dedicated platform environments to the captured v1 registrations. Leave nested-mini at v1.\n${registrationLines('mini', 'v1')}\nGuidance: ${TAG_GUIDE}`;
  return pause(message, log, {label: action === 'baseline' ? 'PIN BASELINE V1' : action === 'promote' ? 'PROMOTE MINI V2' : 'ROLL BACK MINI V1'});
}
async function stopDemoApp(platform: Platform, log: (message: string) => void) {
  const argv = platform === 'ios'
    ? ['simctl', 'terminate', devices[platform].id, devices[platform].appId]
    : ['-s', devices[platform].id, 'shell', 'am', 'force-stop', devices[platform].appId];
  const record = await command(platform === 'ios' ? 'xcrun' : 'adb', argv, ROOT, log, undefined, {kind: 'terminate', remote: 'host', release: 'offline', platform});
  evidence.commands.push(record);
}

const tasks: TaskDef[] = [
  {title: '1 · Preflight and ownership gate', run: async log => stage('preflight', log, async () => {
    await preflight(process.argv.slice(2), log);
    await saveEvidence();
    await pause('Confirm these Zephyr applications/project are demo-owned. Review existing tag-based environments: SDK-created versions can move matching tags automatically. Use only the dedicated version-based BUILD_ONCE_DEMO environments; the runner never targets legacy environments.', log, {label: 'DEMO OWNERSHIP CHECK'});
  })},
  {title: '2 · Compile once and register both targets', run: async log => stage('publish-remotes', log, async () => {
    for (const item of releases) await buildRemote(item.remote, item.release, log);
    if (evidence.commands.filter(record => record.kind === 'compiler').length !== 3 || evidence.successfulRegistrations.length !== 6) throw new Error('Expected exactly three remote compilations and six successful target registrations');
  })},
  {title: '3 · Dashboard pin baseline v1', run: async log => stage('baseline-pin', log, async () => {
    await dashboardInstructions('baseline', log);
  })},
  {title: '4 · Build hosts sequentially', run: async log => stage('host-builds', log, async () => {
    for (const platform of ['ios', 'android'] as const) {
      const target = platform;
      cleanHostBuildCaches(HOST, target);
      const argv = target === 'ios'
        ? ['exec', 'rnef', 'build:ios', '--configuration', 'Release', '--destination', 'simulator']
        : ['exec', 'rnef', 'build:android', '--variant', 'Release'];
      const env = {...process.env, ZEPHYR_E2E: '1', ZEPHYR_BUILD_ONCE_DEMO: '1', ZEPHYR_BUILD_ONCE_RUN_ID: RUN_ID, ZEPHYR_TARGET: target};
      const record = await command('pnpm', argv, HOST, log, env, {kind: 'native-build', remote: 'host', release: 'baseline', platform: target});
      evidence.commands.push(record);
      const binaryPath = target === 'ios' ? findIosAppPath() : androidApkPath(HOST);
      if (target === 'ios') {
        const tree = await captureTree(binaryPath);
        evidence.hostBinaries[target] = {path: binaryPath, sha256: treeDigest(tree), tree};
      } else {
        const binary = await readFile(binaryPath);
        evidence.hostBinaries[target] = {path: binaryPath, sha256: createHash('sha256').update(binary).digest('hex')};
      }
      evidence.selectorManifestUrls[target] = await getSelectorUrls(target);
      await verifySelectors(target, 'v1', log);
      await saveEvidence();
    }
  })},
  {title: '5 · Fresh install and baseline flows', run: async log => stage('baseline', log, async () => {
    for (const platform of ['ios', 'android'] as const) {
      const device = devices[platform];
      const binary = evidence.hostBinaries[platform];
      if (!binary) throw new Error(`Missing ${platform} host build artifact`);
      await recordDeviceInstall('uninstall', 'baseline-uninstall', platform, callback => uninstallDemoDevice(device, ROOT, callback));
      await recordDeviceInstall('install', 'baseline-install', platform, callback => installDemoDevice(device, binary.path, ROOT, callback));
      const mini = canonical('v1', 'mini');
      const nested = canonical('v1', 'nested-mini');
      await runMaestro(platform, 'baseline', 'build-once-baseline.yaml', {...expectedFlowEvidence('v1', mini, nested), NATIVE_STATE: 'saved'}, log);
    }
    evidence.baselineCompletedAt = new Date().toISOString();
    await saveEvidence();
  })},
  {title: '6 · Promote mini only', run: async log => stage('promotion', log, async () => {
    await dashboardInstructions('promote', log);
    for (const platform of ['ios', 'android'] as const) await verifySelectors(platform, 'v2', log);
    for (const platform of ['ios', 'android'] as const) await runMaestro(platform, 'update', 'build-once-update.yaml', expectedFlowEvidence('v2', canonical('v2', 'mini'), canonical('v1', 'nested-mini')), log, true);
  })},
  {title: '7 · Roll back mini only', run: async log => stage('rollback', log, async () => {
    await dashboardInstructions('rollback', log);
    for (const platform of ['ios', 'android'] as const) await verifySelectors(platform, 'v1', log);
    for (const platform of ['ios', 'android'] as const) await runMaestro(platform, 'rollback', 'build-once-rollback.yaml', expectedFlowEvidence('v1', canonical('v1', 'mini'), canonical('v1', 'nested-mini')), log, true);
  })},
  {title: '8 · Offline cold relaunch and restore network', run: async log => stage('offline-cold-launch', log, async () => {
    const urls = (['ios', 'android'] as const).flatMap(platform => Object.values(evidence.selectorManifestUrls[platform] ?? {}));
    let failure: unknown;
    offlineNetworkRestoreRequired = true;
    try {
      await pause('Disconnect ALL workstation internet connections. Keep local simulator/ADB/Maestro control available. Both emulators share this workstation network gate. If interrupted, restore workstation connectivity manually.', log, {label: 'DISCONNECT WORKSTATION NETWORK'});
      for (const url of urls) if (await fetchIsReachable(url)) throw new Error(`Workstation can still reach selector manifest: ${url}`);
      for (const platform of ['ios', 'android'] as const) await runMaestro(platform, 'offline-probe', 'build-once-offline-probe.yaml', expectedFlowEvidence('v1', canonical('v1', 'mini'), canonical('v1', 'nested-mini')), log, true);
      for (const platform of ['ios', 'android'] as const) await stopDemoApp(platform, log);
      for (const platform of ['ios', 'android'] as const) await runMaestro(platform, 'offline', 'build-once-offline.yaml', expectedFlowEvidence('v1', canonical('v1', 'mini'), canonical('v1', 'nested-mini')), log, true);
    } catch (error) { failure = error; }
    finally {
      await waitForInternet(log, urls);
      offlineNetworkRestoreRequired = false;
    }
    if (failure) throw failure;
  })},
  {title: '9 · Verify unchanged hosts and finish evidence', run: async log => stage('complete', log, async () => {
    if (!evidence.baselineCompletedAt) throw new Error('Baseline completion timestamp is missing');
    const baselineTime = Date.parse(evidence.baselineCompletedAt);
    const forbiddenAfterBaseline = evidence.commands.filter(record =>
      ['native-build', 'compiler', 'publisher', 'install', 'uninstall'].includes(String(record.kind)) &&
      typeof record.startedAt === 'string' && Date.parse(record.startedAt) > baselineTime,
    );
    if (forbiddenAfterBaseline.length) throw new Error(`Build/publish/install commands occurred after baseline: ${forbiddenAfterBaseline.map(record => `${record.kind}:${record.platform}`).join(', ')}`);
    for (const platform of ['ios', 'android'] as const) {
      const before = evidence.hostBinaries[platform];
      if (!before) throw new Error(`Missing baseline binary digest for ${platform}`);
      const after = platform === 'ios' ? treeDigest(await captureTree(before.path)) : createHash('sha256').update(await readFile(before.path)).digest('hex');
      if (before.sha256 !== after) throw new Error(`Host binary changed during OTA run: ${platform}`);
    }
    if (evidence.commands.filter(record => record.kind === 'native-build').length !== 2 ||
      evidence.commands.filter(record => record.kind === 'install').length !== 2 ||
      evidence.commands.filter(record => record.kind === 'compiler').length !== 3 ||
      evidence.commands.filter(record => record.kind === 'publisher').length !== 3 ||
      evidence.successfulRegistrations.length !== 6) {
      throw new Error('Build/publish/install command counts differ from the accepted build-once contract');
    }
    evidence.success = true;
    await saveEvidence();
    log(`Evidence written to ${EVIDENCE_PATH}`);
  })},
];

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) { help(); process.exit(0); }
process.on('SIGINT', () => { process.stderr.write('\nRestore workstation internet if the offline stage has begun.\n'); });
if (args.includes('--preflight')) {
  try { await preflight(args, message => console.log(message)); console.log('Build-once preflight passed; no outputs, engines, builds, or installs were created.'); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
} else {
  await runTaskPipeline(tasks, {title: 'Build-once React Native remote showcase', subtitle: 'three remote compilations · six registrations · two unchanged hosts'});
}

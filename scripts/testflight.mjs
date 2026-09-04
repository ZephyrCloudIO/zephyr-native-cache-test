import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename, dirname, join, relative, resolve} from 'node:path';
import zephyrConfig from '../apps/host/zephyr.config.mjs';
import {manifestArtifactMap} from './lib/remote-artifacts.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const WORKSPACE = join(ROOT, 'apps/host/ios/MFExampleHost.xcworkspace');
const SCHEME = 'MFExampleHost';
const VERSION = '1.0.0';
const REQUIRED_XCODE_MAJOR = 26;
const EXPECTED_DEPENDENCIES = {
  mini: 'zephyr:cache-test-mini.zephyr-native-cache-test.zephyrcloudio@testflight',
  nestedMini:
    'zephyr:cache-test-nested-mini.zephyr-native-cache-test.zephyrcloudio@testflight',
};
// Add an exact version only after its fail-closed integrity and staged
// known-good promotion behavior have passed the release regression suite.
const APPROVED_CACHE_VERSIONS = new Set([]);
const CRITICAL_XCODE_ENV = new Set([
  'ZE_FAIL_BUILD',
  'ZE_SECRET_TOKEN',
  'ZEPHYR_DISTRIBUTION',
  'ZEPHYR_E2E',
  'ZEPHYR_TARGET',
]);

function fail(message) {
  throw new Error(message);
}

function environmentWithoutSecret() {
  const environment = {...process.env};
  delete environment.ZE_SECRET_TOKEN;
  return environment;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: options.env ?? environmentWithoutSecret(),
    input: options.input,
    stdio: options.capture ? 'pipe' : 'inherit',
  });
  if (result.status !== 0) {
    fail(options.message ?? `${command} failed with exit code ${result.status}`);
  }
  return options.includeStderr
    ? `${result.stdout ?? ''}${result.stderr ?? ''}`
    : result.stdout ?? '';
}

function parsePlist(path, message = `Unable to read plist: ${path}`) {
  return JSON.parse(
    run('plutil', ['-convert', 'json', '-o', '-', path], {
      capture: true,
      message,
    }),
  );
}

function parsePlistText(source, message) {
  return JSON.parse(
    run('plutil', ['-convert', 'json', '-o', '-', '-'], {
      capture: true,
      input: source,
      message,
    }),
  );
}

function parsePlistKey(path, key, message) {
  const source = run(
    'plutil',
    ['-extract', key, 'xml1', '-o', '-', path],
    {capture: true, message},
  );
  return parsePlistText(source, message);
}

function getBuildNumber() {
  const build = process.env.IOS_BUILD_NUMBER;
  if (!build || !/^[1-9]\d*$/.test(build)) {
    fail('Set IOS_BUILD_NUMBER to the positive App Store Connect build number');
  }
  return build;
}

function getArchiveArgument() {
  return process.argv.slice(3).find(argument => argument !== '--');
}

function requireArtifactEnvironment({team = true} = {}) {
  if (!process.env.IOS_BUNDLE_ID || !/^[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/.test(process.env.IOS_BUNDLE_ID)) {
    fail('Set IOS_BUNDLE_ID to the reserved explicit App ID');
  }
  if (team && (!process.env.APPLE_TEAM_ID || process.env.APPLE_TEAM_ID === 'replace_me')) {
    fail('Set APPLE_TEAM_ID after selecting the Apple Developer team');
  }
  getBuildNumber();
}

function validateExactDependencies(dependencies, source) {
  if (JSON.stringify(dependencies) !== JSON.stringify(EXPECTED_DEPENDENCIES)) {
    fail(`${source} must define exactly the approved TestFlight remote pair`);
  }
}

function rejectXcodeEnvironmentOverrides() {
  for (const file of ['apps/host/ios/.xcode.env', 'apps/host/ios/.xcode.env.local']) {
    const path = join(ROOT, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const name = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/)?.[1];
      if (name && CRITICAL_XCODE_ENV.has(name)) {
        fail(`${file} must not override release variable ${name}`);
      }
    }
  }
}

function validateCommittedBundleIdentifier() {
  const project = readFileSync(
    join(ROOT, 'apps/host/ios/MFExampleHost.xcodeproj/project.pbxproj'),
    'utf8',
  );
  const identifiers = new Set(
    [...project.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map(
      match => match[1].replaceAll('"', ''),
    ),
  );
  if (
    identifiers.size !== 1 ||
    !identifiers.has(process.env.IOS_BUNDLE_ID)
  ) {
    fail('Commit the reserved IOS_BUNDLE_ID in both Xcode target configurations');
  }
}

function validatePublicZephyrUrl(input, {artifact = false} = {}) {
  const url = new URL(input);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    !(
      url.hostname === 'zephyrcloud.app' ||
      url.hostname.endsWith('.zephyrcloud.app')
    )
  ) {
    fail(`URL is not an approved public Zephyr URL: ${url}`);
  }
  const params = [...url.searchParams.entries()];
  if (!artifact && params.length > 0) {
    fail(`Manifest URL must not contain query parameters: ${url}`);
  }
  if (
    artifact &&
    params.some(
      ([key, value]) =>
        !['modulesOnly', 'runModule'].includes(key) ||
        (key === 'modulesOnly' && value !== 'true') ||
        (key === 'runModule' && value !== 'false'),
    )
  ) {
    fail(`Artifact URL contains unapproved query parameters: ${url}`);
  }
  return url;
}

function requireReleaseEnvironment({releaseTrack = 'external'} = {}) {
  requireArtifactEnvironment();
  if (process.env.ZEPHYR_DISTRIBUTION !== 'testflight') {
    fail('ZEPHYR_DISTRIBUTION must be testflight');
  }
  if (!process.env.ZE_SECRET_TOKEN || process.env.ZE_SECRET_TOKEN.includes('replace_me')) {
    fail('Set a real ZE_SECRET_TOKEN in .env.testflight');
  }
  if (process.env.ZEPHYR_TARGET !== 'ios') fail('ZEPHYR_TARGET must be ios');
  if (process.env.ZEPHYR_E2E) fail('ZEPHYR_E2E must be unset for TestFlight');
  if (process.env.ZE_API || process.env.ZE_API_GATE) {
    fail('ZE_API and ZE_API_GATE overrides are not allowed for TestFlight');
  }
  if (process.env.ZE_FAIL_BUILD !== 'true') {
    fail('ZE_FAIL_BUILD must be true so Zephyr errors stop the release build');
  }

  const envPath = join(ROOT, '.env.testflight');
  if (!existsSync(envPath)) fail('Create .env.testflight from .env.testflight.example');
  if ((statSync(envPath).mode & 0o077) !== 0) {
    fail('.env.testflight must be private; run chmod 600 .env.testflight');
  }
  rejectXcodeEnvironmentOverrides();
  validateCommittedBundleIdentifier();

  const xcodeVersion = run('xcodebuild', ['-version'], {capture: true});
  const major = Number(xcodeVersion.match(/Xcode (\d+)/)?.[1]);
  if (!major || major < REQUIRED_XCODE_MAJOR) {
    fail(`Xcode ${REQUIRED_XCODE_MAJOR} or later is required`);
  }

  const hostPackage = JSON.parse(
    readFileSync(join(ROOT, 'apps/host/package.json'), 'utf8'),
  );
  const dependencies = hostPackage['zephyr:dependencies'] ?? {};
  validateExactDependencies(dependencies, 'apps/host/package.json');
  validateExactDependencies(
    zephyrConfig.remoteDependencies,
    'apps/host/zephyr.config.mjs',
  );

  const cacheVersion = hostPackage.dependencies?.['zephyr-native-cache'];
  if (
    releaseTrack === 'external' &&
    !APPROVED_CACHE_VERSIONS.has(cacheVersion)
  ) {
    fail(
      `zephyr-native-cache ${cacheVersion} is not approved for external TestFlight; add an exact version only after fail-closed integrity and known-good promotion tests pass`,
    );
  }

  console.log(
    `${releaseTrack === 'internal' ? 'Internal ' : ''}preflight passed with Xcode ${major}, bundle ${process.env.IOS_BUNDLE_ID}`,
  );
}

function xcodeArgs(actions, archivePath) {
  const build = getBuildNumber();
  const args = [
    '-workspace', WORKSPACE,
    '-scheme', SCHEME,
    '-configuration', 'Release',
    '-destination', 'generic/platform=iOS',
    `PRODUCT_BUNDLE_IDENTIFIER=${process.env.IOS_BUNDLE_ID}`,
    `DEVELOPMENT_TEAM=${process.env.APPLE_TEAM_ID}`,
    `CURRENT_PROJECT_VERSION=${build}`,
    'ZEPHYR_INFOPLIST_FILE=MFExampleHost/Info-TestFlight.plist',
    'CODE_SIGN_STYLE=Manual',
    'CODE_SIGN_IDENTITY=Apple Distribution',
    'PROVISIONING_PROFILE_SPECIFIER=Zephyr Health App',
  ];
  if (archivePath) args.push('-archivePath', archivePath);
  args.push(...(Array.isArray(actions) ? actions : [actions]));
  return args;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, canonicalJson(value[key])]),
    );
  }
  return value;
}

function appInfoDigest(info) {
  return sha256(Buffer.from(JSON.stringify(canonicalJson(info))));
}

function selectedXcodeVersion() {
  return run('xcodebuild', ['-version'], {capture: true}).trim();
}

function remoteSnapshotDigest(snapshot) {
  return sha256(Buffer.from(JSON.stringify(canonicalJson(snapshot.remotes))));
}

function requireCleanReleaseWorktree() {
  const allowedUntracked = new Set([
    'IOS_SIGNING_RESTART_PLAN.md',
    'TESTFLIGHT_PUBLISH_PLAN.md',
    'TESTFLIGHT_REPOSITORY_WORK_SUMMARY.md',
  ]);
  const status = run('git', ['status', '--porcelain'], {capture: true})
    .split(/\r?\n/)
    .filter(Boolean)
    .filter(line => !(line.startsWith('?? ') && allowedUntracked.has(line.slice(3))));
  if (status.length > 0) {
    fail('Release worktree has tracked or unexplained untracked changes');
  }
}

function remoteSnapshotPath() {
  return join(ROOT, 'build/testflight/remote-snapshot.json');
}

function archiveEvidencePath(archivePath) {
  return join(
    ROOT,
    'build/testflight/evidence',
    `${basename(archivePath, '.xcarchive')}.json`,
  );
}

function loadLocalJson(path, label) {
  if (!existsSync(path)) fail(`${label} not found: ${path}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function loadRemoteSnapshot() {
  return loadLocalJson(
    remoteSnapshotPath(),
    'Remote snapshot; run pnpm testflight:verify-remotes first',
  );
}

function loadArchiveEvidence(archivePath) {
  return loadLocalJson(
    archiveEvidencePath(archivePath),
    'Bound archive evidence was not generated with this archive',
  );
}

function writeLocalJson(path, value) {
  mkdirSync(resolve(path, '..'), {recursive: true});
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      mode: 0o600,
    });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, {force: true});
  }
}

function configuredRemoteRequirements() {
  const requirements = {
    mini: {
      applicationUid: 'cache-test-mini.zephyr-native-cache-test.zephyrcloudio',
      manifestUrl: process.env.ZEPHYR_MINI_MANIFEST_URL,
      manifestName: 'MFExampleMini',
      exposes: ['CalorieCard', 'DeployCard', 'StatsCard'],
    },
    nestedMini: {
      applicationUid:
        'cache-test-nested-mini.zephyr-native-cache-test.zephyrcloudio',
      manifestUrl: process.env.ZEPHYR_NESTED_MINI_MANIFEST_URL,
      manifestName: 'MFExampleNestedMini',
      exposes: ['ActivityFeed', 'CacheInfo', 'HydrationCard'],
    },
  };
  for (const [alias, requirement] of Object.entries(requirements)) {
    if (!requirement.manifestUrl) {
      fail(`Set the public ${alias} TestFlight manifest URL in .env.testflight`);
    }
    validatePublicZephyrUrl(requirement.manifestUrl);
  }
  return requirements;
}

async function fetchPublicHttps(input) {
  let url = validatePublicZephyrUrl(input, {
    artifact: new URL(input).search.length > 0,
  });
  for (let redirect = 0; redirect < 6; redirect += 1) {
    if (url.protocol !== 'https:') fail(`Remote URL must use HTTPS: ${url}`);
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) fail(`Remote redirect has no location: ${url}`);
      url = validatePublicZephyrUrl(new URL(location, url), {
        artifact: new URL(location, url).search.length > 0,
      });
      continue;
    }
    if (!response.ok) fail(`Public remote fetch failed (${response.status}): ${url}`);
    return {bytes: Buffer.from(await response.arrayBuffer()), finalUrl: url.toString()};
  }
  fail(`Too many redirects while fetching ${input}`);
}

async function resolveRemoteSnapshot({persist = false} = {}) {
  const snapshot = {
    generatedAtUtc: new Date().toISOString(),
    remotes: {},
  };
  for (const [alias, requirement] of Object.entries(
    configuredRemoteRequirements(),
  )) {
    const response = await fetchPublicHttps(requirement.manifestUrl);
    const manifest = JSON.parse(response.bytes.toString('utf8'));
    if (manifest.name !== requirement.manifestName) {
      fail(`${alias} manifest application identity mismatch`);
    }
    const exposes = (manifest.exposes ?? []).map(expose => expose.name).sort();
    if (JSON.stringify(exposes) !== JSON.stringify(requirement.exposes)) {
      fail(`${alias} manifest exposes an unapproved module set`);
    }
    const graph = manifestArtifactMap(manifest, response.finalUrl);
    for (const [url, expectedHash] of Object.entries(graph.artifacts)) {
      validatePublicZephyrUrl(url, {artifact: true});
      const artifact = await fetchPublicHttps(url);
      if (sha256(artifact.bytes) !== expectedHash) {
        fail(`${alias} artifact hash mismatch: ${url}`);
      }
    }
    snapshot.remotes[alias] = {
      applicationUid: requirement.applicationUid,
      selectorManifestUrl: new URL(requirement.manifestUrl).toString(),
      finalManifestUrl: response.finalUrl,
      manifestSha256: sha256(response.bytes),
      buildHash: graph.buildHash,
      artifacts: graph.artifacts,
    };
  }
  if (persist) writeLocalJson(remoteSnapshotPath(), snapshot);
  console.log('TestFlight environment manifests and executable artifacts are valid');
  return snapshot;
}

function snapshotsMatch(left, right) {
  const withoutTimestamp = snapshot => ({remotes: snapshot.remotes});
  return (
    JSON.stringify(withoutTimestamp(left)) ===
    JSON.stringify(withoutTimestamp(right))
  );
}

function showBuildSettings({releaseTrack = 'external'} = {}) {
  requireReleaseEnvironment({releaseTrack});
  const build = getBuildNumber();
  const output = run('xcodebuild', xcodeArgs('-showBuildSettings'), {capture: true});
  const expected = {
    PRODUCT_BUNDLE_IDENTIFIER: process.env.IOS_BUNDLE_ID,
    MARKETING_VERSION: VERSION,
    CURRENT_PROJECT_VERSION: build,
    INFOPLIST_FILE: 'MFExampleHost/Info-TestFlight.plist',
    TARGETED_DEVICE_FAMILY: '1',
    IPHONEOS_DEPLOYMENT_TARGET: '15.1',
    CONFIGURATION: 'Release',
    CODE_SIGN_STYLE: 'Manual',
    CODE_SIGN_IDENTITY: 'Apple Distribution',
    DEVELOPMENT_TEAM: process.env.APPLE_TEAM_ID,
    PROVISIONING_PROFILE_SPECIFIER: 'Zephyr Health App',
  };
  for (const [setting, value] of Object.entries(expected)) {
    const match = output.match(new RegExp(`^\\s*${setting} = (.+)$`, 'm'))?.[1]?.trim();
    if (match !== value) fail(`${setting} is ${match ?? 'missing'}; expected ${value}`);
  }
  console.log('Release build settings are valid');
}

async function archive({releaseTrack = 'external'} = {}) {
  requireCleanReleaseWorktree();
  const before =
    releaseTrack === 'external'
      ? await resolveRemoteSnapshot({persist: true})
      : undefined;
  showBuildSettings({releaseTrack});
  const build = getBuildNumber();
  const archivePath = resolve(
    getArchiveArgument() ?? join(ROOT, 'build/testflight', `ZephyrHealth-${VERSION}-${build}.xcarchive`),
  );
  if (existsSync(archivePath)) fail(`Refusing to overwrite existing archive: ${archivePath}`);
  await mkdir(resolve(archivePath, '..'), {recursive: true});
  run('xcodebuild', xcodeArgs(['clean', 'archive'], archivePath), {
    env: process.env,
  });
  if (releaseTrack === 'external') {
    const after = await resolveRemoteSnapshot();
    if (!snapshotsMatch(before, after)) {
      fail('TestFlight environments changed while the archive was being created');
    }
  }
  writeBoundArchiveEvidence(archivePath, {releaseTrack, remoteSnapshot: before});
  console.log(`Archive created at ${archivePath}`);
}

function walk(path) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) return [];
  if (!stat.isDirectory()) return [path];
  return readdirSync(path, {withFileTypes: true}).flatMap(entry =>
    walk(join(path, entry.name)),
  );
}

function findHostApp(archivePath) {
  const applications = join(archivePath, 'Products/Applications');
  if (!existsSync(applications)) fail(`No Applications directory in ${archivePath}`);
  const apps = readdirSync(applications)
    .filter(name => name.endsWith('.app'))
    .map(name => join(applications, name));
  if (apps.length !== 1) fail(`Expected one host app, found ${apps.length}`);
  return apps[0];
}

function distributionExecutablePaths(appPath, info) {
  const paths = [join(appPath, info.CFBundleExecutable)];
  const frameworks = join(appPath, 'Frameworks');
  if (existsSync(frameworks)) {
    for (const name of readdirSync(frameworks).sort()) {
      if (!name.endsWith('.framework')) continue;
      const framework = join(frameworks, name);
      const frameworkInfo = parsePlist(join(framework, 'Info.plist'));
      paths.push(join(framework, frameworkInfo.CFBundleExecutable));
    }
  }
  const plugins = join(appPath, 'PlugIns');
  if (existsSync(plugins) && readdirSync(plugins).length > 0) {
    fail('Distribution app contains unapproved plug-ins/extensions');
  }
  return paths;
}

function normalizedExecutableEvidence(appPath, info) {
  const result = {};
  for (const executable of distributionExecutablePaths(appPath, info).sort()) {
    const uuids = (
      run('dwarfdump', ['--uuid', executable], {capture: true}).match(
        /[a-f0-9-]{36}/gi,
      ) ?? []
    )
      .map(uuid => uuid.toUpperCase())
      .sort();
    if (uuids.length === 0) fail(`Executable has no UUID: ${executable}`);
    const output = mkdtempSync(join(tmpdir(), 'zephyr-health-executable-'));
    const unsigned = join(output, 'executable');
    try {
      copyFileSync(executable, unsigned);
      run('codesign', ['--remove-signature', unsigned], {
        message: `Unable to normalize code signature: ${executable}`,
      });
      result[relative(appPath, executable)] = {
        uuids,
        unsignedSha256: sha256(readFileSync(unsigned)),
      };
    } finally {
      rmSync(output, {recursive: true, force: true});
    }
  }
  return result;
}

function resourceTreeDigest(appPath, info) {
  const digest = createHash('sha256');
  const executables = new Set(
    distributionExecutablePaths(appPath, info).map(path => relative(appPath, path)),
  );
  const entries = walk(appPath)
    .map(path => ({path, relative: relative(appPath, path)}))
    .filter(({relative: path}) =>
      path !== 'Info.plist' &&
      path !== 'embedded.mobileprovision' &&
      !executables.has(path) &&
      path !== '_CodeSignature/CodeResources' &&
      !path.includes('/_CodeSignature/'),
    )
    .sort((left, right) => left.relative.localeCompare(right.relative));
  for (const entry of entries) {
    digest.update(entry.relative);
    digest.update('\0');
    digest.update(sha256(readFileSync(entry.path)));
    digest.update('\0');
  }
  return digest.digest('hex');
}

function validateAppPrivacyAndTransport(info, appPath) {
  const ats = info.NSAppTransportSecurity ?? {};
  if (
    JSON.stringify(ats) !== JSON.stringify({NSAllowsArbitraryLoads: false})
  ) {
    fail('Distribution app must use the exact approved ATS policy');
  }
  const usageDescriptions = Object.keys(info).filter(key =>
    /^NS.*UsageDescription$/.test(key),
  );
  if (usageDescriptions.length > 0) {
    fail(`Distribution app contains unapproved permission strings: ${usageDescriptions.join(', ')}`);
  }
  const unapprovedBehaviorKeys = [
    'CFBundleURLTypes',
    'LSApplicationQueriesSchemes',
    'NSSupportsLiveActivities',
    'UIBackgroundModes',
  ].filter(key => info[key] !== undefined);
  if (unapprovedBehaviorKeys.length > 0) {
    fail(`Distribution app contains unapproved behavior metadata: ${unapprovedBehaviorKeys.join(', ')}`);
  }
  const privacyPath = join(appPath, 'PrivacyInfo.xcprivacy');
  if (!existsSync(privacyPath)) fail('Host app privacy manifest is missing');
  const actualPrivacy = parsePlist(
    privacyPath,
    'Host app privacy manifest is invalid',
  );
  const approvedPrivacy = parsePlist(
    join(ROOT, 'apps/host/ios/MFExampleHost/PrivacyInfo.xcprivacy'),
  );
  if (JSON.stringify(actualPrivacy) !== JSON.stringify(approvedPrivacy)) {
    fail('Host app privacy manifest differs from the approved declaration');
  }
  const approvedReasons = {
    NSPrivacyAccessedAPICategoryFileTimestamp: new Set(['C617.1']),
    NSPrivacyAccessedAPICategorySystemBootTime: new Set(['35F9.1']),
    NSPrivacyAccessedAPICategoryUserDefaults: new Set(['CA92.1']),
  };
  for (const path of walk(appPath).filter(file => file.endsWith('.xcprivacy'))) {
    const privacy = parsePlist(
      path,
      `Archived privacy manifest is invalid: ${path}`,
    );
    if (
      typeof privacy.NSPrivacyTracking !== 'boolean' ||
      (privacy.NSPrivacyTrackingDomains !== undefined &&
        !Array.isArray(privacy.NSPrivacyTrackingDomains)) ||
      !Array.isArray(privacy.NSPrivacyCollectedDataTypes) ||
      !Array.isArray(privacy.NSPrivacyAccessedAPITypes)
    ) {
      fail(`Archived privacy manifest has an invalid schema: ${path}`);
    }
    if (
      privacy.NSPrivacyTracking === true ||
      (privacy.NSPrivacyTrackingDomains?.length ?? 0) > 0 ||
      (privacy.NSPrivacyCollectedDataTypes?.length ?? 0) > 0
    ) {
      fail(`Archived privacy manifest has unapproved tracking/data collection: ${path}`);
    }
    for (const api of privacy.NSPrivacyAccessedAPITypes ?? []) {
      const reasons = approvedReasons[api.NSPrivacyAccessedAPIType];
      if (
        !reasons ||
        !Array.isArray(api.NSPrivacyAccessedAPITypeReasons) ||
        api.NSPrivacyAccessedAPITypeReasons.length === 0 ||
        api.NSPrivacyAccessedAPITypeReasons.some(
          reason => !reasons.has(reason),
        )
      ) {
        fail(`Archived privacy manifest has an unapproved required-reason API: ${path}`);
      }
    }
  }
}

function validateDistributionEntitlements(entitlements, {distribution = false} = {}) {
  const allowed = new Set([
    'application-identifier',
    'beta-reports-active',
    'com.apple.developer.team-identifier',
    'get-task-allow',
    'keychain-access-groups',
  ]);
  const unexpected = Object.keys(entitlements).filter(key => !allowed.has(key));
  if (unexpected.length > 0) {
    fail(`Archive contains unapproved entitlements: ${unexpected.join(', ')}`);
  }
  if (distribution && entitlements['get-task-allow'] !== false) {
    fail('Distribution app must explicitly disable get-task-allow');
  }
}

function readCodeSignEntitlements(appPath) {
  const output = run('codesign', ['-d', '--entitlements', ':-', appPath], {
    capture: true,
    includeStderr: true,
  });
  const plist = output.match(/<\?xml[\s\S]*<\/plist>/)?.[0];
  if (!plist) fail('Signed app contains no readable entitlements');
  return parsePlistText(plist, 'Unable to parse code-signing entitlements');
}

function collectArchiveEvidence(archivePath) {
  const appPath = findHostApp(archivePath);
  const info = parsePlist(join(appPath, 'Info.plist'));
  const archiveInfoPath = join(archivePath, 'Info.plist');
  const archiveProperties = parsePlistKey(
    archiveInfoPath,
    'ApplicationProperties',
    'Unable to read archive application properties',
  );
  const executable = join(appPath, info.CFBundleExecutable);
  const executableUuids = (
    run('dwarfdump', ['--uuid', executable], {capture: true}).match(
      /[a-f0-9-]{36}/gi,
    ) ?? []
  ).map(uuid => uuid.toUpperCase());
  return {
    archiveInfoSha256: sha256(readFileSync(archiveInfoPath)),
    appInfoSha256: appInfoDigest(info),
    appExecutableSha256: sha256(readFileSync(executable)),
    mainBundleSha256: sha256(readFileSync(join(appPath, 'main.jsbundle'))),
    resourceTreeSha256: resourceTreeDigest(appPath, info),
    executables: normalizedExecutableEvidence(appPath, info),
    executableUuids,
    signingIdentity: archiveProperties.SigningIdentity,
    teamId: archiveProperties.Team,
    createdAtUtc: statSync(archivePath).birthtime.toISOString(),
  };
}

function writeBoundArchiveEvidence(
  archivePath,
  {releaseTrack, remoteSnapshot},
) {
  const path = archiveEvidencePath(archivePath);
  if (existsSync(path)) fail(`Refusing to overwrite archive evidence: ${path}`);
  const evidence = {
    schemaVersion: 2,
    releaseTrack,
    archivePath: resolve(archivePath),
    gitSha: run('git', ['rev-parse', 'HEAD'], {capture: true}).trim(),
    xcodeVersion: selectedXcodeVersion(),
    bundleId: process.env.IOS_BUNDLE_ID,
    teamId: process.env.APPLE_TEAM_ID,
    version: VERSION,
    build: getBuildNumber(),
    archive: collectArchiveEvidence(archivePath),
  };
  if (releaseTrack === 'external') {
    evidence.remoteSnapshot = remoteSnapshot;
    evidence.remoteSnapshotSha256 = remoteSnapshotDigest(remoteSnapshot);
  }
  writeLocalJson(path, evidence);
  return evidence;
}

function validateBoundArchiveEvidence(
  evidence,
  archivePath,
  {releaseTrack = evidence.releaseTrack} = {},
) {
  const expectedGitSha = run('git', ['rev-parse', 'HEAD'], {capture: true}).trim();
  const remoteEvidenceIsValid =
    releaseTrack === 'external'
      ? evidence.remoteSnapshot &&
        evidence.remoteSnapshotSha256 ===
          remoteSnapshotDigest(evidence.remoteSnapshot)
      : evidence.remoteSnapshot === undefined &&
        evidence.remoteSnapshotSha256 === undefined;
  if (
    evidence.schemaVersion !== 2 ||
    !['internal', 'external'].includes(releaseTrack) ||
    evidence.releaseTrack !== releaseTrack ||
    evidence.archivePath !== resolve(archivePath) ||
    evidence.gitSha !== expectedGitSha ||
    evidence.xcodeVersion !== selectedXcodeVersion() ||
    evidence.bundleId !== process.env.IOS_BUNDLE_ID ||
    evidence.teamId !== process.env.APPLE_TEAM_ID ||
    evidence.version !== VERSION ||
    evidence.build !== getBuildNumber() ||
    !remoteEvidenceIsValid
  ) {
    fail('Archive evidence does not match the current source/release identity');
  }
  return evidence;
}

function printArchiveEvidence() {
  requireArtifactEnvironment();
  const build = getBuildNumber();
  const archivePath = resolve(
    getArchiveArgument() ??
      join(ROOT, 'build/testflight', `ZephyrHealth-${VERSION}-${build}.xcarchive`),
  );
  const evidence = validateBoundArchiveEvidence(
    loadArchiveEvidence(archivePath),
    archivePath,
  );
  console.log(JSON.stringify(evidence, null, 2));
}

async function verifyArchive({releaseTrack = 'external'} = {}) {
  requireArtifactEnvironment();
  const build = getBuildNumber();
  const archivePath = resolve(
    getArchiveArgument() ?? join(ROOT, 'build/testflight', `ZephyrHealth-${VERSION}-${build}.xcarchive`),
  );
  const boundEvidence = validateBoundArchiveEvidence(
    loadArchiveEvidence(archivePath),
    archivePath,
    {releaseTrack},
  );
  const remoteSnapshot = boundEvidence.remoteSnapshot;
  const archiveEvidence = boundEvidence.archive;
  const appPath = findHostApp(archivePath);
  const info = parsePlist(
    join(appPath, 'Info.plist'),
    'Unable to read archived Info.plist',
  );
  const expected = {
    CFBundleDisplayName: 'Zephyr Health',
    CFBundleIdentifier: process.env.IOS_BUNDLE_ID,
    CFBundleShortVersionString: VERSION,
    CFBundleVersion: build,
    MinimumOSVersion: '15.1',
  };
  for (const [key, value] of Object.entries(expected)) {
    if (info[key] !== value) fail(`${key} is ${info[key] ?? 'missing'}; expected ${value}`);
  }
  if (JSON.stringify(info.UIDeviceFamily) !== '[1]') fail('Archive must target iPhone only');
  if (JSON.stringify(info.CFBundleSupportedPlatforms) !== '["iPhoneOS"]') {
    fail('Archive must contain an iPhoneOS device application');
  }
  if (info.DTPlatformName !== 'iphoneos') fail('Archive was not built for iphoneos');
  if (JSON.stringify(info.UISupportedInterfaceOrientations) !== '["UIInterfaceOrientationPortrait"]') {
    fail('Archive must support portrait orientation only');
  }
  if (info['UISupportedInterfaceOrientations~ipad']) {
    fail('Archive must not contain iPad-specific orientations');
  }
  if (info.UILaunchStoryboardName !== 'LaunchScreen') fail('Archive launch screen metadata is missing');
  if (info.CFBundleIcons?.CFBundlePrimaryIcon?.CFBundleIconName !== 'AppIcon') {
    fail('Archive primary app icon metadata is missing');
  }
  if (info.NSAppTransportSecurity?.NSAllowsLocalNetworking === true) {
    fail('TestFlight archive must not allow local networking');
  }
  validateAppPrivacyAndTransport(info, appPath);

  const properties = parsePlistKey(
    join(archivePath, 'Info.plist'),
    'ApplicationProperties',
    'Unable to read archive application properties',
  );
  if (properties.CFBundleIdentifier !== process.env.IOS_BUNDLE_ID) {
    fail('Archive application bundle ID mismatch');
  }
  if (properties.Team !== process.env.APPLE_TEAM_ID) fail('Archive signing team mismatch');

  run('codesign', ['--verify', '--deep', '--strict', appPath], {
    message: 'Archive code signature validation failed',
  });
  const executable = join(appPath, info.CFBundleExecutable);
  const architectures = run('lipo', ['-archs', executable], {capture: true}).trim().split(/\s+/);
  if (!architectures.includes('arm64')) fail('Archive executable does not contain arm64');

  const signing = run('codesign', ['-d', '--verbose=4', appPath], {
    capture: true,
    includeStderr: true,
  });
  if (/Signature=adhoc/i.test(signing)) fail('Archive is ad-hoc signed');
  if (!signing.includes(`TeamIdentifier=${process.env.APPLE_TEAM_ID}`)) {
    fail('Code signature team identifier mismatch');
  }
  const entitlements = readCodeSignEntitlements(appPath);
  validateDistributionEntitlements(entitlements);
  if (entitlements['com.apple.developer.team-identifier'] !== process.env.APPLE_TEAM_ID) {
    fail('Archive entitlement team identifier mismatch');
  }
  const applicationIdentifier = entitlements['application-identifier'];
  if (applicationIdentifier !== `${process.env.APPLE_TEAM_ID}.${process.env.IOS_BUNDLE_ID}`) {
    fail('Archive application-identifier entitlement mismatch');
  }

  const profilePath = join(appPath, 'embedded.mobileprovision');
  if (!existsSync(profilePath)) fail('Archive has no embedded provisioning profile');
  const profileSource = run('security', ['cms', '-D', '-i', profilePath], {
    capture: true,
    message: 'Unable to decode archive provisioning profile',
  });
  const profile = parsePlistText(profileSource, 'Unable to parse provisioning profile');
  if (!profile.TeamIdentifier?.includes(process.env.APPLE_TEAM_ID)) {
    fail('Provisioning profile team mismatch');
  }
  if (profile.Entitlements?.['application-identifier'] !== applicationIdentifier) {
    fail('Provisioning profile application identifier mismatch');
  }
  const profileExpiry = Date.parse(profile.ExpirationDate);
  if (!Number.isFinite(profileExpiry) || profileExpiry <= Date.now()) {
    fail('Provisioning profile is expired');
  }

  const appUuids = new Set(
    (run('dwarfdump', ['--uuid', executable], {capture: true}).match(
      /[a-f0-9-]{36}/gi,
    ) ?? []).map(uuid => uuid.toUpperCase()),
  );
  const dSYM = join(archivePath, 'dSYMs', `${info.CFBundleExecutable}.app.dSYM`);
  if (!existsSync(dSYM)) fail('Archive app dSYM is missing');
  const dSYMUuid = new Set(
    (run('dwarfdump', ['--uuid', dSYM], {capture: true}).match(
      /[a-f0-9-]{36}/gi,
    ) ?? []).map(uuid => uuid.toUpperCase()),
  );
  if (
    appUuids.size === 0 ||
    dSYMUuid.size === 0 ||
    JSON.stringify([...appUuids].sort()) !== JSON.stringify([...dSYMUuid].sort())
  ) {
    fail('Archive dSYM UUID mismatch');
  }
  if (
    archiveEvidence.archiveInfoSha256 !==
      sha256(readFileSync(join(archivePath, 'Info.plist'))) ||
    archiveEvidence.appInfoSha256 !== appInfoDigest(info) ||
    archiveEvidence.appExecutableSha256 !== sha256(readFileSync(executable)) ||
    archiveEvidence.mainBundleSha256 !==
      sha256(readFileSync(join(appPath, 'main.jsbundle'))) ||
    archiveEvidence.resourceTreeSha256 !==
      resourceTreeDigest(appPath, info) ||
    JSON.stringify(archiveEvidence.executables ?? {}) !==
      JSON.stringify(normalizedExecutableEvidence(appPath, info)) ||
    JSON.stringify([...(archiveEvidence.executableUuids ?? [])].sort()) !==
      JSON.stringify([...appUuids].sort()) ||
    archiveEvidence.signingIdentity !== properties.SigningIdentity ||
    archiveEvidence.teamId !== process.env.APPLE_TEAM_ID
  ) {
    fail('Local archive evidence does not match the archive');
  }

  const files = walk(archivePath);
  const appFiles = new Set(walk(appPath));
  const forbidden = [
    'clients3.google.com/generate_204', 'ZE_SECRET_TOKEN',
    'sntryu_', '.env.testflight', '.env.e2e',
  ];
  if (process.env.ZE_SECRET_TOKEN) forbidden.push(process.env.ZE_SECRET_TOKEN);
  const required =
    releaseTrack === 'external'
      ? Object.values(remoteSnapshot.remotes).flatMap(remote => [
          remote.applicationUid,
          remote.selectorManifestUrl,
        ])
      : [];
  const foundRequired = new Set();
  for (const path of files) {
    const bytes = readFileSync(path);
    const text = bytes.toString('latin1');
    for (const value of forbidden) {
      if (value && text.includes(value)) fail(`Forbidden release content found in ${path}`);
    }
    const isRuntimeConfig =
      path === join(appPath, 'main.jsbundle') ||
      path.endsWith('zephyr-manifest.json') ||
      path === join(appPath, 'Info.plist');
    if (isRuntimeConfig) {
      for (const match of text.matchAll(/http:\/\/[^\0\s"'<>]+/g)) {
        if (!match[0].startsWith('http://www.apple.com/DTDs/')) {
          fail(`Insecure HTTP release URL found in ${path}`);
        }
      }
      if (/(?:https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|10\.0\.2\.2|host\.docker\.internal)(?::\d+)?)/i.test(text)) {
        fail(`Development host found in ${path}`);
      }
      if (/(?:@demo\b|https?:\/\/demo[-.])/i.test(text)) {
        fail(`DEMO environment content found in ${path}`);
      }
    }
    if (appFiles.has(path)) {
      for (const value of required) {
        if (text.includes(value)) foundRequired.add(value);
      }
    }
  }
  for (const value of required) {
    if (!foundRequired.has(value)) fail(`Host app does not contain approved remote ${value}`);
  }
  if (releaseTrack === 'external') {
    const currentSnapshot = await resolveRemoteSnapshot();
    if (!snapshotsMatch(remoteSnapshot, currentSnapshot)) {
      fail('TestFlight environments changed after the archive was created');
    }
  }
  console.log(`Archive verification passed: ${archivePath}`);
}

function imageProperties(path) {
  const output = run(
    'sips',
    ['-g', 'pixelWidth', '-g', 'pixelHeight', '-g', 'hasAlpha', path],
    {capture: true},
  );
  return {
    width: Number(output.match(/pixelWidth: (\d+)/)?.[1]),
    height: Number(output.match(/pixelHeight: (\d+)/)?.[1]),
    hasAlpha: output.match(/hasAlpha: (\w+)/)?.[1],
  };
}

function findExportedIpa(exportPath) {
  const ipas = readdirSync(exportPath)
    .filter(name => name.endsWith('.ipa'))
    .map(name => join(exportPath, name));
  if (ipas.length !== 1) fail(`Expected one exported IPA, found ${ipas.length}`);
  return ipas[0];
}

async function exportArchive({releaseTrack = 'external'} = {}) {
  requireReleaseEnvironment({releaseTrack});
  await verifyArchive({releaseTrack});
  const build = getBuildNumber();
  const archivePath = resolve(
    getArchiveArgument() ??
      join(ROOT, 'build/testflight', `ZephyrHealth-${VERSION}-${build}.xcarchive`),
  );
  if (!existsSync(archivePath)) fail(`Archive not found: ${archivePath}`);
  const exportPath = join(
    ROOT,
    'build/testflight',
    `ZephyrHealth-${VERSION}-${build}-export`,
  );
  if (existsSync(exportPath)) fail(`Refusing to overwrite existing export: ${exportPath}`);
  run('xcodebuild', [
    '-exportArchive',
    '-archivePath',
    archivePath,
    '-exportPath',
    exportPath,
    '-exportOptionsPlist',
    join(ROOT, 'apps/host/ios/ExportOptions-TestFlight.plist'),
  ]);
  copyFileSync(
    archiveEvidencePath(archivePath),
    join(exportPath, 'archive-evidence.json'),
  );
  console.log(`App Store Connect export created: ${findExportedIpa(exportPath)}`);
}

function verifyIpa({releaseTrack = 'external'} = {}) {
  requireArtifactEnvironment();
  const build = getBuildNumber();
  const configured = getArchiveArgument();
  const defaultExport = join(
    ROOT,
    'build/testflight',
    `ZephyrHealth-${VERSION}-${build}-export`,
  );
  const ipaPath = configured
    ? resolve(configured)
    : findExportedIpa(defaultExport);
  if (!existsSync(ipaPath) || !ipaPath.endsWith('.ipa')) fail(`IPA not found: ${ipaPath}`);
  const boundEvidence = loadLocalJson(
    join(dirname(ipaPath), 'archive-evidence.json'),
    'Exported IPA has no bound archive evidence',
  );
  validateBoundArchiveEvidence(boundEvidence, boundEvidence.archivePath, {
    releaseTrack,
  });
  const remoteSnapshot = boundEvidence.remoteSnapshot;
  const archiveEvidence = boundEvidence.archive;
  const output = mkdtempSync(join(tmpdir(), 'zephyr-health-ipa-'));
  try {
    run('ditto', ['-x', '-k', ipaPath, output]);
    const payload = join(output, 'Payload');
    const apps = readdirSync(payload)
      .filter(name => name.endsWith('.app'))
      .map(name => join(payload, name));
    if (apps.length !== 1) fail(`Expected one app in IPA, found ${apps.length}`);
    const appPath = apps[0];
    const info = parsePlist(join(appPath, 'Info.plist'));
    if (
      info.CFBundleIdentifier !== process.env.IOS_BUNDLE_ID ||
      info.CFBundleShortVersionString !== VERSION ||
      info.CFBundleVersion !== build ||
      JSON.stringify(info.CFBundleSupportedPlatforms) !== '["iPhoneOS"]'
    ) {
      fail('Exported IPA identity/platform mismatch');
    }
    const executable = join(appPath, info.CFBundleExecutable);
    const executableUuids = (
      run('dwarfdump', ['--uuid', executable], {capture: true}).match(
        /[a-f0-9-]{36}/gi,
      ) ?? []
    ).map(uuid => uuid.toUpperCase());
    if (
      executableUuids.length === 0 ||
      JSON.stringify([...executableUuids].sort()) !==
        JSON.stringify([...(archiveEvidence.executableUuids ?? [])].sort()) ||
      appInfoDigest(info) !== archiveEvidence.appInfoSha256 ||
      sha256(readFileSync(join(appPath, 'main.jsbundle'))) !==
        archiveEvidence.mainBundleSha256 ||
      resourceTreeDigest(appPath, info) !==
        archiveEvidence.resourceTreeSha256 ||
      JSON.stringify(normalizedExecutableEvidence(appPath, info)) !==
        JSON.stringify(archiveEvidence.executables ?? {})
    ) {
      fail('Exported IPA does not match the approved archive resources/UUIDs');
    }
    validateAppPrivacyAndTransport(info, appPath);
    run('codesign', ['--verify', '--deep', '--strict', appPath], {
      message: 'Exported IPA code signature validation failed',
    });
    const signing = run('codesign', ['-d', '--verbose=4', appPath], {
      capture: true,
      includeStderr: true,
    });
    if (!/Authority=(?:Apple Distribution|iPhone Distribution)/.test(signing)) {
      fail('Exported IPA is not signed for Apple distribution');
    }
    if (!signing.includes(`TeamIdentifier=${process.env.APPLE_TEAM_ID}`)) {
      fail('Exported IPA signing team mismatch');
    }
    const entitlements = readCodeSignEntitlements(appPath);
    validateDistributionEntitlements(entitlements, {distribution: true});
    if (
      entitlements['application-identifier'] !==
        `${process.env.APPLE_TEAM_ID}.${process.env.IOS_BUNDLE_ID}` ||
      entitlements['beta-reports-active'] !== true ||
      JSON.stringify(entitlements['keychain-access-groups'] ?? []) !==
        JSON.stringify([
          `${process.env.APPLE_TEAM_ID}.${process.env.IOS_BUNDLE_ID}`,
        ])
    ) {
      fail('Exported IPA does not have TestFlight distribution entitlements');
    }
    const profile = parsePlistText(
      run(
        'security',
        ['cms', '-D', '-i', join(appPath, 'embedded.mobileprovision')],
        {capture: true},
      ),
      'Unable to parse exported IPA provisioning profile',
    );
    const expectedApplicationIdentifier =
      `${process.env.APPLE_TEAM_ID}.${process.env.IOS_BUNDLE_ID}`;
    if (
      profile.Entitlements?.['beta-reports-active'] !== true ||
      profile.Entitlements?.['get-task-allow'] !== false ||
      profile.Entitlements?.['application-identifier'] !==
        expectedApplicationIdentifier ||
      !profile.TeamIdentifier?.includes(process.env.APPLE_TEAM_ID) ||
      !Number.isFinite(Date.parse(profile.ExpirationDate)) ||
      Date.parse(profile.ExpirationDate) <= Date.now() ||
      profile.ProvisionedDevices ||
      profile.ProvisionsAllDevices === true
    ) {
      fail('Exported IPA does not use an App Store distribution profile');
    }
    const text = walk(appPath)
      .map(file => readFileSync(file).toString('latin1'))
      .join('\n');
    if (releaseTrack === 'external') {
      for (const remote of Object.values(remoteSnapshot.remotes)) {
        if (
          !text.includes(remote.applicationUid) ||
          !text.includes(remote.selectorManifestUrl)
        ) {
          fail(`Exported IPA is missing approved remote ${remote.applicationUid}`);
        }
      }
    }
    if (
      /(?:https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|10\.0\.2\.2|host\.docker\.internal)(?::\d+)?|@demo\b|https?:\/\/demo[-.])/i.test(text) ||
      [...text.matchAll(/http:\/\/[^\0\s"'<>]+/g)].some(
        match => !match[0].startsWith('http://www.apple.com/DTDs/'),
      ) ||
      text.includes('ZE_SECRET_TOKEN') ||
      text.includes('.env.testflight') ||
      text.includes('sntryu_') ||
      (process.env.ZE_SECRET_TOKEN && text.includes(process.env.ZE_SECRET_TOKEN))
    ) {
      fail('Exported IPA contains development or secret content');
    }
  } finally {
    rmSync(output, {recursive: true, force: true});
  }
  console.log(`Exported IPA verification passed: ${ipaPath}`);
}

function verifyAssets() {
  const assetRoot = join(ROOT, 'apps/host/ios/MFExampleHost/Images.xcassets');
  const exportOptions = parsePlist(
    join(ROOT, 'apps/host/ios/ExportOptions-TestFlight.plist'),
  );
  if (
    exportOptions.method !== 'app-store-connect' ||
    exportOptions.destination !== 'export' ||
    exportOptions.signingStyle !== 'automatic' ||
    exportOptions.manageAppVersionAndBuildNumber !== false
  ) {
    fail('TestFlight export options are invalid');
  }
  const testflightInfo = parsePlist(
    join(ROOT, 'apps/host/ios/MFExampleHost/Info-TestFlight.plist'),
  );
  if (
    testflightInfo.CFBundleDisplayName !== 'Zephyr Health' ||
    testflightInfo.UILaunchStoryboardName !== 'LaunchScreen' ||
    JSON.stringify(testflightInfo.UISupportedInterfaceOrientations) !==
      '["UIInterfaceOrientationPortrait"]' ||
    testflightInfo['UISupportedInterfaceOrientations~ipad'] ||
    testflightInfo.NSAppTransportSecurity?.NSAllowsLocalNetworking === true
  ) {
    fail('TestFlight source plist metadata is invalid');
  }
  const iconRoot = join(assetRoot, 'AppIcon.appiconset');
  const catalog = JSON.parse(readFileSync(join(iconRoot, 'Contents.json'), 'utf8'));
  for (const image of catalog.images) {
    if (!image.filename) fail('App icon catalog contains an unnamed slot');
    const expected = Number(image.size.split('x')[0]) * Number(image.scale[0]);
    const properties = imageProperties(join(iconRoot, image.filename));
    if (properties.width !== expected || properties.height !== expected) {
      fail(`App icon ${image.filename} must be ${expected}x${expected}`);
    }
    if (properties.hasAlpha !== 'no') fail(`App icon ${image.filename} must be opaque`);
  }

  const launchRoot = join(assetRoot, 'LaunchLogo.imageset');
  for (const [file, size] of [
    ['LaunchLogo.png', 120],
    ['LaunchLogo@2x.png', 240],
    ['LaunchLogo@3x.png', 360],
  ]) {
    const properties = imageProperties(join(launchRoot, file));
    if (properties.width !== size || properties.height !== size) {
      fail(`Launch logo ${file} must use a ${size}x${size} canvas`);
    }
  }

  const sourceHashes = {
    'logo-light.svg': '1460cefb1f9155dbd93167fc59beb6293fda4e7c1b37e6eb4183c8681ab32735',
    'zephyr-logo.svg': '0e311aad65755e9981339fcf5ed66296a426f4227aafb0d0dd18ef8f998ee2ec',
  };
  for (const [file, expected] of Object.entries(sourceHashes)) {
    const actual = sha256(
      readFileSync(join(ROOT, 'apps/host/assets/branding-source', file)),
    );
    if (actual !== expected) fail(`Brand source hash mismatch: ${file}`);
  }

  const output = mkdtempSync(join(tmpdir(), 'zephyr-health-assets-'));
  try {
    const compiledAssets = join(output, 'compiled-assets');
    mkdirSync(compiledAssets);
    const actool = run(
      'xcrun',
      [
        'actool', assetRoot, '--compile', compiledAssets, '--platform', 'iphoneos',
        '--minimum-deployment-target', '15.1', '--target-device', 'iphone',
        '--app-icon', 'AppIcon', '--output-partial-info-plist',
        join(output, 'asset-info.plist'),
      ],
      {capture: true, includeStderr: true},
    );
    if (/warning:/i.test(actool)) fail('actool reported an asset warning');
    const ibtool = run(
      'xcrun',
      [
        'ibtool', '--errors', '--warnings', '--notices',
        '--minimum-deployment-target', '15.1', '--target-device', 'iphone',
        '--compile', join(output, 'LaunchScreen.storyboardc'),
        join(ROOT, 'apps/host/ios/MFExampleHost/LaunchScreen.storyboard'),
      ],
      {capture: true, includeStderr: true},
    );
    if (/warning:/i.test(ibtool)) fail('ibtool reported a launch-screen warning');
  } finally {
    rmSync(output, {recursive: true, force: true});
  }
  console.log('App icons, launch screen, and brand sources are valid');
}

async function smokeTest({releaseTrack = 'external'} = {}) {
  requireArtifactEnvironment({team: false});
  if (releaseTrack === 'external') {
    const remoteSnapshot = loadRemoteSnapshot();
    const currentSnapshot = await resolveRemoteSnapshot();
    if (!snapshotsMatch(remoteSnapshot, currentSnapshot)) {
      fail('TestFlight environments changed after the candidate was built');
    }
  }
  const appPath = run(
    'xcrun',
    ['simctl', 'get_app_container', 'booted', process.env.IOS_BUNDLE_ID, 'app'],
    {capture: true, message: 'Install the candidate on a booted iOS simulator first'},
  ).trim();
  const installed = parsePlist(join(appPath, 'Info.plist'));
  if (
    installed.CFBundleIdentifier !== process.env.IOS_BUNDLE_ID ||
    installed.CFBundleShortVersionString !== VERSION ||
    installed.CFBundleVersion !== getBuildNumber()
  ) {
    fail('Installed simulator app does not match the approved candidate identity');
  }
  process.env.APP_ID = process.env.IOS_BUNDLE_ID;
  run('maestro', [
    '--platform=ios',
    'test',
    '-e',
    `APP_ID=${process.env.IOS_BUNDLE_ID}`,
    join(ROOT, 'apps/host/e2e/flows/core.yaml'),
  ]);
}

function openXcode({releaseTrack = 'external'} = {}) {
  requireReleaseEnvironment({releaseTrack});
  console.log(
    `Use pnpm testflight:${releaseTrack === 'internal' ? 'internal:' : ''}archive for the authoritative release archive.`,
  );
  const developerDir = run('xcode-select', ['-p'], {capture: true}).trim();
  const executable = resolve(developerDir, '../MacOS/Xcode');
  const child = spawn(executable, [WORKSPACE], {
    detached: true,
    env: process.env,
    stdio: 'ignore',
  });
  child.unref();
}

function publishRemotes({releaseTrack = 'external'} = {}) {
  requireReleaseEnvironment({releaseTrack});
  if (!['v1', 'v2', 'v3'].includes(process.env.REMOTE_VERSION)) {
    fail('Set REMOTE_VERSION explicitly to v1, v2, or v3 before publishing');
  }
  run('pnpm', [
    '--filter',
    'cache-test-mini',
    '--filter',
    'cache-test-nested-mini',
    'publish:testflight:ios',
  ], {env: process.env});
}

const action = process.argv[2];
try {
  if (action === 'preflight') requireReleaseEnvironment();
  else if (action === 'preflight-internal') {
    requireReleaseEnvironment({releaseTrack: 'internal'});
  }
  else if (action === 'settings') showBuildSettings();
  else if (action === 'settings-internal') {
    showBuildSettings({releaseTrack: 'internal'});
  }
  else if (action === 'archive') await archive();
  else if (action === 'archive-internal') {
    await archive({releaseTrack: 'internal'});
  }
  else if (action === 'verify-remotes') {
    await resolveRemoteSnapshot({persist: true});
  }
  else if (action === 'verify-assets') verifyAssets();
  else if (action === 'archive-evidence') printArchiveEvidence();
  else if (action === 'export') await exportArchive();
  else if (action === 'export-internal') {
    await exportArchive({releaseTrack: 'internal'});
  }
  else if (action === 'verify-ipa') verifyIpa();
  else if (action === 'verify-ipa-internal') {
    verifyIpa({releaseTrack: 'internal'});
  }
  else if (action === 'verify-archive') await verifyArchive();
  else if (action === 'verify-archive-internal') {
    await verifyArchive({releaseTrack: 'internal'});
  }
  else if (action === 'e2e') await smokeTest();
  else if (action === 'e2e-internal') {
    await smokeTest({releaseTrack: 'internal'});
  }
  else if (action === 'xcode') openXcode();
  else if (action === 'xcode-internal') {
    openXcode({releaseTrack: 'internal'});
  }
  else if (action === 'publish-remotes') publishRemotes();
  else if (action === 'publish-remotes-internal') {
    publishRemotes({releaseTrack: 'internal'});
  }
  else fail('Usage: testflight.mjs <preflight[-internal]|settings[-internal]|archive[-internal]|archive-evidence|export[-internal]|verify-ipa[-internal]|verify-remotes|verify-assets|verify-archive[-internal]|e2e[-internal]|xcode[-internal]|publish-remotes[-internal]> [artifact-path]');
} catch (error) {
  console.error(`TestFlight release check failed: ${error.message}`);
  process.exitCode = 1;
}

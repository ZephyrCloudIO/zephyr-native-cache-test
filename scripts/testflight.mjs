import {spawn, spawnSync} from 'node:child_process';
import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import {join, resolve} from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const WORKSPACE = join(ROOT, 'apps/host/ios/MFExampleHost.xcworkspace');
const SCHEME = 'MFExampleHost';
const VERSION = '1.0.0';
const REQUIRED_XCODE_MAJOR = 26;

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
    stdio: options.capture ? 'pipe' : 'inherit',
  });
  if (result.status !== 0) {
    fail(options.message ?? `${command} failed with exit code ${result.status}`);
  }
  return result.stdout ?? '';
}

function getBuildNumber() {
  const build = process.env.IOS_BUILD_NUMBER;
  if (!build || !/^[1-9]\d*$/.test(build)) {
    fail('Set IOS_BUILD_NUMBER to the positive App Store Connect build number');
  }
  return build;
}

function requireReleaseEnvironment() {
  if (process.env.ZEPHYR_DISTRIBUTION !== 'testflight') {
    fail('ZEPHYR_DISTRIBUTION must be testflight');
  }
  if (!process.env.ZE_SECRET_TOKEN || process.env.ZE_SECRET_TOKEN.includes('replace_me')) {
    fail('Set a real ZE_SECRET_TOKEN in .env.testflight');
  }
  if (!process.env.IOS_BUNDLE_ID || !/^[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/.test(process.env.IOS_BUNDLE_ID)) {
    fail('Set IOS_BUNDLE_ID to the reserved explicit App ID');
  }
  if (!process.env.APPLE_TEAM_ID || process.env.APPLE_TEAM_ID === 'replace_me') {
    fail('Set APPLE_TEAM_ID after selecting the Apple Developer team');
  }
  if (process.env.ZE_FAIL_BUILD !== 'true') {
    fail('ZE_FAIL_BUILD must be true so Zephyr errors stop the release build');
  }
  getBuildNumber();

  const envPath = join(ROOT, '.env.testflight');
  if (!existsSync(envPath)) fail('Create .env.testflight from .env.testflight.example');
  if ((statSync(envPath).mode & 0o077) !== 0) {
    fail('.env.testflight must be private; run chmod 600 .env.testflight');
  }

  const xcodeVersion = run('xcodebuild', ['-version'], {capture: true});
  const major = Number(xcodeVersion.match(/Xcode (\d+)/)?.[1]);
  if (!major || major < REQUIRED_XCODE_MAJOR) {
    fail(`Xcode ${REQUIRED_XCODE_MAJOR} or later is required`);
  }

  const hostPackage = JSON.parse(
    readFileSync(join(ROOT, 'apps/host/package.json'), 'utf8'),
  );
  const dependencies = hostPackage['zephyr:dependencies'] ?? {};
  for (const alias of ['mini', 'nestedMini']) {
    const dependency = dependencies[alias];
    if (typeof dependency !== 'string' || !dependency.endsWith('@testflight')) {
      fail(`Host dependency ${alias} must use the testflight selector`);
    }
    if (dependency.includes('DEMO')) fail(`Host dependency ${alias} still uses DEMO`);
  }

  console.log(`Preflight passed with Xcode ${major}, bundle ${process.env.IOS_BUNDLE_ID}`);
}

function xcodeArgs(actions, archivePath) {
  const args = [
    '-workspace', WORKSPACE,
    '-scheme', SCHEME,
    '-configuration', 'Release',
    '-destination', 'generic/platform=iOS',
    `PRODUCT_BUNDLE_IDENTIFIER=${process.env.IOS_BUNDLE_ID}`,
    `DEVELOPMENT_TEAM=${process.env.APPLE_TEAM_ID}`,
    'CODE_SIGN_STYLE=Automatic',
  ];
  if (archivePath) args.push('-archivePath', archivePath);
  args.push(...(Array.isArray(actions) ? actions : [actions]));
  return args;
}

function showBuildSettings() {
  requireReleaseEnvironment();
  const build = getBuildNumber();
  const output = run('xcodebuild', xcodeArgs('-showBuildSettings'), {capture: true});
  const expected = {
    PRODUCT_BUNDLE_IDENTIFIER: process.env.IOS_BUNDLE_ID,
    MARKETING_VERSION: VERSION,
    CURRENT_PROJECT_VERSION: build,
    TARGETED_DEVICE_FAMILY: '1',
    IPHONEOS_DEPLOYMENT_TARGET: '15.1',
    CONFIGURATION: 'Release',
  };
  for (const [setting, value] of Object.entries(expected)) {
    const match = output.match(new RegExp(`^\\s*${setting} = (.+)$`, 'm'))?.[1]?.trim();
    if (match !== value) fail(`${setting} is ${match ?? 'missing'}; expected ${value}`);
  }
  console.log('Release build settings are valid');
}

async function archive() {
  showBuildSettings();
  const build = getBuildNumber();
  const archivePath = resolve(
    process.argv[3] ?? join(ROOT, 'build/testflight', `ZephyrHealth-${VERSION}-${build}.xcarchive`),
  );
  await mkdir(resolve(archivePath, '..'), {recursive: true});
  run('xcodebuild', xcodeArgs(['clean', 'archive'], archivePath), {
    env: process.env,
  });
  console.log(`Archive created at ${archivePath}`);
}

function walk(path) {
  const stat = statSync(path);
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

function verifyArchive() {
  requireReleaseEnvironment();
  const build = getBuildNumber();
  const archivePath = resolve(
    process.argv[3] ?? join(ROOT, 'build/testflight', `ZephyrHealth-${VERSION}-${build}.xcarchive`),
  );
  const appPath = findHostApp(archivePath);
  const plistJson = run(
    'plutil',
    ['-convert', 'json', '-o', '-', join(appPath, 'Info.plist')],
    {capture: true, message: 'Unable to read archived Info.plist'},
  );
  const info = JSON.parse(plistJson);
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
  if (JSON.stringify(info.UISupportedInterfaceOrientations) !== '["UIInterfaceOrientationPortrait"]') {
    fail('Archive must support portrait orientation only');
  }

  run('codesign', ['--verify', '--deep', '--strict', appPath], {
    message: 'Archive code signature validation failed',
  });
  const executable = join(appPath, info.CFBundleExecutable);
  const architectures = run('lipo', ['-archs', executable], {capture: true}).trim().split(/\s+/);
  if (!architectures.includes('arm64')) fail('Archive executable does not contain arm64');

  const files = walk(archivePath);
  if (!files.some(path => path.endsWith('PrivacyInfo.xcprivacy'))) {
    fail('Archive contains no privacy manifest');
  }
  const forbidden = [
    'localhost:8081', 'localhost:8082', 'localhost:8083', '127.0.0.1',
    'DEMO', 'clients3.google.com/generate_204', 'ZE_SECRET_TOKEN',
    'sntryu_', '.env.testflight', '.env.e2e',
  ];
  if (process.env.ZE_SECRET_TOKEN) forbidden.push(process.env.ZE_SECRET_TOKEN);
  const required = [
    'cache-test-mini.zephyr-native-cache-test.zephyrcloudio',
    'cache-test-nested-mini.zephyr-native-cache-test.zephyrcloudio',
  ];
  const foundRequired = new Set();
  for (const path of files) {
    let bytes;
    try {
      bytes = readFileSync(path);
    } catch {
      continue;
    }
    const text = bytes.toString('latin1');
    for (const value of forbidden) {
      if (value && text.includes(value)) fail(`Forbidden release content found in ${path}`);
    }
    for (const match of text.matchAll(/http:\/\/[^\0\s"'<>]+/g)) {
      if (!match[0].startsWith('http://www.apple.com/DTDs/')) {
        fail(`Insecure HTTP release URL found in ${path}`);
      }
    }
    for (const value of required) {
      if (text.includes(value)) foundRequired.add(value);
    }
  }
  for (const value of required) {
    if (!foundRequired.has(value)) fail(`Archive does not contain required remote ${value}`);
  }
  console.log(`Archive verification passed: ${archivePath}`);
}

function smokeTest() {
  requireReleaseEnvironment();
  process.env.APP_ID = process.env.IOS_BUNDLE_ID;
  run('maestro', [
    '--platform=ios',
    'test',
    '-e',
    `APP_ID=${process.env.IOS_BUNDLE_ID}`,
    join(ROOT, 'apps/host/e2e/flows/core.yaml'),
  ]);
}

function openXcode() {
  requireReleaseEnvironment();
  console.log('Use pnpm testflight:archive for the authoritative release archive.');
  const developerDir = run('xcode-select', ['-p'], {capture: true}).trim();
  const executable = resolve(developerDir, '../MacOS/Xcode');
  const child = spawn(executable, [WORKSPACE], {
    detached: true,
    env: process.env,
    stdio: 'ignore',
  });
  child.unref();
}

function publishRemotes() {
  requireReleaseEnvironment();
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
  else if (action === 'settings') showBuildSettings();
  else if (action === 'archive') await archive();
  else if (action === 'verify-archive') verifyArchive();
  else if (action === 'e2e') smokeTest();
  else if (action === 'xcode') openXcode();
  else if (action === 'publish-remotes') publishRemotes();
  else fail('Usage: testflight.mjs <preflight|settings|archive|verify-archive|e2e|xcode|publish-remotes> [archive-path]');
} catch (error) {
  console.error(`TestFlight release check failed: ${error.message}`);
  process.exitCode = 1;
}

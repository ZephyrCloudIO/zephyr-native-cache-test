import { execa, execaCommand } from 'execa';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type TaskDef,
  exec,
  execArgs,
  killPort,
  waitForManifest,
  nativeCacheChanged,
  hostAppChanged,
  hostPaths,
  cleanHostBuildCaches,
  pause,
  registerBgProcess,
  runTaskPipeline,
  sleep,
} from './lib/e2e-runtime.js';

// ── Paths & Config ─────────────────────────────────────────────────────────

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const HOST = join(ROOT, 'apps/host');
const FLOWS = join(HOST, 'e2e/flows');

// ── Args ───────────────────────────────────────────────────────────────────

let PLATFORM = '';
let MODE: 'release' | 'dev' = 'release';

for (const arg of process.argv.slice(2)) {
  if (arg === '--dev') MODE = 'dev';
  else if (arg === '--release') MODE = 'release';
  else if (arg === 'ios' || arg === 'android') PLATFORM = arg;
}

if (!PLATFORM) {
  console.error('Usage: pnpm e2e:zephyr <ios|android> [--dev]');
  process.exit(1);
}

// ── Preflight ──────────────────────────────────────────────────────────────

const REQUIRED_ENV = ['ZE_API_GATE', 'ZE_API', 'ZE_IS_PREVIEW', 'ZE_SECRET_TOKEN'] as const;

async function checkPreflight(log: (m: string) => void): Promise<void> {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required env vars: ${missing.join(', ')}. See .env.e2e.example for the full list.`,
    );
  }
  log('All required env vars set:');
  for (const k of REQUIRED_ENV) {
    const v = process.env[k]!;
    const display = /TOKEN|SECRET|KEY|PASSWORD|AUTH/.test(k) ? '<set>' : v;
    log(`  ${k}=${display}`);
  }
  await ensureDevice(log);
}

// The `Install host` step drops the pre-built binary onto a running device —
// `adb install` / `xcrun simctl install booted` both fail with unhelpful errors
// if nothing is booted. Resolve this up front so we don't notice ~10 minutes
// in (after vendor rebuild, host build, publish, and manual pin-v1).
//
// If nothing is booted, we ask the user to confirm before starting one —
// they might intentionally be about to plug in a physical device. The chosen
// device is NOT killed on exit; the final Success task keeps the app alive
// for demo purposes, so the user owns the device lifecycle.
// Override which AVD/simulator to boot via `ZE_ANDROID_AVD` / `ZE_IOS_SIMULATOR`.
async function ensureDevice(log: (m: string) => void): Promise<void> {
  if (PLATFORM === 'android') await ensureAndroidDevice(log);
  else await ensureIosSimulator(log);
}

async function listAndroidDevices(): Promise<string[]> {
  const { stdout } = await execa('adb', ['devices'], { reject: false });
  return stdout
    .split('\n')
    .slice(1)
    .map((l) => l.trim())
    .filter((l) => /\tdevice$/.test(l))
    .map((l) => l.split('\t')[0]!);
}

async function ensureAndroidDevice(log: (m: string) => void): Promise<void> {
  let devices = await listAndroidDevices();
  if (devices.length > 0) {
    log(`Android device(s) ready: ${devices.join(', ')}`);
    return;
  }

  const { stdout: avdList, exitCode } = await execa('emulator', ['-list-avds'], { reject: false });
  if (exitCode !== 0) {
    throw new Error(
      'No Android device connected and `emulator` is not on PATH. ' +
        'Add `$ANDROID_HOME/emulator` to PATH or boot a device manually.',
    );
  }
  const avds = avdList.trim().split('\n').filter(Boolean);
  if (avds.length === 0) {
    throw new Error(
      'No Android device connected and no AVDs found. ' +
        'Create one in Android Studio → Device Manager.',
    );
  }
  const avd = process.env.ZE_ANDROID_AVD ?? avds[0]!;
  if (!avds.includes(avd)) {
    throw new Error(`ZE_ANDROID_AVD="${avd}" not found. Available: ${avds.join(', ')}`);
  }

  await pause(
    [
      'No Android device connected.',
      `Press SPACE to boot AVD **${avd}**, or Ctrl+C to abort${
        avds.length > 1 ? ` (override via **ZE_ANDROID_AVD** — options: ${avds.join(', ')})` : ''
      }.`,
    ].join('\n'),
    log,
    { label: '▶ BOOT DEVICE', prompt: 'Press SPACE to boot · Ctrl+C to abort' },
  );

  log(`Booting AVD "${avd}"…`);
  execa('emulator', ['-avd', avd, '-no-boot-anim'], {
    detached: true,
    stdio: 'ignore',
    reject: false,
  }).unref?.();

  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    await sleep(2000);
    const { stdout: state } = await execa(
      'adb',
      ['shell', 'getprop', 'sys.boot_completed'],
      { reject: false },
    );
    if (state.trim() === '1') {
      devices = await listAndroidDevices();
      log(`AVD "${avd}" booted — ${devices.join(', ')}`);
      return;
    }
  }
  throw new Error(`AVD "${avd}" did not finish booting within 3 minutes.`);
}

async function ensureIosSimulator(log: (m: string) => void): Promise<void> {
  const { stdout: bootedCheck } = await execa(
    'xcrun',
    ['simctl', 'list', 'devices', 'booted'],
    { reject: false },
  );
  const booted = bootedCheck.split('\n').filter((l) => l.includes('(Booted)'));
  if (booted.length > 0) {
    log(`iOS simulator(s) booted: ${booted.length}`);
    booted.forEach((l) => log(`  ${l.trim()}`));
    return;
  }

  const { stdout: json } = await execa(
    'xcrun',
    ['simctl', 'list', 'devices', 'available', '-j'],
    { reject: false },
  );
  const data = JSON.parse(json) as {
    devices: Record<string, Array<{ udid: string; name: string; isAvailable?: boolean }>>;
  };
  // Runtimes look like `com.apple.CoreSimulator.SimRuntime.iOS-17-5`; pick the
  // highest iOS runtime so we don't boot an old simulator when newer ones exist.
  const iosRuntime = Object.keys(data.devices)
    .filter((k) => k.includes('iOS') || k.includes('iPhone'))
    .sort()
    .pop();
  if (!iosRuntime) {
    throw new Error('No iOS simulator runtimes available. Install via Xcode → Settings → Platforms.');
  }
  const candidates = (data.devices[iosRuntime] ?? []).filter((d) => d.isAvailable !== false);
  const name = process.env.ZE_IOS_SIMULATOR;
  const device =
    (name && candidates.find((d) => d.name === name)) ??
    candidates.find((d) => d.name.startsWith('iPhone')) ??
    candidates[0];
  if (!device) {
    if (name) {
      throw new Error(
        `ZE_IOS_SIMULATOR="${name}" not found. Available: ${candidates.map((d) => d.name).join(', ')}`,
      );
    }
    throw new Error(`No available simulators in runtime "${iosRuntime}".`);
  }

  await pause(
    [
      'No iOS simulator booted.',
      `Press SPACE to boot **${device.name}**, or Ctrl+C to abort${
        candidates.length > 1
          ? ` (override via **ZE_IOS_SIMULATOR** — options: ${candidates.map((d) => d.name).join(', ')})`
          : ''
      }.`,
    ].join('\n'),
    log,
    { label: '▶ BOOT DEVICE', prompt: 'Press SPACE to boot · Ctrl+C to abort' },
  );

  log(`Booting simulator "${device.name}"…`);
  await execa('xcrun', ['simctl', 'boot', device.udid], { reject: false });
  execa('open', ['-a', 'Simulator'], { reject: false }).catch(() => {});
  // `bootstatus` blocks until the simulator is fully ready, unlike `boot` which
  // returns as soon as the boot is kicked off.
  await execa('xcrun', ['simctl', 'bootstatus', device.udid]);
  log(`iOS simulator "${device.name}" ready.`);
}

// ── Helpers ────────────────────────────────────────────────────────────────

// Captured from each publish output so pause instructions can name the exact
// version the operator should pin in the dashboard. Keyed by
// `${appFilter}:${label}` where label is our own `v1`/`v2`/`v3`.
//
// Zephyr prints two lines per publish: `<app>.<project>.<org>#<n>` (e.g.
// `cache-test-mini.zephyr-native-cache-test.zephyrcloudio#12`). It logs a
// pre-build and post-build number; we keep the last match, which matches the
// number baked into the deployment URL (`jakub-12-cache-test-mini-…`).
const publishedVersions = new Map<
  string,
  { appUid: string; versionNumber: number; url: string }
>();

async function publishRemote(
  filter: string,
  version: string,
  log: (m: string) => void,
): Promise<void> {
  log(`Publishing ${filter} ${version}...`);
  let appUid = '';
  let versionNumber = 0;
  let url = '';
  // Child runs with FORCE_COLOR=1 in TUI mode, so Zephyr's lines contain ANSI
  // color escapes (e.g. `\x1b[32mcache-test-mini\x1b[0m.zephyr…`). Strip them
  // before matching — `#<n>` gets sandwiched between color resets otherwise.
  const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');
  await exec(
    `pnpm --filter=${filter} publish:${PLATFORM}`,
    (msg) => {
      log(msg);
      const plain = stripAnsi(msg);
      const idMatch = plain.match(/([a-z0-9-]+\.[a-z0-9-]+\.[a-z0-9-]+)#(\d+)/i);
      if (idMatch) {
        appUid = idMatch[1]!;
        versionNumber = parseInt(idMatch[2]!, 10);
      }
      const urlMatch = plain.match(/(https:\/\/[^\s]+\.zephyrcloudapp\.dev)/);
      if (urlMatch) url = urlMatch[1]!;
    },
    { cwd: ROOT, env: { REMOTE_VERSION: version, ZEPHYR_E2E: '1' } },
  );
  if (appUid && versionNumber) {
    publishedVersions.set(`${filter}:${version}`, { appUid, versionNumber, url });
    log(`→ captured: ${appUid}#${versionNumber}`);
  } else {
    log(`⚠ could not parse deployment identifier for ${filter} ${version}`);
  }
}

function describeVersion(filter: string, version: string): string {
  const entry = publishedVersions.get(`${filter}:${version}`);
  if (!entry) return `${filter} ${version} — identifier not captured; pick manually`;
  return `**${filter}** ${version} → pin to version **#${entry.versionNumber}** (${entry.appUid})`;
}

// Zephyr edge CDN propagation can take up to ~60s after a new deployment
// finishes to start serving the new manifest. We gate each Maestro phase on a
// wall-clock bound since the most recent `publishRemote` — by the time the
// operator has pinned the version in the dashboard and pressed SPACE, a good
// chunk of that budget is usually burned already; we only block for whatever
// remains.
const EDGE_PROPAGATION_MS = 60_000;
let lastPublishAt = 0;

async function waitForEdgeSettle(log: (m: string) => void): Promise<void> {
  if (lastPublishAt === 0) return; // nothing was published yet this session
  const remaining = EDGE_PROPAGATION_MS - (Date.now() - lastPublishAt);
  if (remaining <= 0) {
    log('Edge CDN already settled — proceeding.');
    return;
  }
  const seconds = Math.ceil(remaining / 1000);
  log(`⏳ Waiting ${seconds}s for edge CDN to propagate the deployment…`);
  await sleep(remaining);
}

// Locate the most recently built iOS simulator `.app` under DerivedData so the
// Install step can drop it onto the booted sim without re-running the build.
function findIosAppPath(): string {
  const dd = join(process.env.HOME ?? '', 'Library/Developer/Xcode/DerivedData');
  if (!existsSync(dd)) throw new Error(`DerivedData not found at ${dd}`);
  const candidates = readdirSync(dd)
    .filter((d) => d.startsWith('MFExampleHost-'))
    .map((d) => ({ path: join(dd, d), mtime: statSync(join(dd, d)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const { path } of candidates) {
    const productsDir = join(path, 'Build/Products/Release-iphonesimulator');
    if (!existsSync(productsDir)) continue;
    const app = readdirSync(productsDir).find((f) => f.endsWith('.app'));
    if (app) return join(productsDir, app);
  }
  throw new Error('No built MFExampleHost.app found under DerivedData — run the Build step first');
}

function androidApkPath(): string {
  return join(HOST, 'android/app/build/outputs/apk/release/app-release.apk');
}

// ── Task definitions ───────────────────────────────────────────────────────

const taskDefs: TaskDef[] = [
  {
    title: 'Preflight',
    run: async (log) => checkPreflight(log),
  },
  {
    title: 'Rebuild vendor tarballs',
    run: async (log) => {
      const changed = await nativeCacheChanged(ROOT);
      if (!changed) { log('Vendor source unchanged — skipping rebuild'); return; }
      log('Vendor source changed — rebuilding native-cache and zephyr-plugins...');
      await exec('bash scripts/build-native-cache.sh', log, { cwd: ROOT });
      await exec('bash scripts/build-zephyr-plugins.sh', log, { cwd: ROOT });
      await exec('pnpm install', log, { cwd: ROOT });
      await exec('pnpm pods', log, { cwd: HOST });
      await exec('bash scripts/check-native-cache.sh', log, { cwd: ROOT });
      cleanHostBuildCaches(HOST, PLATFORM);
      log('Vendor tarballs ready');
    },
  },
  ...(MODE === 'dev' ? [{
    title: 'Start Metro (dev mode)',
    run: async (log: (m: string) => void, serverLog: (l: string, m: string) => void) => {
      await killPort(8081);
      const p = execaCommand('pnpm exec rnef start --reset-cache --client-logs', {
        cwd: HOST,
        env: { ...process.env, FORCE_COLOR: '1' },
      });
      p.catch(() => {}); registerBgProcess(p);
      const handle = (c: Buffer) => {
        for (const l of c.toString().split('\n')) {
          const t = l.trim();
          if (t) { log(t); serverLog('Metro', t); }
        }
      };
      p.stdout?.on('data', handle); p.stderr?.on('data', handle);
      await waitForManifest(8081, 'Metro', log);
    },
  }] : []),
  {
    // Build the native binary up-front so the long compile step can run in
    // parallel with the operator preparing the dashboard. Install is deferred
    // until after pin v1 (see `Install host`) so nothing hits the device before
    // the Zephyr environment is actually serving bundles.
    //
    // Dev mode skips this: Metro serves the JS bundle at runtime, so `rnef
    // run:<platform>` at the Install step is enough.
    title: 'Build host',
    skip: () => (MODE === 'dev' ? 'dev mode — Metro serves bundles at runtime' : false),
    run: async (log) => {
      const changed = await hostAppChanged(ROOT, hostPaths(PLATFORM), `zephyr:${PLATFORM}`);
      if (changed) {
        log('Host app source changed — cleaning DerivedData to force rebuild');
        cleanHostBuildCaches(HOST, PLATFORM);
      }
      const cmd =
        PLATFORM === 'android'
          ? 'pnpm exec rnef build:android --variant Release'
          : 'pnpm exec rnef build:ios --configuration Release --destination simulator';
      await exec(cmd, log, {
        cwd: HOST,
        env: { ZEPHYR_E2E: '1', FORCE_COLOR: '1' },
      });
    },
  },
  {
    title: 'Publish v1',
    run: async (log) => {
      await publishRemote('cache-test-mini', 'v1', log);
      await publishRemote('cache-test-nested-mini', 'v1', log);
      lastPublishAt = Date.now();
    },
  },
  {
    title: 'Manual: pin v1',
    run: async (log) => {
      await pause(
        [
          'In the Zephyr dashboard, pin the **DEMO** environment to **v1** for both remotes:',
          `• ${describeVersion('cache-test-mini', 'v1')}`,
          `• ${describeVersion('cache-test-nested-mini', 'v1')}`,
          'See ZEPHYR_OTA_DEMO.md → Pause A for navigation.',
        ].join('\n'),
        log,
      );
    },
  },
  {
    // Drop the pre-built binary onto the simulator/device without launching.
    // Phase 1 owns the first cold launch so the MF runtime state starts clean
    // and bundles come straight from Zephyr.
    title: 'Install host',
    run: async (log) => {
      if (MODE === 'dev') {
        // Dev mode: `rnef run` wires Metro + install + launch in one step,
        // which is fine here because dev fetches bundles from Metro (not from
        // baked URLs) so there's no "stale URLs baked in" concern.
        const proc = execa('pnpm', ['exec', 'rnef', `run:${PLATFORM}`], {
          cwd: HOST,
          reject: false,
          env: { ...process.env, FORCE_COLOR: '1', ZEPHYR_E2E: '1' },
        });
        const pipe = (s: NodeJS.ReadableStream | null | undefined) => {
          s?.on('data', (c: Buffer) => {
            for (const l of c.toString().split('\n')) { const t = l.trim(); if (t) log(t); }
          });
        };
        pipe(proc.stdout); pipe(proc.stderr);
        const res = await proc;
        if (res.exitCode !== 0) throw new Error(`rnef run failed (exit ${res.exitCode})`);
        return;
      }
      if (PLATFORM === 'android') {
        const apk = androidApkPath();
        if (!existsSync(apk)) throw new Error(`APK missing: ${apk} — did Build host succeed?`);
        log(`Installing ${apk}`);
        await execArgs('adb', ['install', '-r', apk], log, { cwd: ROOT });
      } else {
        const app = findIosAppPath();
        log(`Installing ${app}`);
        await execArgs('xcrun', ['simctl', 'install', 'booted', app], log, { cwd: ROOT });
      }
      log('Installed — app is not running. Phase 1 will launch it.');
    },
  },
  {
    // Install is fast — pausing here would make pin-v1 / Phase-1 feel like
    // two SPACE presses in a row. Let Maestro roll straight after install.
    // `waitForEdgeSettle` blocks until ≥60s has elapsed since `Publish v1`
    // so the cold launch doesn't race an in-flight CDN propagation.
    title: 'Phase 1 — baseline',
    run: async (log) => {
      await waitForEdgeSettle(log);
      await exec(`maestro --platform ${PLATFORM} test ${join(FLOWS, 'ota-phase1-zephyr.yaml')}`, log, { cwd: ROOT });
    },
  },
  {
    title: 'Publish v2',
    run: async (log) => {
      await pause('Ready to publish v2 of mini + nested-mini to Zephyr.', log);
      await publishRemote('cache-test-mini', 'v2', log);
      await publishRemote('cache-test-nested-mini', 'v2', log);
      lastPublishAt = Date.now();
    },
  },
  {
    title: 'Manual: pin v2',
    run: async (log) => {
      await pause(
        [
          'In the Zephyr dashboard, pin the **DEMO** environment to **v2** for both remotes:',
          `• ${describeVersion('cache-test-mini', 'v2')}`,
          `• ${describeVersion('cache-test-nested-mini', 'v2')}`,
          'See ZEPHYR_OTA_DEMO.md → Pause B for navigation.',
        ].join('\n'),
        log,
      );
    },
  },
  {
    // No pause — we just came off `Manual: pin v2`, which is already gated by
    // the operator. Running Maestro immediately keeps the flow from asking
    // for two SPACE presses back to back. `waitForEdgeSettle` ensures the
    // app's next 15s poll sees the settled manifest, not a racing one.
    title: 'Phase 2 — update + crash',
    run: async (log) => {
      await waitForEdgeSettle(log);
      await exec(`maestro --platform ${PLATFORM} test ${join(FLOWS, 'ota-phase2-zephyr.yaml')}`, log, { cwd: ROOT });
    },
  },
  {
    title: 'Manual: rollback nested-mini',
    run: async (log) => {
      await pause(
        [
          'In the Zephyr dashboard, rollback **nested-mini**\'s **DEMO** env to **v1**:',
          `• ${describeVersion('cache-test-nested-mini', 'v1')}`,
          'Leave **mini** pinned to **v2**. See ZEPHYR_OTA_DEMO.md → Pause C for navigation.',
        ].join('\n'),
        log,
      );
    },
  },
  {
    // Follows `Manual: rollback nested-mini` — no extra pause needed.
    title: 'Phase 3 — rollback',
    run: async (log) => {
      await waitForEdgeSettle(log);
      await exec(`maestro --platform ${PLATFORM} test ${join(FLOWS, 'ota-phase3-zephyr.yaml')}`, log, { cwd: ROOT });
    },
  },
  {
    title: 'Publish nested-mini v3',
    run: async (log) => {
      await pause('Ready to publish v3 of nested-mini to Zephyr.', log);
      await publishRemote('cache-test-nested-mini', 'v3', log);
      lastPublishAt = Date.now();
    },
  },
  {
    title: 'Manual: pin nested-mini v3',
    run: async (log) => {
      await pause(
        [
          'In the Zephyr dashboard, pin **nested-mini**\'s **DEMO** env to **v3**:',
          `• ${describeVersion('cache-test-nested-mini', 'v3')}`,
          '**Mini** stays on **v2**. See ZEPHYR_OTA_DEMO.md → Pause D for navigation.',
        ].join('\n'),
        log,
      );
    },
  },
  {
    // Follows `Manual: pin nested-mini v3` — no extra pause needed.
    title: 'Phase 4 — partial update',
    run: async (log) => {
      await waitForEdgeSettle(log);
      await exec(`maestro --platform ${PLATFORM} test ${join(FLOWS, 'ota-phase4-zephyr.yaml')}`, log, { cwd: ROOT });
    },
  },
  {
    // Final gate that holds the orchestrator (and the running sim) open after
    // every phase passes. Without this the TUI exits the moment Phase 4
    // finishes, killing the simulator app and taking the demo state with it.
    title: '🎉 Success',
    run: async (log) => {
      await pause(
        [
          '🎉 **DEMO COMPLETE** — every phase passed',
          '',
          '✅ Host built, installed, and live on the simulator',
          '✅ **v1** published + pinned → Phase 1 baseline',
          '✅ **v2** OTA update + CacheInfo crash recovery → Phase 2',
          '✅ **nested-mini** rolled back to v1 → Phase 3',
          '✅ **nested-mini v3** partial update (mini stays on v2) → Phase 4',
          '',
          '🚀 Simulator stays up — tap around, show off the DevTools panel, or',
          '   end the demo whenever you\'re ready.',
        ].join('\n'),
        log,
        { label: '🎉 SUCCESS', prompt: 'Press SPACE to wrap up and exit' },
      );
    },
  },
];

// ── Run ────────────────────────────────────────────────────────────────────

await runTaskPipeline(taskDefs, { title: '⚡ OTA E2E (Zephyr)', subtitle: `${PLATFORM} · ${MODE}` });

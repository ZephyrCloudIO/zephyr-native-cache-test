import { execa, execaCommand } from 'execa';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type TaskDef,
  exec,
  sleep,
  killPort,
  waitForManifest,
  nativeCacheChanged,
  hostAppChanged,
  hostPaths,
  cleanHostBuildCaches,
  pause,
  registerBgProcess,
  runTaskPipeline,
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

function checkPreflight(log: (m: string) => void): void {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required env vars: ${missing.join(', ')}. See .env.e2e.example for the full list.`,
    );
  }
  log('All required env vars set:');
  for (const k of REQUIRED_ENV) {
    const v = process.env[k]!;
    const redacted = k === 'ZE_SECRET_TOKEN' ? `${v.slice(0, 8)}…` : v;
    log(`  ${k}=${redacted}`);
  }
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
  return `${filter} ${version} → pin to version #${entry.versionNumber} (${entry.appUid})`;
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
    title: 'Build & install host',
    run: async (log) => {
      const changed = await hostAppChanged(ROOT, hostPaths(PLATFORM), `zephyr:${PLATFORM}`);
      if (changed) {
        log('Host app source changed — cleaning DerivedData to force rebuild');
        cleanHostBuildCaches(HOST, PLATFORM);
      }
      const args = ['exec', 'rnef', `run:${PLATFORM}`];
      if (MODE === 'release') {
        if (PLATFORM === 'android') args.push('--variant', 'Release');
        else args.push('--configuration', 'Release', '--destination', 'simulator');
      }
      const proc = execa('pnpm', args, {
        cwd: HOST,
        reject: false,
        env: { ...process.env, FORCE_COLOR: '1', ZEPHYR_E2E: '1' },
      });
      const pipe = (s: NodeJS.ReadableStream | null | undefined) => {
        s?.on('data', (c: Buffer) => { for (const l of c.toString().split('\n')) { const t = l.trim(); if (t) log(t); } });
      };
      pipe(proc.stdout); pipe(proc.stderr);
      const res = await proc;
      if (res.exitCode !== 0) throw new Error(`rnef run failed (exit ${res.exitCode})`);
      log('App launched, initializing...'); await sleep(5000);
    },
  },
  {
    title: 'Publish v1',
    run: async (log) => {
      await publishRemote('cache-test-mini', 'v1', log);
      await publishRemote('cache-test-nested-mini', 'v1', log);
    },
  },
  {
    title: 'Manual: pin v1',
    run: async (log) => {
      await pause(
        [
          'In the Zephyr dashboard, pin the DEMO environment to v1 for both remotes:',
          `• ${describeVersion('cache-test-mini', 'v1')}`,
          `• ${describeVersion('cache-test-nested-mini', 'v1')}`,
          'See ZEPHYR_OTA_DEMO.md → Pause A for navigation.',
        ].join('\n'),
        log,
      );
    },
  },
  {
    title: 'Phase 1 — baseline',
    run: async (log) => {
      await pause('Ready to run Phase 1 Maestro — verify v1 baseline renders.', log);
      await exec(`maestro test ${join(FLOWS, 'ota-phase1.yaml')}`, log, { cwd: ROOT });
    },
  },
  {
    title: 'Publish v2',
    run: async (log) => {
      await pause('Ready to publish v2 of mini + nested-mini to Zephyr.', log);
      await publishRemote('cache-test-mini', 'v2', log);
      await publishRemote('cache-test-nested-mini', 'v2', log);
    },
  },
  {
    title: 'Manual: pin v2',
    run: async (log) => {
      await pause(
        [
          'In the Zephyr dashboard, pin the DEMO environment to v2 for both remotes:',
          `• ${describeVersion('cache-test-mini', 'v2')}`,
          `• ${describeVersion('cache-test-nested-mini', 'v2')}`,
          'See ZEPHYR_OTA_DEMO.md → Pause B for navigation.',
        ].join('\n'),
        log,
      );
    },
  },
  {
    title: 'Phase 2 — update + crash',
    run: async (log) => {
      await pause('Ready to run Phase 2 Maestro — observe OTA update + crash recovery.', log);
      await exec(`maestro test ${join(FLOWS, 'ota-phase2-zephyr.yaml')}`, log, { cwd: ROOT });
    },
  },
  {
    title: 'Manual: rollback nested-mini',
    run: async (log) => {
      await pause(
        [
          'In the Zephyr dashboard, rollback nested-mini\'s DEMO env to v1:',
          `• ${describeVersion('cache-test-nested-mini', 'v1')}`,
          'Leave mini pinned to v2. See ZEPHYR_OTA_DEMO.md → Pause C for navigation.',
        ].join('\n'),
        log,
      );
    },
  },
  {
    title: 'Phase 3 — rollback',
    run: async (log) => {
      await pause('Ready to run Phase 3 Maestro — observe rollback picked up by host.', log);
      await exec(`maestro test ${join(FLOWS, 'ota-phase3-zephyr.yaml')}`, log, { cwd: ROOT });
    },
  },
  {
    title: 'Publish nested-mini v3',
    run: async (log) => {
      await pause('Ready to publish v3 of nested-mini to Zephyr.', log);
      await publishRemote('cache-test-nested-mini', 'v3', log);
    },
  },
  {
    title: 'Manual: pin nested-mini v3',
    run: async (log) => {
      await pause(
        [
          'In the Zephyr dashboard, pin nested-mini\'s DEMO env to v3:',
          `• ${describeVersion('cache-test-nested-mini', 'v3')}`,
          'Mini stays on v2. See ZEPHYR_OTA_DEMO.md → Pause D for navigation.',
        ].join('\n'),
        log,
      );
    },
  },
  {
    title: 'Phase 4 — partial update',
    run: async (log) => {
      await pause('Ready to run Phase 4 Maestro — observe partial update (nested-mini only).', log);
      await exec(`maestro test ${join(FLOWS, 'ota-phase4-zephyr.yaml')}`, log, { cwd: ROOT });
    },
  },
];

// ── Run ────────────────────────────────────────────────────────────────────

await runTaskPipeline(taskDefs, { title: '⚡ OTA E2E (Zephyr)', subtitle: `${PLATFORM} · ${MODE}` });

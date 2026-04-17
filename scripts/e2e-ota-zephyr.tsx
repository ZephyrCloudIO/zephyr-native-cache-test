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

async function publishRemote(
  filter: string,
  version: string,
  log: (m: string) => void,
): Promise<void> {
  log(`Publishing ${filter} ${version}...`);
  await exec(
    `pnpm --filter=${filter} publish:${PLATFORM}`,
    log,
    { cwd: ROOT, env: { REMOTE_VERSION: version, ZEPHYR_E2E: '1' } },
  );
  log(`Published ${filter} ${version}`);
}

// ── Task definitions ───────────────────────────────────────────────────────

const taskDefs: TaskDef[] = [
  {
    title: 'Preflight — verify Zephyr env',
    run: async (log) => checkPreflight(log),
  },
  {
    title: 'Rebuild vendor tarballs (native-cache + zephyr-plugins)',
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
  {
    title: 'Publish v1 (mini + nested-mini)',
    run: async (log) => {
      await publishRemote('cache-test-mini', 'v1', log);
      await publishRemote('cache-test-nested-mini', 'v1', log);
    },
  },
  {
    title: 'Manual — tag v1 as default for both remotes',
    run: async () => {
      await pause('Dashboard: tag v1 as default for mini + nested-mini (see ZEPHYR_OTA_DEMO.md → Pause A)');
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
    title: `Build & install host (${MODE === 'release' ? 'Release' : 'Debug'})`,
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
    title: 'Phase 1 — v1 baseline',
    run: async (log) => {
      await pause('Ready to run Phase 1 Maestro — verify v1 baseline renders');
      await exec(`maestro test ${join(FLOWS, 'ota-phase1.yaml')}`, log, { cwd: ROOT });
    },
  },
  {
    title: 'Publish v2 (mini + nested-mini)',
    run: async (log) => {
      await pause('Ready to publish v2 of mini + nested-mini to Zephyr');
      await publishRemote('cache-test-mini', 'v2', log);
      await publishRemote('cache-test-nested-mini', 'v2', log);
    },
  },
  {
    title: 'Manual — tag v2 as default for both remotes',
    run: async () => {
      await pause('Dashboard: tag v2 as default for mini + nested-mini (see ZEPHYR_OTA_DEMO.md → Pause B)');
    },
  },
  {
    title: 'Phase 2 — update + crash',
    run: async (log) => {
      await pause('Ready to run Phase 2 Maestro — observe OTA update + crash recovery');
      await exec(`maestro test ${join(FLOWS, 'ota-phase2.yaml')}`, log, { cwd: ROOT });
    },
  },
  {
    title: 'Manual — rollback nested-mini to v1',
    run: async () => {
      await pause('Dashboard: rollback nested-mini to v1 (mini stays on v2) (see ZEPHYR_OTA_DEMO.md → Pause C)');
    },
  },
  {
    title: 'Phase 3 — rollback',
    run: async (log) => {
      await pause('Ready to run Phase 3 Maestro — observe rollback picked up by host');
      await exec(`maestro test ${join(FLOWS, 'ota-phase3.yaml')}`, log, { cwd: ROOT });
    },
  },
  {
    title: 'Publish nested-mini v3',
    run: async (log) => {
      await pause('Ready to publish v3 of nested-mini to Zephyr');
      await publishRemote('cache-test-nested-mini', 'v3', log);
    },
  },
  {
    title: 'Manual — tag nested-mini v3 as default',
    run: async () => {
      await pause('Dashboard: tag nested-mini v3 as default (see ZEPHYR_OTA_DEMO.md → Pause D)');
    },
  },
  {
    title: 'Phase 4 — partial update',
    run: async (log) => {
      await pause('Ready to run Phase 4 Maestro — observe partial update (nested-mini only)');
      await exec(`maestro test ${join(FLOWS, 'ota-phase4.yaml')}`, log, { cwd: ROOT });
    },
  },
];

// ── Run ────────────────────────────────────────────────────────────────────

await runTaskPipeline(taskDefs, { title: '⚡ OTA E2E (Zephyr)', subtitle: `${PLATFORM} · ${MODE}` });

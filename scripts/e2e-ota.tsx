import { execaCommand, execa } from 'execa';
import { existsSync, cpSync, rmSync } from 'node:fs';
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
const FIXTURES = join(ROOT, 'e2e-fixtures');
const HOST = join(ROOT, 'apps/host');
const FLOWS = join(HOST, 'e2e/flows');
const SERVE = join(ROOT, 'apps/mini/node_modules/.bin/serve');
const CDN_SETTLE_MS = 2_000;

// ── Args ───────────────────────────────────────────────────────────────────

let PLATFORM = '';
let MODE: 'release' | 'dev' = 'release';
let INTERACTIVE = false;

for (const arg of process.argv.slice(2)) {
  if (arg === '--interactive' || arg === '-i') INTERACTIVE = true;
  else if (arg === '--dev') MODE = 'dev';
  else if (arg === '--release') MODE = 'release';
  else if (arg === 'ios' || arg === 'android') PLATFORM = arg;
}

if (!PLATFORM) {
  console.error('Usage: pnpm e2e <ios|android> [--dev] [--interactive]');
  process.exit(1);
}

// ── Mocked-flow helpers ────────────────────────────────────────────────────

async function checkCDN(log: (m: string) => void): Promise<void> {
  await Promise.all([
    waitForManifest(8082, 'mini CDN', log, 5000),
    waitForManifest(8083, 'nested-mini CDN', log, 5000),
  ]);
}

function swapCDN(source: string, target: string, log: (m: string) => void): void {
  const srcDir = join(FIXTURES, source);
  const tgtDir = join(FIXTURES, target);
  cpSync(srcDir, tgtDir, { recursive: true, filter: (s: string) => !s.endsWith('mf-manifest.json') });
  cpSync(join(srcDir, 'mf-manifest.json'), join(tgtDir, 'mf-manifest.json'));
  log(`CDN swap: ${source} → ${target.replace('-current', '')}`);
}

function fixturesExist(): boolean {
  return ['mini-v1', 'mini-v2', 'nested-v1', 'nested-v2', 'nested-v3'].every(
    (n) => existsSync(join(FIXTURES, n)),
  );
}


// ── Task definitions ───────────────────────────────────────────────────────

const taskDefs: TaskDef[] = [
  {
    title: 'Rebuild native cache package',
    run: async (log) => {
      const changed = await nativeCacheChanged(ROOT);
      if (!changed) { log('Vendor source unchanged — skipping rebuild'); return; }
      log('Vendor source changed — rebuilding...');
      await exec('bash scripts/build-native-cache.sh', log, { cwd: ROOT });
      await exec('pnpm install', log, { cwd: ROOT });
      await exec('pnpm pods', log, { cwd: HOST });
      await exec('bash scripts/check-native-cache.sh', log, { cwd: ROOT });
      cleanHostBuildCaches(HOST, PLATFORM);
      log('Native cache package ready');
    },
  },
  {
    title: 'Build E2E fixtures (5 versions)',
    skip: () => fixturesExist() && 'Fixtures cached',
    run: async (log) => { await exec(`bash scripts/build-e2e-versions.sh ${PLATFORM}`, log, { cwd: ROOT }); },
  },
  {
    title: 'Initialize CDN directories',
    run: async (log) => {
      for (const [src, dst] of [['mini-v1', 'mini-current'], ['nested-v1', 'nested-current']] as const) {
        rmSync(join(FIXTURES, dst), { recursive: true, force: true });
        cpSync(join(FIXTURES, src), join(FIXTURES, dst), { recursive: true });
        log(`${dst} ← ${src}`);
      }
    },
  },
  {
    title: 'Start CDN servers',
    run: async (log, serverLog) => {
      await killPort(8082); await killPort(8083);
      const startServe = (dir: string, port: string, label: string) => {
        const p = execa(SERVE, [dir, '-p', port, '--no-clipboard'], { env: { ...process.env, FORCE_COLOR: '1' } });
        p.catch(() => {}); registerBgProcess(p);
        const handle = (chunk: Buffer) => { for (const l of chunk.toString().split('\n')) { const t = l.trim(); if (t) serverLog(label, t); } };
        p.stdout?.on('data', handle); p.stderr?.on('data', handle);
      };
      startServe(join(FIXTURES, 'mini-current'), '8082', 'CDN :8082');
      startServe(join(FIXTURES, 'nested-current'), '8083', 'CDN :8083');
      await waitForManifest(8082, 'mini CDN', log);
      await waitForManifest(8083, 'nested-mini CDN', log);
      if (PLATFORM === 'android') {
        for (const port of ['8082', '8083']) {
          await execa('adb', ['reverse', `tcp:${port}`, `tcp:${port}`]);
          log(`adb reverse tcp:${port}`);
        }
      }
    },
  },
  ...(MODE === 'dev' ? [{
    title: 'Start Metro (dev mode)',
    run: async (log: (m: string) => void, serverLog: (l: string, m: string) => void) => {
      await killPort(8081);
      const p = execaCommand('pnpm exec rnef start --reset-cache --client-logs', { cwd: HOST, env: { ...process.env, FORCE_COLOR: '1' } });
      p.catch(() => {}); registerBgProcess(p);
      const handle = (c: Buffer) => { for (const l of c.toString().split('\n')) { const t = l.trim(); if (t) { log(t); serverLog('Metro', t); } } };
      p.stdout?.on('data', handle); p.stderr?.on('data', handle);
      await waitForManifest(8081, 'Metro', log);
    },
  }] : []),
  {
    title: `Build & install host (${MODE === 'release' ? 'Release' : 'Debug'})`,
    run: async (log) => {
      await checkCDN(log);
      const changed = await hostAppChanged(ROOT, hostPaths(PLATFORM), `mocked:${PLATFORM}`);
      if (changed) {
        log('Host app source changed — cleaning DerivedData to force rebuild');
        cleanHostBuildCaches(HOST, PLATFORM);
      }
      const args = ['exec', 'rnef', `run:${PLATFORM}`];
      if (MODE === 'release') {
        if (PLATFORM === 'android') args.push('--variant', 'Release');
        else args.push('--configuration', 'Release', '--destination', 'simulator');
      }
      const proc = execa('pnpm', args, { cwd: HOST, reject: false, env: { ...process.env, FORCE_COLOR: '1' } });
      const pipe = (s: NodeJS.ReadableStream | null | undefined) => { s?.on('data', (c: Buffer) => { for (const l of c.toString().split('\n')) { const t = l.trim(); if (t) log(t); } }); };
      pipe(proc.stdout); pipe(proc.stderr);
      const res = await proc;
      if (res.exitCode !== 0) throw new Error(`rnef run failed (exit ${res.exitCode})`);
      await checkCDN(log); log('App launched, initializing...'); await sleep(5000);
    },
  },
  { title: 'Phase 1 — v1 baseline', run: async (log) => { await checkCDN(log); await exec(`maestro test ${join(FLOWS, 'ota-phase1.yaml')}`, log, { cwd: ROOT }); } },
  { title: 'Deploy v2 (both remotes)', run: async (log) => { swapCDN('mini-v2', 'mini-current', log); swapCDN('nested-v2', 'nested-current', log); } },
  {
    title: 'Phase 2 — update + crash',
    run: async (log) => {
      if (INTERACTIVE) await pause('Deployed v2 — ready to test update + crash recovery?');
      else { log('Waiting for CDN to settle...'); await sleep(CDN_SETTLE_MS); }
      await checkCDN(log); await exec(`maestro test ${join(FLOWS, 'ota-phase2.yaml')}`, log, { cwd: ROOT });
    },
  },
  { title: 'Rollback nested-mini → v1', run: async (log) => { swapCDN('nested-v1', 'nested-current', log); } },
  {
    title: 'Phase 3 — rollback',
    run: async (log) => {
      if (INTERACTIVE) await pause('Rolled back nested-mini to v1 — ready to test rollback?');
      else { log('Waiting for CDN to settle...'); await sleep(CDN_SETTLE_MS); }
      await checkCDN(log); await exec(`maestro test ${join(FLOWS, 'ota-phase3.yaml')}`, log, { cwd: ROOT });
    },
  },
  { title: 'Deploy nested-mini v3', run: async (log) => { swapCDN('nested-v3', 'nested-current', log); } },
  {
    title: 'Phase 4 — partial update',
    run: async (log) => {
      if (INTERACTIVE) await pause('Deployed nested-mini v3 — ready to test partial update?');
      else { log('Waiting for CDN to settle...'); await sleep(CDN_SETTLE_MS); }
      await checkCDN(log); await exec(`maestro test ${join(FLOWS, 'ota-phase4.yaml')}`, log, { cwd: ROOT });
    },
  },
];

// ── Run ────────────────────────────────────────────────────────────────────

await runTaskPipeline(taskDefs, { title: '⚡ OTA E2E', subtitle: `${PLATFORM} · ${MODE}` });

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { render, Box, Text, useInput, useApp, useStdout } from 'ink';
import { execaCommand, execa, type ResultPromise } from 'execa';
import { existsSync, cpSync, rmSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
let CI_MODE = process.env.CI === '1' || process.env.CI === 'true';

for (const arg of process.argv.slice(2)) {
  if (arg === '--interactive' || arg === '-i') INTERACTIVE = true;
  else if (arg === '--dev') MODE = 'dev';
  else if (arg === '--release') MODE = 'release';
  else if (arg === 'ios' || arg === 'android') PLATFORM = arg;
}

// Auto-detect: no TTY = CI mode
if (!process.stdout.isTTY) CI_MODE = true;

if (!PLATFORM) {
  console.error('Usage: pnpm e2e <ios|android> [--dev] [--interactive]');
  process.exit(1);
}

// ── Types ──────────────────────────────────────────────────────────────────

type Status = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

interface TaskDef {
  title: string;
  skip?: () => string | false;
  run: (log: (msg: string) => void, serverLog: (label: string, msg: string) => void) => Promise<void>;
}

interface TaskState {
  title: string;
  status: Status;
  logs: string[];
  elapsed: number;
}

interface ServerState {
  label: string;
  logs: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

const bgProcesses: ResultPromise[] = [];
let activeProc: ResultPromise | null = null;
let exitFailed = false;
let forceExitTimer: ReturnType<typeof setTimeout> | null = null;
let shuttingDown = false;

function restoreTerminal(): void {
  // Disable mouse tracking
  process.stdout.write('\x1b[?1006l\x1b[?1000l');
  // Restore cursor visibility
  process.stdout.write('\x1b[?25h');
  // Restore stdin to cooked mode
  try { process.stdin.setRawMode?.(false); } catch {}
}

function killAll(signal: NodeJS.Signals): void {
  if (activeProc) { try { activeProc.kill(signal); } catch {} }
  for (const p of bgProcesses) { try { p.kill(signal); } catch {} }
}

function cleanup(): void {
  if (shuttingDown) {
    // Second call — force kill
    restoreTerminal();
    killAll('SIGKILL');
    process.exit(130);
  }
  shuttingDown = true;
  killAll('SIGTERM');
  forceExitTimer = setTimeout(() => {
    restoreTerminal();
    killAll('SIGKILL');
    process.exit(130);
  }, 3000);
  forceExitTimer.unref();
}

process.on('exit', restoreTerminal);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function killPort(port: number): Promise<void> {
  try {
    const { stdout } = await execa('lsof', ['-ti', `:${port}`]);
    if (stdout.trim()) {
      await execa('kill', stdout.trim().split('\n'));
      await sleep(1000);
    }
  } catch { /* no process on port */ }
}

async function waitForManifest(port: number, label: string, log: (m: string) => void, timeoutMs = 60_000): Promise<void> {
  const url = `http://localhost:${port}/mf-manifest.json`;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) { log(`${label} ready on :${port}`); return; }
    } catch { /* not ready */ }
    await sleep(1000);
  }
  throw new Error(`Timeout: ${label} on :${port} not serving manifest`);
}

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

async function exec(cmd: string, log: (m: string) => void, opts: { cwd?: string } = {}): Promise<void> {
  const proc = execaCommand(cmd, {
    cwd: opts.cwd ?? ROOT,
    reject: false,
    env: { ...process.env, FORCE_COLOR: CI_MODE ? '0' : '1' },
  });
  activeProc = proc;
  const pipe = (stream: NodeJS.ReadableStream | null | undefined) => {
    stream?.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n')) {
        const t = line.trim();
        if (t) log(t);
      }
    });
  };
  pipe(proc.stdout);
  pipe(proc.stderr);
  const result = await proc;
  activeProc = null;
  if (result.exitCode !== 0) throw new Error(`Command failed (exit ${result.exitCode}): ${cmd}`);
}

function fixturesExist(): boolean {
  return ['mini-v1', 'mini-v2', 'nested-v1', 'nested-v2', 'nested-v3'].every(
    (n) => existsSync(join(FIXTURES, n)),
  );
}

async function nativeCacheChanged(): Promise<boolean> {
  const stateFile = join(ROOT, '.native-cache.state');
  const submodule = join(ROOT, 'vendor/zephyr-packages');
  let currentHash = 'unknown';
  try {
    const { stdout: head } = await execa('git', ['-C', submodule, 'rev-parse', 'HEAD']);
    const { stdout: diff } = await execa('git', ['-C', submodule, 'diff', 'HEAD']);
    currentHash = createHash('sha256').update(head + diff).digest('hex');
  } catch { return true; }
  try {
    if (existsSync(stateFile) && readFileSync(stateFile, 'utf8').trim() === currentHash) return false;
  } catch { /* rebuild */ }
  writeFileSync(stateFile, currentHash + '\n');
  return true;
}

async function hostAppChanged(): Promise<boolean> {
  const stateFile = join(ROOT, '.native-build.state');
  let currentHash = 'unknown';
  try {
    // Track only source that affects the release build — exclude e2e test files
    const nativeDir = PLATFORM === 'android' ? 'apps/host/android/' : 'apps/host/ios/';
    const paths = ['apps/host/src/', nativeDir, 'apps/host/index.js', 'apps/host/metro.config.js', 'apps/host/runtime-plugin.ts', 'apps/host/package.json'];
    const { stdout: lsFiles } = await execa('git', ['ls-files', '-s', ...paths], { cwd: ROOT });
    const { stdout: diff } = await execa('git', ['diff', 'HEAD', '--', ...paths], { cwd: ROOT });
    currentHash = createHash('sha256').update(lsFiles + diff).digest('hex');
  } catch { return true; }
  try {
    if (existsSync(stateFile) && readFileSync(stateFile, 'utf8').trim() === currentHash) return false;
  } catch { /* rebuild */ }
  writeFileSync(stateFile, currentHash + '\n');
  return true;
}

function cleanBuildCaches(): void {
  // rnef's own build cache — the primary cache layer that can skip the native build entirely
  const rnefCache = join(HOST, '.rnef/cache');
  if (existsSync(rnefCache)) rmSync(rnefCache, { recursive: true, force: true });

  if (PLATFORM === 'android') {
    // Gradle build output
    const androidBuild = join(HOST, 'android/app/build');
    if (existsSync(androidBuild)) rmSync(androidBuild, { recursive: true, force: true });
  } else {
    // Xcode DerivedData
    const dd = join(process.env.HOME ?? '', 'Library/Developer/Xcode/DerivedData');
    if (existsSync(dd)) {
      for (const dir of readdirSync(dd)) {
        if (dir.startsWith('MFExampleHost-')) {
          rmSync(join(dd, dir), { recursive: true, force: true });
        }
      }
    }
  }
}

function waitForEnter(): Promise<void> {
  return new Promise((res) => {
    process.stdin.setRawMode?.(false);
    process.stdin.once('data', () => { process.stdin.setRawMode?.(true); res(); });
  });
}

// ── Task definitions ───────────────────────────────────────────────────────

const taskDefs: TaskDef[] = [
  {
    title: 'Rebuild native cache package',
    run: async (log) => {
      const changed = await nativeCacheChanged();
      if (!changed) { log('Vendor source unchanged — skipping rebuild'); return; }
      log('Vendor source changed — rebuilding...');
      await exec('bash scripts/build-native-cache.sh', log);
      await exec('pnpm install', log);
      await exec('pnpm pods', log, { cwd: HOST });
      await exec('bash scripts/check-native-cache.sh', log);
      cleanBuildCaches();
      log('Native cache package ready');
    },
  },
  {
    title: 'Build E2E fixtures (5 versions)',
    skip: () => fixturesExist() && 'Fixtures cached',
    run: async (log) => { await exec(`bash scripts/build-e2e-versions.sh ${PLATFORM}`, log); },
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
        p.catch(() => {}); bgProcesses.push(p);
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
      p.catch(() => {}); bgProcesses.push(p);
      const handle = (c: Buffer) => { for (const l of c.toString().split('\n')) { const t = l.trim(); if (t) { log(t); serverLog('Metro', t); } } };
      p.stdout?.on('data', handle); p.stderr?.on('data', handle);
      await waitForManifest(8081, 'Metro', log);
    },
  }] : []),
  {
    title: `Build & install host (${MODE === 'release' ? 'Release' : 'Debug'})`,
    run: async (log) => {
      await checkCDN(log);
      const changed = await hostAppChanged();
      if (changed) {
        log('Host app source changed — cleaning DerivedData to force rebuild');
        cleanBuildCaches();
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
  { title: 'Phase 1 — v1 baseline', run: async (log) => { await checkCDN(log); await exec(`maestro test ${join(FLOWS, 'ota-phase1.yaml')}`, log); } },
  { title: 'Deploy v2 (both remotes)', run: async (log) => { swapCDN('mini-v2', 'mini-current', log); swapCDN('nested-v2', 'nested-current', log); } },
  {
    title: 'Phase 2 — update + crash',
    run: async (log) => {
      if (INTERACTIVE) { log('⏸ Press Enter...'); await waitForEnter(); }
      else { log('Waiting for CDN to settle...'); await sleep(CDN_SETTLE_MS); }
      await checkCDN(log); await exec(`maestro test ${join(FLOWS, 'ota-phase2.yaml')}`, log);
    },
  },
  { title: 'Rollback nested-mini → v1', run: async (log) => { swapCDN('nested-v1', 'nested-current', log); } },
  {
    title: 'Phase 3 — rollback',
    run: async (log) => {
      if (INTERACTIVE) { log('⏸ Press Enter...'); await waitForEnter(); }
      else { log('Waiting for CDN to settle...'); await sleep(CDN_SETTLE_MS); }
      await checkCDN(log); await exec(`maestro test ${join(FLOWS, 'ota-phase3.yaml')}`, log);
    },
  },
  { title: 'Deploy nested-mini v3', run: async (log) => { swapCDN('nested-v3', 'nested-current', log); } },
  {
    title: 'Phase 4 — partial update',
    run: async (log) => {
      if (INTERACTIVE) { log('⏸ Press Enter...'); await waitForEnter(); }
      else { log('Waiting for CDN to settle...'); await sleep(CDN_SETTLE_MS); }
      await checkCDN(log); await exec(`maestro test ${join(FLOWS, 'ota-phase4.yaml')}`, log);
    },
  },
];

// ══════════════════════════════════════════════════════════════════════════
// CI Runner — plain sequential log output, no TUI
// ══════════════════════════════════════════════════════════════════════════

async function runCI(): Promise<void> {
  const log = (prefix: string) => (msg: string) => console.log(`[${prefix}] ${msg}`);
  const serverLog = (label: string, msg: string) => console.log(`[${label}] ${msg}`);

  for (const def of taskDefs) {
    const skipMsg = def.skip?.();
    if (skipMsg) { console.log(`⏭ ${def.title} — ${skipMsg}`); continue; }

    console.log(`\n▶ ${def.title}`);
    const t0 = Date.now();
    try {
      await def.run(log(def.title), serverLog);
      const sec = Math.floor((Date.now() - t0) / 1000);
      console.log(`✓ ${def.title} (${sec}s)`);
    } catch (err) {
      console.error(`✗ ${def.title} — ${err instanceof Error ? err.message : String(err)}`);
      exitFailed = true;
      break;
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════
// TUI Runner — ink dashboard
// ══════════════════════════════════════════════════════════════════════════

const ICON: Record<Status, string> = { pending: '○', running: '◉', done: '✓', failed: '✗', skipped: '‣' };
const CLR: Record<Status, string> = { pending: '#4b5563', running: '#8b5cf6', done: '#22c55e', failed: '#ef4444', skipped: '#6b7280' };

function elapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60}s`;
}

// ── Mouse scroll ───────────────────────────────────────────────────────

function useMouseScroll(onScroll: (direction: 'up' | 'down', row: number) => void) {
  const callbackRef = useRef(onScroll);
  callbackRef.current = onScroll;
  useEffect(() => {
    process.stdout.write('\x1b[?1000h\x1b[?1006h');
    let lastScrollTime = 0;
    const handler = (data: Buffer) => {
      const now = Date.now();
      if (now - lastScrollTime < 50) return;
      const str = data.toString();
      const re = /\x1b\[<(\d+);\d+;(\d+)[Mm]/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(str)) !== null) {
        const button = parseInt(match[1]!, 10);
        const row = parseInt(match[2]!, 10);
        if (button === 64 || button === 65) {
          lastScrollTime = now;
          callbackRef.current(button === 64 ? 'up' : 'down', row);
          break;
        }
      }
    };
    process.stdin.on('data', handler);
    return () => { process.stdin.off('data', handler); process.stdout.write('\x1b[?1006l\x1b[?1000l'); };
  }, []);
}

// ── Components ─────────────────────────────────────────────────────────

function HRule({ width, color }: { width: number; color?: string }) {
  return <Text color={color ?? '#1f2937'}>{'─'.repeat(width)}</Text>;
}

function VLine({ height }: { height: number }) {
  return <Text color="#1f2937">{Array.from({ length: height }, () => '│').join('\n')}</Text>;
}

function TaskListPane({ tasks, selected, notification, width, isShuttingDown }: { tasks: TaskState[]; selected: number; notification: string; width: number; isShuttingDown: boolean }) {
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Text bold color="#a78bfa"> ⚡ OTA E2E <Text color="#6b7280"> {PLATFORM} · {MODE}</Text></Text>
      <Box><HRule width={width - 2} /></Box>
      <Box flexDirection="column" flexGrow={1}>
        {tasks.map((t, i) => {
          const sel = i === selected;
          const tc = sel ? '#ffffff' : t.status === 'pending' ? '#6b7280' : '#a1a1aa';
          return (
            <Box key={`t${i}`}>
              <Text color={CLR[t.status]}>{ICON[t.status]} </Text>
              <Text color={tc} bold={sel}>{t.title}</Text>
              {t.status === 'done' && <Text color="#374151"> {elapsed(t.elapsed)}</Text>}
              {t.status === 'failed' && <Text color="#ef4444"> ✗</Text>}
            </Box>
          );
        })}
        <Box flexGrow={1} />
        {notification ? <Text color="#22c55e">{notification}</Text> : null}
        {isShuttingDown
          ? <Text color="#ef4444">Shutting down… press again to force</Text>
          : <Box flexDirection="column">
              <Text color="#374151">↑↓ cycle tasks · ⇥ cycle servers · q quit</Text>
              <Text color="#374151">[ copy task logs · ] copy server logs</Text>
            </Box>}
      </Box>
    </Box>
  );
}

function LogPane({ title, logs, height, scrollOffset, width }: {
  title: string; logs: string[]; height: number; scrollOffset: number; width: number;
}) {
  const vis = Math.max(1, height - 3);
  const end = Math.max(0, logs.length - scrollOffset);
  const start = Math.max(0, end - vis);
  const lines = logs.slice(start, start + vis);
  const atBottom = scrollOffset === 0;
  const atTop = start === 0;
  const scrollIndicator = logs.length > vis ? (atBottom ? '' : atTop ? ' ↑ top' : ` ↑${scrollOffset}`) : '';
  while (lines.length < vis) lines.push('');
  const titleText = `${title}  ${logs.length}${scrollIndicator}`;
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Text bold color="#e2e8f0"> {titleText}</Text>
      <Box><HRule width={width - 2} /></Box>
      <Box flexDirection="column">
        {logs.length === 0
          ? <Text dimColor>No output yet</Text>
          : lines.map((l: string, i: number) => (
              <Box key={`l${start + i}`}><Text wrap="truncate">{l || ' '}</Text></Box>
            ))}
      </Box>
    </Box>
  );
}

function ServerListPane({ servers, selected, width }: { servers: ServerState[]; selected: number; width: number }) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="#e2e8f0"> Servers</Text>
      <Box><HRule width={width - 2} /></Box>
      <Box flexDirection="column">
        {servers.length === 0
          ? <Text color="#374151">Waiting...</Text>
          : servers.map((s, i) => {
              const sel = i === selected;
              return (
                <Box key={`s${i}`}>
                  <Text color="#22c55e">● </Text>
                  <Text color={sel ? '#ffffff' : '#a1a1aa'} bold={sel}>{s.label}</Text>
                  <Text color="#374151"> {s.logs.length}</Text>
                </Box>
              );
            })}
      </Box>
    </Box>
  );
}

// ── App ────────────────────────────────────────────────────────────────

function App({ taskDefs: defs }: { taskDefs: TaskDef[] }) {
  const [tasks, setTasks] = useState<TaskState[]>(
    defs.map((d) => ({ title: d.title, status: 'pending' as Status, logs: [], elapsed: 0 })),
  );
  const [servers, setServers] = useState<ServerState[]>([]);
  const [taskIdx, setTaskIdx] = useState(0);
  const [serverIdx, setServerIdx] = useState(0);
  const [taskScroll, setTaskScroll] = useState(0);
  const [serverScroll, setServerScroll] = useState(0);
  const [notification, setNotification] = useState('');
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const { exit } = useApp();
  const { stdout } = useStdout();
  const height = stdout?.rows ?? 30;
  const runningRef = useRef(true);

  const taskLogBuf = useRef<Map<number, string[]>>(new Map());
  const serverLogBuf = useRef<Map<string, string[]>>(new Map());

  const addLog = useCallback((idx: number, msg: string) => {
    const buf = taskLogBuf.current;
    if (!buf.has(idx)) buf.set(idx, []);
    buf.get(idx)!.push(msg);
  }, []);

  const addServerLog = useCallback((label: string, msg: string) => {
    const buf = serverLogBuf.current;
    if (!buf.has(label)) buf.set(label, []);
    buf.get(label)!.push(msg);
  }, []);

  useEffect(() => {
    const flush = setInterval(() => {
      const tb = taskLogBuf.current;
      if (tb.size > 0) {
        const snap = new Map(tb); tb.clear();
        setTasks((prev: TaskState[]) => prev.map((t: TaskState, i: number) => {
          const lines = snap.get(i);
          return lines ? { ...t, logs: [...t.logs, ...lines] } : t;
        }));
      }
      const sb = serverLogBuf.current;
      if (sb.size > 0) {
        const snap = new Map(sb); sb.clear();
        setServers((prev: ServerState[]) => {
          const next = [...prev];
          for (const [label, lines] of snap) {
            const idx = next.findIndex((s: ServerState) => s.label === label);
            if (idx >= 0) next[idx] = { ...next[idx]!, logs: [...next[idx]!.logs, ...lines] };
            else next.push({ label, logs: lines });
          }
          return next;
        });
      }
    }, 150);
    return () => clearInterval(flush);
  }, []);

  const setStatus = useCallback((idx: number, status: Status, ms = 0) => {
    setTasks((prev: TaskState[]) => prev.map((t: TaskState, i: number) => i === idx ? { ...t, status, elapsed: ms } : t));
  }, []);

  const serverH = Math.max(6, Math.floor(height * 0.25));
  const taskH = height - serverH - 1;

  useMouseScroll(useCallback((direction: 'up' | 'down', row: number) => {
    const setter = row <= taskH ? setTaskScroll : setServerScroll;
    if (direction === 'up') setter((s: number) => s + 3);
    else setter((s: number) => Math.max(0, s - 3));
  }, [taskH]));

  useInput((input, key) => {
    if (key.upArrow && !key.shift) { setTaskIdx((i) => Math.max(0, i - 1)); setTaskScroll(0); }
    if (key.downArrow && !key.shift) { setTaskIdx((i) => Math.min(defs.length - 1, i + 1)); setTaskScroll(0); }
    if (key.tab) { setServers((s: ServerState[]) => { setServerIdx((i: number) => s.length > 0 ? (i + 1) % s.length : 0); return s; }); setServerScroll(0); }
    if (input === '[') {
      const task = tasks[taskIdx];
      if (task && task.logs.length > 0) {
        execa('pbcopy', { input: task.logs.join('\n') }).catch(() => {});
        setNotification(`✓ Copied ${task.logs.length} task lines`);
        setTimeout(() => setNotification(''), 3000);
      }
    }
    if (input === ']') {
      const server = servers[serverIdx];
      if (server && server.logs.length > 0) {
        execa('pbcopy', { input: server.logs.join('\n') }).catch(() => {});
        setNotification(`✓ Copied ${server.logs.length} server lines`);
        setTimeout(() => setNotification(''), 3000);
      }
    }
    if (input === 'q' || (key.ctrl && input === 'c')) {
      if (shuttingDown) { cleanup(); process.exit(130); }
      runningRef.current = false;
      setIsShuttingDown(true);
      cleanup();
    }
  });

  useEffect(() => {
    (async () => {
      for (let i = 0; i < defs.length; i++) {
        if (!runningRef.current) break;
        const def = defs[i]!;
        setTaskIdx(i);
        const skipMsg = def.skip?.();
        if (skipMsg) { addLog(i, `Skipped: ${skipMsg}`); setStatus(i, 'skipped'); continue; }
        setStatus(i, 'running');
        const t0 = Date.now();
        try {
          await def.run((msg) => addLog(i, msg), addServerLog);
          setStatus(i, 'done', Date.now() - t0);
        } catch (err) {
          addLog(i, `ERROR: ${err instanceof Error ? err.message : String(err)}`);
          setStatus(i, 'failed', Date.now() - t0);
          exitFailed = true;
          break;
        }
      }
      // Let the final render flush before unmounting
      setTimeout(() => exit(), 50);
    })();
  }, []);

  const cols = stdout?.columns ?? 80;
  const listW = 46;
  const logW = cols - listW - 1; // 1 for the vertical separator

  return (
    <Box flexDirection="column" height={height}>
      <Box><Text color="#1f2937">{'─'.repeat(cols)}</Text></Box>
      <Box height={taskH - 1}>
        <Box width={listW} flexShrink={0} flexDirection="column">
          <TaskListPane tasks={tasks} selected={taskIdx} notification={notification} width={listW} isShuttingDown={isShuttingDown} />
        </Box>
        <Box width={1} flexShrink={0} flexDirection="column"><VLine height={taskH} /></Box>
        <LogPane title={`${ICON[tasks[taskIdx]!.status]} ${tasks[taskIdx]!.title}`} logs={tasks[taskIdx]!.logs} height={taskH} scrollOffset={taskScroll} width={logW} />
      </Box>
      <Box><Text color="#1f2937">{'─'.repeat(cols)}</Text></Box>
      <Box height={serverH}>
        <Box width={listW} flexShrink={0} flexDirection="column">
          <ServerListPane servers={servers} selected={serverIdx} width={listW} />
        </Box>
        <Box width={1} flexShrink={0} flexDirection="column"><VLine height={serverH} /></Box>
        <LogPane title={servers[serverIdx]?.label ?? 'No servers'} logs={servers[serverIdx]?.logs ?? []} height={serverH} scrollOffset={serverScroll} width={logW} />
      </Box>
    </Box>
  );
}

async function runTUI(): Promise<void> {
  const { waitUntilExit } = render(<App taskDefs={taskDefs} />, { exitOnCtrlC: false });
  await waitUntilExit();
}

// ══════════════════════════════════════════════════════════════════════════
// Main
// ══════════════════════════════════════════════════════════════════════════

process.on('SIGINT', () => {
  if (CI_MODE) process.stderr.write('Shutting down… press again to force\r');
  cleanup();
  setTimeout(() => process.exit(130), 3000).unref();
});

if (CI_MODE) {
  await runCI();
} else {
  await runTUI();
}

if (forceExitTimer) clearTimeout(forceExitTimer);
cleanup();

if (exitFailed) {
  console.error('\n  E2E OTA test failed.\n');
  process.exit(1);
} else {
  console.log('\n  All phases passed.\n');
}

import * as React from 'react';
const { useState, useEffect, useRef, useCallback } = React;
import { render, Box, Text, useInput, useApp, useStdout } from 'ink';
import { execaCommand, execa, type ResultPromise } from 'execa';
import { existsSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

// ── Types ──────────────────────────────────────────────────────────────────

export type Status = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

// Styled log lines let `pause()` highlight specific tokens (version numbers,
// environment names) without coloring the whole message. `pause()` parses
// `**…**` markers in the caller's message and emits them as `highlight`
// segments; callers don't need to construct segments by hand.
//
// Plain strings keep the existing call sites (exec, publishRemote, etc.)
// working unchanged — they just render as normal lines.
export type Accent = 'label' | 'highlight' | 'prompt';
export interface InlineSegment {
  text: string;
  accent?: Accent;
}
export interface StyledLogEntry {
  segments: InlineSegment[];
}
export type LogMessage = string | StyledLogEntry;

function entryToText(entry: LogMessage): string {
  if (typeof entry === 'string') return entry;
  return entry.segments.map((s) => s.text).join('');
}

// Split a string on `**token**` markers, returning segments where the marked
// tokens get the given accent and the rest stays plain.
function parseAccents(text: string, accent: Accent = 'highlight'): InlineSegment[] {
  const parts = text.split(/\*\*([^*]+)\*\*/);
  const out: InlineSegment[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    if (i % 2 === 1) out.push({ text: part, accent });
    else out.push({ text: part });
  }
  return out;
}

export interface TaskDef {
  title: string;
  skip?: () => string | false;
  run: (log: (msg: LogMessage) => void, serverLog: (label: string, msg: string) => void) => Promise<void>;
}

interface TaskState {
  title: string;
  status: Status;
  logs: LogMessage[];
  elapsed: number;
}

interface ServerState {
  label: string;
  logs: string[];
}

// ── Shared lifecycle state ─────────────────────────────────────────────────

const bgProcesses: ResultPromise[] = [];
let activeProc: ResultPromise | null = null;
let exitFailed = false;
let forceExitTimer: ReturnType<typeof setTimeout> | null = null;
let shuttingDown = false;

export function registerBgProcess(p: ResultPromise): void {
  bgProcesses.push(p);
}

function restoreTerminal(): void {
  process.stdout.write('\x1b[?1006l\x1b[?1000l');
  process.stdout.write('\x1b[?25h');
  try { process.stdin.setRawMode?.(false); } catch {}
}

function killAll(signal: NodeJS.Signals): void {
  if (activeProc) { try { activeProc.kill(signal); } catch {} }
  for (const p of bgProcesses) { try { p.kill(signal); } catch {} }
}

export function cleanup(): void {
  if (shuttingDown) {
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

// ── Pause coordination ─────────────────────────────────────────────────────
// Both runners (CI and TUI) serve pause requests via `pause(message, log)`.
// The instruction goes into the current task's log pane; CI also reads raw
// stdin for the continuation key. TUI relies on App's useInput handler.

let pauseResolver: (() => void) | null = null;
let currentMode: 'ci' | 'tui' = 'ci';

export function isPaused(): boolean {
  return pauseResolver !== null;
}

export function resolvePause(): void {
  if (!pauseResolver) return;
  const r = pauseResolver;
  pauseResolver = null;
  r();
}

export interface PauseOptions {
  // Banner label shown above the message. Defaults to `⏸ PAUSE`.
  label?: string;
  // Text after the `▸` prompt glyph. Defaults to continuation wording.
  prompt?: string;
}

export async function pause(
  message: string,
  log: (msg: LogMessage) => void,
  options: PauseOptions = {},
): Promise<void> {
  const label = options.label ?? '⏸ PAUSE';
  const promptText = options.prompt ?? 'Press SPACE (or ENTER) to continue';

  await new Promise<void>((resolve) => {
    pauseResolver = resolve;

    log('');
    log({ segments: [{ text: label, accent: 'label' }] });
    log('');
    for (const line of message.split('\n')) {
      log({ segments: parseAccents(line) });
    }
    log('');
    log({
      segments: [
        { text: '▸ ', accent: 'prompt' },
        { text: promptText },
      ],
    });
    log('');

    if (currentMode === 'ci') {
      const onData = () => {
        process.stdin.off('data', onData);
        try { process.stdin.setRawMode?.(true); } catch {}
        resolvePause();
      };
      try { process.stdin.setRawMode?.(false); } catch {}
      process.stdin.once('data', onData);
    }
    // TUI mode: App's useInput handler calls resolvePause() on SPACE/ENTER.
  });
  // No confirmation line — the next task's output is the signal that we moved on.
}

// ── Primitive helpers ──────────────────────────────────────────────────────

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function killPort(port: number): Promise<void> {
  try {
    const { stdout } = await execa('lsof', ['-ti', `:${port}`]);
    if (stdout.trim()) {
      await execa('kill', stdout.trim().split('\n'));
      await sleep(1000);
    }
  } catch { /* no process on port */ }
}

export async function waitForManifest(
  port: number,
  label: string,
  log: (m: string) => void,
  timeoutMs = 60_000,
): Promise<void> {
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

type ExecOpts = { cwd?: string; env?: Record<string, string | undefined> };

async function runProc(
  proc: ResultPromise,
  label: string,
  log: (m: string) => void,
): Promise<void> {
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
  if (result.exitCode !== 0) throw new Error(`Command failed (exit ${result.exitCode}): ${label}`);
}

function execEnv(opts: ExecOpts): Record<string, string | undefined> {
  return { ...process.env, FORCE_COLOR: currentMode === 'ci' ? '0' : '1', ...opts.env };
}

// Shell-style command string — convenient but does NOT perform shell-level
// quote parsing. Paths with spaces must use `execArgs` instead.
export async function exec(
  cmd: string,
  log: (m: string) => void,
  opts: ExecOpts = {},
): Promise<void> {
  return runProc(
    execaCommand(cmd, { cwd: opts.cwd ?? process.cwd(), reject: false, env: execEnv(opts) }),
    cmd,
    log,
  );
}

// argv-style invocation — use for commands that accept filesystem paths so
// quoting is handled by execa instead of by string concatenation. Example:
// `execArgs('xcrun', ['simctl', 'install', 'booted', appPath], log)`.
export async function execArgs(
  bin: string,
  args: string[],
  log: (m: string) => void,
  opts: ExecOpts = {},
): Promise<void> {
  return runProc(
    execa(bin, args, { cwd: opts.cwd ?? process.cwd(), reject: false, env: execEnv(opts) }),
    `${bin} ${args.join(' ')}`,
    log,
  );
}

// Source paths that influence the host app's native binary — hash these to
// decide whether to clean DerivedData/gradle caches and force a rebuild.
export function hostPaths(platform: string): string[] {
  const nativeDir = platform === 'android' ? 'apps/host/android/' : 'apps/host/ios/';
  return [
    'apps/host/src/',
    nativeDir,
    'apps/host/index.js',
    'apps/host/metro.config.js',
    'apps/host/runtime-plugin.ts',
    'apps/host/package.json',
  ];
}

// Drop RNEF's build cache plus the platform-specific native build output, so
// the next `rnef run:<platform>` does a full rebuild (picks up fresh JS).
export function cleanHostBuildCaches(hostDir: string, platform: string): void {
  const rnefCache = join(hostDir, '.rnef/cache');
  if (existsSync(rnefCache)) rmSync(rnefCache, { recursive: true, force: true });

  if (platform === 'android') {
    const androidBuild = join(hostDir, 'android/app/build');
    if (existsSync(androidBuild)) rmSync(androidBuild, { recursive: true, force: true });
  } else {
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

// Host app source SHA tracker — single `.native-build.state` file shared
// across mocked and Zephyr flows. `modeKey` (e.g. `'mocked:ios'` vs
// `'zephyr:ios'`) is hashed in so alternating flows invalidate each other.
export async function hostAppChanged(
  rootDir: string,
  paths: string[],
  modeKey: string,
): Promise<boolean> {
  const stateFile = join(rootDir, '.native-build.state');
  let currentHash = 'unknown';
  try {
    const { stdout: lsFiles } = await execa('git', ['ls-files', '-s', ...paths], { cwd: rootDir });
    const { stdout: diff } = await execa('git', ['diff', 'HEAD', '--', ...paths], { cwd: rootDir });
    currentHash = createHash('sha256').update(modeKey + '\0' + lsFiles + diff).digest('hex');
  } catch { return true; }
  try {
    if (existsSync(stateFile) && readFileSync(stateFile, 'utf8').trim() === currentHash) return false;
  } catch { /* rebuild */ }
  writeFileSync(stateFile, currentHash + '\n');
  return true;
}

// ── CI runner ──────────────────────────────────────────────────────────────

// ANSI escapes match the TUI accent colors so highlighted tokens stay
// distinctive in plain-text CI output.
const ANSI_RESET = '\x1b[0m';
const ANSI_ACCENT: Record<Accent, string> = {
  label: '\x1b[1;33m',     // bold yellow  (⏸ PAUSE)
  highlight: '\x1b[1;36m', // bold cyan    (inline tokens)
  prompt: '\x1b[1;32m',    // bold green   (▸ Press SPACE)
};

function ciRender(msg: LogMessage): string {
  if (typeof msg === 'string') return msg;
  return msg.segments
    .map((s) => (s.accent ? `${ANSI_ACCENT[s.accent]}${s.text}${ANSI_RESET}` : s.text))
    .join('');
}

async function runCI(taskDefs: TaskDef[]): Promise<void> {
  const log = (prefix: string) => (msg: LogMessage) =>
    console.log(`[${prefix}] ${ciRender(msg)}`);
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

// ── TUI ────────────────────────────────────────────────────────────────────

const ICON: Record<Status, string> = { pending: '○', running: '◉', done: '✓', failed: '✗', skipped: '‣' };
const CLR: Record<Status, string> = { pending: '#4b5563', running: '#8b5cf6', done: '#22c55e', failed: '#ef4444', skipped: '#6b7280' };

function elapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60}s`;
}

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

function HRule({ width, color }: { width: number; color?: string }) {
  return <Text color={color ?? '#1f2937'}>{'─'.repeat(width)}</Text>;
}

function VLine({ height }: { height: number }) {
  return <Text color="#1f2937">{Array.from({ length: height }, () => '│').join('\n')}</Text>;
}

function TaskListPane({ tasks, selected, notification, width, isShuttingDown, title, subtitle }: {
  tasks: TaskState[];
  selected: number;
  notification: string;
  width: number;
  isShuttingDown: boolean;
  title: string;
  subtitle?: string;
}) {
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Text bold color="#a78bfa"> {title} {subtitle ? <Text color="#6b7280"> {subtitle}</Text> : null}</Text>
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

// Accent palette for the TUI — no backgrounds, just foreground color + bold
// on the small parts that should draw the eye (⏸ PAUSE label, inline tokens,
// ▸ Press SPACE glyph). The bulk of each message renders in the default
// terminal color so it stays comfortable to read.
const ACCENT_COLOR: Record<Accent, string> = {
  label: '#fbbf24',     // yellow-400 — PAUSE label
  highlight: '#22d3ee', // cyan-400   — version numbers, env names
  prompt: '#4ade80',    // green-400  — action glyphs
};

function LogLine({ entry }: { entry: LogMessage | '' }) {
  if (typeof entry === 'string') {
    return <Text wrap="truncate">{entry || ' '}</Text>;
  }
  // Styled lines wrap instead of truncate so pause instructions stay fully
  // readable even when wider than the pane.
  return (
    <Text wrap="wrap">
      {entry.segments.map((s, i) =>
        s.accent
          ? <Text key={i} color={ACCENT_COLOR[s.accent]} bold>{s.text}</Text>
          : <Text key={i}>{s.text}</Text>,
      )}
    </Text>
  );
}

function LogPane({ title, logs, height, scrollOffset, width }: {
  title: string; logs: LogMessage[]; height: number; scrollOffset: number; width: number;
}) {
  const vis = Math.max(1, height - 3);
  const end = Math.max(0, logs.length - scrollOffset);
  const start = Math.max(0, end - vis);
  const lines: (LogMessage | '')[] = logs.slice(start, start + vis);
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
          : lines.map((l, i) => (
              <Box key={`l${start + i}`}><LogLine entry={l} /></Box>
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

function App({ taskDefs: defs, title, subtitle }: { taskDefs: TaskDef[]; title: string; subtitle?: string }) {
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

  const taskLogBuf = useRef<Map<number, LogMessage[]>>(new Map());
  const serverLogBuf = useRef<Map<string, string[]>>(new Map());

  const addLog = useCallback((idx: number, msg: LogMessage) => {
    const buf = taskLogBuf.current;
    if (!buf.has(idx)) buf.set(idx, []);
    buf.get(idx)!.push(msg);
  }, []);

  const addServerLog = useCallback((label: string, msg: string) => {
    const buf = serverLogBuf.current;
    if (!buf.has(label)) buf.set(label, []);
    buf.get(label)!.push(msg);
  }, []);

  // Drain buffered logs into task/server state. Extracted so we can force a
  // flush on exit — without it, a task that fails faster than the 150ms poll
  // (e.g. a synchronous preflight throw) exits before its log ever renders,
  // leaving the log pane empty for the failed task.
  const flushLogs = useCallback(() => {
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
  }, []);

  useEffect(() => {
    const interval = setInterval(flushLogs, 150);
    return () => clearInterval(interval);
  }, [flushLogs]);

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
    if ((input === ' ' || key.return) && isPaused()) { resolvePause(); return; }
    if (key.upArrow && !key.shift) { setTaskIdx((i) => Math.max(0, i - 1)); setTaskScroll(0); }
    if (key.downArrow && !key.shift) { setTaskIdx((i) => Math.min(defs.length - 1, i + 1)); setTaskScroll(0); }
    if (key.tab) { setServers((s: ServerState[]) => { setServerIdx((i: number) => s.length > 0 ? (i + 1) % s.length : 0); return s; }); setServerScroll(0); }
    if (input === '[') {
      const task = tasks[taskIdx];
      if (task && task.logs.length > 0) {
        execa('pbcopy', { input: task.logs.map(entryToText).join('\n') }).catch(() => {});
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
      // Drain any pending logs (especially the ERROR line from a fast-failing
      // task) before React tears down, then give Ink a beat to repaint.
      flushLogs();
      setTimeout(() => exit(), 250);
    })();
  }, []);

  const cols = stdout?.columns ?? 80;
  const listW = 46;
  const logW = cols - listW - 1;

  return (
    <Box flexDirection="column" height={height}>
      <Box><Text color="#1f2937">{'─'.repeat(cols)}</Text></Box>
      <Box height={taskH - 1}>
        <Box width={listW} flexShrink={0} flexDirection="column">
          <TaskListPane
            tasks={tasks}
            selected={taskIdx}
            notification={notification}
            width={listW}
            isShuttingDown={isShuttingDown}
            title={title}
            subtitle={subtitle}
          />
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

async function runTUI(taskDefs: TaskDef[], title: string, subtitle?: string): Promise<void> {
  const { waitUntilExit } = render(
    <App taskDefs={taskDefs} title={title} subtitle={subtitle} />,
    { exitOnCtrlC: false },
  );
  await waitUntilExit();
}

// ── Public entrypoint ──────────────────────────────────────────────────────

export interface RunPipelineOptions {
  title: string;
  subtitle?: string;
  ciMode?: boolean;
}

export async function runTaskPipeline(
  taskDefs: TaskDef[],
  options: RunPipelineOptions,
): Promise<void> {
  const ciMode = options.ciMode ?? (
    process.env.CI === '1' || process.env.CI === 'true' || !process.stdout.isTTY
  );
  currentMode = ciMode ? 'ci' : 'tui';

  process.on('SIGINT', () => {
    if (ciMode) process.stderr.write('Shutting down… press again to force\r');
    cleanup();
    setTimeout(() => process.exit(130), 3000).unref();
  });

  if (ciMode) await runCI(taskDefs);
  else await runTUI(taskDefs, options.title, options.subtitle);

  if (forceExitTimer) clearTimeout(forceExitTimer);
  cleanup();

  if (exitFailed) {
    console.error(`\n  ${options.title} failed.\n`);
    process.exit(1);
  } else {
    console.log(`\n  ${options.title}: all phases passed.\n`);
  }
}

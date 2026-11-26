import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { stateDir } from './config.js';
import type { Entry, FailureCode, Project, RunFailure } from './types.js';

const MAX_LINES = 3000;
/** 启动后观察这么久，进程死了或者日志里出现致命错误就当作启动失败 */
const SETTLE_MS = 2000;

export type RuntimeStatus = 'running' | 'stopped' | 'error';

export interface RuntimeState {
  id: string;
  status: RuntimeStatus;
  pid?: number;
  command?: string;
  /** run = 启动项目；install = 安装依赖 */
  kind?: 'run' | 'install';
  startedAt?: string;
  stoppedAt?: string;
  lastOperation?: string;
  exitCode?: number | null;
  error?: string;
  /** 从日志里识别出的失败原因，服务端只给 code */
  failure?: RunFailure;
}

export interface StartResult {
  ok: boolean;
  runtime: RuntimeState;
  failure?: RunFailure;
}

const ANSI = /\u001b\[[0-9;]*m/g;

const FAILURE_PATTERNS: { code: FailureCode; re: RegExp }[] = [
  { code: 'port-in-use', re: /EADDRINUSE|address already in use|bind: address already in use/i },
  {
    code: 'missing-deps',
    re: /Cannot find (module|package)|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|ModuleNotFoundError|no required module provides/i,
  },
  { code: 'missing-script', re: /missing script|[Cc]ommand not found|not found: (vite|next|nest|nodemon)/i },
  { code: 'permission', re: /EACCES|permission denied|operation not permitted/i },
];

export function classifyFailure(line: string): FailureCode | undefined {
  return FAILURE_PATTERNS.find((pattern) => pattern.re.test(line))?.code;
}

export class ProcessManager extends EventEmitter {
  private children = new Map<string, ChildProcess>();
  /** 用户主动 stop 的项目：退出时不要把 SIGTERM 当成启动失败 */
  private stopping = new Set<string>();
  private streams = new Map<string, fs.WriteStream>();
  private buffers = new Map<string, string[]>();
  private partials = new Map<string, string>();
  private state = new Map<string, RuntimeState>();
  private logDir: string;
  private stateFile: string;

  constructor() {
    super();
    const dir = stateDir();
    this.logDir = path.join(dir, 'logs');
    this.stateFile = path.join(dir, 'runtime.json');
    fs.mkdirSync(this.logDir, { recursive: true });
    this.load();
  }

  private load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.stateFile, 'utf8')) as Record<string, RuntimeState>;
      for (const [id, value] of Object.entries(raw)) {
        // 上次退出时子进程已经结束，恢复成 stopped，但保留 lastOperation
        this.state.set(id, { ...value, status: 'stopped', pid: undefined });
      }
    } catch {}
  }

  private persist() {
    const data: Record<string, RuntimeState> = {};
    for (const [id, value] of this.state) data[id] = value;
    try {
      fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
      fs.writeFileSync(this.stateFile, JSON.stringify(data, null, 2));
    } catch {}
  }

  get(id: string): RuntimeState {
    return this.state.get(id) ?? { id, status: 'stopped' };
  }

  list(): RuntimeState[] {
    return [...this.state.values()];
  }

  isRunning(id: string): boolean {
    const child = this.children.get(id);
    return Boolean(child && child.exitCode === null && !child.killed);
  }

  readLogs(id: string, limit = 500): string {
    const buffer = this.buffers.get(id);
    if (buffer?.length) return buffer.slice(-limit).join('');
    try {
      const text = fs.readFileSync(path.join(this.logDir, `${id}.log`), 'utf8');
      return text.split('\n').slice(-limit).join('\n');
    } catch {
      return '';
    }
  }

  private append(id: string, chunk: string) {
    if (!chunk) return;

    let stream = this.streams.get(id);
    if (!stream) {
      stream = fs.createWriteStream(path.join(this.logDir, `${id}.log`), { flags: 'a' });
      this.streams.set(id, stream);
    }
    stream.write(chunk);

    const buffer = this.buffers.get(id) ?? [];
    const combined = (this.partials.get(id) ?? '') + chunk;
    const parts = combined.split('\n');
    this.partials.set(id, parts.pop() ?? '');
    for (const line of parts) buffer.push(`${line}\n`);
    if (buffer.length > MAX_LINES) buffer.splice(0, buffer.length - MAX_LINES);
    this.buffers.set(id, buffer);

    // 从输出里识别失败原因，让界面能直接说清楚"为什么没起来"
    const plain = parts.map((line) => line.replace(ANSI, '')).join('\n');
    const code = classifyFailure(plain);
    const current = this.state.get(id);
    if (code && current && !current.failure) {
      const line = plain.split('\n').find((item) => classifyFailure(item));
      this.update(id, {
        failure: { code, line: line?.trim().slice(0, 200) ?? '' },
        status: current.status === 'running' ? 'running' : 'error',
      });
    }

    this.emit('log', id, chunk);
  }

  private update(id: string, patch: Partial<RuntimeState>): RuntimeState {
    const next: RuntimeState = { ...this.get(id), ...patch, id };
    this.state.set(id, next);
    this.persist();
    this.emit('change', id, next);
    return next;
  }

  private spawnEntry(
    project: Project,
    entry: Entry,
    kind: 'run' | 'install',
    header: string,
  ): Promise<{ exit: Promise<number | null>; pid?: number }> {
    const command = [entry.cmd, ...entry.args].join(' ');
    const now = new Date().toISOString();
    this.stopping.delete(project.id);

    this.append(project.id, `\n\u001b[90m[projectdeck] $ ${header}\u001b[0m\n`);
    this.append(project.id, `\u001b[90m[projectdeck] cwd: ${entry.cwd}\u001b[0m\n\n`);

    this.update(project.id, {
      status: 'running',
      kind,
      command,
      startedAt: now,
      stoppedAt: undefined,
      exitCode: undefined,
      error: undefined,
      failure: undefined,
      lastOperation: now,
      pid: undefined,
    });

    let child: ChildProcess;
    try {
      child = spawn(entry.cmd, entry.args, {
        cwd: entry.cwd,
        env: { ...process.env, FORCE_COLOR: '1', TERM: 'xterm-256color' },
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      const message = String((error as Error)?.message ?? error);
      this.append(project.id, `\n\u001b[31m[projectdeck] 启动失败: ${message}\u001b[0m\n`);
      this.update(project.id, { status: 'error', error: message, pid: undefined });
      return Promise.resolve({ exit: Promise.resolve(null), pid: undefined });
    }

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (data: string) => this.append(project.id, data));
    child.stderr?.on('data', (data: string) => this.append(project.id, data));

    const exit = new Promise<number | null>((resolve) => {
      child.on('error', (error) => {
        this.append(project.id, `\n\u001b[31m[projectdeck] 启动失败: ${error.message}\u001b[0m\n`);
        const failure: RunFailure = { code: 'missing-runtime', line: `${entry.cmd}: ${error.message}` };
        this.update(project.id, {
          status: 'error',
          error: error.message,
          failure,
          pid: undefined,
        });
        resolve(null);
      });

      child.on('exit', (code, signal) => {
        this.children.delete(project.id);
        this.append(
          project.id,
          `\n\u001b[90m[projectdeck] 进程退出 (code=${code ?? '-'}${signal ? `, signal=${signal}` : ''})\u001b[0m\n`,
        );
        this.streams.get(project.id)?.end();
        this.streams.delete(project.id);
        const current = this.get(project.id);
        const requested = this.stopping.has(project.id);
        // npm 被杀时通常不报 signal，而是把自己的退出码变成 143/130
        const clean =
          requested ||
          signal === 'SIGTERM' ||
          signal === 'SIGINT' ||
          signal === 'SIGHUP' ||
          code === 143 ||
          code === 130;
        const failure =
          requested || code === 0 || clean
            ? undefined
            : (current.failure ?? { code: 'unknown' as FailureCode, line: `exit code ${code ?? signal}` });
        if (requested) {
          this.update(project.id, {
            status: 'stopped',
            pid: undefined,
            exitCode: code,
            stoppedAt: new Date().toISOString(),
            lastOperation: new Date().toISOString(),
            failure: undefined,
            error: undefined,
          });
          resolve(code);
          return;
        }
        this.update(project.id, {
          status: code === 0 || clean || current.failure ? (current.failure ? 'error' : 'stopped') : 'error',
          pid: undefined,
          exitCode: code,
          stoppedAt: new Date().toISOString(),
          lastOperation: new Date().toISOString(),
          ...(failure ? { failure } : {}),
        });
        resolve(code);
      });
    });

    this.children.set(project.id, child);
    this.update(project.id, { pid: child.pid });
    return Promise.resolve({ exit, pid: child.pid });
  }

  private async settle(id: string, exit: Promise<number | null>, expectExit: boolean): Promise<RuntimeState> {
    const outcome = await Promise.race([
      exit.then(() => 'exited' as const),
      new Promise<'alive'>((resolve) => {
        const timer = setTimeout(() => resolve('alive'), SETTLE_MS);
        timer.unref?.();
      }),
    ]);

    const runtime = this.get(id);
    if (outcome === 'exited') {
      // 安装任务本来就会退出；用户主动 stop 也不算启动失败
      if (expectExit || this.stopping.has(id)) return runtime;
      // 启动后 1 秒多就退出，不算启动成功
      return this.update(id, {
        status: runtime.failure ? 'error' : 'stopped',
        failure:
          runtime.failure ??
          ({ code: 'unknown', line: `process exited early (code=${runtime.exitCode ?? '-'})` } as RunFailure),
      });
    }
    return runtime;
  }

  async start(project: Project): Promise<StartResult> {
    if (!project.entry) {
      return {
        ok: false,
        runtime: this.get(project.id),
        failure: { code: 'missing-script', line: 'no start command' },
      };
    }
    if (this.isRunning(project.id)) return { ok: true, runtime: this.get(project.id) };

    const { exit } = await this.spawnEntry(project, project.entry, 'run', [project.entry.cmd, ...project.entry.args].join(' '));
    const runtime = await this.settle(project.id, exit, false);
    return { ok: runtime.status === 'running' && !runtime.failure, runtime, failure: runtime.failure };
  }

  async install(project: Project): Promise<StartResult> {
    const entry = project.dependencies?.installCmd;
    if (!entry) {
      return {
        ok: false,
        runtime: this.get(project.id),
        failure: { code: 'missing-deps', line: 'no install command' },
      };
    }
    if (this.isRunning(project.id)) return { ok: true, runtime: this.get(project.id) };

    const { exit } = await this.spawnEntry(project, entry, 'install', [entry.cmd, ...entry.args].join(' '));
    const runtime = await this.settle(project.id, exit, true);
    return { ok: runtime.status !== 'error', runtime, failure: runtime.failure };
  }

  stop(id: string): RuntimeState {
    const child = this.children.get(id);
    const now = new Date().toISOString();
    this.stopping.add(id);

    if (!child || child.exitCode !== null) {
      this.children.delete(id);
      return this.update(id, {
        status: 'stopped',
        pid: undefined,
        stoppedAt: now,
        lastOperation: now,
        failure: undefined,
        error: undefined,
      });
    }

    const pid = child.pid;
    const kill = (signal: NodeJS.Signals) => {
      if (!pid) {
        try {
          child.kill(signal);
        } catch {}
        return;
      }
      try {
        process.kill(-pid, signal);
      } catch {
        try {
          child.kill(signal);
        } catch {}
      }
    };

    kill('SIGTERM');
    const timer = setTimeout(() => {
      if (this.isRunning(id)) {
        this.append(id, '\n\u001b[33m[projectdeck] 超时未退出，发送 SIGKILL\u001b[0m\n');
        kill('SIGKILL');
      }
    }, 4000);
    timer.unref?.();

    return this.update(id, {
      status: 'stopped',
      stoppedAt: now,
      lastOperation: now,
      failure: undefined,
      error: undefined,
    });
  }

  async restart(project: Project): Promise<StartResult> {
    this.stop(project.id);
    await new Promise((resolve) => setTimeout(resolve, 900));
    return this.start(project);
  }

  shutdown() {
    for (const [id, child] of this.children) {
      const pid = child.pid;
      try {
        if (pid) process.kill(-pid, 'SIGTERM');
        else child.kill('SIGTERM');
      } catch {}
      this.buffers.delete(id);
    }
    this.children.clear();
  }
}

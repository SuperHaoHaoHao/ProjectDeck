import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Project } from './types.js';

const MAX_LINES = 3000;
const STATE_DIR = path.join(os.homedir(), '.projectdeck');
const LOG_DIR = path.join(STATE_DIR, 'logs');
const STATE_FILE = path.join(STATE_DIR, 'runtime.json');

export type RuntimeStatus = 'running' | 'stopped' | 'error';

export interface RuntimeState {
  id: string;
  status: RuntimeStatus;
  pid?: number;
  command?: string;
  startedAt?: string;
  stoppedAt?: string;
  lastOperation?: string;
  exitCode?: number | null;
  error?: string;
}

export class ProcessManager extends EventEmitter {
  private children = new Map<string, ChildProcess>();
  private streams = new Map<string, fs.WriteStream>();
  private buffers = new Map<string, string[]>();
  private partials = new Map<string, string>();
  private state = new Map<string, RuntimeState>();

  constructor() {
    super();
    fs.mkdirSync(LOG_DIR, { recursive: true });
    this.load();
  }

  private load() {
    try {
      const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as Record<string, RuntimeState>;
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
      fs.mkdirSync(STATE_DIR, { recursive: true });
      fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
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
      const text = fs.readFileSync(path.join(LOG_DIR, `${id}.log`), 'utf8');
      return text.split('\n').slice(-limit).join('\n');
    } catch {
      return '';
    }
  }

  private append(id: string, chunk: string) {
    if (!chunk) return;

    let stream = this.streams.get(id);
    if (!stream) {
      stream = fs.createWriteStream(path.join(LOG_DIR, `${id}.log`), { flags: 'a' });
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

    this.emit('log', id, chunk);
  }

  private update(id: string, patch: Partial<RuntimeState>): RuntimeState {
    const next: RuntimeState = { ...this.get(id), ...patch, id };
    this.state.set(id, next);
    this.persist();
    this.emit('change', id, next);
    return next;
  }

  start(project: Project): RuntimeState {
    if (!project.entry) throw new Error('这个项目没有可执行的启动命令');
    if (this.isRunning(project.id)) return this.get(project.id);

    const { cmd, args, cwd } = project.entry;
    const command = [cmd, ...args].join(' ');
    const now = new Date().toISOString();

    this.append(project.id, `\n\u001b[90m[projectdeck] $ ${command}\u001b[0m\n`);
    this.append(project.id, `\u001b[90m[projectdeck] cwd: ${cwd}\u001b[0m\n\n`);

    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env, FORCE_COLOR: '1', TERM: 'xterm-256color' },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (data: string) => this.append(project.id, data));
    child.stderr?.on('data', (data: string) => this.append(project.id, data));

    child.on('error', (error) => {
      this.append(project.id, `\n\u001b[31m[projectdeck] 启动失败: ${error.message}\u001b[0m\n`);
      this.update(project.id, { status: 'error', error: error.message, pid: undefined });
    });

    child.on('exit', (code, signal) => {
      this.children.delete(project.id);
      this.append(
        project.id,
        `\n\u001b[90m[projectdeck] 进程退出 (code=${code ?? '-'}${signal ? `, signal=${signal}` : ''})\u001b[0m\n`,
      );
      this.streams.get(project.id)?.end();
      this.streams.delete(project.id);
      this.update(project.id, {
        status: code === 0 || signal === 'SIGTERM' || signal === 'SIGINT' || signal === 'SIGHUP' ? 'stopped' : 'error',
        pid: undefined,
        exitCode: code,
        stoppedAt: new Date().toISOString(),
        lastOperation: new Date().toISOString(),
      });
    });

    this.children.set(project.id, child);

    return this.update(project.id, {
      status: 'running',
      pid: child.pid,
      command,
      startedAt: now,
      stoppedAt: undefined,
      exitCode: undefined,
      error: undefined,
      lastOperation: now,
    });
  }

  stop(id: string): RuntimeState {
    const child = this.children.get(id);
    const now = new Date().toISOString();

    if (!child || child.exitCode !== null) {
      this.children.delete(id);
      return this.update(id, { status: 'stopped', pid: undefined, stoppedAt: now, lastOperation: now });
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

    return this.update(id, { status: 'stopped', stoppedAt: now, lastOperation: now });
  }

  async restart(project: Project): Promise<RuntimeState> {
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

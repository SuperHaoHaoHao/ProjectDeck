import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import type { PackageJson } from './detect.js';
import type { PortInfo } from './types.js';

function readText(file: string, max = 50_000): string {
  try {
    return fs.readFileSync(file, 'utf8').slice(0, max);
  } catch {
    return '';
  }
}

function firstMatch(text: string, regex: RegExp): number | undefined {
  const match = text.match(regex);
  if (!match?.[1]) return undefined;
  const value = Number(match[1]);
  return Number.isInteger(value) && value > 0 && value < 65536 ? value : undefined;
}

/** monorepo 里真正的端口常写在子包里，例如 server/.env、apps/web/vite.config.ts */
const CHILD_DIRS = ['server', 'servers', 'client', 'web', 'api', 'backend', 'frontend', 'apps', 'packages'];
const ENV_FILES = ['.env', '.env.local', '.env.development', '.env.dev'];

function childDirs(dir: string): string[] {
  const out: string[] = [];
  for (const group of CHILD_DIRS) {
    const base = path.join(dir, group);
    out.push(base);
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(base, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        out.push(path.join(base, entry.name));
      }
    }
  }
  return out;
}

export function detectPorts(dir: string, pkg: PackageJson | null, stack: string[]): PortInfo[] {
  const found = new Map<number, PortInfo['source']>();
  const add = (port: number | undefined, source: PortInfo['source']) => {
    if (!port || found.has(port)) return;
    found.set(port, source);
  };

  const dirs = [dir, ...childDirs(dir)];

  for (const base of dirs) {
    for (const file of ['vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'vite.config.cjs']) {
      const text = readText(path.join(base, file));
      if (!text) continue;
      add(firstMatch(text, /port\s*:\s*(\d{2,5})/), 'config');
    }
  }

  const scripts = Object.values(pkg?.scripts ?? {}).join(' ');
  if (scripts) {
    add(firstMatch(scripts, /--port[= ](\d{2,5})/), 'script');
    add(firstMatch(scripts, /(?:^|\s)-p\s+(\d{2,5})/), 'script');
  }

  for (const base of dirs) {
    for (const file of ENV_FILES) {
      const text = readText(path.join(base, file));
      add(firstMatch(text, /^PORT\s*=\s*(\d{2,5})/m), 'env');
    }
  }

  const clientScript = readText(path.join(dir, 'scripts', 'start-client-dev.js'));
  add(firstMatch(clientScript, /DEFAULT_CLIENT_PORT\s*=\s*(\d{2,5})/), 'config');

  for (const file of ['src/config/dev.yml', 'servers/src/config/dev.yml', 'src/config/dev.yaml']) {
    const text = readText(path.join(dir, file));
    add(firstMatch(text, /^\s{0,4}port:\s*(\d{2,5})/m), 'config');
  }

  // Flask / FastAPI 直接写在 app.py 里的端口
  add(firstMatch(readText(path.join(dir, 'app.py')), /port\s*=\s*(\d{2,5})/), 'config');

  if (found.size === 0) {
    if (stack.includes('Next.js')) add(3000, 'default');
    else if (stack.includes('Vite')) add(5173, 'default');
  }

  return [...found.entries()]
    .slice(0, 4)
    .map(([port, source]) => ({ port, source, open: false }));
}

/**
 * 一次拿到本机所有 LISTEN 端口 → PID 的映射。
 * macOS/Linux 用 lsof；拿不到时返回空 Map，调用方回退到 TCP 探测。
 */
export function listeningPorts(): Map<number, number> {
  const map = new Map<number, number>();
  let output = '';
  try {
    output = execFileSync('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-F', 'pn'], {
      encoding: 'utf8',
      timeout: 4000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return map;
  }

  let pid = 0;
  for (const line of output.split('\n')) {
    if (line.startsWith('p')) {
      pid = Number(line.slice(1));
    } else if (line.startsWith('n') && pid) {
      const port = Number(line.slice(1).split(':').pop());
      if (Number.isInteger(port) && port > 0) map.set(port, pid);
    }
  }
  return map;
}

const cwdCache = new Map<number, string>();

export function processCwd(pid: number): string {
  const cached = cwdCache.get(pid);
  if (cached !== undefined) return cached;
  let cwd = '';
  try {
    const output = execFileSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    cwd = output.split('\n').find((line) => line.startsWith('n'))?.slice(1) ?? '';
  } catch {}
  cwdCache.set(pid, cwd);
  return cwd;
}

/** lsof 报的是真实路径（/private/var/…），项目路径可能带符号链接（/var/…），要统一后再比 */
export function normalizePath(input: string): string {
  const trimmed = input.replace(/\/+$/, '') || '/';
  try {
    return fs.realpathSync(trimmed).replace(/\/+$/, '') || '/';
  } catch {}
  // 路径还不存在（或已删除）时，把存在的祖先解析掉再拼回来
  const parent = path.dirname(trimmed);
  if (parent === trimmed) return trimmed;
  return path.join(normalizePath(parent), path.basename(trimmed));
}

export function belongsTo(projectPath: string, owner: string | undefined): boolean {
  if (!owner) return false;
  const project = normalizePath(projectPath);
  const ownerPath = normalizePath(owner);
  return ownerPath === project || ownerPath.startsWith(`${project}/`);
}

export function isPortOpen(port: number, host = '127.0.0.1', timeout = 250): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const done = (open: boolean) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

export async function probePorts(ports: PortInfo[]): Promise<void> {
  await Promise.all(
    ports.map(async (item) => {
      item.open = await isPortOpen(item.port);
    }),
  );
}

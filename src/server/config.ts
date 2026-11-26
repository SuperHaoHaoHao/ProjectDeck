import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface StablePortConfig {
  /** ProjectDeck 监听的固定端口，给 frpc / 反向代理用 */
  port: number;
  /** 希望转发到的项目端口；不填就自动用项目当前实际监听的端口 */
  target?: number;
  /** 冗余存一份，方便人和 agent 直接读 config.json */
  name?: string;
  path?: string;
}

export interface DeckConfig {
  port: number;
  host: string;
  roots: string[];
  maxDepth: number;
  ignore: string[];
  openBrowser: boolean;
  includeNonRunnable: boolean;
  configPath: string;
  /** projectId → 固定端口 */
  stablePorts: Record<string, StablePortConfig>;
}

/** 把固定端口写回 config.json，其它字段原样保留 */
export function saveStablePort(
  configPath: string,
  projectId: string,
  value: StablePortConfig | null,
): void {
  const current = readStablePorts(configPath);
  if (value) current[projectId] = value;
  else delete current[projectId];
  writeStablePorts(configPath, current);
}

export function readStablePorts(configPath: string): Record<string, StablePortConfig> {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
      stablePorts?: Record<string, StablePortConfig>;
    };
    return raw.stablePorts ?? {};
  } catch {
    return {};
  }
}

export function writeStablePorts(configPath: string, value: Record<string, StablePortConfig>): void {
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
  } catch {}
  raw.stablePorts = value;
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(raw, null, 2)}\n`);
}

const DEFAULT_IGNORE = [
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.output',
  '.turbo',
  'coverage',
  'target',
  'vendor',
  '.venv',
  'venv',
  '__pycache__',
  '.idea',
  '.vscode',
  'DerivedData',
  '.pnpm-store',
  '.cache',
  'unpackage',
  'Pods',
  '.gradle',
  '.expo',
  'out',
  'sdk',
  'SDK',
  'uni_modules',
  'examples',
  'simpleDemo',
  'credentials',
];

const IGNORE_PREFIXES = ['HBuilder-', 'Android-SDK@', 'Android-SDK'];

export function isIgnoredName(name: string, ignore: string[]): boolean {
  if (name.startsWith('.')) return true;
  if (ignore.includes(name)) return true;
  return IGNORE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

export function expandHome(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

/**
 * 所有运行态文件（config.json / runtime.json / logs）的根目录。
 * PROJECTDECK_HOME 用于测试隔离，默认 ~/.projectdeck。
 */
export function stateDir(): string {
  const override = process.env.PROJECTDECK_HOME?.trim();
  return override ? path.resolve(expandHome(override)) : path.join(os.homedir(), '.projectdeck');
}

function firstExisting(candidates: string[]): string[] {
  const found = candidates.map(expandHome).filter((p) => {
    try {
      return fs.statSync(p).isDirectory();
    } catch {
      return false;
    }
  });
  return found.length ? found : [process.cwd()];
}

export function defaultRoots(): string[] {
  return firstExisting(['~/Code', '~/Projects', '~/Developer', '~/src', '~/dev']);
}

export function parseArgs(argv: string[]): {
  port?: number;
  host?: string;
  roots: string[];
  noOpen: boolean;
  all: boolean;
} {
  const out: { port?: number; host?: string; roots: string[]; noOpen: boolean; all: boolean } = {
    roots: [],
    noOpen: false,
    all: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--port' && argv[i + 1]) out.port = Number(argv[++i]);
    else if (arg.startsWith('--port=')) out.port = Number(arg.slice(7));
    else if (arg === '--host' && argv[i + 1]) out.host = argv[++i];
    else if (arg.startsWith('--host=')) out.host = arg.slice(7);
    else if (arg === '--root' && argv[i + 1]) out.roots.push(argv[++i]);
    else if (arg.startsWith('--root=')) out.roots.push(arg.slice(7));
    else if (arg === '--no-open') out.noOpen = true;
    else if (arg === '--all') out.all = true;
  }
  return out;
}

export function loadConfig(argv: string[]): DeckConfig {
  const args = parseArgs(argv);
  const dir = stateDir();
  const configPath = path.join(dir, 'config.json');

  let fileConfig: Partial<DeckConfig> = {};
  if (fs.existsSync(configPath)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch {
      fileConfig = {};
    }
  } else {
    fs.mkdirSync(dir, { recursive: true });
    const initial = {
      port: 4321,
      host: '127.0.0.1',
      roots: defaultRoots(),
      maxDepth: 6,
    };
    fs.writeFileSync(configPath, `${JSON.stringify(initial, null, 2)}\n`);
    fileConfig = initial;
  }

  const roots = (args.roots.length ? args.roots : fileConfig.roots ?? defaultRoots()).map(expandHome);

  return {
    port: args.port ?? fileConfig.port ?? 4321,
    host: args.host ?? fileConfig.host ?? '127.0.0.1',
    roots,
    maxDepth: fileConfig.maxDepth ?? 6,
    ignore: [...DEFAULT_IGNORE, ...(fileConfig.ignore ?? [])],
    openBrowser: !args.noOpen,
    includeNonRunnable: args.all || Boolean(fileConfig.includeNonRunnable),
    configPath,
    stablePorts: fileConfig.stablePorts ?? {},
  };
}

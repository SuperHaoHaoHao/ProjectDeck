import fs from 'node:fs';
import path from 'node:path';
import type { DependencyState, Entry, PackageManager, ProjectKind, Runtime } from './types.js';

export interface PackageJson {
  name?: string;
  version?: string;
  description?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: unknown;
}

export interface Detection {
  kind: ProjectKind;
  runtime: Runtime;
  stack: string[];
  version?: string;
  description?: string;
  entry?: Entry;
  packageName?: string;
  isWorkspaceRoot: boolean;
  markers: string[];
}

function exists(p: string): boolean {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

export function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

function readText(file: string, max = 200_000): string {
  try {
    return fs.readFileSync(file, 'utf8').slice(0, max);
  } catch {
    return '';
  }
}

function readdir(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

export function detectPackageManager(dir: string): 'pnpm' | 'yarn' | 'bun' | 'npm' {
  if (exists(path.join(dir, 'pnpm-lock.yaml')) || exists(path.join(dir, 'pnpm-workspace.yaml'))) return 'pnpm';
  if (exists(path.join(dir, 'yarn.lock'))) return 'yarn';
  if (exists(path.join(dir, 'bun.lockb')) || exists(path.join(dir, 'bun.lock'))) return 'bun';
  return 'npm';
}

/** 自己或最多上溯 3 层父目录里有没有 node_modules（monorepo 依赖会被提升到根） */
function hasNodeModules(dir: string): boolean {
  let current = dir;
  for (let depth = 0; depth < 4; depth++) {
    if (exists(path.join(current, 'node_modules'))) return true;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return false;
}

export function detectDependencies(dir: string, pkg: PackageJson | null, runtime: Runtime): DependencyState {
  if (pkg) {
    const manager = detectPackageManager(dir);
    const declared = Object.keys(pkg.dependencies ?? {}).length + Object.keys(pkg.devDependencies ?? {}).length;
    return {
      manager,
      hasManifest: true,
      // 没有声明依赖的项目不需要 node_modules
      installed: declared === 0 || hasNodeModules(dir),
      installCmd: { cmd: manager, args: ['install'], cwd: dir, source: 'detected' },
    };
  }

  if (runtime === 'python') {
    const requirements = exists(path.join(dir, 'requirements.txt'));
    const venv = ['.venv', 'venv'].map((name) => path.join(dir, name)).find((p) => exists(p));
    const pip = venv ? path.join(venv, 'bin', 'pip') : undefined;
    return {
      manager: 'pip',
      hasManifest: requirements || exists(path.join(dir, 'pyproject.toml')),
      installed: Boolean(venv),
      installCmd:
        requirements && pip
          ? { cmd: pip, args: ['install', '-r', 'requirements.txt'], cwd: dir, source: 'detected' }
          : undefined,
    };
  }

  return { manager: 'none' as PackageManager, hasManifest: false, installed: true };
}

function findXcodeProject(dir: string): string | undefined {
  // 只认根目录和约定的平台目录，避免把 hello-dev/something.xcodeproj 误判成父目录的项目
  const roots = [dir, ...['macOS', 'macos', 'ios', 'mac', 'apple', 'platforms'].map((name) => path.join(dir, name))];
  for (const base of roots) {
    let entries: string[] = [];
    try {
      if (!fs.statSync(base).isDirectory()) continue;
      entries = fs.readdirSync(base);
    } catch {
      continue;
    }
    const hit = entries.find((name) => name.endsWith('.xcodeproj'));
    if (hit) return path.join(base, hit);
  }
  return undefined;
}

function workspaceDeps(dir: string): Record<string, string> {
  const merged: Record<string, string> = {};
  const merge = (child: PackageJson | null) => {
    if (child) Object.assign(merged, child.dependencies ?? {}, child.devDependencies ?? {});
  };

  for (const group of ['apps', 'packages', 'client', 'servers', 'server', 'web', 'api', 'frontend', 'backend']) {
    const base = path.join(dir, group);
    // client/package.json、servers/package.json 这种直接子包
    merge(readJson<PackageJson>(path.join(base, 'package.json')));

    // apps/web/package.json、packages/*/package.json 这种再深一层
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(base, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      merge(readJson<PackageJson>(path.join(base, entry.name, 'package.json')));
    }
  }
  return merged;
}

function readXcodeVersion(projectPath: string): string | undefined {
  const pbxproj = path.join(projectPath, 'project.pbxproj');
  const text = readText(pbxproj, 500_000);
  const match = text.match(/MARKETING_VERSION\s*=\s*([^;]+);/);
  return match?.[1]?.trim();
}

function readTomlVersion(file: string): string | undefined {
  const text = readText(file, 20_000);
  return text.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
}

function entryFromScripts(dir: string, scripts: Record<string, string>): Entry | undefined {
  const pm = detectPackageManager(dir);
  const order = ['dev', 'dev:h5', 'pm2-dev', 'start', 'serve'];
  const picked = order.find((name) => typeof scripts[name] === 'string');
  if (!picked) return undefined;
  return {
    cmd: pm,
    args: ['run', picked],
    cwd: dir,
    source: 'detected',
  };
}

export function detect(dir: string): Detection | null {
  const files = readdir(dir);
  const fileSet = new Set(files);
  const has = (name: string) => fileSet.has(name);

  const pkgFile = path.join(dir, 'package.json');
  const pkg = has('package.json') ? readJson<PackageJson>(pkgFile) : null;
  const hasWorkspaces = has('pnpm-workspace.yaml') || Boolean(pkg?.workspaces);
  const deps: Record<string, string> = {
    ...(pkg?.dependencies ?? {}),
    ...(pkg?.devDependencies ?? {}),
    // 根 package.json 常常只是脚本壳，真依赖在 client/servers/apps 里
    ...workspaceDeps(dir),
  };

  const markers: string[] = [];
  const stack: string[] = [];
  const addStack = (name: string) => {
    if (!stack.includes(name)) stack.push(name);
  };

  const isUniApp = has('pages.json') && has('manifest.json');
  const xcodeProject = findXcodeProject(dir);
  const isSwiftSources =
    !xcodeProject &&
    !has('Package.swift') &&
    ((has('src') && readdir(path.join(dir, 'src')).some((name) => name.endsWith('.swift'))) ||
      files.some((name) => name.endsWith('.swift')));
  const isSwiftProject = Boolean(xcodeProject) || has('Package.swift') || isSwiftSources;
  const isAndroid =
    exists(path.join(dir, 'app/src/main/AndroidManifest.xml')) ||
    (has('AndroidManifest.xml') && (has('build.gradle') || has('build.gradle.kts')));
  const isCompose = has('compose.yaml') || has('compose.yml') || has('docker-compose.yml') || has('docker-compose.yaml');

  if (pkg) markers.push('package.json');
  if (isUniApp) markers.push('pages.json');
  if (xcodeProject) markers.push(path.basename(xcodeProject));
  if (isAndroid) markers.push('AndroidManifest.xml');
  if (has('go.mod')) markers.push('go.mod');
  if (has('Cargo.toml')) markers.push('Cargo.toml');
  if (has('pom.xml')) markers.push('pom.xml');
  if (has('build.gradle') || has('build.gradle.kts')) markers.push('gradle');
  if (has('requirements.txt')) markers.push('requirements.txt');
  if (has('pyproject.toml')) markers.push('pyproject.toml');
  if (!pkg && has('app.py')) markers.push('app.py');
  if (isCompose) markers.push('compose');
  if (has('Package.swift')) markers.push('Package.swift');
  if (isSwiftSources) markers.push('swift');

  if (markers.length === 0) return null;

  // runtime
  let runtime: Runtime = 'none';
  if (pkg) runtime = 'node';
  else if (has('requirements.txt') || has('pyproject.toml') || has('app.py')) runtime = 'python';
  else if (has('go.mod')) runtime = 'go';
  else if (has('Cargo.toml')) runtime = 'rust';
  else if (has('pom.xml') || has('build.gradle') || has('build.gradle.kts')) runtime = 'java';
  else if (isSwiftProject) runtime = 'swift';
  if (isAndroid) runtime = 'android';

  // entry 先算，kind 依赖它
  let entry: Entry | undefined;
  if (pkg) entry = entryFromScripts(dir, pkg.scripts ?? {});
  if (!entry && has('app.py')) entry = { cmd: 'python3', args: ['app.py'], cwd: dir, source: 'detected' };
  if (!entry && has('go.mod')) entry = { cmd: 'go', args: ['run', '.'], cwd: dir, source: 'detected' };
  if (!entry && has('Cargo.toml')) entry = { cmd: 'cargo', args: ['run'], cwd: dir, source: 'detected' };
  if (!entry && has('pom.xml')) entry = { cmd: 'mvn', args: ['spring-boot:run'], cwd: dir, source: 'detected' };
  if (!entry && isCompose) entry = { cmd: 'docker', args: ['compose', 'up'], cwd: dir, source: 'detected' };

  // kind
  let kind: ProjectKind;
  if (isUniApp) kind = 'miniapp';
  else if (isAndroid) kind = 'mobile';
  else if (isSwiftProject || deps.electron || has('electron-builder.config.cjs')) kind = 'desktop';
  else kind = entry ? 'service' : 'package';

  // stack
  if (deps['@nestjs/core']) addStack('NestJS');
  if (deps.next || has('next.config.ts') || has('next.config.js')) addStack('Next.js');
  if (deps.nuxt || has('nuxt.config.ts')) addStack('Nuxt');
  if (deps.react || deps['react-dom']) addStack('React');
  if (deps.vue) addStack('Vue');
  if (deps['@dcloudio/uni-app'] || isUniApp) addStack('uni-app');
  if (deps.electron || has('electron-builder.config.cjs')) addStack('Electron');
  if (deps.vite || has('vite.config.ts') || has('vite.config.js')) addStack('Vite');
  if (deps.typescript) addStack('TypeScript');
  if (deps.tailwindcss || deps['@tailwindcss/vite']) addStack('Tailwind');
  if (deps.express) addStack('Express');
  if (deps.fastify) addStack('Fastify');
  if (deps.koa) addStack('Koa');
  if (deps.hono) addStack('Hono');
  if (deps.typeorm || deps['@nestjs/typeorm'] || deps.prisma || deps['@prisma/client']) addStack('ORM');
  // 样式 / 数据库这类「非框架」依赖也要能显示，否则纯 Node + Sass 的项目技术栈会是空的
  if (deps.sass || deps['node-sass'] || deps['sass-embedded']) addStack('Sass');
  if (deps.pg) addStack('PostgreSQL');
  if (deps.mysql || deps.mysql2) addStack('MySQL');
  if (deps.sqlite3 || deps['better-sqlite3']) addStack('SQLite');
  if (deps.mongoose || deps.mongodb) addStack('MongoDB');
  if (deps.redis || deps.ioredis) addStack('Redis');
  if (runtime === 'python') addStack('Python');
  if (runtime === 'go') addStack('Go');
  if (runtime === 'rust') addStack('Rust');
  if (runtime === 'java') addStack('Java');
  if (runtime === 'swift') addStack('Swift');
  if (runtime === 'android') addStack('Kotlin');
  if (isCompose) addStack('Docker');

  // 兜底：至少让用户知道这是什么语言写的，不要出现空白技术栈
  if (stack.length === 0) {
    const fallback: Record<Runtime, string> = {
      node: 'Node.js',
      python: 'Python',
      go: 'Go',
      rust: 'Rust',
      java: 'Java',
      swift: 'Swift',
      android: 'Kotlin',
      none: 'Files',
    };
    addStack(fallback[runtime]);
  }

  // version
  let version: string | undefined = pkg?.version;
  if (!version && has('Cargo.toml')) version = readTomlVersion(path.join(dir, 'Cargo.toml'));
  if (!version && has('pyproject.toml')) version = readTomlVersion(path.join(dir, 'pyproject.toml'));
  if (!version && xcodeProject) version = readXcodeVersion(xcodeProject);

  const isWorkspaceRoot = hasWorkspaces;

  return {
    kind,
    runtime,
    stack,
    version,
    description: pkg?.description,
    entry,
    packageName: pkg?.name,
    isWorkspaceRoot,
    markers,
  };
}

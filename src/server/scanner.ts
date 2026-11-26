import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isIgnoredName, type DeckConfig } from './config.js';
import { detect, readJson, type Detection, type PackageJson } from './detect.js';
import { readGit } from './git.js';
import { belongsTo, detectPorts, listeningPorts, probePorts, processCwd } from './ports.js';
import type { Artifact, Project, ProjectKind, Runtime, ScanResult, SkipReason, SkippedItem } from './types.js';

const README_NAMES = ['README.md', 'readme.md', 'README_EN.md', 'README.zh-CN.md', 'README.zh.md', 'README.txt'];
const MD_NAMES = ['README.md', 'readme.md', 'CLAUDE.md', 'AGENTS.md', 'README_EN.md'];
const RUNNABLE_KINDS: ProjectKind[] = ['desktop', 'miniapp', 'mobile'];

function readdirSafe(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function findReadme(dir: string): string | undefined {
  return README_NAMES.find((name) => {
    try {
      return fs.statSync(path.join(dir, name)).isFile();
    } catch {
      return false;
    }
  });
}

function summarizeReadme(text: string): string {
  const cleaned = text
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/[`*_~]/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const sentences = cleaned
    .split(/(?<=[。！？.!?])\s+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 18 && !line.startsWith('|') && !line.startsWith('---'));
  const preferred = sentences.find((line) => !/[=<>{}]|src\/|\.json\b|\.ts\b|\.js\b/.test(line));
  return (preferred ?? sentences[0] ?? cleaned).slice(0, 180);
}

function findArtifacts(dir: string): Artifact[] {
  const out: Artifact[] = [];
  const collect = (base: string, max: number) => {
    for (const entry of readdirSafe(base)) {
      if (!entry.isFile()) continue;
      if (!/\.(dmg|apk|zip)$/i.test(entry.name)) continue;
      const version = entry.name.match(/v?(\d+\.\d+(?:\.\d+)?)/)?.[1];
      out.push({
        type: entry.name.split('.').pop()?.toLowerCase() ?? 'file',
        name: entry.name,
        version,
      });
      if (out.length >= max) return;
    }
  };
  collect(dir, 6);
  collect(path.join(dir, 'dist'), 6);
  return out.slice(0, 8);
}

function makeId(dir: string): string {
  return crypto.createHash('sha1').update(dir).digest('hex').slice(0, 10);
}

function createdAt(dir: string): string {
  try {
    const stat = fs.statSync(dir);
    return (stat.birthtime ?? stat.mtime).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function buildProject(dir: string, detection: Detection, readmeFile?: string): Project {
  const name = path.basename(dir);
  const pkg = fs.existsSync(path.join(dir, 'package.json'))
    ? readJson<PackageJson>(path.join(dir, 'package.json'))
    : null;
  const ports = detectPorts(dir, pkg, detection.stack);

  let description = detection.description ?? '';
  if (!description && readmeFile) {
    try {
      description = summarizeReadme(fs.readFileSync(path.join(dir, readmeFile), 'utf8'));
    } catch {}
  }

  const compose = ['compose.yaml', 'compose.yml', 'docker-compose.yml', 'docker-compose.yaml'].some((file) =>
    fs.existsSync(path.join(dir, file)),
  );
  const runnable = Boolean(detection.entry) || RUNNABLE_KINDS.includes(detection.kind);

  return {
    id: makeId(dir),
    name,
    path: dir,
    kind: detection.kind,
    runtime: detection.runtime,
    stack: detection.stack,
    description,
    version: detection.version,
    entry: detection.entry,
    ports,
    status: ports.length ? 'stopped' : 'n/a',
    supervisor: compose ? 'docker' : 'none',
    git: readGit(dir),
    artifacts: findArtifacts(dir),
    tags: detection.markers,
    readmeFile,
    createdAt: createdAt(dir),
    runnable,
    lastSeenAt: new Date().toISOString(),
  };
}

function hasAnyMd(dir: string): boolean {
  return MD_NAMES.some((name) => {
    try {
      return fs.statSync(path.join(dir, name)).isFile();
    } catch {
      return false;
    }
  });
}

function docsProject(dir: string): Project {
  const readmeFile = findReadme(dir);
  let description = '';
  if (readmeFile) {
    try {
      description = summarizeReadme(fs.readFileSync(path.join(dir, readmeFile), 'utf8'));
    } catch {}
  }
  return {
    id: makeId(dir),
    name: path.basename(dir),
    path: dir,
    kind: 'docs' as ProjectKind,
    runtime: 'none' as Runtime,
    stack: ['Docs'],
    description,
    ports: [],
    status: 'n/a',
    supervisor: 'none',
    git: readGit(dir),
    artifacts: [],
    tags: ['markdown'],
    readmeFile,
    createdAt: createdAt(dir),
    runnable: false,
    lastSeenAt: new Date().toISOString(),
  };
}

export async function scanProjects(config: DeckConfig): Promise<ScanResult> {
  const started = Date.now();
  const projects: Project[] = [];
  const skipped: SkippedItem[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  let scannedDirs = 0;

  const skip = (pathname: string, kind: string, reason: SkipReason) => {
    if (skipped.length < 200) {
      skipped.push({ path: pathname, name: path.basename(pathname), kind, reason });
    }
  };

  const walk = (dir: string, depth: number, register: boolean) => {
    let real = dir;
    try {
      real = fs.realpathSync(dir);
    } catch {}
    if (seen.has(real)) return;
    seen.add(real);
    scannedDirs += 1;

    let detection: Detection | null = null;
    try {
      detection = detect(dir);
    } catch (error) {
      errors.push(`${dir}: ${String((error as Error)?.message ?? error)}`);
    }

    if (detection && register) {
      const readmeFile = findReadme(dir);
      const project = buildProject(dir, detection, readmeFile);
      if (project.runnable || config.includeNonRunnable) {
        projects.push(project);
      } else {
        skip(dir, project.kind, project.kind === 'docs' ? 'docs-only' : 'no-entry');
      }
    }

    const entries = readdirSafe(dir);
    const subDirs = entries.filter(
      (entry) => entry.isDirectory() && !isIgnoredName(entry.name, config.ignore),
    );

    const isProject = Boolean(detection) && register;
    const workspace = detection?.isWorkspaceRoot ?? false;
    for (const entry of subDirs) {
      if (depth + 1 > config.maxDepth) continue;
      // 已经识别为项目后不再往里钻，只有 plugins/ 例外（KimiCodePulse 这类）
      if (isProject && entry.name !== 'plugins') continue;
      const childRegister = register && !(workspace && (entry.name === 'apps' || entry.name === 'packages'));
      walk(path.join(dir, entry.name), depth + 1, childRegister);
    }

    if (!detection && register && depth <= 3 && subDirs.length === 0 && hasAnyMd(dir)) {
      skip(dir, 'docs', 'docs-only');
    }
  };

  for (const root of config.roots) {
    try {
      if (!fs.statSync(root).isDirectory()) {
        errors.push(`${root}: 不是目录`);
        continue;
      }
      walk(root, 0, true);
    } catch (error) {
      errors.push(`${root}: ${String((error as Error)?.message ?? error)}`);
    }
  }

  const byPath = new Map<string, Project>();
  for (const project of projects) {
    if (!byPath.has(project.path)) byPath.set(project.path, project);
  }
  const unique = [...byPath.values()];

  // 同名项目用父目录区分，避免卡片上出现两个 "client"
  const nameCount = new Map<string, number>();
  for (const project of unique) nameCount.set(project.name, (nameCount.get(project.name) ?? 0) + 1);
  for (const project of unique) {
    if ((nameCount.get(project.name) ?? 0) > 1) {
      project.name = `${path.basename(path.dirname(project.path))}/${project.name}`;
    }
  }

  // 端口通不算数，得是这个项目的进程在监听才算 running
  const listeners = listeningPorts();
  if (listeners.size) {
    for (const project of unique) {
      for (const port of project.ports) {
        const pid = listeners.get(port.port);
        if (!pid) continue;
        port.open = true;
        port.owner = processCwd(pid);
      }
    }
  } else {
    await Promise.all(unique.map(async (project) => probePorts(project.ports)));
  }

  for (const project of unique) {
    if (project.ports.length === 0) {
      // 有启动命令但没探测到端口的服务，应该是「已停止」而不是「无需启动」
      project.status = project.entry ? 'stopped' : 'n/a';
      continue;
    }
    const owned = project.ports.some((port) => port.open && belongsTo(project.path, port.owner));
    const unknownOwner = project.ports.some((port) => port.open && !port.owner);
    project.status = owned || unknownOwner ? 'running' : 'stopped';
  }

  unique.sort((a, b) => {
    if (a.status === 'running' && b.status !== 'running') return -1;
    if (b.status === 'running' && a.status !== 'running') return 1;
    if (a.createdAt !== b.createdAt) return b.createdAt.localeCompare(a.createdAt);
    return a.name.localeCompare(b.name, 'zh-CN');
  });

  return {
    projects: unique,
    roots: config.roots,
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    scannedDirs,
    maxDepth: config.maxDepth,
    ignore: config.ignore,
    skipped,
    errors,
  };
}

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { loadConfig } from './config.js';
import { ProcessManager } from './pm.js';
import { scanProjects } from './scanner.js';
import type { Project, ScanResult } from './types.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');

function openBrowser(url: string) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  execFile(cmd, [url], () => {});
}

function decorate(project: Project, pm: ProcessManager): Project {
  const runtime = pm.get(project.id);
  const managed = pm.isRunning(project.id);
  let status = project.status;
  if (managed) status = 'running';
  else if (runtime.status === 'error' && runtime.failure) status = 'error';
  // 端口还被本项目的进程监听着，就是真的在跑，不能因为"上次操作是停止"就报成已停止
  else if (project.status !== 'running' && runtime.failure) status = 'error';
  return {
    ...project,
    status,
    lastOperation: runtime.lastOperation,
    startedAt: runtime.startedAt,
    failure: runtime.failure,
    managed,
  };
}

const STATUS_ORDER: Record<string, number> = { running: 0, error: 1, stopped: 2 };

function sortProjects(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => {
    const rankA = STATUS_ORDER[a.status] ?? 3;
    const rankB = STATUS_ORDER[b.status] ?? 3;
    if (rankA !== rankB) return rankA - rankB;
    const aTime = a.lastOperation ?? '';
    const bTime = b.lastOperation ?? '';
    if (aTime !== bTime) return bTime.localeCompare(aTime);
    if (a.createdAt !== b.createdAt) return b.createdAt.localeCompare(a.createdAt);
    return a.name.localeCompare(b.name, 'zh-CN');
  });
}

export async function start(argv: string[] = process.argv.slice(2)) {
  const config = loadConfig(argv);
  const app = Fastify({ logger: false });
  const pm = new ProcessManager();

  let cache: ScanResult | null = null;
  let scanning = false;

  const ensureScan = async (force = false): Promise<ScanResult> => {
    if (cache && !force) return cache;
    if (scanning && cache) return cache;
    scanning = true;
    try {
      cache = await scanProjects(config);
      return cache;
    } finally {
      scanning = false;
    }
  };

  const withRuntime = async (force = false): Promise<ScanResult> => {
    const result = await ensureScan(force);
    return { ...result, projects: sortProjects(result.projects.map((project) => decorate(project, pm))) };
  };

  app.get('/api/health', async () => ({ ok: true, version: '0.0.2' }));

  app.get('/api/config', async () => ({
    roots: config.roots,
    port: config.port,
    host: config.host,
    maxDepth: config.maxDepth,
    includeNonRunnable: config.includeNonRunnable,
    configPath: config.configPath,
  }));

  app.get('/api/projects', async () => withRuntime());

  app.post('/api/scan', async () => withRuntime(true));

  app.get('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await ensureScan();
    const found = result.projects.find((item) => item.id === id);
    if (!found) return reply.code(404).send({ error: 'project not found' });
    const project = decorate(found, pm);

    let readme = '';
    if (project.readmeFile) {
      try {
        readme = fs.readFileSync(path.join(project.path, project.readmeFile), 'utf8').slice(0, 300_000);
      } catch {}
    }
    return { project, readme, runtime: pm.get(id) };
  });

  app.post('/api/projects/:id/start', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await ensureScan();
    const project = result.projects.find((item) => item.id === id);
    if (!project) return reply.code(404).send({ ok: false, error: 'project not found' });
    try {
      return await pm.start(project);
    } catch (error) {
      return reply.code(400).send({ ok: false, error: String((error as Error)?.message ?? error) });
    }
  });

  app.post('/api/projects/:id/install', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await ensureScan();
    const project = result.projects.find((item) => item.id === id);
    if (!project) return reply.code(404).send({ ok: false, error: 'project not found' });
    try {
      return await pm.install(project);
    } catch (error) {
      return reply.code(400).send({ ok: false, error: String((error as Error)?.message ?? error) });
    }
  });

  app.post('/api/projects/:id/stop', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await ensureScan();
    if (!result.projects.some((item) => item.id === id)) {
      return reply.code(404).send({ ok: false, error: 'project not found' });
    }
    return { ok: true, runtime: pm.stop(id) };
  });

  app.post('/api/projects/:id/restart', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await ensureScan();
    const project = result.projects.find((item) => item.id === id);
    if (!project) return reply.code(404).send({ ok: false, error: 'project not found' });
    try {
      return await pm.restart(project);
    } catch (error) {
      return reply.code(400).send({ ok: false, error: String((error as Error)?.message ?? error) });
    }
  });

  app.get('/api/projects/:id/logs', async (request) => {
    const { id } = request.params as { id: string };
    const lines = Number((request.query as { lines?: string }).lines ?? 800);
    return { id, lines: pm.readLogs(id, Number.isFinite(lines) ? lines : 800), runtime: pm.get(id) };
  });

  app.get('/api/projects/:id/logs/stream', (request, reply) => {
    const { id } = request.params as { id: string };
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write(': connected\n\n');

    const listener = (projectId: string, chunk: string) => {
      if (projectId !== id) return;
      try {
        reply.raw.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      } catch {}
    };
    pm.on('log', listener);

    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(': ping\n\n');
      } catch {}
    }, 15000);
    heartbeat.unref?.();

    request.raw.on('close', () => {
      clearInterval(heartbeat);
      pm.off('log', listener);
    });

    return reply;
  });

  app.get('/api/runtime', async () => ({ runtimes: pm.list() }));

  const webDir = path.join(ROOT, 'dist/web');
  if (fs.existsSync(webDir)) {
    await app.register(fastifyStatic, { root: webDir, prefix: '/' });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api')) return reply.code(404).send({ error: 'not found' });
      return reply.sendFile('index.html');
    });
  }

  const url = `http://${config.host}:${config.port}`;
  await app.listen({ port: config.port, host: config.host });

  const result = await withRuntime();
  console.log(`\n  ProjectDeck  ${url}`);
  console.log(`  收录 ${result.projects.length} 个可运行项目（扫描 ${result.durationMs}ms，过滤 ${result.skipped.length} 个）`);
  console.log(`  根目录 ${config.roots.join(', ')}\n`);

  if (config.openBrowser) openBrowser(url);

  const close = async () => {
    pm.shutdown();
    await new Promise((resolve) => setTimeout(resolve, 150));
    await app.close();
  };

  const shutdown = () => {
    close().finally(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  return { app, url, close };
}

const isDirect = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (!process.env.PROJECTDECK_NO_AUTOSTART && isDirect) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { loadConfig, readStablePorts, saveStablePort, writeStablePorts } from './config.js';
import { ProcessManager } from './pm.js';
import { belongsTo, isPortOpen, listeningPorts, processCwd } from './ports.js';
import { PortProxy } from './proxy.js';
import {
  projectListeners,
  refreshObservedPorts,
  scanProjects,
  type OwnedListener,
  type ScanProgress,
} from './scanner.js';
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
  let inflight: Promise<ScanResult> | null = null;
  const progressSubscribers = new Set<(progress: ScanProgress) => void>();

  /** 同一时间只跑一次扫描，所有订阅者共享进度 */
  const runScan = (): Promise<ScanResult> => {
    if (inflight) return inflight;
    inflight = scanProjects(config, (progress) => {
      for (const subscriber of progressSubscribers) subscriber(progress);
    })
      .then((result) => {
        cache = result;
        return result;
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  };

  const ensureScan = async (force = false): Promise<ScanResult> => {
    if (cache && !force) return cache;
    if (inflight) return inflight;
    return runScan();
  };

  /**
   * 固定端口的转发目标：优先用配置里指定的 target，其次用项目自己声明的端口，
   * 最后兜底用「任何 cwd 属于这个项目」的监听端口。每次连接都现查，端口变了也能跟上。
   */
  const resolveTarget = (projectId: string, preferred?: number): number | undefined => {
    const project = cache?.projects.find((item) => item.id === projectId);
    const stable = config.stablePorts[projectId]?.port;

    const listeners = listeningPorts();
    if (!listeners.size) return preferred;
    const owned = new Set<number>();
    for (const [port, pid] of listeners) {
      if (port === stable) continue;
      const cwd = processCwd(pid);
      if (cwd && project && belongsTo(project.path, cwd)) owned.add(port);
    }

    if (preferred && owned.has(preferred)) return preferred;
    for (const item of project?.ports ?? []) {
      if (owned.has(item.port)) return item.port;
    }
    return [...owned][0];
  };

  const proxy = new PortProxy((projectId) => resolveTarget(projectId, config.stablePorts[projectId]?.target));

  /** 固定端口由 ProjectDeck 自己监听，不能算进任何项目 */
  const stablePortSet = () => new Set(Object.values(config.stablePorts).map((value) => value.port));

  /** 固定端口池：9100-9199，跳过已被别的项目占用、或本机正在监听的端口 */
  const allocateStablePort = async (exceptId: string): Promise<number | undefined> => {
    const taken = new Set(
      Object.entries(config.stablePorts)
        .filter(([projectId]) => projectId !== exceptId)
        .map(([, value]) => value.port),
    );
    for (let port = 9100; port <= 9199; port++) {
      if (taken.has(port)) continue;
      if (await isPortOpen(port)) continue;
      return port;
    }
    return undefined;
  };

  /**
   * 项目目录搬家后 id 会变（id = sha1(路径)）。配置里冗余存了 path，
   * 扫描时按 path 认回来，映射不会丢。
   */
  const syncStablePorts = (projects: Project[]): void => {
    const stored = readStablePorts(config.configPath);
    let changed = false;
    for (const [projectId, value] of Object.entries(stored)) {
      if (projects.some((project) => project.id === projectId)) continue;
      const moved = value.path ? projects.find((project) => project.path === value.path) : undefined;
      if (!moved || stored[moved.id]) continue;
      stored[moved.id] = value;
      delete stored[projectId];
      changed = true;
    }
    if (!changed) return;
    config.stablePorts = stored;
    writeStablePorts(config.configPath, stored);
  };

  const withStablePort = (project: Project): Project => {
    const stable = config.stablePorts[project.id];
    if (!stable) return project;
    return {
      ...project,
      stablePort: {
        port: stable.port,
        // 项目没启动时也要显示钉住的目标，不然看起来像没配置
        target: resolveTarget(project.id, stable.target) ?? stable.target,
        listening: proxy.isListening(project.id),
      },
    };
  };

  /**
   * 停止后等一小会儿再查一次：进程组里跑掉的、detached 的孙进程，
   * 只要 cwd 还在这个项目里，就一并回收，保证端口真的释放。
   */
  const sweepProjectListeners = async (project: Project): Promise<OwnedListener[]> => {
    const projects = cache?.projects ?? [];
    const deadline = Date.now() + 3000;
    let alive = projectListeners(projects, project.id, process.pid, stablePortSet());
    while (alive.length && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      alive = projectListeners(projects, project.id, process.pid, stablePortSet());
    }
    if (alive.length) {
      await pm.reclaim(project.id, alive);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return alive;
  };

  const withRuntime = async (force = false): Promise<ScanResult> => {
    const result = await ensureScan(force);
    syncStablePorts(result.projects);
    // 端口状态每次都现场刷新，启动/停止后不用重新扫描整个目录
    refreshObservedPorts(result.projects, stablePortSet());
    return {
      ...result,
      projects: sortProjects(result.projects.map((project) => withStablePort(decorate(project, pm)))),
    };
  };

  app.get('/api/health', async () => ({ ok: true, version: '0.1.0' }));

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

  // 扫描进度：边扫边推，前端弹窗里实时显示目录数、收录数和最近发现的项目
  app.get('/api/scan/stream', (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write(': connected\n\n');

    const send = (event: string, data: unknown) => {
      try {
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      } catch {}
    };
    const subscriber = (progress: ScanProgress) => send('progress', progress);
    progressSubscribers.add(subscriber);

    void (async () => {
      try {
        await runScan();
        send('done', await withRuntime(false));
      } catch (error) {
        send('error', { message: String((error as Error)?.message ?? error) });
      } finally {
        progressSubscribers.delete(subscriber);
        try {
          reply.raw.end();
        } catch {}
      }
    })();

    request.raw.on('close', () => progressSubscribers.delete(subscriber));
  });

  app.get('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await ensureScan();
    refreshObservedPorts(result.projects, stablePortSet());
    const found = result.projects.find((item) => item.id === id);
    if (!found) return reply.code(404).send({ error: 'project not found' });
    const project = withStablePort(decorate(found, pm));

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
      // 启动前把这个项目遗留的所有监听（不只声明端口）先回收掉
      return await pm.start(project, projectListeners(result.projects, project.id, process.pid, stablePortSet()));
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
    const project = result.projects.find((item) => item.id === id);
    if (!project) return reply.code(404).send({ ok: false, error: 'project not found' });

    pm.stop(id);
    const swept = await sweepProjectListeners(project);
    return { ok: true, runtime: pm.get(id), reclaimedPorts: swept.map((item) => item.port) };
  });

  app.post('/api/projects/:id/restart', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await ensureScan();
    const project = result.projects.find((item) => item.id === id);
    if (!project) return reply.code(404).send({ ok: false, error: 'project not found' });
    try {
      return await pm.restart(project, projectListeners(result.projects, project.id, process.pid, stablePortSet()));
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

  app.put('/api/projects/:id/stable-port', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { port?: number | 'auto' | null; target?: number | null };
    const result = await ensureScan();
    const project = result.projects.find((item) => item.id === id);
    if (!project) return reply.code(404).send({ ok: false, error: 'project not found' });

    if (body.port === null) {
      proxy.close(id);
      delete config.stablePorts[id];
      saveStablePort(config.configPath, id, null);
      return { ok: true };
    }

    let port: number | undefined;
    if (body.port === 'auto' || body.port === undefined) {
      port = await allocateStablePort(id);
      if (!port) return reply.code(409).send({ ok: false, error: 'no free stable port in 9100-9199' });
    } else {
      port = Number(body.port);
      if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        return reply.code(400).send({ ok: false, error: 'invalid port' });
      }
      const taken = Object.entries(config.stablePorts).some(
        ([projectId, value]) => projectId !== id && value.port === port,
      );
      if (taken) return reply.code(409).send({ ok: false, error: 'stable port already assigned' });
    }

    try {
      await proxy.listen(id, port);
    } catch {
      return reply.code(409).send({ ok: false, error: 'stable port is not available' });
    }

    const target = body.target == null ? undefined : Number(body.target);
    config.stablePorts[id] = {
      port,
      ...(target ? { target } : {}),
      name: project.name,
      path: project.path,
    };
    saveStablePort(config.configPath, id, config.stablePorts[id]);
    return {
      ok: true,
      stablePort: { port, target: resolveTarget(id, target), listening: true },
    };
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

  for (const [id, stable] of Object.entries(config.stablePorts)) {
    try {
      await proxy.listen(id, stable.port);
    } catch (error) {
      console.warn(`[projectdeck] 固定端口 :${stable.port} 启动失败：${String((error as Error)?.message ?? error)}`);
    }
  }

  const result = await withRuntime();
  console.log(`\n  ProjectDeck  ${url}`);
  console.log(`  收录 ${result.projects.length} 个可运行项目（扫描 ${result.durationMs}ms，过滤 ${result.skipped.length} 个）`);
  console.log(`  根目录 ${config.roots.join(', ')}\n`);

  if (config.openBrowser) openBrowser(url);

  const close = async () => {
    proxy.closeAll();
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

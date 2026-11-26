import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { isPortOpen } from '../../src/server/ports.js';
import { api, freePort, startDeck, waitFor, type Deck } from '../helpers/deck.js';

interface ApiProject {
  id: string;
  name: string;
  status: string;
  entry?: { cmd: string; args: string[] };
  ports: { port: number; source: string }[];
  dependencies: { manager: string; hasManifest: boolean; installed: boolean };
  failure?: { code: string; line: string };
  managed?: boolean;
}

interface ScanPayload {
  projects: ApiProject[];
  skipped: { name: string; reason: string }[];
}

interface ActionResult {
  ok: boolean;
  runtime: { status: string; pid?: number; kind?: 'run' | 'install' };
  failure?: { code: string; line: string };
}

function readPid(file: string): number | undefined {
  try {
    return Number(fs.readFileSync(file, 'utf8').trim());
  } catch {
    return undefined;
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe('ProjectDeck API', () => {
  let deck: Deck;
  let projects: ApiProject[];
  let fixedPort = 0;
  const spawned: number[] = [];

  const killSpawned = () => {
    for (const pid of spawned.splice(0)) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {}
    }
  };

  const find = (name: string) => projects.find((project) => project.name === name);
  const rescan = async () => {
    const payload = await api<ScanPayload>(deck.base, '/api/projects');
    projects = payload.projects;
    return payload;
  };

  before(async () => {
    fixedPort = await freePort();
    deck = await startDeck({ fixedPort });
    await rescan();
  });

  after(async () => {
    killSpawned();
    await deck.close();
  });

  it('indexes only runnable projects and explains what was filtered', async () => {
    const payload = await rescan();
    const names = payload.projects.map((project) => project.name);

    assert.ok(names.includes('service'), 'runnable fixture should be indexed');
    assert.ok(names.includes('missing-deps'), 'fixture with a start script should be indexed');
    assert.ok(!names.includes('docs-only'), 'docs-only folder must not be indexed');
    assert.ok(!names.includes('package-only'), 'package without a start script must not be indexed');

    assert.equal(payload.skipped.find((item) => item.name === 'docs-only')?.reason, 'docs-only');
    assert.equal(payload.skipped.find((item) => item.name === 'package-only')?.reason, 'no-entry');
  });

  it('detects start command and dependency state', () => {
    const service = find('service');
    assert.ok(service);
    assert.deepEqual(service.entry?.args, ['run', 'dev']);
    assert.equal(service.dependencies.hasManifest, true);
    assert.equal(service.dependencies.installed, true, 'no deps declared, so nothing to install');

    const missing = find('missing-deps');
    assert.ok(missing);
    assert.equal(missing.dependencies.installed, false, 'declared deps without node_modules');
    assert.equal(missing.dependencies.manager, 'npm');
  });

  it('returns 404 for an unknown project', async () => {
    const response = await fetch(`${deck.base}/api/projects/nope/start`, { method: 'POST' });
    assert.equal(response.status, 404);
  });

  it('starts, streams live logs over SSE, reports running, then stops the whole process group', async () => {
    const service = find('service');
    assert.ok(service);

    const started = await api<ActionResult>(deck.base, `/api/projects/${service.id}/start`, { method: 'POST' });
    assert.equal(started.ok, true, `start should succeed: ${JSON.stringify(started.failure)}`);
    assert.equal(started.runtime.status, 'running');

    const pidFile = path.join(deck.root, 'service', 'server.pid');
    const childPid = await waitFor(() => readPid(pidFile), { label: 'fixture pid file' });

    const logs = await waitFor(
      async () => {
        const payload = await api<{ lines: string }>(deck.base, `/api/projects/${service.id}/logs`);
        return payload.lines.includes('fixture-service ready on') ? payload.lines : undefined;
      },
      { label: 'fixture startup log' },
    );
    const port = Number(logs.match(/127\.0\.0\.1:(\d+)/)?.[1]);
    assert.ok(port > 0, 'fixture should print its port');

    // SSE 必须在触发器之前连上，否则拿不到实时 chunk
    const controller = new AbortController();
    const stream = await fetch(`${deck.base}/api/projects/${service.id}/logs/stream`, {
      signal: controller.signal,
      headers: { Accept: 'text/event-stream' },
    });
    assert.equal(stream.status, 200);
    assert.match(stream.headers.get('content-type') ?? '', /text\/event-stream/);

    const reader = stream.body!.getReader();
    const decoder = new TextDecoder();
    const live = (async () => {
      let text = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return text;
        text += decoder.decode(value, { stream: true });
        if (text.includes('fixture emit marker')) return text;
      }
    })();

    await new Promise((resolve) => setTimeout(resolve, 300));
    await fetch(`http://127.0.0.1:${port}/emit`);

    const received = await Promise.race([
      live,
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('SSE timed out')), 8000)),
    ]);
    assert.match(received, /fixture emit marker/);
    controller.abort();

    const running = (await rescan()).projects.find((project) => project.id === service.id);
    assert.equal(running?.status, 'running');
    assert.equal(running?.managed, true, 'a started project must be reported as managed so the terminal works');

    const stopped = await api<ActionResult>(deck.base, `/api/projects/${service.id}/stop`, { method: 'POST' });
    assert.equal(stopped.runtime.status, 'stopped');

    await waitFor(() => !isAlive(childPid), { label: 'child process exit' });
    await assert.rejects(fetch(`http://127.0.0.1:${port}/`), 'port should be closed after stop');

    // 主动停止不是失败：SIGTERM/143 不能被记成启动错误
    const afterStop = (await rescan()).projects.find((project) => project.id === service.id);
    assert.equal(afterStop?.status, 'stopped');
    assert.equal(afterStop?.failure, undefined);
  });

  it('reaps a stale process of the same project holding its port, but never a foreign one', async () => {
    const fixed = find('fixed-port');
    assert.ok(fixed);
    assert.equal(fixed.ports.some((port) => port.port === fixedPort), true);

    // 模拟「上次没退干净」：进程工作目录就在这个项目里
    const stale = spawn('node', ['server.js', '--port', String(fixedPort)], {
      cwd: path.join(deck.root, 'fixed-port'),
      stdio: 'ignore',
    });
    if (stale.pid) spawned.push(stale.pid);
    await waitFor(() => (stale.pid && isAlive(stale.pid) ? true : undefined), { label: 'stale listener' });
    await waitFor(async () => ((await isPortOpen(fixedPort)) ? true : undefined), { label: 'stale port open' });

    const started = await api<ActionResult>(deck.base, `/api/projects/${fixed.id}/start`, { method: 'POST' });
    assert.equal(started.ok, true, `start should reclaim the port: ${JSON.stringify(started.failure)}`);
    await waitFor(() => (stale.pid && !isAlive(stale.pid) ? true : undefined), { label: 'stale process killed' });

    const logs = await api<{ lines: string }>(deck.base, `/api/projects/${fixed.id}/logs`);
    assert.match(logs.lines, /残留进程/);

    await api<ActionResult>(deck.base, `/api/projects/${fixed.id}/stop`, { method: 'POST' });
    await waitFor(async () => ((await isPortOpen(fixedPort)) ? undefined : true), { label: 'port released' });

    // 外部进程占着同一个端口：只报错，绝不能误杀
    const foreign = spawn(
      'node',
      ['-e', `require("node:http").createServer((_,r)=>r.end("x")).listen(${fixedPort},"127.0.0.1")`],
      { cwd: os.tmpdir(), stdio: 'ignore' },
    );
    if (foreign.pid) spawned.push(foreign.pid);
    await waitFor(async () => ((await isPortOpen(fixedPort)) ? true : undefined), { label: 'foreign listener' });

    const blocked = await api<ActionResult>(deck.base, `/api/projects/${fixed.id}/start`, { method: 'POST' });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.failure?.code, 'port-in-use');
    assert.equal(Boolean(foreign.pid && isAlive(foreign.pid)), true, 'a foreign process must not be killed');

    foreign.kill('SIGKILL');
    await waitFor(() => (foreign.pid && !isAlive(foreign.pid) ? true : undefined), { label: 'foreign exited' });
  });

  it('reports a failure when the start command crashes', async () => {
    const broken = find('broken');
    assert.ok(broken);

    const result = await api<ActionResult>(deck.base, `/api/projects/${broken.id}/start`, { method: 'POST' });
    assert.equal(result.ok, false);
    assert.ok(result.failure, 'failure should explain why it did not start');
    assert.equal(result.failure.code, 'missing-deps', `unexpected code: ${JSON.stringify(result.failure)}`);

    const payload = await rescan();
    const updated = payload.projects.find((project) => project.id === broken.id);
    assert.ok(updated?.failure, 'failure must survive into the project list');
  });

  it('can install dependencies and keeps the output in the log', async () => {
    const missing = find('missing-deps');
    assert.ok(missing);

    const result = await api<ActionResult>(deck.base, `/api/projects/${missing.id}/install`, { method: 'POST' });
    // 离线环境里 npm install 可能失败，但日志必须记录执行过的命令
    const logs = await api<{ lines: string }>(deck.base, `/api/projects/${missing.id}/logs`);
    assert.match(logs.lines, /npm install/);
    assert.equal(result.runtime.kind, 'install');
  });
});

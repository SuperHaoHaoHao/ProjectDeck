import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');

export interface Deck {
  base: string;
  port: number;
  home: string;
  root: string;
  close: () => Promise<void>;
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

export async function waitFor<T>(
  check: () => Promise<T | undefined | false> | T | undefined | false,
  { timeout = 15_000, interval = 200, label = 'condition' } = {},
): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value as T;
    if (Date.now() - started > timeout) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

/**
 * 起一个隔离的 ProjectDeck：独立的 ~/.projectdeck（PROJECTDECK_HOME）、
 * 独立的 fixture 根目录、随机端口。测试之间不会互相污染。
 */
export async function startDeck(options: { fixedPort?: number } = {}): Promise<Deck> {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'projectdeck-home-'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'projectdeck-root-'));

  for (const entry of fs.readdirSync(FIXTURES, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    fs.cpSync(path.join(FIXTURES, entry.name), path.join(root, entry.name), { recursive: true });
  }

  // fixed-port fixture 用随机端口，避免上一次测试残留的监听影响这一次
  if (options.fixedPort) {
    const pkgFile = path.join(root, 'fixed-port', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8')) as { scripts: Record<string, string> };
    pkg.scripts.dev = `node server.js --port ${options.fixedPort}`;
    fs.writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);
  }

  process.env.PROJECTDECK_HOME = home;
  const port = await freePort();

  const { start } = await import('../../src/server/main.js');
  const deck = await start(['--root', root, '--port', String(port), '--no-open']);

  return {
    base: `http://127.0.0.1:${port}`,
    port,
    home,
    root,
    async close() {
      await deck.close();
      fs.rmSync(home, { recursive: true, force: true });
      fs.rmSync(root, { recursive: true, force: true });
      delete process.env.PROJECTDECK_HOME;
    },
  };
}

export async function api<T>(base: string, pathname: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${pathname}`, init);
  const body = (await response.json()) as T;
  return body;
}

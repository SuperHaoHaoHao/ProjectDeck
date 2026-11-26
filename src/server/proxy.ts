import net from 'node:net';

function connectHost(port: number, host: string, timeout = 1200): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ port, host });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`timeout connecting to ${host}:${port}`));
    }, timeout);
    timer.unref?.();
    socket.once('connect', () => {
      clearTimeout(timer);
      socket.off('error', reject);
      resolve(socket);
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      socket.destroy();
      reject(error);
    });
  });
}

/** 依次尝试 IPv4 / IPv6，谁先连上就用谁 */
async function connectAny(port: number): Promise<net.Socket | undefined> {
  for (const host of ['127.0.0.1', '::1', 'localhost']) {
    try {
      return await connectHost(port, host);
    } catch {}
  }
  return undefined;
}

/**
 * 稳定端口：ProjectDeck 自己监听一个固定端口，把连接转发到项目「当前真正在监听的端口」。
 *
 * 这样 frpc / 反向代理只需要指向固定端口，项目在 5173、5174、8366 之间怎么跳都不用改。
 * 目标端口是在每次连接进来时现查的，所以重启后换了端口也不影响。
 */
export class PortProxy {
  private servers = new Map<string, { server: net.Server; port: number }>();

  constructor(private readonly resolveTarget: (projectId: string) => number | undefined) {}

  async listen(projectId: string, port: number): Promise<void> {
    if (this.servers.has(projectId)) this.close(projectId);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      throw new Error('invalid stable port');
    }

    const server = net.createServer(async (socket) => {
      const target = this.resolveTarget(projectId);
      if (!target || target === port) {
        socket.destroy();
        return;
      }

      // Vite 在 macOS 上常用 localhost，只监听 ::1；必须 IPv4/IPv6 都试
      socket.pause();
      const upstream = await connectAny(target);
      if (!upstream || socket.destroyed) {
        upstream?.destroy();
        socket.destroy();
        return;
      }

      const teardown = () => {
        socket.destroy();
        upstream.destroy();
      };
      socket.on('error', teardown);
      upstream.on('error', teardown);
      socket.on('close', teardown);
      upstream.pipe(socket);
      socket.pipe(upstream);
      socket.resume();
    });

    server.on('error', () => {
      this.servers.delete(projectId);
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });

    this.servers.set(projectId, { server, port });
  }

  close(projectId: string) {
    const entry = this.servers.get(projectId);
    if (!entry) return;
    entry.server.close();
    this.servers.delete(projectId);
  }

  portOf(projectId: string): number | undefined {
    return this.servers.get(projectId)?.port;
  }

  isListening(projectId: string): boolean {
    return this.servers.has(projectId);
  }

  closeAll() {
    for (const id of [...this.servers.keys()]) this.close(id);
  }
}

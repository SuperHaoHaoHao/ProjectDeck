import net from 'node:net';

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

    const server = net.createServer((socket) => {
      const target = this.resolveTarget(projectId);
      if (!target || target === port) {
        socket.destroy();
        return;
      }
      const upstream = net.connect({ port: target, host: '127.0.0.1' });
      const teardown = () => {
        socket.destroy();
        upstream.destroy();
      };
      socket.on('error', teardown);
      upstream.on('error', teardown);
      socket.on('close', teardown);
      upstream.pipe(socket);
      socket.pipe(upstream);
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

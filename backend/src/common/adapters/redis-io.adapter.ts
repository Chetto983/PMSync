import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { INestApplication, Logger } from '@nestjs/common';
import { getRedisConnectionOptions } from '../../config/configuration';

/**
 * Redis-backed Socket.IO adapter for horizontal scaling.
 *
 * Uses @socket.io/redis-adapter so that WebSocket events emitted on any
 * backend instance are propagated to clients connected to other instances
 * via Redis pub/sub.
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter> | undefined;
  private pubClient: Redis | undefined;
  private subClient: Redis | undefined;
  private readonly logger = new Logger(RedisIoAdapter.name);

  constructor(app: INestApplication) {
    super(app);
  }

  /**
   * Create dedicated pub/sub Redis clients and build the adapter constructor.
   * Must be called before app.listen().
   */
  async connectToRedis(): Promise<void> {
    const opts = getRedisConnectionOptions();

    this.pubClient = new Redis({
      ...opts,
      connectionName: 'ws-pub',
      lazyConnect: false,
    });

    this.subClient = this.pubClient.duplicate({
      connectionName: 'ws-sub',
    });

    // Wait for both connections to be ready
    await Promise.all([
      this.waitForReady(this.pubClient, 'ws-pub'),
      this.waitForReady(this.subClient, 'ws-sub'),
    ]);

    this.adapterConstructor = createAdapter(this.pubClient, this.subClient);
    this.logger.log('Redis IO adapter connected (pub/sub clients ready)');
  }

  createIOServer(port: number, options?: Partial<ServerOptions>) {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }

  /**
   * Disconnect pub/sub clients on shutdown.
   */
  async close(): Promise<void> {
    await Promise.allSettled([
      this.pubClient?.quit(),
      this.subClient?.quit(),
    ]);
    this.logger.log('Redis IO adapter disconnected');
  }

  private waitForReady(client: Redis, name: string): Promise<void> {
    if (client.status === 'ready') return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Redis client '${name}' connection timed out after 10s`));
      }, 10_000);

      client.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });
      client.once('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }
}

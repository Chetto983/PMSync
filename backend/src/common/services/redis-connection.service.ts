import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';
import { getRedisConnectionOptions } from '../../config/configuration';

/**
 * Shared Redis connection for non-BullMQ services.
 *
 * Provides a single ioredis instance shared across:
 * - Rate limiters, locks, caches, OTP, TOTP, WebAuthn, contacts cache, triage learning
 * - Replaces 8+ independent `new Redis()` calls with 1 shared connection
 *
 * BullMQ queues/workers use their own connection via queue.config.ts
 * (BullMQ requires dedicated connections for blocking commands like BRPOPLPUSH).
 *
 * QueryEmbeddingCacheService is intentionally excluded: it may use a separate
 * Redis DB (REDIS_QUERY_CACHE_DB) and is not safe to share this connection.
 */
@Injectable()
export class RedisConnectionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisConnectionService.name);
  private _client!: Redis;

  get client(): Redis {
    return this._client;
  }

  async onModuleInit() {
    const options = getRedisConnectionOptions();
    this._client = new Redis({
      ...options,
      lazyConnect: false,
      connectionName: 'shared-service',
      maxRetriesPerRequest: 3,
    });

    this._client.on('error', (err) => {
      this.logger.error(`Redis shared connection error: ${err.message}`);
    });

    this._client.on('connect', () => {
      this.logger.log('Redis shared connection established');
    });
  }

  async onModuleDestroy() {
    if (this._client) {
      await this._client.quit().catch(() => {
        // Ignore quit errors during shutdown
      });
    }
  }
}

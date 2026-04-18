/**
 * Redis Connection Singletons for BullMQ
 *
 * Extracted from queue.config.ts to keep that file under the 500-line
 * CLAUDE.md hard limit. This module owns the shared ioredis instances
 * used by BullMQ producers (Queue) and consumers (Worker).
 *
 * Two distinct singletons:
 * - getSharedRedisConnection(): Producer/Queue connection with
 *   enableOfflineQueue: false (fail-fast when Redis is down, per D-14).
 * - getSharedWorkerConnection(): Worker connection with
 *   maxRetriesPerRequest: null and lazyConnect: false (required by
 *   BullMQ for blocking BRPOPLPUSH + duplicate() semantics).
 *
 * Both use ref-counted singleton pattern so services can init/destroy
 * independently without tearing down the shared connection prematurely.
 */
import { Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { getRedisConnectionOptions } from '../../config/configuration';

const logger = new Logger('RedisConnections');

// ─── Shared Queue/Producer Connection ──────────────────────────
let sharedRedisConnection: Redis | null = null;
let connectionRefCount = 0;

/**
 * Get or create the shared Redis connection for BullMQ producers.
 * This connection is shared across all BullMQ Queue instances.
 *
 * D-14: enableOfflineQueue is `false` so Queue.add() fails fast when
 * Redis is down instead of silently buffering (which would give callers
 * a false impression of success).
 *
 * @returns Shared ioredis connection instance
 */
export function getSharedRedisConnection(): Redis {
  if (!sharedRedisConnection) {
    const options = getRedisConnectionOptions();
    sharedRedisConnection = new Redis({
      ...options,
      lazyConnect: true, // Lazy connect - don't block app startup
      enableOfflineQueue: false, // D-14: fail fast for producers when Redis is down
      connectionName: 'bullmq-shared',
    });

    sharedRedisConnection.on('error', (err) => {
      logger.error(`Redis connection error: ${err.message}`);
    });

    sharedRedisConnection.on('connect', () => {
      logger.log('Redis connected');
    });
  }
  connectionRefCount++;
  return sharedRedisConnection;
}

/**
 * Release a reference to the shared producer connection.
 * Call this in onModuleDestroy to properly clean up.
 */
export function releaseSharedRedisConnection(): void {
  connectionRefCount--;
  // Only close when all references are released
  if (connectionRefCount <= 0 && sharedRedisConnection) {
    sharedRedisConnection.quit().catch(() => {
      // Ignore quit errors during shutdown
    });
    sharedRedisConnection = null;
    connectionRefCount = 0;
  }
}

/**
 * Force close the shared producer connection (for testing/emergency).
 */
export function forceCloseSharedRedisConnection(): void {
  if (sharedRedisConnection) {
    sharedRedisConnection.disconnect();
    sharedRedisConnection = null;
    connectionRefCount = 0;
  }
}

// ─── Shared Worker Connection ──────────────────────────────────
/**
 * Workers require `maxRetriesPerRequest: null` for blocking BRPOPLPUSH
 * operations (BullMQ docs, Pattern 2 in 146-RESEARCH.md).
 *
 * Workers require `lazyConnect: false` because BullMQ internally calls
 * `connection.duplicate()` to create a blocking client. Duplicates
 * inherit lazyConnect, which causes silent connection failures
 * (workers start without errors but never process jobs).
 *
 * BullMQ duplicate behavior: Each Worker internally calls
 * `connection.duplicate()`. With a shared base, we get 1 base + N
 * duplicates (one per worker) instead of N bases + N duplicates.
 *
 * D-14: enableOfflineQueue is `true` (default) so workers wait for
 * Redis reconnection instead of failing incoming commands.
 */
let sharedWorkerConnection: Redis | null = null;
let workerConnectionRefCount = 0;

/**
 * Get or create the shared Redis connection for BullMQ workers.
 * This connection is shared across all BullMQ Worker instances;
 * BullMQ duplicates it internally for blocking operations.
 *
 * @returns Shared ioredis connection instance for workers
 */
export function getSharedWorkerConnection(): Redis {
  if (!sharedWorkerConnection) {
    const options = getRedisConnectionOptions();
    sharedWorkerConnection = new Redis({
      ...options,
      maxRetriesPerRequest: null, // REQUIRED for BullMQ workers (blocking BRPOPLPUSH)
      lazyConnect: false, // REQUIRED - prevents duplicate() silent failures
      enableOfflineQueue: true, // D-14: workers wait for reconnection
      connectionName: 'bullmq-worker-shared',
    });

    sharedWorkerConnection.on('error', (err) => {
      logger.error(`Worker Redis connection error: ${err.message}`);
    });

    sharedWorkerConnection.on('connect', () => {
      logger.log('Worker Redis connected');
    });
  }
  workerConnectionRefCount++;
  return sharedWorkerConnection;
}

/**
 * Release a reference to the shared worker connection.
 * Call this in onModuleDestroy to properly clean up.
 */
export function releaseSharedWorkerConnection(): void {
  workerConnectionRefCount--;
  if (workerConnectionRefCount <= 0 && sharedWorkerConnection) {
    sharedWorkerConnection.quit().catch(() => {
      // Ignore quit errors during shutdown
    });
    sharedWorkerConnection = null;
    workerConnectionRefCount = 0;
  }
}

/**
 * Force close the shared worker connection (for testing/emergency).
 */
export function forceCloseSharedWorkerConnection(): void {
  if (sharedWorkerConnection) {
    sharedWorkerConnection.disconnect();
    sharedWorkerConnection = null;
    workerConnectionRefCount = 0;
  }
}

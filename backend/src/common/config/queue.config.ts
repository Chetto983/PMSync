/**
 * Centralized BullMQ Queue Configuration
 *
 * This module provides shared queue configurations and defaults
 * for all BullMQ queues in the application.
 *
 * Benefits:
 * - Consistent retry behavior across all queues
 * - Centralized backoff strategies
 * - Easy tuning of queue performance parameters
 * - Type-safe configuration
 */

import { JobsOptions, WorkerOptions, QueueOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { getRedisConnectionOptions, RedisConnectionOptions } from '../../config/configuration';

/**
 * Shared Redis connection singleton for BullMQ
 * Prevents connection sprawl by reusing a single ioredis instance
 * across all queue services.
 *
 * Use `getSharedRedisConnection()` in queue services instead of `new Redis()`
 */
let sharedRedisConnection: Redis | null = null;
let connectionRefCount = 0;

/**
 * Get or create the shared Redis connection for BullMQ
 * This connection is shared across all BullMQ queues and workers.
 *
 * @returns Shared ioredis connection instance
 */
export function getSharedRedisConnection(): Redis {
  if (!sharedRedisConnection) {
    const options = getRedisConnectionOptions();
    sharedRedisConnection = new Redis({
      ...options,
      lazyConnect: false, // Connect immediately
      // Connection name for debugging in Redis CLIENT LIST
      connectionName: 'bullmq-shared',
    });

    sharedRedisConnection.on('error', (err) => {
      // Always log errors - critical for production debugging
      console.error('[BullMQ-Shared] Redis connection error:', err.message);
    });

    // Only log connect in non-production (reduce noise in production logs)
    if (process.env.NODE_ENV !== 'production') {
      sharedRedisConnection.on('connect', () => {
        console.log('[BullMQ-Shared] Redis connected');
      });
    }
  }
  connectionRefCount++;
  return sharedRedisConnection;
}

/**
 * Release a reference to the shared connection
 * Call this in onModuleDestroy to properly clean up
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
 * Force close the shared connection (for testing/emergency)
 */
export function forceCloseSharedRedisConnection(): void {
  if (sharedRedisConnection) {
    sharedRedisConnection.disconnect();
    sharedRedisConnection = null;
    connectionRefCount = 0;
  }
}

/**
 * Queue priority levels
 */
export type QueuePriority = 'high' | 'normal' | 'low';

/**
 * Default job options by priority level
 */
export interface QueueJobDefaults {
  attempts: number;
  backoff: {
    type: 'exponential' | 'fixed';
    delay: number;
  };
  removeOnComplete: boolean | { count?: number; age?: number };
  removeOnFail: boolean | { count?: number };
}

/**
 * Queue configuration presets for different use cases
 */
export const QUEUE_PRESETS = {
  /**
   * High priority - user-facing operations
   * - More retries, shorter backoff
   * - Keep completed jobs for debugging
   */
  HIGH: {
    attempts: 5,
    backoff: {
      type: 'exponential' as const,
      delay: 2000, // 2s, 4s, 8s, 16s, 32s
    },
    removeOnComplete: { count: 100, age: 3600 }, // Keep last 100 or 1 hour
    removeOnFail: { count: 200 }, // Keep failed for analysis
  },

  /**
   * Normal priority - background operations
   * - Standard retries, moderate backoff
   */
  NORMAL: {
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 5000, // 5s, 10s, 20s
    },
    removeOnComplete: true,
    removeOnFail: { count: 100 },
  },

  /**
   * Low priority - bulk/batch operations
   * - Fewer retries, longer backoff
   */
  LOW: {
    attempts: 2,
    backoff: {
      type: 'exponential' as const,
      delay: 10000, // 10s, 20s
    },
    removeOnComplete: true,
    removeOnFail: true,
  },

  /**
   * AI/Embedding operations
   * - More retries for rate limit handling
   * - Longer backoff to respect API limits
   */
  AI_EMBEDDING: {
    attempts: 6,
    backoff: {
      type: 'exponential' as const,
      delay: 1000, // 1s, 2s, 4s, 8s, 16s, 32s
    },
    removeOnComplete: true,
    removeOnFail: { count: 1000 }, // Keep more failures for debugging
  },

  /**
   * Email sync operations
   * - Standard retries with moderate backoff
   */
  EMAIL_SYNC: {
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 5000,
    },
    removeOnComplete: { count: 50, age: 3600 },
    removeOnFail: { count: 100 },
  },

  /**
   * Folder operations
   * - Quick retries for provider-side operations
   */
  FOLDER_OPS: {
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 2000,
    },
    removeOnComplete: { count: 100, age: 3600 },
    removeOnFail: { count: 200 },
  },

  /**
   * Contacts sync operations
   * - Similar to email sync, moderate retries
   */
  CONTACTS_SYNC: {
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 5000, // 5s, 10s, 20s
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  },

  /**
   * Calendar sync operations
   * - Similar to contacts sync, moderate retries
   * - Calendar APIs are generally reliable
   */
  CALENDAR_SYNC: {
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 5000, // 5s, 10s, 20s
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  },

  /**
   * Scheduled/maintenance jobs (migrated from @Cron)
   * - Single attempt by default (don't spam maintenance ops)
   * - Short backoff to retry quickly if failed
   */
  SCHEDULED: {
    attempts: 1,
    backoff: {
      type: 'exponential' as const,
      delay: 1000,
    },
    removeOnComplete: { count: 10, age: 86400 }, // Keep 10 or 24h
    removeOnFail: { count: 50 },
  },
} as const;

/**
 * Get default job options for a queue preset
 */
export function getDefaultJobOptions(
  preset: keyof typeof QUEUE_PRESETS = 'NORMAL',
): JobsOptions {
  const config = QUEUE_PRESETS[preset];
  return {
    attempts: config.attempts,
    backoff: config.backoff,
    removeOnComplete: config.removeOnComplete,
    removeOnFail: config.removeOnFail,
  };
}

/**
 * Get queue options with Redis connection
 */
export function getQueueOptions(
  preset: keyof typeof QUEUE_PRESETS = 'NORMAL',
  _redisOptions?: RedisConnectionOptions,
): Partial<QueueOptions> {
  return {
    defaultJobOptions: getDefaultJobOptions(preset),
    // Note: connection should be passed separately when creating the queue
    // This returns only the non-connection options
  };
}

/**
 * Worker options defaults
 */
export interface WorkerOptionsConfig {
  concurrency: number;
  lockDuration: number;
  stalledInterval: number;
  limiter?: {
    max: number;
    duration: number;
  };
}

/**
 * Worker configuration presets
 */
export const WORKER_PRESETS = {
  /**
   * Default worker settings
   */
  DEFAULT: {
    concurrency: 5,
    lockDuration: 30000, // 30s
    stalledInterval: 15000, // 15s
  },

  /**
   * High concurrency for fast operations
   */
  HIGH_THROUGHPUT: {
    concurrency: 10,
    lockDuration: 30000,
    stalledInterval: 15000,
  },

  /**
   * Low concurrency for rate-limited APIs
   */
  RATE_LIMITED: {
    concurrency: 1,
    lockDuration: 180000, // 3 minutes for slow operations
    stalledInterval: 90000,
    limiter: {
      max: 2,
      duration: 1000, // 2 requests per second
    },
  },

  /**
   * Email sync worker (moderate throughput)
   */
  EMAIL_SYNC: {
    concurrency: 3,
    lockDuration: 120000, // 2 minutes
    stalledInterval: 60000,
  },

  /**
   * AI/Embedding worker (rate-limited)
   */
  AI_EMBEDDING: {
    concurrency: 1,
    lockDuration: 180000, // 3 minutes for embedding generation
    stalledInterval: 90000,
    limiter: {
      max: 2, // Mistral API rate limit
      duration: 1000,
    },
  },

  /**
   * Contacts sync worker
   */
  CONTACTS_SYNC: {
    concurrency: 3,
    lockDuration: 120000, // 2 minutes
    stalledInterval: 60000,
  },

  /**
   * Calendar sync worker
   */
  CALENDAR_SYNC: {
    concurrency: 3,
    lockDuration: 120000, // 2 minutes
    stalledInterval: 60000,
  },
} as const;

/**
 * Get worker options for a preset
 */
export function getWorkerOptions(
  preset: keyof typeof WORKER_PRESETS = 'DEFAULT',
): Partial<WorkerOptions> {
  const config = WORKER_PRESETS[preset];
  const result: Partial<WorkerOptions> = {
    concurrency: config.concurrency,
    lockDuration: config.lockDuration,
    stalledInterval: config.stalledInterval,
  };

  // Add limiter if present in the preset (only RATE_LIMITED and AI_EMBEDDING have it)
  if ('limiter' in config) {
    result.limiter = config.limiter;
  }

  return result;
}

/**
 * Get Redis connection for BullMQ
 * Re-exported for convenience
 */
export { getRedisConnectionOptions };

/**
 * Queue names constants - centralized registry of all queue names
 */
export const QUEUE_NAMES = {
  // Email sync queues
  EMAIL_SYNC_HIGH: 'email-sync-high',
  EMAIL_SYNC_NORMAL: 'email-sync-normal',
  EMAIL_SYNC_LOW: 'email-sync-low',

  // Folder operations
  FOLDER_OPERATIONS: 'folder-operations',

  // AI/Embedding queues
  EMAIL_EMBEDDING: 'email-embedding',
  CONTACT_EMBEDDING: 'contact-embedding',
  AI_PROCESSING: 'ai-processing',
  AI_SUMMARIZATION: 'ai-summarization',

  // Contacts sync queues
  CONTACTS_SYNC_HIGH: 'contacts-sync-high',
  CONTACTS_SYNC_NORMAL: 'contacts-sync-normal',
  CONTACTS_SYNC_LOW: 'contacts-sync-low',

  // Calendar sync queues
  CALENDAR_SYNC_HIGH: 'calendar-sync-high',
  CALENDAR_SYNC_NORMAL: 'calendar-sync-normal',
  CALENDAR_SYNC_LOW: 'calendar-sync-low',

  // Webhook maintenance (distributed across instances)
  WEBHOOK_MAINTENANCE: 'webhook-maintenance',

  // Dead letter queue
  DEAD_LETTER: 'dead-letter-queue',

  // Email send and sync-back queues
  EMAIL_SEND: 'email-send',
  PROVIDER_SYNC_BACK: 'provider-sync-back',
  BULK_OPERATIONS: 'bulk-operations',
  FEEDBACK: 'feedback',

  // Scheduled/maintenance jobs (migrated from @Cron)
  SCHEDULED_EMAIL_PROCESSING: 'scheduled-email-processing',
  EMAIL_CLEANUP: 'email-cleanup',
  EMAIL_RETENTION: 'email-retention',
  EMAIL_EMBEDDING_CLEANUP: 'email-embedding-cleanup',
  SYNC_SCHEDULER: 'sync-scheduler',
  WEBHOOK_LIFECYCLE: 'webhook-lifecycle',
  LOG_ROTATION: 'log-rotation',
} as const;

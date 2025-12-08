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
import { getRedisConnectionOptions, RedisConnectionOptions } from '../../config/configuration';

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

  // Dead letter queue
  DEAD_LETTER: 'dead-letter-queue',

  // Future queues (from roadmap)
  EMAIL_SEND: 'email-send',
  PROVIDER_SYNC_BACK: 'provider-sync-back',
  BULK_OPERATIONS: 'bulk-operations',
  FEEDBACK: 'feedback',
} as const;

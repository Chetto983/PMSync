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
import { RedisConnectionOptions } from '../../config/configuration';

/**
 * Re-export shared Redis connection singletons from the dedicated
 * redis-connections module. Keeps this file under the CLAUDE.md
 * 500-line hard limit while preserving the public API surface —
 * existing consumers that import these functions from queue.config.ts
 * (directly or via the barrel) continue to work unchanged.
 */
export {
  getSharedRedisConnection,
  releaseSharedRedisConnection,
  forceCloseSharedRedisConnection,
  getSharedWorkerConnection,
  releaseSharedWorkerConnection,
  forceCloseSharedWorkerConnection,
} from './redis-connections';

/**
 * Get the number of replicas this instance shares work with.
 * Set WORKER_REPLICA_COUNT in Railway env vars to match numReplicas.
 * Defaults to 1 (single instance behavior).
 */
export function getReplicaCount(): number {
  const raw = process.env.WORKER_REPLICA_COUNT;
  const parsed = parseInt(raw ?? '1', 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

/**
 * Scale a base concurrency value for multi-replica deployment.
 * Divides by replica count with a minimum floor of 1.
 *
 * Example: scaleForReplicas(17) with 2 replicas = Math.floor(17/2) = 8
 * Total across 2 replicas: 16 (close to original 17, safe)
 */
export function scaleForReplicas(baseConcurrency: number): number {
  const replicas = getReplicaCount();
  return Math.max(1, Math.floor(baseConcurrency / replicas));
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
    removeOnComplete: true, // D-08: immediate removal — DLQ captures failures
    removeOnFail: { count: 20 }, // D-09: keep last 20 for debugging
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
    removeOnComplete: true, // D-08: immediate removal
    removeOnFail: { count: 20 }, // D-09: keep last 20 for debugging
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
    removeOnComplete: true, // D-08: immediate removal
    removeOnFail: { count: 20 }, // D-09: keep last 20 for debugging
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
    removeOnComplete: true, // D-08: immediate removal
    removeOnFail: { count: 20 }, // D-09: keep last 20 for debugging
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
    removeOnComplete: true, // D-08: immediate removal
    removeOnFail: { count: 20 }, // D-09: keep last 20 for debugging
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
    removeOnComplete: true, // D-08: immediate removal
    removeOnFail: { count: 20 }, // D-09: keep last 20 for debugging
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
    removeOnComplete: true, // D-08: immediate removal
    removeOnFail: { count: 20 }, // D-09: keep last 20 for debugging
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
    removeOnComplete: true, // D-08: immediate removal
    removeOnFail: { count: 20 }, // D-09: keep last 20 for debugging
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
    removeOnComplete: true, // D-08: immediate removal
    removeOnFail: { count: 20 }, // D-09: keep last 20 for debugging
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
    concurrency: scaleForReplicas(config.concurrency),
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
export { getRedisConnectionOptions } from '../../config/configuration';

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

  // AI triage backfill (recovers missed auto-triage)
  TRIAGE_BACKFILL: 'triage-backfill',

  // Reminder check scheduler (follow-up due date notifications)
  REMINDER_CHECK: 'reminder-check',

  // Push notification dispatch (user-facing, latency-sensitive)
  PUSH_DISPATCH: 'push-dispatch',

  // CRM stage automation (triggered on deal stage changes)
  CRM_STAGE_AUTOMATION: 'crm-stage-automation',

  // CRM contact import (async CSV processing with progress)
  CRM_CONTACT_IMPORT: 'crm-contact-import',

  // CRM model retraining (AI governance, Sprint 14)
  CRM_MODEL_RETRAIN: 'crm-model-retrain',

  // Contact relationship score recalculation (S09 T-0903)
  RELATIONSHIP_SCORE: 'relationship-score',

  // Reminder notification (delayed jobs — fires at exact scadenzaDatetime)
  REMINDER_NOTIFY: 'reminder-notify',

  // Phase 147 D-06: debounced triage override promotion (5min dedup per tenant)
  TRIAGE_PROMOTE_OVERRIDES: 'triage-promote-overrides',

  // Phase 148 D-05: debounced accuracy counter updates (dedup key
  // `accuracy:${tenantId}:${feedbackId}:${labelId}:${kind}` in the listener)
  TRIAGE_ACCURACY_UPDATE: 'accuracy-update',
} as const;

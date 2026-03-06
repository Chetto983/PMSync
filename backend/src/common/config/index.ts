/**
 * Common Configuration Exports
 *
 * This barrel file exports all shared configuration modules
 * for easy imports throughout the application.
 *
 * Usage:
 * ```typescript
 * import {
 *   getRedisConnectionOptions,
 *   getDefaultJobOptions,
 *   QUEUE_PRESETS,
 *   QUEUE_NAMES,
 * } from '../common/config';
 * ```
 */

// Queue configuration
export {
  QUEUE_PRESETS,
  QUEUE_NAMES,
  WORKER_PRESETS,
  getDefaultJobOptions,
  getQueueOptions,
  getWorkerOptions,
  getRedisConnectionOptions,
  getSharedRedisConnection,
  releaseSharedRedisConnection,
  forceCloseSharedRedisConnection,
  type QueuePriority,
  type QueueJobDefaults,
  type WorkerOptionsConfig,
} from './queue.config';

// Re-export main configuration types and functions
export {
  getConfiguration,
  loadConfiguration,
  getRedisNodeConnectionOptions,
  type Configuration,
  type RedisConfig,
  type RedisConnectionOptions,
  type RedisNodeConnectionOptions,
  type RedisNodeSocketOptions,
  type DatabaseConfig,
  type ApiConfig,
  type AuthConfig,
  type EmailConfig,
  type OAuthConfig,
  type AiConfig,
  type RateLimitConfig,
} from '../../config/configuration';

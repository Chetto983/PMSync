import { Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { getRedisConnectionOptions } from '../config';

/** Default timeout for Redis connection check (5 seconds) */
const REDIS_CONNECT_TIMEOUT = 5000;

/**
 * Base Worker Configuration
 *
 * Best practices from BullMQ 2025:
 * - lockDuration: How long before a job is considered stalled (default 60s)
 * - stalledInterval: How often to check for stalled jobs (default 30s)
 * - limiter: Rate limiting to prevent overwhelming external services
 * - removeOnComplete/removeOnFail: Memory management (prevents Redis bloat)
 */
export interface BaseWorkerConfig {
  /** Queue name for the worker */
  queueName: string;
  /** Number of concurrent jobs to process */
  concurrency: number;
  /** Lock duration in ms (how long a job can run before being considered stalled) */
  lockDuration?: number;
  /** Interval to check for stalled jobs */
  stalledInterval?: number;
  /** Rate limiter configuration */
  limiter?: {
    max: number;
    duration: number;
  };
  /** Auto-remove completed jobs after N jobs (prevents Redis memory bloat) */
  removeOnComplete?: number | boolean;
  /** Auto-remove failed jobs after N jobs (set false to keep for debugging) */
  removeOnFail?: number | boolean;
}

/**
 * BaseWorker Abstract Class
 *
 * Consolidates common worker patterns across all BullMQ workers:
 * - Redis connection management (OnModuleInit/OnModuleDestroy)
 * - Worker lifecycle (start, stop, event handlers)
 * - Graceful shutdown with job draining
 * - Logging and error handling
 *
 * PHASE 4 CONSOLIDATION: Reduces ~175 LOC of duplicated worker boilerplate
 *
 * Usage:
 * ```typescript
 * @Injectable()
 * export class MySyncWorker extends BaseWorker<MyJobData, MyJobResult> {
 *   protected readonly logger = new Logger(MySyncWorker.name);
 *   protected readonly workerName = 'my-sync';
 *   protected readonly envToggle = 'MY_SYNC_WORKERS_ENABLED';
 *
 *   constructor(configService: ConfigService) {
 *     super(configService);
 *   }
 *
 *   protected getWorkerConfig(): BaseWorkerConfig {
 *     return {
 *       queueName: 'my-queue',
 *       concurrency: 5,
 *       lockDuration: 60000,
 *     };
 *   }
 *
 *   protected async processJob(job: Job<MyJobData>): Promise<MyJobResult> {
 *     // Implement job processing logic
 *   }
 *
 *   protected formatCompletedLog(job: Job<MyJobData>, result: MyJobResult): string {
 *     return `Job ${job.id} completed with result: ${JSON.stringify(result)}`;
 *   }
 * }
 * ```
 */
export abstract class BaseWorker<TData, TResult> implements OnModuleInit, OnModuleDestroy {
  /** Logger instance - override in subclass with specific name */
  protected abstract readonly logger: Logger;

  /** Worker name for logging purposes */
  protected abstract readonly workerName: string;

  /** Environment variable to toggle worker on/off (e.g., 'EMAIL_SYNC_WORKERS_ENABLED') */
  protected abstract readonly envToggle: string;

  /** Redis connection for BullMQ */
  protected redisConnection!: Redis;

  /** BullMQ worker instance(s) - can be single or array */
  protected workers: Worker<TData, TResult>[] = [];

  constructor(protected readonly configService: ConfigService) {}

  /**
   * Get worker configuration - must be implemented by subclass
   * Can return single config or array for multiple queues
   */
  protected abstract getWorkerConfig(): BaseWorkerConfig | BaseWorkerConfig[];

  /**
   * Process a single job - must be implemented by subclass
   */
  protected abstract processJob(job: Job<TData>): Promise<TResult>;

  /**
   * Format log message for completed job - override for custom logging
   */
  protected formatCompletedLog(job: Job<TData>, result: TResult): string {
    return `Job ${job.id} ${result}`;
  }

  /**
   * Format log message for failed job - override for custom logging
   */
  protected formatFailedLog(job: Job<TData> | undefined, error: Error): string {
    return `Job ${job?.id} failed: ${error.message}`;
  }

  /**
   * Check if workers are enabled via environment variable
   */
  protected isEnabled(): boolean {
    const value = this.configService.get<string>(this.envToggle) || 'true';
    return value.toLowerCase() !== 'false';
  }

  /**
   * Initialize Redis connection and start worker(s)
   */
  async onModuleInit(): Promise<void> {
    if (!this.isEnabled()) {
      this.logger.warn(`${this.workerName} workers disabled via ${this.envToggle}=false`);
      return;
    }

    // Initialize Redis connection
    const redisOptions = getRedisConnectionOptions();
    this.redisConnection = new Redis(redisOptions);

    // Add Redis error handler to prevent unhandled errors
    this.redisConnection.on('error', (err) => {
      this.logger.error(`${this.workerName} Redis connection error: ${err.message}`);
    });

    // Wait for Redis connection to be ready with timeout
    await this.waitForRedisConnection();

    // Get configuration(s) and start worker(s)
    const configs = this.getWorkerConfig();
    const configArray = Array.isArray(configs) ? configs : [configs];

    for (const config of configArray) {
      this.startWorker(config);
    }

    this.logger.log(`${this.workerName} workers started successfully`);
  }

  /**
   * Wait for Redis connection to be ready
   * Prevents starting workers before Redis is connected
   */
  private async waitForRedisConnection(): Promise<void> {
    if (this.redisConnection.status === 'ready') {
      return;
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Redis connection timeout after ${REDIS_CONNECT_TIMEOUT}ms`));
      }, REDIS_CONNECT_TIMEOUT);

      this.redisConnection.once('ready', () => {
        clearTimeout(timeout);
        this.logger.debug(`${this.workerName} Redis connection ready`);
        resolve();
      });

      this.redisConnection.once('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Redis connection failed: ${err.message}`));
      });
    });
  }

  /**
   * Start a single worker for a queue
   *
   * Key BullMQ best practices applied:
   * - maxRetriesPerRequest: null (required for workers per BullMQ docs)
   * - removeOnComplete/removeOnFail: Prevents Redis memory bloat
   * - Lock auto-renewal: Happens at lockDuration/2 automatically
   */
  protected startWorker(config: BaseWorkerConfig): void {
    const worker = new Worker<TData, TResult>(
      config.queueName,
      async (job: Job<TData>) => this.processJob(job),
      {
        connection: this.redisConnection,
        concurrency: config.concurrency,
        lockDuration: config.lockDuration ?? 60000,
        stalledInterval: config.stalledInterval ?? 30000,
        // BullMQ best practice: null prevents Redis command exceptions from breaking worker
        maxStalledCount: 3,
        // Job cleanup to prevent Redis memory bloat
        removeOnComplete: { count: config.removeOnComplete === true ? 100 : (config.removeOnComplete || 100) },
        removeOnFail: { count: config.removeOnFail === true ? 50 : (config.removeOnFail || 50) },
        ...(config.limiter ? { limiter: config.limiter } : {}),
      },
    );

    // Event handlers
    worker.on('completed', (job: Job<TData>, result: TResult) => {
      this.logger.log(`[${config.queueName}] ${this.formatCompletedLog(job, result)}`);
    });

    worker.on('failed', (job: Job<TData> | undefined, error: Error) => {
      this.logger.error(`[${config.queueName}] ${this.formatFailedLog(job, error)}`);
    });

    worker.on('error', (error: Error) => {
      this.logger.error(`[${config.queueName}] Worker error: ${error.message}`);
    });

    worker.on('stalled', (jobId: string) => {
      this.logger.warn(`[${config.queueName}] Job ${jobId} stalled - will be retried`);
    });

    this.workers.push(worker);
    this.logger.log(`Started worker for queue ${config.queueName} (concurrency: ${config.concurrency})`);
  }

  /**
   * Gracefully shutdown workers and Redis connection
   */
  async onModuleDestroy(): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    this.logger.log(`Stopping ${this.workerName} workers (graceful drain)...`);

    try {
      // Close all workers (waits for in-flight jobs)
      for (const worker of this.workers) {
        try {
          await worker.close();
        } catch (error) {
          this.logger.debug(
            `Worker close skipped: ${error instanceof Error ? error.message : error}`,
          );
        }
      }

      // Close Redis connection
      if (
        this.redisConnection &&
        this.redisConnection.status !== 'end' &&
        this.redisConnection.status !== 'close'
      ) {
        try {
          await this.redisConnection.quit();
        } catch (error) {
          this.logger.debug(
            `Redis quit skipped: ${error instanceof Error ? error.message : error}`,
          );
        }
      }
    } catch (outerError) {
      this.logger.warn(
        `${this.workerName} shutdown error (swallowed): ${
          outerError instanceof Error ? outerError.message : outerError
        }`,
      );
    } finally {
      // Clear workers array to allow re-initialization if needed
      this.workers = [];
      this.logger.log(`${this.workerName} workers stopped`);
    }
  }

  /**
   * Utility: Wrap operation with timeout
   * CRIT-2 pattern: Prevents indefinite hangs on provider API calls
   */
  protected async withTimeout<T>(
    operation: Promise<T>,
    timeoutMs: number,
    operationName: string,
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      timer.unref?.();
    });

    return Promise.race([operation, timeoutPromise]);
  }

  /**
   * Utility: Generate idempotency key for job deduplication
   *
   * BullMQ uses jobId as idempotency key - if a job with the same ID exists,
   * it won't be added again. Use this pattern when enqueueing jobs:
   *
   * ```typescript
   * await queue.add('process', data, {
   *   jobId: this.generateIdempotencyKey('email-send', tenantId, messageId)
   * });
   * ```
   *
   * @param prefix - Operation type prefix (e.g., 'email-send', 'folder-sync')
   * @param parts - Unique identifiers (e.g., tenantId, providerId, messageId)
   * @returns Deterministic idempotency key
   */
  protected generateIdempotencyKey(prefix: string, ...parts: string[]): string {
    return `${prefix}:${parts.join(':')}`;
  }

  /**
   * Utility: Generate distributed lock key for Redis-based locking
   *
   * Use with Redlock or similar for operations that need exclusive access:
   * - Prevents concurrent processing of the same resource
   * - Useful for operations that can't be safely retried
   *
   * @param resource - Resource type (e.g., 'provider', 'folder')
   * @param resourceId - Unique resource identifier
   * @returns Lock key for Redis
   */
  protected generateLockKey(resource: string, resourceId: string): string {
    return `lock:${this.workerName}:${resource}:${resourceId}`;
  }

  /**
   * Utility: Validate provider type matches job data
   *
   * DC-6 CONSOLIDATION: Prevents malicious or corrupted jobs from operating
   * on wrong provider type. Previously duplicated across email-send and sync-back workers.
   *
   * @param actualType - The provider's actual type from database
   * @param expectedType - The type claimed by the job data
   * @param context - Additional context for error message (e.g., providerId)
   * @throws Error if types don't match
   */
  protected validateProviderType(
    actualType: string,
    expectedType: string,
    context?: string,
  ): void {
    if (actualType !== expectedType) {
      const contextStr = context ? ` (${context})` : '';
      throw new Error(
        `Provider type mismatch${contextStr}: job claims '${expectedType}' but provider is '${actualType}'`,
      );
    }
  }
}

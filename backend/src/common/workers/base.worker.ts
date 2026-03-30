import { Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { getRedisConnectionOptions } from '../config';

/** Default timeout for Redis connection check (5 seconds) */
const REDIS_CONNECT_TIMEOUT = 5000;

/** IF-C1: Error threshold — max errors in a sliding window before auto-pause */
const ERROR_THRESHOLD = 10;
/** IF-C1: Sliding window duration in ms (5 minutes) */
const ERROR_WINDOW_MS = 5 * 60 * 1000;
/** IF-C1: Cooldown after auto-pause before resuming (60 seconds) */
const PAUSE_COOLDOWN_MS = 60 * 1000;

/** Whether the global unhandledRejection handler has been installed */
let globalRejectionHandlerInstalled = false;

/**
 * Worker health status returned by getStatus()
 */
export interface WorkerHealthStatus {
  name: string;
  enabled: boolean;
  queues: Array<{
    queueName: string;
    running: boolean;
    paused: boolean;
    concurrency: number;
  }>;
  errorCount5m: number;
  autoPaused: boolean;
  autoPausedAt: string | null;
}

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static readonly registry: BaseWorker<any, any>[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static getAll(): BaseWorker<any, any>[] {
    return [...BaseWorker.registry];
  }

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

  private errorTimestamps: number[] = [];
  private _autoPaused = false;
  private _autoPausedAt: Date | null = null;

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
    // IF-C1: Register in global registry for health reporting
    if (!BaseWorker.registry.includes(this)) {
      BaseWorker.registry.push(this);
    }

    // IF-C1: Install global unhandledRejection handler (once)
    if (!globalRejectionHandlerInstalled) {
      globalRejectionHandlerInstalled = true;
      process.on('unhandledRejection', (reason: unknown) => {
        const msg = reason instanceof Error ? reason.message : String(reason);
        Logger.error(
          `Unhandled rejection in worker process (swallowed): ${msg}`,
          'BaseWorker',
        );
      });
    }

    if (!this.isEnabled()) {
      this.logger.warn(`${this.workerName} workers disabled via ${this.envToggle}=false`);
      return;
    }

    const configs = this.getWorkerConfig();
    const configArray = Array.isArray(configs) ? configs : [configs];
    const queueNames = configArray.map((config) => config.queueName);

    // Initialize Redis connection
    // CRITICAL: Override lazyConnect to false. BullMQ internally calls
    // connection.duplicate() for its blocking client. If lazyConnect is true,
    // the duplicate also gets lazyConnect: true and may never actually connect,
    // causing workers to silently not pick up jobs.
    const redisOptions = {
      ...getRedisConnectionOptions(),
      connectionName: `${this.workerName}-worker`,
      lazyConnect: false,
    };
    this.redisConnection = new Redis(redisOptions);

    // Add Redis error handler to prevent unhandled errors
    this.redisConnection.on('error', (err) => {
      this.logger.error(`${this.workerName} Redis connection error: ${err.message}`);
    });

    // Wait for Redis connection to be ready with timeout
    await this.waitForRedisConnection(queueNames);

    for (const config of configArray) {
      this.startWorker(config);
    }

    this.logger.log(`${this.workerName} workers started successfully`);
  }

  /**
   * Wait for Redis connection to be ready
   * Prevents starting workers before Redis is connected
   */
  private async waitForRedisConnection(queueNames: string[]): Promise<void> {
    if (this.redisConnection.status === 'ready') {
      return;
    }

    const timeoutMs = this.getRedisConnectTimeoutMs();
    const queueLabel =
      queueNames.length > 0 ? ` [queues=${queueNames.join(', ')}]` : '';

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        this.redisConnection.off('ready', handleReady);
        this.redisConnection.off('error', handleError);
        callback();
      };

      const handleReady = () => {
        finish(() => {
          this.logger.debug(
            `${this.workerName} Redis connection ready${queueLabel}`,
          );
          resolve();
        });
      };

      const handleError = (err: Error) => {
        finish(() => {
          reject(
            new Error(
              `${this.workerName} Redis connection failed${queueLabel}: ${err.message}`,
            ),
          );
        });
      };

      const timeout = setTimeout(() => {
        finish(() => {
          reject(
            new Error(
              `${this.workerName} Redis connection timeout after ${timeoutMs}ms${queueLabel}; status=${this.redisConnection.status}`,
            ),
          );
        });
      }, timeoutMs);
      timeout.unref?.();

      this.redisConnection.once('ready', handleReady);
      this.redisConnection.once('error', handleError);

      if (this.redisConnection.status === 'wait') {
        void this.redisConnection.connect().catch((err) => {
          finish(() => {
            reject(
              new Error(
                `${this.workerName} Redis connect() failed${queueLabel}: ${
                  err instanceof Error ? err.message : String(err)
                }`,
              ),
            );
          });
        });
      }
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
      this.recordError();
    });

    worker.on('error', (error: Error) => {
      this.logger.error(`[${config.queueName}] Worker error: ${error.message}`);
      this.recordError();
    });

    worker.on('stalled', (jobId: string) => {
      this.logger.warn(`[${config.queueName}] Job ${jobId} stalled - will be retried`);
    });

    this.workers.push(worker);
    this.logger.log(`Started worker for queue ${config.queueName} (concurrency: ${config.concurrency})`);
  }

  // ========== IF-C1: Error Tracking & Auto-Pause ==========

  private recordError(): void {
    const now = Date.now();
    this.errorTimestamps.push(now);

    const cutoff = now - ERROR_WINDOW_MS;
    this.errorTimestamps = this.errorTimestamps.filter((t) => t >= cutoff);

    if (this.errorTimestamps.length >= ERROR_THRESHOLD && !this._autoPaused) {
      this._autoPaused = true;
      this._autoPausedAt = new Date();
      this.logger.error(
        `IF-C1: ${this.workerName} hit ${this.errorTimestamps.length} errors in 5 min — auto-pausing all queues`,
      );

      for (const w of this.workers) {
        void w.pause().catch((err: unknown) => {
          this.logger.debug(
            `Failed to pause worker: ${err instanceof Error ? err.message : err}`,
          );
        });
      }

      const timer = setTimeout(() => {
        this.resumeAfterCooldown();
      }, PAUSE_COOLDOWN_MS);
      timer.unref?.();
    }
  }

  private resumeAfterCooldown(): void {
    this._autoPaused = false;
    this._autoPausedAt = null;
    this.errorTimestamps = [];
    this.logger.warn(`${this.workerName} resuming after auto-pause cooldown`);

    for (const w of this.workers) {
      try {
        w.resume();
      } catch (err: unknown) {
        this.logger.debug(
          `Failed to resume worker: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  getStatus(): WorkerHealthStatus {
    const now = Date.now();
    const cutoff = now - ERROR_WINDOW_MS;
    const recentErrors = this.errorTimestamps.filter((t) => t >= cutoff).length;

    const configs = this.getWorkerConfig();
    const configArray = Array.isArray(configs) ? configs : [configs];

    return {
      name: this.workerName,
      enabled: this.isEnabled(),
      queues: this.workers.map((w, i) => ({
        queueName: configArray[i]?.queueName ?? w.name,
        running: w.isRunning(),
        paused: w.isPaused(),
        concurrency: configArray[i]?.concurrency ?? 1,
      })),
      errorCount5m: recentErrors,
      autoPaused: this._autoPaused,
      autoPausedAt: this._autoPausedAt?.toISOString() ?? null,
    };
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
      // IF-C1: Remove from global registry
      const idx = BaseWorker.registry.indexOf(this);
      if (idx >= 0) BaseWorker.registry.splice(idx, 1);
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

  private getRedisConnectTimeoutMs(): number {
    const raw =
      this.configService.get<string>('BASE_WORKER_REDIS_CONNECT_TIMEOUT_MS') ??
      process.env.BASE_WORKER_REDIS_CONNECT_TIMEOUT_MS ??
      String(REDIS_CONNECT_TIMEOUT);
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : REDIS_CONNECT_TIMEOUT;
  }
}

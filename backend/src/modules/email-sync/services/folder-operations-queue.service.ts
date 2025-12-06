import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Queue, QueueEvents, JobType } from 'bullmq';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';
import {
  FolderJobData,
  FolderJobResult,
  FolderQueueStatus,
  FolderOperationType,
} from '../interfaces/folder-job.interface';
import { getRedisConnectionOptions } from '../../../config/configuration';

interface FolderQueueMetrics {
  completed: number;
  failed: number;
  processed: number;
  totalDurationMs: number;
  lastDurationMs?: number;
  lastCompletedAt?: string;
  lastFailedAt?: string;
  lastError?: string;
}

/**
 * FolderOperationsQueueService
 *
 * Manages BullMQ queue for folder operations (create, rename, delete)
 * to ensure reliable sync with mail providers (IMAP/Gmail/Microsoft).
 *
 * This queue handles all folder mutations that need to be synced to the provider:
 * - High priority queue for user-initiated folder operations
 * - Automatic retry with exponential backoff
 * - Job deduplication to prevent duplicate operations
 * - Metrics and monitoring
 */
@Injectable()
export class FolderOperationsQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FolderOperationsQueueService.name);
  private redisConnection: Redis;
  public folderQueue: Queue<FolderJobData>;
  private queueEvents: QueueEvents;
  private workerToken?: string;

  private readonly metrics: FolderQueueMetrics = {
    completed: 0,
    failed: 0,
    processed: 0,
    totalDurationMs: 0,
  };

  // Queue configuration optimized for folder operations
  private readonly QUEUE_CONFIG = {
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 2000, // Start with 2s, then 4s, then 8s
    },
    removeOnComplete: { count: 100, age: 3600 }, // Keep last 100 or 1 hour
    removeOnFail: { count: 200 }, // Keep failed jobs for debugging
  };

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    // Initialize Redis connection
    const redisOptions = getRedisConnectionOptions();
    this.workerToken = this.configService.get<string>('EMAIL_SYNC_WORKER_TOKEN');

    this.redisConnection = new Redis(redisOptions);

    this.logger.log(
      `Connecting to Redis for folder operations at ${redisOptions.host}:${redisOptions.port}`,
    );

    // Initialize folder operations queue
    this.folderQueue = new Queue<FolderJobData>('folder-operations', {
      connection: this.redisConnection,
      defaultJobOptions: {
        attempts: this.QUEUE_CONFIG.attempts,
        backoff: this.QUEUE_CONFIG.backoff,
        removeOnComplete: this.QUEUE_CONFIG.removeOnComplete,
        removeOnFail: this.QUEUE_CONFIG.removeOnFail,
      },
    });

    // Setup queue events for monitoring
    this.setupQueueEvents();

    this.logger.log('Folder operations queue initialized successfully');
  }

  private setupQueueEvents() {
    this.queueEvents = new QueueEvents(this.folderQueue.name, {
      connection: this.redisConnection,
    });

    this.queueEvents.on('completed', ({ jobId }) => {
      this.logger.debug(`Folder job ${jobId} completed`);
      this.recordCompletion(jobId).catch((error) => {
        this.logger.debug(
          `Failed to record metrics for job ${jobId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    });

    this.queueEvents.on('failed', ({ jobId, failedReason }) => {
      this.logger.error(`Folder job ${jobId} failed: ${failedReason}`);
      this.recordFailure(failedReason);
    });

    this.queueEvents.on('progress', ({ jobId, data }) => {
      this.logger.debug(`Folder job ${jobId} progress: ${JSON.stringify(data)}`);
    });
  }

  /**
   * Add a folder create job to the queue
   */
  async addCreateFolderJob(
    tenantId: string,
    providerId: string,
    providerType: 'google' | 'microsoft' | 'generic',
    email: string,
    folderName: string,
    parentPath?: string,
  ): Promise<string> {
    const jobData: FolderJobData = {
      tenantId,
      providerId,
      providerType,
      email,
      operation: 'create',
      folderName,
      parentPath,
      priority: 'high',
      createdAt: new Date().toISOString(),
    };

    return this.addJob(jobData, 'create', folderName);
  }

  /**
   * Add a folder rename job to the queue
   */
  async addRenameFolderJob(
    tenantId: string,
    providerId: string,
    providerType: 'google' | 'microsoft' | 'generic',
    email: string,
    oldPath: string,
    newName: string,
  ): Promise<string> {
    const jobData: FolderJobData = {
      tenantId,
      providerId,
      providerType,
      email,
      operation: 'rename',
      oldPath,
      newName,
      priority: 'high',
      createdAt: new Date().toISOString(),
    };

    return this.addJob(jobData, 'rename', `${oldPath}->${newName}`);
  }

  /**
   * Add a folder delete job to the queue
   */
  async addDeleteFolderJob(
    tenantId: string,
    providerId: string,
    providerType: 'google' | 'microsoft' | 'generic',
    email: string,
    folderPath: string,
  ): Promise<string> {
    const jobData: FolderJobData = {
      tenantId,
      providerId,
      providerType,
      email,
      operation: 'delete',
      folderPath,
      priority: 'high',
      createdAt: new Date().toISOString(),
    };

    return this.addJob(jobData, 'delete', folderPath);
  }

  /**
   * Internal method to add a job with deduplication
   */
  private async addJob(
    jobData: FolderJobData,
    operation: FolderOperationType,
    identifier: string,
  ): Promise<string> {
    const jobDataWithToken = this.withJobToken(jobData);

    // Create unique job ID to prevent duplicates
    // Format: providerId-operation-identifier
    const jobId = `${jobData.providerId}-${operation}-${this.sanitizeJobId(identifier)}`;

    // Check for existing job
    const existing = await this.folderQueue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'completed' || state === 'failed') {
        // Remove completed/failed jobs to allow retry
        await existing.remove();
      } else if (state === 'active' || state === 'waiting' || state === 'delayed') {
        // Job is in progress, don't add duplicate
        this.logger.log(
          `Folder ${operation} job already queued for ${identifier} (state=${state})`,
        );
        return existing.id || jobId;
      }
    }

    // Add the job
    const job = await this.folderQueue.add(
      `folder-${operation}-${jobData.email}`,
      jobDataWithToken,
      {
        jobId,
        // Folder operations should start immediately (no delay)
        delay: 0,
      },
    );

    this.logger.log(
      `Added folder ${operation} job for ${jobData.email}: ${identifier} [jobId=${job.id}]`,
    );

    return job.id || jobId;
  }

  /**
   * Get job status by ID
   */
  async getJobStatus(
    jobId: string,
  ): Promise<{ state: string; result?: FolderJobResult; progress?: number } | null> {
    const job = await this.folderQueue.getJob(jobId);
    if (!job) {
      return null;
    }

    const state = await job.getState();
    const result = job.returnvalue as FolderJobResult | undefined;
    const progress = typeof job.progress === 'number' ? job.progress : undefined;

    return { state, result, progress };
  }

  /**
   * Wait for a job to complete (with timeout)
   */
  async waitForJob(
    jobId: string,
    timeoutMs: number = 30000,
  ): Promise<FolderJobResult | null> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getJobStatus(jobId);
      if (!status) {
        return null;
      }

      if (status.state === 'completed') {
        return status.result || null;
      }

      if (status.state === 'failed') {
        const job = await this.folderQueue.getJob(jobId);
        const failedReason = job?.failedReason || 'Unknown error';
        return {
          success: false,
          providerId: '',
          email: '',
          operation: 'create',
          error: failedReason,
          duration: Date.now() - startTime,
          shouldRefreshFolders: false,
        };
      }

      // Wait 100ms before checking again
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Timeout reached
    return {
      success: false,
      providerId: '',
      email: '',
      operation: 'create',
      error: 'Operation timed out',
      duration: timeoutMs,
      shouldRefreshFolders: false,
    };
  }

  /**
   * Get queue status
   */
  async getQueueStatus(): Promise<FolderQueueStatus> {
    const counts = await this.folderQueue.getJobCounts();

    return {
      queueName: 'folder-operations',
      waiting: counts.waiting || 0,
      active: counts.active || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      delayed: counts.delayed || 0,
    };
  }

  /**
   * Get metrics summary
   */
  getMetrics(): FolderQueueMetrics & { averageDurationMs: number } {
    const averageDuration =
      this.metrics.processed > 0
        ? Math.round(this.metrics.totalDurationMs / this.metrics.processed)
        : 0;

    return {
      ...this.metrics,
      averageDurationMs: averageDuration,
    };
  }

  /**
   * Get pending jobs for a provider
   */
  async getPendingJobsForProvider(providerId: string): Promise<FolderJobData[]> {
    const states: JobType[] = ['waiting', 'active', 'delayed'];
    const jobs = await this.folderQueue.getJobs(states, 0, -1);

    return jobs
      .filter((job) => job?.data?.providerId === providerId)
      .map((job) => job.data);
  }

  /**
   * Remove all pending jobs for a provider
   */
  async removeJobsForProvider(providerId: string): Promise<number> {
    const states: JobType[] = ['waiting', 'delayed', 'paused'];
    const jobs = await this.folderQueue.getJobs(states, 0, -1);

    let removed = 0;
    for (const job of jobs) {
      if (job?.data?.providerId === providerId) {
        await job.remove();
        removed++;
      }
    }

    if (removed > 0) {
      this.logger.log(`Removed ${removed} pending folder jobs for provider ${providerId}`);
    }

    return removed;
  }

  /**
   * Clear all failed jobs
   */
  async clearFailedJobs(): Promise<number> {
    const failed = await this.folderQueue.getJobs(['failed'], 0, -1);
    let cleared = 0;

    for (const job of failed) {
      await job.remove();
      cleared++;
    }

    this.logger.log(`Cleared ${cleared} failed folder jobs`);
    return cleared;
  }

  private withJobToken(jobData: FolderJobData): FolderJobData {
    if (!this.workerToken) {
      return jobData;
    }

    return {
      ...jobData,
      authToken: this.workerToken,
    };
  }

  private sanitizeJobId(identifier: string): string {
    // Remove special characters that might cause issues in job IDs
    return identifier.replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 100);
  }

  private async recordCompletion(jobId: string) {
    this.metrics.completed += 1;
    this.metrics.lastCompletedAt = new Date().toISOString();

    try {
      const job = await this.folderQueue.getJob(jobId);
      if (job && job.processedOn != null && job.finishedOn != null) {
        const duration = job.finishedOn - job.processedOn;
        if (Number.isFinite(duration) && duration >= 0) {
          this.metrics.processed += 1;
          this.metrics.totalDurationMs += duration;
          this.metrics.lastDurationMs = duration;
        }
      }
    } catch (error) {
      this.logger.debug(
        `Unable to fetch job ${jobId} for duration metrics: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private recordFailure(failedReason?: string) {
    this.metrics.failed += 1;
    this.metrics.lastFailedAt = new Date().toISOString();
    this.metrics.lastError = failedReason;
  }

  async onModuleDestroy() {
    this.logger.log('Closing folder operations queue...');

    try {
      if (this.queueEvents) {
        await this.queueEvents.close();
      }

      if (this.folderQueue) {
        await this.folderQueue.close();
      }

      if (
        this.redisConnection &&
        this.redisConnection.status !== 'end' &&
        this.redisConnection.status !== 'close'
      ) {
        await this.redisConnection.quit();
      }
    } catch (error) {
      this.logger.warn(
        `Folder queue shutdown error: ${error instanceof Error ? error.message : error}`,
      );
    } finally {
      this.logger.log('Folder operations queue closed');
    }
  }
}

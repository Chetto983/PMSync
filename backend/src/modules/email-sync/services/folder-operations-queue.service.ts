/**
 * FolderOperationsQueueService
 *
 * Manages BullMQ queue for folder operations (create, rename, delete)
 * to ensure reliable sync with mail providers (IMAP/Gmail/Microsoft).
 * Extends BaseQueueService for common queue boilerplate.
 *
 * Key Features:
 * - High priority queue for user-initiated folder operations
 * - Automatic retry with exponential backoff
 * - Job deduplication to prevent duplicate operations
 * - Metrics and monitoring
 *
 * CONSOLIDATION DC-5: Extends BaseQueueService to eliminate ~150 lines of boilerplate
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobType, JobsOptions } from 'bullmq';
import {
  FolderJobData,
  FolderJobResult,
  FolderQueueStatus,
  FolderOperationType,
} from '../interfaces/folder-job.interface';
import { QUEUE_NAMES } from '../../../common/config';
import { BaseQueueService, QueuePriority } from './base-queue.service';
import { CorrelationContext } from '../../../common/services/correlation-context.service';

export interface FolderQueueMetrics {
  completed: number;
  failed: number;
  processed: number;
  totalDurationMs: number;
  lastDurationMs?: number;
  lastCompletedAt?: string;
  lastFailedAt?: string;
  lastError?: string;
  averageDurationMs: number;
}

/**
 * Extended internal metrics for folder operations
 */
interface FolderMetrics {
  processed: number;
  lastDurationMs?: number;
  lastCompletedAt?: string;
  lastFailedAt?: string;
}

@Injectable()
export class FolderOperationsQueueService extends BaseQueueService<FolderJobData, FolderJobResult> {
  private readonly folderMetrics: FolderMetrics = {
    processed: 0,
  };
  private workerToken?: string;

  constructor(configService: ConfigService) {
    // No DLQ for folder operations
    super(configService, undefined);
    this.workerToken = configService.get<string>('EMAIL_SYNC_WORKER_TOKEN');
  }

  // ==================== BaseQueueService Abstract Implementations ====================

  protected getQueueName(): string {
    return QUEUE_NAMES.FOLDER_OPERATIONS;
  }

  protected getQueuePriority(): QueuePriority {
    return 'HIGH'; // User-initiated folder operations
  }

  protected getJobDefaultOverrides(): Partial<JobsOptions> {
    // Use FOLDER_OPS preset from centralized config
    return {};
  }

  protected setupCustomEvents(): void {
    this.queueEvents.on('progress', ({ jobId, data }) => {
      this.logger.debug(`Folder job ${jobId} progress: ${JSON.stringify(data)}`);
    });
  }

  protected extractDlqMetadata(jobData: FolderJobData): Record<string, any> {
    return {
      providerId: jobData.providerId,
      providerType: jobData.providerType,
      operation: jobData.operation,
      email: jobData.email,
    };
  }

  // ==================== Override for folder-specific metrics ====================

  protected async recordCompletion(jobId: string): Promise<void> {
    await super.recordCompletion(jobId);
    this.folderMetrics.lastCompletedAt = new Date().toISOString();

    try {
      const job = await this.queue.getJob(jobId);
      if (job && job.processedOn != null && job.finishedOn != null) {
        const duration = job.finishedOn - job.processedOn;
        if (Number.isFinite(duration) && duration >= 0) {
          this.folderMetrics.processed += 1;
          this.folderMetrics.lastDurationMs = duration;
        }
      }
    } catch {
      // Ignore errors when fetching job metrics
    }
  }

  protected recordFailure(failedReason?: string): void {
    super.recordFailure(failedReason);
    this.folderMetrics.lastFailedAt = new Date().toISOString();
  }

  // ==================== Folder Operations Business Logic ====================

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
    const jobId = `${jobData.providerId}-${operation}-${this.sanitizeJobId(identifier)}`;

    const existing = await this.queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'completed' || state === 'failed') {
        await existing.remove();
      } else if (state === 'active' || state === 'waiting' || state === 'delayed') {
        this.logger.log(
          `Folder ${operation} job already queued for ${identifier} (state=${state})`,
        );
        return existing.id || jobId;
      }
    }

    const job = await this.queue.add(
      `folder-${operation}-${jobData.email}`,
      {
        ...jobDataWithToken,
        requestId: CorrelationContext.getContext()?.correlationId,
      } as FolderJobData,
      {
        jobId,
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
    const job = await this.queue.getJob(jobId);
    if (!job) return null;

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
      if (!status) return null;

      if (status.state === 'completed') {
        return status.result || null;
      }

      if (status.state === 'failed') {
        const job = await this.queue.getJob(jobId);
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

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

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
   * Get queue status (compatible with original interface)
   */
  async getQueueStatus(): Promise<FolderQueueStatus> {
    const counts = await this.queue.getJobCounts();

    return {
      queueName: QUEUE_NAMES.FOLDER_OPERATIONS,
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
  getMetrics(): FolderQueueMetrics {
    return {
      completed: this.baseMetrics.completed,
      failed: this.baseMetrics.failed,
      processed: this.folderMetrics.processed,
      totalDurationMs: this.baseMetrics.totalDurationMs,
      lastDurationMs: this.folderMetrics.lastDurationMs,
      lastCompletedAt: this.folderMetrics.lastCompletedAt,
      lastFailedAt: this.folderMetrics.lastFailedAt,
      lastError: this.baseMetrics.lastError,
      averageDurationMs: this.getAverageDuration(),
    };
  }

  /**
   * Get pending jobs for a provider
   */
  async getPendingJobsForProvider(providerId: string): Promise<FolderJobData[]> {
    const states: JobType[] = ['waiting', 'active', 'delayed'];
    const jobs = await this.queue.getJobs(states, 0, 100);

    return jobs
      .filter((job) => job?.data?.providerId === providerId)
      .map((job) => job.data);
  }

  /**
   * Clear all failed jobs
   */
  async clearFailedJobs(): Promise<number> {
    const failed = await this.queue.getJobs(['failed'], 0, 200);
    let cleared = 0;

    for (const job of failed) {
      await job.remove();
      cleared++;
    }

    this.logger.log(`Cleared ${cleared} failed folder jobs`);
    return cleared;
  }

  /**
   * Expose folderQueue for backward compatibility
   */
  get folderQueue() {
    return this.queue;
  }

  private withJobToken(jobData: FolderJobData): FolderJobData {
    if (!this.workerToken) return jobData;
    return {
      ...jobData,
      authToken: this.workerToken,
    };
  }

  private sanitizeJobId(identifier: string): string {
    return identifier.replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 100);
  }
}

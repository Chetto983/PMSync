/**
 * BulkOperationsQueueService
 *
 * BullMQ queue service for handling bulk email operations.
 * Extends BaseQueueService for common queue boilerplate.
 *
 * Key Features:
 * - Batch processing with configurable chunk sizes
 * - Progress tracking for long-running operations
 * - Rate limiting to avoid provider throttling
 * - Cancellation support
 * - Automatic retry with dead-letter handling
 *
 * CONSOLIDATION DC-5: Extends BaseQueueService to eliminate ~150 lines of boilerplate
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobType, JobsOptions } from 'bullmq';
import { QUEUE_NAMES } from '../../../common/config';
import { DeadLetterQueueService } from '../../../common/services/dead-letter-queue.service';
import { BaseQueueService, QueuePriority } from './base-queue.service';
import { CorrelationContext } from '../../../common/services/correlation-context.service';

/**
 * Supported bulk operations
 */
export type BulkOperationType =
  | 'delete'
  | 'archive'
  | 'mark-read'
  | 'mark-unread'
  | 'star'
  | 'unstar'
  | 'move'
  | 'add-label'
  | 'remove-label'
  | 'spam'
  | 'not-spam';

/**
 * Bulk operation job data
 */
export interface BulkOperationJobData {
  tenantId: string;
  providerId: string;
  providerType: 'google' | 'microsoft' | 'imap';
  operation: BulkOperationType;
  /** Email IDs to process */
  emailIds: string[];
  /** For move/label operations */
  targetFolderId?: string;
  /** For label operations */
  labelId?: string;
  /** Chunk size for batch processing (default: 50) */
  chunkSize?: number;
  /** Request timestamp */
  requestedAt: string;
  /** User ID who initiated the operation */
  userId?: string;
  /** Whether to sync back to provider */
  syncToProvider?: boolean;
  /** FIX L1: Permanent delete flag - if true, hard delete from DB */
  permanent?: boolean;
  /** Internal: cancellation flag */
  _cancelled?: boolean;
  /** Correlation ID from the originating HTTP request */
  requestId?: string;
}

/**
 * Bulk operation progress
 */
export interface BulkOperationProgress {
  processed: number;
  total: number;
  percentage: number;
  failed: number;
  errors: string[];
  startedAt?: string;
  estimatedCompletionAt?: string;
}

/**
 * Bulk operation job result
 */
export interface BulkOperationJobResult {
  success: boolean;
  processed: number;
  failed: number;
  errors: string[];
  durationMs: number;
  completedAt: string;
}

/**
 * Queue metrics
 */
export interface BulkOperationsQueueMetrics {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  totalEmailsProcessed: number;
  avgBatchDurationMs: number;
}

/**
 * Extended internal metrics for bulk operations
 */
interface BulkQueueMetrics {
  totalEmailsProcessed: number;
}

@Injectable()
export class BulkOperationsQueueService extends BaseQueueService<BulkOperationJobData, BulkOperationJobResult> {
  private readonly bulkMetrics: BulkQueueMetrics = {
    totalEmailsProcessed: 0,
  };

  constructor(
    configService: ConfigService,
    deadLetterQueue: DeadLetterQueueService,
  ) {
    super(configService, deadLetterQueue);
  }

  // ==================== BaseQueueService Abstract Implementations ====================

  protected getQueueName(): string {
    return QUEUE_NAMES.BULK_OPERATIONS;
  }

  protected getQueuePriority(): QueuePriority {
    return 'NORMAL'; // Background batch processing
  }

  protected getJobDefaultOverrides(): Partial<JobsOptions> {
    return {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 10000, // 10s, 20s, 40s
      },
      // Keep completed jobs longer for audit trail
      removeOnComplete: {
        age: 7 * 24 * 3600, // 7 days
        count: 1000,
      },
    };
  }

  protected setupCustomEvents(): void {
    this.queueEvents.on('progress', ({ jobId, data }) => {
      this.logger.debug(`Bulk operation job ${jobId} progress: ${JSON.stringify(data)}`);
    });
  }

  protected extractDlqMetadata(jobData: BulkOperationJobData): Record<string, any> {
    return {
      providerId: jobData.providerId,
      providerType: jobData.providerType,
      operation: jobData.operation,
      emailCount: jobData.emailIds.length,
    };
  }

  // ==================== Override recordCompletion for email count tracking ====================

  protected async recordCompletion(jobId: string): Promise<void> {
    await super.recordCompletion(jobId);

    try {
      const job = await this.queue.getJob(jobId);
      if (job?.returnvalue) {
        const result = job.returnvalue;
        this.bulkMetrics.totalEmailsProcessed += result.processed;
      }
    } catch {
      // Ignore errors when fetching job metrics
    }
  }

  // ==================== Bulk Operations Business Logic ====================

  /**
   * Enqueue a bulk operation.
   */
  async enqueueBulkOperation(data: BulkOperationJobData): Promise<string> {
    const jobId = `bulk-${data.operation}-${data.providerId}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const job = await this.queue.add('bulk-operation', {
      ...data,
      requestId: CorrelationContext.getContext()?.correlationId,
    } as BulkOperationJobData, {
      jobId,
      priority: data.emailIds.length > 1000 ? 10 : 5,
    });

    this.logger.log(
      `Queued bulk ${data.operation}: ${data.emailIds.length} emails for provider ${data.providerId} [${job.id}]`,
    );

    return job.id || jobId;
  }

  /**
   * Get progress for a bulk operation job.
   */
  async getProgress(jobId: string): Promise<BulkOperationProgress | null> {
    const job = await this.queue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();
    const progress = (job.progress as BulkOperationProgress) || {
      processed: 0,
      total: job.data.emailIds.length,
      percentage: 0,
      failed: 0,
      errors: [],
    };

    if (state === 'completed' && job.returnvalue) {
      const result = job.returnvalue;
      return {
        processed: result.processed,
        total: job.data.emailIds.length,
        percentage: 100,
        failed: result.failed,
        errors: result.errors,
      };
    }

    return progress;
  }

  /**
   * Cancel a pending bulk operation.
   */
  async cancelOperation(jobId: string): Promise<boolean> {
    const job = await this.queue.getJob(jobId);
    if (!job) return false;

    const state = await job.getState();

    if (state === 'waiting' || state === 'delayed') {
      await job.remove();
      this.logger.log(`Cancelled bulk operation: ${jobId}`);
      return true;
    }

    if (state === 'active') {
      await job.updateData({
        ...job.data,
        _cancelled: true,
      } as BulkOperationJobData);
      this.logger.log(`Marked bulk operation for cancellation: ${jobId}`);
      return true;
    }

    return false;
  }

  /**
   * Get job status.
   */
  async getJobStatus(
    jobId: string,
  ): Promise<{ state: string; progress?: BulkOperationProgress; result?: BulkOperationJobResult } | null> {
    const job = await this.queue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();
    const progress = await this.getProgress(jobId);
    const result = state === 'completed' ? job.returnvalue : undefined;

    return { state, progress: progress || undefined, result };
  }

  /**
   * Get all active/pending bulk operations for a tenant.
   */
  async getOperationsForTenant(
    tenantId: string,
  ): Promise<Array<{ jobId: string; operation: BulkOperationType; emailCount: number; state: string }>> {
    const states: JobType[] = ['waiting', 'active', 'delayed'];
    const jobs = await this.queue.getJobs(states, 0, 100);

    const results: Array<{ jobId: string; operation: BulkOperationType; emailCount: number; state: string }> = [];

    for (const job of jobs) {
      if (job?.data?.tenantId === tenantId) {
        const state = await job.getState();
        results.push({
          jobId: job.id || '',
          operation: job.data.operation,
          emailCount: job.data.emailIds.length,
          state,
        });
      }
    }

    return results;
  }

  /**
   * Get queue status and metrics.
   */
  async getQueueStatus(): Promise<BulkOperationsQueueMetrics> {
    const baseMetrics = await this.getBaseMetrics();

    return {
      ...baseMetrics,
      totalEmailsProcessed: this.bulkMetrics.totalEmailsProcessed,
      avgBatchDurationMs: this.getAverageDuration(),
    };
  }
}

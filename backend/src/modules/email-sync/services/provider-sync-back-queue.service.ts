/**
 * ProviderSyncBackQueueService
 *
 * BullMQ queue service for syncing email state changes back to providers.
 * Extends BaseQueueService for common queue boilerplate.
 *
 * Key Features:
 * - Batches multiple operations on same email to reduce API calls
 * - Debounces rapid changes (e.g., quick mark read/unread toggles)
 * - Handles provider rate limits with exponential backoff
 * - Dead letter queue integration for failed syncs
 * - Tenant isolation and cleanup support
 *
 * CONSOLIDATION DC-5: Extends BaseQueueService to eliminate ~150 lines of boilerplate
 */
import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobType, JobsOptions } from 'bullmq';
import { QUEUE_NAMES } from '../../../common/config';
import { DeadLetterQueueService } from '../../../common/services/dead-letter-queue.service';
import { BaseQueueService, QueuePriority } from './base-queue.service';

/**
 * Supported sync-back actions
 */
export type SyncBackAction =
  | 'mark-read'
  | 'mark-unread'
  | 'star'
  | 'unstar'
  | 'delete'
  | 'archive'
  | 'move'
  | 'add-label'
  | 'remove-label'
  | 'flag'
  | 'unflag';

/**
 * Sync-back job data
 */
export interface SyncBackJobData {
  tenantId: string;
  providerId: string;
  providerType: 'google' | 'microsoft' | 'imap';
  action: SyncBackAction;
  emailIds: string[];
  /** External IDs (provider-specific message IDs) */
  externalIds?: string[];
  /** Target folder for move operations */
  targetFolder?: string;
  /** Label to add/remove */
  labelId?: string;
  /** Request timestamp for ordering */
  requestedAt: string;
  /** Priority (high for user-initiated, normal for background) */
  priority?: 'high' | 'normal';
  /** Retry count for tracking */
  retryCount?: number;
  /** Permanent delete flag - if true, permanently delete from provider (not just move to trash) */
  permanent?: boolean;
}

/**
 * Sync-back job result
 */
export interface SyncBackJobResult {
  success: boolean;
  action: SyncBackAction;
  emailIds: string[];
  syncedCount: number;
  failedCount: number;
  errors?: string[];
  durationMs: number;
}

/**
 * Queue metrics
 */
export interface SyncBackQueueMetrics {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  avgDurationMs: number;
  lastProcessedAt?: string;
  lastError?: string;
}

/**
 * Extended internal metrics for sync-back
 */
interface SyncBackMetrics {
  lastProcessedAt?: string;
}

@Injectable()
export class ProviderSyncBackQueueService extends BaseQueueService<SyncBackJobData, SyncBackJobResult> {
  private readonly syncBackMetrics: SyncBackMetrics = {};
  private readonly DEBOUNCE_DELAY_MS: number;

  constructor(
    configService: ConfigService,
    @Inject(forwardRef(() => DeadLetterQueueService))
    deadLetterQueue: DeadLetterQueueService,
  ) {
    super(configService, deadLetterQueue);
    this.DEBOUNCE_DELAY_MS = configService.get<number>('SYNC_BACK_DEBOUNCE_MS', 500);
  }

  // ==================== BaseQueueService Abstract Implementations ====================

  protected getQueueName(): string {
    return QUEUE_NAMES.PROVIDER_SYNC_BACK;
  }

  protected getQueuePriority(): QueuePriority {
    return 'HIGH'; // User-initiated operations
  }

  protected getJobDefaultOverrides(): Partial<JobsOptions> {
    return {
      attempts: 5, // More retries for provider operations
      backoff: {
        type: 'exponential',
        delay: 2000, // 2s, 4s, 8s, 16s, 32s
      },
    };
  }

  protected setupCustomEvents(): void {
    this.queueEvents.on('progress', ({ jobId, data }) => {
      this.logger.debug(`Sync-back job ${jobId} progress: ${JSON.stringify(data)}`);
    });
  }

  protected extractDlqMetadata(jobData: SyncBackJobData): Record<string, any> {
    return {
      providerId: jobData.providerId,
      providerType: jobData.providerType,
      action: jobData.action,
      emailCount: jobData.emailIds.length,
    };
  }

  // ==================== Override recordCompletion for lastProcessedAt ====================

  protected async recordCompletion(jobId: string): Promise<void> {
    await super.recordCompletion(jobId);
    this.syncBackMetrics.lastProcessedAt = new Date().toISOString();
  }

  // ==================== Sync-Back Business Logic ====================

  /**
   * Enqueue a sync-back operation.
   * Automatically deduplicates and batches operations on the same emails.
   */
  async enqueueSyncBack(data: SyncBackJobData): Promise<string> {
    const sortedIds = [...data.emailIds].sort().join('-');
    const jobId = `syncback-${data.providerId}-${data.action}-${sortedIds.substring(0, 50)}`;

    const existing = await this.queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'waiting' || state === 'delayed') {
        const existingIds = new Set(existing.data.emailIds);
        const newIds = data.emailIds.filter((id) => !existingIds.has(id));

        if (newIds.length > 0) {
          await existing.updateData({
            ...existing.data,
            emailIds: [...existing.data.emailIds, ...newIds],
            requestedAt: data.requestedAt,
          });
          this.logger.debug(`Merged ${newIds.length} emails into existing sync-back job ${jobId}`);
        }
        return existing.id || jobId;
      } else if (state === 'completed' || state === 'failed') {
        await existing.remove();
      }
    }

    const job = await this.queue.add(`sync-${data.action}`, data, {
      jobId,
      delay: this.DEBOUNCE_DELAY_MS,
      priority: data.priority === 'high' ? 1 : 5,
    });

    this.logger.log(
      `Queued sync-back: ${data.action} for ${data.emailIds.length} email(s) on ${data.providerType} [${job.id}]`,
    );

    return job.id || jobId;
  }

  /**
   * Enqueue multiple sync-back operations in bulk.
   */
  async enqueueBulkSyncBack(jobs: SyncBackJobData[]): Promise<string[]> {
    if (!jobs.length) return [];

    const jobIds: string[] = [];
    const grouped = new Map<string, SyncBackJobData>();

    for (const job of jobs) {
      const key = `${job.providerId}-${job.action}`;
      const existing = grouped.get(key);

      if (existing) {
        const mergedIds = new Set([...existing.emailIds, ...job.emailIds]);
        existing.emailIds = Array.from(mergedIds);
        if (job.externalIds) {
          const mergedExtIds = new Set([...(existing.externalIds || []), ...job.externalIds]);
          existing.externalIds = Array.from(mergedExtIds);
        }
      } else {
        grouped.set(key, { ...job });
      }
    }

    for (const groupedJob of grouped.values()) {
      const jobId = await this.enqueueSyncBack(groupedJob);
      jobIds.push(jobId);
    }

    this.logger.log(`Bulk queued ${jobIds.length} sync-back jobs (from ${jobs.length} requests)`);
    return jobIds;
  }

  /**
   * Get job status by ID.
   */
  async getJobStatus(
    jobId: string,
  ): Promise<{ state: string; result?: SyncBackJobResult; progress?: number } | null> {
    const job = await this.queue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();
    const result = job.returnvalue as SyncBackJobResult | undefined;
    const progress = typeof job.progress === 'number' ? job.progress : undefined;

    return { state, result, progress };
  }

  /**
   * Get queue status and metrics.
   */
  async getQueueStatus(): Promise<SyncBackQueueMetrics> {
    const baseMetrics = await this.getBaseMetrics();

    return {
      ...baseMetrics,
      avgDurationMs: this.getAverageDuration(),
      lastProcessedAt: this.syncBackMetrics.lastProcessedAt,
      lastError: this.baseMetrics.lastError,
    };
  }

  /**
   * Get pending sync-back jobs for a provider.
   */
  async getPendingJobsForProvider(providerId: string): Promise<SyncBackJobData[]> {
    const states: JobType[] = ['waiting', 'active', 'delayed'];
    const jobs = await this.queue.getJobs(states, 0, -1);
    return jobs.filter((job) => job?.data?.providerId === providerId).map((job) => job.data);
  }

  /**
   * Clear all failed jobs.
   */
  async clearFailedJobs(): Promise<number> {
    const failed = await this.queue.getJobs(['failed'], 0, -1);
    let cleared = 0;

    for (const job of failed) {
      await job.remove();
      cleared++;
    }

    if (cleared > 0) {
      this.logger.log(`Cleared ${cleared} failed sync-back jobs`);
    }

    return cleared;
  }
}

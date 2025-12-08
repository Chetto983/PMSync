/**
 * BulkOperationsWorker
 *
 * BullMQ worker that processes bulk email operations.
 * Handles large-scale operations like bulk delete, archive, mark-read, etc.
 *
 * Features:
 * - Chunked processing to avoid memory issues
 * - Progress tracking for long-running operations
 * - Cancellation support
 * - Optional sync-back to provider
 * - Error handling with partial completion
 */
import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  BulkOperationJobData,
  BulkOperationJobResult,
  BulkOperationProgress,
  BulkOperationsQueueService,
} from '../services/bulk-operations-queue.service';
import { ProviderSyncBackQueueService } from '../services/provider-sync-back-queue.service';
import { getRedisConnectionOptions, QUEUE_NAMES } from '../../../common/config';

@Injectable()
export class BulkOperationsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BulkOperationsWorker.name);
  private redisConnection: Redis;
  private worker: Worker<BulkOperationJobData, BulkOperationJobResult>;

  private readonly CONCURRENCY = 2; // Lower concurrency for bulk ops
  private readonly DEFAULT_CHUNK_SIZE = 50;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => BulkOperationsQueueService))
    private readonly queueService: BulkOperationsQueueService,
    @Inject(forwardRef(() => ProviderSyncBackQueueService))
    private readonly syncBackQueue: ProviderSyncBackQueueService,
  ) {}

  async onModuleInit() {
    const workersEnabled =
      (this.configService.get<string>('BULK_OPERATIONS_WORKERS_ENABLED') || 'true').toLowerCase() !==
      'false';

    if (!workersEnabled) {
      this.logger.warn('Bulk operations workers disabled via BULK_OPERATIONS_WORKERS_ENABLED=false');
      return;
    }

    const redisOptions = getRedisConnectionOptions();
    this.redisConnection = new Redis(redisOptions);

    this.worker = new Worker<BulkOperationJobData, BulkOperationJobResult>(
      QUEUE_NAMES.BULK_OPERATIONS,
      async (job: Job<BulkOperationJobData>) => this.processJob(job),
      {
        connection: this.redisConnection,
        concurrency: this.CONCURRENCY,
        limiter: {
          max: 5, // Max 5 bulk ops per minute
          duration: 60000,
        },
        lockDuration: 600000, // 10 minutes for large bulk operations
        stalledInterval: 120000,
      },
    );

    this.worker.on('completed', (job, result) => {
      this.logger.log(
        `Bulk operation ${job.id} completed: ${result.processed} processed, ${result.failed} failed`,
      );
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(`Bulk operation ${job?.id} failed: ${error.message}`);
    });

    this.worker.on('error', (error) => {
      this.logger.error(`Bulk operations worker error: ${error.message}`);
    });

    this.logger.log('Bulk operations worker started');
  }

  private async processJob(job: Job<BulkOperationJobData>): Promise<BulkOperationJobResult> {
    const startTime = Date.now();
    const {
      tenantId,
      providerId,
      providerType,
      operation,
      emailIds,
      targetFolderId,
      labelId,
      chunkSize = this.DEFAULT_CHUNK_SIZE,
      syncToProvider = true,
    } = job.data;

    this.logger.log(
      `Processing bulk ${operation}: ${emailIds.length} emails for provider ${providerId}`,
    );

    const errors: string[] = [];
    let processed = 0;
    let failed = 0;
    const startedAt = new Date().toISOString();

    // Update initial progress
    await this.updateProgress(job, {
      processed: 0,
      total: emailIds.length,
      percentage: 0,
      failed: 0,
      errors: [],
      startedAt,
    });

    try {
      // Process in chunks
      for (let i = 0; i < emailIds.length; i += chunkSize) {
        // Check for cancellation
        const currentData = await this.queue.getJob(job.id || '');
        if ((currentData?.data as any)?._cancelled) {
          this.logger.log(`Bulk operation ${job.id} cancelled at ${processed}/${emailIds.length}`);
          break;
        }

        const chunk = emailIds.slice(i, i + chunkSize);

        try {
          // Process chunk in local database
          await this.processChunk(tenantId, operation, chunk, { targetFolderId, labelId });
          processed += chunk.length;
        } catch (chunkError) {
          const errorMsg = chunkError instanceof Error ? chunkError.message : String(chunkError);
          errors.push(`Chunk ${Math.floor(i / chunkSize) + 1}: ${errorMsg}`);
          failed += chunk.length;
        }

        // Update progress
        const percentage = Math.round(((i + chunk.length) / emailIds.length) * 100);
        await this.updateProgress(job, {
          processed,
          total: emailIds.length,
          percentage,
          failed,
          errors,
          startedAt,
        });
      }

      // Queue sync-back to provider if enabled
      if (syncToProvider && processed > 0) {
        await this.enqueueSyncBack(tenantId, providerId, providerType, operation, emailIds.slice(0, processed), {
          targetFolderId,
          labelId,
        });
      }

      const durationMs = Date.now() - startTime;
      this.logger.log(
        `Bulk ${operation} completed: ${processed}/${emailIds.length} (${durationMs}ms)`,
      );

      return {
        success: failed === 0,
        processed,
        failed,
        errors,
        durationMs,
        completedAt: new Date().toISOString(),
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        processed,
        failed: emailIds.length - processed,
        errors: [...errors, errorMessage],
        durationMs,
        completedAt: new Date().toISOString(),
      };
    }
  }

  private get queue() {
    return this.queueService.getQueue();
  }

  private async updateProgress(job: Job<BulkOperationJobData>, progress: BulkOperationProgress): Promise<void> {
    await job.updateProgress(progress);
  }

  private async processChunk(
    tenantId: string,
    operation: BulkOperationJobData['operation'],
    emailIds: string[],
    options: { targetFolderId?: string; labelId?: string },
  ): Promise<void> {
    const { targetFolderId, labelId } = options;

    switch (operation) {
      case 'delete':
        await this.prisma.email.updateMany({
          where: { id: { in: emailIds }, tenantId },
          data: { isDeleted: true },
        });
        break;

      case 'archive':
        await this.prisma.email.updateMany({
          where: { id: { in: emailIds }, tenantId },
          data: { isArchived: true },
        });
        break;

      case 'mark-read':
        await this.prisma.email.updateMany({
          where: { id: { in: emailIds }, tenantId },
          data: { isRead: true },
        });
        break;

      case 'mark-unread':
        await this.prisma.email.updateMany({
          where: { id: { in: emailIds }, tenantId },
          data: { isRead: false },
        });
        break;

      case 'star':
        await this.prisma.email.updateMany({
          where: { id: { in: emailIds }, tenantId },
          data: { isStarred: true },
        });
        break;

      case 'unstar':
        await this.prisma.email.updateMany({
          where: { id: { in: emailIds }, tenantId },
          data: { isStarred: false },
        });
        break;

      case 'move':
        if (targetFolderId) {
          await this.prisma.email.updateMany({
            where: { id: { in: emailIds }, tenantId },
            data: { folder: targetFolderId },
          });
        }
        break;

      case 'spam':
        // Move to SPAM folder
        await this.prisma.email.updateMany({
          where: { id: { in: emailIds }, tenantId },
          data: { folder: 'SPAM' },
        });
        break;

      case 'not-spam':
        // Move out of SPAM to INBOX
        await this.prisma.email.updateMany({
          where: { id: { in: emailIds }, tenantId },
          data: { folder: 'INBOX' },
        });
        break;

      case 'add-label':
        if (labelId) {
          // Batch update: Add label to all emails where it's not already present
          // Using PostgreSQL array_append with a single query (fixes N+1)
          await this.prisma.$executeRaw`
            UPDATE "Email"
            SET labels = array_append(labels, ${labelId}::text)
            WHERE id = ANY(${emailIds}::uuid[])
            AND tenant_id = ${tenantId}::uuid
            AND NOT (${labelId}::text = ANY(labels))
          `;
        }
        break;

      case 'remove-label':
        if (labelId) {
          // Batch update: Remove label from all emails (fixes N+1)
          // Using PostgreSQL array_remove with a single query
          await this.prisma.$executeRaw`
            UPDATE "Email"
            SET labels = array_remove(labels, ${labelId}::text)
            WHERE id = ANY(${emailIds}::uuid[])
            AND tenant_id = ${tenantId}::uuid
            AND ${labelId}::text = ANY(labels)
          `;
        }
        break;

      default:
        throw new Error(`Unsupported bulk operation: ${operation}`);
    }
  }

  private async enqueueSyncBack(
    tenantId: string,
    providerId: string,
    providerType: 'google' | 'microsoft' | 'imap',
    operation: BulkOperationJobData['operation'],
    emailIds: string[],
    options: { targetFolderId?: string; labelId?: string },
  ): Promise<void> {
    // Map bulk operation to sync-back action
    const actionMap: Record<string, string> = {
      delete: 'delete',
      archive: 'archive',
      'mark-read': 'mark-read',
      'mark-unread': 'mark-unread',
      star: 'star',
      unstar: 'unstar',
      move: 'move',
      spam: 'delete', // Gmail moves spam to trash
      'not-spam': 'archive', // Move out of spam
      'add-label': 'add-label',
      'remove-label': 'remove-label',
    };

    const action = actionMap[operation];
    if (!action) {
      this.logger.debug(`No sync-back action for operation: ${operation}`);
      return;
    }

    await this.syncBackQueue.enqueueSyncBack({
      tenantId,
      providerId,
      providerType,
      action: action as any,
      emailIds,
      targetFolder: options.targetFolderId,
      labelId: options.labelId,
      requestedAt: new Date().toISOString(),
      priority: 'normal', // Background priority for bulk sync-back
    });

    this.logger.debug(
      `Queued sync-back for ${emailIds.length} emails: ${action}`,
    );
  }

  async onModuleDestroy() {
    this.logger.log('Shutting down bulk operations worker...');

    if (this.worker) {
      await this.worker.close();
    }

    if (this.redisConnection && this.redisConnection.status !== 'end') {
      await this.redisConnection.quit();
    }

    this.logger.log('Bulk operations worker stopped');
  }
}

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
 * - Distributed locking per tenant to prevent concurrent bulk ops
 *
 * PHASE 4 CONSOLIDATION: Now extends BaseWorker for shared lifecycle management.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  BulkOperationJobData,
  BulkOperationJobResult,
  BulkOperationProgress,
  BulkOperationsQueueService,
} from '../services/bulk-operations-queue.service';
import { ProviderSyncBackQueueService } from '../services/provider-sync-back-queue.service';
import { RedisLockService } from '../../../common/services/redis-lock.service';
import { KnowledgeBaseService } from '../../ai/services/knowledge-base.service';
import { QUEUE_NAMES, scaleForReplicas } from '../../../common/config';
import { BaseWorker, BaseWorkerConfig } from '../../../common/workers/base.worker';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping/tenant-context';

@Injectable()
export class BulkOperationsWorker extends BaseWorker<BulkOperationJobData, BulkOperationJobResult> {
  protected readonly logger = new Logger(BulkOperationsWorker.name);
  protected readonly workerName = 'bulk-operations';
  protected readonly envToggle = 'BULK_OPERATIONS_WORKERS_ENABLED';

  private readonly DEFAULT_CHUNK_SIZE = 50;
  // Lock TTL for bulk operations (10 minutes)
  private readonly BULK_LOCK_TTL = 600000;

  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly queueService: BulkOperationsQueueService,
    private readonly syncBackQueue: ProviderSyncBackQueueService,
    private readonly redisLock: RedisLockService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
  ) {
    super(configService);
  }

  protected getWorkerConfig(): BaseWorkerConfig {
    return {
      queueName: QUEUE_NAMES.BULK_OPERATIONS,
      concurrency: scaleForReplicas(2), // Lower concurrency for bulk ops, scaled for replicas
      lockDuration: 600000, // 10 minutes for large bulk operations
      stalledInterval: 120000,
      limiter: {
        max: 5, // Max 5 bulk ops per minute
        duration: 60000,
      },
    };
  }

  protected formatCompletedLog(job: Job<BulkOperationJobData>, result: BulkOperationJobResult): string {
    return `${job.data.operation}: ${result.processed} processed, ${result.failed} failed`;
  }

  /**
   * Process bulk operation with distributed locking per tenant
   *
   * RACE CONDITION FIX: Prevents concurrent bulk operations on the same
   * tenant which could cause database contention.
   */
  protected async processJob(job: Job<BulkOperationJobData>): Promise<BulkOperationJobResult> {
    return withoutTenantScopingAsync(() => this.executeBulkOperation(job));
  }

  private async executeBulkOperation(job: Job<BulkOperationJobData>): Promise<BulkOperationJobResult> {
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
      permanent = false, // FIX L1: Extract permanent flag
    } = job.data;

    // Generate lock key per tenant+provider+operation to prevent concurrent bulk ops
    // This ensures different providers can run concurrently but same provider is serialized
    const lockKey = this.generateLockKey('bulk', `${tenantId}:${providerId}:${operation}`);

    this.logger.log(
      `Processing bulk ${operation}: ${emailIds.length} emails for provider ${providerId}`,
    );

    // IF-H5: Validate all emailIds belong to the tenantId (security boundary check)
    const validCount = await this.prisma.email.count({
      where: { id: { in: emailIds }, tenantId },
    });
    if (validCount !== emailIds.length) {
      const invalidCount = emailIds.length - validCount;
      this.logger.error(
        `IF-H5: Bulk ${operation} rejected — ${invalidCount}/${emailIds.length} emails do not belong to tenant ${tenantId}`,
      );
      return {
        success: false,
        processed: 0,
        failed: emailIds.length,
        errors: [`${invalidCount} email(s) do not belong to tenant ${tenantId}`],
        durationMs: Date.now() - startTime,
        completedAt: new Date().toISOString(),
      };
    }

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
      // Acquire distributed lock per tenant+provider+operation
      // This prevents concurrent bulk ops on the same provider that could overwhelm the API
      return await this.redisLock.withLock(
        lockKey,
        this.BULK_LOCK_TTL,
        async () => {
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
              await this.processChunk(tenantId, operation, chunk, { targetFolderId, labelId, permanent });
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
              permanent, // FIX: Pass permanent flag to provider sync-back
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
        },
        { maxRetries: 5, baseDelayMs: 200, maxDelayMs: 5000 }
      );
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
    options: { targetFolderId?: string; labelId?: string; permanent?: boolean },
  ): Promise<void> {
    const { targetFolderId, labelId, permanent } = options;

    switch (operation) {
      case 'delete':
        // FIX L1: Honor permanent flag for hard vs soft delete
        if (permanent) {
          // Hard delete - permanently remove from database (DB cascade handles embeddings)
          await this.prisma.email.deleteMany({
            where: { id: { in: emailIds }, tenantId },
          });
        } else {
          // Soft delete - mark as deleted (can be recovered from trash)
          await this.prisma.email.updateMany({
            where: { id: { in: emailIds }, tenantId },
            data: { isDeleted: true },
          });
          // E1 FIX: Immediate embedding cleanup (fire-and-forget, non-blocking)
          // Removes reliance on the 30-min scheduled cleanup job
          this.knowledgeBaseService
            .deleteEmbeddingsForEmails(tenantId, emailIds)
            .catch((err) =>
              this.logger.warn(
                `Embedding cleanup failed for bulk soft-delete (${emailIds.length} emails): ${err instanceof Error ? err.message : String(err)}`,
              ),
            );
        }
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
    options: { targetFolderId?: string; labelId?: string; permanent?: boolean },
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
      permanent: options.permanent, // FIX: Pass permanent flag for hard delete on provider
    });

    this.logger.debug(
      `Queued sync-back for ${emailIds.length} emails: ${action}`,
    );
  }

}

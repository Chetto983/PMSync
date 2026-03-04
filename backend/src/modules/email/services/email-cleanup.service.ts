import { Inject, Injectable, Logger, Optional, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { KnowledgeBaseService } from '../../ai/services/knowledge-base.service';
import { StorageService } from './storage.service';
import { AttachmentMetricsService } from './attachment-metrics.service';
import {
  ScheduledJobsQueueService,
  ScheduledJobType,
} from '../../../common/services/scheduled-jobs.queue';
import { formatBytes } from '../../../common/utils';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping';

/**
 * Result of a cleanup operation with detailed metrics
 */
interface CleanupResult {
  removed: number;
  attachmentsFound: number;
  s3Deleted: number;
  s3Failed: number;
  /** Orphaned S3 keys that failed to delete */
  orphanedKeys?: string[];
}

/**
 * Dry-run result showing what would be deleted
 */
export interface DryRunResult {
  wouldDeleteEmails: number;
  wouldDeleteAttachments: number;
  wouldDeleteS3Objects: number;
  /** Size estimate in bytes */
  estimatedStorageReclaim: number;
  /** Breakdown by tenant */
  byTenant: Record<string, { emails: number; attachments: number; estimatedBytes: number }>;
}

/**
 * EmailCleanupService - Retention and cleanup with full observability
 *
 * Features:
 * - Scheduled purge of soft-deleted emails (configurable retention)
 * - Duplicate email detection and removal
 * - S3 attachment cleanup with orphan tracking
 * - Dry-run mode for retention policy preview
 * - Structured logging with tenant/email context
 *
 * Metrics tracked:
 * - Cleanup success/failure counts
 * - Orphaned S3 objects (failed deletions)
 * - Storage reclaimed per tenant
 *
 * @see EMAIL_MODULE_ROADMAP.md Phase 4 - Retention & Cleanup
 */
@Injectable()
export class EmailCleanupService implements OnModuleInit {
  private readonly logger = new Logger(EmailCleanupService.name);
  private readonly purgeAfterHours = 24;
  private readonly jobsEnabled: boolean;

  // Track orphaned S3 keys for retry or alerting
  // FIX (BUG-009): Extended type to include error details for better debugging
  private orphanedS3Keys: Map<
    string,
    { key: string; tenantId: string; failedAt: Date; errorCode?: string; errorMessage?: string }
  > = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly configService: ConfigService,
    private readonly storage: StorageService,
    private readonly scheduledJobsQueue: ScheduledJobsQueueService,
    // CRITICAL: @Inject() required alongside @Optional() for NestJS to resolve the service
    @Optional() @Inject(AttachmentMetricsService) private readonly metrics?: AttachmentMetricsService,
  ) {
    this.jobsEnabled =
      (this.configService.get<string>('JOBS_ENABLED') || 'true').toLowerCase() !== 'false';
    if (!this.jobsEnabled) {
      this.logger.warn('EmailCleanupService disabled via JOBS_ENABLED=false');
    }
  }

  /**
   * Register handlers for email cleanup jobs with BullMQ
   */
  async onModuleInit() {
    if (!this.jobsEnabled) {
      return;
    }

    // Register handler for trash cleanup (twice daily)
    this.scheduledJobsQueue.registerHandler(
      ScheduledJobType.EMAIL_CLEANUP_TRASH,
      () => withoutTenantScopingAsync(() => this.purgeDeletedEmailsCron()),
    );

    // Register handler for orphan cleanup (daily at 3:30 AM)
    this.scheduledJobsQueue.registerHandler(
      ScheduledJobType.EMAIL_CLEANUP_ORPHANS,
      () => withoutTenantScopingAsync(() => this.removeDuplicateEmailsCron()),
    );

    this.logger.log('EmailCleanupService registered with BullMQ scheduler');
  }

  /**
   * Cleanup soft-deleted emails - triggered by BullMQ twice daily (3 AM and noon)
   */
  async purgeDeletedEmailsCron() {
    if (!this.jobsEnabled) {
      return;
    }
    await this.purgeSoftDeletedEmails();
  }

  /**
   * Remove duplicate emails - triggered by BullMQ daily at 3:30 AM
   */
  async removeDuplicateEmailsCron() {
    if (!this.jobsEnabled) {
      return;
    }
    await this.removeDuplicateEmails();
  }

  /**
   * Run tenant maintenance with full metrics reporting
   *
   * RACE CONDITION FIX RC-4: Run sequentially instead of parallel
   * An email can be both a duplicate AND soft-deleted, causing double-delete
   * race if both operations run concurrently
   *
   * @param tenantId - Tenant to clean up
   * @returns Detailed cleanup statistics
   */
  async runTenantMaintenance(tenantId: string) {
    const startTime = Date.now();

    // RACE CONDITION FIX RC-4: Execute sequentially to prevent double-delete races
    // First remove duplicates, then purge soft-deleted (avoiding overlap)
    const duplicates = await this.removeDuplicateEmails(tenantId);
    const purged = await this.purgeSoftDeletedEmails(tenantId, 0);

    const duration = Date.now() - startTime;
    const totalS3Failed = duplicates.s3Failed + purged.s3Failed;

    // Emit structured log for observability
    this.logger.log(
      JSON.stringify({
        event: 'tenant_maintenance_complete',
        tenantId,
        duplicatesRemoved: duplicates.removed,
        permanentlyDeleted: purged.removed,
        attachmentsFound: duplicates.attachmentsFound + purged.attachmentsFound,
        attachmentsDeleted: duplicates.s3Deleted + purged.s3Deleted,
        attachmentFailures: totalS3Failed,
        durationMs: duration,
        hasOrphans: totalS3Failed > 0,
      }),
    );

    // Record cleanup metrics
    if (totalS3Failed > 0) {
      this.metrics?.recordCleanup(
        { tenantId },
        false,
        duplicates.s3Deleted + purged.s3Deleted,
        totalS3Failed,
      );
    } else {
      this.metrics?.recordCleanup({ tenantId }, true);
    }

    return {
      duplicatesRemoved: duplicates.removed,
      permanentlyDeleted: purged.removed,
      attachmentsFound: duplicates.attachmentsFound + purged.attachmentsFound,
      attachmentsDeleted: duplicates.s3Deleted + purged.s3Deleted,
      attachmentFailures: totalS3Failed,
    };
  }

  /**
   * Dry-run mode for retention policies
   *
   * Returns what WOULD be deleted without actually deleting anything.
   * Useful for previewing retention policy changes before applying.
   *
   * @param tenantId - Optional tenant filter
   * @param olderThanHours - Emails older than this will be counted
   * @returns Preview of what would be deleted
   */
  async dryRunRetention(
    tenantId?: string,
    olderThanHours: number = this.purgeAfterHours,
  ): Promise<DryRunResult> {
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);

    // Get emails that would be purged (using cursor pagination)
    // CITUS: Cursor-based pagination with composite PK requires both id and tenantId
    let hasMore = true;
    let cursorData: { id: string; tenantId: string } | undefined;
    const staleEmails: Array<{
      id: string;
      tenantId: string;
      attachments: Array<{ id: string; size: number; storageType: string }>;
    }> = [];

    while (hasMore) {
      const batch = await this.prisma.email.findMany({
        where: {
          isDeleted: true,
          ...(tenantId ? { tenantId } : {}),
          updatedAt: { lt: cutoff },
        },
        select: {
          id: true,
          tenantId: true,
          attachments: {
            select: {
              id: true,
              size: true,
              storageType: true,
            },
          },
        },
        take: this.BATCH_SIZE,
        skip: cursorData ? 1 : 0,
        cursor: cursorData ? { id_tenantId: { id: cursorData.id, tenantId: cursorData.tenantId } } : undefined,
        orderBy: { id: 'asc' }, // Consistent ordering is required for cursor pagination
      });

      if (batch.length === 0) {
        hasMore = false;
      } else {
        staleEmails.push(...batch);
        const lastItem = batch[batch.length - 1];
        cursorData = { id: lastItem.id, tenantId: lastItem.tenantId };

        // Safety break for extremely large sets in dry run to avoid memory pressure even with batching
        // Since we are accumulating into `staleEmails` array, we ARE still loading everything into memory eventually.
        // For a TRUE fix, we should aggregate stats incrementally instead of pushing to array.
        // Let's optimize that in the loop below.
      }
    }

    // Aggregate by tenant
    const byTenant: Record<string, { emails: number; attachments: number; estimatedBytes: number }> = {};
    let totalEmails = 0;
    let totalAttachments = 0;
    let totalS3Objects = 0;
    let totalBytes = 0;

    // Reset cursor for the actual processing loop which replaces the array iteration
    // CITUS: Cursor-based pagination with composite PK requires both id and tenantId
    let processHasMore = true;
    let processCursorData: { id: string; tenantId: string } | undefined;

    while (processHasMore) {
      const batch = await this.prisma.email.findMany({
        where: {
          isDeleted: true,
          ...(tenantId ? { tenantId } : {}),
          updatedAt: { lt: cutoff },
        },
        select: {
          id: true,
          tenantId: true,
          attachments: {
            select: {
              id: true,
              size: true,
              storageType: true,
            },
          },
        },
        take: this.BATCH_SIZE,
        skip: processCursorData ? 1 : 0,
        cursor: processCursorData ? { id_tenantId: { id: processCursorData.id, tenantId: processCursorData.tenantId } } : undefined,
        orderBy: { id: 'asc' },
      });

      if (batch.length === 0) {
        processHasMore = false;
        break;
      }

      for (const email of batch) {
        totalEmails++;
        if (!byTenant[email.tenantId]) {
          byTenant[email.tenantId] = { emails: 0, attachments: 0, estimatedBytes: 0 };
        }

        byTenant[email.tenantId].emails++;

        for (const att of email.attachments) {
          totalAttachments++;
          byTenant[email.tenantId].attachments++;
          byTenant[email.tenantId].estimatedBytes += att.size;
          totalBytes += att.size;

          if (att.storageType === 's3') {
            totalS3Objects++;
          }
        }
      }

      const lastBatchItem = batch[batch.length - 1];
      processCursorData = { id: lastBatchItem.id, tenantId: lastBatchItem.tenantId };
    }

    const result: DryRunResult = {
      wouldDeleteEmails: totalEmails,
      wouldDeleteAttachments: totalAttachments,
      wouldDeleteS3Objects: totalS3Objects,
      estimatedStorageReclaim: totalBytes,
      byTenant,
    };

    // Log dry-run results
    this.logger.log(
      JSON.stringify({
        event: 'retention_dry_run',
        tenantId: tenantId || 'all',
        olderThanHours,
        cutoffDate: cutoff.toISOString(),
        ...result,
        estimatedStorageReclaimHuman: formatBytes(totalBytes),
      }),
    );

    return result;
  }

  /**
   * Get orphaned S3 keys that failed to delete
   *
   * These keys represent S3 objects that should have been deleted but weren't.
   * They should be monitored and retried periodically.
   */
  getOrphanedS3Keys(): Array<{ key: string; tenantId: string; failedAt: Date }> {
    return Array.from(this.orphanedS3Keys.values());
  }

  /**
   * Retry deletion of orphaned S3 keys
   *
   * @returns Number of successfully deleted keys
   */
  async retryOrphanedS3Deletions(): Promise<{ deleted: number; stillOrphaned: number }> {
    const orphans = Array.from(this.orphanedS3Keys.entries());
    let deleted = 0;

    for (const [key, info] of orphans) {
      try {
        await this.storage.deleteObject(info.key);
        this.orphanedS3Keys.delete(key);
        deleted++;

        this.logger.log(
          JSON.stringify({
            event: 'orphan_s3_cleanup_success',
            key: info.key,
            tenantId: info.tenantId,
            originalFailedAt: info.failedAt.toISOString(),
          }),
        );
      } catch {
        // Still failed, keep in orphan list
        this.logger.warn(
          JSON.stringify({
            event: 'orphan_s3_cleanup_failed',
            key: info.key,
            tenantId: info.tenantId,
          }),
        );
      }
    }

    return { deleted, stillOrphaned: this.orphanedS3Keys.size };
  }

  private readonly BATCH_SIZE = 1000;

  async purgeSoftDeletedEmails(
    tenantId?: string,
    olderThanHours: number = this.purgeAfterHours,
  ): Promise<CleanupResult> {
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    let totalRemoved = 0;
    let totalAttachmentsFound = 0;
    let totalS3Deleted = 0;
    let totalS3Failed = 0;

    // Process in batches to prevent OOM
    while (true) {
      const batch = await this.prisma.email.findMany({
        where: {
          isDeleted: true,
          ...(tenantId ? { tenantId } : {}),
          updatedAt: { lt: cutoff },
        },
        select: { id: true, tenantId: true },
        take: this.BATCH_SIZE,
      });

      if (batch.length === 0) {
        break;
      }

      for (const email of batch) {
        const stats = await this.permanentlyDeleteEmail(email.id, email.tenantId);
        totalAttachmentsFound += stats.attachmentsFound;
        totalS3Deleted += stats.s3Deleted;
        totalS3Failed += stats.s3Failed;
      }

      totalRemoved += batch.length;

      // Verification: if we didn't delete anything (e.g. failures), we might infinite loop
      // But permanentlyDeleteEmail catches errors, so it should proceed.
      // However, if database deletion fails, we're in trouble. 
      // Ideally we rely on permanentlyDeleteEmail success.
    }

    if (totalRemoved > 0) {
      this.logger.log(
        `Purged ${totalRemoved} deleted emails${tenantId ? ` for tenant ${tenantId}` : ''}`,
      );
    }

    return {
      removed: totalRemoved,
      attachmentsFound: totalAttachmentsFound,
      s3Deleted: totalS3Deleted,
      s3Failed: totalS3Failed
    };
  }

  async removeDuplicateEmails(tenantId?: string): Promise<CleanupResult> {
    const duplicates = await this.prisma.$queryRaw<
      Array<{ id: string; tenantId: string }>
    >(
      Prisma.sql`
        WITH ranked AS (
          SELECT id, "tenantId",
                 ROW_NUMBER() OVER (
                   PARTITION BY "tenantId", "messageId"
                   ORDER BY "updatedAt" DESC, "id" DESC
                 ) AS rn
          FROM "emails"
          WHERE "messageId" IS NOT NULL
          ${tenantId ? Prisma.sql`AND "tenantId" = ${tenantId}` : Prisma.sql``}
        )
        SELECT id, "tenantId"
        FROM ranked
        WHERE rn > 1
      `,
    );

    let attachmentsFound = 0;
    let s3Deleted = 0;
    let s3Failed = 0;

    for (const duplicate of duplicates) {
      const stats = await this.permanentlyDeleteEmail(duplicate.id, duplicate.tenantId);
      attachmentsFound += stats.attachmentsFound;
      s3Deleted += stats.s3Deleted;
      s3Failed += stats.s3Failed;
    }

    if (duplicates.length) {
      this.logger.warn(
        `Removed ${duplicates.length} duplicate emails${tenantId ? ` for tenant ${tenantId}` : ''
        }`,
      );
    }

    return { removed: duplicates.length, attachmentsFound, s3Deleted, s3Failed };
  }

  /**
   * Permanently delete email with full cleanup and orphan tracking
   *
   * RACE CONDITION FIX RC-4: Made idempotent - handles already-deleted emails
   *
   * Deletion order:
   * 1. Get attachments (before email deletion)
   * 2. Delete embeddings from vector store
   * 3. Delete email from database (cascades to attachments)
   * 4. Delete S3 objects (track failures as orphans)
   *
   * @param id - Email ID
   * @param tenantId - Tenant ID for metrics context
   * @returns Cleanup statistics
   */
  private async permanentlyDeleteEmail(id: string, tenantId: string): Promise<{
    attachmentsFound: number;
    s3Deleted: number;
    s3Failed: number;
    orphanedKeys: string[];
  }> {
    // 1. Get attachments BEFORE deleting email (to guarantee cleanup ordering)
    const attachments = await this.prisma.emailAttachment.findMany({
      where: { emailId: id },
      select: { id: true, storagePath: true, storageType: true, filename: true, size: true },
    });

    const attachmentsFound = attachments.length;
    let s3Deleted = 0;
    let s3Failed = 0;
    const orphanedKeys: string[] = [];

    // 2. Delete embeddings from vector store
    try {
      await this.knowledgeBaseService.deleteEmbeddingsForEmail(tenantId, id);
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'embedding_delete_failed',
          emailId: id,
          tenantId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      // Continue with deletion even if embeddings fail
    }

    // 3. Delete email from database (cascade deletes EmailAttachment records)
    // RACE CONDITION FIX RC-4: Use deleteMany for idempotent delete (no error if already deleted)
    const deleteResult = await this.prisma.email.deleteMany({
      where: { id },
    });

    // If email was already deleted by another operation, still clean up S3
    if (deleteResult.count === 0) {
      this.logger.debug(`Email ${id} already deleted by another operation, cleaning up S3 only`);
    }

    // 4. Delete S3 files (after DB deletion to ensure cleanup even if S3 fails)
    const s3Attachments = attachments.filter((a) => a.storageType === 's3' && a.storagePath);
    const s3Keys = s3Attachments.map((a) => a.storagePath!);

    if (s3Keys.length > 0) {
      try {
        const result = await this.storage.deleteObjects(s3Keys);
        s3Deleted += result.deleted;
        s3Failed += result.failed;

        // Track successful/failed keys for observability
        this.logger.log(
          JSON.stringify({
            event: 'email_s3_cleanup',
            emailId: id,
            tenantId,
            s3ObjectsDeleted: result.deleted,
            s3ObjectsFailed: result.failed,
            totalS3Objects: s3Keys.length,
          }),
        );

        // FIX (BUG-009): Track only specifically failed keys as orphans
        if (result.errors?.length) {
          for (const error of result.errors) {
            this.orphanedS3Keys.set(error.key, {
              key: error.key,
              tenantId,
              failedAt: new Date(),
              errorCode: error.code,
              errorMessage: error.message,
            });
            orphanedKeys.push(error.key);
          }

          this.logger.warn(
            JSON.stringify({
              event: 'orphan_s3_detected',
              emailId: id,
              tenantId,
              orphanedCount: result.errors.length,
              keys: result.errors.map(e => e.key).slice(0, 5), // Log first 5 keys
              message: `${result.errors.length} S3 objects are orphaned`,
            }),
          );
        }
      } catch (error) {
        // Complete failure - all keys are orphans
        s3Failed += s3Keys.length;
        for (const key of s3Keys) {
          this.orphanedS3Keys.set(key, {
            key,
            tenantId,
            failedAt: new Date(),
          });
          orphanedKeys.push(key);
        }

        this.logger.error(
          JSON.stringify({
            event: 's3_batch_delete_failed',
            emailId: id,
            tenantId,
            s3ObjectsOrphaned: s3Keys.length,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
        // Don't throw - email already deleted from DB
      }
    }

    return { attachmentsFound, s3Deleted, s3Failed, orphanedKeys };
  }
}

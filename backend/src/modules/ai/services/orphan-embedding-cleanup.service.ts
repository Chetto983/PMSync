/**
 * Orphan Embedding Cleanup Service
 *
 * Cleans up embeddings with null emailId AND null contactId.
 * These are orphans from deleted content that were not properly cleaned up.
 *
 * Schedule: Weekly on Sunday at 2 AM (via BullMQ repeatable job)
 * Batch size: 500 embeddings per batch
 * Safety limit: 20 batches per run (10k embeddings max)
 *
 * @see PERF-03 in v2.0 roadmap
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  ScheduledJobsQueueService,
  ScheduledJobType,
} from '../../../common/services/scheduled-jobs.queue';

@Injectable()
export class OrphanEmbeddingCleanupService implements OnModuleInit {
  private readonly logger = new Logger(OrphanEmbeddingCleanupService.name);
  private readonly BATCH_SIZE = 500;
  private readonly MAX_BATCHES = 20; // Safety limit: 10k embeddings per run
  private readonly jobsEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly scheduledJobsQueue: ScheduledJobsQueueService,
  ) {
    this.jobsEnabled =
      (this.configService.get<string>('JOBS_ENABLED') || 'true').toLowerCase() !==
      'false';
  }

  async onModuleInit(): Promise<void> {
    if (!this.jobsEnabled) {
      this.logger.warn(
        'OrphanEmbeddingCleanupService disabled via JOBS_ENABLED=false',
      );
      return;
    }

    this.scheduledJobsQueue.registerHandler(
      ScheduledJobType.ORPHAN_EMBEDDING_CLEANUP,
      () => withoutTenantScopingAsync(() => this.cleanupOrphanEmbeddings()),
    );

    this.logger.log(
      'OrphanEmbeddingCleanupService registered with BullMQ scheduler',
    );
  }

  /**
   * Cleanup embeddings with null emailId AND null contactId.
   * These are orphans from deleted content that were not properly cleaned up.
   *
   * Uses indexed fields (emailId, contactId) - NOT metadata JSONB queries.
   * This ensures O(log n) index lookups rather than O(n) full table scans.
   */
  async cleanupOrphanEmbeddings(): Promise<{ deleted: number; batches: number }> {
    if (!this.jobsEnabled) {
      return { deleted: 0, batches: 0 };
    }

    let totalDeleted = 0;
    let batches = 0;

    this.logger.log('Starting orphan embedding cleanup...');

    while (true) {
      // Use indexed fields (emailId, contactId) - NOT metadata JSONB queries
      const orphans = await this.prisma.embedding.findMany({
        where: {
          emailId: null,
          contactId: null,
        },
        select: { id: true, tenantId: true },
        take: this.BATCH_SIZE,
      });

      if (orphans.length === 0) {
        break;
      }

      // Delete in batch using compound key (id + tenantId)
      const deleted = await this.prisma.embedding.deleteMany({
        where: {
          OR: orphans.map((o) => ({ id: o.id, tenantId: o.tenantId })),
        },
      });

      totalDeleted += deleted.count;
      batches++;

      this.logger.log(
        `Deleted ${deleted.count} orphan embeddings (batch ${batches})`,
      );

      // Safety limit: max batches per run
      if (batches >= this.MAX_BATCHES) {
        this.logger.warn(
          `Reached batch limit (${this.MAX_BATCHES}), stopping cleanup. Will continue next run.`,
        );
        break;
      }
    }

    this.logger.log(
      `Orphan embedding cleanup complete: ${totalDeleted} deleted in ${batches} batches`,
    );
    return { deleted: totalDeleted, batches };
  }
}

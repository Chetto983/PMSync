import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { KnowledgeBaseService } from './knowledge-base.service';
import {
  ScheduledJobsQueueService,
  ScheduledJobType,
} from '../../../common/services/scheduled-jobs.queue';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping';

interface DeletedEmailRecord {
  id: string;
  tenantId: string;
  metadata: Record<string, any> | null;
}

@Injectable()
export class EmailEmbeddingCleanupService implements OnModuleInit {
  private readonly logger = new Logger(EmailEmbeddingCleanupService.name);
  private readonly BATCH_SIZE = 200;
  private readonly jobsEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly configService: ConfigService,
    private readonly scheduledJobsQueue: ScheduledJobsQueueService,
  ) {
    this.jobsEnabled =
      (this.configService.get<string>('JOBS_ENABLED') || 'true').toLowerCase() !== 'false';
    if (!this.jobsEnabled) {
      this.logger.warn('EmailEmbeddingCleanupService disabled via JOBS_ENABLED=false');
    }
  }

  /**
   * Register handlers for embedding cleanup jobs with BullMQ
   */
  async onModuleInit() {
    if (!this.jobsEnabled) {
      return;
    }

    this.scheduledJobsQueue.registerHandler(
      ScheduledJobType.EMAIL_EMBEDDING_CLEANUP,
      () => withoutTenantScopingAsync(() => this.cleanupDeletedEmailEmbeddings()),
    );

    this.logger.log('EmailEmbeddingCleanupService registered with BullMQ scheduler');
  }

  /**
   * Cleanup embeddings for deleted emails - triggered by BullMQ every 30 minutes
   */
  async cleanupDeletedEmailEmbeddings(): Promise<void> {
    if (!this.jobsEnabled) {
      return;
    }

    const emails = await this.prisma.email.findMany({
      where: {
        isDeleted: true,
        NOT: {
          metadata: {
            path: ['embeddingCleanup', 'status'],
            equals: 'done',
          },
        },
      },
      select: {
        id: true,
        tenantId: true,
        metadata: true,
      },
      take: this.BATCH_SIZE,
    });

    if (emails.length === 0) {
      return;
    }

    this.logger.debug(
      `Cleaning embeddings for ${emails.length} deleted email(s).`,
    );

    // BULK FIX: Batch-delete all embeddings in one call per tenant instead of N individual calls
    const emailsByTenant = new Map<string, DeletedEmailRecord[]>();
    for (const email of emails) {
      const list = emailsByTenant.get(email.tenantId) ?? [];
      list.push(email as DeletedEmailRecord);
      emailsByTenant.set(email.tenantId, list);
    }

    const nowIso = new Date().toISOString();
    const successIds: string[] = [];
    const failedIds: { id: string; tenantId: string; error: string }[] = [];

    for (const [tenantId, tenantEmails] of emailsByTenant) {
      const emailIds = tenantEmails.map((e) => e.id);
      try {
        await this.knowledgeBaseService.deleteEmbeddingsForEmails(tenantId, emailIds);
        successIds.push(...emailIds);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Batch embedding cleanup failed for tenant ${tenantId}: ${message}`);
        for (const id of emailIds) {
          failedIds.push({ id, tenantId, error: message });
        }
      }
    }

    // Batch-update metadata for successful cleanups
    if (successIds.length > 0) {
      try {
        await this.prisma.$executeRaw`
          UPDATE "emails"
          SET "metadata" = COALESCE("metadata", '{}'::jsonb) || ${JSON.stringify({
            embeddingCleanup: { status: 'done', lastRunAt: nowIso },
          })}::jsonb
          WHERE "id" = ANY(${successIds})
        `;
      } catch (error) {
        this.logger.warn(`Batch metadata update failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Batch-update metadata for failed cleanups
    if (failedIds.length > 0) {
      const failedEmailIds = failedIds.map((f) => f.id);
      try {
        await this.prisma.$executeRaw`
          UPDATE "emails"
          SET "metadata" = COALESCE("metadata", '{}'::jsonb) || ${JSON.stringify({
            embeddingCleanup: { status: 'error', lastRunAt: nowIso },
          })}::jsonb
          WHERE "id" = ANY(${failedEmailIds})
        `;
      } catch (error) {
        this.logger.warn(`Batch error metadata update failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  // cleanupForEmail removed — replaced by batch operations in cleanupDeletedEmailEmbeddings()
}

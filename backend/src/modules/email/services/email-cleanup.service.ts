import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { KnowledgeBaseService } from '../../ai/services/knowledge-base.service';
import { StorageService } from './storage.service';

interface CleanupResult {
  removed: number;
  attachmentsFound: number;
  s3Deleted: number;
  s3Failed: number;
}

@Injectable()
export class EmailCleanupService {
  private readonly logger = new Logger(EmailCleanupService.name);
  private readonly purgeAfterHours = 24;
  private readonly jobsEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly configService: ConfigService,
    private readonly storage: StorageService,
  ) {
    this.jobsEnabled =
      (this.configService.get<string>('JOBS_ENABLED') || 'true').toLowerCase() !== 'false';
    if (!this.jobsEnabled) {
      this.logger.warn('EmailCleanupService disabled via JOBS_ENABLED=false');
    }
  }

  // Run cleanup twice daily: at 3 AM and at noon (12 PM)
  @Cron('0 3,12 * * *')
  async purgeDeletedEmailsCron() {
    if (!this.jobsEnabled) {
      return;
    }
    await this.purgeSoftDeletedEmails();
  }

  @Cron('0 30 3 * * *')
  async removeDuplicateEmailsCron() {
    if (!this.jobsEnabled) {
      return;
    }
    await this.removeDuplicateEmails();
  }

  async runTenantMaintenance(tenantId: string) {
    const [duplicates, purged] = await Promise.all([
      this.removeDuplicateEmails(tenantId),
      this.purgeSoftDeletedEmails(tenantId, 0),
    ]);

    return {
      duplicatesRemoved: duplicates.removed,
      permanentlyDeleted: purged.removed,
      attachmentsFound: duplicates.attachmentsFound + purged.attachmentsFound,
      attachmentsDeleted: duplicates.s3Deleted + purged.s3Deleted,
      attachmentFailures: duplicates.s3Failed + purged.s3Failed,
    };
  }

  async purgeSoftDeletedEmails(
    tenantId?: string,
    olderThanHours: number = this.purgeAfterHours,
  ): Promise<CleanupResult> {
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);

    const staleEmails = await this.prisma.email.findMany({
      where: {
        isDeleted: true,
        ...(tenantId ? { tenantId } : {}),
        updatedAt: { lt: cutoff },
      },
      select: { id: true, tenantId: true },
    });

    let attachmentsFound = 0;
    let s3Deleted = 0;
    let s3Failed = 0;

    for (const email of staleEmails) {
      const stats = await this.permanentlyDeleteEmail(email.id, email.tenantId);
      attachmentsFound += stats.attachmentsFound;
      s3Deleted += stats.s3Deleted;
      s3Failed += stats.s3Failed;
    }

    if (staleEmails.length) {
      this.logger.log(
        `Purged ${staleEmails.length} deleted emails${
          tenantId ? ` for tenant ${tenantId}` : ''
        }`,
      );
    }

    return { removed: staleEmails.length, attachmentsFound, s3Deleted, s3Failed };
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
        `Removed ${duplicates.length} duplicate emails${
          tenantId ? ` for tenant ${tenantId}` : ''
        }`,
      );
    }

    return { removed: duplicates.length, attachmentsFound, s3Deleted, s3Failed };
  }

  private async permanentlyDeleteEmail(id: string, tenantId: string): Promise<{
    attachmentsFound: number;
    s3Deleted: number;
    s3Failed: number;
  }> {
    // 1. Get attachments BEFORE deleting email (to guarantee cleanup ordering)
    const attachments = await this.prisma.emailAttachment.findMany({
      where: { emailId: id },
      select: { id: true, storagePath: true, storageType: true, filename: true },
    });

    const attachmentsFound = attachments.length;
    let s3Deleted = 0;
    let s3Failed = 0;

    // 2. Delete embeddings
    try {
      await this.knowledgeBaseService.deleteEmbeddingsForEmail(tenantId, id);
    } catch (error) {
      this.logger.warn(
        `Failed to delete embeddings for email ${id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Continue with deletion even if embeddings fail
    }

    // 3. Delete email from database (cascade deletes EmailAttachment records)
    await this.prisma.email.delete({
      where: { id },
    });

    // 4. Delete S3 files (after DB deletion to ensure cleanup even if S3 fails)
    const s3Keys = attachments
      .filter((a) => a.storageType === 's3' && a.storagePath)
      .map((a) => a.storagePath!);

    if (s3Keys.length > 0) {
      try {
        const result = await this.storage.deleteObjects(s3Keys);
        s3Deleted += result.deleted;
        s3Failed += result.failed;
        this.logger.debug(
          `Deleted ${result.deleted} S3 objects for email ${id} (${result.failed} failed)`,
        );

        if (result.failed > 0) {
          this.logger.warn(
            `Failed to delete ${result.failed} S3 objects for email ${id}. Objects may be orphaned.`,
          );
        }
      } catch (error) {
        s3Failed += s3Keys.length;
        this.logger.error(
          `Failed to delete S3 objects for email ${id}: ${error instanceof Error ? error.message : String(error)}`,
        );
        // Don't throw - email already deleted from DB
      }
    }

    return { attachmentsFound, s3Deleted, s3Failed };
  }
}

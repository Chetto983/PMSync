import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  ScheduledJobsQueueService,
  ScheduledJobType,
} from '../../../common/services/scheduled-jobs.queue';

@Injectable()
export class EmailRetentionService implements OnModuleInit {
  private readonly logger = new Logger(EmailRetentionService.name);
  private readonly RETENTION_DAYS = 30; // Keep full content for 30 days
  private readonly jobsEnabled: boolean;

  constructor(
    private prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly scheduledJobsQueue: ScheduledJobsQueueService,
  ) {
    this.jobsEnabled =
      (this.configService.get<string>('JOBS_ENABLED') || 'true').toLowerCase() !== 'false';
    if (!this.jobsEnabled) {
      this.logger.warn('EmailRetentionService disabled via JOBS_ENABLED=false');
    }
  }

  /**
   * Register handlers for email retention jobs with BullMQ
   */
  async onModuleInit() {
    if (!this.jobsEnabled) {
      return;
    }

    this.scheduledJobsQueue.registerHandler(
      ScheduledJobType.EMAIL_RETENTION,
      async () => { await this.runRetentionPolicy(); },
    );

    this.logger.log('EmailRetentionService registered with BullMQ scheduler');
  }

  /**
   * Run retention policy - triggered by BullMQ daily at 2 AM for ALL tenants
   * Archives emails older than 30 days
   *
   * SECURITY NOTE: This job iterates over ALL tenants
   * Each tenant's emails are processed separately with proper isolation
   */
  async runRetentionPolicy() {
    if (!this.jobsEnabled) {
      return;
    }
    this.logger.log('Starting email retention policy for all tenants...');

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.RETENTION_DAYS);

      // Get all active tenants
      const tenants = await this.prisma.tenant.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
      });

      this.logger.log(`Processing retention for ${tenants.length} tenants`);

      let totalArchived = 0;
      const results: Array<{ tenantId: string; tenantName: string; count: number }> = [];

      // Process each tenant separately (proper tenant isolation)
      for (const tenant of tenants) {
        try {
          const result = await this.archiveOldEmails(tenant.id, cutoffDate);
          totalArchived += result.count;

          if (result.count > 0) {
            results.push({
              tenantId: tenant.id,
              tenantName: tenant.name,
              count: result.count,
            });
            this.logger.log(
              `Tenant ${tenant.name} (${tenant.id}): Archived ${result.count} emails`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Failed to run retention for tenant ${tenant.name} (${tenant.id}):`,
            error,
          );
          // Continue with other tenants even if one fails
        }
      }

      this.logger.log(
        `Retention policy completed. Archived ${totalArchived} emails across ${results.length} tenants`,
      );

      return {
        totalArchived,
        tenantsProcessed: tenants.length,
        results,
      };
    } catch (error) {
      this.logger.error('Failed to run retention policy:', error);
      throw error;
    }
  }

  /**
   * Archive emails older than the given date FOR A SPECIFIC TENANT
   * Keeps: ID, metadata, subject, from, to, snippet, embeddings
   * Removes: bodyText, bodyHtml, headers (to save space)
   *
   * SECURITY: Requires tenantId to prevent cross-tenant operations
   */
  async archiveOldEmails(tenantId: string, cutoffDate: Date) {
    this.logger.debug(
      `Archiving emails for tenant ${tenantId} older than ${cutoffDate.toISOString()}...`,
    );

    // Find emails that should be archived (TENANT-SCOPED)
    const emailsToArchive = await this.prisma.email.findMany({
      where: {
        tenantId, // ✅ CRITICAL: Tenant isolation
        receivedAt: {
          lt: cutoffDate,
        },
        isArchived: false,
        isDeleted: false, // Don't archive deleted emails
      },
      select: {
        id: true,
        subject: true,
        receivedAt: true,
      },
    });

    if (emailsToArchive.length === 0) {
      this.logger.debug(`No emails to archive for tenant ${tenantId}`);
      return { count: 0, emailIds: [] };
    }

    this.logger.log(`Found ${emailsToArchive.length} emails to archive for tenant ${tenantId}`);

    // Archive emails by removing body content (TENANT-SCOPED via ID list)
    const result = await this.prisma.email.updateMany({
      where: {
        tenantId, // ✅ CRITICAL: Double-check tenant isolation
        id: {
          in: emailsToArchive.map((e) => e.id),
        },
      },
      data: {
        isArchived: true,
        bodyText: null,
        bodyHtml: null,
        headers: Prisma.JsonNull, // Clear headers to save even more space
      },
    });

    const archivedIds = emailsToArchive.map((e) => e.id);

    this.logger.log(`Successfully archived ${result.count} emails for tenant ${tenantId}`);

    return {
      count: result.count,
      emailIds: archivedIds,
    };
  }

  /**
   * Manually trigger retention policy for a specific tenant
   * SECURITY: Should only be called by admin/super-admin (enforced at controller level)
   */
  async runManualRetention(tenantId: string, retentionDays: number = this.RETENTION_DAYS) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    return this.archiveOldEmails(tenantId, cutoffDate);
  }

  /**
   * Get retention statistics FOR A SPECIFIC TENANT
   * SECURITY: Requires tenantId to prevent information disclosure
   */
  async getRetentionStats(tenantId: string) {
    const [totalEmails, archivedEmails, recentEmails, oldUnarchived] = await Promise.all([
      this.prisma.email.count({
        where: { tenantId }, // ✅ CRITICAL: Tenant isolation
      }),
      this.prisma.email.count({
        where: {
          tenantId, // ✅ CRITICAL: Tenant isolation
          isArchived: true,
        },
      }),
      this.prisma.email.count({
        where: {
          tenantId, // ✅ CRITICAL: Tenant isolation
          receivedAt: {
            gte: new Date(Date.now() - this.RETENTION_DAYS * 24 * 60 * 60 * 1000),
          },
        },
      }),
      this.prisma.email.count({
        where: {
          tenantId, // ✅ CRITICAL: Tenant isolation
          receivedAt: {
            lt: new Date(Date.now() - this.RETENTION_DAYS * 24 * 60 * 60 * 1000),
          },
          isArchived: false,
          isDeleted: false,
        },
      }),
    ]);

    // Calculate space saved (rough estimate)
    const avgBodySize = 10000; // Assume average body is ~10KB
    const spaceSavedMB = Math.round((archivedEmails * avgBodySize) / (1024 * 1024));

    return {
      tenantId, // Include tenantId in response for clarity
      totalEmails,
      archivedEmails,
      recentEmails,
      oldUnarchived,
      retentionDays: this.RETENTION_DAYS,
      estimatedSpaceSavedMB: spaceSavedMB,
    };
  }
}

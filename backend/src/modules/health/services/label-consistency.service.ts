/**
 * Label Consistency Monitoring Service
 *
 * Sprint 08 — T-0804
 *
 * Three checks run daily via BullMQ cron:
 * 1. Folder/labels drift — Email.folder ≠ derivation from Email.labels[]
 * 2. Ghost EmailLabel — EmailLabel rows pointing to archived/deleted UserLabels
 * 3. Stale Gmail label IDs — Email.labels[] entries not in Folder.externalId or system set
 *
 * Health endpoint: GET /health/email-labels
 * Cron: daily at 02:30 AM
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping';
import {
  ScheduledJobsQueueService,
  ScheduledJobType,
} from '../../../common/services/scheduled-jobs.queue';

// ── System labels that are always valid ──
const SYSTEM_LABELS = new Set([
  'INBOX', 'SENT', 'DRAFTS', 'DRAFT', 'TRASH', 'SPAM', 'ARCHIVE',
  'IMPORTANT', 'STARRED', 'OUTBOX', 'JUNK', 'FLAGGED',
  'UNREAD', 'MUTED', 'CHAT', 'ALL',
  'CATEGORY_PERSONAL', 'CATEGORY_SOCIAL', 'CATEGORY_UPDATES',
  'CATEGORY_FORUMS', 'CATEGORY_PROMOTIONS',
  'YELLOW_STAR', 'BLUE_STAR', 'GREEN_STAR', 'RED_STAR',
  'ORANGE_STAR', 'PURPLE_STAR',
]);

// ── Thresholds: warn when exceeded ──
const THRESHOLDS = {
  folderDriftPercent: 1, // > 1% of emails have folder drift
  ghostEmailLabels: 10, // > 10 ghost EmailLabel records
  staleLabelsPercent: 5, // > 5% of emails have stale label IDs
};

export interface LabelConsistencyReport {
  checkedAt: string;
  folderDrift: {
    totalChecked: number;
    consistent: number;
    inconsistent: number;
    rate: string;
    warning: boolean;
    samples: Array<{
      emailId: string;
      subject: string;
      currentFolder: string;
      derivedFolder: string;
      labels: string[];
    }>;
  };
  ghostEmailLabels: {
    count: number;
    warning: boolean;
    samples: Array<{ emailLabelId: string; labelId: string; emailId: string }>;
  };
  staleGmailLabelIds: {
    totalChecked: number;
    emailsWithStale: number;
    rate: string;
    warning: boolean;
    samples: Array<{ emailId: string; staleIds: string[] }>;
  };
  overallHealthy: boolean;
}

@Injectable()
export class LabelConsistencyService implements OnModuleInit {
  private readonly logger = new Logger(LabelConsistencyService.name);
  private lastReport: LabelConsistencyReport | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduledJobs: ScheduledJobsQueueService,
  ) {}

  onModuleInit() {
    this.scheduledJobs.registerHandler(
      ScheduledJobType.LABEL_CONSISTENCY_CHECK,
      async () => {
        this.logger.log('Running scheduled label consistency check...');
        const report = await this.runFullCheck();
        this.lastReport = report;

        if (!report.overallHealthy) {
          this.logger.warn(
            `Label consistency issues detected: ` +
            `drift=${report.folderDrift.inconsistent}, ` +
            `ghosts=${report.ghostEmailLabels.count}, ` +
            `stale=${report.staleGmailLabelIds.emailsWithStale}`,
          );
        } else {
          this.logger.log('Label consistency check passed — all healthy');
        }
      },
    );
  }

  /**
   * Run all three consistency checks across all tenants.
   */
  async runFullCheck(tenantId?: string): Promise<LabelConsistencyReport> {
    const [folderDrift, ghostEmailLabels, staleGmailLabelIds] = await Promise.all([
      this.checkFolderDrift(tenantId),
      this.checkGhostEmailLabels(tenantId),
      this.checkStaleGmailLabelIds(tenantId),
    ]);

    const overallHealthy =
      !folderDrift.warning &&
      !ghostEmailLabels.warning &&
      !staleGmailLabelIds.warning;

    return {
      checkedAt: new Date().toISOString(),
      folderDrift,
      ghostEmailLabels,
      staleGmailLabelIds,
      overallHealthy,
    };
  }

  /**
   * Return the last cached report (from scheduled run) or run fresh.
   */
  async getReport(tenantId?: string): Promise<LabelConsistencyReport> {
    if (!tenantId && this.lastReport) {
      return this.lastReport;
    }
    return this.runFullCheck(tenantId);
  }

  // ────────────────────────────────────────────────────────
  // Check 1: Folder/labels drift (Google only)
  // ────────────────────────────────────────────────────────
  private async checkFolderDrift(tenantId?: string) {
    return withoutTenantScopingAsync(async () => {
      const where = {
        provider: { providerType: 'google' as const },
        isDeleted: false,
        ...(tenantId ? { tenantId } : {}),
      };

      const totalChecked = await this.prisma.email.count({ where });
      let consistent = 0;
      let inconsistent = 0;
      const samples: LabelConsistencyReport['folderDrift']['samples'] = [];
      const batchSize = 1000;

      for (let offset = 0; offset < totalChecked; offset += batchSize) {
        const emails = await this.prisma.email.findMany({
          where,
          select: { id: true, subject: true, folder: true, labels: true },
          skip: offset,
          take: batchSize,
          orderBy: { receivedAt: 'desc' },
        });

        for (const email of emails) {
          const labels = (email.labels as string[]) || [];
          const derived = this.deriveFolderFromLabels(labels);
          if (email.folder === derived) {
            consistent++;
          } else {
            inconsistent++;
            if (samples.length < 10) {
              samples.push({
                emailId: email.id,
                subject: (email.subject || '').slice(0, 80),
                currentFolder: email.folder,
                derivedFolder: derived,
                labels,
              });
            }
          }
        }
      }

      const rate = totalChecked > 0
        ? `${((inconsistent / totalChecked) * 100).toFixed(2)}%`
        : 'N/A';
      const warning = totalChecked > 0 &&
        (inconsistent / totalChecked) * 100 > THRESHOLDS.folderDriftPercent;

      return { totalChecked, consistent, inconsistent, rate, warning, samples };
    });
  }

  // ────────────────────────────────────────────────────────
  // Check 2: Ghost EmailLabel records
  // ────────────────────────────────────────────────────────
  private async checkGhostEmailLabels(tenantId?: string) {
    return withoutTenantScopingAsync(async () => {
      // EmailLabels where the UserLabel is archived or doesn't exist
      const ghostRecords = await this.prisma.$queryRawUnsafe<
        Array<{ id: string; labelId: string; emailId: string }>
      >(
        `
        SELECT el.id, el."labelId", el."emailId"
        FROM email_labels el
        LEFT JOIN user_labels ul ON ul.id = el."labelId"
        WHERE ul.id IS NULL OR ul."isArchived" = true
        ${tenantId ? `AND el."tenantId" = $1` : ''}
        LIMIT 50
        `,
        ...(tenantId ? [tenantId] : []),
      );

      const count = ghostRecords.length;
      const warning = count > THRESHOLDS.ghostEmailLabels;

      if (warning) {
        this.logger.warn(`Ghost EmailLabel records found: ${count}`);
      }

      return {
        count,
        warning,
        samples: ghostRecords.slice(0, 10).map(r => ({
          emailLabelId: r.id,
          labelId: r.labelId,
          emailId: r.emailId,
        })),
      };
    });
  }

  // ────────────────────────────────────────────────────────
  // Check 3: Stale Gmail label IDs
  // ────────────────────────────────────────────────────────
  private async checkStaleGmailLabelIds(tenantId?: string) {
    return withoutTenantScopingAsync(async () => {
      const where = {
        provider: { providerType: 'google' as const },
        isDeleted: false,
        ...(tenantId ? { tenantId } : {}),
      };

      // Get all valid external IDs from Folder table
      const folderExternalIds = await this.prisma.folder.findMany({
        where: { externalId: { not: null } },
        select: { externalId: true },
      });
      const validExternalIds = new Set(
        folderExternalIds.map(f => f.externalId).filter(Boolean),
      );

      const batchSize = 1000;
      let totalChecked = 0;
      let emailsWithStale = 0;
      const samples: Array<{ emailId: string; staleIds: string[] }> = [];

      const emailCount = await this.prisma.email.count({ where });

      for (let offset = 0; offset < emailCount; offset += batchSize) {
        const emails = await this.prisma.email.findMany({
          where,
          select: { id: true, labels: true },
          skip: offset,
          take: batchSize,
        });

        for (const email of emails) {
          totalChecked++;
          const labels = (email.labels as string[]) || [];
          const staleIds = labels.filter(
            id => !SYSTEM_LABELS.has(id) && !validExternalIds.has(id),
          );
          if (staleIds.length > 0) {
            emailsWithStale++;
            if (samples.length < 10) {
              samples.push({ emailId: email.id, staleIds });
            }
          }
        }
      }

      const rate = totalChecked > 0
        ? `${((emailsWithStale / totalChecked) * 100).toFixed(2)}%`
        : 'N/A';
      const warning = totalChecked > 0 &&
        (emailsWithStale / totalChecked) * 100 > THRESHOLDS.staleLabelsPercent;

      if (warning) {
        this.logger.warn(`Stale Gmail label IDs: ${emailsWithStale}/${totalChecked} emails affected`);
      }

      return { totalChecked, emailsWithStale, rate, warning, samples };
    });
  }

  // ────────────────────────────────────────────────────────
  // Folder derivation (mirrors gmail-message.service.ts)
  // ────────────────────────────────────────────────────────
  private deriveFolderFromLabels(labelIds: string[]): string {
    if (labelIds.includes('TRASH')) return 'TRASH';
    if (labelIds.includes('SPAM')) return 'SPAM';
    if (labelIds.includes('SENT')) return 'SENT';
    if (labelIds.includes('DRAFT')) return 'DRAFTS';

    const cat = labelIds.find(l => l.startsWith('CATEGORY_'));
    if (cat) {
      const map: Record<string, string> = {
        CATEGORY_PERSONAL: 'INBOX',
        CATEGORY_SOCIAL: 'SOCIAL',
        CATEGORY_PROMOTIONS: 'PROMOTIONS',
        CATEGORY_UPDATES: 'UPDATES',
        CATEGORY_FORUMS: 'FORUMS',
      };
      if (map[cat]) return map[cat];
    }

    if (labelIds.includes('INBOX')) return 'INBOX';
    return 'ARCHIVE';
  }
}

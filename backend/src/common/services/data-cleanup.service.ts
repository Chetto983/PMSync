import { Injectable, Logger, OnModuleInit, Optional, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountDeletionService } from '../../modules/compliance/services/account-deletion.service';
import { DataExportService } from '../../modules/compliance/services/data-export.service';
import { withoutTenantScopingAsync } from '../../prisma/tenant-scoping';

/**
 * Data Cleanup Service
 *
 * Removes expired and stale data to prevent DB bloat.
 *
 * Tables cleaned (expiresAt-based):
 * - AgentActionFeedback (30 day retention)
 * - AgentLearningProfile (90 day retention, auto-renews on update)
 * - AIMemory (variable retention via expiresAt)
 * - Session (expired auth sessions)
 * - Verification (expired email verifications)
 * - PasswordResetToken (expired reset tokens)
 * - TrustedDevice (expired device trusts)
 * - Invitation (expired org invitations)
 * - AI chat conversations (30 day retention)
 *
 * Tables cleaned (retention-based):
 * - AiRunLedger (90 day retention)
 * - AiDraftFeedback (90 day retention)
 * - TelegramLog (30 day retention)
 * - Reminder completed/cancelled (60 day retention)
 * - CalendarEvent deleted/cancelled (30 day retention)
 *
 * Cron schedule:
 * - 2 AM: Purge expired account deletion requests (GDPR Art. 17)
 * - 3 AM: Cleanup expired data records
 * - 3:30 AM: Cleanup expired data exports (GDPR Art. 20)
 * - 4 AM Sunday: Audit log retention (3-year policy)
 */
@Injectable()
export class DataCleanupService implements OnModuleInit {
  private readonly logger = new Logger(DataCleanupService.name);
  private static readonly AI_CHAT_RETENTION_DAYS = 30;
  private static readonly RETENTION_30_DAYS = 30;
  private static readonly RETENTION_60_DAYS = 60;
  private static readonly RETENTION_90_DAYS = 90;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(AccountDeletionService)
    private readonly accountDeletionService?: AccountDeletionService,
    @Optional() @Inject(DataExportService)
    private readonly dataExportService?: DataExportService,
  ) {}

  onModuleInit() {
    this.logger.log('Data cleanup service initialized');
  }

  /**
   * Daily cleanup of expired records (runs at 3 AM)
   */
  @Cron('0 3 * * *')
  async cleanupExpiredData(): Promise<CleanupResult> {
    return withoutTenantScopingAsync(async () => {
    this.logger.log('Starting daily data cleanup...');
    const startTime = Date.now();
    const now = new Date();
    const results: CleanupResult = {
      agentFeedback: 0,
      learningProfiles: 0,
      aiMemories: 0,
      expiredActions: 0,
      conversations: 0,
      sessions: 0,
      verifications: 0,
      resetTokens: 0,
      trustedDevices: 0,
      invitations: 0,
      aiRunLedger: 0,
      aiDraftFeedback: 0,
      telegramLogs: 0,
      reminders: 0,
      calendarEvents: 0,
      duration: 0,
    };

    try {
      // 1. Clean expired AgentActionFeedback
      const feedbackResult = await this.prisma.agentActionFeedback.deleteMany({
        where: {
          expiresAt: {
            lt: now,
          },
        },
      });
      results.agentFeedback = feedbackResult.count;
      this.logger.debug(`Deleted ${feedbackResult.count} expired feedback records`);

      // 2. Clean expired AgentLearningProfile
      const profileResult = await this.prisma.agentLearningProfile.deleteMany({
        where: {
          expiresAt: {
            lt: now,
          },
        },
      });
      results.learningProfiles = profileResult.count;
      this.logger.debug(`Deleted ${profileResult.count} expired learning profiles`);

      // 3. Clean expired AIMemory
      const memoryResult = await this.prisma.aIMemory.deleteMany({
        where: {
          expiresAt: {
            lt: now,
          },
        },
      });
      results.aiMemories = memoryResult.count;
      this.logger.debug(`Deleted ${memoryResult.count} expired AI memories`);

      // 4. ActionQueue removed (Phase 77 -- replaced by AI SDK native HITL)
      results.expiredActions = 0;

      // 5. Clean old AI chat conversations (30 days)
      results.conversations = await this.cleanupOldConversations(now);

      // 6. Clean expired auth records
      const [sessions, verifications, resetTokens, trustedDevices, invitations] = await Promise.all([
        this.prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
        this.prisma.verification.deleteMany({ where: { expiresAt: { lt: now } } }),
        this.prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: now } } }),
        this.prisma.trustedDevice.deleteMany({ where: { expiresAt: { lt: now } } }),
        this.prisma.invitation.deleteMany({ where: { expiresAt: { lt: now } } }),
      ]);
      results.sessions = sessions.count;
      results.verifications = verifications.count;
      results.resetTokens = resetTokens.count;
      results.trustedDevices = trustedDevices.count;
      results.invitations = invitations.count;
      this.logger.debug(
        `Deleted expired auth records: sessions=${sessions.count}, verifications=${verifications.count}, ` +
          `resetTokens=${resetTokens.count}, trustedDevices=${trustedDevices.count}, invitations=${invitations.count}`,
      );

      // 7. Retention-based cleanup (tables without expiresAt)
      const retentionResults = await this.cleanupByRetention(now);
      results.aiRunLedger = retentionResults.aiRunLedger;
      results.aiDraftFeedback = retentionResults.aiDraftFeedback;
      results.telegramLogs = retentionResults.telegramLogs;
      results.reminders = retentionResults.reminders;
      results.calendarEvents = retentionResults.calendarEvents;

      results.duration = Date.now() - startTime;
      const total = Object.entries(results)
        .filter(([key]) => key !== 'duration')
        .reduce((sum, [, val]) => sum + (val as number), 0);

      this.logger.log(
        `Data cleanup complete: ${total} records deleted in ${results.duration}ms ` +
          `(feedback: ${results.agentFeedback}, profiles: ${results.learningProfiles}, ` +
          `memories: ${results.aiMemories}, conversations: ${results.conversations}, ` +
          `sessions: ${results.sessions}, verifications: ${results.verifications}, ` +
          `resetTokens: ${results.resetTokens}, trustedDevices: ${results.trustedDevices}, ` +
          `invitations: ${results.invitations}, aiRunLedger: ${results.aiRunLedger}, ` +
          `aiDraftFeedback: ${results.aiDraftFeedback}, telegramLogs: ${results.telegramLogs}, ` +
          `reminders: ${results.reminders}, calendarEvents: ${results.calendarEvents})`,
      );

      return results;
    } catch (error) {
      this.logger.error(`Data cleanup failed: ${error}`);
      throw error;
    }
    });
  }

  /**
   * AUDIT-03: Weekly cleanup of audit logs older than 3 years (GDPR retention).
   * Runs Sunday 4 AM (offset from daily 3 AM cleanup).
   */
  @Cron('0 4 * * 0')
  async cleanupOldAuditLogs(): Promise<number> {
    return withoutTenantScopingAsync(async () => {
    this.logger.log('Starting audit log retention cleanup (3-year policy)...');
    try {
      const threeYearsAgo = new Date();
      threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

      const result = await this.prisma.auditLog.deleteMany({
        where: { createdAt: { lt: threeYearsAgo } },
      });

      this.logger.log(`Audit retention cleanup: deleted ${result.count} records older than 3 years`);
      return result.count;
    } catch (error) {
      this.logger.error(`Audit retention cleanup failed: ${error}`);
      return 0;
    }
    });
  }

  /**
   * DATA-02/DATA-03: Purge expired account deletion requests (GDPR Art. 17).
   * Runs daily at 2 AM (before the 3 AM data cleanup).
   *
   * Finds users with deletedAt older than 30 days and hard-deletes them
   * via Prisma cascade (removes all user data).
   */
  @Cron('0 2 * * *')
  async purgeExpiredAccountDeletions(): Promise<number> {
    return withoutTenantScopingAsync(async () => {
      if (!this.accountDeletionService) {
        this.logger.debug('AccountDeletionService not available, skipping purge');
        return 0;
      }

      this.logger.log('Starting expired account deletion purge...');
      try {
        const purgedCount = await this.accountDeletionService.purgeExpiredDeletions();
        this.logger.log(`Account deletion purge complete: ${purgedCount} accounts purged`);
        return purgedCount;
      } catch (error) {
        this.logger.error(`Account deletion purge failed: ${error}`);
        return 0;
      }
    });
  }

  /**
   * DATA-01: Cleanup expired data export files (GDPR Art. 20).
   * Runs daily at 3:30 AM (after the 3 AM data cleanup, before 4 AM audit cleanup).
   *
   * Deletes export ZIP files from disk and marks exports as EXPIRED
   * after the 72-hour download window.
   */
  @Cron('30 3 * * *')
  async cleanupExpiredDataExports(): Promise<number> {
    return withoutTenantScopingAsync(async () => {
      if (!this.dataExportService) {
        this.logger.debug('DataExportService not available, skipping export cleanup');
        return 0;
      }

      this.logger.log('Starting expired data export cleanup...');
      try {
        const cleaned = await this.dataExportService.cleanupExpiredExports();
        this.logger.log(`Data export cleanup complete: ${cleaned} exports cleaned`);
        return cleaned;
      } catch (error) {
        this.logger.error(`Data export cleanup failed: ${error}`);
        return 0;
      }
    });
  }

  /**
   * Manual cleanup trigger (for testing or admin use)
   */
  async runManualCleanup(): Promise<CleanupResult> {
    this.logger.log('Running manual data cleanup...');
    return this.cleanupExpiredData();
  }

  /**
   * Get cleanup statistics without deleting
   */
  async getExpiredCounts(): Promise<ExpiredCounts> {
    const now = new Date();
    const conversationCutoff = new Date();
    conversationCutoff.setDate(
      conversationCutoff.getDate() - DataCleanupService.AI_CHAT_RETENTION_DAYS,
    );
    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - DataCleanupService.RETENTION_90_DAYS);
    const sixtyDaysAgo = new Date(now);
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - DataCleanupService.RETENTION_60_DAYS);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - DataCleanupService.RETENTION_30_DAYS);

    const [
      feedback, profiles, memories, conversations,
      sessions, verifications, resetTokens, trustedDevices, invitations,
      aiRunLedger, aiDraftFeedback, telegramLogs, reminders, calendarEvents,
    ] = await Promise.all([
      this.prisma.agentActionFeedback.count({ where: { expiresAt: { lt: now } } }),
      this.prisma.agentLearningProfile.count({ where: { expiresAt: { lt: now } } }),
      this.prisma.aIMemory.count({ where: { expiresAt: { lt: now } } }),
      this.getOldConversationCount(conversationCutoff),
      this.prisma.session.count({ where: { expiresAt: { lt: now } } }),
      this.prisma.verification.count({ where: { expiresAt: { lt: now } } }),
      this.prisma.passwordResetToken.count({ where: { expiresAt: { lt: now } } }),
      this.prisma.trustedDevice.count({ where: { expiresAt: { lt: now } } }),
      this.prisma.invitation.count({ where: { expiresAt: { lt: now } } }),
      this.prisma.aiRunLedger.count({ where: { createdAt: { lt: ninetyDaysAgo } } }),
      this.prisma.aiDraftFeedback.count({ where: { createdAt: { lt: ninetyDaysAgo } } }),
      this.prisma.telegramLog.count({ where: { inviatoAt: { lt: thirtyDaysAgo } } }),
      this.prisma.reminder.count({
        where: { status: { in: ['completato', 'annullato'] }, updatedAt: { lt: sixtyDaysAgo } },
      }),
      this.prisma.calendarEvent.count({
        where: { OR: [{ isDeleted: true }, { isCancelled: true }], updatedAt: { lt: thirtyDaysAgo } },
      }),
    ]);

    const total = feedback + profiles + memories + conversations +
      sessions + verifications + resetTokens + trustedDevices + invitations +
      aiRunLedger + aiDraftFeedback + telegramLogs + reminders + calendarEvents;

    return {
      agentFeedback: feedback,
      learningProfiles: profiles,
      aiMemories: memories,
      expiredActions: 0,
      conversations,
      sessions,
      verifications,
      resetTokens,
      trustedDevices,
      invitations,
      aiRunLedger,
      aiDraftFeedback,
      telegramLogs,
      reminders,
      calendarEvents,
      total,
    };
  }

  /**
   * Retention-based cleanup for tables without expiresAt.
   */
  private async cleanupByRetention(now: Date): Promise<RetentionResult> {
    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - DataCleanupService.RETENTION_90_DAYS);
    const sixtyDaysAgo = new Date(now);
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - DataCleanupService.RETENTION_60_DAYS);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - DataCleanupService.RETENTION_30_DAYS);

    const [aiRunLedger, aiDraftFeedback, telegramLogs, reminders, calendarEvents] = await Promise.all([
      this.prisma.aiRunLedger.deleteMany({ where: { createdAt: { lt: ninetyDaysAgo } } }),
      this.prisma.aiDraftFeedback.deleteMany({ where: { createdAt: { lt: ninetyDaysAgo } } }),
      this.prisma.telegramLog.deleteMany({ where: { inviatoAt: { lt: thirtyDaysAgo } } }),
      this.prisma.reminder.deleteMany({
        where: { status: { in: ['completato', 'annullato'] }, updatedAt: { lt: sixtyDaysAgo } },
      }),
      this.prisma.calendarEvent.deleteMany({
        where: { OR: [{ isDeleted: true }, { isCancelled: true }], updatedAt: { lt: thirtyDaysAgo } },
      }),
    ]);

    this.logger.debug(
      `Retention cleanup: aiRunLedger=${aiRunLedger.count}, aiDraftFeedback=${aiDraftFeedback.count}, ` +
        `telegramLogs=${telegramLogs.count}, reminders=${reminders.count}, calendarEvents=${calendarEvents.count}`,
    );

    return {
      aiRunLedger: aiRunLedger.count,
      aiDraftFeedback: aiDraftFeedback.count,
      telegramLogs: telegramLogs.count,
      reminders: reminders.count,
      calendarEvents: calendarEvents.count,
    };
  }

  /**
   * Clean up AI chat conversations older than the retention window.
   */
  private async cleanupOldConversations(now: Date): Promise<number> {
    const cutoffDate = new Date(now);
    cutoffDate.setDate(
      cutoffDate.getDate() - DataCleanupService.AI_CHAT_RETENTION_DAYS,
    );

    try {
      const result = await this.prisma.aiConversation.deleteMany({
        where: {
          updatedAt: { lt: cutoffDate },
        },
      });

      this.logger.debug(`Deleted ${result.count} expired AI chat conversations`);
      return result.count;
    } catch (error) {
      this.logger.error(`Failed to cleanup AI chat conversations: ${error}`);
      return 0;
    }
  }

  /**
   * Get count of old conversations for statistics.
   */
  private async getOldConversationCount(cutoffDate: Date): Promise<number> {
    try {
      return this.prisma.aiConversation.count({
        where: {
          updatedAt: { lt: cutoffDate },
        },
      });
    } catch {
      return 0;
    }
  }
}

interface CleanupResult {
  agentFeedback: number;
  learningProfiles: number;
  aiMemories: number;
  expiredActions: number;
  conversations: number;
  sessions: number;
  verifications: number;
  resetTokens: number;
  trustedDevices: number;
  invitations: number;
  aiRunLedger: number;
  aiDraftFeedback: number;
  telegramLogs: number;
  reminders: number;
  calendarEvents: number;
  duration: number;
}

interface RetentionResult {
  aiRunLedger: number;
  aiDraftFeedback: number;
  telegramLogs: number;
  reminders: number;
  calendarEvents: number;
}

interface ExpiredCounts {
  agentFeedback: number;
  learningProfiles: number;
  aiMemories: number;
  expiredActions: number;
  conversations: number;
  sessions: number;
  verifications: number;
  resetTokens: number;
  trustedDevices: number;
  invitations: number;
  aiRunLedger: number;
  aiDraftFeedback: number;
  telegramLogs: number;
  reminders: number;
  calendarEvents: number;
  total: number;
}

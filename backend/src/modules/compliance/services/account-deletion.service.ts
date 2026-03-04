import {
  Injectable,
  Logger,
  BadRequestException,
  GoneException,
  Optional,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../../common/services/audit.service';
import { DeletionStatusDto, DeletionResponseDto } from '../dto/data-deletion.dto';

/** 30 days in milliseconds */
const GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Account Deletion Service (GDPR Article 17 - Right to Erasure)
 *
 * Implements soft-delete-then-purge pattern with 30-day grace period:
 * 1. User requests deletion -> soft-delete (deactivate + invalidate sessions)
 * 2. User can cancel within 30 days -> reactivate
 * 3. Daily cron purges expired soft-deletes -> hard-delete via Prisma cascade
 *
 * IMPORTANT: Does NOT modify existing UsersService.deleteUserAccount().
 * That method remains for backward-compatible immediate hard-delete.
 */
@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(AuditService) private readonly auditService?: AuditService,
  ) {}

  /**
   * Request account deletion (soft-delete).
   *
   * Atomically sets deletedAt, deactivates user, and invalidates all sessions.
   * Returns existing deletion info if already soft-deleted.
   */
  async requestDeletion(userId: string, tenantId: string): Promise<DeletionResponseDto> {
    // Check if user is already soft-deleted
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { deletedAt: true },
    });

    if (user?.deletedAt) {
      const purgeDate = new Date(user.deletedAt.getTime() + GRACE_PERIOD_MS);
      return {
        status: 'SCHEDULED',
        purgeDate,
        message: 'Account is already scheduled for deletion.',
      };
    }

    // Atomically soft-delete user and invalidate sessions
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { deletedAt: new Date(), isActive: false },
      }),
      this.prisma.session.deleteMany({
        where: { userId },
      }),
    ]);

    const purgeDate = new Date(Date.now() + GRACE_PERIOD_MS);

    // Audit trail (fire-and-forget)
    this.auditService
      ?.logAudit(tenantId, userId, 'DELETION_REQUESTED', 'User', userId)
      .catch((err) => this.logger.error(`Audit log failed: ${err}`));

    this.logger.log(`User ${userId} scheduled for deletion (purge after ${purgeDate.toISOString()})`);

    return {
      status: 'SCHEDULED',
      purgeDate,
      message: 'Account scheduled for deletion. You can cancel within 30 days.',
    };
  }

  /**
   * Cancel a pending deletion request.
   *
   * Reactivates the user if still within the 30-day grace period.
   * Throws BadRequestException if no pending deletion.
   * Throws GoneException if grace period has expired.
   */
  async cancelDeletion(userId: string, tenantId: string): Promise<DeletionResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { deletedAt: true },
    });

    if (!user?.deletedAt) {
      throw new BadRequestException('No pending deletion request');
    }

    // Check grace period
    const elapsed = Date.now() - user.deletedAt.getTime();
    if (elapsed > GRACE_PERIOD_MS) {
      throw new GoneException('Grace period expired, deletion cannot be cancelled');
    }

    // Reactivate user
    await this.prisma.user.update({
      where: { id: userId },
      data: { deletedAt: null, isActive: true },
    });

    // Audit trail (fire-and-forget)
    this.auditService
      ?.logAudit(tenantId, userId, 'DELETION_CANCELLED', 'User', userId)
      .catch((err) => this.logger.error(`Audit log failed: ${err}`));

    this.logger.log(`User ${userId} cancelled deletion request`);

    return {
      status: 'CANCELLED',
      message: 'Account deletion cancelled. Your account has been reactivated.',
    };
  }

  /**
   * Get the current deletion status for a user.
   */
  async getDeletionStatus(userId: string): Promise<DeletionStatusDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { deletedAt: true, isActive: true },
    });

    if (!user?.deletedAt) {
      return { status: 'ACTIVE' };
    }

    const daysSince = Math.floor(
      (Date.now() - user.deletedAt.getTime()) / (24 * 60 * 60 * 1000),
    );
    const daysRemaining = Math.max(0, 30 - daysSince);
    const purgeDate = new Date(user.deletedAt.getTime() + GRACE_PERIOD_MS);

    return {
      status: 'SCHEDULED',
      deletedAt: user.deletedAt,
      purgeDate,
      daysRemaining,
    };
  }

  /**
   * Purge all users whose grace period has expired.
   *
   * Called by DataCleanupService daily cron at 2 AM.
   * Finds users with deletedAt older than 30 days and hard-deletes them.
   */
  async purgeExpiredDeletions(): Promise<number> {
    const cutoff = new Date(Date.now() - GRACE_PERIOD_MS);

    const expiredUsers = await this.prisma.user.findMany({
      where: {
        deletedAt: { not: null, lt: cutoff },
      },
      select: { id: true, tenantId: true },
    });

    if (expiredUsers.length === 0) {
      this.logger.debug('No expired deletion requests to purge');
      return 0;
    }

    this.logger.log(`Found ${expiredUsers.length} expired deletion(s) to purge`);

    let purgedCount = 0;
    for (const user of expiredUsers) {
      const success = await this.hardDeleteUser(user.id, user.tenantId);
      if (success) purgedCount++;
    }

    this.logger.log(`Purged ${purgedCount}/${expiredUsers.length} expired accounts`);
    return purgedCount;
  }

  /**
   * Purge a single user whose deletion grace period has expired.
   * Called by event handler (scoped to event payload), NOT the daily cron.
   */
  async purgeUserDeletion(userId: string, tenantId: string): Promise<boolean> {
    const cutoff = new Date(Date.now() - GRACE_PERIOD_MS);

    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId, deletedAt: { not: null, lt: cutoff } },
      select: { id: true },
    });

    if (!user) {
      this.logger.debug(`User ${userId} not found or deletion not yet expired, skipping`);
      return false;
    }

    return this.hardDeleteUser(userId, tenantId);
  }

  /**
   * Hard-delete a user via Prisma cascade.
   *
   * Prisma schema has onDelete: Cascade on all User relations,
   * so this single delete removes all associated data (emails, contacts,
   * calendar events, sessions, audit logs, etc.).
   *
   * Returns true if deleted, false if already gone.
   */
  async hardDeleteUser(userId: string, tenantId: string): Promise<boolean> {
    this.logger.warn(`Hard-deleting user ${userId} from tenant ${tenantId}`);

    try {
      await this.prisma.user.delete({ where: { id: userId } });
      this.logger.log(`Successfully hard-deleted user ${userId}`);
      return true;
    } catch (error: any) {
      // P2025: Record not found -- user may have been manually deleted already
      if (error?.code === 'P2025') {
        this.logger.warn(`User ${userId} already deleted (P2025), skipping`);
        return false;
      }
      this.logger.error(`Failed to hard-delete user ${userId}: ${error}`);
      throw error;
    }
  }
}

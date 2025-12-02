import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailEmbeddingQueueService } from '../../ai/services/email-embedding.queue';
import { QueueService } from '../../email-sync/services/queue.service';

@Injectable()
export class UsersService {
  private logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private emailEmbeddingQueue: EmailEmbeddingQueueService,
    private queueService: QueueService,
  ) {}

  /**
   * Get user profile
   */
  async getUserProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isMfaEnabled: true,
        lastLogin: true,
        createdAt: true,
      },
    });
  }

  /**
   * Update user profile
   */
  async updateUserProfile(userId: string, data: { firstName?: string; lastName?: string }) {
    return this.prisma.user.update({
      where: { id: userId },
      data,
    });
  }

  /**
   * Delete user account (GDPR - right to be forgotten)
   */
  async deleteUserAccount(userId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          tenantId: true,
          email: true,
        },
      });

      if (!user) {
        throw new BadRequestException('User not found');
      }

      const otherUsers = await tx.user.count({
        where: {
          tenantId: user.tenantId,
          id: { not: userId },
        },
      });

      await tx.session.deleteMany({ where: { userId } });
      await tx.mfaCode.deleteMany({ where: { userId } });
      await tx.passwordResetToken.deleteMany({ where: { userEmail: user.email } });

      await tx.user.delete({ where: { id: userId } });

      let tenantDeleted = false;

      if (otherUsers === 0) {
        await tx.tenant.delete({ where: { id: user.tenantId } });
        tenantDeleted = true;
      }

      return {
        tenantId: user.tenantId,
        tenantDeleted,
      };
    });

    if (result.tenantDeleted) {
      await this.emailEmbeddingQueue.removeJobsForTenant(result.tenantId);
      await this.queueService.removeJobsForTenant(result.tenantId);
      this.logger.log(`Tenant ${result.tenantId} deleted due to final user removal.`);
    } else {
      this.logger.log(`User ${userId} deleted; tenant ${result.tenantId} remains active.`);
    }

    return {
      success: true,
      tenantDeleted: result.tenantDeleted,
      message: result.tenantDeleted
        ? 'Account and workspace deleted successfully.'
        : 'Account deleted successfully.',
    };
  }

  /**
   * Get user's VoltAgent messages
   */
  async getUserMessages(userId: string, tenantId: string, limit: number = 100) {
    return this.prisma.voltAgentMessage.findMany({
      where: {
        userId,
        tenantId,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Get user preferences
   */
  async getUserPreferences(userId: string) {
    let preferences = await this.prisma.userPreferences.findUnique({
      where: { userId },
    });

    // Create default preferences if they don't exist
    if (!preferences) {
      preferences = await this.prisma.userPreferences.create({
        data: {
          userId,
          folderOrders: {},
          sidebarSmartFiltersExpanded: true,
          sidebarLabelsExpanded: true,
          theme: 'light',
          language: 'en',
          emailDensity: 'comfortable',
        },
      });
    }

    return preferences;
  }

  /**
   * Update user preferences
   */
  async updateUserPreferences(userId: string, data: {
    folderOrders?: Record<string, string[]>;
    sidebarSmartFiltersExpanded?: boolean;
    sidebarLabelsExpanded?: boolean;
    theme?: string;
    language?: string;
    emailDensity?: string;
  }) {
    // Check if preferences exist
    const existing = await this.prisma.userPreferences.findUnique({
      where: { userId },
    });

    if (existing) {
      // Update existing preferences
      return this.prisma.userPreferences.update({
        where: { userId },
        data,
      });
    } else {
      // Create new preferences with provided data
      return this.prisma.userPreferences.create({
        data: {
          userId,
          ...data,
        },
      });
    }
  }
}

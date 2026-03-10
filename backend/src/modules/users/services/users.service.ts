import { Inject, Injectable, Logger, BadRequestException, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailEmbeddingQueueService } from '../../ai/services/email-embedding.queue';
import { QueueService } from '../../email-sync/services/queue.service';
import { CacheService } from '../../../common/services/cache.service';
import { StorageService } from '../../email/services/storage.service';
import { UpdatePreferencesDto } from '../dtos/update-preferences.dto';

@Injectable()
export class UsersService {
  private logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private emailEmbeddingQueue: EmailEmbeddingQueueService,
    private queueService: QueueService,
    private storageService: StorageService,
    // CRITICAL: @Inject() required alongside @Optional() for NestJS to resolve the service
    @Optional() @Inject(CacheService) private cacheService?: CacheService,
  ) { }

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
        avatarUrl: true,
        role: true,
        twoFactorEnabled: true,
        lastLogin: true,
        createdAt: true,
      },
    });
  }

  /**
   * Update user profile
   */
  async updateUserProfile(userId: string, data: { firstName?: string; lastName?: string; avatarUrl?: string }) {
    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        role: true,
      },
    });
  }

  /**
   * Update user avatar — uploads base64 to R2, stores URL in DB.
   * Sets both `avatarUrl` (app field) and `image` (better-auth field)
   * to a short URL so cookie cache never overflows.
   */
  async updateUserAvatar(userId: string, dataUrl: string | null) {
    if (!dataUrl) {
      return this.deleteUserAvatar(userId);
    }

    // Parse base64 data URL
    const match = dataUrl.match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
    if (!match) {
      throw new BadRequestException('Invalid image data URL');
    }

    const contentType = match[1];
    const buffer = Buffer.from(match[2], 'base64');

    // Cap at 200KB after base64 decode (~150KB image)
    if (buffer.length > 200 * 1024) {
      throw new BadRequestException('Avatar image too large (max 200KB)');
    }

    const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : contentType === 'image/svg+xml' ? 'svg' : 'jpg';
    const key = `avatars/${userId}.${ext}`;

    await this.storageService.putObject(key, buffer, contentType);
    const publicUrl = await this.storageService.getSignedDownloadUrl(key, 60 * 60 * 24 * 365);

    // Store URL (not base64) in both fields
    return this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: publicUrl, image: publicUrl },
      select: { id: true, avatarUrl: true, image: true },
    });
  }

  /**
   * Delete user avatar from R2 and DB
   */
  async deleteUserAvatar(userId: string) {
    // Try to delete from R2 (best-effort, ignore errors)
    for (const ext of ['jpg', 'png', 'webp']) {
      await this.storageService.deleteObject(`avatars/${userId}.${ext}`).catch(() => {});
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null, image: null },
      select: { id: true, avatarUrl: true },
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
      await tx.mfaSecret.deleteMany({ where: { userId } });
      await tx.mfaBackupCode.deleteMany({ where: { userId } });
      await tx.trustedDevice.deleteMany({ where: { userId } });
      await tx.passwordResetToken.deleteMany({ where: { userEmail: user.email } });

      await tx.user.delete({ where: { id: userId } });

      let tenantDeleted = false;

      if (otherUsers === 0) {
        await tx.tenant.delete({ where: { id: user.tenantId! } });
        tenantDeleted = true;
      }

      return {
        tenantId: user.tenantId!,
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
   * Get user preferences
   */
  async getUserPreferences(tenantId: string, userId: string) {
    let preferences = await this.prisma.userPreferences.findUnique({
      where: { userId },
    });

    // Create default preferences if they don't exist
    if (!preferences) {
      preferences = await this.prisma.userPreferences.create({
        data: {
          tenantId,
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
   * Accepts all fields from UpdatePreferencesDto including AI settings
   */
  async updateUserPreferences(tenantId: string, userId: string, data: UpdatePreferencesDto) {
    // Use upsert to avoid race conditions (multiple concurrent PATCH requests
    // from different hook instances can both see no record and try to create)
    const result = await this.prisma.userPreferences.upsert({
      where: { userId },
      update: data,
      create: {
        tenantId,
        userId,
        ...data,
      },
    });

    // Invalidate cached user context so AI agent picks up new preferences immediately
    if (this.cacheService) {
      const cacheKey = `voltagent:user-context:${tenantId}:${userId}`;
      await this.cacheService.del(cacheKey).catch((err) => {
        this.logger.warn(`Failed to invalidate user context cache: ${err.message}`);
      });
      this.logger.debug(`Invalidated user context cache for ${userId}`);
    }

    return result;
  }
  /**
   * Get dashboard preferences
   */
  async getDashboardPreferences(tenantId: string, userId: string) {
    const prefs = await this.prisma.dashboardPreference.findUnique({
      where: { userId },
    });

    if (!prefs) {
      // Return null or default structure; frontend handles empty state
      return { layout: [] };
    }

    return prefs;
  }

  /**
   * Update dashboard preferences
   */
  async updateDashboardPreferences(tenantId: string, userId: string, layout: any[]) {
    return this.prisma.dashboardPreference.upsert({
      where: { userId },
      update: {
        layout: layout as any,
      },
      create: {
        tenantId,
        userId,
        layout: layout as any,
      },
    });
  }
}

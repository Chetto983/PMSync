/**
 * Google Calendar Provider
 *
 * Implementation of ICalendarProvider that wraps GoogleCalendarSyncService
 * Extends BaseCalendarProvider for shared calendar operations
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CryptoService } from '../../../common/services/crypto.service';
import { GoogleOAuthService } from '../../providers/services/google-oauth.service';
import { GoogleCalendarSyncService } from '../services/google-calendar-sync.service';
import type {
  CalendarProviderConfig,
  CalendarSyncOptions,
  CalendarSyncResult,
} from '../../providers/interfaces/calendar-provider.interface';
import { CalendarProviderError } from '../../providers/interfaces/calendar-provider.interface';
import { BaseCalendarProvider, CalendarProviderType } from './base-calendar.provider';

@Injectable()
export class GoogleCalendarProvider extends BaseCalendarProvider {
  protected readonly providerType: CalendarProviderType = 'google';

  constructor(
    config: CalendarProviderConfig,
    prisma: PrismaService,
    crypto: CryptoService,
    private readonly googleOAuth: GoogleOAuthService,
    private readonly googleCalendarSync: GoogleCalendarSyncService,
  ) {
    super(config, prisma, crypto);
  }

  // ==================== Provider-Specific: Authentication ====================

  async refreshToken(): Promise<{ accessToken: string; expiresAt: Date }> {
    return this.withErrorHandling('refreshToken', async () => {
      const provider = await this.prisma.providerConfig.findUnique({
        where: { id: this.config.providerId },
      });

      if (!provider || !provider.refreshToken || !provider.refreshTokenEncryptionIv) {
        throw new CalendarProviderError(
          'No refresh token available',
          'REFRESH_TOKEN_MISSING',
          'google',
        );
      }

      const refreshToken = this.crypto.decrypt(provider.refreshToken, provider.refreshTokenEncryptionIv);
      const refreshed = await this.googleOAuth.refreshAccessToken(refreshToken);

      const encryptedAccess = this.crypto.encrypt(refreshed.accessToken);
      await this.prisma.providerConfig.update({
        where: { id: this.config.providerId },
        data: {
          accessToken: encryptedAccess.encrypted,
          tokenEncryptionIv: encryptedAccess.iv,
          tokenExpiresAt: refreshed.expiresAt,
        },
      });

      return {
        accessToken: refreshed.accessToken,
        expiresAt: refreshed.expiresAt,
      };
    });
  }

  // ==================== Provider-Specific: Sync ====================

  async syncCalendars(_options?: CalendarSyncOptions): Promise<CalendarSyncResult> {
    return this.withErrorHandling('syncCalendars', async () => {
      try {
        return await this.googleCalendarSync.syncCalendar(this.config.providerId);
      } catch (error) {
        this.logger.error(`Sync failed for provider ${this.config.providerId}:`, error);
        throw new CalendarProviderError(
          'Calendar sync failed',
          'SYNC_FAILED',
          'google',
          error,
        );
      }
    });
  }
}

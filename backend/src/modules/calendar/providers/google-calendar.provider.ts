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
import { ProviderTokenService } from '../../email-sync/services/provider-token.service';
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
    private readonly providerTokenService: ProviderTokenService,
  ) {
    super(config, prisma, crypto);
  }

  // ==================== Provider-Specific: Authentication ====================

  async refreshToken(): Promise<{ accessToken: string; expiresAt: Date }> {
    return this.withErrorHandling('refreshToken', async () => {
      // Use centralized token service which handles distributed locking and refresh
      const { provider, accessToken } = await this.providerTokenService.getProviderWithToken(
        this.config.providerId,
      );

      if (!provider.tokenExpiresAt) {
        throw new CalendarProviderError(
          'Token does not have an expiration date',
          'TOKEN_INVALID',
          'google',
        );
      }

      return {
        accessToken,
        expiresAt: provider.tokenExpiresAt,
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

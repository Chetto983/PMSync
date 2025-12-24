/**
 * Microsoft Calendar Provider
 *
 * Implementation of ICalendarProvider that wraps MicrosoftCalendarSyncService
 * Extends BaseCalendarProvider for shared calendar operations
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CryptoService } from '../../../common/services/crypto.service';
import { MicrosoftOAuthService } from '../../providers/services/microsoft-oauth.service';
import { MicrosoftCalendarSyncService } from '../services/microsoft-calendar-sync.service';
import type {
  CalendarProviderConfig,
  CalendarSyncOptions,
  CalendarSyncResult,
  CreateCalendarEventData,
  UpdateCalendarEventData,
} from '../../providers/interfaces/calendar-provider.interface';
import { CalendarProviderError } from '../../providers/interfaces/calendar-provider.interface';
import { ProviderTokenService } from '../../email-sync/services/provider-token.service';
import { BaseCalendarProvider, CalendarProviderType } from './base-calendar.provider';

@Injectable()
export class MicrosoftCalendarProvider extends BaseCalendarProvider {
  protected readonly providerType: CalendarProviderType = 'microsoft';

  constructor(
    config: CalendarProviderConfig,
    prisma: PrismaService,
    crypto: CryptoService,
    private readonly microsoftOAuth: MicrosoftOAuthService,
    private readonly microsoftCalendarSync: MicrosoftCalendarSyncService,
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
          'microsoft',
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
        return await this.microsoftCalendarSync.syncCalendar(this.config.providerId);
      } catch (error) {
        this.logger.error(`Sync failed for provider ${this.config.providerId}:`, error);
        throw new CalendarProviderError(
          'Calendar sync failed',
          'SYNC_FAILED',
          'microsoft',
          error,
        );
      }
    });
  }

  // ==================== Provider-Specific: Event Operations with Extra Validation ====================

  /**
   * Microsoft-specific createEvent with calendar existence validation
   */
  async createEvent(calendarId: string, eventData: CreateCalendarEventData): Promise<{ id: string }> {
    return this.withErrorHandling('createEvent', async () => {
      // Microsoft-specific: Validate that calendar exists before creating event
      const calendarExists = await this.prisma.calendarEvent.findFirst({
        where: {
          providerId: this.config.providerId,
          calendarId: calendarId,
        },
      });

      if (!calendarExists) {
        throw new CalendarProviderError('Calendar not found', 'CALENDAR_NOT_FOUND', 'microsoft');
      }

      // Use more specific event ID format for Microsoft
      const eventId = `event-${calendarId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      await this.prisma.calendarEvent.create({
        data: {
          tenantId: this.config.userId,
          providerId: this.config.providerId,
          externalId: eventId,
          calendarId,
          calendarName: calendarId,
          title: eventData.title,
          description: eventData.description,
          startTime: eventData.startTime,
          endTime: eventData.endTime,
          isAllDay: eventData.isAllDay || false,
          timeZone: eventData.timeZone || 'UTC',
          organizer: this.config.email,
          attendees: eventData.attendees,
          metadata: {
            createdVia: 'ProviderAPI',
            source: this.getSourceLabel(),
          } as any,
          lastSyncedAt: new Date(),
        },
      });

      this.logger.log(`Created event "${eventData.title}" (${eventId}) in calendar ${calendarId}`);

      return { id: eventId };
    });
  }

  /**
   * Microsoft-specific updateEvent with calendar ownership validation
   */
  async updateEvent(calendarId: string, eventData: UpdateCalendarEventData): Promise<void> {
    return this.withErrorHandling('updateEvent', async () => {
      const { id, ...updateData } = eventData;

      // Microsoft-specific: Validate event exists and belongs to specified calendar
      const existingEvent = await this.prisma.calendarEvent.findFirst({
        where: {
          providerId: this.config.providerId,
          externalId: id,
          isDeleted: false,
        },
        select: { calendarId: true, title: true },
      });

      if (!existingEvent) {
        throw new CalendarProviderError('Event not found', 'EVENT_NOT_FOUND', 'microsoft');
      }

      if (existingEvent.calendarId !== calendarId) {
        throw new CalendarProviderError('Event does not belong to specified calendar', 'INVALID_OPERATION', 'microsoft');
      }

      await this.prisma.calendarEvent.updateMany({
        where: {
          providerId: this.config.providerId,
          externalId: id,
        },
        data: {
          title: updateData.title,
          description: updateData.description,
          startTime: updateData.startTime,
          endTime: updateData.endTime,
          isAllDay: updateData.isAllDay,
          timeZone: updateData.timeZone,
          attendees: updateData.attendees,
          lastSyncedAt: new Date(),
        },
      });

      const updatedTitle = updateData.title || existingEvent.title;
      this.logger.log(`Updated event "${updatedTitle}" (${id}) in calendar ${calendarId}`);
    });
  }

  /**
   * Microsoft-specific deleteEvent with calendar ownership validation
   */
  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    return this.withErrorHandling('deleteEvent', async () => {
      // Microsoft-specific: Validate event exists and belongs to specified calendar
      const existingEvent = await this.prisma.calendarEvent.findFirst({
        where: {
          providerId: this.config.providerId,
          externalId: eventId,
          isDeleted: false,
        },
        select: { calendarId: true, title: true },
      });

      if (!existingEvent) {
        throw new CalendarProviderError('Event not found', 'EVENT_NOT_FOUND', 'microsoft');
      }

      if (existingEvent.calendarId !== calendarId) {
        throw new CalendarProviderError('Event does not belong to specified calendar', 'INVALID_OPERATION', 'microsoft');
      }

      await this.prisma.calendarEvent.updateMany({
        where: {
          providerId: this.config.providerId,
          externalId: eventId,
        },
        data: {
          isDeleted: true,
          lastSyncedAt: new Date(),
        },
      });

      this.logger.log(`Deleted event "${existingEvent.title}" (${eventId}) from calendar ${calendarId}`);
    });
  }
}

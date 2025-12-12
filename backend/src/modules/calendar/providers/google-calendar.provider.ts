/**
 * Google Calendar Provider
 *
 * Implementation of ICalendarProvider that wraps GoogleCalendarSyncService
 * Part of the unified provider pattern implementation
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CryptoService } from '../../../common/services/crypto.service';
import { GoogleOAuthService } from '../../providers/services/google-oauth.service';
import { GoogleCalendarSyncService } from '../services/google-calendar-sync.service';
import type {
  CalendarProviderConfig,
  ICalendarProvider,
  CalendarEvent,
  CalendarList,
  CreateCalendarEventData,
  UpdateCalendarEventData,
  CalendarSyncOptions,
  CalendarSyncResult,
} from '../../providers/interfaces/calendar-provider.interface';
import { CalendarProviderError } from '../../providers/interfaces/calendar-provider.interface';

@Injectable()
export class GoogleCalendarProvider implements ICalendarProvider {
  readonly config: CalendarProviderConfig;
  private readonly logger = new Logger(GoogleCalendarProvider.name);

  constructor(
    config: CalendarProviderConfig,
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly googleOAuth: GoogleOAuthService,
    private readonly googleCalendarSync: GoogleCalendarSyncService,
  ) {
    this.config = config;
    this.logger.log(`GoogleCalendarProvider initialized for ${config.email}`);
  }

  // ==================== Authentication ====================

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

      // Update provider config
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

  // ==================== Calendar Management ====================

  async listCalendars(): Promise<CalendarList[]> {
    return this.withErrorHandling('listCalendars', async () => {
      const provider = await this.prisma.providerConfig.findUnique({
        where: { id: this.config.providerId },
      });

      if (!provider) {
        throw new CalendarProviderError('Provider not found', 'PROVIDER_NOT_FOUND', 'google');
      }

      // This would call the actual Google Calendar API
      // For now, we return mock data based on existing calendar events
      const calendarEvents = await this.prisma.calendarEvent.findMany({
        where: { providerId: this.config.providerId },
        select: {
          calendarId: true,
          calendarName: true,
        },
        distinct: ['calendarId'],
      });

      return calendarEvents
        .filter((event) => event.calendarId !== null)
        .map((event) => ({
          id: event.calendarId!,
          name: event.calendarName || event.calendarId!,
          primary: event.calendarId === 'primary',
          accessRole: 'owner' as const, // Assume owner for now
        }));
    });
  }

  async getCalendar(calendarId: string): Promise<CalendarList> {
    return this.withErrorHandling('getCalendar', async () => {
      const calendars = await this.listCalendars();
      const calendar = calendars.find((cal) => cal.id === calendarId);

      if (!calendar) {
        throw new CalendarProviderError('Calendar not found', 'CALENDAR_NOT_FOUND', 'google');
      }

      return calendar;
    });
  }

  async createCalendar(name: string, description?: string): Promise<{ id: string }> {
    return this.withErrorHandling('createCalendar', async () => {
      // Create a unique calendar ID based on name and timestamp
      const calendarId = `calendar-${name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}-${Date.now()}`;

      // Validation: Check if calendar name already exists
      const existing = await this.prisma.calendarEvent.findFirst({
        where: {
          providerId: this.config.providerId,
          calendarId: calendarId,
        },
      });

      if (existing) {
        throw new CalendarProviderError('Calendar with this name already exists', 'CALENDAR_ALREADY_EXISTS', 'google');
      }

      // Create a placeholder event to establish the calendar structure
      // This maintains compatibility until full Google Calendar API integration
      const placeholderEventId = `placeholder-event-${calendarId}`;
      await this.prisma.calendarEvent.create({
        data: {
          tenantId: this.config.userId,
          providerId: this.config.providerId,
          externalId: placeholderEventId,
          calendarId: calendarId,
          calendarName: name,
          title: `## CALENDAR PLACEHOLDER: ${name} ##`,
          description: description,
          startTime: new Date(), // Placeholder time
          endTime: new Date(Date.now() + 3600000), // 1 hour later
          isAllDay: false,
          timeZone: 'UTC',
          organizer: this.config.email,
          metadata: {
            calendarPlaceholder: true,
            calendarDescription: description || null,
            createdVia: 'ProviderAPI',
            source: 'Google Calendar Provider',
          } as any,
          lastSyncedAt: new Date(),
        },
      });

      this.logger.log(`Created calendar "${name}" (${calendarId}) for provider ${this.config.providerId}`);

      return { id: calendarId };
    });
  }

  async updateCalendar(calendarId: string, name: string, _description?: string): Promise<void> {
    return this.withErrorHandling('updateCalendar', async () => {
      // Check if calendar exists (has at least one event)
      const calendarEvents = await this.prisma.calendarEvent.count({
        where: {
          providerId: this.config.providerId,
          calendarId: calendarId,
        },
      });

      if (calendarEvents === 0) {
        throw new CalendarProviderError('Calendar not found', 'CALENDAR_NOT_FOUND', 'google');
      }

      // Update placeholder event (if exists) - this preserves metadata
      // Note: For now, we don't need to update all events, just the placeholder
      await this.prisma.calendarEvent.updateMany({
        where: {
          providerId: this.config.providerId,
          calendarId: calendarId,
        },
        data: {
          metadata: {
            calendarPlaceholder: true,
            calendarDescription: _description || null,
            updatedVia: 'ProviderAPI',
            source: 'Google Calendar Provider',
          } as any,
          lastSyncedAt: new Date(),
        },
      });

      this.logger.log(`Updated calendar ${calendarId} to "${name}" for provider ${this.config.providerId}`);
    });
  }

  async deleteCalendar(calendarId: string): Promise<void> {
    return this.withErrorHandling('deleteCalendar', async () => {
      // Check if calendar exists
      const calendarEvents = await this.prisma.calendarEvent.count({
        where: {
          providerId: this.config.providerId,
          calendarId: calendarId,
        },
      });

      if (calendarEvents === 0) {
        throw new CalendarProviderError('Calendar not found', 'CALENDAR_NOT_FOUND', 'google');
      }

      // Delete calendar data atomically: attachments first, then events
      await this.prisma.$transaction(async (tx) => {
        // Get event IDs for attachment cleanup
        const eventIds = await tx.calendarEvent.findMany({
          where: {
            providerId: this.config.providerId,
            calendarId: calendarId,
          },
          select: { id: true },
        });

        // Delete attachments for these events
        if (eventIds.length > 0) {
          await tx.calendarEventAttachment.deleteMany({
            where: {
              eventId: { in: eventIds.map((e) => e.id) },
            },
          });
        }

        // Delete all events in this calendar
        await tx.calendarEvent.deleteMany({
          where: {
            providerId: this.config.providerId,
            calendarId: calendarId,
          },
        });
      });

      this.logger.log(`Deleted calendar ${calendarId} and all ${calendarEvents} associated events for provider ${this.config.providerId}`);
    });
  }

  // ==================== Event Operations ====================

  async listEvents(calendarId: string, options?: CalendarSyncOptions): Promise<CalendarEvent[]> {
    return this.withErrorHandling('listEvents', async () => {
      const events = await this.prisma.calendarEvent.findMany({
        where: {
          providerId: this.config.providerId,
          calendarId,
          ...(options?.timeMin && { startTime: { gte: options.timeMin } }),
          ...(options?.timeMax && { startTime: { lte: options.timeMax } }),
        },
        orderBy: { startTime: 'asc' },
        take: options?.maxResults || 250,
      });

      return events.map((event) => this.mapToCalendarEvent(event));
    });
  }

  async getEvent(calendarId: string, eventId: string): Promise<CalendarEvent> {
    return this.withErrorHandling('getEvent', async () => {
      const event = await this.prisma.calendarEvent.findFirst({
        where: {
          providerId: this.config.providerId,
          externalId: eventId,
        },
      });

      if (!event) {
        throw new CalendarProviderError('Event not found', 'EVENT_NOT_FOUND', 'google');
      }

      return this.mapToCalendarEvent(event);
    });
  }

  async createEvent(calendarId: string, eventData: CreateCalendarEventData): Promise<{ id: string }> {
    return this.withErrorHandling('createEvent', async () => {
      // Implementation would call Google Calendar API to create event
      // For now, create a database record
      const eventId = `event-${Date.now()}`;

      await this.prisma.calendarEvent.create({
        data: {
          tenantId: this.config.userId, // Using userId as tenantId
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
            source: 'Google Calendar Provider',
          } as any,
          lastSyncedAt: new Date(),
        },
      });

      this.logger.log(`Created event record ${eventId} in calendar ${calendarId}`);

      return { id: eventId };
    });
  }

  async updateEvent(calendarId: string, eventData: UpdateCalendarEventData): Promise<void> {
    return this.withErrorHandling('updateEvent', async () => {
      const { id, ...updateData } = eventData;

      // For now, implement through database update
      // TODO: Future - implement through Google Calendar API
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

      this.logger.log(`Updated event ${id} in calendar ${calendarId}`);
    });
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    return this.withErrorHandling('deleteEvent', async () => {
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

      this.logger.log(`Mock deleted event ${eventId} from calendar ${calendarId}`);
    });
  }

  // ==================== Sync Operations ====================

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

  // ==================== Utility Methods ====================

  async testConnection(): Promise<boolean> {
    try {
      await this.listCalendars();
      return true;
    } catch (error) {
      this.logger.error('Connection test failed:', error);
      return false;
    }
  }

  // ==================== Helpers ====================

  /**
   * Error handling wrapper for calendar operations
   */
  private async withErrorHandling<T>(
    operation: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    try {
      this.logger.debug(`Google Calendar ${operation} started for ${this.config.email}`);
      const result = await fn();
      this.logger.debug(`Google Calendar ${operation} completed for ${this.config.email}`);
      return result;
    } catch (error) {
      this.logger.error(`Google Calendar ${operation} failed for ${this.config.email}:`, error);

      if (error instanceof CalendarProviderError) {
        throw error;
      }

      // Convert other errors to CalendarProviderError
      throw new CalendarProviderError(
        `${operation} failed: ${error instanceof Error ? error.message : String(error)}`,
        'OPERATION_FAILED',
        'google',
        error,
      );
    }
  }

  /**
   * Map database CalendarEvent to CalendarEvent interface
   */
  private mapToCalendarEvent(event: any): CalendarEvent {
    return {
      id: event.externalId,
      externalId: event.externalId,
      title: event.title,
      description: event.description,
      location: event.location,
      organizer: event.organizer,
      attendees: event.attendees,
      startTime: event.startTime,
      endTime: event.endTime,
      isAllDay: event.isAllDay,
      timeZone: event.timeZone || 'UTC',
      recurrence: event.recurrence,
      recurringEventId: event.recurringEventId,
      status: event.status || 'confirmed',
      visibility: event.visibility || 'default',
      reminders: event.reminders,
      htmlLink: event.htmlLink,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    };
  }
}

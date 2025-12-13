/**
 * Base Calendar Provider
 *
 * Abstract base class containing shared logic for all calendar providers.
 * Reduces ~350 lines of code duplication between Google and Microsoft providers.
 *
 * Provider-specific implementations only need to override:
 * - refreshToken() - uses provider-specific OAuth service
 * - syncCalendars() - uses provider-specific sync service
 * - createEvent() (optional) - if provider needs extra validation
 * - updateEvent() (optional) - if provider needs extra validation
 * - deleteEvent() (optional) - if provider needs extra validation
 */

import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CryptoService } from '../../../common/services/crypto.service';
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

export type CalendarProviderType = 'google' | 'microsoft';

export abstract class BaseCalendarProvider implements ICalendarProvider {
  readonly config: CalendarProviderConfig;
  protected readonly logger: Logger;
  protected abstract readonly providerType: CalendarProviderType;

  constructor(
    config: CalendarProviderConfig,
    protected readonly prisma: PrismaService,
    protected readonly crypto: CryptoService,
  ) {
    this.config = config;
    this.logger = new Logger(this.constructor.name);
    this.logger.log(`${this.constructor.name} initialized for ${config.email}`);
  }

  // ==================== Abstract Methods (Provider-Specific) ====================

  abstract refreshToken(): Promise<{ accessToken: string; expiresAt: Date }>;
  abstract syncCalendars(options?: CalendarSyncOptions): Promise<CalendarSyncResult>;

  // ==================== Calendar Management (Shared) ====================

  async listCalendars(): Promise<CalendarList[]> {
    return this.withErrorHandling('listCalendars', async () => {
      const provider = await this.prisma.providerConfig.findUnique({
        where: { id: this.config.providerId },
      });

      if (!provider) {
        throw new CalendarProviderError('Provider not found', 'PROVIDER_NOT_FOUND', this.providerType);
      }

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
          primary: this.providerType === 'google' ? event.calendarId === 'primary' : false,
          accessRole: 'owner' as const,
        }));
    });
  }

  async getCalendar(calendarId: string): Promise<CalendarList> {
    return this.withErrorHandling('getCalendar', async () => {
      const calendars = await this.listCalendars();
      const calendar = calendars.find((cal) => cal.id === calendarId);

      if (!calendar) {
        throw new CalendarProviderError('Calendar not found', 'CALENDAR_NOT_FOUND', this.providerType);
      }

      return calendar;
    });
  }

  async createCalendar(name: string, description?: string): Promise<{ id: string }> {
    return this.withErrorHandling('createCalendar', async () => {
      const calendarId = `calendar-${name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}-${Date.now()}`;

      const existing = await this.prisma.calendarEvent.findFirst({
        where: {
          providerId: this.config.providerId,
          calendarId: calendarId,
        },
      });

      if (existing) {
        throw new CalendarProviderError('Calendar with this name already exists', 'CALENDAR_ALREADY_EXISTS', this.providerType);
      }

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
          startTime: new Date(),
          endTime: new Date(Date.now() + 3600000),
          isAllDay: false,
          timeZone: 'UTC',
          organizer: this.config.email,
          metadata: {
            calendarPlaceholder: true,
            calendarDescription: description || null,
            createdVia: 'ProviderAPI',
            source: this.getSourceLabel(),
          } as any,
          lastSyncedAt: new Date(),
        },
      });

      this.logger.log(`Created calendar "${name}" (${calendarId}) for provider ${this.config.providerId}`);

      return { id: calendarId };
    });
  }

  async updateCalendar(calendarId: string, name: string, description?: string): Promise<void> {
    return this.withErrorHandling('updateCalendar', async () => {
      const calendarEvents = await this.prisma.calendarEvent.count({
        where: {
          providerId: this.config.providerId,
          calendarId: calendarId,
        },
      });

      if (calendarEvents === 0) {
        throw new CalendarProviderError('Calendar not found', 'CALENDAR_NOT_FOUND', this.providerType);
      }

      await this.prisma.calendarEvent.updateMany({
        where: {
          providerId: this.config.providerId,
          calendarId: calendarId,
        },
        data: {
          metadata: {
            calendarPlaceholder: true,
            calendarDescription: description || null,
            updatedVia: 'ProviderAPI',
            source: this.getSourceLabel(),
          } as any,
          lastSyncedAt: new Date(),
        },
      });

      this.logger.log(`Updated calendar ${calendarId} to "${name}" for provider ${this.config.providerId}`);
    });
  }

  async deleteCalendar(calendarId: string): Promise<void> {
    return this.withErrorHandling('deleteCalendar', async () => {
      const calendarEvents = await this.prisma.calendarEvent.count({
        where: {
          providerId: this.config.providerId,
          calendarId: calendarId,
        },
      });

      if (calendarEvents === 0) {
        throw new CalendarProviderError('Calendar not found', 'CALENDAR_NOT_FOUND', this.providerType);
      }

      await this.prisma.$transaction(async (tx) => {
        const eventIds = await tx.calendarEvent.findMany({
          where: {
            providerId: this.config.providerId,
            calendarId: calendarId,
          },
          select: { id: true },
        });

        if (eventIds.length > 0) {
          await tx.calendarEventAttachment.deleteMany({
            where: {
              eventId: { in: eventIds.map((e) => e.id) },
            },
          });
        }

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

  // ==================== Event Operations (Shared) ====================

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
        throw new CalendarProviderError('Event not found', 'EVENT_NOT_FOUND', this.providerType);
      }

      return this.mapToCalendarEvent(event);
    });
  }

  async createEvent(calendarId: string, eventData: CreateCalendarEventData): Promise<{ id: string }> {
    return this.withErrorHandling('createEvent', async () => {
      const eventId = `event-${Date.now()}`;

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

      this.logger.log(`Created event record ${eventId} in calendar ${calendarId}`);

      return { id: eventId };
    });
  }

  async updateEvent(calendarId: string, eventData: UpdateCalendarEventData): Promise<void> {
    return this.withErrorHandling('updateEvent', async () => {
      const { id, ...updateData } = eventData;

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

      this.logger.log(`Deleted event ${eventId} from calendar ${calendarId}`);
    });
  }

  // ==================== Utility Methods (Shared) ====================

  async testConnection(): Promise<boolean> {
    try {
      await this.listCalendars();
      return true;
    } catch (error) {
      this.logger.error('Connection test failed:', error);
      return false;
    }
  }

  // ==================== Protected Helpers ====================

  protected getSourceLabel(): string {
    return this.providerType === 'google' ? 'Google Calendar Provider' : 'Microsoft Calendar Provider';
  }

  protected async withErrorHandling<T>(
    operation: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    try {
      this.logger.debug(`${this.getProviderLabel()} ${operation} started for ${this.config.email}`);
      const result = await fn();
      this.logger.debug(`${this.getProviderLabel()} ${operation} completed for ${this.config.email}`);
      return result;
    } catch (error) {
      this.logger.error(`${this.getProviderLabel()} ${operation} failed for ${this.config.email}:`, error);

      if (error instanceof CalendarProviderError) {
        throw error;
      }

      throw new CalendarProviderError(
        `${operation} failed: ${error instanceof Error ? error.message : String(error)}`,
        'OPERATION_FAILED',
        this.providerType,
        error,
      );
    }
  }

  protected mapToCalendarEvent(event: any): CalendarEvent {
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

  private getProviderLabel(): string {
    return this.providerType === 'google' ? 'Google Calendar' : 'Microsoft Calendar';
  }
}

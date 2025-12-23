/**
 * Calendar List Service
 *
 * Handles calendar listing and management operations.
 * Follows 2025 NestJS patterns with single-responsibility design.
 */

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';

// ============================================================================
// INTERFACES
// ============================================================================

export interface CalendarInfo {
  id: string;
  calendarId: string;
  calendarName: string;
  providerId: string;
  providerEmail: string;
  providerType: string;
  eventCount: number;
  backgroundColor?: string;
  primary?: boolean;
}

export interface CreateCalendarDto {
  providerId: string;
  name: string;
  description?: string;
  color?: string;
}

export interface UpdateCalendarPreferencesDto {
  name?: string;
  color?: string;
}

// ============================================================================
// SERVICE
// ============================================================================

@Injectable()
export class CalendarListService {
  private readonly logger = new Logger(CalendarListService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  /**
   * List all calendars from all providers for a tenant
   * Extracts unique calendars from existing calendar events
   */
  async listCalendars(tenantId: string): Promise<{
    calendars: CalendarInfo[];
    total: number;
  }> {
    // Get all providers for this tenant that support calendar
    const providers = await this.prisma.providerConfig.findMany({
      where: {
        tenantId,
        supportsCalendar: true,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        providerType: true,
      },
    });

    // Create provider lookup map for O(1) access
    const providerMap = new Map(providers.map((p) => [p.id, p]));
    const providerIds = providers.map((p) => p.id);

    // Single aggregation query - fixes N+1 problem
    const calendarEvents = await this.prisma.calendarEvent.groupBy({
      by: ['calendarId', 'calendarName', 'providerId'],
      where: {
        tenantId,
        providerId: { in: providerIds },
        isDeleted: false,
        calendarId: { not: null },
      },
      _count: {
        id: true,
      },
    });

    // Build calendars map from single query result
    const calendarsMap = new Map<
      string,
      {
        calendarId: string;
        calendarName: string;
        providerId: string;
        providerEmail: string;
        providerType: string;
        eventCount: number;
        primary: boolean;
      }
    >();

    for (const cal of calendarEvents) {
      if (!cal.calendarId) continue;

      const provider = providerMap.get(cal.providerId);
      if (!provider) continue;

      const key = `${cal.providerId}:${cal.calendarId}`;
      calendarsMap.set(key, {
        calendarId: cal.calendarId,
        calendarName: cal.calendarName || cal.calendarId,
        providerId: cal.providerId,
        providerEmail: provider.email || '',
        providerType: provider.providerType,
        eventCount: cal._count.id,
        primary: cal.calendarId === 'primary',
      });
    }

    // Add default "primary" calendar for providers without events
    for (const provider of providers) {
      const key = `${provider.id}:primary`;
      if (!calendarsMap.has(key)) {
        calendarsMap.set(key, {
          calendarId: 'primary',
          calendarName: 'Primary Calendar',
          providerId: provider.id,
          providerEmail: provider.email || '',
          providerType: provider.providerType,
          eventCount: 0,
          primary: true,
        });
      }
    }

    const calendars = Array.from(calendarsMap.values()).map((cal) => ({
      id: `${cal.providerId}:${cal.calendarId}`,
      ...cal,
    }));

    // Sort: primary first, then by name
    calendars.sort((a, b) => {
      if (a.primary && !b.primary) return -1;
      if (!a.primary && b.primary) return 1;
      return a.calendarName.localeCompare(b.calendarName);
    });

    return {
      calendars,
      total: calendars.length,
    };
  }

  /**
   * Create a new calendar for a provider
   */
  async createCalendar(
    tenantId: string,
    data: CreateCalendarDto,
  ): Promise<{
    id: string;
    calendarId: string;
    calendarName: string;
    providerId: string;
    color?: string;
  }> {
    // Verify provider belongs to tenant
    const provider = await this.prisma.providerConfig.findFirst({
      where: {
        id: data.providerId,
        tenantId,
        supportsCalendar: true,
        isActive: true,
      },
    });

    if (!provider) {
      throw new NotFoundException('Provider not found or does not support calendar');
    }

    // Generate a unique calendar ID
    const calendarId = `custom-${data.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}-${Date.now()}`;

    // Check if calendar name already exists for this provider
    const existing = await this.prisma.calendarEvent.findFirst({
      where: {
        providerId: data.providerId,
        calendarName: data.name,
      },
    });

    if (existing) {
      throw new BadRequestException('Calendar with this name already exists');
    }

    this.logger.log(`Created calendar "${data.name}" (${calendarId}) for provider ${data.providerId}`);

    // Emit real-time event
    this.realtimeEvents.emitCalendarListUpdate(tenantId, {
      calendarId,
      calendarName: data.name,
      providerId: data.providerId,
      providerEmail: provider.email || undefined,
      color: data.color,
      reason: 'calendar-created',
      timestamp: new Date().toISOString(),
    });

    return {
      id: `${data.providerId}:${calendarId}`,
      calendarId,
      calendarName: data.name,
      providerId: data.providerId,
      color: data.color,
    };
  }

  /**
   * Update calendar preferences (color, name)
   */
  async updateCalendarPreferences(
    tenantId: string,
    providerId: string,
    calendarId: string,
    data: UpdateCalendarPreferencesDto,
  ): Promise<{ success: boolean; calendarId: string; providerId: string; color?: string }> {
    // Verify provider belongs to tenant
    const provider = await this.prisma.providerConfig.findFirst({
      where: {
        id: providerId,
        tenantId,
      },
    });

    if (!provider) {
      throw new NotFoundException('Provider not found');
    }

    // Update calendarName on all events with this calendarId if name is provided
    if (data.name) {
      await this.prisma.calendarEvent.updateMany({
        where: {
          providerId,
          calendarId,
          tenantId,
        },
        data: {
          calendarName: data.name,
        },
      });
    }

    this.logger.log(`Updated calendar preferences for ${calendarId} on provider ${providerId}`);

    // Emit real-time event
    this.realtimeEvents.emitCalendarListUpdate(tenantId, {
      calendarId,
      calendarName: data.name || calendarId,
      providerId,
      providerEmail: provider.email || undefined,
      color: data.color,
      reason: 'calendar-updated',
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      calendarId,
      providerId,
      color: data.color,
    };
  }
}

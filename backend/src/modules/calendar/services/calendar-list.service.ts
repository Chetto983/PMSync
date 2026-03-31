/**
 * Calendar List Service
 *
 * Handles calendar listing and management operations.
 * Follows 2025 NestJS patterns with single-responsibility design.
 */

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ProviderConfig } from '@prisma/client';
import axios from 'axios';
import { calendar_v3, google } from 'googleapis';
import { PrismaService } from '../../../prisma/prisma.service';
import { ProviderTokenService } from '../../email-sync/services/provider-token.service';
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
  removable?: boolean;
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

/** Internal preference type for calendar color/visibility */
interface CalendarPref {
  providerId: string;
  calendarId: string;
  color: string | null;
  displayName: string | null;
  isVisible: boolean;
}

interface RemoteCalendarInfo {
  calendarId: string;
  calendarName: string;
  primary: boolean;
  removable: boolean;
  backgroundColor?: string;
}

// ============================================================================
// SERVICE
// ============================================================================

@Injectable()
export class CalendarListService {
  private readonly logger = new Logger(CalendarListService.name);
  private readonly GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerTokenService: ProviderTokenService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  /**
   * List all calendars from all providers for a tenant
   * Extracts unique calendars from existing calendar events
   * Includes user preferences (color, visibility) from CalendarPreference table
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

    // Fetch calendar preferences for all providers in this tenant
    const preferences: CalendarPref[] = await (this.prisma as any).calendarPreference.findMany({
      where: {
        tenantId,
        providerId: { in: providerIds },
      },
    });

    // Create preference lookup map: "providerId:calendarId" -> preference
    const prefMap = new Map<string, CalendarPref>(
      preferences.map((p: CalendarPref) => [`${p.providerId}:${p.calendarId}`, p]),
    );

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

    // Build calendars map from local DB state first.
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
        backgroundColor?: string;
        removable: boolean;
      }
    >();

    for (const cal of calendarEvents) {
      if (!cal.calendarId) continue;

      const provider = providerMap.get(cal.providerId);
      if (!provider) continue;

      const key = `${cal.providerId}:${cal.calendarId}`;
      const pref = prefMap.get(key);

      calendarsMap.set(key, {
        calendarId: cal.calendarId,
        calendarName: pref?.displayName || cal.calendarName || cal.calendarId,
        providerId: cal.providerId,
        providerEmail: provider.email || '',
        providerType: provider.providerType,
        eventCount: cal._count.id,
        primary: cal.calendarId === 'primary',
        backgroundColor: pref?.color || undefined,
        removable: cal.calendarId !== 'primary',
      });
    }

    // Add default "primary" calendar for providers without events
    for (const provider of providers) {
      const key = `${provider.id}:primary`;
      if (!calendarsMap.has(key)) {
        const pref = prefMap.get(key);
        calendarsMap.set(key, {
          calendarId: 'primary',
          calendarName: pref?.displayName || 'Primary Calendar',
          providerId: provider.id,
          providerEmail: provider.email || '',
          providerType: provider.providerType,
          eventCount: 0,
          primary: true,
          backgroundColor: pref?.color || undefined,
          removable: false,
        });
      }
    }

    // Add calendars from CalendarPreference that have no events yet
    // This ensures newly created calendars show up before any events are added
    for (const pref of preferences) {
      const key = `${pref.providerId}:${pref.calendarId}`;
      if (!calendarsMap.has(key)) {
        const provider = providerMap.get(pref.providerId);
        if (provider) {
          calendarsMap.set(key, {
            calendarId: pref.calendarId,
            calendarName: pref.displayName || pref.calendarId,
            providerId: pref.providerId,
            providerEmail: provider.email || '',
            providerType: provider.providerType,
            eventCount: 0,
            primary: pref.calendarId === 'primary',
            backgroundColor: pref.color || undefined,
            removable: pref.calendarId !== 'primary',
          });
        }
      }
    }

    // Overlay remote provider calendars so zero-event calendars and provider-native
    // metadata are reflected accurately in the UI.
    const remoteCalendarsByProvider = await Promise.all(
      providers.map(async (provider) => {
        try {
          const calendars = await this.listProviderCalendars(tenantId, provider);
          return [provider.id, calendars] as const;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `Failed to fetch remote calendars for provider ${provider.id}: ${message}`,
          );
          return [provider.id, [] as RemoteCalendarInfo[]] as const;
        }
      }),
    );

    for (const [providerId, remoteCalendars] of remoteCalendarsByProvider) {
      const provider = providerMap.get(providerId);
      if (!provider) {
        continue;
      }

      for (const remote of remoteCalendars) {
        const key = `${providerId}:${remote.calendarId}`;
        const pref = prefMap.get(key);
        const existing = calendarsMap.get(key);

        calendarsMap.set(key, {
          calendarId: remote.calendarId,
          calendarName:
            pref?.displayName ||
            remote.calendarName ||
            existing?.calendarName ||
            remote.calendarId,
          providerId,
          providerEmail: provider.email || '',
          providerType: provider.providerType,
          eventCount: existing?.eventCount || 0,
          primary: remote.primary,
          backgroundColor:
            pref?.color || remote.backgroundColor || existing?.backgroundColor,
          removable: remote.removable,
        });
      }
    }

    // Auto-persist provider colors as CalendarPreference defaults (non-blocking)
    const colorUpserts: Promise<unknown>[] = [];
    for (const [key, cal] of calendarsMap) {
      if (cal.backgroundColor && !prefMap.has(key)) {
        colorUpserts.push(
          (this.prisma as any).calendarPreference.create({
            data: {
              tenantId,
              providerId: cal.providerId,
              calendarId: cal.calendarId,
              color: cal.backgroundColor,
              displayName: cal.calendarName !== cal.calendarId ? cal.calendarName : null,
              isVisible: true,
            },
          }).catch((err: Error) => {
            // Ignore unique constraint violations (concurrent requests)
            if (!err.message?.includes('P2002')) {
              this.logger.warn(`Failed to persist provider color for ${key}: ${err.message}`);
            }
          }),
        );
      }
    }
    if (colorUpserts.length > 0) {
      void Promise.all(colorUpserts);
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
  ): Promise<CalendarInfo> {
    const { provider, accessToken } = await this.getProviderWithToken(tenantId, data.providerId);
    const remoteCalendar =
      provider.providerType === 'google'
        ? await this.createGoogleCalendar(accessToken, data)
        : await this.createMicrosoftCalendar(accessToken, data);

    await (this.prisma as any).calendarPreference.upsert({
      where: {
        tenantId_providerId_calendarId: {
          tenantId,
          providerId: provider.id,
          calendarId: remoteCalendar.calendarId,
        },
      },
      update: {
        color: data.color || null,
        displayName: remoteCalendar.calendarName,
        isVisible: true,
      },
      create: {
        tenantId,
        providerId: provider.id,
        calendarId: remoteCalendar.calendarId,
        color: data.color || null,
        displayName: remoteCalendar.calendarName,
        isVisible: true,
      },
    });

    this.logger.log(
      `Created provider calendar "${remoteCalendar.calendarName}" (${remoteCalendar.calendarId}) for provider ${provider.id}`,
    );

    this.realtimeEvents.emitCalendarListUpdate(tenantId, {
      calendarId: remoteCalendar.calendarId,
      calendarName: remoteCalendar.calendarName,
      providerId: provider.id,
      providerEmail: provider.email || undefined,
      color: data.color,
      reason: 'calendar-created',
      timestamp: new Date().toISOString(),
    });

    return {
      id: `${provider.id}:${remoteCalendar.calendarId}`,
      calendarId: remoteCalendar.calendarId,
      calendarName: remoteCalendar.calendarName,
      providerId: provider.id,
      providerEmail: provider.email || '',
      providerType: provider.providerType,
      eventCount: 0,
      backgroundColor: data.color || remoteCalendar.backgroundColor,
      primary: false,
      removable: true,
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
    const { provider, accessToken } = await this.getProviderWithToken(tenantId, providerId);

    if (provider.providerType === 'google') {
      await this.updateGoogleCalendar(accessToken, calendarId, data);
    } else if (provider.providerType === 'microsoft') {
      await this.updateMicrosoftCalendar(accessToken, calendarId, data);
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

    // Save color preference to CalendarPreference table (upsert)
    await (this.prisma as any).calendarPreference.upsert({
      where: {
        tenantId_providerId_calendarId: {
          tenantId,
          providerId,
          calendarId,
        },
      },
      update: {
        color: data.color || null,
        displayName: data.name || undefined,
      },
      create: {
        tenantId,
        providerId,
        calendarId,
        color: data.color || null,
        displayName: data.name || null,
        isVisible: true,
      },
    });

    this.logger.log(
      `Updated calendar preferences for ${calendarId} on provider ${providerId} - color: ${data.color}`,
    );

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

  /**
   * Delete a calendar from the provider and hide its local events immediately.
   */
  async deleteCalendar(
    tenantId: string,
    providerId: string,
    calendarId: string,
  ): Promise<{ success: boolean; calendarId: string; providerId: string }> {
    const { provider, accessToken } = await this.getProviderWithToken(tenantId, providerId);

    if (provider.providerType === 'google') {
      await this.deleteGoogleCalendar(accessToken, calendarId);
    } else if (provider.providerType === 'microsoft') {
      await this.deleteMicrosoftCalendar(accessToken, calendarId);
    }

    await Promise.all([
      (this.prisma as any).calendarPreference.deleteMany({
        where: {
          tenantId,
          providerId,
          calendarId,
        },
      }),
      this.prisma.calendarSyncState.deleteMany({
        where: {
          tenantId,
          providerId,
          calendarId,
        },
      }),
      this.prisma.calendarEvent.updateMany({
        where: {
          tenantId,
          providerId,
          calendarId,
          isDeleted: false,
        },
        data: {
          isDeleted: true,
          isCancelled: true,
          status: 'cancelled',
          lastSyncedAt: new Date(),
        },
      }),
    ]);

    this.realtimeEvents.emitCalendarListUpdate(tenantId, {
      calendarId,
      calendarName: calendarId,
      providerId,
      providerEmail: provider.email || undefined,
      reason: 'calendar-deleted',
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`Deleted calendar ${calendarId} for provider ${providerId}`);

    return {
      success: true,
      calendarId,
      providerId,
    };
  }

  private async getProviderWithToken(tenantId: string, providerId: string): Promise<{
    provider: ProviderConfig;
    accessToken: string;
  }> {
    const { provider, accessToken } = await this.providerTokenService.getProviderWithToken(
      providerId,
      tenantId,
    );

    if (!provider.supportsCalendar || !provider.isActive) {
      throw new NotFoundException('Provider not found or does not support calendar');
    }

    return { provider, accessToken };
  }

  private async listProviderCalendars(
    tenantId: string,
    provider: Pick<ProviderConfig, 'id' | 'providerType'>,
  ): Promise<RemoteCalendarInfo[]> {
    const { accessToken } = await this.providerTokenService.getProviderWithToken(
      provider.id,
      tenantId,
    );

    if (provider.providerType === 'google') {
      return this.listGoogleCalendars(accessToken);
    }

    if (provider.providerType === 'microsoft') {
      return this.listMicrosoftCalendars(accessToken);
    }

    return [];
  }

  private async listGoogleCalendars(accessToken: string): Promise<RemoteCalendarInfo[]> {
    const client = this.createGoogleCalendarClient(accessToken);
    const calendars: RemoteCalendarInfo[] = [];
    let pageToken: string | undefined;

    do {
      const response = await client.calendarList.list({
        maxResults: 250,
        pageToken,
        fields:
          'items(id,summary,summaryOverride,primary,backgroundColor,accessRole),nextPageToken',
      });

      for (const calendarItem of response.data.items || []) {
        if (!calendarItem.id) {
          continue;
        }

        calendars.push({
          calendarId: calendarItem.id,
          calendarName:
            calendarItem.summaryOverride ||
            calendarItem.summary ||
            calendarItem.id,
          primary: !!calendarItem.primary,
          removable: !calendarItem.primary,
          backgroundColor: calendarItem.backgroundColor || undefined,
        });
      }

      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    return calendars;
  }

  private async listMicrosoftCalendars(accessToken: string): Promise<RemoteCalendarInfo[]> {
    const response = await axios.get(`${this.GRAPH_API_BASE}/me/calendars`, {
      headers: this.getGraphHeaders(accessToken),
      params: {
        $select: 'id,name,isDefaultCalendar,isRemovable,hexColor',
      },
    });

    return (response.data.value || [])
      .filter((calendar: { id?: string }) => !!calendar.id)
      .map(
        (calendar: {
          id: string;
          name?: string;
          isDefaultCalendar?: boolean;
          isRemovable?: boolean;
          hexColor?: string;
        }) => ({
          calendarId: calendar.id,
          calendarName: calendar.name || calendar.id,
          primary: !!calendar.isDefaultCalendar,
          removable:
            calendar.isRemovable === undefined
              ? !calendar.isDefaultCalendar
              : !!calendar.isRemovable,
          backgroundColor: this.normalizeHexColor(calendar.hexColor),
        }),
      );
  }

  private async createGoogleCalendar(
    accessToken: string,
    data: CreateCalendarDto,
  ): Promise<RemoteCalendarInfo> {
    const client = this.createGoogleCalendarClient(accessToken);
    const response = await client.calendars.insert({
      requestBody: {
        summary: data.name,
        description: data.description,
      },
    });

    const calendarId = response.data.id;
    if (!calendarId) {
      throw new BadRequestException('Google Calendar did not return a calendar id');
    }

    const normalizedColor = this.normalizeHexColor(data.color);
    if (normalizedColor) {
      await client.calendarList.patch({
        calendarId,
        colorRgbFormat: true,
        requestBody: {
          backgroundColor: normalizedColor,
        },
      });
    }

    return {
      calendarId,
      calendarName: response.data.summary || data.name,
      primary: false,
      removable: true,
      backgroundColor: normalizedColor,
    };
  }

  private async createMicrosoftCalendar(
    accessToken: string,
    data: CreateCalendarDto,
  ): Promise<RemoteCalendarInfo> {
    const response = await axios.post(
      `${this.GRAPH_API_BASE}/me/calendars`,
      {
        name: data.name,
      },
      {
        headers: {
          ...this.getGraphHeaders(accessToken),
          'Content-Type': 'application/json',
        },
      },
    );

    return {
      calendarId: response.data.id,
      calendarName: response.data.name || data.name,
      primary: false,
      removable: true,
      backgroundColor: this.normalizeHexColor(data.color),
    };
  }

  private async updateGoogleCalendar(
    accessToken: string,
    calendarId: string,
    data: UpdateCalendarPreferencesDto,
  ): Promise<void> {
    const client = this.createGoogleCalendarClient(accessToken);
    const normalizedColor = this.normalizeHexColor(data.color);

    if (data.name === undefined && normalizedColor === undefined) {
      return;
    }

    await client.calendarList.patch({
      calendarId,
      colorRgbFormat: normalizedColor ? true : undefined,
      requestBody: {
        ...(data.name !== undefined ? { summaryOverride: data.name } : {}),
        ...(normalizedColor ? { backgroundColor: normalizedColor } : {}),
      },
    });
  }

  private async updateMicrosoftCalendar(
    accessToken: string,
    calendarId: string,
    data: UpdateCalendarPreferencesDto,
  ): Promise<void> {
    if (data.name === undefined) {
      return;
    }

    await axios.patch(
      `${this.GRAPH_API_BASE}/me/calendars/${encodeURIComponent(calendarId)}`,
      {
        name: data.name,
      },
      {
        headers: {
          ...this.getGraphHeaders(accessToken),
          'Content-Type': 'application/json',
        },
      },
    );
  }

  private async deleteGoogleCalendar(accessToken: string, calendarId: string): Promise<void> {
    const client = this.createGoogleCalendarClient(accessToken);

    if (calendarId === 'primary') {
      throw new BadRequestException('Primary Google calendar cannot be deleted');
    }

    let accessRole: string | undefined;
    try {
      const calendarEntry = await client.calendarList.get({ calendarId });
      accessRole = calendarEntry.data.accessRole || undefined;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to inspect Google calendar ${calendarId} before delete: ${message}`);
    }

    if (accessRole && accessRole !== 'owner') {
      await client.calendarList.delete({ calendarId });
      return;
    }

    await client.calendars.delete({ calendarId });
  }

  private async deleteMicrosoftCalendar(accessToken: string, calendarId: string): Promise<void> {
    const metadataResponse = await axios.get(
      `${this.GRAPH_API_BASE}/me/calendars/${encodeURIComponent(calendarId)}`,
      {
        headers: this.getGraphHeaders(accessToken),
        params: {
          $select: 'id,isDefaultCalendar,isRemovable',
        },
      },
    );

    if (metadataResponse.data?.isDefaultCalendar || metadataResponse.data?.isRemovable === false) {
      throw new BadRequestException('This Microsoft calendar cannot be deleted');
    }

    await axios.delete(`${this.GRAPH_API_BASE}/me/calendars/${encodeURIComponent(calendarId)}`, {
      headers: this.getGraphHeaders(accessToken),
    });
  }

  private createGoogleCalendarClient(accessToken: string): calendar_v3.Calendar {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    return google.calendar({ version: 'v3', auth: oauth2Client });
  }

  private getGraphHeaders(accessToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      'client-request-id': crypto.randomUUID(),
    };
  }

  private normalizeHexColor(color?: string | null): string | undefined {
    if (!color) {
      return undefined;
    }

    const normalized = color.startsWith('#') ? color : `#${color}`;
    return /^#[0-9A-Fa-f]{6}$/.test(normalized) ? normalized.toUpperCase() : undefined;
  }
}

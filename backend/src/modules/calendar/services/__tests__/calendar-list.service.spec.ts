import axios from 'axios';
import { CalendarListService } from '../calendar-list.service';

describe('CalendarListService', () => {
  let service: CalendarListService;
  let prisma: {
    calendarPreference: { upsert: jest.Mock; deleteMany: jest.Mock };
    calendarSyncState: { deleteMany: jest.Mock };
    calendarEvent: { updateMany: jest.Mock };
  };
  let providerTokenService: {
    getProviderWithToken: jest.Mock;
  };
  let realtimeEvents: {
    emitCalendarListUpdate: jest.Mock;
  };

  beforeEach(() => {
    jest.restoreAllMocks();

    prisma = {
      calendarPreference: {
        upsert: jest.fn().mockResolvedValue(undefined),
        deleteMany: jest.fn().mockResolvedValue(undefined),
      },
      calendarSyncState: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
      },
      calendarEvent: {
        updateMany: jest.fn().mockResolvedValue(undefined),
      },
    };

    providerTokenService = {
      getProviderWithToken: jest.fn(),
    };

    realtimeEvents = {
      emitCalendarListUpdate: jest.fn(),
    };

    service = new CalendarListService(
      prisma as any,
      providerTokenService as any,
      realtimeEvents as any,
    );
  });

  it('creates Google calendars remotely before persisting local preferences', async () => {
    providerTokenService.getProviderWithToken.mockResolvedValue({
      provider: {
        id: 'provider-google',
        tenantId: 'tenant-1',
        providerType: 'google',
        supportsCalendar: true,
        isActive: true,
        email: 'owner@example.com',
      },
      accessToken: 'google-token',
    });

    const insertMock = jest.fn().mockResolvedValue({
      data: {
        id: 'google-cal-1',
        summary: 'Operations',
      },
    });
    const patchMock = jest.fn().mockResolvedValue({ data: {} });

    jest
      .spyOn(service as any, 'createGoogleCalendarClient')
      .mockReturnValue({
        calendars: { insert: insertMock },
        calendarList: { patch: patchMock },
      });

    const result = await service.createCalendar('tenant-1', {
      providerId: 'provider-google',
      name: 'Operations',
      description: 'Team planning',
      color: '#4285f4',
    });

    expect(insertMock).toHaveBeenCalledWith({
      requestBody: {
        summary: 'Operations',
        description: 'Team planning',
      },
    });
    expect(patchMock).toHaveBeenCalledWith({
      calendarId: 'google-cal-1',
      colorRgbFormat: true,
      requestBody: {
        backgroundColor: '#4285F4',
      },
    });
    expect(prisma.calendarPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          tenantId: 'tenant-1',
          providerId: 'provider-google',
          calendarId: 'google-cal-1',
          displayName: 'Operations',
          color: '#4285f4',
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'provider-google:google-cal-1',
        calendarId: 'google-cal-1',
        calendarName: 'Operations',
        providerId: 'provider-google',
        eventCount: 0,
        removable: true,
      }),
    );
  });

  it('deletes Microsoft calendars remotely and soft-deletes local events', async () => {
    providerTokenService.getProviderWithToken.mockResolvedValue({
      provider: {
        id: 'provider-ms',
        tenantId: 'tenant-1',
        providerType: 'microsoft',
        supportsCalendar: true,
        isActive: true,
        email: 'owner@outlook.com',
      },
      accessToken: 'ms-token',
    });

    const getSpy = jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        id: 'ms-cal-1',
        isDefaultCalendar: false,
        isRemovable: true,
      },
    } as any);
    const deleteSpy = jest.spyOn(axios, 'delete').mockResolvedValue({} as any);

    const result = await service.deleteCalendar(
      'tenant-1',
      'provider-ms',
      'ms-cal-1',
    );

    expect(getSpy).toHaveBeenCalledWith(
      'https://graph.microsoft.com/v1.0/me/calendars/ms-cal-1',
      expect.objectContaining({
        params: { $select: 'id,isDefaultCalendar,isRemovable' },
      }),
    );
    expect(deleteSpy).toHaveBeenCalledWith(
      'https://graph.microsoft.com/v1.0/me/calendars/ms-cal-1',
      expect.any(Object),
    );
    expect(prisma.calendarPreference.deleteMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        providerId: 'provider-ms',
        calendarId: 'ms-cal-1',
      },
    });
    expect(prisma.calendarSyncState.deleteMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        providerId: 'provider-ms',
        calendarId: 'ms-cal-1',
      },
    });
    expect(prisma.calendarEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          providerId: 'provider-ms',
          calendarId: 'ms-cal-1',
        }),
        data: expect.objectContaining({
          isDeleted: true,
          isCancelled: true,
          status: 'cancelled',
        }),
      }),
    );
    expect(result).toEqual({
      success: true,
      calendarId: 'ms-cal-1',
      providerId: 'provider-ms',
    });
  });
});

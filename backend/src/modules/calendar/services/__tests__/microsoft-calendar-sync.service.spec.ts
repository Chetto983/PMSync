import { MicrosoftCalendarSyncService } from '../microsoft-calendar-sync.service';

describe('MicrosoftCalendarSyncService', () => {
  let service: MicrosoftCalendarSyncService;

  beforeEach(() => {
    const configService = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        if (key === 'CALENDAR_SYNC_ENABLED') return 'true';
        if (key === 'CALENDAR_SYNC_MAX_ERRORS') return 3;
        return defaultValue;
      }),
    };

    service = new MicrosoftCalendarSyncService(
      {} as any,
      {} as any,
      {} as any,
      configService as any,
      {} as any,
    );
  });

  it('hydrates sparse Microsoft delta events with direct event lookups', async () => {
    const detailedEvent = {
      id: 'evt-1',
      subject: 'Compleanno di Corrado Testa',
      isAllDay: true,
      start: { dateTime: '2026-03-16T00:00:00.0000000', timeZone: 'UTC' },
      end: { dateTime: '2026-03-17T00:00:00.0000000', timeZone: 'UTC' },
    };

    const get = jest.fn().mockResolvedValue(detailedEvent);
    const select = jest.fn().mockReturnValue({ get });
    const api = jest.fn().mockReturnValue({ select });
    const client = { api };

    const sparseEvent = {
      id: 'evt-1',
      start: { dateTime: '2026-03-16T00:00:00.0000000', timeZone: 'UTC' },
      end: { dateTime: '2026-03-17T00:00:00.0000000', timeZone: 'UTC' },
      type: 'occurrence',
    };

    const result = await (service as any).hydrateSparseEvents(client, [sparseEvent]);

    expect(api).toHaveBeenCalledWith('/me/events/evt-1');
    expect(select).toHaveBeenCalled();
    expect(result).toEqual([
      expect.objectContaining({
        id: 'evt-1',
        subject: 'Compleanno di Corrado Testa',
        isAllDay: true,
      }),
    ]);
  });

  it('infers all-day birthday events even when Microsoft omits isAllDay in delta payloads', () => {
    const result = (service as any).extractEventData(
      {
        id: 'evt-2',
        subject: '',
        start: { dateTime: '2026-03-01T00:00:00.0000000', timeZone: 'UTC' },
        end: { dateTime: '2026-03-02T00:00:00.0000000', timeZone: 'UTC' },
      },
      'calendar-1',
      'provider-1',
      'tenant-1',
      'Calendario compleanni',
    );

    expect(result.isAllDay).toBe(true);
    expect(result.timeZone).toBe('UTC');
    expect(result.title).toBe('Birthday - Mar 1');
  });
});

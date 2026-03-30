import { GoogleCalendarSyncService } from '../google-calendar-sync.service';

describe('GoogleCalendarSyncService field selection', () => {
  let service: GoogleCalendarSyncService;

  beforeEach(() => {
    service = new GoogleCalendarSyncService(
      {} as any,
      {} as any,
      {} as any,
      { get: jest.fn().mockImplementation((_key: string, defaultValue?: unknown) => defaultValue) } as any,
      {} as any,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('requests attachments during full sync so attachment processing can run', async () => {
    const listMock = jest.fn().mockResolvedValue({
      data: {
        items: [],
        nextPageToken: undefined,
        nextSyncToken: 'sync-token-1',
      },
    });

    jest.spyOn(service as any, 'createCalendarClient').mockReturnValue({
      events: { list: listMock },
    });

    await (service as any).fetchEvents('token', 'primary', undefined, true);

    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: expect.stringContaining('attachments'),
      }),
    );
  });

  it('keeps full sync data within the past and next 3 years', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-30T10:15:00.000Z'));

    const listMock = jest.fn().mockResolvedValue({
      data: {
        items: [
          {
            id: 'in-range-past',
            status: 'confirmed',
            start: { dateTime: '2024-03-30T09:00:00.000Z' },
            end: { dateTime: '2024-03-30T10:00:00.000Z' },
          },
          {
            id: 'in-range-future',
            status: 'confirmed',
            start: { dateTime: '2028-03-30T09:00:00.000Z' },
            end: { dateTime: '2028-03-30T10:00:00.000Z' },
          },
          {
            id: 'too-old',
            status: 'confirmed',
            start: { dateTime: '2023-03-29T22:00:00.000Z' },
            end: { dateTime: '2023-03-29T23:59:59.000Z' },
          },
          {
            id: 'too-far',
            status: 'confirmed',
            start: { dateTime: '2029-03-31T09:00:00.000Z' },
            end: { dateTime: '2029-03-31T10:00:00.000Z' },
          },
          {
            id: 'cancelled-outside-window',
            status: 'cancelled',
          },
        ],
        nextPageToken: undefined,
        nextSyncToken: 'sync-token-2',
      },
    });

    jest.spyOn(service as any, 'createCalendarClient').mockReturnValue({
      events: { list: listMock },
    });

    const result = await (service as any).fetchEvents('token', 'primary', undefined, true);

    expect(result.events.map((event: { id: string }) => event.id)).toEqual([
      'in-range-past',
      'in-range-future',
      'cancelled-outside-window',
    ]);
  });
});

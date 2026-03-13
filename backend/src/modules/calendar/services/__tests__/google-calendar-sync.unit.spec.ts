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
});

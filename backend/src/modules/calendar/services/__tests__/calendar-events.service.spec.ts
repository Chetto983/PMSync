import axios from 'axios';
import { CalendarEventsService } from '../calendar-events.service';

describe('CalendarEventsService', () => {
  let service: CalendarEventsService;

  beforeEach(() => {
    jest.restoreAllMocks();
    service = new CalendarEventsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('creates Microsoft event payloads using provider-local wall clock values', async () => {
    const postSpy = jest.spyOn(axios, 'post').mockResolvedValue({
      data: { id: 'evt-1', iCalUId: 'ical-1' },
    } as any);

    await (service as any).createMicrosoftEvent('token-123', {
      title: 'Board sync',
      startTime: '2026-03-16T17:00:00.000Z',
      endTime: '2026-03-16T18:00:00.000Z',
      timeZone: 'Europe/Rome',
    });

    expect(postSpy).toHaveBeenCalledWith(
      'https://graph.microsoft.com/v1.0/me/events',
      expect.objectContaining({
        start: {
          dateTime: '2026-03-16T18:00:00',
          timeZone: 'Europe/Rome',
        },
        end: {
          dateTime: '2026-03-16T19:00:00',
          timeZone: 'Europe/Rome',
        },
      }),
      expect.any(Object),
    );
  });

  it('anchors Microsoft recurrence ranges to the event start date and normalizes UNTIL', () => {
    const recurrence = (service as any).convertRecurrenceToMicrosoft(
      ['FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20260320T090000Z'],
      '2026-03-16T17:00:00.000Z',
      'Europe/Rome',
    );

    expect(recurrence).toEqual({
      pattern: {
        type: 'weekly',
        interval: 1,
        daysOfWeek: ['monday', 'wednesday'],
      },
      range: {
        type: 'endDate',
        startDate: '2026-03-16',
        endDate: '2026-03-20',
      },
    });
  });
});

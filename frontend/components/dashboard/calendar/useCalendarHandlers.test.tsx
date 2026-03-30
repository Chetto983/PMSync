import { act, renderHook } from '@testing-library/react';
import { useCalendarHandlers } from './useCalendarHandlers';

jest.mock('@/hooks/queries/use-calendar', () => ({
  useCreateCalendarEvent: () => ({ mutateAsync: jest.fn() }),
  useUpdateCalendarEvent: () => ({ mutateAsync: jest.fn() }),
  useDeleteCalendarEvent: () => ({ mutateAsync: jest.fn() }),
  useRespondToCalendarEvent: () => ({ mutateAsync: jest.fn() }),
  calendarEventDetailOptions: jest.fn((id: string) => ({ queryKey: ['calendar', 'event-detail', id] })),
  calendarEventAttachmentsOptions: jest.fn((eventId: string) => ({
    queryKey: ['calendar', 'attachments', eventId],
  })),
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const calendarPrefs = new Map([
  [
    'provider-1:calendar-1',
    {
      id: 'provider-1:calendar-1',
      calendarId: 'calendar-1',
      calendarName: 'Primary',
      providerId: 'provider-1',
      providerEmail: 'calendar@example.com',
      providerType: 'google',
      color: '#0B7EFF',
      enabled: true,
    },
  ],
]);

const calendarCopy = {
  validation: {
    titleRequired: 'Title is required',
    startRequired: 'Start is required',
    endRequired: 'End is required',
    endAfterStart: 'End must be after start',
  },
};

function createHookDeps() {
  const calendarApi = {
    prev: jest.fn(),
    next: jest.fn(),
    today: jest.fn(),
  };

  return {
    calendarApi,
    data: {
      calendarRef: {
        current: {
          getApi: () => calendarApi,
        },
      },
      updateCalendarHeader: jest.fn(),
      loadData: jest.fn().mockResolvedValue(undefined),
      queryClient: {
        fetchQuery: jest.fn(),
      },
    },
    setSnackbar: jest.fn(),
  };
}

describe('useCalendarHandlers navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reloads and syncs all calendars when navigating to the previous month', () => {
    const { calendarApi, data, setSnackbar } = createHookDeps();
    const { result } = renderHook(() =>
      useCalendarHandlers(data as never, calendarPrefs, calendarCopy, setSnackbar),
    );

    act(() => {
      result.current.handlePrevMonth();
    });

    expect(calendarApi.prev).toHaveBeenCalledTimes(1);
    expect(data.updateCalendarHeader).toHaveBeenCalledTimes(1);
    expect(data.loadData).toHaveBeenCalledWith(true);
  });

  it('reloads and syncs all calendars when navigating to the next month', () => {
    const { calendarApi, data, setSnackbar } = createHookDeps();
    const { result } = renderHook(() =>
      useCalendarHandlers(data as never, calendarPrefs, calendarCopy, setSnackbar),
    );

    act(() => {
      result.current.handleNextMonth();
    });

    expect(calendarApi.next).toHaveBeenCalledTimes(1);
    expect(data.updateCalendarHeader).toHaveBeenCalledTimes(1);
    expect(data.loadData).toHaveBeenCalledWith(true);
  });

  it('reloads and syncs all calendars when navigating back to today', () => {
    const { calendarApi, data, setSnackbar } = createHookDeps();
    const { result } = renderHook(() =>
      useCalendarHandlers(data as never, calendarPrefs, calendarCopy, setSnackbar),
    );

    act(() => {
      result.current.handleToday();
    });

    expect(calendarApi.today).toHaveBeenCalledTimes(1);
    expect(data.updateCalendarHeader).toHaveBeenCalledTimes(1);
    expect(data.loadData).toHaveBeenCalledWith(true);
  });
});

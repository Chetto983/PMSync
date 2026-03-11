import { useCalendarStore } from './calendar-store';
import type { CalendarEvent } from './calendar-store';

const makeEvent = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'e1',
  calendarId: 'cal-1',
  providerId: 'p1',
  title: 'Test Event',
  startTime: '2026-03-11T10:00:00Z',
  endTime: '2026-03-11T11:00:00Z',
  isDeleted: false,
  isCancelled: false,
  ...overrides,
});

beforeEach(() => {
  useCalendarStore.getState().reset();
});

describe('useCalendarStore', () => {
  describe('setEvents', () => {
    it('sets the events array', () => {
      useCalendarStore.getState().setEvents([makeEvent()]);
      expect(useCalendarStore.getState().events).toHaveLength(1);
    });

    it('auto-enables all calendarIds from events', () => {
      useCalendarStore.getState().setEvents([makeEvent({ calendarId: 'cal-1' })]);
      expect(useCalendarStore.getState().enabledCalendarIds.has('cal-1')).toBe(true);
    });

    it('sets both events AND enabledCalendarIds', () => {
      const events = [
        makeEvent({ id: 'e1', calendarId: 'cal-1' }),
        makeEvent({ id: 'e2', calendarId: 'cal-2' }),
      ];
      useCalendarStore.getState().setEvents(events);
      expect(useCalendarStore.getState().events).toHaveLength(2);
      expect(useCalendarStore.getState().enabledCalendarIds.has('cal-1')).toBe(true);
      expect(useCalendarStore.getState().enabledCalendarIds.has('cal-2')).toBe(true);
    });
  });

  describe('appendEvents', () => {
    it('deduplicates by id', () => {
      useCalendarStore.getState().setEvents([makeEvent({ id: 'e1' })]);
      useCalendarStore.getState().appendEvents([makeEvent({ id: 'e1' })]);
      expect(useCalendarStore.getState().events).toHaveLength(1);
    });

    it('appends unique events', () => {
      useCalendarStore.getState().setEvents([makeEvent({ id: 'e1' })]);
      useCalendarStore.getState().appendEvents([makeEvent({ id: 'e2' })]);
      expect(useCalendarStore.getState().events).toHaveLength(2);
    });
  });

  describe('addEvent', () => {
    it('adds event and auto-enables its calendarId', () => {
      useCalendarStore.getState().addEvent(makeEvent({ id: 'e1', calendarId: 'cal-new' }));
      expect(useCalendarStore.getState().events).toHaveLength(1);
      expect(useCalendarStore.getState().enabledCalendarIds.has('cal-new')).toBe(true);
    });

    it('skips duplicate event id', () => {
      useCalendarStore.getState().addEvent(makeEvent({ id: 'e1' }));
      useCalendarStore.getState().addEvent(makeEvent({ id: 'e1' }));
      expect(useCalendarStore.getState().events).toHaveLength(1);
    });
  });

  describe('updateEvent', () => {
    it('updates matching event', () => {
      useCalendarStore.getState().setEvents([makeEvent({ id: 'e1', title: 'Original' })]);
      useCalendarStore.getState().updateEvent('e1', { title: 'Updated' });
      expect(useCalendarStore.getState().events[0].title).toBe('Updated');
    });
  });

  describe('deleteEvent', () => {
    it('removes event by id', () => {
      useCalendarStore.getState().setEvents([makeEvent({ id: 'e1' })]);
      useCalendarStore.getState().deleteEvent('e1');
      expect(useCalendarStore.getState().events).toHaveLength(0);
    });

    it('clears selectedEvent if it was the deleted event', () => {
      const ev = makeEvent({ id: 'e1' });
      useCalendarStore.getState().setEvents([ev]);
      useCalendarStore.getState().setSelectedEvent(ev);
      useCalendarStore.getState().deleteEvent('e1');
      expect(useCalendarStore.getState().selectedEvent).toBeNull();
    });

    it('preserves selectedEvent if it was a different event', () => {
      const ev1 = makeEvent({ id: 'e1' });
      const ev2 = makeEvent({ id: 'e2' });
      useCalendarStore.getState().setEvents([ev1, ev2]);
      useCalendarStore.getState().setSelectedEvent(ev2);
      useCalendarStore.getState().deleteEvent('e1');
      expect(useCalendarStore.getState().selectedEvent?.id).toBe('e2');
    });
  });

  describe('toggleCalendarEnabled', () => {
    it('adds calendarId to enabledCalendarIds', () => {
      useCalendarStore.getState().toggleCalendarEnabled('cal-1');
      expect(useCalendarStore.getState().enabledCalendarIds.has('cal-1')).toBe(true);
    });

    it('removes calendarId when already enabled', () => {
      useCalendarStore.getState().toggleCalendarEnabled('cal-1');
      useCalendarStore.getState().toggleCalendarEnabled('cal-1');
      expect(useCalendarStore.getState().enabledCalendarIds.has('cal-1')).toBe(false);
    });
  });

  describe('getEventsByDate', () => {
    it('returns only events on target date', () => {
      const events = [
        makeEvent({ id: 'e1', startTime: '2026-03-11T10:00:00Z' }),
        makeEvent({ id: 'e2', startTime: '2026-03-12T10:00:00Z' }),
      ];
      useCalendarStore.getState().setEvents(events);
      const result = useCalendarStore.getState().getEventsByDate(new Date('2026-03-11'));
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('e1');
    });

    it('excludes deleted events', () => {
      useCalendarStore.getState().setEvents([
        makeEvent({ id: 'e1', startTime: '2026-03-11T10:00:00Z', isDeleted: true }),
      ]);
      const result = useCalendarStore.getState().getEventsByDate(new Date('2026-03-11'));
      expect(result).toHaveLength(0);
    });
  });

  describe('setCurrentView', () => {
    it('changes view mode', () => {
      useCalendarStore.getState().setCurrentView('week');
      expect(useCalendarStore.getState().currentView).toBe('week');
    });
  });

  describe('reset', () => {
    it('clears events and state', () => {
      useCalendarStore.getState().setEvents([makeEvent()]);
      useCalendarStore.getState().reset();
      expect(useCalendarStore.getState().events).toHaveLength(0);
      expect(useCalendarStore.getState().enabledCalendarIds.size).toBe(0);
    });
  });
});

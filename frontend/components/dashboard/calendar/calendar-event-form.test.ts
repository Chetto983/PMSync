import {
  getDefaultCalendarSelection,
  resolveSelectedCalendarPreference,
} from './calendar-event-form';
import type { CalendarPreference } from '@/components/calendar';

function createPreference(overrides: Partial<CalendarPreference> = {}): CalendarPreference {
  return {
    id: 'provider-a:calendar-a',
    calendarId: 'calendar-a',
    calendarName: 'Calendar A',
    providerId: 'provider-a',
    providerEmail: 'a@example.com',
    providerType: 'google',
    color: '#0B7EFF',
    enabled: true,
    ...overrides,
  };
}

describe('calendar event form helpers', () => {
  it('prefers the first enabled calendar as the default selection', () => {
    const prefs = new Map<string, CalendarPreference>([
      ['provider-a:calendar-a', createPreference({ enabled: false })],
      ['provider-b:calendar-b', createPreference({
        id: 'provider-b:calendar-b',
        calendarId: 'calendar-b',
        providerId: 'provider-b',
        providerEmail: 'b@example.com',
        calendarName: 'Calendar B',
      })],
    ]);

    expect(getDefaultCalendarSelection(prefs)).toBe('provider-b:calendar-b');
  });

  it('falls back to the first calendar when all calendars are disabled', () => {
    const prefs = new Map<string, CalendarPreference>([
      ['provider-a:calendar-a', createPreference({ enabled: false })],
      ['provider-b:calendar-b', createPreference({
        id: 'provider-b:calendar-b',
        calendarId: 'calendar-b',
        providerId: 'provider-b',
        providerEmail: 'b@example.com',
        calendarName: 'Calendar B',
        enabled: false,
      })],
    ]);

    expect(getDefaultCalendarSelection(prefs)).toBe('provider-a:calendar-a');
  });

  it('resolves a provider-qualified selection directly', () => {
    const pref = createPreference();
    const prefs = new Map<string, CalendarPreference>([[pref.id, pref]]);

    expect(resolveSelectedCalendarPreference(prefs, pref.id)).toEqual(pref);
  });

  it('supports legacy calendarId-only selections', () => {
    const pref = createPreference({
      id: 'provider-b:primary',
      calendarId: 'primary',
      providerId: 'provider-b',
      providerEmail: 'b@example.com',
      calendarName: 'Primary',
    });
    const prefs = new Map<string, CalendarPreference>([[pref.id, pref]]);

    expect(resolveSelectedCalendarPreference(prefs, 'primary')).toEqual(pref);
  });

  it('falls back to the default selection when the stored value is invalid', () => {
    const pref = createPreference();
    const prefs = new Map<string, CalendarPreference>([[pref.id, pref]]);

    expect(resolveSelectedCalendarPreference(prefs, 'work')).toEqual(pref);
  });
});

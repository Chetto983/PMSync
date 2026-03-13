import type { CalendarPreference } from '@/components/calendar';

export function getDefaultCalendarSelection(
  calendarPrefs: Map<string, CalendarPreference>,
): string {
  const enabledCalendar = Array.from(calendarPrefs.values()).find((pref) => pref.enabled);
  return enabledCalendar?.id ?? calendarPrefs.keys().next().value ?? '';
}

export function resolveSelectedCalendarPreference(
  calendarPrefs: Map<string, CalendarPreference>,
  selection: string,
): CalendarPreference | null {
  if (selection) {
    const exactMatch = calendarPrefs.get(selection);
    if (exactMatch) {
      return exactMatch;
    }

    // Backward compatibility for any stale local state that still stores only calendarId.
    const legacyMatch = Array.from(calendarPrefs.values()).find(
      (pref) => pref.calendarId === selection,
    );
    if (legacyMatch) {
      return legacyMatch;
    }
  }

  const fallbackSelection = getDefaultCalendarSelection(calendarPrefs);
  return fallbackSelection ? calendarPrefs.get(fallbackSelection) ?? null : null;
}

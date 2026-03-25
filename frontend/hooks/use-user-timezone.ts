/**
 * useUserTimezone Hook
 *
 * Returns the user's timezone preference from the database (via TanStack Query cache).
 * Falls back to browser timezone if not loaded yet.
 */

import { useUserPreferences } from '@/hooks/queries';
import { getStoredUserSettings } from '@/lib/utils/user-settings';

/**
 * Returns the user's IANA timezone string (e.g. 'Europe/Rome').
 * Priority: DB preferences > localStorage > browser detection.
 */
export function useUserTimezone(): string {
  const { data: prefs } = useUserPreferences();

  if (prefs?.timezone) {
    return prefs.timezone;
  }

  // Fallback to localStorage / browser detection
  return getStoredUserSettings().timezone;
}

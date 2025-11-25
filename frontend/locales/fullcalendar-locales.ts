/**
 * FullCalendar Locales
 * Only includes locales supported by the app (English and Italian)
 * Additional locales can be added as needed
 */

import enGbLocale from '@fullcalendar/core/locales/en-gb';
import itLocale from '@fullcalendar/core/locales/it';

import type { LocaleInput } from '@fullcalendar/core';

/**
 * Available FullCalendar locales for the app
 */
export const allFullCalendarLocales: LocaleInput[] = [
  enGbLocale,
  itLocale,
];

/**
 * Map app locale keys to FullCalendar locale codes
 */
export const appLocaleToFullCalendarLocale: Record<string, string> = {
  // App supported locales
  en: 'en-gb',
  it: 'it',

  // Browser locale variants
  'en-US': 'en-gb',
  'en-GB': 'en-gb',
  'en-AU': 'en-gb',
  'en-NZ': 'en-gb',
  'it-IT': 'it',
};

/**
 * Get the FullCalendar locale code for a given app locale
 * @param appLocale - The app's current locale (e.g., 'en', 'it', 'en-US')
 * @returns The corresponding FullCalendar locale code
 */
export function getFullCalendarLocale(appLocale: string | undefined | null): string {
  if (!appLocale) {
    return 'en-gb';
  }

  // Try exact match first
  if (appLocaleToFullCalendarLocale[appLocale]) {
    return appLocaleToFullCalendarLocale[appLocale];
  }

  // Try lowercase match
  const lowerLocale = appLocale.toLowerCase();
  if (appLocaleToFullCalendarLocale[lowerLocale]) {
    return appLocaleToFullCalendarLocale[lowerLocale];
  }

  // Try base language code (e.g., 'en' from 'en-US')
  const baseLocale = appLocale.split(/[-_]/)[0].toLowerCase();
  if (appLocaleToFullCalendarLocale[baseLocale]) {
    return appLocaleToFullCalendarLocale[baseLocale];
  }

  // Default to English (GB)
  return 'en-gb';
}

/**
 * List of supported FullCalendar locale codes with display names
 */
export const fullCalendarLocaleOptions: Array<{ code: string; name: string }> = [
  { code: 'en-gb', name: 'English' },
  { code: 'it', name: 'Italiano' },
];

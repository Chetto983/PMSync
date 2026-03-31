/**
 * Timezone-aware date formatting utilities.
 *
 * All functions accept an IANA timezone string (e.g. 'Europe/Rome')
 * and format dates in the user's preferred timezone, not the browser's.
 */

/**
 * Format a date as a localized date string in the given timezone.
 * e.g. "3/25/2026" or "25/03/2026" depending on locale.
 */
export function formatDateInTz(
  date: string | Date,
  timezone: string,
  locale?: string,
): string {
  try {
    const d = date instanceof Date ? date : new Date(date);
    return new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).format(d);
  } catch {
    return new Date(date).toLocaleDateString();
  }
}

/**
 * Format a date as a localized date+time string in the given timezone.
 * e.g. "3/25/2026, 2:30 PM" or "25/03/2026, 14:30"
 */
export function formatDateTimeInTz(
  date: string | Date,
  timezone: string,
  locale?: string,
): string {
  try {
    const d = date instanceof Date ? date : new Date(date);
    return new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(d);
  } catch {
    return new Date(date).toLocaleString();
  }
}

/**
 * Format a date as HH:mm time in the given timezone.
 * e.g. "14:30" or "2:30 PM"
 */
export function formatTimeInTz(
  date: string | Date,
  timezone: string,
  locale?: string,
): string {
  try {
    const d = date instanceof Date ? date : new Date(date);
    return new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
    }).format(d);
  } catch {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  }
}

/**
 * Format a date with weekday, month, day, hour, minute in the given timezone.
 * e.g. "Wed, Mar 25, 2:30 PM"
 * Used by ScheduleSendDialog for quick option previews.
 */
export function formatScheduleDateInTz(
  date: Date,
  timezone: string,
  locale?: string,
): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

/**
 * Parse a datetime-local input value (YYYY-MM-DDTHH:mm) as wall-clock time in the
 * given timezone and return a UTC ISO string.
 * Inverse of formatDateTimeLocalInTz.
 */
export function parseDateTimeLocalInTz(
  datetimeLocal: string,
  timezone: string,
): string {
  if (!datetimeLocal) return '';
  try {
    // datetimeLocal is "YYYY-MM-DDTHH:mm" — wall-clock in the target timezone.
    // We need to find the UTC instant that corresponds to this wall-clock time.
    // Strategy: parse as UTC, then adjust by the offset difference.
    const naive = new Date(datetimeLocal + ':00Z'); // treat as UTC first
    if (Number.isNaN(naive.getTime())) return new Date(datetimeLocal).toISOString();

    // Get the UTC offset at this instant for the target timezone
    // by formatting the naive UTC date in the target tz and computing the delta.
    const inTz = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(naive);

    const get = (type: Intl.DateTimeFormatPartTypes) =>
      inTz.find((p) => p.type === type)?.value ?? '00';

    const tzWallMs = Date.UTC(
      Number(get('year')),
      Number(get('month')) - 1,
      Number(get('day')),
      Number(get('hour')),
      Number(get('minute')),
      Number(get('second')),
    );

    // offset = tzWallMs - naive.getTime() (both in ms)
    const offsetMs = tzWallMs - naive.getTime();

    // The desired UTC instant = naive - offset
    // (because wall-clock = UTC + offset, so UTC = wall-clock - offset)
    const targetMs = naive.getTime() - offsetMs;
    return new Date(targetMs).toISOString();
  } catch {
    return new Date(datetimeLocal).toISOString();
  }
}

/**
 * Format a datetime-local input value (YYYY-MM-DDTHH:mm) in the given timezone.
 * Used for <input type="datetime-local"> which needs local wall-clock values.
 */
export function formatDateTimeLocalInTz(
  date: string | Date,
  timezone: string,
): string {
  try {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return '';

    // Get parts in the target timezone
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d);

    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value ?? '00';

    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
  } catch {
    return '';
  }
}

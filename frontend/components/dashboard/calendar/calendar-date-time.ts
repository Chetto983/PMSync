import { formatDateTimeLocalInTz } from '@/lib/utils/format-date-tz';

/**
 * Format a date for <input type="datetime-local"> in the given timezone.
 * If no timezone provided, falls back to browser-local formatting.
 */
export function formatDateTimeLocalInput(value: Date | string, timezone?: string): string {
  if (timezone) {
    return formatDateTimeLocalInTz(value, timezone);
  }

  // Legacy fallback: browser timezone
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const pad = (v: number) => String(v).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

const WINDOWS_TIMEZONE_ALIASES: Record<string, string> = {
  'UTC': 'UTC',
  'GMT Standard Time': 'Europe/London',
  'W. Europe Standard Time': 'Europe/Berlin',
  'Central Europe Standard Time': 'Europe/Budapest',
  'Romance Standard Time': 'Europe/Paris',
  'Eastern Standard Time': 'America/New_York',
  'Central Standard Time': 'America/Chicago',
  'Mountain Standard Time': 'America/Denver',
  'Pacific Standard Time': 'America/Los_Angeles',
  'E. South America Standard Time': 'America/Sao_Paulo',
  'China Standard Time': 'Asia/Shanghai',
  'Tokyo Standard Time': 'Asia/Tokyo',
  'India Standard Time': 'Asia/Kolkata',
  'AUS Eastern Standard Time': 'Australia/Sydney',
};

type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();
const LOCAL_DATE_TIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,9}))?$/;

function pad(value: number, size = 2): string {
  return value.toString().padStart(size, '0');
}

export function resolveCalendarTimeZone(timeZone?: string | null): string {
  if (!timeZone) {
    return 'UTC';
  }

  const normalized = WINDOWS_TIMEZONE_ALIASES[timeZone] || timeZone;

  try {
    Intl.DateTimeFormat('en-US', { timeZone: normalized }).format(new Date());
    return normalized;
  } catch {
    return 'UTC';
  }
}

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  const resolved = resolveCalendarTimeZone(timeZone);
  const cached = formatterCache.get(resolved);
  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: resolved,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  formatterCache.set(resolved, formatter);
  return formatter;
}

function getDateTimeParts(date: Date, timeZone: string): DateTimeParts {
  const formatter = getFormatter(timeZone);
  const parts = formatter.formatToParts(date);

  const values = parts.reduce<Record<string, string>>((acc, part) => {
    if (part.type !== 'literal') {
      acc[part.type] = part.value;
    }
    return acc;
  }, {});

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getDateTimeParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - date.getTime();
}

export function formatDateTimeForTimeZone(value: Date | string, timeZone?: string | null): string {
  const date = value instanceof Date ? value : new Date(value);
  const parts = getDateTimeParts(date, resolveCalendarTimeZone(timeZone));
  return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

export function formatDateOnlyForTimeZone(value: Date | string, timeZone?: string | null): string {
  const date = value instanceof Date ? value : new Date(value);
  const parts = getDateTimeParts(date, resolveCalendarTimeZone(timeZone));
  return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function parseDateTimeInTimeZone(dateTime: string, timeZone?: string | null): Date {
  if (/(?:Z|[+-]\d{2}:\d{2})$/.test(dateTime)) {
    return new Date(dateTime);
  }

  const match = LOCAL_DATE_TIME_RE.exec(dateTime);
  if (!match) {
    return new Date(dateTime);
  }

  const [
    ,
    year,
    month,
    day,
    hour,
    minute,
    second = '0',
    fractional = '0',
  ] = match;
  const milliseconds = Number(fractional.padEnd(3, '0').slice(0, 3));
  const utcGuess = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
      milliseconds,
    ),
  );
  const resolvedTimeZone = resolveCalendarTimeZone(timeZone);
  const initialOffset = getTimeZoneOffsetMs(utcGuess, resolvedTimeZone);
  const adjusted = new Date(utcGuess.getTime() - initialOffset);
  const refinedOffset = getTimeZoneOffsetMs(adjusted, resolvedTimeZone);

  if (refinedOffset !== initialOffset) {
    return new Date(utcGuess.getTime() - refinedOffset);
  }

  return adjusted;
}

export function parseRRuleUntilToDateOnly(until: string, timeZone?: string | null): string | undefined {
  if (/^\d{8}$/.test(until)) {
    return `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}`;
  }

  if (/^\d{8}T\d{6}Z$/.test(until)) {
    const iso = `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}T${until.slice(9, 11)}:${until.slice(11, 13)}:${until.slice(13, 15)}Z`;
    return formatDateOnlyForTimeZone(iso, timeZone);
  }

  if (/^\d{8}T\d{6}$/.test(until)) {
    const localDateTime = `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}T${until.slice(9, 11)}:${until.slice(11, 13)}:${until.slice(13, 15)}`;
    return formatDateOnlyForTimeZone(parseDateTimeInTimeZone(localDateTime, timeZone), timeZone);
  }

  return undefined;
}

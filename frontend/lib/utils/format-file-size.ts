export type FileSizeLocale = string | undefined;

type FileSizeUnit = 'byte' | 'kilobyte' | 'megabyte' | 'gigabyte' | 'terabyte';

const UNITS: Array<{ unit: FileSizeUnit; threshold: number }> = [
  { unit: 'byte', threshold: 1024 },
  { unit: 'kilobyte', threshold: 1024 ** 2 },
  { unit: 'megabyte', threshold: 1024 ** 3 },
  { unit: 'gigabyte', threshold: 1024 ** 4 },
  { unit: 'terabyte', threshold: Number.POSITIVE_INFINITY },
];

export function formatFileSize(bytes: number, locale?: FileSizeLocale): string {
  const safeBytes = Number.isFinite(bytes) ? Math.max(0, bytes) : 0;

  const { unit } = UNITS.find(({ threshold }) => safeBytes < threshold) ?? UNITS[UNITS.length - 1];
  const divisor =
    unit === 'byte'
      ? 1
      : unit === 'kilobyte'
        ? 1024
        : unit === 'megabyte'
          ? 1024 ** 2
          : unit === 'gigabyte'
            ? 1024 ** 3
            : 1024 ** 4;

  const value = safeBytes / divisor;
  const maximumFractionDigits = unit === 'byte' ? 0 : 1;

  try {
    return new Intl.NumberFormat(locale, {
      style: 'unit',
      unit,
      unitDisplay: 'short',
      maximumFractionDigits,
    }).format(value);
  } catch {
    // Fallback: stable, non-localized format (kept minimal for safety).
    const suffix =
      unit === 'byte'
        ? 'B'
        : unit === 'kilobyte'
          ? 'KB'
          : unit === 'megabyte'
            ? 'MB'
            : unit === 'gigabyte'
              ? 'GB'
              : 'TB';
    return `${value.toFixed(maximumFractionDigits)} ${suffix}`.replace('.0 ', ' ');
  }
}


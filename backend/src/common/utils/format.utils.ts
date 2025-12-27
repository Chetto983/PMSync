/**
 * Common formatting utility functions
 *
 * Provides consistent formatting across the application.
 * DUP-1 fix: Consolidated formatBytes from 5 files.
 */

/**
 * Format bytes into human-readable string
 * @param bytes - Number of bytes
 * @param decimals - Decimal places (default: 2)
 * @returns Formatted string (e.g., "1.5 MB")
 *
 * @example
 * ```typescript
 * formatBytes(1536) // "1.5 KB"
 * formatBytes(1048576) // "1 MB"
 * formatBytes(1073741824) // "1 GB"
 * ```
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  if (bytes < 0) return 'Invalid size';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const index = Math.min(i, sizes.length - 1);

  return `${parseFloat((bytes / Math.pow(k, index)).toFixed(dm))} ${sizes[index]}`;
}

/**
 * Parse formatted bytes string back to number
 * @param str - Formatted string (e.g., "1.5 MB")
 * @returns Number of bytes
 *
 * @example
 * ```typescript
 * parseBytes("1.5 KB") // 1536
 * parseBytes("1 MB") // 1048576
 * ```
 */
export function parseBytes(str: string): number {
  const match = str.match(/^([\d.]+)\s*(Bytes|KB|MB|GB|TB|PB)$/i);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  const units: Record<string, number> = {
    BYTES: 1,
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4,
    PB: 1024 ** 5,
  };

  return value * (units[unit] || 1);
}

/**
 * Format duration in milliseconds to human-readable string
 * @param ms - Duration in milliseconds
 * @returns Formatted string (e.g., "2h 30m 15s")
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  return `${seconds}s`;
}

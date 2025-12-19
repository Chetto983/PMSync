import type { SxProps, Theme } from '@mui/material';

export interface ParsedEmailFrom {
  name: string;
  email: string;
}

/**
 * Parse an email "from" string into name/email parts.
 */
export function parseEmailFrom(from: string): ParsedEmailFrom {
  const match = from.match(/^"?([^"<]+)"?\s*<?([^>]*)>?$/);
  if (match) {
    return {
      name: match[1].trim(),
      email: match[2].trim() || match[1].trim(),
    };
  }
  return { name: from, email: from };
}

/**
 * Format a compact date for list rows (time today, weekday this week, month/day otherwise).
 * Uses locale from browser/system settings for proper localization.
 */
export function formatListDate(date: string | Date, locale?: string): string {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const hours = diff / (1000 * 60 * 60);
  // Use provided locale or undefined to use browser's default
  const userLocale = locale || undefined;

  if (hours < 24) {
    return d.toLocaleTimeString(userLocale, { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  if (hours < 24 * 7) {
    return d.toLocaleDateString(userLocale, { weekday: 'short' });
  }
  return d.toLocaleDateString(userLocale, { month: 'short', day: 'numeric' });
}

/**
 * Format a full date for the email header area.
 * Uses locale from browser/system settings for proper localization.
 */
export function formatEmailHeaderDate(date: string | Date, locale?: string): string {
  const d = new Date(date);
  // Use provided locale or undefined to use browser's default
  const userLocale = locale || undefined;
  return d.toLocaleString(userLocale, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Shared scrollbar styling for scrollable panes.
 */
export const scrollContainerSx: SxProps<Theme> = {
  overflow: 'auto',
  // Scrollbar per Firefox
  scrollbarWidth: 'thin',
  scrollbarColor: '#bdbdbd transparent',
  // Scrollbar per Chrome, Safari, Edge
  '&::-webkit-scrollbar': {
    width: '8px',
  },
  '&::-webkit-scrollbar-track': {
    bgcolor: 'transparent',
  },
  '&::-webkit-scrollbar-thumb': {
    bgcolor: '#bdbdbd',
    borderRadius: '4px',
    '&:hover': {
      bgcolor: '#9e9e9e',
    },
  },
};

/**
 * Last Synced Timestamp Component
 *
 * Displays when folders were last synced with relative time formatting.
 * Auto-updates every minute to keep the relative time accurate.
 *
 * @example
 * ```tsx
 * <LastSynced lastSyncedAt={provider.lastSyncedAt} />
 * ```
 */

import { useEffect, useState } from 'react';
import { Typography } from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';

interface LastSyncedProps {
  lastSyncedAt?: string;
  variant?: 'caption' | 'body2';
  color?: string;
}

/**
 * Format relative time (e.g., "5 minutes ago", "2 hours ago")
 */
function formatRelativeTime(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins === 1) return '1 minute ago';
  if (diffMins < 60) return `${diffMins} minutes ago`;
  if (diffHours === 1) return '1 hour ago';
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays === 1) return '1 day ago';
  return `${diffDays} days ago`;
}

export function LastSynced({ lastSyncedAt, variant = 'caption', color = 'text.secondary' }: LastSyncedProps) {
  const t = useTranslations();
  // Calculate initial value during render instead of in effect
  const [relativeTime, setRelativeTime] = useState<string>(() =>
    lastSyncedAt ? formatRelativeTime(lastSyncedAt) : ''
  );

  useEffect(() => {
    if (!lastSyncedAt) return;

    // Update every minute
    const interval = setInterval(() => {
      setRelativeTime(formatRelativeTime(lastSyncedAt));
    }, 60000);

    return () => clearInterval(interval);
  }, [lastSyncedAt]);

  if (!lastSyncedAt) {
    return (
      <Typography variant={variant} color={color}>
        {t.folders.neverSynced}
      </Typography>
    );
  }

  return (
    <Typography variant={variant} color={color}>
      {t.folders.lastSyncedAgo.replace('{time}', relativeTime)}
    </Typography>
  );
}

/**
 * TodayQuickActions — IconButton cluster shown on row hover.
 *
 * Per UI-SPEC § Feed Item Anatomy: Complete (only if canComplete), Dismiss
 * (always when canDismiss), Snooze (only if canSnooze). All buttons are 28px
 * IconButtons with aria-labels from t.dashboard.today.aria.*.
 *
 * On xs breakpoint: opacity always 1 (no hover state available on touch).
 * On sm+ breakpoint: opacity 0 -> 1 on parent .feed-row hover (150ms).
 */

'use client';

import type { MouseEvent } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import { Check, X, Clock } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { TodayFeedItem } from '@/lib/api/dashboard';

interface TodayQuickActionsProps {
  item: TodayFeedItem;
  onComplete: () => void;
  onDismiss: () => void;
  onSnoozeOpen: (anchor: HTMLElement) => void;
}

export function TodayQuickActions({
  item,
  onComplete,
  onDismiss,
  onSnoozeOpen,
}: TodayQuickActionsProps) {
  const t = useTranslations();
  const aria = t.dashboard.today.aria;

  const stop = (fn: () => void) => (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    fn();
  };

  const openSnooze = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onSnoozeOpen(e.currentTarget);
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.25,
        opacity: { xs: 1, sm: 0 },
        transition: 'opacity 150ms cubic-bezier(0.4, 0, 0.2, 1)',
        '.feed-row:hover &': { opacity: 1 },
        '.feed-row:focus-within &': { opacity: 1 },
      }}
    >
      {item.canComplete && (
        <Tooltip title={aria.complete}>
          <IconButton
            size="small"
            aria-label={aria.complete}
            onClick={stop(onComplete)}
            sx={{ width: 28, height: 28 }}
          >
            <Check size={16} />
          </IconButton>
        </Tooltip>
      )}
      {item.canDismiss && (
        <Tooltip title={aria.dismiss}>
          <IconButton
            size="small"
            aria-label={aria.dismiss}
            onClick={stop(onDismiss)}
            sx={{ width: 28, height: 28 }}
          >
            <X size={16} />
          </IconButton>
        </Tooltip>
      )}
      {item.canSnooze && (
        <Tooltip title={aria.snooze}>
          <IconButton
            size="small"
            aria-label={aria.snooze}
            onClick={openSnooze}
            sx={{ width: 28, height: 28 }}
          >
            <Clock size={16} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}

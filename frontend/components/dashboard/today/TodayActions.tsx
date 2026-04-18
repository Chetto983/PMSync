/**
 * TodayActions — 24x24 IconButton trio for the Today row (145.1-03).
 *
 * Replaces TodayQuickActions. Idle opacity 0.5 on desktop; parent `.feed-row:hover`
 * or `.feed-row:focus-within` lifts to 1.0. Tooltip delay 800ms. Snooze button is
 * conditionally rendered (NOT greyed) when `item.canSnooze` is false. Opacity
 * transition collapses under prefers-reduced-motion per UI-SPEC §Accessibility.
 */

'use client';

import type { MouseEvent } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import { Check, Clock, X } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { TodayFeedItem } from '@/lib/api/dashboard';

interface Props {
  item: TodayFeedItem;
  onComplete: () => void;
  onSnooze: (anchor: HTMLElement) => void;
  onDismiss: () => void;
}

function stop(fn: () => void) {
  return (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    fn();
  };
}

export function TodayActions({ item, onComplete, onSnooze, onDismiss }: Props) {
  const t = useTranslations();
  const aria = t.dashboard.today.actions;
  const openSnooze = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    onSnooze(e.currentTarget);
  };
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.25,
        opacity: { xs: 1, sm: 0.5 },
        transition: 'opacity 120ms ease-out',
        // Reduced-motion fallback per UI-SPEC §Accessibility line 221:
        // opacity 0.5 → 1.0 reveal must be instant under prefers-reduced-motion.
        '@media (prefers-reduced-motion: reduce)': {
          transition: 'none',
        },
        '.feed-row:hover &': { opacity: 1 },
        '.feed-row:focus-within &': { opacity: 1 },
      }}
    >
      {item.canComplete && (
        <Tooltip title={aria.complete} enterDelay={800}>
          <IconButton
            size="small"
            aria-label={aria.complete}
            onClick={stop(onComplete)}
            sx={{ width: 24, height: 24 }}
          >
            <Check size={16} />
          </IconButton>
        </Tooltip>
      )}
      {item.canSnooze && (
        <Tooltip title={aria.snooze} enterDelay={800}>
          <IconButton
            size="small"
            aria-label={aria.snooze}
            onClick={openSnooze}
            sx={{ width: 24, height: 24 }}
          >
            <Clock size={16} />
          </IconButton>
        </Tooltip>
      )}
      <Tooltip title={aria.dismiss} enterDelay={800}>
        <IconButton
          size="small"
          aria-label={aria.dismiss}
          onClick={stop(onDismiss)}
          sx={{ width: 24, height: 24 }}
        >
          <X size={16} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

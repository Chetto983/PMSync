/**
 * TodayActions — 24x24 IconButton trio for the Today row (145.1-03).
 *
 * Replaces TodayQuickActions. Icons are ALWAYS visible (a11y: the user should
 * always know what actions are available); on desktop they are dimmed to
 * text.disabled until the parent `.feed-row:hover` or `.feed-row:focus-within`
 * lifts them to text.primary. On mobile (xs) they are always text.primary.
 * Tooltip delay 800ms. Snooze button is conditionally rendered (NOT greyed)
 * when `item.canSnooze` is false. Color transition collapses under
 * prefers-reduced-motion per UI-SPEC §Accessibility.
 *
 * (145.1-06: swapped the opacity 0.5 → 1.0 fade for a color fade because the
 * old half-opacity state made the icons hard to perceive — cleaner color
 * signal, same at-a-glance affordance.)
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
        // Color-based reveal instead of opacity fade: icons stay visible on
        // desktop (better a11y — user always knows what actions exist) but
        // dim to text.disabled until the parent row gains hover/focus-within,
        // then brighten to text.primary. IconButton children inherit via
        // currentColor on their lucide icons.
        color: { xs: 'text.primary', sm: 'text.disabled' },
        transition: 'color 120ms ease-out',
        // Reduced-motion fallback per UI-SPEC §Accessibility line 221:
        // color change must be instant under prefers-reduced-motion.
        '@media (prefers-reduced-motion: reduce)': {
          transition: 'none',
        },
        '.feed-row:hover &': { color: 'text.primary' },
        '.feed-row:focus-within &': { color: 'text.primary' },
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

/**
 * TodayRow — 40px compact row for the Today Dashboard v2 (145.1-04).
 *
 * Replaces TodayFeedItem.tsx. Anatomy per UI-SPEC §<TodayRow>:
 *   [16px type icon] [Link title component="a" href=routeUrl (flex 1)] [tabular-nums meta] [TodayActions]
 *
 * Critical guarantees (grep-verified):
 *   - Exact 40px height (`height: 40, minHeight: 40` — defeats MUI flex default)
 *   - Title is a native <Link component="a" href={item.routeUrl}> — Cmd/Ctrl/
 *     middle-click open in a new tab natively (fixes WR-06 for rows). No
 *     Next router, no programmatic navigation.
 *   - role="listitem" on the OUTER Box (not on any wrapping motion.div — the
 *     motion.div lives in TodayStream, one level up).
 *   - className="feed-row" enables TodayActions's `.feed-row:hover &` scope.
 *   - data-today-row={item.id} is the handle for keyboard-nav tests (Plan 05).
 *   - A single `@media (prefers-reduced-motion: reduce)` block disables BOTH
 *     the hover background-color transition AND the pending-state opacity
 *     transition (UI-SPEC §Accessibility line 221).
 *
 * Interactions:
 *   - Complete: optimistic (Plan 02 useCompleteFeedItem with rollback) + success
 *     toast with 4s "Undo" wiring useUncompleteFeedItem (falls back to the
 *     onMutate snapshot when the backend /uncomplete endpoint 404s).
 *   - Dismiss: Zustand-only (dismiss/restore) + 6s "Undo" toast.
 *   - Snooze: opens SnoozeMenu anchored to the action button, then dispatches
 *     useSnoozeFeedItem on selection.
 */

'use client';

import { useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { Box, CircularProgress, Link, Typography } from '@mui/material';
import { Mail, CheckSquare, Briefcase, Calendar as CalendarIcon, type LucideIcon } from 'lucide-react';
import { format, isToday, isTomorrow } from 'date-fns';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useGlobalToast } from '@/lib/context/toast-context';
import {
  useCompleteFeedItem,
  useSnoozeFeedItem,
  useUncompleteFeedItem,
} from '@/hooks/queries/use-today';
import { useTodayFeedStore } from '@/stores/today-feed-store';
import type { TodayFeedItem, TodayItemType } from '@/lib/api/dashboard';
import { pmSyncColors } from '@/theme/appTheme';
import { TodayActions } from './TodayActions';
import { SnoozeMenu } from './SnoozeMenu';

const TYPE_ICON: Record<TodayItemType, LucideIcon> = {
  email: Mail,
  task: CheckSquare,
  deal: Briefcase,
  event: CalendarIcon,
};

function typeColor(type: TodayItemType): string {
  // Semantic color per item type — D-05 ("color is garnish") evolved on
  // 2026-04-19 to allow icon-level color differentiation at the row level so
  // rows scan faster without inventing new tokens. See plan 145.1-06.
  //   email → cyan, task → green, deal → purple, event → orange.
  // 'currentColor' stays as the fallback for any future item type that has no
  // semantic token assigned yet.
  switch (type) {
    case 'email':
      return pmSyncColors.semantic.email;
    case 'task':
      return pmSyncColors.semantic.tasks;
    case 'deal':
      return pmSyncColors.semantic.contacts;
    case 'event':
      return pmSyncColors.semantic.calendar;
    default:
      return 'currentColor';
  }
}

function formatSmartTime(item: TodayFeedItem): string {
  if (!item.dueAt) return '';
  const d = new Date(item.dueAt);
  if (item.isOverdue) {
    const hours = Math.round((Date.now() - d.getTime()) / 36e5);
    return `OD ${hours}h`;
  }
  if (isToday(d)) return format(d, 'HH:mm');
  if (isTomorrow(d)) return format(d, 'HH:mm');
  // Within a day → relative hours
  const diffMs = d.getTime() - Date.now();
  const diffHours = diffMs / 36e5;
  if (diffHours > 0 && diffHours < 24) return `${Math.round(diffHours)}h`;
  return format(d, 'MMM d');
}

interface Props {
  item: TodayFeedItem;
}

export function TodayRow({ item }: Props) {
  const t = useTranslations();
  const toast = useGlobalToast();
  const [snoozeAnchor, setSnoozeAnchor] = useState<HTMLElement | null>(null);
  const completeMutation = useCompleteFeedItem();
  const uncompleteMutation = useUncompleteFeedItem();
  const snoozeMutation = useSnoozeFeedItem();
  const dismiss = useTodayFeedStore((s) => s.dismiss);
  const restore = useTodayFeedStore((s) => s.restore);

  const Icon = TYPE_ICON[item.type];
  const isPending = completeMutation.isPending || snoozeMutation.isPending;

  const handleComplete = async () => {
    try {
      await completeMutation.mutateAsync(item);
      toast.success(t.dashboard.today.toast.completed, {
        actionLabel: t.dashboard.today.toast.undo,
        duration: 4000,
        onAction: () => {
          // Real undo — try the uncomplete endpoint. If it 404s the next feed
          // refetch surfaces the item again (Plan 02 onSettled invalidation).
          uncompleteMutation.mutate(item);
        },
      });
    } catch {
      toast.error(t.dashboard.today.toast.failed, {
        actionLabel: t.dashboard.today.toast.retry,
        duration: 4000,
        onAction: () => completeMutation.mutate(item),
      });
    }
  };

  const handleSnoozeOpen = (anchor: HTMLElement) => setSnoozeAnchor(anchor);
  const handleSnoozeClose = () => setSnoozeAnchor(null);
  const handleSnoozeSelect = async (until: Date) => {
    setSnoozeAnchor(null);
    try {
      await snoozeMutation.mutateAsync({ item, until });
      toast.info(
        t.dashboard.today.toast.snoozed.replace('{when}', format(until, 'MMM d, HH:mm')),
        { duration: 4000 },
      );
    } catch {
      toast.error(t.dashboard.today.toast.failed, { duration: 4000 });
    }
  };

  const handleDismiss = () => {
    dismiss(item.id);
    toast.info(t.dashboard.today.toast.dismissed, {
      actionLabel: t.dashboard.today.toast.undo,
      duration: 6000,
      onAction: () => restore(item.id),
    });
  };

  const stopBubble = (e: ReactMouseEvent) => e.stopPropagation();

  return (
    <Box
      role="listitem"
      className="feed-row"
      data-today-row={item.id}
      sx={{
        height: 40,
        minHeight: 40,
        px: 2,
        py: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        borderBottom: '1px solid',
        borderColor: 'divider',
        opacity: isPending ? 0.5 : 1,
        transition: 'opacity 120ms ease-out, background-color 120ms ease-out',
        // Reduced-motion fallback per UI-SPEC §Accessibility line 221:
        // hover background-color AND pending-state opacity transitions collapse to instant.
        '@media (prefers-reduced-motion: reduce)': {
          transition: 'none',
        },
        '&:hover': { bgcolor: 'action.hover' },
        '&:focus-within': {
          bgcolor: 'action.hover',
          borderLeft: '2px solid',
          borderLeftColor: 'primary.main',
        },
      }}
    >
      {isPending ? (
        <CircularProgress size={16} thickness={5} />
      ) : (
        <Icon size={16} color={typeColor(item.type)} aria-hidden />
      )}
      <Link
        component="a"
        href={item.routeUrl}
        underline="none"
        onClick={stopBubble}
        sx={{
          fontSize: 14,
          fontWeight: 500,
          color: 'text.primary',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          '&:focus-visible': {
            outline: '2px solid',
            outlineColor: 'primary.main',
            outlineOffset: 2,
          },
        }}
      >
        {item.title}
      </Link>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
      >
        {formatSmartTime(item)}
      </Typography>
      <TodayActions
        item={item}
        onComplete={handleComplete}
        onSnooze={handleSnoozeOpen}
        onDismiss={handleDismiss}
      />
      {snoozeAnchor && (
        <SnoozeMenu
          anchorEl={snoozeAnchor}
          onClose={handleSnoozeClose}
          onSnooze={handleSnoozeSelect}
        />
      )}
    </Box>
  );
}

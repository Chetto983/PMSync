/**
 * TodayFeedItem — 48px row per UI-SPEC § Feed Item Anatomy.
 *
 * Layout: [TypeIcon 40px] [Title + Subtitle (flex 1)] [TimeBadge] [QuickActions hover]
 *
 * Click target: entire row, dispatched by `item.type` per UI-SPEC § Click-through Navigation.
 *   - email -> /dashboard/email/thread/{threadId|emailId}
 *   - task  -> /dashboard/tasks
 *   - deal  -> /dashboard/crm/deals/{dealId}
 *   - event -> /dashboard/calendar
 *
 * Quick actions:
 *   - complete: useCompleteFeedItem mutation + success toast
 *   - dismiss: client-only Zustand store + undo toast (6s)
 *   - snooze: SnoozeMenu -> useSnoozeFeedItem (follow-up items only)
 */

'use client';

import { useState } from 'react';
import { Box, Chip, Typography, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { Mail, CheckSquare, TrendingUp, Calendar } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { it as itLocale } from 'date-fns/locale';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useLocale } from '@/lib/hooks/use-locale';
import { useGlobalToast } from '@/lib/context/toast-context';
import { useTodayFeedStore } from '@/stores/today-feed-store';
import { useCompleteFeedItem, useSnoozeFeedItem } from '@/hooks/queries/use-today';
import type { TodayFeedItem as TodayFeedItemType, TodayItemType } from '@/lib/api/dashboard';
import { TodayQuickActions } from './TodayQuickActions';
import { SnoozeMenu } from './SnoozeMenu';

interface TodayFeedItemProps {
  item: TodayFeedItemType;
  /** When true, suppress quick actions + click navigation (used in empty-state preview). */
  disabled?: boolean;
  /** When true, render in compact mode (no quick actions). */
  compact?: boolean;
}

interface TypeStyle {
  Icon: typeof Mail;
  color: 'info' | 'success' | 'warning';
}

const TYPE_STYLE: Record<TodayItemType, TypeStyle> = {
  email: { Icon: Mail, color: 'info' },
  task: { Icon: CheckSquare, color: 'success' },
  deal: { Icon: TrendingUp, color: 'warning' },
  event: { Icon: Calendar, color: 'warning' },
};

export function TodayFeedItem({ item, disabled = false, compact = false }: TodayFeedItemProps) {
  const t = useTranslations();
  const { locale } = useLocale();
  const router = useRouter();
  const theme = useTheme();
  const toast = useGlobalToast();
  const dismissStoreDismiss = useTodayFeedStore((s) => s.dismiss);
  const dismissStoreRestore = useTodayFeedStore((s) => s.restore);
  const completeMutation = useCompleteFeedItem();
  const snoozeMutation = useSnoozeFeedItem();
  const [snoozeAnchor, setSnoozeAnchor] = useState<HTMLElement | null>(null);

  const dl = locale === 'it' ? { locale: itLocale } : undefined;
  const { Icon, color } = TYPE_STYLE[item.type];
  const iconColor = theme.palette[color].main;

  // Click-through navigation per UI-SPEC § Click-through Navigation table.
  // Inline dispatch (4 explicit router.push calls) for per-type traceability.
  const navigate = () => {
    if (item.type === 'email') {
      router.push(`/dashboard/email/thread/${item.threadId ?? item.emailId ?? ''}`);
    } else if (item.type === 'task') {
      router.push('/dashboard/tasks');
    } else if (item.type === 'deal') {
      router.push(`/dashboard/crm/deals/${item.dealId ?? ''}`);
    } else if (item.type === 'event') {
      router.push('/dashboard/calendar');
    }
  };

  const handleRowClick = () => {
    if (disabled) return;
    navigate();
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      navigate();
    }
  };

  const handleComplete = async () => {
    try {
      await completeMutation.mutateAsync(item);
      toast.success(t.dashboard.today.toasts.completed);
    } catch (err) {
      // Mutation rejected (canComplete=false or backend error) — show generic info
      toast.error((err as Error).message);
    }
  };

  const handleDismiss = () => {
    dismissStoreDismiss(item.id);
    toast.info(t.dashboard.today.toasts.dismissed, {
      actionLabel: t.dashboard.today.toasts.undo,
      duration: 6000,
      onAction: () => dismissStoreRestore(item.id),
    });
  };

  const handleSnoozeOpen = (anchor: HTMLElement) => setSnoozeAnchor(anchor);
  const handleSnoozeClose = () => setSnoozeAnchor(null);
  const handleSnoozeSelect = async (until: Date) => {
    try {
      await snoozeMutation.mutateAsync({ item, until });
      const timeLabel = formatDistanceToNow(until, { addSuffix: true, ...dl });
      toast.info(
        t.dashboard.today.toasts.snoozed.replace('{time}', timeLabel),
        {
          actionLabel: t.dashboard.today.toasts.undo,
          duration: 6000,
          onAction: () => {
            // Snooze undo not implemented in MVP — restore is client-side dismiss revert.
            // The next refetch invalidation will surface the row again.
          },
        },
      );
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const showActions = !disabled && !compact;

  return (
    <Box
      className="feed-row"
      role="listitem"
      tabIndex={disabled ? -1 : 0}
      onClick={handleRowClick}
      onKeyDown={handleKey}
      sx={{
        minHeight: 48,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 2,
        py: 0.5,
        borderRadius: 1,
        cursor: disabled ? 'default' : 'pointer',
        ...(disabled
          ? {}
          : {
              '&:hover': { bgcolor: 'action.hover' },
              '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: -2 },
            }),
      }}
    >
      {/* Icon column */}
      <Box
        sx={{
          width: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            bgcolor: alpha(iconColor, 0.12),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={20} color={iconColor} />
        </Box>
      </Box>

      {/* Text column */}
      <Box sx={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
        <Typography variant="body2" noWrap sx={{ lineHeight: 1.5 }}>
          {item.title}
        </Typography>
        {item.subtitle && (
          <Typography
            variant="caption"
            color={item.isOverdue ? 'error' : 'text.secondary'}
            noWrap
            sx={{ display: 'block', lineHeight: 1.5 }}
          >
            {item.subtitle}
          </Typography>
        )}
      </Box>

      {/* Time badge */}
      {item.dueAt && (
        <Chip
          size="small"
          variant="outlined"
          color={item.isOverdue ? 'error' : 'default'}
          label={formatDistanceToNow(new Date(item.dueAt), { addSuffix: true, ...dl })}
          sx={{ flexShrink: 0 }}
        />
      )}

      {/* Quick actions */}
      {showActions && (
        <TodayQuickActions
          item={item}
          onComplete={handleComplete}
          onDismiss={handleDismiss}
          onSnoozeOpen={handleSnoozeOpen}
        />
      )}

      {/* Snooze menu (anchored to clock IconButton inside QuickActions) */}
      {showActions && (
        <SnoozeMenu
          anchorEl={snoozeAnchor}
          onClose={handleSnoozeClose}
          onSnooze={handleSnoozeSelect}
        />
      )}
    </Box>
  );
}

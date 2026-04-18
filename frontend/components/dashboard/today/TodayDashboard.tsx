/**
 * TodayDashboard — Top-level container for the Smart Today Dashboard (145.1-04).
 *
 * Composes TodayHeader + 4 × TodayStream inside a direct Stack shell; the
 * header owns the page heading via TodayHeader's greeting (no wrapper chrome).
 *
 * Critical guarantees (grep-verified):
 *   - Exactly one dismiss-id filter pass on items, via useMemo (WR-04 fix —
 *     no downstream re-filter in TodayStream).
 *   - Streams rendered in STREAM_ORDER with pre-filtered itemsByStream[name].
 *   - Stack shell uses maxWidth={880}, mx="auto", px={{ xs: 2, md: 3 }},
 *     py={3}, spacing={2}.
 *   - Empty-all (no visible items after dismissed filter) renders TodayEmptyState.
 */

'use client';

import { useMemo } from 'react';
import { Alert, Stack } from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useUserTimezone } from '@/hooks/use-user-timezone';
import { useTodayFeed } from '@/hooks/queries/use-today';
import { useTodayFeedStore } from '@/stores/today-feed-store';
import type { TodayFeedItem, TodayStream } from '@/lib/api/dashboard';
import { TodayHeader } from './TodayHeader';
import { TodayStream as TodayStreamComponent } from './TodayStream';
import { TodayEmptyState } from './TodayEmptyState';

const STREAM_ORDER: TodayStream[] = [
  'replies-needed',
  'due-today',
  'waiting-on-others',
  'fyi',
];

const DEFAULT_EXPANDED: Record<TodayStream, boolean> = {
  'replies-needed': true,
  'due-today': true,
  'waiting-on-others': false,
  'fyi': false,
};

function groupByStream(items: TodayFeedItem[]): Record<TodayStream, TodayFeedItem[]> {
  const out: Record<TodayStream, TodayFeedItem[]> = {
    'replies-needed': [],
    'due-today': [],
    'waiting-on-others': [],
    'fyi': [],
  };
  for (const i of items) {
    out[i.stream].push(i);
  }
  return out;
}

export function TodayDashboard() {
  const t = useTranslations();
  const tz = useUserTimezone();
  const { data, isLoading, error } = useTodayFeed({ tz });
  const dismissedIds = useTodayFeedStore((s) => s.dismissedIds);

  // WR-04 fix: filter ONCE here in the parent, pass pre-filtered arrays down.
  const { visibleItems, itemsByStream } = useMemo(() => {
    const items = data?.items ?? [];
    const visible = items.filter((i) => !dismissedIds.has(i.id));
    return { visibleItems: visible, itemsByStream: groupByStream(visible) };
  }, [data?.items, dismissedIds]);

  const isEmptyAll = !isLoading && !error && visibleItems.length === 0;

  return (
    <Stack
      component="main"
      maxWidth={880}
      mx="auto"
      px={{ xs: 2, md: 3 }}
      py={3}
      spacing={2}
      sx={{ width: '100%' }}
    >
      <TodayHeader counts={data?.counts} loading={isLoading} />
      {error && (
        <Alert severity="error">{t.dashboard.today.error}</Alert>
      )}
      {isEmptyAll ? (
        <TodayEmptyState />
      ) : (
        STREAM_ORDER.map((stream) => (
          <TodayStreamComponent
            key={stream}
            name={stream}
            items={itemsByStream[stream]}
            defaultExpanded={DEFAULT_EXPANDED[stream]}
            loading={isLoading}
          />
        ))
      )}
    </Stack>
  );
}

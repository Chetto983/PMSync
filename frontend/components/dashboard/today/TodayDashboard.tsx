/**
 * TodayDashboard — Top-level container for the Smart Today Dashboard (NAV-05).
 *
 * Phase 145 Plan 02 — calls useTodayFeed and branches on loading/error/empty/data.
 * Container max-width 720px per UI-SPEC § Responsive (single-column Superhuman pattern).
 *
 * Wired into pages/dashboard/index.tsx in Plan 03.
 */

'use client';

import { Stack } from '@mui/material';
import { PageContainer } from '@/components/common/PageContainer';
import { QueryErrorAlert } from '@/components/common/QueryErrorAlert';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useUserTimezone } from '@/hooks/use-user-timezone';
import { useTodayFeed } from '@/hooks/queries/use-today';
import { useTodayFeedStore } from '@/stores/today-feed-store';
import type { TodayFeedCounts } from '@/lib/api/dashboard';
import { TodayLoadingSkeleton } from './TodayLoadingSkeleton';
import { TodayEmptyState } from './TodayEmptyState';
import { TodayGreeting } from './TodayGreeting';
import { TodayFeedList } from './TodayFeedList';

export function TodayDashboard() {
  const t = useTranslations();
  const tz = useUserTimezone();
  const { data, isLoading, error, refetch } = useTodayFeed({ tz, includeGreeting: true });
  const dismissedIds = useTodayFeedStore((s) => s.dismissedIds);

  const visibleItems = (data?.items ?? []).filter((i) => !dismissedIds.has(i.id));

  // Recompute counts AFTER applying client-side dismiss for greeting accuracy.
  const liveCounts: TodayFeedCounts = data
    ? {
        urgent: visibleItems.filter((i) => i.tier === 'urgent').length,
        today: visibleItems.filter((i) => i.tier === 'today').length,
        fyi: visibleItems.filter((i) => i.tier === 'fyi').length,
        total: visibleItems.length,
      }
    : { urgent: 0, today: 0, fyi: 0, total: 0 };

  const isEmpty = !isLoading && !error && visibleItems.length === 0;

  return (
    <PageContainer
      title={t.dashboard.today.title}
      subtitle={t.dashboard.today.subtitle}
      maxWidth={720}
    >
      <Stack spacing={3}>
        {isLoading && <TodayLoadingSkeleton />}
        {error && (
          <QueryErrorAlert
            error={error as Error}
            onRetry={() => refetch()}
            title={t.dashboard.today.error}
          />
        )}
        {!isLoading && !error && data && (
          <>
            {data.greeting !== null || liveCounts.total > 0 ? (
              <TodayGreeting greeting={data.greeting} counts={liveCounts} />
            ) : null}
            {isEmpty ? (
              <TodayEmptyState nextItem={data.items[0] ?? undefined} />
            ) : (
              <TodayFeedList items={data.items} counts={liveCounts} />
            )}
          </>
        )}
      </Stack>
    </PageContainer>
  );
}

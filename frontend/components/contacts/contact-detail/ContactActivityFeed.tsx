import { useMemo } from 'react';
import {
  Box,
  Typography,
  Skeleton,
  Alert,
} from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useContactTimeline } from '@/hooks/queries/use-contacts';
import { ActivityTimeline } from '@/components/common/ActivityTimeline';
import type { ActivityEvent } from '@/components/common/ActivityTimeline';

export interface ContactActivityFeedProps {
  contactId: string;
}

export const ContactActivityFeed = ({ contactId }: ContactActivityFeedProps) => {
  const { data, isLoading, isError, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useContactTimeline(contactId);
  const t = useTranslations();
  const tl = t.contacts?.details?.timeline;

  const activities: ActivityEvent[] = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) =>
      page.entries.map((entry) => ({
        id: entry.id,
        type: entry.type,
        content: entry.title + (entry.summary ? ': ' + entry.summary : ''),
        createdAt: entry.date,
        metadata: entry.metadata,
      })),
    );
  }, [data]);

  if (isLoading) {
    return (
      <Box sx={{ py: 2 }}>
        <Skeleton variant="text" width="40%" sx={{ mb: 1 }} />
        <Skeleton variant="rectangular" height={48} sx={{ mb: 1, borderRadius: 1 }} />
        <Skeleton variant="rectangular" height={48} sx={{ mb: 1, borderRadius: 1 }} />
        <Skeleton variant="rectangular" height={48} sx={{ borderRadius: 1 }} />
      </Box>
    );
  }

  if (isError) {
    return (
      <Alert severity="error" variant="outlined" sx={{ my: 2 }}>
        {t.contacts?.details?.activity?.loadError ?? 'Failed to load activity history.'}
      </Alert>
    );
  }

  if (!activities.length) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography variant="body2" color="text.secondary">
          {tl?.empty ?? 'No activity recorded'}
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        {tl?.title ?? 'Activity Timeline'}
      </Typography>
      <ActivityTimeline
        activities={activities}
        isLoading={false}
        isLoadingMore={isFetchingNextPage}
        hasMore={!!hasNextPage}
        onLoadMore={() => fetchNextPage()}
      />
    </Box>
  );
};

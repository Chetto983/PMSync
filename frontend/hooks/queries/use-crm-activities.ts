import { useInfiniteQuery } from '@tanstack/react-query';
import { crmActivitiesApi, type ActivityEntityType } from '@/lib/api/crm-activities';
import { crmActivitiesKeys } from './crm-activities-keys';

export function useActivityTimeline(entityType: ActivityEntityType, entityId: string, limit = 50) {
  return useInfiniteQuery({
    queryKey: crmActivitiesKeys.timeline(entityType, entityId),
    queryFn: ({ pageParam }) =>
      crmActivitiesApi.getTimeline(entityType, entityId, { cursor: pageParam, limit }).then((r) => r.data),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    enabled: !!entityId,
  });
}

import type { ActivityEntityType } from '@/lib/api/crm-activities';

export const crmActivitiesKeys = {
  all: ['crm-activities'] as const,
  timeline: (entityType: ActivityEntityType, entityId: string) =>
    [...crmActivitiesKeys.all, 'timeline', entityType, entityId] as const,
} as const;

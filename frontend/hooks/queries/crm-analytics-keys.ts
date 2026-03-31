export const crmAnalyticsKeys = {
  all: ['crm-analytics'] as const,
  csat: (params?: { startDate?: string; endDate?: string; assigneeId?: string }) =>
    [...crmAnalyticsKeys.all, 'csat', params ?? {}] as const,
  service: (params?: { startDate?: string; endDate?: string }) =>
    [...crmAnalyticsKeys.all, 'service', params ?? {}] as const,
};

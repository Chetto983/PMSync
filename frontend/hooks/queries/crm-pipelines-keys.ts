export const crmPipelinesKeys = {
  all: ['crm-pipelines'] as const,
  list: () => [...crmPipelinesKeys.all, 'list'] as const,
  details: () => [...crmPipelinesKeys.all, 'detail'] as const,
  detail: (id: string) => [...crmPipelinesKeys.details(), id] as const,
} as const;

export const crmPipelinesKeys = {
  all: ['crm-pipelines'] as const,
  list: () => [...crmPipelinesKeys.all, 'list'] as const,
  details: () => [...crmPipelinesKeys.all, 'detail'] as const,
  detail: (id: string) => [...crmPipelinesKeys.details(), id] as const,
  metrics: (id: string) => [...crmPipelinesKeys.all, 'metrics', id] as const,
  views: (pipelineId: string) => [...crmPipelinesKeys.all, 'views', pipelineId] as const,
} as const;

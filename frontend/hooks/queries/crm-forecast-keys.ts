export const crmForecastKeys = {
  all: ['crm-forecast'] as const,
  forecast: (pipelineId: string, period: string) =>
    [...crmForecastKeys.all, pipelineId, period] as const,
  accuracy: (pipelineId: string) =>
    [...crmForecastKeys.all, 'accuracy', pipelineId] as const,
} as const;

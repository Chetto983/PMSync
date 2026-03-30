export const crmForecastKeys = {
  all: ['crm-forecast'] as const,
  forecast: (pipelineId: string, period: string) =>
    [...crmForecastKeys.all, pipelineId, period] as const,
} as const;

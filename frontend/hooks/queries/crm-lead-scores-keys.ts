export const crmLeadScoresKeys = {
  all: ['crm-lead-scores'] as const,
  list: () => [...crmLeadScoresKeys.all, 'list'] as const,
  listFiltered: (params: Record<string, unknown>) =>
    [...crmLeadScoresKeys.list(), params] as const,
  details: () => [...crmLeadScoresKeys.all, 'detail'] as const,
  detail: (contactId: string) =>
    [...crmLeadScoresKeys.details(), contactId] as const,
  history: (contactId: string) =>
    [...crmLeadScoresKeys.all, 'history', contactId] as const,
} as const;

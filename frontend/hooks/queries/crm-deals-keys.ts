export const crmDealsKeys = {
  all: ['crm-deals'] as const,
  list: (filters?: Record<string, unknown>) =>
    [...crmDealsKeys.all, 'list', filters ?? {}] as const,
  details: () => [...crmDealsKeys.all, 'detail'] as const,
  detail: (id: string) => [...crmDealsKeys.details(), id] as const,
  contacts: (dealId: string) => [...crmDealsKeys.detail(dealId), 'contacts'] as const,
} as const;

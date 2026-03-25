export const crmDealsKeys = {
  all: ['crm-deals'] as const,
  list: (filters?: Record<string, unknown>) =>
    [...crmDealsKeys.all, 'list', filters ?? {}] as const,
  details: () => [...crmDealsKeys.all, 'detail'] as const,
  detail: (id: string) => [...crmDealsKeys.details(), id] as const,
  contacts: (dealId: string) => [...crmDealsKeys.detail(dealId), 'contacts'] as const,
  activities: (dealId: string) => [...crmDealsKeys.detail(dealId), 'activities'] as const,
  notes: (dealId: string) => [...crmDealsKeys.detail(dealId), 'notes'] as const,
} as const;

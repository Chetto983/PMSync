export const crmChurnKeys = {
  all: ['crm-churn'] as const,
  list: (filters?: Record<string, unknown>) =>
    [...crmChurnKeys.all, 'list', filters ?? {}] as const,
  contactSignal: (contactId: string) =>
    [...crmChurnKeys.all, 'contact', contactId] as const,
  accountSignal: (accountId: string) =>
    [...crmChurnKeys.all, 'account', accountId] as const,
};

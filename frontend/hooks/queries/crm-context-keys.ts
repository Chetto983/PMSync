export const crmContextKeys = {
  all: ['crm-context'] as const,
  byContact: (contactId: string) => [...crmContextKeys.all, 'contact', contactId] as const,
  byEmail: (email: string) => [...crmContextKeys.all, 'email', email] as const,
} as const;

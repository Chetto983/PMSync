export const crmNbaKeys = {
  all: ['crm-nba'] as const,
  recommendations: (dealId: string) =>
    [...crmNbaKeys.all, 'recommendations', dealId] as const,
  effectiveness: () => [...crmNbaKeys.all, 'effectiveness'] as const,
};

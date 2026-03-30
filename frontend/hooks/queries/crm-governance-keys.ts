export const crmGovernanceKeys = {
  all: ['crm-governance'] as const,
  overview: () => [...crmGovernanceKeys.all, 'overview'] as const,
  accuracy: (range: string) =>
    [...crmGovernanceKeys.all, 'accuracy', range] as const,
  costs: (range: string) =>
    [...crmGovernanceKeys.all, 'costs', range] as const,
  costTrend: () =>
    [...crmGovernanceKeys.all, 'cost-trend'] as const,
};

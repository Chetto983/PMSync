export const crmGovernanceKeys = {
  all: ['crm-governance'] as const,
  overview: () => [...crmGovernanceKeys.all, 'overview'] as const,
  costs: (range: string) =>
    [...crmGovernanceKeys.all, 'costs', range] as const,
};

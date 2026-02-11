/**
 * TanStack Query key factory for consent data
 */
export const consentKeys = {
  all: ['consent'] as const,
  list: () => [...consentKeys.all, 'list'] as const,
  history: (feature?: string) => [...consentKeys.all, 'history', feature] as const,
};

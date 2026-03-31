/**
 * Query keys for dashboard data
 * Following TanStack Query v5 best practices
 */

export const dashboardKeys = {
  all: ['dashboard'] as const,
  preferences: () => [...dashboardKeys.all, 'preferences'] as const,
  briefing: () => [...dashboardKeys.all, 'briefing'] as const,
  deadlines: (params?: { limit?: number; dueWithin?: string }) =>
    [...dashboardKeys.all, 'deadlines', params] as const,
  followUps: (params?: { status?: string; limit?: number }) =>
    [...dashboardKeys.all, 'followUps', params] as const,
  staleContacts: (params?: { limit?: number }) =>
    [...dashboardKeys.all, 'staleContacts', params] as const,
  emailTrends: () => [...dashboardKeys.all, 'emailTrends'] as const,
  triagedEmails: (params?: { limit?: number; priority?: number }) =>
    [...dashboardKeys.all, 'triagedEmails', params] as const,
};

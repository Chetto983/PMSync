/**
 * Query keys for the Today dashboard feed
 * Following TanStack Query v5 best practices (matches dashboard-keys shape)
 */

export const todayKeys = {
  all: ['dashboard', 'today'] as const,
  feed: (opts?: { locale?: string; tz?: string; includeGreeting?: boolean }) =>
    [...todayKeys.all, 'feed', opts ?? {}] as const,
};

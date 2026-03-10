/**
 * Admin query key factory
 */
export const adminKeys = {
  all: ['admin'] as const,
  users: (params?: object) => ['admin', 'users', params] as const,
  userSessions: (userId: string) => ['admin', 'sessions', userId] as const,
};

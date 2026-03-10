/**
 * Query key factory for organization-related queries.
 */
export const orgKeys = {
  all: ['organizations'] as const,
  list: () => [...orgKeys.all, 'list'] as const,
  active: () => [...orgKeys.all, 'active'] as const,
  detail: (id: string) => [...orgKeys.all, 'detail', id] as const,
  members: (orgId: string) => [...orgKeys.all, 'members', orgId] as const,
  invitations: () => [...orgKeys.all, 'invitations'] as const,
};

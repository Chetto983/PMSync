/**
 * Admin Query Hooks
 *
 * TanStack Query hooks for admin user management via better-auth admin client.
 */

import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { adminKeys } from './admin-keys';
import { authClient } from '@/lib/auth-client';

// ==========================================================================
// Types
// ==========================================================================

export interface AdminUsersParams {
  limit?: number;
  offset?: number;
  searchField?: string;
  searchValue?: string;
  searchOperator?: string;
}

interface AdminUserListResult {
  users: unknown[];
  total: number;
}

interface AdminSessionListResult {
  sessions?: unknown[];
}

interface AdminClientResponse<T> {
  data?: T | null;
}

interface AdminClientMethods {
  listUsers: (args: { query: Record<string, unknown> }) => Promise<AdminClientResponse<AdminUserListResult>>;
  listUserSessions: (args: { query: { userId: string } }) => Promise<AdminClientResponse<AdminSessionListResult | unknown[]>>;
  banUser: (args: { userId: string; banReason?: string; banExpiresIn?: number }) => Promise<AdminClientResponse<unknown>>;
  unbanUser: (args: { userId: string }) => Promise<AdminClientResponse<unknown>>;
  impersonateUser: (args: { userId: string }) => Promise<AdminClientResponse<unknown>>;
  stopImpersonating: () => Promise<AdminClientResponse<unknown>>;
  revokeUserSessions: (args: { userId: string }) => Promise<AdminClientResponse<unknown>>;
}

const adminClient = authClient.admin as unknown as AdminClientMethods;

// ==========================================================================
// Query Options
// ==========================================================================

export function adminUsersOptions(params: AdminUsersParams = {}) {
  const query: Record<string, unknown> = {
    limit: params.limit ?? 25,
    offset: params.offset ?? 0,
  };
  if (params.searchValue) {
    query.searchField = params.searchField || 'email';
    query.searchOperator = params.searchOperator || 'contains';
    query.searchValue = params.searchValue;
  }
  return queryOptions({
    queryKey: adminKeys.users(params),
    queryFn: async () => {
      const res = await adminClient.listUsers({ query });
      return res.data ?? { users: [], total: 0 };
    },
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function adminUserSessionsOptions(userId: string) {
  return queryOptions({
    queryKey: adminKeys.userSessions(userId),
    queryFn: async () => {
      const res = await adminClient.listUserSessions({ query: { userId } });
      if (Array.isArray(res.data)) {
        return res.data;
      }
      return res.data?.sessions ?? [];
    },
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
    enabled: !!userId,
  });
}

// ==========================================================================
// Query Hooks
// ==========================================================================

/** List all users with pagination and search (super-admin only) */
export function useAdminUsers(params: AdminUsersParams = {}) {
  return useQuery(adminUsersOptions(params));
}

/** List active sessions for a specific user */
export function useAdminUserSessions(userId: string) {
  return useQuery(adminUserSessionsOptions(userId));
}

// ==========================================================================
// Mutation Hooks
// ==========================================================================

/** Ban a user with optional reason and expiry */
export function useBanUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      userId: string;
      banReason?: string;
      banExpiresIn?: number;
    }) => {
      const res = await adminClient.banUser({
        userId: data.userId,
        banReason: data.banReason,
        banExpiresIn: data.banExpiresIn,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.all });
    },
  });
}

/** Unban a previously banned user */
export function useUnbanUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await adminClient.unbanUser({ userId });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.all });
    },
  });
}

/** Impersonate a user (session changes, requires reload) */
export function useImpersonateUser() {
  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await adminClient.impersonateUser({ userId });
      return res.data;
    },
    onSuccess: () => {
      window.location.reload();
    },
  });
}

/** Stop impersonating (return to admin session) */
export function useStopImpersonating() {
  return useMutation({
    mutationFn: async () => {
      const res = await adminClient.stopImpersonating();
      return res.data;
    },
    onSuccess: () => {
      window.location.reload();
    },
  });
}

/** Revoke all sessions for a user */
export function useRevokeUserSessions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await adminClient.revokeUserSessions({ userId });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.all });
    },
  });
}

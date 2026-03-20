/**
 * Organization Query Hooks
 *
 * TanStack Query hooks for organization management via better-auth client.
 * Uses authClient.organization methods for all org operations.
 */

import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { orgKeys } from './organization-keys';
import { emailKeys } from './email-keys';
import { folderKeys } from './use-folders';
import { labelKeys } from './use-labels';
import { billingKeys } from './billing-keys';
import { authClient } from '@/lib/auth-client';
import { websocketClient } from '@/lib/websocket-client';

interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
}

interface PendingInvitation {
  id: string;
  organizationName?: string | null;
  organization?: {
    name?: string | null;
  } | null;
}

interface OrganizationDetail {
  members?: unknown[];
}

interface AuthClientErrorLike {
  message?: string;
  code?: string;
}

// ==========================================================================
// Query Options
// ==========================================================================

async function getAuthJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/auth${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Auth request failed (${response.status})`);
  }

  return response.json() as Promise<T>;
}

export function organizationsOptions() {
  return queryOptions({
    queryKey: orgKeys.list(),
    queryFn: async () => {
      return getAuthJson<OrganizationSummary[]>('/organization/list');
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

export function organizationDetailOptions(orgId: string) {
  return queryOptions({
    queryKey: orgKeys.detail(orgId),
    queryFn: async () => {
      const res = await authClient.organization.getFullOrganization({
        query: { organizationId: orgId },
      });
      return res.data as OrganizationDetail | null | undefined;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    enabled: !!orgId,
  });
}

export function pendingInvitationsOptions() {
  return queryOptions({
    queryKey: orgKeys.invitations(),
    queryFn: async () => {
      return getAuthJson<PendingInvitation[]>('/organization/list-user-invitations');
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });
}

// ==========================================================================
// Query Hooks
// ==========================================================================

/** List all organizations for the current user */
export function useOrganizations() {
  return useQuery(organizationsOptions());
}

/** Get full organization details including members */
export function useOrganizationDetail(orgId: string) {
  return useQuery(organizationDetailOptions(orgId));
}

/** Get pending invitations for the current user */
export function usePendingInvitations() {
  return useQuery(pendingInvitationsOptions());
}

// ==========================================================================
// Mutation Hooks
// ==========================================================================

/** Switch active organization on the session */
export function useSetActiveOrg() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (organizationId: string) => {
      const res = await authClient.organization.setActive({
        organizationId,
      });
      return res.data;
    },
    onSuccess: async () => {
      await authClient.getSession();
      // Reconnect WS to pick up new activeOrganizationId
      if (websocketClient.isConnected()) {
        try {
          await websocketClient.reconnectForOrgSwitch();
        } catch {
          // WS reconnect failure is non-fatal; data still correct via HTTP
        }
      }
      // Targeted invalidation — only org-scoped data, not auth/session cache
      queryClient.invalidateQueries({ queryKey: orgKeys.all });
      queryClient.invalidateQueries({ queryKey: emailKeys.all });
      queryClient.invalidateQueries({ queryKey: folderKeys.all });
      queryClient.invalidateQueries({ queryKey: labelKeys.all });
      queryClient.invalidateQueries({ queryKey: billingKeys.all });
    },
  });
}

/** Create a new organization (super-admin only) */
export function useCreateOrg() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { name: string; slug: string }) => {
      const res = await authClient.organization.create(data);
      if (res.error) {
        const authError = res.error as AuthClientErrorLike;
        const errMsg = authError.message
          || authError.code
          || JSON.stringify(res.error);
        throw new Error(errMsg);
      }
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgKeys.all });
    },
  });
}

/** Delete an organization (super-admin only) */
export function useDeleteOrg() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (organizationId: string) => {
      const res = await authClient.organization.delete({ organizationId });
      if (res.error) {
        throw new Error(res.error.message || 'Failed to delete organization');
      }
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgKeys.all });
    },
  });
}

/** Invite a member to an organization (super-admin only) */
export function useInviteMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      email: string;
      organizationId: string;
      role?: string;
    }) => {
      const res = await authClient.organization.inviteMember({
        email: data.email,
        organizationId: data.organizationId,
        role: (data.role || 'admin') as 'admin' | 'member' | 'owner',
      });
      if (res.error) {
        throw new Error(res.error.message || 'Failed to invite member');
      }
      return res.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: orgKeys.detail(variables.organizationId),
      });
    },
  });
}

/** Remove a member from an organization (super-admin only) */
export function useRemoveMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      memberIdOrEmail: string;
      organizationId: string;
    }) => {
      const res = await authClient.organization.removeMember({
        memberIdOrEmail: data.memberIdOrEmail,
        organizationId: data.organizationId,
      });
      return res.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: orgKeys.detail(variables.organizationId),
      });
    },
  });
}

/** Accept an invitation */
export function useAcceptInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (invitationId: string) => {
      const res = await authClient.organization.acceptInvitation({
        invitationId,
      });
      if (res.error) {
        const authError = res.error as AuthClientErrorLike;
        const errMsg =
          authError.message || authError.code || 'Failed to accept invitation';
        throw new Error(errMsg);
      }
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgKeys.all });
    },
  });
}

/** Decline an invitation */
export function useDeclineInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (invitationId: string) => {
      const res = await authClient.organization.rejectInvitation({
        invitationId,
      });
      if (res.error) {
        const authError = res.error as AuthClientErrorLike;
        const errMsg =
          authError.message || authError.code || 'Failed to decline invitation';
        throw new Error(errMsg);
      }
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgKeys.invitations() });
    },
  });
}

/**
 * Organization Query Hooks
 *
 * TanStack Query hooks for organization management via better-auth client.
 * Uses authClient.organization methods for all org operations.
 */

import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { orgKeys } from './organization-keys';
import { authClient } from '@/lib/auth-client';

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
      return getAuthJson<any[]>('/organization/list');
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
      return res.data;
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
      return getAuthJson<any[]>('/organization/list-user-invitations');
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
      // Full cache invalidation -- switching org changes all data context
      queryClient.invalidateQueries();
    },
  });
}

/** Create a new organization (super-admin only) */
export function useCreateOrg() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { name: string; slug: string }) => {
      const res = await authClient.organization.create(data);
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
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgKeys.invitations() });
    },
  });
}

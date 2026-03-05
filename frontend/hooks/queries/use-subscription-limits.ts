/**
 * Subscription Limits Query Hook
 *
 * TanStack Query hook for fetching subscription resource limits (providers, users).
 */
import { useQuery, queryOptions } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { billingKeys } from './billing-keys';

export interface SubscriptionLimits {
  maxProviders: number;
  currentProviders: number;
  canAddProvider: boolean;
  maxUsers: number;
  currentUsers: number;
  canAddUser: boolean;
}

async function fetchLimits(): Promise<SubscriptionLimits> {
  const response = await apiClient.get<{ limits: SubscriptionLimits }>('/subscription/limits');
  return response.data.limits;
}

export function subscriptionLimitsOptions() {
  return queryOptions({
    queryKey: billingKeys.limits(),
    queryFn: fetchLimits,
    staleTime: 2 * 60 * 1000, // 2 min - limits can change after provider add/delete
    gcTime: 10 * 60 * 1000, // 10 min
  });
}

export function useSubscriptionLimits() {
  return useQuery(subscriptionLimitsOptions());
}

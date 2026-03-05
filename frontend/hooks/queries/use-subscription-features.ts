import { useQuery, queryOptions } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface SubscriptionFeatures {
  basic_email: boolean;
  smart_replies: boolean;
  summaries: boolean;
  auto_triage: boolean;
  briefings: boolean;
  rag: boolean;
}

async function fetchFeatures(): Promise<SubscriptionFeatures> {
  const response = await apiClient.get<{ features: SubscriptionFeatures }>('/subscription/features');
  return response.data.features;
}

export function subscriptionFeaturesOptions() {
  return queryOptions({
    queryKey: ['subscription', 'features'],
    queryFn: fetchFeatures,
    staleTime: 5 * 60 * 1000, // 5 min
    gcTime: 30 * 60 * 1000, // 30 min
  });
}

export function useSubscriptionFeatures() {
  return useQuery(subscriptionFeaturesOptions());
}

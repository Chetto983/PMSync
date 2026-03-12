import { useQuery } from '@tanstack/react-query';
import {
  featuresOptions,
  type SubscriptionFeatures,
} from './use-billing';

export function subscriptionFeaturesOptions() {
  return featuresOptions();
}

export function useSubscriptionFeatures() {
  return useQuery(subscriptionFeaturesOptions());
}

export type { SubscriptionFeatures };

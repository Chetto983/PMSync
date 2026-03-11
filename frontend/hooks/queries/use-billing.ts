/**
 * Billing/Subscription Query Hooks
 *
 * TanStack Query hooks for subscription management and billing.
 * Uses the subscription API and Autumn proxy routes.
 *
 * @see frontend/lib/api/billing.ts
 */

import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { billingKeys } from './billing-keys';
import { billingApi } from '@/lib/api/billing';
import { useCallback, useMemo } from 'react';

// ==========================================================================
// Query Options (for prefetching)
// ==========================================================================

export function subscriptionOptions() {
  return queryOptions({
    queryKey: billingKeys.subscription(),
    queryFn: billingApi.getSubscription,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 1,
  });
}

export function usageOptions() {
  return queryOptions({
    queryKey: billingKeys.usage(),
    queryFn: billingApi.getUsage,
    staleTime: 30 * 1000, // 30 seconds (more frequent updates)
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function costStatusOptions() {
  return queryOptions({
    queryKey: billingKeys.costStatus(),
    queryFn: billingApi.getCostStatus,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function featuresOptions() {
  return queryOptions({
    queryKey: billingKeys.features(),
    queryFn: billingApi.getFeatures,
    staleTime: 5 * 60 * 1000, // 5 minutes (features change less often)
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

export function pricingTableOptions(authenticated = false) {
  return queryOptions({
    queryKey: authenticated ? billingKeys.pricingTableAuth() : billingKeys.pricingTable(),
    queryFn: authenticated ? billingApi.getPricingTableAuthenticated : billingApi.getPricingTable,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    retry: 1,
  });
}

// ==========================================================================
// Query Hooks
// ==========================================================================

/**
 * Get current subscription with usage stats
 */
export function useSubscription() {
  return useQuery(subscriptionOptions());
}

/**
 * Get real-time usage statistics
 */
export function useUsage() {
  return useQuery(usageOptions());
}

/**
 * Get cost protection status
 */
export function useCostStatus() {
  return useQuery(costStatusOptions());
}

/**
 * Get available features for current plan
 */
export function useFeatures() {
  return useQuery(featuresOptions());
}

/**
 * Get daily cost breakdown
 */
export function useCostBreakdown() {
  return useQuery({
    queryKey: billingKeys.costBreakdown(),
    queryFn: billingApi.getCostBreakdown,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });
}

/**
 * Get feature usage breakdown for today
 */
export function useFeatureUsage() {
  return useQuery({
    queryKey: billingKeys.featureUsage(),
    queryFn: billingApi.getFeatureUsage,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });
}

/**
 * Get pricing table
 */
export function usePricingTable(authenticated = false) {
  return useQuery(pricingTableOptions(authenticated));
}

/**
 * Check if a specific feature is allowed
 */
export function useFeatureCheck(featureId: string) {
  return useQuery({
    queryKey: billingKeys.featureCheck(featureId),
    queryFn: () => billingApi.checkFeature(featureId),
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000,
    retry: 1,
    enabled: !!featureId,
  });
}

// ==========================================================================
// Mutation Hooks
// ==========================================================================

/**
 * Cancel subscription mutation
 */
export function useCancelSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (cancelAtPeriodEnd: boolean) => billingApi.cancelSubscription(cancelAtPeriodEnd),
    onSuccess: () => {
      // Invalidate subscription data
      queryClient.invalidateQueries({ queryKey: billingKeys.subscription() });
    },
  });
}

/**
 * Attach product (initiate checkout)
 */
export function useAttachProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      productId,
      options,
    }: {
      productId: string;
      options?: { name?: string; email?: string };
    }) => billingApi.attachProduct(productId, options),
    onSuccess: (data) => {
      if (!data.success) {
        throw new Error(data.error || 'Checkout failed');
      }
      // If checkout URL returned, redirect
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        // Payment was immediate, refresh subscription
        queryClient.invalidateQueries({ queryKey: billingKeys.subscription() });
      }
    },
  });
}

/**
 * Track usage mutation
 */
export function useTrackUsage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ featureId, amount = 1 }: { featureId: string; amount?: number }) =>
      billingApi.trackUsage(featureId, amount),
    onSuccess: () => {
      // Refresh usage stats
      queryClient.invalidateQueries({ queryKey: billingKeys.usage() });
      queryClient.invalidateQueries({ queryKey: billingKeys.featureUsage() });
    },
  });
}

/**
 * Open billing portal mutation
 */
export function useOpenBillingPortal() {
  return useMutation({
    mutationFn: (returnUrl?: string) =>
      returnUrl ? billingApi.getBillingPortalUrl(returnUrl) : billingApi.openBillingPortal(),
    onSuccess: (data) => {
      // Redirect to billing portal
      if (data.url) {
        window.location.href = data.url;
      }
    },
  });
}

// ==========================================================================
// Combined Hook (similar to Zero-staging use-billing.ts)
// ==========================================================================

/**
 * Combined billing hook providing subscription, usage, and actions
 * Similar to the Zero-staging use-billing.ts pattern
 */
export function useBilling() {
  const queryClient = useQueryClient();

  // Queries
  const subscriptionQuery = useSubscription();
  const costStatusQuery = useCostStatus();
  const featuresQuery = useFeatures();

  // Mutations
  const attachMutation = useAttachProduct();
  const cancelMutation = useCancelSubscription();
  const portalMutation = useOpenBillingPortal();
  const trackMutation = useTrackUsage();

  // Derived state
  const subscription = subscriptionQuery.data;
  const costStatus = costStatusQuery.data;
  const features = featuresQuery.data?.features;

  // Helper: Check if user is on paid plan
  const isPro = useMemo(() => {
    if (!subscription) return false;
    return subscription.plan !== 'FREE';
  }, [subscription]);

  // Helper: Check if AI operations are blocked
  const isAIBlocked = useMemo(() => {
    return costStatus?.isBlocked ?? false;
  }, [costStatus]);

  // Helper: Get remaining quota percentage
  const quotaStatus = useMemo(() => {
    if (!subscription) {
      return { emailPercent: 0, aiPercent: 0, isWarning: false, isCritical: false };
    }

    const usage = subscription?.usage;
    const emailPercent = usage?.percentEmailUsed ?? 0;
    const aiPercent = usage?.percentAIUsed ?? 0;
    const isWarning = emailPercent >= 80 || aiPercent >= 80;
    const isCritical = emailPercent >= 95 || aiPercent >= 95;

    return { emailPercent, aiPercent, isWarning, isCritical };
  }, [subscription]);

  // Action: Refresh all billing data
  const refetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: billingKeys.all });
  }, [queryClient]);

  // Action: Attach product (upgrade)
  const attach = useCallback(
    (productId: string, options?: { name?: string; email?: string }) => {
      return attachMutation.mutateAsync({ productId, options });
    },
    [attachMutation],
  );

  // Action: Track usage
  const track = useCallback(
    (featureId: string, amount = 1) => {
      return trackMutation.mutateAsync({ featureId, amount });
    },
    [trackMutation],
  );

  // Action: Open billing portal
  const openPortal = useCallback(
    (returnUrl?: string) => {
      return portalMutation.mutateAsync(returnUrl);
    },
    [portalMutation],
  );

  // Action: Cancel subscription
  const cancel = useCallback(
    (cancelAtPeriodEnd: boolean = true) => {
      return cancelMutation.mutateAsync(cancelAtPeriodEnd);
    },
    [cancelMutation],
  );

  return {
    // State
    isLoading:
      subscriptionQuery.isLoading || costStatusQuery.isLoading || featuresQuery.isLoading,
    error: subscriptionQuery.error || costStatusQuery.error || featuresQuery.error,
    subscription,
    costStatus,
    features,

    // Derived state
    isPro,
    isAIBlocked,
    quotaStatus,

    // Actions
    refetch,
    attach,
    track,
    openPortal,
    cancel,

    // Mutation states (for UI feedback)
    isAttaching: attachMutation.isPending,
    isCanceling: cancelMutation.isPending,
    isOpeningPortal: portalMutation.isPending,
  };
}

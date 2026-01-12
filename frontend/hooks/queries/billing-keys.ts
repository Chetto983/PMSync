/**
 * Billing Query Keys
 *
 * TanStack Query key factory for billing/subscription queries.
 * Follows the same pattern as other query key files in this directory.
 */

export const billingKeys = {
  all: ['billing'] as const,

  // Subscription queries
  subscription: () => [...billingKeys.all, 'subscription'] as const,
  usage: () => [...billingKeys.all, 'usage'] as const,
  costStatus: () => [...billingKeys.all, 'cost-status'] as const,
  features: () => [...billingKeys.all, 'features'] as const,
  costBreakdown: () => [...billingKeys.all, 'cost-breakdown'] as const,
  featureUsage: () => [...billingKeys.all, 'feature-usage'] as const,

  // Autumn/pricing queries
  pricingTable: () => [...billingKeys.all, 'pricing-table'] as const,
  pricingTableAuth: () => [...billingKeys.all, 'pricing-table-auth'] as const,
  featureCheck: (featureId: string) =>
    [...billingKeys.all, 'feature-check', featureId] as const,
};

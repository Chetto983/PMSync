/**
 * Billing API Client
 *
 * API client for subscription and billing endpoints.
 * Uses Autumn SDK on the backend for payment processing.
 *
 * @see backend/src/modules/subscription
 */

import { apiClient } from '../api-client';

// ==========================================================================
// Types
// ==========================================================================

export interface UsageStats {
  emailsProcessed: number;
  aiCallsUsed: number;
  emailsRemaining: number;
  aiCallsRemaining: number;
  percentEmailUsed: number;
  percentAIUsed: number;
}

export interface Subscription {
  id: string;
  tenantId: string;
  plan: 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
  status: 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'TRIALING';
  monthlyEmailLimit: number;
  monthlyAICallLimit: number;
  maxUsers: number;
  usage: UsageStats;
  autumnCustomerId?: string;
  currentPeriodEnd?: string;
  cancelAt?: string;
  usageResetAt: string;
}

export interface CostProtectionStatus {
  dailyCost: number;
  dailyCap: number | null;
  percentUsed: number;
  isBlocked: boolean;
  alertLevel: 'ok' | 'warning' | 'critical' | 'blocked';
}

export interface FeatureUsage {
  smartReplies: number;
  summaries: number;
  triage: number;
  briefings: number;
  embeddings: number;
}

export interface CostBreakdown {
  total: number;
  byOperation: Record<string, number>;
}

export interface PlanInfo {
  id: string;
  name: string;
  price: number | null;
  currency: string;
  interval: string;
  features: string[];
  limits: {
    emails: number;
    aiCalls: number;
  };
}

export interface PricingTable {
  plans: PlanInfo[];
}

export interface AttachResponse {
  success: boolean;
  checkoutUrl?: string;
  error?: string;
}

export interface CheckResponse {
  allowed: boolean;
  remaining?: number;
  total?: number;
  unlimited?: boolean;
}

export interface BillingPortalResponse {
  url: string;
}

// ==========================================================================
// API Functions
// ==========================================================================

/**
 * Get current subscription with usage stats
 */
export async function getSubscription(): Promise<Subscription> {
  const response = await apiClient.get<Subscription>('/subscription');
  return response.data;
}

/**
 * Get real-time usage statistics
 */
export async function getUsage(): Promise<UsageStats> {
  const response = await apiClient.get<UsageStats>('/subscription/usage');
  return response.data;
}

/**
 * Get cost protection status
 */
export async function getCostStatus(): Promise<CostProtectionStatus> {
  const response = await apiClient.get<CostProtectionStatus>('/subscription/cost-status');
  return response.data;
}

/**
 * Get available features for current plan
 */
export async function getFeatures(): Promise<{ features: Record<string, boolean> }> {
  const response = await apiClient.get<{ features: Record<string, boolean> }>(
    '/subscription/features',
  );
  return response.data;
}

/**
 * Get daily cost breakdown by operation type
 */
export async function getCostBreakdown(): Promise<CostBreakdown> {
  const response = await apiClient.get<CostBreakdown>('/subscription/cost-breakdown');
  return response.data;
}

/**
 * Get feature usage breakdown for today
 */
export async function getFeatureUsage(): Promise<FeatureUsage> {
  const response = await apiClient.get<FeatureUsage>('/subscription/feature-usage');
  return response.data;
}

/**
 * Cancel subscription
 */
export async function cancelSubscription(cancelAtPeriodEnd = true): Promise<Subscription> {
  const response = await apiClient.post<Subscription>('/subscription/cancel', {
    cancelAtPeriodEnd,
  });
  return response.data;
}

// ==========================================================================
// Autumn Proxy API Functions
// ==========================================================================

/**
 * Attach product (initiate payment)
 */
export async function attachProduct(
  productId: string,
  options?: { name?: string; email?: string },
): Promise<AttachResponse> {
  const response = await apiClient.post<AttachResponse>('/autumn/attach', {
    productId,
    ...options,
  });
  return response.data;
}

/**
 * Check feature access
 */
export async function checkFeature(featureId: string): Promise<CheckResponse> {
  const response = await apiClient.post<CheckResponse>('/autumn/check', {
    featureId,
  });
  return response.data;
}

/**
 * Track usage event
 */
export async function trackUsage(featureId: string, amount = 1): Promise<{ success: boolean }> {
  const response = await apiClient.post<{ success: boolean }>('/autumn/track', {
    featureId,
    amount,
  });
  return response.data;
}

/**
 * Get billing portal URL
 */
export async function getBillingPortalUrl(returnUrl?: string): Promise<BillingPortalResponse> {
  const response = await apiClient.post<BillingPortalResponse>('/autumn/billing_portal', {
    returnUrl,
  });
  return response.data;
}

/**
 * Open billing portal (returns to app root)
 */
export async function openBillingPortal(): Promise<BillingPortalResponse> {
  const response = await apiClient.post<BillingPortalResponse>('/autumn/openBillingPortal');
  return response.data;
}

/**
 * Cancel via Autumn
 */
export async function cancelViaAutumn(productId?: string): Promise<{ success: boolean }> {
  const response = await apiClient.post<{ success: boolean }>('/autumn/cancel', {
    productId,
  });
  return response.data;
}

/**
 * Get pricing table (public)
 */
export async function getPricingTable(): Promise<PricingTable> {
  const response = await apiClient.get<PricingTable>('/autumn/components/pricing_table');
  return response.data;
}

/**
 * Get pricing table with customer context (authenticated)
 */
export async function getPricingTableAuthenticated(): Promise<PricingTable> {
  const response = await apiClient.get<PricingTable>(
    '/autumn/components/pricing_table/authenticated',
  );
  return response.data;
}

// ==========================================================================
// Export as object for consistency with other API modules
// ==========================================================================

export const billingApi = {
  // Subscription endpoints
  getSubscription,
  getUsage,
  getCostStatus,
  getFeatures,
  getCostBreakdown,
  getFeatureUsage,
  cancelSubscription,
  // Autumn proxy endpoints
  attachProduct,
  checkFeature,
  trackUsage,
  getBillingPortalUrl,
  openBillingPortal,
  cancelViaAutumn,
  getPricingTable,
  getPricingTableAuthenticated,
};

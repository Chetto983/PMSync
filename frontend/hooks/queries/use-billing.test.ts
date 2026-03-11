/**
 * Tests for use-billing TanStack Query hooks
 *
 * Covers:
 * - Query key construction (no wrapper — pure function calls)
 * - Loading/error/success states via renderHook + waitFor
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import {
  subscriptionOptions,
  usageOptions,
  featuresOptions,
  useSubscription,
} from './use-billing';
import { billingKeys } from './billing-keys';
import { billingApi } from '@/lib/api/billing';

jest.mock('@/lib/api/billing', () => ({
  billingApi: {
    getSubscription: jest.fn(),
    getUsage: jest.fn(),
    getCostStatus: jest.fn(),
    getFeatures: jest.fn(),
    getCostBreakdown: jest.fn(),
    getFeatureUsage: jest.fn(),
    getPricingTable: jest.fn(),
    getPricingTableAuthenticated: jest.fn(),
    checkFeature: jest.fn(),
    cancelSubscription: jest.fn(),
    attachProduct: jest.fn(),
    trackUsage: jest.fn(),
    getBillingPortalUrl: jest.fn(),
    openBillingPortal: jest.fn(),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  function TestQueryWrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return TestQueryWrapper;
}

// ============================================================================
// Query Key Tests (no wrapper — pure function calls)
// ============================================================================

describe('billing query key construction', () => {
  it('subscriptionOptions() has correct query key', () => {
    const opts = subscriptionOptions();
    expect(opts.queryKey).toEqual(['billing', 'subscription']);
  });

  it('usageOptions() has correct query key', () => {
    const opts = usageOptions();
    expect(opts.queryKey).toEqual(['billing', 'usage']);
  });

  it('featuresOptions() has correct query key', () => {
    const opts = featuresOptions();
    expect(opts.queryKey).toEqual(['billing', 'features']);
  });

  it('billingKeys.limits() has correct shape', () => {
    expect(billingKeys.limits()).toEqual(['billing', 'limits']);
  });
});

// ============================================================================
// Loading / Error / Success State Tests
// ============================================================================

describe('useSubscription hook states', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows isError on getSubscription failure', async () => {
    (billingApi.getSubscription as jest.Mock).mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => useSubscription(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 });
  });

  it('returns subscription data on success', async () => {
    const mockSubscription = { plan: 'free' };
    (billingApi.getSubscription as jest.Mock).mockResolvedValue(mockSubscription);
    const { result } = renderHook(() => useSubscription(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual(mockSubscription);
  });
});

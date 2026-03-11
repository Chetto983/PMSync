/**
 * Tests for use-subscription-limits TanStack Query hook
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
  subscriptionLimitsOptions,
  useSubscriptionLimits,
} from './use-subscription-limits';
import { apiClient } from '@/lib/api-client';

jest.mock('@/lib/api-client', () => ({
  apiClient: {
    get: jest.fn(),
  },
}));

// use-subscription-limits imports @/lib/api-client which imports @/lib/auth-client (better-auth ESM)
jest.mock('@/lib/auth-client', () => ({
  authClient: {
    organization: {
      getFullOrganization: jest.fn(),
    },
    getSession: jest.fn(),
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

describe('subscription limits query key construction', () => {
  it('subscriptionLimitsOptions() has correct query key', () => {
    const opts = subscriptionLimitsOptions();
    expect(opts.queryKey).toEqual(['billing', 'limits']);
  });
});

// ============================================================================
// Loading / Error / Success State Tests
// ============================================================================

describe('useSubscriptionLimits hook states', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows isError=true on apiClient failure', async () => {
    (apiClient.get as jest.Mock).mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => useSubscriptionLimits(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('returns limits data on success', async () => {
    const mockLimits = {
      maxProviders: 3,
      currentProviders: 1,
      canAddProvider: true,
      maxUsers: 5,
      currentUsers: 2,
      canAddUser: true,
    };
    (apiClient.get as jest.Mock).mockResolvedValue({ data: { limits: mockLimits } });
    const { result } = renderHook(() => useSubscriptionLimits(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.maxProviders).toBe(3);
    expect(result.current.data?.canAddProvider).toBe(true);
  });
});

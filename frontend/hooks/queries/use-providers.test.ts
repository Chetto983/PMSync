/**
 * Tests for use-providers TanStack Query hooks
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
  providersListOptions,
  providerDetailOptions,
  useProviders,
} from './use-providers';
import { providersKeys } from './providers-keys';
import { providersApi } from '@/lib/api/providers';

jest.mock('@/lib/api/providers', () => ({
  providersApi: {
    getProviders: jest.fn(),
    getProvider: jest.fn(),
    getAliases: jest.fn(),
    updateProvider: jest.fn(),
    deleteProvider: jest.fn(),
    syncProvider: jest.fn(),
    syncAll: jest.fn(),
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

describe('providers query key construction', () => {
  it('providersListOptions() has correct query key', () => {
    const opts = providersListOptions();
    expect(opts.queryKey).toEqual(['providers', 'list']);
  });

  it('providerDetailOptions("p1") has correct query key', () => {
    const opts = providerDetailOptions('p1');
    expect(opts.queryKey).toEqual(['providers', 'detail', 'p1']);
  });

  it('providersKeys.list() has correct shape', () => {
    expect(providersKeys.list()).toEqual(['providers', 'list']);
  });
});

// ============================================================================
// Loading / Error / Success State Tests
// ============================================================================

describe('useProviders hook states', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows isError=true on API failure', async () => {
    (providersApi.getProviders as jest.Mock).mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => useProviders(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('returns data on success', async () => {
    const mockProviders = [{ id: 'p1', email: 'test@example.com' }];
    (providersApi.getProviders as jest.Mock).mockResolvedValue(mockProviders);
    const { result } = renderHook(() => useProviders(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].id).toBe('p1');
  });
});

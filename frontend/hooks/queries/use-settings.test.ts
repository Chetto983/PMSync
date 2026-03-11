/**
 * Tests for use-settings TanStack Query hooks
 *
 * Covers:
 * - Query key construction (no wrapper needed — pure function calls)
 * - Loading/error states via renderHook + waitFor
 * - Mutation call and cache invalidation
 */

import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import {
  userPreferencesOptions,
  providersOptions,
  useUserPreferences,
  useUpdatePreferences,
} from './use-settings';
import { usersApi } from '@/lib/api/users';

jest.mock('@/lib/api/users', () => ({
  usersApi: {
    getPreferences: jest.fn(),
    updatePreferences: jest.fn(),
  },
}));

jest.mock('@/lib/api/providers', () => ({
  providersApi: {
    getProviders: jest.fn(),
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

describe('settings query key construction', () => {
  it('userPreferencesOptions() has correct query key', () => {
    const opts = userPreferencesOptions();
    expect(opts.queryKey).toEqual(['settings', 'preferences']);
  });

  it('providersOptions() has correct query key', () => {
    const opts = providersOptions();
    expect(opts.queryKey).toEqual(['settings', 'providers']);
  });
});

// ============================================================================
// Loading / Error State Tests
// ============================================================================

describe('useUserPreferences hook states', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows isError on API failure', async () => {
    (usersApi.getPreferences as jest.Mock).mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => useUserPreferences(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 });
  });

  it('returns data on success', async () => {
    const mockPrefs = { locale: 'en', theme: 'light' };
    (usersApi.getPreferences as jest.Mock).mockResolvedValue(mockPrefs);
    const { result } = renderHook(() => useUserPreferences(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual(mockPrefs);
  });
});

// ============================================================================
// Mutation Tests
// ============================================================================

describe('useUpdatePreferences mutation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls usersApi.updatePreferences with correct args', async () => {
    (usersApi.updatePreferences as jest.Mock).mockResolvedValue({ language: 'en' });
    const { result } = renderHook(() => useUpdatePreferences(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.mutateAsync({ language: 'en' });
    });
    expect(usersApi.updatePreferences).toHaveBeenCalledWith({ language: 'en' });
  });

  it('invalidates preferences query on success', async () => {
    (usersApi.updatePreferences as jest.Mock).mockResolvedValue({ language: 'it' });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
    });
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);
    const { result } = renderHook(() => useUpdatePreferences(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ language: 'it' });
    });
    expect(invalidateSpy).toHaveBeenCalled();
  });
});

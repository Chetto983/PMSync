/**
 * Tests for use-labels TanStack Query hooks
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
  labelsListOptions,
  labelDetailOptions,
  useLabels,
  labelKeys,
} from './use-labels';
import { labelsApi } from '@/lib/api/labels';

jest.mock('@/lib/api/labels', () => ({
  labelsApi: {
    listLabels: jest.fn(),
    getLabel: jest.fn(),
    createLabel: jest.fn(),
    updateLabel: jest.fn(),
    deleteLabel: jest.fn(),
    addEmailsToLabel: jest.fn(),
    removeEmailFromLabel: jest.fn(),
    reorderLabels: jest.fn(),
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

describe('labels query key construction', () => {
  it('labelsListOptions() has correct query key', () => {
    const opts = labelsListOptions();
    expect(opts.queryKey).toEqual(['labels', 'list']);
  });

  it('labelDetailOptions("l1") has correct query key', () => {
    const opts = labelDetailOptions('l1');
    expect(opts.queryKey).toEqual(['labels', 'detail', 'l1']);
  });

  it('labelKeys.list() has correct shape', () => {
    expect(labelKeys.list()).toEqual(['labels', 'list']);
  });

  it('labelKeys.detail("l1") has correct shape', () => {
    expect(labelKeys.detail('l1')).toEqual(['labels', 'detail', 'l1']);
  });
});

// ============================================================================
// Loading / Error / Success State Tests
// ============================================================================

describe('useLabels hook states', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows isError=true on API failure', async () => {
    (labelsApi.listLabels as jest.Mock).mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => useLabels(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('returns data on success', async () => {
    const mockLabel = { id: 'l1', name: 'Work', color: { backgroundColor: '#000', textColor: '#fff' } };
    (labelsApi.listLabels as jest.Mock).mockResolvedValue({ labels: [mockLabel] });
    const { result } = renderHook(() => useLabels(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].id).toBe('l1');
  });
});

/**
 * Tests for use-folders TanStack Query hooks
 *
 * Covers:
 * - Query key construction (no wrapper needed — pure function calls)
 * - Loading/error/success states via renderHook + waitFor
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import {
  foldersListOptions,
  folderKeys,
  useFolders,
} from './use-folders';

jest.mock('@/lib/api/folders', () => ({
  getFolders: jest.fn(),
  getFoldersByProvider: jest.fn(),
  getFolderMetadata: jest.fn(),
  createFolder: jest.fn(),
  renameFolder: jest.fn(),
  deleteFolder: jest.fn(),
  syncFolders: jest.fn(),
  syncAllFolders: jest.fn(),
}));

jest.mock('@/lib/api/providers', () => ({
  providersApi: {
    getProviders: jest.fn(),
    syncProvider: jest.fn(),
  },
}));

jest.mock('@/lib/auth-client', () => ({
  authClient: {
    organization: {
      getFullOrganization: jest.fn(),
      setActive: jest.fn(),
    },
    getSession: jest.fn(),
  },
}));

// Import after mock to get the mocked version
import { getFolders } from '@/lib/api/folders';

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

describe('folder query key construction', () => {
  it('foldersListOptions() has correct query key', () => {
    const opts = foldersListOptions();
    expect(opts.queryKey).toEqual(['folders', 'list']);
  });

  it('folderKeys.byProvider("p1") has correct shape', () => {
    expect(folderKeys.byProvider('p1')).toEqual(['folders', 'provider', 'p1']);
  });

  it('folderKeys.metadata() has correct shape', () => {
    expect(folderKeys.metadata()).toEqual(['folders', 'metadata']);
  });
});

// ============================================================================
// Loading / Error / Success State Tests
// ============================================================================

describe('useFolders hook states', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows isError=true on API failure', async () => {
    (getFolders as jest.Mock).mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => useFolders(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('returns data on success', async () => {
    const mockResponse = {
      foldersByProvider: {},
      providers: [],
      allFolders: [],
    };
    (getFolders as jest.Mock).mockResolvedValue(mockResponse);
    const { result } = renderHook(() => useFolders(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.providers).toEqual([]);
  });
});

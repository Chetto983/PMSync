/**
 * Tests for use-folder-metadata TanStack Query hook
 *
 * Covers:
 * - Query key construction (no wrapper — pure function calls)
 * - Error state via renderHook + waitFor
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import {
  folderMetadataOptions,
  useFolderMetadata,
} from './use-folder-metadata';
import { getFolderMetadata } from '@/lib/api/folders';

// use-folder-metadata.ts imports @/lib/api/folders which imports @/lib/auth-client (better-auth ESM)
jest.mock('@/lib/api/folders', () => ({
  getFolderMetadata: jest.fn(),
  getFolders: jest.fn(),
  getFoldersByProvider: jest.fn(),
  createFolder: jest.fn(),
  renameFolder: jest.fn(),
  deleteFolder: jest.fn(),
  syncFolders: jest.fn(),
  syncAllFolders: jest.fn(),
}));

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

describe('folder metadata query key construction', () => {
  it('folderMetadataOptions() has correct query key', () => {
    const opts = folderMetadataOptions();
    expect(opts.queryKey).toEqual(['folders', 'metadata']);
  });
});

// ============================================================================
// Loading / Error State Tests
// ============================================================================

describe('useFolderMetadata hook states', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows isError=true on API failure', async () => {
    (getFolderMetadata as jest.Mock).mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => useFolderMetadata(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 });
  });

  it('returns data on success', async () => {
    const mockMetadata = { systemFolders: ['INBOX', 'SENT'], localizedNames: {} };
    (getFolderMetadata as jest.Mock).mockResolvedValue(mockMetadata);
    const { result } = renderHook(() => useFolderMetadata(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual(mockMetadata);
  });
});

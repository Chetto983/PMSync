/**
 * Tests for use-organizations TanStack Query hooks
 *
 * Covers:
 * - Query key construction (no wrapper needed — pure function calls)
 * - useOrganizations fetches from /api/auth/organization/list (global.fetch)
 * - Error state when fetch returns ok:false
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import {
  organizationsOptions,
  organizationDetailOptions,
  pendingInvitationsOptions,
  useOrganizations,
} from './use-organizations';
import { orgKeys } from './organization-keys';

jest.mock('@/lib/auth-client', () => ({
  authClient: {
    organization: {
      getFullOrganization: jest.fn(),
      setActive: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      inviteMember: jest.fn(),
      removeMember: jest.fn(),
      acceptInvitation: jest.fn(),
      rejectInvitation: jest.fn(),
    },
    getSession: jest.fn(),
  },
}));

jest.mock('@/lib/websocket-client', () => ({
  websocketClient: {
    isConnected: jest.fn(() => false),
    onOrganizationUpdated: jest.fn(() => () => {}),
    reconnectForOrgSwitch: jest.fn(),
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

describe('organizations query key construction', () => {
  it('organizationsOptions() has correct query key', () => {
    const opts = organizationsOptions();
    expect(opts.queryKey).toEqual(['organizations', 'list']);
  });

  it('organizationDetailOptions("org-1") has correct query key', () => {
    const opts = organizationDetailOptions('org-1');
    expect(opts.queryKey).toEqual(['organizations', 'detail', 'org-1']);
  });

  it('pendingInvitationsOptions() has correct query key', () => {
    const opts = pendingInvitationsOptions();
    expect(opts.queryKey).toEqual(['organizations', 'invitations']);
  });

  it('orgKeys.list() has correct shape', () => {
    expect(orgKeys.list()).toEqual(['organizations', 'list']);
  });
});

// ============================================================================
// useOrganizations fetch tests
// ============================================================================

describe('useOrganizations hook', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('fetches from /api/auth/organization/list and returns array', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as Response);

    const { result } = renderHook(() => useOrganizations(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/organization/list'),
      expect.any(Object),
    );
  });

  it('shows isError=true when fetch returns ok:false', async () => {
    const failResponse = {
      ok: false,
      status: 401,
      json: async () => ({ message: 'Unauthorized' }),
    } as Response;
    // Mock enough times to cover retries (organizationsOptions has retry:1)
    global.fetch = jest.fn()
      .mockResolvedValue(failResponse);

    const { result } = renderHook(() => useOrganizations(), { wrapper: createWrapper() });
    await waitFor(
      () => expect(result.current.isError).toBe(true),
      { timeout: 5000 },
    );
  });
});

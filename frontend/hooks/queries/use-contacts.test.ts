/**
 * Tests for use-contacts TanStack Query hooks
 *
 * Covers:
 * - Query key construction (no wrapper needed — pure function calls)
 * - Loading/error/success states via renderHook + waitFor
 * - Mutation call verification
 */

import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import {
  contactsListOptions,
  contactsSearchOptions,
  contactDetailOptions,
  useContacts,
  useDeleteContact,
} from './use-contacts';
import { contactsKeys } from './contacts-keys';
import { contactsApi } from '@/lib/api/contacts';

jest.mock('@/lib/api/contacts', () => ({
  contactsApi: {
    listContacts: jest.fn(),
    getContact: jest.fn(),
    createContact: jest.fn(),
    createLocalContact: jest.fn(),
    updateContact: jest.fn(),
    deleteContact: jest.fn(),
    extractContactsFromEmails: jest.fn(),
    importFromVCard: jest.fn(),
    importFromVCardContent: jest.fn(),
    syncProvider: jest.fn(),
    syncAll: jest.fn(),
    toggleVip: jest.fn(),
    listVipContacts: jest.fn(),
    getContactCounts: jest.fn(),
    getContactHistory: jest.fn(),
    getContactPhoto: jest.fn(),
    lookupByEmails: jest.fn(),
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

describe('contacts query key construction', () => {
  it('contactsListOptions() has correct query key', () => {
    const opts = contactsListOptions();
    expect(opts.queryKey).toEqual(['contacts', 'list', {}]);
  });

  it('contactsKeys.search("alice") has correct shape', () => {
    expect(contactsKeys.search('alice')).toEqual(['contacts', 'search', 'alice']);
  });

  it('contactDetailOptions("c1") has correct query key', () => {
    const opts = contactDetailOptions('c1');
    expect(opts.queryKey).toEqual(['contacts', 'detail', 'c1']);
  });

  it('contactsSearchOptions("alice") has correct query key', () => {
    const opts = contactsSearchOptions('alice');
    expect(opts.queryKey).toEqual(['contacts', 'search', 'alice']);
  });
});

// ============================================================================
// Loading / Error / Success State Tests
// ============================================================================

describe('useContacts hook states', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows isError=true on API failure', async () => {
    (contactsApi.listContacts as jest.Mock).mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => useContacts(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('returns data on success', async () => {
    const mockResponse = { contacts: [{ id: 'c1' }], total: 1 };
    (contactsApi.listContacts as jest.Mock).mockResolvedValue(mockResponse);
    const { result } = renderHook(() => useContacts(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.contacts).toHaveLength(1);
  });
});

// ============================================================================
// Mutation Tests
// ============================================================================

describe('useDeleteContact mutation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls contactsApi.deleteContact with correct id', async () => {
    (contactsApi.deleteContact as jest.Mock).mockResolvedValue(undefined);
    const { result } = renderHook(() => useDeleteContact(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.mutateAsync('c1');
    });
    expect(contactsApi.deleteContact).toHaveBeenCalledWith('c1');
  });
});

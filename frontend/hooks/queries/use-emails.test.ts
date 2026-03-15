/**
 * Tests for use-emails TanStack Query hooks
 *
 * Covers:
 * - Query key construction (no wrapper needed — pure function calls)
 * - Loading/error/success states via renderHook + waitFor
 * - Cache invalidation after mutations
 */

import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import {
  emailsListOptions,
  emailDetailOptions,
  emailStatsOptions,
  useEmails,
  useSendEmail,
  useUpdateEmail,
  useBulkAddLabels,
  useBulkRemoveLabels,
} from './use-emails';
import { emailKeys } from './email-keys';
import { labelKeys } from './use-labels';
import { emailsApi } from '@/lib/api/emails';

jest.mock('@/lib/api/emails', () => ({
  emailsApi: {
    listEmails: jest.fn(),
    getEmail: jest.fn(),
    sendEmail: jest.fn(),
    updateEmail: jest.fn(),
    deleteEmail: jest.fn(),
    bulkDelete: jest.fn(),
    bulkMarkRead: jest.fn(),
    bulkMarkImportant: jest.fn(),
    bulkMove: jest.fn(),
    bulkAddLabels: jest.fn(),
    bulkRemoveLabels: jest.fn(),
    getStats: jest.fn(),
    replyToEmail: jest.fn(),
    forwardEmail: jest.fn(),
    saveDraft: jest.fn(),
    deleteDraft: jest.fn(),
    getDraft: jest.fn(),
    getThread: jest.fn(),
    getConversations: jest.fn(),
    searchEmails: jest.fn(),
    respondToCalendarInvite: jest.fn(),
  },
}));

jest.mock('@/lib/context/toast-context', () => ({
  getGlobalToast: jest.fn(() => ({ error: jest.fn(), success: jest.fn() })),
  getGlobalTranslations: jest.fn(() => ({ errors: {} })),
}));

// use-emails.ts imports folderKeys from use-folders.ts, which imports @/lib/api/folders
// which imports @/lib/auth-client (better-auth ESM). Mock both to prevent import failure.
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

jest.mock('@/lib/auth-client', () => ({
  authClient: {
    organization: {
      getFullOrganization: jest.fn(),
      setActive: jest.fn(),
    },
    getSession: jest.fn(),
  },
}));

jest.mock('@/lib/api/providers', () => ({
  providersApi: {
    getProviders: jest.fn(),
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

describe('email query key construction', () => {
  it('emailsListOptions() has correct query key with no params', () => {
    const opts = emailsListOptions();
    expect(opts.queryKey).toEqual(['emails', 'list', {}]);
  });

  it('emailsListOptions({ specialUse: "INBOX" }) has correct query key', () => {
    const opts = emailsListOptions({ specialUse: 'INBOX' });
    expect(opts.queryKey).toEqual(['emails', 'list', { specialUse: 'INBOX' }]);
  });

  it('emailDetailOptions("e1") has correct query key', () => {
    const opts = emailDetailOptions('e1');
    expect(opts.queryKey).toEqual(['emails', 'detail', 'e1']);
  });

  it('emailStatsOptions() has correct query key', () => {
    const opts = emailStatsOptions();
    expect(opts.queryKey).toEqual(['emails', 'stats']);
  });

  it('emailKeys.byFolder("SENT") has correct shape', () => {
    expect(emailKeys.byFolder('SENT')).toEqual(['emails', 'folder', 'SENT']);
  });
});

// ============================================================================
// Loading / Error / Success State Tests
// ============================================================================

describe('useEmails hook states', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows isLoading=true before data arrives', () => {
    (emailsApi.listEmails as jest.Mock).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useEmails(), { wrapper: createWrapper() });
    expect(result.current.isLoading).toBe(true);
  });

  it('shows isError=true on API failure', async () => {
    (emailsApi.listEmails as jest.Mock).mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => useEmails(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('returns data on success', async () => {
    const mockResponse = {
      emails: [{ id: 'e1' }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    };
    (emailsApi.listEmails as jest.Mock).mockResolvedValue(mockResponse);
    const { result } = renderHook(() => useEmails(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.emails).toHaveLength(1);
    expect(result.current.data?.emails[0].id).toBe('e1');
  });
});

// ============================================================================
// Mutation Tests
// ============================================================================

describe('useSendEmail mutation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls emailsApi.sendEmail with correct args', async () => {
    (emailsApi.sendEmail as jest.Mock).mockResolvedValue({ id: 'sent-1' });
    const { result } = renderHook(() => useSendEmail(), { wrapper: createWrapper() });
    const dto = { providerId: 'p1', to: ['a@b.com'], subject: 'Hi', bodyHtml: '<p>Hi</p>' };
    await act(async () => {
      await result.current.mutateAsync(dto);
    });
    expect(emailsApi.sendEmail).toHaveBeenCalledWith(dto);
  });

  it('invalidates queries on success', async () => {
    (emailsApi.sendEmail as jest.Mock).mockResolvedValue({});
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
    });
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);
    const { result } = renderHook(() => useSendEmail(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        providerId: 'p1',
        to: ['a@b.com'],
        subject: 'Hi',
        bodyHtml: '<p>Hi</p>',
      });
    });
    expect(invalidateSpy).toHaveBeenCalled();
  });
});

describe('useUpdateEmail mutation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls emailsApi.updateEmail with correct args', async () => {
    (emailsApi.updateEmail as jest.Mock).mockResolvedValue({ id: 'e1', isRead: true });
    const { result } = renderHook(() => useUpdateEmail(), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.mutateAsync({ emailId: 'e1', dto: { isRead: true } });
    });
    expect(emailsApi.updateEmail).toHaveBeenCalledWith('e1', { isRead: true });
  });
});

describe('bulk label mutations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('invalidates labels list after bulk add labels', async () => {
    (emailsApi.bulkAddLabels as jest.Mock).mockResolvedValue({ updated: 1 });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
    });
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(() => useBulkAddLabels(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ emailIds: ['e1'], labelIds: ['l1'] });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: labelKeys.lists() });
  });

  it('invalidates labels list after bulk remove labels', async () => {
    (emailsApi.bulkRemoveLabels as jest.Mock).mockResolvedValue({ updated: 1 });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
    });
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(() => useBulkRemoveLabels(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ emailIds: ['e1'], labelIds: ['l1'] });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: labelKeys.lists() });
  });
});

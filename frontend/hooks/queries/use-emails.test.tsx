/**
 * Tests for email query hooks
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import {
  useEmails,
  useEmail,
  useEmailStats,
  useEmailThread,
  useEmailSearch,
  useConversations,
  useDraft,
  emailListOptions,
  emailDetailOptions,
  emailStatsOptions,
  emailThreadOptions,
  draftOptions,
} from './use-emails';
import { emailApi } from '@/lib/api/email';

// Mock the email API
jest.mock('@/lib/api/email', () => ({
  emailApi: {
    listEmails: jest.fn(),
    getEmail: jest.fn(),
    getStats: jest.fn(),
    getThread: jest.fn(),
    searchEmails: jest.fn(),
    getConversations: jest.fn(),
    getDraft: jest.fn(),
    getSyncStatus: jest.fn(),
    getRetentionStats: jest.fn(),
  },
}));

// Create a wrapper with QueryClientProvider
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
  function TestQueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return TestQueryWrapper;
}

describe('Query Options', () => {
  describe('emailListOptions', () => {
    it('should create options with correct query key', () => {
      const options = emailListOptions({ folder: 'INBOX', page: 1 });
      expect(options.queryKey).toEqual(['emails', 'list', { folder: 'INBOX', page: 1 }]);
    });

    it('should create options with empty params', () => {
      const options = emailListOptions();
      expect(options.queryKey).toEqual(['emails', 'list', {}]);
    });

    it('should have correct staleTime', () => {
      const options = emailListOptions();
      expect(options.staleTime).toBe(60 * 1000);
    });
  });

  describe('emailDetailOptions', () => {
    it('should create options with id', () => {
      const options = emailDetailOptions('email-123');
      expect(options.queryKey).toEqual(['emails', 'detail', 'email-123']);
      expect(options.enabled).toBe(true);
    });

    it('should be disabled when id is empty', () => {
      const options = emailDetailOptions('');
      expect(options.enabled).toBe(false);
    });
  });

  describe('emailStatsOptions', () => {
    it('should create options without provider', () => {
      const options = emailStatsOptions();
      expect(options.queryKey).toEqual(['emails', 'stats', 'all']);
    });

    it('should create options with provider', () => {
      const options = emailStatsOptions('provider-1');
      expect(options.queryKey).toEqual(['emails', 'stats', 'provider-1']);
    });
  });

  describe('emailThreadOptions', () => {
    it('should create options with thread id', () => {
      const options = emailThreadOptions('thread-123');
      expect(options.queryKey).toEqual(['emails', 'thread', 'thread-123']);
      expect(options.enabled).toBe(true);
    });

    it('should be disabled when threadId is empty', () => {
      const options = emailThreadOptions('');
      expect(options.enabled).toBe(false);
    });
  });

  describe('draftOptions', () => {
    it('should create options with draft id', () => {
      const options = draftOptions('draft-123');
      expect(options.queryKey).toEqual(['emails', 'drafts', 'draft-123']);
      expect(options.staleTime).toBe(0);
    });
  });
});

describe('useEmails', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch emails successfully', async () => {
    const mockData = {
      emails: [
        { id: '1', subject: 'Test Email 1', from: 'john@test.com' },
        { id: '2', subject: 'Test Email 2', from: 'jane@test.com' },
      ],
      pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
    };

    (emailApi.listEmails as jest.Mock).mockResolvedValueOnce({ data: mockData });

    const { result } = renderHook(() => useEmails({ folder: 'INBOX' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockData);
    expect(emailApi.listEmails).toHaveBeenCalledWith({ folder: 'INBOX' });
  });

  it('should handle error', async () => {
    const mockError = new Error('Network error');
    (emailApi.listEmails as jest.Mock).mockRejectedValueOnce(mockError);

    const { result } = renderHook(() => useEmails(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeDefined();
  });

  it('should show pending state initially', () => {
    (emailApi.listEmails as jest.Mock).mockImplementationOnce(
      () => new Promise(() => {}) // Never resolves
    );

    const { result } = renderHook(() => useEmails(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isPending).toBe(true);
  });
});

describe('useEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch single email', async () => {
    const mockEmail = {
      id: 'email-123',
      subject: 'Test Email',
      from: 'john@test.com',
      body: 'Hello',
    };

    (emailApi.getEmail as jest.Mock).mockResolvedValueOnce({ data: mockEmail });

    const { result } = renderHook(() => useEmail('email-123'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockEmail);
    expect(emailApi.getEmail).toHaveBeenCalledWith('email-123');
  });

  it('should not fetch when id is empty', () => {
    const { result } = renderHook(() => useEmail(''), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(emailApi.getEmail).not.toHaveBeenCalled();
  });
});

describe('useEmailStats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch stats', async () => {
    const mockStats = {
      total: 100,
      unread: 10,
      starred: 5,
      byFolder: { INBOX: 80, SENT: 20 },
    };

    (emailApi.getStats as jest.Mock).mockResolvedValueOnce({ data: mockStats });

    const { result } = renderHook(() => useEmailStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockStats);
  });

  it('should fetch stats for specific provider', async () => {
    const mockStats = { total: 50, unread: 5, starred: 2, byFolder: {} };
    (emailApi.getStats as jest.Mock).mockResolvedValueOnce({ data: mockStats });

    const { result } = renderHook(() => useEmailStats('provider-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(emailApi.getStats).toHaveBeenCalledWith('provider-1');
  });
});

describe('useEmailThread', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch thread emails', async () => {
    const mockEmails = [
      { id: '1', subject: 'Re: Hello', threadId: 'thread-1' },
      { id: '2', subject: 'Hello', threadId: 'thread-1' },
    ];

    (emailApi.getThread as jest.Mock).mockResolvedValueOnce({ data: mockEmails });

    const { result } = renderHook(() => useEmailThread('thread-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockEmails);
    expect(emailApi.getThread).toHaveBeenCalledWith('thread-1');
  });
});

describe('useEmailSearch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should search emails', async () => {
    const mockResults = { emails: [{ id: '1', subject: 'Matching email' }] };
    (emailApi.searchEmails as jest.Mock).mockResolvedValueOnce({ data: mockResults });

    const { result } = renderHook(() => useEmailSearch('from:john'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockResults);
    expect(emailApi.searchEmails).toHaveBeenCalledWith('from:john', undefined, undefined);
  });

  it('should not search with less than 2 characters', () => {
    const { result } = renderHook(() => useEmailSearch('a'), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(emailApi.searchEmails).not.toHaveBeenCalled();
  });

  it('should search with provider and limit', async () => {
    const mockResults = { emails: [] };
    (emailApi.searchEmails as jest.Mock).mockResolvedValueOnce({ data: mockResults });

    const { result } = renderHook(() => useEmailSearch('test', 'provider-1', 10), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(emailApi.searchEmails).toHaveBeenCalledWith('test', 'provider-1', 10);
  });
});

describe('useConversations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch conversations', async () => {
    const mockData = {
      conversations: [
        { threadId: 't1', subject: 'Thread 1', emailCount: 3 },
        { threadId: 't2', subject: 'Thread 2', emailCount: 1 },
      ],
      pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
    };

    (emailApi.getConversations as jest.Mock).mockResolvedValueOnce({ data: mockData });

    const { result } = renderHook(() => useConversations({ folder: 'INBOX' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockData);
    expect(emailApi.getConversations).toHaveBeenCalledWith({ folder: 'INBOX' });
  });
});

describe('useDraft', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch draft', async () => {
    const mockDraft = {
      id: 'draft-123',
      subject: 'Draft email',
      bodyHtml: '<p>Content</p>',
    };

    (emailApi.getDraft as jest.Mock).mockResolvedValueOnce({ data: mockDraft });

    const { result } = renderHook(() => useDraft('draft-123'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockDraft);
    expect(emailApi.getDraft).toHaveBeenCalledWith('draft-123');
  });
});

import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useEmailActions } from './use-email-actions';
import { useEmailStore } from '@/stores/email-store';
import { emailApi } from '@/lib/api/email';

// Mock the email API
jest.mock('@/lib/api/email', () => ({
  emailApi: {
    deleteEmail: jest.fn(),
    bulkDelete: jest.fn(),
    bulkMarkRead: jest.fn(),
    bulkMoveToFolder: jest.fn(),
    bulkStar: jest.fn(),
    bulkFlag: jest.fn(),
    updateEmail: jest.fn(),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

  function TestQueryWrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }

  return TestQueryWrapper;
}

// Mock next/router is already in jest.setup.ts

describe('useEmailActions', () => {
  const mockEmail = {
    id: 'email-1',
    providerId: 'provider-1',
    externalId: 'ext-1',
    from: 'sender@example.com',
    subject: 'Test Email',
    receivedAt: '2024-01-01T12:00:00Z',
    isRead: false,
    folder: 'INBOX',
  };

  const mockEmail2 = {
    id: 'email-2',
    providerId: 'provider-1',
    externalId: 'ext-2',
    from: 'sender2@example.com',
    subject: 'Test Email 2',
    receivedAt: '2024-01-01T13:00:00Z',
    isRead: true,
    folder: 'INBOX',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the store
    useEmailStore.setState({
      emails: [mockEmail, mockEmail2],
      unreadCount: 1,
      selectedEmail: null,
      isLoading: false,
      filters: {},
      searchQuery: '',
      pagination: { page: 1, pageSize: 50, total: 2, hasMore: false },
      selectedIds: new Set(),
      threads: new Map(),
    });
  });

  describe('handleDelete', () => {
    it('should delete email optimistically and call API', async () => {
      (emailApi.deleteEmail as jest.Mock).mockResolvedValueOnce({});

      const onSuccess = jest.fn();
      const { result } = renderHook(() => useEmailActions({ onSuccess }), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.handleDelete('email-1');
      });

      // Check email was deleted from store
      expect(useEmailStore.getState().emails).toHaveLength(1);
      expect(useEmailStore.getState().emails[0].id).toBe('email-2');

      // Check API was called
      expect(emailApi.deleteEmail).toHaveBeenCalledWith('email-1');

      // Check success callback
      expect(onSuccess).toHaveBeenCalledWith('Email deleted successfully ✓');
    });

    it('should rollback on API failure', async () => {
      (emailApi.deleteEmail as jest.Mock).mockRejectedValueOnce(new Error('API Error'));

      const onError = jest.fn();
      const { result } = renderHook(() => useEmailActions({ onError }), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.handleDelete('email-1');
      });

      // Check email was restored (rollback)
      await waitFor(() => {
        expect(useEmailStore.getState().emails).toHaveLength(2);
      });

      // Check error callback
      expect(onError).toHaveBeenCalledWith('Failed to delete email. Please try again.');
    });
  });

  describe('handleBulkDelete', () => {
    it('should delete multiple emails optimistically', async () => {
      (emailApi.bulkDelete as jest.Mock).mockResolvedValueOnce({});

      const onSuccess = jest.fn();
      const { result } = renderHook(() => useEmailActions({ onSuccess }), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.handleBulkDelete(['email-1', 'email-2']);
      });

      // Check emails were deleted
      expect(useEmailStore.getState().emails).toHaveLength(0);

      // Check API was called
      expect(emailApi.bulkDelete).toHaveBeenCalledWith(['email-1', 'email-2']);

      // Check success callback
      expect(onSuccess).toHaveBeenCalledWith('2 emails deleted successfully ✓');
    });

    it('should rollback all emails on API failure', async () => {
      (emailApi.bulkDelete as jest.Mock).mockRejectedValueOnce(new Error('API Error'));

      const onError = jest.fn();
      const { result } = renderHook(() => useEmailActions({ onError }), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.handleBulkDelete(['email-1', 'email-2']);
      });

      // Check emails were restored (rollback)
      await waitFor(() => {
        expect(useEmailStore.getState().emails).toHaveLength(2);
      });

      expect(onError).toHaveBeenCalledWith('Failed to delete emails. Please try again.');
    });
  });

  describe('handleMarkAsRead', () => {
    it('should mark emails as read optimistically', async () => {
      (emailApi.bulkMarkRead as jest.Mock).mockResolvedValueOnce({});

      const onSuccess = jest.fn();
      const { result } = renderHook(() => useEmailActions({ onSuccess }), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.handleMarkAsRead(['email-1'], true);
      });

      // Check email was marked as read
      expect(useEmailStore.getState().emails.find(e => e.id === 'email-1')?.isRead).toBe(true);

      // Check API was called
      expect(emailApi.bulkMarkRead).toHaveBeenCalledWith(['email-1'], true);

      expect(onSuccess).toHaveBeenCalledWith('Marked as read ✓');
    });

    it('should rollback read status on API failure', async () => {
      (emailApi.bulkMarkRead as jest.Mock).mockRejectedValueOnce(new Error('API Error'));

      const onError = jest.fn();
      const { result } = renderHook(() => useEmailActions({ onError }), {
        wrapper: createWrapper(),
      });

      // Email-1 starts as unread
      expect(useEmailStore.getState().emails.find(e => e.id === 'email-1')?.isRead).toBe(false);

      await act(async () => {
        await result.current.handleMarkAsRead(['email-1'], true);
      });

      // Check email was rolled back to unread
      await waitFor(() => {
        expect(useEmailStore.getState().emails.find(e => e.id === 'email-1')?.isRead).toBe(false);
      });

      expect(onError).toHaveBeenCalledWith('Failed to update email status. Please try again.');
    });
  });

  describe('handleArchive', () => {
    it('should move emails to archive optimistically', async () => {
      (emailApi.bulkMoveToFolder as jest.Mock).mockResolvedValueOnce({});

      const onSuccess = jest.fn();
      const { result } = renderHook(() => useEmailActions({ onSuccess }), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.handleArchive(['email-1']);
      });

      // Check email was moved to archive
      expect(useEmailStore.getState().emails.find(e => e.id === 'email-1')?.folder).toBe('ARCHIVE');

      // Check API was called
      expect(emailApi.bulkMoveToFolder).toHaveBeenCalledWith(['email-1'], 'ARCHIVE');

      expect(onSuccess).toHaveBeenCalledWith('1 email archived ✓');
    });

    it('should rollback folder on API failure', async () => {
      (emailApi.bulkMoveToFolder as jest.Mock).mockRejectedValueOnce(new Error('API Error'));

      const onError = jest.fn();
      const { result } = renderHook(() => useEmailActions({ onError }), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.handleArchive(['email-1']);
      });

      // Check email was rolled back to original folder
      await waitFor(() => {
        expect(useEmailStore.getState().emails.find(e => e.id === 'email-1')?.folder).toBe('INBOX');
      });

      expect(onError).toHaveBeenCalledWith('Failed to archive emails. Please try again.');
    });
  });

  describe('handleMoveToFolder', () => {
    it('should move emails to folder optimistically', async () => {
      (emailApi.bulkMoveToFolder as jest.Mock).mockResolvedValueOnce({});

      const onSuccess = jest.fn();
      const { result } = renderHook(() => useEmailActions({ onSuccess }), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.handleMoveToFolder(['email-1', 'email-2'], 'TRASH');
      });

      // Check emails were moved
      expect(useEmailStore.getState().emails.find(e => e.id === 'email-1')?.folder).toBe('TRASH');
      expect(useEmailStore.getState().emails.find(e => e.id === 'email-2')?.folder).toBe('TRASH');

      expect(emailApi.bulkMoveToFolder).toHaveBeenCalledWith(['email-1', 'email-2'], 'TRASH');
      expect(onSuccess).toHaveBeenCalledWith('2 emails moved ✓');
    });

    it('should rollback all folders on API failure', async () => {
      (emailApi.bulkMoveToFolder as jest.Mock).mockRejectedValueOnce(new Error('API Error'));

      const onError = jest.fn();
      const { result } = renderHook(() => useEmailActions({ onError }), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.handleMoveToFolder(['email-1', 'email-2'], 'TRASH');
      });

      // Check emails were rolled back to original folders
      await waitFor(() => {
        expect(useEmailStore.getState().emails.find(e => e.id === 'email-1')?.folder).toBe('INBOX');
        expect(useEmailStore.getState().emails.find(e => e.id === 'email-2')?.folder).toBe('INBOX');
      });

      expect(onError).toHaveBeenCalledWith('Failed to move emails. Please try again.');
    });
  });

  describe('handleToggleRead', () => {
    it('should toggle read status with rollback on failure', async () => {
      (emailApi.updateEmail as jest.Mock).mockRejectedValueOnce(new Error('API Error'));

      const onError = jest.fn();
      const { result } = renderHook(() => useEmailActions({ onError }), {
        wrapper: createWrapper(),
      });

      // Email-1 starts as unread (false)
      expect(useEmailStore.getState().emails.find(e => e.id === 'email-1')?.isRead).toBe(false);

      await act(async () => {
        await result.current.handleToggleRead('email-1', false);
      });

      // Should be rolled back to original state
      await waitFor(() => {
        expect(useEmailStore.getState().emails.find(e => e.id === 'email-1')?.isRead).toBe(false);
      });

      expect(onError).toHaveBeenCalledWith('Failed to update read status. Please try again.');
    });
  });

  describe('handleToggleStar', () => {
    it('should toggle star status with rollback on failure', async () => {
      (emailApi.bulkStar as jest.Mock).mockRejectedValueOnce(new Error('API Error'));

      const onError = jest.fn();
      const { result } = renderHook(() => useEmailActions({ onError }), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.handleToggleStar('email-1', false);
      });

      // Should be rolled back
      await waitFor(() => {
        expect(useEmailStore.getState().emails.find(e => e.id === 'email-1')?.isStarred).toBeFalsy();
      });

      expect(onError).toHaveBeenCalledWith('Failed to update star status. Please try again.');
    });
  });
});

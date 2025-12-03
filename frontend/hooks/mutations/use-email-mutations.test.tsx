/**
 * Tests for email mutation hooks
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import {
  useUpdateEmail,
  useDeleteEmail,
  useBulkMarkRead,
  useBulkStar,
  useBulkFlag,
  useBulkMoveToFolder,
  useBulkDelete,
  useBulkAddLabels,
  useBulkRemoveLabels,
  useSendEmail,
  useReplyEmail,
  useForwardEmail,
  useSaveDraft,
  useDeleteDraft,
  useSyncProvider,
} from './use-email-mutations';
import { emailApi } from '@/lib/api/email';

// Mock the email API
jest.mock('@/lib/api/email', () => ({
  emailApi: {
    updateEmail: jest.fn(),
    deleteEmail: jest.fn(),
    bulkMarkRead: jest.fn(),
    bulkStar: jest.fn(),
    bulkFlag: jest.fn(),
    bulkMoveToFolder: jest.fn(),
    bulkDelete: jest.fn(),
    bulkAddLabels: jest.fn(),
    bulkRemoveLabels: jest.fn(),
    sendEmail: jest.fn(),
    replyToEmail: jest.fn(),
    forwardEmail: jest.fn(),
    saveDraft: jest.fn(),
    deleteDraft: jest.fn(),
    syncProvider: jest.fn(),
    fetchArchivedEmail: jest.fn(),
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
      mutations: {
        retry: false,
      },
    },
  });
  function TestQueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return TestQueryWrapper;
}

describe('useUpdateEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should update email successfully', async () => {
    const mockEmail = { id: 'email-1', isRead: true };
    (emailApi.updateEmail as jest.Mock).mockResolvedValueOnce({ data: mockEmail });

    const onSuccess = jest.fn();
    const { result } = renderHook(() => useUpdateEmail({ onSuccess }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ emailId: 'email-1', data: { isRead: true } });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(emailApi.updateEmail).toHaveBeenCalledWith('email-1', { isRead: true });
    expect(onSuccess).toHaveBeenCalledWith('Email marked as read');
  });

  it('should handle unread update', async () => {
    (emailApi.updateEmail as jest.Mock).mockResolvedValueOnce({ data: {} });

    const onSuccess = jest.fn();
    const { result } = renderHook(() => useUpdateEmail({ onSuccess }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ emailId: 'email-1', data: { isRead: false } });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(onSuccess).toHaveBeenCalledWith('Email marked as unread');
  });

  it('should handle star update', async () => {
    (emailApi.updateEmail as jest.Mock).mockResolvedValueOnce({ data: {} });

    const onSuccess = jest.fn();
    const { result } = renderHook(() => useUpdateEmail({ onSuccess }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ emailId: 'email-1', data: { isStarred: true } });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(onSuccess).toHaveBeenCalledWith('Email starred');
  });

  it('should handle error', async () => {
    (emailApi.updateEmail as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    const onError = jest.fn();
    const { result } = renderHook(() => useUpdateEmail({ onError }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ emailId: 'email-1', data: { isRead: true } });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(onError).toHaveBeenCalledWith('Failed to update email. Please try again.');
  });
});

describe('useDeleteEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should delete email successfully', async () => {
    (emailApi.deleteEmail as jest.Mock).mockResolvedValueOnce({});

    const onSuccess = jest.fn();
    const { result } = renderHook(() => useDeleteEmail({ onSuccess }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate('email-1');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(emailApi.deleteEmail).toHaveBeenCalledWith('email-1');
    expect(onSuccess).toHaveBeenCalledWith('Email deleted');
  });

  it('should handle delete error', async () => {
    (emailApi.deleteEmail as jest.Mock).mockRejectedValueOnce(new Error('Delete failed'));

    const onError = jest.fn();
    const { result } = renderHook(() => useDeleteEmail({ onError }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate('email-1');
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(onError).toHaveBeenCalledWith('Failed to delete email. Please try again.');
  });
});

describe('useBulkMarkRead', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should mark multiple emails as read', async () => {
    (emailApi.bulkMarkRead as jest.Mock).mockResolvedValueOnce({ data: { updated: 3 } });

    const onSuccess = jest.fn();
    const { result } = renderHook(() => useBulkMarkRead({ onSuccess }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ emailIds: ['1', '2', '3'], isRead: true });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(emailApi.bulkMarkRead).toHaveBeenCalledWith(['1', '2', '3'], true);
    expect(onSuccess).toHaveBeenCalledWith('3 emails marked as read');
  });

  it('should mark single email as unread', async () => {
    (emailApi.bulkMarkRead as jest.Mock).mockResolvedValueOnce({ data: { updated: 1 } });

    const onSuccess = jest.fn();
    const { result } = renderHook(() => useBulkMarkRead({ onSuccess }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ emailIds: ['1'], isRead: false });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(onSuccess).toHaveBeenCalledWith('1 email marked as unread');
  });
});

describe('useBulkStar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should star multiple emails', async () => {
    (emailApi.bulkStar as jest.Mock).mockResolvedValueOnce({ data: { updated: 2 } });

    const onSuccess = jest.fn();
    const { result } = renderHook(() => useBulkStar({ onSuccess }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ emailIds: ['1', '2'], isStarred: true });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(emailApi.bulkStar).toHaveBeenCalledWith(['1', '2'], true);
    expect(onSuccess).toHaveBeenCalledWith('2 emails starred');
  });
});

describe('useBulkFlag', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should flag multiple emails as important', async () => {
    (emailApi.bulkFlag as jest.Mock).mockResolvedValueOnce({ data: { updated: 2 } });

    const onSuccess = jest.fn();
    const { result } = renderHook(() => useBulkFlag({ onSuccess }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ emailIds: ['1', '2'], isFlagged: true });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(onSuccess).toHaveBeenCalledWith('2 emails marked as important');
  });
});

describe('useBulkMoveToFolder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should move emails to folder', async () => {
    (emailApi.bulkMoveToFolder as jest.Mock).mockResolvedValueOnce({ data: { updated: 3 } });

    const onSuccess = jest.fn();
    const { result } = renderHook(() => useBulkMoveToFolder({ onSuccess }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ emailIds: ['1', '2', '3'], folder: 'ARCHIVE' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(emailApi.bulkMoveToFolder).toHaveBeenCalledWith(['1', '2', '3'], 'ARCHIVE');
    expect(onSuccess).toHaveBeenCalledWith('3 emails moved');
  });
});

describe('useBulkDelete', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should delete multiple emails', async () => {
    (emailApi.bulkDelete as jest.Mock).mockResolvedValueOnce({ data: { deleted: 2 } });

    const onSuccess = jest.fn();
    const { result } = renderHook(() => useBulkDelete({ onSuccess }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate(['1', '2']);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(emailApi.bulkDelete).toHaveBeenCalledWith(['1', '2']);
    expect(onSuccess).toHaveBeenCalledWith('2 emails deleted');
  });
});

describe('useBulkAddLabels', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should add labels to emails', async () => {
    (emailApi.bulkAddLabels as jest.Mock).mockResolvedValueOnce({ data: { updated: 2 } });

    const onSuccess = jest.fn();
    const { result } = renderHook(() => useBulkAddLabels({ onSuccess }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ emailIds: ['1', '2'], labelIds: ['label-1'] });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(emailApi.bulkAddLabels).toHaveBeenCalledWith(['1', '2'], ['label-1']);
    expect(onSuccess).toHaveBeenCalledWith('Labels added to 2 emails');
  });
});

describe('useBulkRemoveLabels', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should remove labels from emails', async () => {
    (emailApi.bulkRemoveLabels as jest.Mock).mockResolvedValueOnce({ data: { updated: 2 } });

    const onSuccess = jest.fn();
    const { result } = renderHook(() => useBulkRemoveLabels({ onSuccess }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ emailIds: ['1', '2'], labelIds: ['label-1'] });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(emailApi.bulkRemoveLabels).toHaveBeenCalledWith(['1', '2'], ['label-1']);
    expect(onSuccess).toHaveBeenCalledWith('Labels removed from 2 emails');
  });
});

describe('useSendEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should send email successfully', async () => {
    (emailApi.sendEmail as jest.Mock).mockResolvedValueOnce({
      data: { success: true, messageId: 'msg-123' },
    });

    const onSuccess = jest.fn();
    const { result } = renderHook(() => useSendEmail({ onSuccess }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        providerId: 'provider-1',
        to: ['test@example.com'],
        subject: 'Test',
        bodyHtml: '<p>Hello</p>',
        bodyText: 'Hello',
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(onSuccess).toHaveBeenCalledWith('Email sent successfully');
  });

  it('should handle send error', async () => {
    (emailApi.sendEmail as jest.Mock).mockRejectedValueOnce(new Error('Send failed'));

    const onError = jest.fn();
    const { result } = renderHook(() => useSendEmail({ onError }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        providerId: 'provider-1',
        to: ['test@example.com'],
        subject: 'Test',
        bodyHtml: '<p>Hello</p>',
        bodyText: 'Hello',
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(onError).toHaveBeenCalledWith('Failed to send email. Please try again.');
  });
});

describe('useReplyEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should reply to email successfully', async () => {
    (emailApi.replyToEmail as jest.Mock).mockResolvedValueOnce({
      data: { success: true, messageId: 'msg-reply' },
    });

    const onSuccess = jest.fn();
    const { result } = renderHook(() => useReplyEmail({ onSuccess }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        emailId: 'email-1',
        payload: {
          to: ['test@example.com'],
          subject: 'Re: Test',
          bodyHtml: '<p>Reply</p>',
          bodyText: 'Reply',
        },
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(emailApi.replyToEmail).toHaveBeenCalledWith('email-1', expect.any(Object));
    expect(onSuccess).toHaveBeenCalledWith('Reply sent successfully');
  });
});

describe('useForwardEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should forward email successfully', async () => {
    (emailApi.forwardEmail as jest.Mock).mockResolvedValueOnce({
      data: { success: true, messageId: 'msg-fwd' },
    });

    const onSuccess = jest.fn();
    const { result } = renderHook(() => useForwardEmail({ onSuccess }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        emailId: 'email-1',
        payload: {
          to: ['forward@example.com'],
          subject: 'Fwd: Test',
          bodyHtml: '<p>Forwarded</p>',
          bodyText: 'Forwarded',
        },
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(emailApi.forwardEmail).toHaveBeenCalledWith('email-1', expect.any(Object));
    expect(onSuccess).toHaveBeenCalledWith('Email forwarded successfully');
  });
});

describe('useSaveDraft', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should save draft successfully', async () => {
    const mockDraft = { id: 'draft-123', subject: 'Draft' };
    (emailApi.saveDraft as jest.Mock).mockResolvedValueOnce({ data: mockDraft });

    const onSuccess = jest.fn();
    const { result } = renderHook(() => useSaveDraft({ onSuccess }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        providerId: 'provider-1',
        subject: 'Draft',
        bodyHtml: '<p>Draft content</p>',
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(onSuccess).toHaveBeenCalledWith('Draft saved');
  });
});

describe('useDeleteDraft', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should delete draft successfully', async () => {
    (emailApi.deleteDraft as jest.Mock).mockResolvedValueOnce({});

    const onSuccess = jest.fn();
    const { result } = renderHook(() => useDeleteDraft({ onSuccess }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate('draft-123');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(emailApi.deleteDraft).toHaveBeenCalledWith('draft-123');
    expect(onSuccess).toHaveBeenCalledWith('Draft deleted');
  });
});

describe('useSyncProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should trigger sync successfully', async () => {
    (emailApi.syncProvider as jest.Mock).mockResolvedValueOnce({
      data: { success: true, message: 'Sync started' },
    });

    const onSuccess = jest.fn();
    const { result } = renderHook(() => useSyncProvider({ onSuccess }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate('provider-1');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(emailApi.syncProvider).toHaveBeenCalledWith('provider-1');
    expect(onSuccess).toHaveBeenCalledWith('Sync started');
  });
});

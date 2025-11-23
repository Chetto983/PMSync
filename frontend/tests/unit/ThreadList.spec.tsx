import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThreadList } from '@/components/email/ThreadList';
import { useEmailStore } from '@/stores/email-store';
import { useLabelStore } from '@/stores/label-store';
import { ThreadListItem as MockThreadListItem } from '@/components/email/ThreadListItem';

jest.mock('@/stores/email-store');
jest.mock('@/stores/label-store');
jest.mock('@/components/email/ThreadListItem', () => {
  const mock = jest.fn(() => null);
  return { ThreadListItem: mock, default: mock };
});
jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    common: { allCaughtUp: 'All caught up!' },
    dashboard: {
      email: { attachment: 'Attachment' },
    },
  }),
}));

describe('ThreadList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useLabelStore as unknown as jest.Mock).mockReturnValue({
      getLabelById: jest.fn(),
    });
  });

  it('renders email count badge for threads with multiple emails', () => {
    const mockEmailStore = {
      getThreadEmails: jest.fn().mockReturnValue([
        { id: 'email-1', receivedAt: '2025-01-01T00:00:00Z' },
        { id: 'email-2', receivedAt: '2025-01-02T00:00:00Z' },
      ]),
    };
    (useEmailStore as unknown as jest.Mock).mockReturnValue(mockEmailStore);

    render(
      <ThreadList
        threads={[
          {
            id: 'email-1',
            providerId: 'provider-1',
            threadId: 'thread-1',
            from: 'John Doe <john@example.com>',
            subject: 'Subject',
            bodyPreview: 'Preview',
            receivedAt: '2025-01-02T00:00:00Z',
            isRead: true,
            isStarred: false,
            isImportant: false,
          },
        ]}
      />
    );

    const callArgs = (MockThreadListItem as jest.Mock).mock.calls[0]?.[0];
    expect(callArgs.thread.emailCount).toBe(2);
    expect(mockEmailStore.getThreadEmails).toHaveBeenCalledWith('thread-1');
  });

  it('updates count badge when store data changes', () => {
    let storeRef = {
      getThreadEmails: jest.fn().mockReturnValue([{ id: 'email-1', receivedAt: '2025-01-01T00:00:00Z' }]),
    };
    (useEmailStore as unknown as jest.Mock).mockImplementation(() => storeRef);

    const thread = {
      id: 'email-1',
      providerId: 'provider-1',
      threadId: 'thread-1',
      from: 'John Doe <john@example.com>',
      subject: 'Subject',
      bodyPreview: 'Preview',
      receivedAt: '2025-01-02T00:00:00Z',
      isRead: true,
      isStarred: false,
      isImportant: false,
    };

    const { rerender, queryByText, getByText } = render(<ThreadList threads={[thread]} />);
    expect(queryByText('2')).toBeNull();

    storeRef = {
      getThreadEmails: jest.fn().mockReturnValue([
        { id: 'email-1', receivedAt: '2025-01-01T00:00:00Z' },
        { id: 'email-2', receivedAt: '2025-01-02T00:00:00Z' },
      ]),
    };
    const nextThread = { ...thread }; // new reference to trigger useMemo deps
    rerender(<ThreadList threads={[nextThread]} />);

    const lastCallArgs = (MockThreadListItem as jest.Mock).mock.calls.pop()?.[0];
    expect(lastCallArgs.thread.emailCount).toBe(2);
    expect(storeRef.getThreadEmails).toHaveBeenCalledWith('thread-1');
  });
});

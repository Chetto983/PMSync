import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThreadListItem } from '@/components/email/ThreadListItem';

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    dashboard: { email: { attachment: 'Attachment' } },
  }),
}));

describe('ThreadListItem labels rendering', () => {
  it('renders emailLabels relationship', () => {
    render(
      <ThreadListItem
        thread={{
          id: 'email-1',
          providerId: 'provider-1',
          from: 'John <john@example.com>',
          subject: 'Hello',
          bodyPreview: 'Preview',
          receivedAt: '2025-01-01T00:00:00Z',
          isRead: true,
          isStarred: false,
          isImportant: false,
          emailLabels: [{ label: { id: 'label-1', name: 'Work', color: null } }],
        }}
      />
    );

    expect(screen.getByText('Work')).toBeInTheDocument();
  });
});

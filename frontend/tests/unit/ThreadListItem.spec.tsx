import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThreadListItem } from '@/components/email/ThreadListItem';
import { useLabelStore } from '@/stores/label-store';

jest.mock('@/stores/label-store');
jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    dashboard: { email: { attachment: 'Attachment' } },
  }),
}));

describe('ThreadListItem labels rendering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('prefers emailLabels relationship when present', () => {
    (useLabelStore as unknown as jest.Mock).mockReturnValue({
      getLabelById: jest.fn(),
    });

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
          emailLabels: [{ label: { id: 'label-1', name: 'Rel', color: null } }],
        }}
      />
    );

    expect(screen.getByText('Rel')).toBeInTheDocument();
  });

  it('falls back to label IDs when emailLabels missing', () => {
    (useLabelStore as unknown as jest.Mock).mockReturnValue({
      getLabelById: (id: string) => ({ id, name: 'BackCompat', color: null }),
    });

    render(
      <ThreadListItem
        thread={{
          id: 'email-2',
          providerId: 'provider-1',
          from: 'John <john@example.com>',
          subject: 'Hello',
          bodyPreview: 'Preview',
          receivedAt: '2025-01-01T00:00:00Z',
          isRead: true,
          isStarred: false,
          isImportant: false,
          labels: ['legacy-id'],
        }}
      />
    );

    expect(screen.getByText('BackCompat')).toBeInTheDocument();
  });
});

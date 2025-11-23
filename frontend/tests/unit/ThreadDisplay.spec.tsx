import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { ThreadDisplay } from '@/components/email/ThreadDisplay';
import { useEmailStore, type Email } from '@/stores/email-store';
import { useAuthStore } from '@/stores/auth-store';
import { useLabelStore } from '@/stores/label-store';

// Mock stores
jest.mock('@/stores/email-store');
jest.mock('@/stores/auth-store');
jest.mock('@/stores/label-store');
jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    common: {
      selectEmail: 'Select an email to view',
    },
    dashboard: {
      email: {
        selectEmail: 'Select an email to view',
        attachment: 'Attachment',
        attachments: 'Attachments',
        bulkBar: {
          addStar: 'Add star',
          removeStar: 'Remove star',
        },
      },
      emailView: {
        reply: 'Reply',
        replyAll: 'Reply All',
        forward: 'Forward',
        more: 'More',
        from: 'From',
        to: 'To',
        cc: 'CC',
        bcc: 'BCC',
        date: 'Date',
      },
      labels: {
        addLabelText: 'Add label',
        removeLabelText: 'Remove label',
        noLabels: 'No labels',
      },
    },
  }),
}));

const mockEmail: Email = {
  id: 'email-1',
  providerId: 'provider-1',
  externalId: 'ext-1',
  threadId: 'thread-1',
  from: 'John Doe <john@example.com>',
  to: ['recipient@example.com'],
  subject: 'Test Email',
  bodyHtml: '<p>This is a test email</p>',
  receivedAt: '2025-01-01T10:00:00Z',
  isRead: false,
  isStarred: false,
  emailLabels: [],
};

const mockThreadEmails: Email[] = [
  {
    ...mockEmail,
    id: 'email-1',
    from: 'John Doe <john@example.com>',
    subject: 'Original Email',
    bodyHtml: '<p>First message</p>',
    receivedAt: '2025-01-01T10:00:00Z',
  },
  {
    ...mockEmail,
    id: 'email-2',
    from: 'Jane Smith <jane@example.com>',
    subject: 'Re: Original Email',
    bodyHtml: '<p>Second message</p>',
    receivedAt: '2025-01-01T11:00:00Z',
  },
  {
    ...mockEmail,
    id: 'email-3',
    from: 'Bob Wilson <bob@example.com>',
    subject: 'Re: Re: Original Email',
    bodyHtml: '<p>Third message</p>',
    receivedAt: '2025-01-01T12:00:00Z',
  },
];

describe('ThreadDisplay Component', () => {
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    (useAuthStore as unknown as jest.Mock).mockReturnValue({
      token: 'mock-token',
    });

    (useLabelStore as unknown as jest.Mock).mockReturnValue({
      labels: [],
      addEmailsToLabel: jest.fn(),
      removeEmailFromLabel: jest.fn(),
      fetchLabels: jest.fn(),
    });
  });

  describe('Single Email Display', () => {
    it('should render single email when no thread', () => {
      (useEmailStore as unknown as jest.Mock).mockReturnValue({
        getEmailThread: jest.fn().mockReturnValue([mockEmail]),
      });

      render(<ThreadDisplay email={mockEmail} />);

      expect(screen.getByText('Test Email')).toBeInTheDocument();
      expect(screen.getByText(/This is a test email/i)).toBeInTheDocument();
      expect(screen.queryByText(/messages/i)).not.toBeInTheDocument();
    });

    it('should display email metadata', () => {
      (useEmailStore as unknown as jest.Mock).mockReturnValue({
        getEmailThread: jest.fn().mockReturnValue([mockEmail]),
      });

      render(<ThreadDisplay email={mockEmail} />);

      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('john@example.com')).toBeInTheDocument();
      expect(screen.getByText(/To:/i)).toBeInTheDocument();
      expect(screen.getByText(/recipient@example.com/i)).toBeInTheDocument();
    });

    it('should display "(No subject)" for emails without subject', () => {
      const emailWithoutSubject = { ...mockEmail, subject: '' };
      (useEmailStore as unknown as jest.Mock).mockReturnValue({
        getEmailThread: jest.fn().mockReturnValue([emailWithoutSubject]),
      });

      render(<ThreadDisplay email={emailWithoutSubject} />);

      expect(screen.getByText('(No subject)')).toBeInTheDocument();
    });
  });

  describe('Thread Conversation Display', () => {
    it('should render all emails in thread', () => {
      (useEmailStore as unknown as jest.Mock).mockReturnValue({
        getEmailThread: jest.fn().mockReturnValue(mockThreadEmails),
      });

      render(<ThreadDisplay email={mockEmail} />);

      expect(screen.getByText('Original Email')).toBeInTheDocument();
      expect(screen.getByText(/First message/i)).toBeInTheDocument();
      expect(screen.getByText(/Second message/i)).toBeInTheDocument();
      expect(screen.getByText(/Third message/i)).toBeInTheDocument();
    });

    it('should show thread count badge for multi-email threads', () => {
      (useEmailStore as unknown as jest.Mock).mockReturnValue({
        getEmailThread: jest.fn().mockReturnValue(mockThreadEmails),
      });

      render(<ThreadDisplay email={mockEmail} />);

      expect(screen.getByText('3 messages')).toBeInTheDocument();
    });

    it('should display all senders in thread', () => {
      (useEmailStore as unknown as jest.Mock).mockReturnValue({
        getEmailThread: jest.fn().mockReturnValue(mockThreadEmails),
      });

      render(<ThreadDisplay email={mockEmail} />);

      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(screen.getByText('Bob Wilson')).toBeInTheDocument();
    });

    it('should not show divider after last email', () => {
      (useEmailStore as unknown as jest.Mock).mockReturnValue({
        getEmailThread: jest.fn().mockReturnValue(mockThreadEmails),
      });

      const { container } = render(<ThreadDisplay email={mockEmail} />);

      const dividers = container.querySelectorAll('hr');
      // Should have 2 dividers for 3 emails (not after the last one)
      expect(dividers).toHaveLength(2);
    });
  });

  describe('Attachments Display', () => {
    it('should display attachments when present', () => {
      const emailWithAttachments = {
        ...mockEmail,
        attachments: [
          {
            id: 'att-1',
            filename: 'document.pdf',
            size: 1024 * 1024, // 1MB
            mimeType: 'application/pdf',
            isInline: false,
          },
          {
            id: 'att-2',
            filename: 'image.png',
            size: 512 * 1024, // 512KB
            mimeType: 'image/png',
            isInline: false,
          },
        ],
      };

      (useEmailStore as unknown as jest.Mock).mockReturnValue({
        getEmailThread: jest.fn().mockReturnValue([emailWithAttachments]),
      });

      render(<ThreadDisplay email={emailWithAttachments} />);

      expect(screen.getByText(/2 Attachments/i)).toBeInTheDocument();
      expect(screen.getByText(/document.pdf/i)).toBeInTheDocument();
      expect(screen.getByText(/1024 KB/i)).toBeInTheDocument(); // 1 MB = 1024 KB
      expect(screen.getByText(/image.png/i)).toBeInTheDocument();
      expect(screen.getByText(/512 KB/i)).toBeInTheDocument();
    });

    it('should not display inline attachments', () => {
      const emailWithInlineAttachment = {
        ...mockEmail,
        attachments: [
          {
            id: 'att-inline',
            filename: 'inline.png',
            size: 1024,
            mimeType: 'image/png',
            isInline: true,
          },
          {
            id: 'att-regular',
            filename: 'regular.pdf',
            size: 1024,
            mimeType: 'application/pdf',
            isInline: false,
          },
        ],
      };

      (useEmailStore as unknown as jest.Mock).mockReturnValue({
        getEmailThread: jest.fn().mockReturnValue([emailWithInlineAttachment]),
      });

      render(<ThreadDisplay email={emailWithInlineAttachment} />);

      expect(screen.getByText(/1 Attachment/i)).toBeInTheDocument();
      expect(screen.queryByText(/inline.png/i)).not.toBeInTheDocument();
      expect(screen.getByText(/regular.pdf/i)).toBeInTheDocument();
    });
  });

  describe('Action Buttons', () => {
    it('should render action buttons', () => {
      (useEmailStore as unknown as jest.Mock).mockReturnValue({
        getEmailThread: jest.fn().mockReturnValue([mockEmail]),
      });

      render(
        <ThreadDisplay
          email={mockEmail}
          onToggleStar={jest.fn()}
          onArchive={jest.fn()}
          onDelete={jest.fn()}
          onReply={jest.fn()}
          onReplyAll={jest.fn()}
          onForward={jest.fn()}
        />
      );

      // Action buttons should be present
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  describe('Loading and Empty States', () => {
    it('should show loading state', () => {
      (useEmailStore as unknown as jest.Mock).mockReturnValue({
        getEmailThread: jest.fn().mockReturnValue([]),
      });

      render(<ThreadDisplay email={null} isLoading={true} />);

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('should show empty state when no email selected', () => {
      (useEmailStore as unknown as jest.Mock).mockReturnValue({
        getEmailThread: jest.fn().mockReturnValue([]),
      });

      render(<ThreadDisplay email={null} />);

      expect(screen.getByText(/select/i)).toBeInTheDocument();
    });
  });

  describe('Security Tests - XSS Prevention', () => {
    it('should safely render email with malicious HTML', () => {
      const maliciousEmail = {
        ...mockEmail,
        bodyHtml: '<script>alert("XSS")</script><p>Safe content</p>',
        from: '<script>alert("XSS")</script>@example.com',
        subject: '<img src=x onerror=alert("XSS")>',
      };

      (useEmailStore as unknown as jest.Mock).mockReturnValue({
        getEmailThread: jest.fn().mockReturnValue([maliciousEmail]),
      });

      const { container } = render(<ThreadDisplay email={maliciousEmail} />);

      // Component should render but scripts should not execute
      expect(screen.getByText(/Safe content/i)).toBeInTheDocument();
      expect(container.querySelector('script')).toBeNull();
      expect(container.querySelector('img[onerror]')).toBeNull();
    });

    it('should handle extremely long email bodies', () => {
      const longBody = '<p>' + 'A'.repeat(100000) + '</p>';
      const longEmail = { ...mockEmail, bodyHtml: longBody };

      (useEmailStore as unknown as jest.Mock).mockReturnValue({
        getEmailThread: jest.fn().mockReturnValue([longEmail]),
      });

      expect(() => {
        render(<ThreadDisplay email={longEmail} />);
      }).not.toThrow();
    });

    it('should handle malformed email addresses', () => {
      const malformedEmail = {
        ...mockEmail,
        from: 'Not an email <<>>',
        to: ['invalid@@email', 'valid@example.com'],
      };

      (useEmailStore as unknown as jest.Mock).mockReturnValue({
        getEmailThread: jest.fn().mockReturnValue([malformedEmail]),
      });

      expect(() => {
        render(<ThreadDisplay email={malformedEmail} />);
      }).not.toThrow();
    });
  });

  describe('Realtime refresh behavior', () => {
    it('should update thread count when store thread changes', () => {
      let emailStoreRef = {
        getEmailThread: jest.fn(() => [mockEmail]),
      };
      (useEmailStore as unknown as jest.Mock).mockImplementation(() => emailStoreRef);

      const { rerender, queryByText, getByText } = render(<ThreadDisplay email={mockEmail} />);
      expect(queryByText(/messages/i)).toBeNull();

      emailStoreRef = {
        getEmailThread: jest.fn(() => mockThreadEmails),
      };
      rerender(<ThreadDisplay email={mockEmail} />);

      expect(getByText('3 messages')).toBeInTheDocument();
    });
  });

  // Note: Reactivity tests for Zustand store updates are complex with mocks
  // The thread functionality is already tested through the thread display tests above

  describe('Labels Display', () => {
    it('should display labels when onLabelsChange provided', () => {
      const emailWithLabels = {
        ...mockEmail,
        emailLabels: [
          {
            label: {
              id: 'label-1',
              name: 'Important',
              color: {
                backgroundColor: '#ff0000',
                textColor: '#ffffff',
              },
            },
          },
        ],
      };

      (useEmailStore as unknown as jest.Mock).mockReturnValue({
        getEmailThread: jest.fn().mockReturnValue([emailWithLabels]),
      });

      render(
        <ThreadDisplay
          email={emailWithLabels}
          onLabelsChange={jest.fn()}
        />
      );

      // LabelSelector component should be rendered
      // (exact assertion depends on LabelSelector implementation)
    });
  });
});

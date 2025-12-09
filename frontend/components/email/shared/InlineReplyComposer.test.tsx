import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InlineReplyComposer, type InlineReplyComposerProps } from './InlineReplyComposer';

// Mock useTranslations
jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    dashboard: {
      emailView: {
        reply: 'Click to reply',
        replyAll: 'Reply all',
        replyPlaceholder: 'Write your reply...',
      },
      email: {
        composer: {
          send: 'Send',
        },
      },
    },
    email: {
      view: {
        reply: 'Click to reply',
        replyAll: 'Reply all',
        replyPlaceholder: 'Write your reply...',
        openFullEditor: 'Open full editor',
      },
      compose: {
        send: 'Send',
        cancel: 'Cancel',
        discard: 'Discard',
      },
    },
  }),
}));

// Mock useAuthStore
jest.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({
    user: {
      id: 'user-1',
      email: 'user@example.com',
      name: 'Test User',
    },
  }),
}));

describe('InlineReplyComposer', () => {
  const mockReplyTo = {
    id: 'email-1',
    from: 'Sender Name <sender@example.com>',
    to: ['user@example.com'],
    cc: ['cc@example.com'],
    subject: 'Test Subject',
    messageId: '<msg-123@example.com>',
  };

  const mockOnExpand = jest.fn();

  const defaultProps: InlineReplyComposerProps = {
    replyTo: mockReplyTo,
    onExpand: mockOnExpand,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Collapsed State', () => {
    it('should render collapsed by default', () => {
      render(<InlineReplyComposer {...defaultProps} />);

      expect(screen.getByText(/Click to reply/i)).toBeInTheDocument();
    });

    it('should show reply all text when isReplyAll is true', () => {
      render(<InlineReplyComposer {...defaultProps} isReplyAll={true} />);

      expect(screen.getByText(/Reply all/i)).toBeInTheDocument();
    });

    it('should expand when clicked', () => {
      render(<InlineReplyComposer {...defaultProps} />);

      fireEvent.click(screen.getByText(/Click to reply/i));

      expect(screen.getByPlaceholderText('Write your reply...')).toBeInTheDocument();
    });

    it('should render expanded when defaultExpanded is true', () => {
      render(<InlineReplyComposer {...defaultProps} defaultExpanded={true} />);

      expect(screen.getByPlaceholderText('Write your reply...')).toBeInTheDocument();
    });

    it('should call onExpand directly when showQuickReply is false', () => {
      render(<InlineReplyComposer {...defaultProps} showQuickReply={false} />);

      fireEvent.click(screen.getByText(/Click to reply/i));

      expect(mockOnExpand).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ['Sender Name <sender@example.com>'],
          subject: 'Re: Test Subject',
          originalEmailId: 'email-1',
        })
      );
    });
  });

  describe('Expanded State', () => {
    it('should show recipient chip', () => {
      render(<InlineReplyComposer {...defaultProps} defaultExpanded={true} />);

      expect(screen.getByText('Sender Name')).toBeInTheDocument();
    });

    it('should show additional recipients count for reply all', () => {
      const multiRecipient = {
        ...mockReplyTo,
        to: ['user@example.com', 'other@example.com'],
      };
      render(
        <InlineReplyComposer
          {...defaultProps}
          replyTo={multiRecipient}
          isReplyAll={true}
          defaultExpanded={true}
        />
      );

      // Should show +1 for the additional recipient
      expect(screen.getByText('+1')).toBeInTheDocument();
    });

    it('should show expand to full editor button', () => {
      render(<InlineReplyComposer {...defaultProps} defaultExpanded={true} />);

      expect(screen.getByRole('button', { name: /open full editor/i })).toBeInTheDocument();
    });

    it('should show compose button when onSend is not provided', () => {
      render(<InlineReplyComposer {...defaultProps} defaultExpanded={true} />);

      expect(screen.getByRole('button', { name: /compose/i })).toBeInTheDocument();
    });
  });

  describe('With onSend callback', () => {
    it('should show send button when onSend is provided', () => {
      const mockOnSend = jest.fn().mockResolvedValue(undefined);
      render(
        <InlineReplyComposer
          {...defaultProps}
          onSend={mockOnSend}
          defaultExpanded={true}
        />
      );

      expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
    });

    it('should disable send button when body is empty', () => {
      const mockOnSend = jest.fn().mockResolvedValue(undefined);
      render(
        <InlineReplyComposer
          {...defaultProps}
          onSend={mockOnSend}
          defaultExpanded={true}
        />
      );

      const sendButton = screen.getByRole('button', { name: /send/i });
      expect(sendButton).toBeDisabled();
    });

    it('should enable send button when body has content', () => {
      const mockOnSend = jest.fn().mockResolvedValue(undefined);
      render(
        <InlineReplyComposer
          {...defaultProps}
          onSend={mockOnSend}
          defaultExpanded={true}
        />
      );

      const textarea = screen.getByPlaceholderText('Write your reply...');
      fireEvent.change(textarea, { target: { value: 'Test message' } });

      const sendButton = screen.getByRole('button', { name: /send/i });
      expect(sendButton).not.toBeDisabled();
    });

    it('should call onSend with correct data', async () => {
      const mockOnSend = jest.fn().mockResolvedValue(undefined);
      render(
        <InlineReplyComposer
          {...defaultProps}
          onSend={mockOnSend}
          defaultExpanded={true}
        />
      );

      const textarea = screen.getByPlaceholderText('Write your reply...');
      fireEvent.change(textarea, { target: { value: 'Test reply message' } });

      const sendButton = screen.getByRole('button', { name: /send/i });
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(mockOnSend).toHaveBeenCalledWith({
          to: ['Sender Name <sender@example.com>'],
          cc: undefined,
          subject: 'Re: Test Subject',
          body: 'Test reply message',
          inReplyTo: '<msg-123@example.com>',
        });
      });
    });

    it('should include cc recipients when isReplyAll', async () => {
      const mockOnSend = jest.fn().mockResolvedValue(undefined);
      render(
        <InlineReplyComposer
          {...defaultProps}
          onSend={mockOnSend}
          isReplyAll={true}
          defaultExpanded={true}
        />
      );

      const textarea = screen.getByPlaceholderText('Write your reply...');
      fireEvent.change(textarea, { target: { value: 'Test reply' } });

      const sendButton = screen.getByRole('button', { name: /send/i });
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(mockOnSend).toHaveBeenCalledWith(
          expect.objectContaining({
            cc: ['cc@example.com'],
          })
        );
      });
    });

    it('should clear form after successful send', async () => {
      const mockOnSend = jest.fn().mockResolvedValue(undefined);
      render(
        <InlineReplyComposer
          {...defaultProps}
          onSend={mockOnSend}
          defaultExpanded={true}
        />
      );

      const textarea = screen.getByPlaceholderText('Write your reply...');
      fireEvent.change(textarea, { target: { value: 'Test message' } });

      fireEvent.click(screen.getByRole('button', { name: /send/i }));

      // Should collapse after send - verify collapsed state shows
      await waitFor(() => {
        expect(screen.getByText(/Click to reply/i)).toBeInTheDocument();
      });
    });

    it('should show error message on send failure', async () => {
      const mockOnSend = jest.fn().mockRejectedValue(new Error('Network error'));
      render(
        <InlineReplyComposer
          {...defaultProps}
          onSend={mockOnSend}
          defaultExpanded={true}
        />
      );

      const textarea = screen.getByPlaceholderText('Write your reply...');
      fireEvent.change(textarea, { target: { value: 'Test' } });

      fireEvent.click(screen.getByRole('button', { name: /send/i }));

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });
  });

  describe('Subject Handling', () => {
    it('should not add Re: prefix if subject already has it', () => {
      render(
        <InlineReplyComposer
          {...defaultProps}
          replyTo={{ ...mockReplyTo, subject: 'Re: Already replied' }}
          showQuickReply={false}
        />
      );

      fireEvent.click(screen.getByText(/Click to reply/i));

      expect(mockOnExpand).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Re: Already replied',
        })
      );
    });
  });

  describe('Keyboard Shortcuts', () => {
    it('should send on Ctrl+Enter when onSend is provided', async () => {
      const mockOnSend = jest.fn().mockResolvedValue(undefined);
      render(
        <InlineReplyComposer
          {...defaultProps}
          onSend={mockOnSend}
          defaultExpanded={true}
        />
      );

      const textarea = screen.getByPlaceholderText('Write your reply...');
      fireEvent.change(textarea, { target: { value: 'Test message' } });
      fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

      await waitFor(() => {
        expect(mockOnSend).toHaveBeenCalled();
      });
    });

    it('should expand to dialog on Ctrl+Enter when onSend is not provided', () => {
      render(
        <InlineReplyComposer
          {...defaultProps}
          defaultExpanded={true}
        />
      );

      const textarea = screen.getByPlaceholderText('Write your reply...');
      fireEvent.change(textarea, { target: { value: 'Test message' } });
      fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

      expect(mockOnExpand).toHaveBeenCalledWith(
        expect.objectContaining({
          body: 'Test message',
        })
      );
    });

    it('should collapse on Escape when body is empty', async () => {
      render(<InlineReplyComposer {...defaultProps} defaultExpanded={true} />);

      const textarea = screen.getByPlaceholderText('Write your reply...');
      fireEvent.keyDown(textarea, { key: 'Escape' });

      // Should collapse - verify collapsed state shows again
      await waitFor(() => {
        expect(screen.getByText(/Click to reply/i)).toBeInTheDocument();
      });
    });
  });

  describe('Expand to Full Dialog', () => {
    it('should call onExpand with prefill data when expand button is clicked', () => {
      render(
        <InlineReplyComposer
          {...defaultProps}
          defaultExpanded={true}
        />
      );

      const textarea = screen.getByPlaceholderText('Write your reply...');
      fireEvent.change(textarea, { target: { value: 'Draft content' } });

      const expandButton = screen.getByRole('button', { name: /open full editor/i });
      fireEvent.click(expandButton);

      expect(mockOnExpand).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ['Sender Name <sender@example.com>'],
          subject: 'Re: Test Subject',
          body: 'Draft content',
          inReplyTo: '<msg-123@example.com>',
          originalEmailId: 'email-1',
        })
      );
    });

    it('should clear body and collapse after expanding to dialog', async () => {
      render(
        <InlineReplyComposer
          {...defaultProps}
          defaultExpanded={true}
        />
      );

      const textarea = screen.getByPlaceholderText('Write your reply...');
      fireEvent.change(textarea, { target: { value: 'Draft content' } });

      const expandButton = screen.getByRole('button', { name: /open full editor/i });
      fireEvent.click(expandButton);

      // Should collapse after expand - verify collapsed state shows
      await waitFor(() => {
        expect(screen.getByText(/Click to reply/i)).toBeInTheDocument();
      });
    });
  });

  describe('Custom Placeholder', () => {
    it('should show custom placeholder when provided', () => {
      render(
        <InlineReplyComposer
          {...defaultProps}
          placeholder="Custom placeholder text"
        />
      );

      expect(screen.getByText('Custom placeholder text')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have accessible collapsed button', () => {
      render(<InlineReplyComposer {...defaultProps} />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', 'Click to reply...');
    });

    it('should be keyboard navigable when collapsed', () => {
      render(<InlineReplyComposer {...defaultProps} />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('tabIndex', '0');
    });
  });
});

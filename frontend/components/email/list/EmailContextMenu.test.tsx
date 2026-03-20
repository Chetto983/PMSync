import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import type { ComponentProps } from 'react';
import { EmailContextMenu } from './EmailContextMenu';

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    emailList: {
      keyboard: { openEmail: 'Open email' },
      flagged: 'Flag',
      unflagged: 'Unflag',
      archive: 'Archive',
      moveToFolder: 'Move to folder',
      addLabel: 'Add label',
      delete: 'Delete',
      markAsRead: 'Mark as read',
      markAsUnread: 'Mark as unread',
    },
    threadMessage: {
      reply: 'Reply',
      replyAll: 'Reply all',
      forward: 'Forward',
    },
  }),
}));

function renderMenu(overrides: Partial<ComponentProps<typeof EmailContextMenu>> = {}) {
  const handlers = {
    onClose: jest.fn(),
    onOpen: jest.fn(),
    onReply: jest.fn(),
    onReplyAll: jest.fn(),
    onForward: jest.fn(),
    onFlag: jest.fn(),
    onArchive: jest.fn(),
    onMove: jest.fn(),
    onLabel: jest.fn(),
    onMarkRead: jest.fn(),
    onMarkUnread: jest.fn(),
    onDelete: jest.fn(),
  };

  render(
    <ThemeProvider theme={createTheme()}>
      <EmailContextMenu
        anchorPosition={{ top: 32, left: 16 }}
        emailId="email-1"
        isRead={false}
        isFlagged={false}
        {...handlers}
        {...overrides}
      />
    </ThemeProvider>,
  );

  return handlers;
}

describe('EmailContextMenu', () => {
  it('renders premium list actions and triggers handlers', () => {
    const handlers = renderMenu();

    fireEvent.click(screen.getByText('Reply'));
    expect(handlers.onClose).toHaveBeenCalled();
    expect(handlers.onReply).toHaveBeenCalledWith('email-1');
  });

  it('shows read action for unread emails', () => {
    renderMenu({ isRead: false });
    expect(screen.getByText('Mark as read')).toBeInTheDocument();
  });

  it('shows unread action for read emails', () => {
    renderMenu({ isRead: true });
    expect(screen.getByText('Mark as unread')).toBeInTheDocument();
  });
});

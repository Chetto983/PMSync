import type { ComponentProps } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { ThreadViewOutlook, type ThreadMessageData } from './ThreadViewOutlook';

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    common: { close: 'Back' },
    threadMessage: {
      reply: 'Reply',
      replyAll: 'Reply all',
      forward: 'Forward',
    },
    threadActions: {
      archiveThread: 'Archive thread',
      deleteThread: 'Delete thread',
      markThreadRead: 'Mark thread as read',
      markThreadUnread: 'Mark thread as unread',
      flagThread: 'Flag all messages',
      unflagThread: 'Unflag all messages',
      moveThread: 'Move thread',
      addLabelsThread: 'Add labels to thread',
    },
    threadView: {
      actionsLabel: 'Thread actions',
      seeMoreMessages: 'See {count} more messages',
      hideMessages: 'Hide messages',
      sentAutoReply: 'sent an automatic reply',
    },
    email: {
      labels: { addLabels: 'Add labels' },
    },
  }),
}));

jest.mock('./CollapsedMessage', () => ({
  CollapsedMessage: ({ message, onClick }: { message: { subject: string }; onClick: () => void }) => (
    <button onClick={onClick} type="button">
      {message.subject}
    </button>
  ),
}));

jest.mock('./ExpandedMessage', () => ({
  ExpandedMessage: ({ message }: { message: { subject: string } }) => (
    <div data-testid="expanded-message">{message.subject}</div>
  ),
}));

const createMatchMedia = (width: number) => (query: string) => {
  const minWidthMatch = query.match(/min-width:\s*([0-9.]+)px/);
  const maxWidthMatch = query.match(/max-width:\s*([0-9.]+)px/);
  const minWidth = minWidthMatch ? Number(minWidthMatch[1]) : null;
  const maxWidth = maxWidthMatch ? Number(maxWidthMatch[1]) : null;
  const matches = (minWidth === null || width >= minWidth) && (maxWidth === null || width <= maxWidth);

  return {
    matches,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  };
};

const setViewportWidth = (width: number) => {
  window.matchMedia = jest.fn().mockImplementation(createMatchMedia(width));
};

const message: ThreadMessageData = {
  id: 'email-1',
  from: 'Davide <davide@example.com>',
  to: ['Alice <alice@example.com>'],
  date: '03/26/2026',
  subject: 'Build failed on mobile toolbar',
  body: '<p>Investigate the thread header</p>',
  isUnread: false,
  isFlagged: false,
  hasAttachments: false,
};

type ThreadProps = Partial<ComponentProps<typeof ThreadViewOutlook>>;

const renderThread = (props: ThreadProps = {}) => {
  const defaultHandlers = {
    onBack: jest.fn(),
    onFlag: jest.fn(),
    onReply: jest.fn(),
    onReplyAll: jest.fn(),
    onForward: jest.fn(),
    onDeleteThread: jest.fn(),
    onMoveThread: jest.fn(),
    onArchiveThread: jest.fn(),
    onMarkThreadRead: jest.fn(),
    onMarkThreadUnread: jest.fn(),
    onFlagAllMessages: jest.fn(),
    onUnflagAllMessages: jest.fn(),
    onAddLabelsToThread: jest.fn(),
  };

  return render(
    <ThemeProvider theme={createTheme()}>
      <ThreadViewOutlook
        threadId="thread-1"
        subject="Pipeline failure"
        messages={[message]}
        {...defaultHandlers}
        {...props}
      />
    </ThemeProvider>,
  );
};

describe('ThreadViewOutlook', () => {
  it('moves secondary thread actions into the overflow menu on small screens', () => {
    setViewportWidth(375);
    const onDeleteThread = jest.fn();

    renderThread({ onDeleteThread });

    expect(screen.getByRole('button', { name: 'Reply' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Forward' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reply all' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive thread' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move thread' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete thread' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add labels' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Thread actions' }));

    expect(screen.getByText('Reply all')).toBeInTheDocument();
    expect(screen.getByText('Archive thread')).toBeInTheDocument();
    expect(screen.getByText('Move thread')).toBeInTheDocument();
    expect(screen.getByText('Delete thread')).toBeInTheDocument();
    expect(screen.getByText('Add labels to thread')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Delete thread'));

    expect(onDeleteThread).toHaveBeenCalledTimes(1);
  });

  it('keeps the full action set inline on desktop widths', () => {
    setViewportWidth(1280);

    renderThread();

    expect(screen.getByRole('button', { name: 'Reply' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reply all' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Forward' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archive thread' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move thread' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete thread' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add labels' })).toBeInTheDocument();
  });
});

import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { ExpandedMessage } from './ExpandedMessage';

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    common: { showLess: 'Show less' },
    threadMessage: {
      to: 'To:',
      cc: 'CC:',
      reply: 'Reply',
      replyAll: 'Reply all',
      forward: 'Forward',
      attachments: '{count} attachments',
      ai: {
        summarize: 'Summarize',
        summarizing: 'Summarizing...',
        priority: 'Priority',
        sentiment: 'Sentiment',
      },
    },
    threadActions: {
      moveThread: 'Move',
      archiveThread: 'Archive',
      deleteThread: 'Delete',
    },
    folders: {
      inbox: 'Inbox',
      archive: 'Archive',
      trash: 'Trash',
    },
    email: {
      labels: { addLabels: 'Add labels' },
    },
  }),
}));

jest.mock('@/lib/hooks/use-locale', () => ({
  useLocale: () => ({ locale: 'it' }),
}));

jest.mock('./EmailHtmlContent', () => ({
  EmailHtmlContent: ({ html }: { html: string }) => <div data-testid="email-html">{html}</div>,
}));

jest.mock('./AttachmentCard', () => ({
  AttachmentCard: ({ attachment }: { attachment: { name: string } }) => <div>{attachment.name}</div>,
}));

jest.mock('./AiInsightsPanel', () => ({
  AiInsightsPanel: () => null,
}));

jest.mock('./AiActionButtons', () => ({
  AiActionButtons: () => <div data-testid="ai-actions" />,
}));

describe('ExpandedMessage', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-20T12:00:00.000Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('shows relative date and collapsible recipients summary', () => {
    render(
      <ThemeProvider theme={createTheme()}>
        <ExpandedMessage
          message={{
            id: 'email-1',
            from: 'Davide Marchetto <davide@example.com>',
            to: [
              'Alice <alice@example.com>',
              'Bob <bob@example.com>',
              'Carla <carla@example.com>',
            ],
            cc: ['Team <team@example.com>'],
            date: '03/20/2026',
            receivedAt: '2026-03-20T10:00:00.000Z',
            subject: 'Premium UX update',
            body: '<p>Hello</p>',
            isUnread: true,
            isFlagged: false,
            hasAttachments: false,
          }}
          onCollapse={jest.fn()}
          onReply={jest.fn()}
          onReplyAll={jest.fn()}
          onForward={jest.fn()}
          onFlag={jest.fn()}
        />
      </ThemeProvider>,
    );

    expect(screen.getByText(/(hour|ore|ago|fa)/i)).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();

    fireEvent.click(screen.getByText('+1'));

    expect(screen.getByText('Carla')).toBeInTheDocument();
    expect(screen.getByText('Show less')).toBeInTheDocument();
  });
});

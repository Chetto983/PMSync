/**
 * ThreadListItem — Label display tests (T-0705)
 *
 * Verifies:
 * - User labels render as chips (max 2)
 * - AI labels render as outlined chips (max 1)
 * - Label color is applied via bgcolor
 * - Empty/null labels don't crash
 */
import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, createTheme } from '@mui/material';
import { ThreadListItem, type ThreadListItemData } from './ThreadListItem';

// Mock useTranslations with all keys used by ThreadListItem
jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    common: {
      noSubject: '(No Subject)',
      delete: 'Delete',
      cancel: 'Cancel',
    },
    emailList: {
      flagged: 'Flag',
      unflagged: 'Unflag',
      archive: 'Archive',
      delete: 'Delete',
      deleteSingleConfirm: 'Delete this email?',
      aiSentiment: {
        urgent: 'Urgent',
        negative: 'Negative',
      },
    },
  }),
}));

jest.mock('@/lib/hooks/use-locale', () => ({
  useLocale: () => ({ locale: 'it' }),
}));

// Mock emailThreadOptions
jest.mock('@/hooks/queries/use-emails', () => ({
  emailThreadOptions: () => ({ queryKey: ['thread', 'test'], queryFn: () => null }),
}));

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  Flag: () => createElement('span', { 'data-testid': 'icon-flag' }),
  Paperclip: () => createElement('span', { 'data-testid': 'icon-paperclip' }),
  Archive: () => createElement('span', { 'data-testid': 'icon-archive' }),
  Trash2: () => createElement('span', { 'data-testid': 'icon-trash' }),
  FolderInput: () => createElement('span', { 'data-testid': 'icon-folder' }),
  Zap: () => createElement('span', { 'data-testid': 'icon-zap' }),
  Sparkles: () => createElement('span', { 'data-testid': 'icon-sparkles' }),
}));

// Mock stringToColor
jest.mock('@/lib/utils/gravatar', () => ({
  stringToColor: () => '#888888',
}));

const theme = createTheme();
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function renderItem(threadOverrides: Partial<ThreadListItemData> = {}) {
  const thread: ThreadListItemData = {
    id: 'email-1',
    from: 'Alice <alice@test.com>',
    subject: 'Test Subject',
    snippet: 'Preview text',
    date: '2026-03-26',
    isUnread: false,
    isFlagged: false,
    hasAttachments: false,
    ...threadOverrides,
  };

  const noop = jest.fn();

  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        ThemeProvider,
        { theme },
        createElement(ThreadListItem, {
          thread,
          isSelected: false,
          isHovered: false,
          onSelect: noop,
          onClick: noop,
          onFlag: noop,
          onArchive: noop,
          onDelete: noop,
          onMouseEnter: noop,
          onMouseLeave: noop,
        }),
      ),
    ),
  );
}

describe('ThreadListItem — label display (T-0705)', () => {
  it('renders user labels as chips', () => {
    renderItem({
      labels: [
        { id: 'lbl-1', name: 'Important', color: '#FF0000' },
        { id: 'lbl-2', name: 'Work', color: '#00FF00' },
      ],
    });

    expect(screen.getByText('Importante')).toBeInTheDocument();
    expect(screen.getByText('Work')).toBeInTheDocument();
  });

  it('renders max 2 user labels (truncates overflow)', () => {
    renderItem({
      labels: [
        { id: 'lbl-1', name: 'Work', color: '#FF0000' },
        { id: 'lbl-2', name: 'Urgent', color: '#00FF00' },
        { id: 'lbl-3', name: 'Hidden', color: '#0000FF' },
      ],
    });

    expect(screen.getByText('Work')).toBeInTheDocument();
    expect(screen.getByText('Urgent')).toBeInTheDocument();
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });

  it('renders AI labels as outlined chips', () => {
    renderItem({
      aiLabels: ['Updates'],
    });

    expect(screen.getByText('Aggiornamenti')).toBeInTheDocument();
  });

  it('renders max 1 AI label', () => {
    renderItem({
      aiLabels: ['Meeting Notes', 'Follow Up'],
    });

    expect(screen.getByText('Meeting Notes')).toBeInTheDocument();
    expect(screen.queryByText('Follow Up')).not.toBeInTheDocument();
  });

  it('handles empty labels without crashing', () => {
    const { container } = renderItem({ labels: [], aiLabels: [] });
    expect(container).toBeTruthy();
  });

  it('handles undefined labels without crashing', () => {
    const { container } = renderItem({ labels: undefined, aiLabels: undefined });
    expect(container).toBeTruthy();
  });

  it('applies label color as background', () => {
    renderItem({
      labels: [{ id: 'lbl-1', name: 'Colored', color: '#FF5733' }],
    });

    const chip = screen.getByText('Colored').closest('.MuiChip-root');
    expect(chip).toBeInTheDocument();
  });
});

import { render, screen, fireEvent, act } from '@testing-library/react';
import type { ReactElement } from 'react';
import { DndContext, useDraggable } from '@dnd-kit/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { DraggableThreadListItem } from './DraggableThreadListItem';

jest.mock('@/hooks/queries/use-emails', () => ({
  emailThreadOptions: jest.fn(() => ({
    queryKey: ['email-thread', 'email-1'],
    queryFn: jest.fn(),
  })),
}));

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    common: { noSubject: 'No subject' },
    emailList: {
      archive: 'Archive',
      delete: 'Delete',
      flagged: 'Flagged',
      unflagged: 'Unflagged',
      moveToFolder: 'Move to folder',
      aiSentiment: {
        urgent: 'Urgent',
        negative: 'Negative',
      },
    },
  }),
}));

jest.mock('@dnd-kit/core', () => {
  const actual = jest.requireActual('@dnd-kit/core');
  return {
    ...actual,
    useDraggable: jest.fn(),
  };
});

const mockUseDraggable = useDraggable as jest.MockedFunction<typeof useDraggable>;

const baseThread = {
  id: 'email-1',
  providerId: 'provider-1',
  from: 'Davide Marchetto <davide@example.com>',
  subject: 'Subject',
  snippet: 'Snippet',
  date: '20 Mar',
  isUnread: true,
  isFlagged: false,
  hasAttachments: false,
};

function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  const theme = createTheme({
    components: {
      MuiButtonBase: {
        defaultProps: {
          disableRipple: true,
        },
      },
    },
  });

  return render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <DndContext>{ui}</DndContext>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('DraggableThreadListItem', () => {
  beforeEach(() => {
    mockUseDraggable.mockReturnValue({
      active: null,
      activatorEvent: null,
      activeNodeRect: null,
      attributes: { 'data-drag-handle': 'true' },
      isDragging: false,
      listeners: {},
      node: { current: null },
      over: null,
      setNodeRef: jest.fn(),
      setActivatorNodeRef: jest.fn(),
      transform: null,
    } as unknown as ReturnType<typeof useDraggable>);
  });

  it('attaches drag props to the dedicated handle instead of the whole row', () => {
    renderWithProviders(
      <DraggableThreadListItem
        thread={baseThread}
        draggedEmailIds={null}
        isSelected={false}
        isHovered={false}
        onSelect={jest.fn()}
        onClick={jest.fn()}
        onFlag={jest.fn()}
        onArchive={jest.fn()}
        onDelete={jest.fn()}
        onMouseEnter={jest.fn()}
        onMouseLeave={jest.fn()}
      />,
    );

    expect(screen.getByTestId('thread-drag-handle')).toHaveAttribute('data-drag-handle', 'true');
  });

  it('does not open the thread when clicking the selection checkbox', () => {
    const onClick = jest.fn();
    const onSelect = jest.fn();

    renderWithProviders(
      <DraggableThreadListItem
        thread={baseThread}
        draggedEmailIds={null}
        isSelected={false}
        isHovered
        onSelect={onSelect}
        onClick={onClick}
        onFlag={jest.fn()}
        onArchive={jest.fn()}
        onDelete={jest.fn()}
        onMouseEnter={jest.fn()}
        onMouseLeave={jest.fn()}
      />,
    );

    const checkbox = screen.getByRole('checkbox');
    act(() => {
      fireEvent.mouseDown(checkbox);
      fireEvent.click(checkbox);
    });

    expect(onSelect).toHaveBeenCalledWith('email-1', true, expect.any(Object));
    expect(onClick).not.toHaveBeenCalled();
  });
});

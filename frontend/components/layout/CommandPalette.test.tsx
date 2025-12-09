import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { CommandPalette, useCommandPalette } from './CommandPalette';

// Mock useRouter
const mockPush = jest.fn();
jest.mock('next/router', () => ({
  useRouter: () => ({
    push: mockPush,
    pathname: '/dashboard',
  }),
}));

// Mock useTranslations
jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    nav: {
      calendar: 'Calendar',
      contacts: 'Contacts',
      settings: 'Settings',
    },
    dashboard: {
      folders: {
        inbox: 'Inbox',
        sent: 'Sent',
        drafts: 'Drafts',
        archive: 'Archive',
        trash: 'Trash',
        starred: 'Starred',
      },
      email: {
        advancedSearch: {
          title: 'Advanced Search',
        },
      },
      labels: {
        manageLabels: 'Manage Labels',
      },
    },
    ai: {
      title: 'AI Assistant',
    },
    common: {
      compose: 'Compose',
    },
    email: {
      labels: {
        manageLabels: 'Manage labels',
      },
      advancedSearch: {
        title: 'Advanced Search',
      },
    },
    commandPalette: {
      searchPlaceholder: 'Search emails, navigate, or run commands...',
      navigation: 'Navigation',
      actions: 'Actions',
      recentSearches: 'Recent Searches',
      emailResults: 'Email Results',
      noResults: 'No results found',
      pressEnterToSearch: 'Press Enter to search all emails',
      navigate: 'Navigate',
      select: 'Select',
    },
  }),
}));

// Mock emailApi
jest.mock('@/lib/api/email', () => ({
  emailApi: {
    listEmails: jest.fn().mockResolvedValue({
      data: {
        emails: [
          {
            id: 'email-1',
            subject: 'Test Email Subject',
            from: 'sender@example.com',
          },
          {
            id: 'email-2',
            subject: 'Another Email',
            from: 'another@example.com',
          },
        ],
      },
    }),
  },
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('CommandPalette', () => {
  const defaultProps = {
    open: true,
    onClose: jest.fn(),
    onCompose: jest.fn(),
    onAdvancedSearch: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();
  });

  describe('Rendering', () => {
    it('should render when open', () => {
      render(<CommandPalette {...defaultProps} />);

      expect(
        screen.getByPlaceholderText('Search emails, navigate, or run commands...')
      ).toBeInTheDocument();
    });

    it('should not render content when closed', () => {
      render(<CommandPalette {...defaultProps} open={false} />);

      expect(
        screen.queryByPlaceholderText('Search emails, navigate, or run commands...')
      ).not.toBeInTheDocument();
    });

    it('should show navigation commands by default', () => {
      render(<CommandPalette {...defaultProps} />);

      // First 5 navigation items are shown by default
      expect(screen.getByText('Inbox')).toBeInTheDocument();
      expect(screen.getByText('Sent')).toBeInTheDocument();
      expect(screen.getByText('Drafts')).toBeInTheDocument();
    });

    it('should show action commands', () => {
      render(<CommandPalette {...defaultProps} />);

      expect(screen.getByText('Compose')).toBeInTheDocument();
      expect(screen.getByText('Advanced Search')).toBeInTheDocument();
    });

    it('should show keyboard hints in footer', () => {
      render(<CommandPalette {...defaultProps} />);

      expect(screen.getByText('Navigate')).toBeInTheDocument();
      expect(screen.getByText('Select')).toBeInTheDocument();
    });
  });

  describe('Search Functionality', () => {
    it('should filter commands when typing', async () => {
      render(<CommandPalette {...defaultProps} />);

      const input = screen.getByPlaceholderText('Search emails, navigate, or run commands...');
      fireEvent.change(input, { target: { value: 'Cal' } });

      // Should show Calendar, not other items
      expect(screen.getByText('Calendar')).toBeInTheDocument();
    });

    it('should show no results message when no matches', async () => {
      render(<CommandPalette {...defaultProps} />);

      const input = screen.getByPlaceholderText('Search emails, navigate, or run commands...');
      fireEvent.change(input, { target: { value: 'xyznonexistent' } });

      await waitFor(() => {
        expect(screen.getByText('No results found')).toBeInTheDocument();
      });
    });

    it('should search emails when query is longer than 2 characters', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { emailApi } = require('@/lib/api/email');
      render(<CommandPalette {...defaultProps} />);

      const input = screen.getByPlaceholderText('Search emails, navigate, or run commands...');
      fireEvent.change(input, { target: { value: 'test email' } });

      await waitFor(() => {
        expect(emailApi.listEmails).toHaveBeenCalledWith({
          search: 'test email',
          limit: 5,
        });
      });
    });
  });

  describe('Navigation', () => {
    it('should navigate when clicking on navigation item', async () => {
      render(<CommandPalette {...defaultProps} />);

      const inboxItem = screen.getByText('Inbox');
      fireEvent.click(inboxItem);

      expect(mockPush).toHaveBeenCalledWith('/dashboard/email');
      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('should navigate to calendar when searched', async () => {
      render(<CommandPalette {...defaultProps} />);

      // Calendar is not in the first 5 items, need to search
      const input = screen.getByPlaceholderText('Search emails, navigate, or run commands...');
      fireEvent.change(input, { target: { value: 'Calendar' } });

      await waitFor(() => {
        expect(screen.getByText('Calendar')).toBeInTheDocument();
      });

      const calendarItem = screen.getByText('Calendar');
      fireEvent.click(calendarItem);

      expect(mockPush).toHaveBeenCalledWith('/dashboard/calendar');
    });

    it('should navigate to contacts when searched', async () => {
      render(<CommandPalette {...defaultProps} />);

      // Contacts is not in the first 5 items, need to search
      const input = screen.getByPlaceholderText('Search emails, navigate, or run commands...');
      fireEvent.change(input, { target: { value: 'Contacts' } });

      await waitFor(() => {
        expect(screen.getByText('Contacts')).toBeInTheDocument();
      });

      const contactsItem = screen.getByText('Contacts');
      fireEvent.click(contactsItem);

      expect(mockPush).toHaveBeenCalledWith('/dashboard/contacts');
    });
  });

  describe('Actions', () => {
    it('should call onCompose when clicking compose action', async () => {
      render(<CommandPalette {...defaultProps} />);

      const composeItem = screen.getByText('Compose');
      fireEvent.click(composeItem);

      expect(defaultProps.onCompose).toHaveBeenCalled();
      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('should call onAdvancedSearch when clicking search action', async () => {
      render(<CommandPalette {...defaultProps} />);

      const searchItem = screen.getByText('Advanced Search');
      fireEvent.click(searchItem);

      expect(defaultProps.onAdvancedSearch).toHaveBeenCalled();
      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });

  describe('Keyboard Navigation', () => {
    it('should close on Escape key', async () => {
      render(<CommandPalette {...defaultProps} />);

      const input = screen.getByPlaceholderText('Search emails, navigate, or run commands...');
      fireEvent.keyDown(input, { key: 'Escape' });

      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('should navigate with arrow keys', async () => {
      render(<CommandPalette {...defaultProps} />);

      const input = screen.getByPlaceholderText('Search emails, navigate, or run commands...');

      // First item is an action (Compose), navigate to second item (Advanced Search)
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'ArrowDown' });

      // Navigate to a navigation item (after actions and recent searches)
      fireEvent.keyDown(input, { key: 'ArrowDown' });

      // Press Enter to select - this should navigate
      fireEvent.keyDown(input, { key: 'Enter' });

      // Should call either onClose (for actions) or mockPush (for navigation)
      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('should search emails on Enter when has query but no selection', async () => {
      render(<CommandPalette {...defaultProps} />);

      const input = screen.getByPlaceholderText('Search emails, navigate, or run commands...');

      // Type a query that doesn't match any commands
      fireEvent.change(input, { target: { value: 'xyznonexistent' } });

      await waitFor(() => {
        // Wait for no results state
        expect(screen.getByText('No results found')).toBeInTheDocument();
      });

      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          expect.stringContaining('/dashboard/email?search=xyznonexistent')
        );
      });
    });
  });

  describe('Recent Searches', () => {
    it('should save recent searches to localStorage', async () => {
      render(<CommandPalette {...defaultProps} />);

      const input = screen.getByPlaceholderText('Search emails, navigate, or run commands...');

      // Type a search that doesn't match any commands
      fireEvent.change(input, { target: { value: 'uniquesearchterm' } });

      await waitFor(() => {
        // Wait for no results to appear (means no commands match)
        expect(screen.getByText('No results found')).toBeInTheDocument();
      });

      // Press Enter to search - this triggers saveRecentSearch
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        const stored = localStorageMock.getItem('command-palette-recent-searches');
        expect(stored).toContain('uniquesearchterm');
      });
    });

    it('should load recent searches from localStorage', async () => {
      localStorageMock.setItem(
        'command-palette-recent-searches',
        JSON.stringify(['previous search'])
      );

      render(<CommandPalette {...defaultProps} />);

      expect(screen.getByText('previous search')).toBeInTheDocument();
    });
  });
});

describe('useCommandPalette hook', () => {
  function TestComponent() {
    const { isOpen, open, close, toggle } = useCommandPalette();
    return (
      <div>
        <span data-testid="status">{isOpen ? 'open' : 'closed'}</span>
        <button onClick={open}>Open</button>
        <button onClick={close}>Close</button>
        <button onClick={toggle}>Toggle</button>
      </div>
    );
  }

  it('should start closed', () => {
    render(<TestComponent />);
    expect(screen.getByTestId('status')).toHaveTextContent('closed');
  });

  it('should open when open is called', async () => {
    render(<TestComponent />);

    fireEvent.click(screen.getByText('Open'));

    expect(screen.getByTestId('status')).toHaveTextContent('open');
  });

  it('should close when close is called', async () => {
    render(<TestComponent />);

    fireEvent.click(screen.getByText('Open'));
    fireEvent.click(screen.getByText('Close'));

    expect(screen.getByTestId('status')).toHaveTextContent('closed');
  });

  it('should toggle when toggle is called', async () => {
    render(<TestComponent />);

    fireEvent.click(screen.getByText('Toggle'));
    expect(screen.getByTestId('status')).toHaveTextContent('open');

    fireEvent.click(screen.getByText('Toggle'));
    expect(screen.getByTestId('status')).toHaveTextContent('closed');
  });

  it('should open on Cmd+K', async () => {
    render(<TestComponent />);

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', metaKey: true })
      );
    });

    expect(screen.getByTestId('status')).toHaveTextContent('open');
  });

  it('should open on Ctrl+K', async () => {
    render(<TestComponent />);

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', ctrlKey: true })
      );
    });

    expect(screen.getByTestId('status')).toHaveTextContent('open');
  });

  it('should toggle on repeated Cmd+K', async () => {
    render(<TestComponent />);

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', metaKey: true })
      );
    });
    expect(screen.getByTestId('status')).toHaveTextContent('open');

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', metaKey: true })
      );
    });
    expect(screen.getByTestId('status')).toHaveTextContent('closed');
  });
});

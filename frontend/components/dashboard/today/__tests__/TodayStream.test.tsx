/**
 * TodayStream RTL spec (145.1-05).
 *
 * Regression-guards:
 *   - WR-03 structural guard: role="list" exists and framer-motion no longer
 *     injects wrappers between role="list" and role="listitem" children.
 *   - Plan 02 Task 4 store rename: the mock exposes only the new selectors
 *     `isToggled` + `toggleStream`. The component consumes the new names
 *     verbatim; legacy selector names are intentionally absent from this file.
 *
 * Mock variable names are prefixed with `mock` to satisfy jest/ts-jest's
 * hoisting rule for out-of-scope references inside `jest.mock(...)` factories.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import type { TodayFeedItem } from '@/lib/api/dashboard';

// Flatten framer-motion so the JSX structure under test is deterministic.
// useReducedMotion is stubbed to return false by default (normal-motion path).
jest.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: new Proxy({}, { get: () => 'div' }),
  useReducedMotion: () => false,
}));

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    dashboard: {
      today: {
        stream: {
          repliesNeeded: 'Replies needed',
          dueToday: 'Due today',
          waitingOnOthers: 'Waiting on others',
          fyi: 'FYI',
        },
      },
    },
  }),
}));

// Store mock exposes the Plan 02 Task 4 renamed selectors `isToggled` +
// `toggleStream`. The `toggledStreams` Set tracks streams flipped from their
// default, not streams currently folded away. The older legacy selector names
// are intentionally absent from this file so any regression reintroducing them
// would fail both the type checker and the mock wiring below.
const mockToggleStream = jest.fn();
let mockIsToggledReturn = false;
jest.mock('@/stores/today-feed-store', () => ({
  useTodayFeedStore: (selector: (s: unknown) => unknown) =>
    selector({
      isToggled: () => mockIsToggledReturn,
      toggleStream: mockToggleStream,
    }),
}));

// Mock TodayRow to avoid pulling in the hooks/toast/store chain.
jest.mock('../TodayRow', () => ({
  TodayRow: ({ item }: { item: TodayFeedItem }) => (
    <div data-testid={`row-${item.id}`}>{item.title}</div>
  ),
}));

import { TodayStream } from '../TodayStream';

const theme = createTheme();
const wrap = (ui: React.ReactElement) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

function mkItem(id: string, title = 'x'): TodayFeedItem {
  return {
    id,
    type: 'email',
    stream: 'replies-needed',
    score: 0,
    title,
    subtitle: null,
    routeUrl: '/',
    rationale: null,
    dueAt: null,
    isOverdue: false,
    emailId: null,
    threadId: null,
    taskSourceType: null,
    taskSourceId: null,
    dealId: null,
    eventId: null,
    canComplete: false,
    canDismiss: true,
    canSnooze: false,
  };
}

beforeEach(() => {
  mockToggleStream.mockClear();
  mockIsToggledReturn = false;
});

describe('TodayStream', () => {
  it('returns null when not loading and items are empty', () => {
    const { container } = wrap(
      <TodayStream name="replies-needed" items={[]} defaultExpanded={true} loading={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders header with translated label and count', () => {
    wrap(
      <TodayStream
        name="replies-needed"
        items={[mkItem('a'), mkItem('b')]}
        defaultExpanded={true}
      />,
    );
    expect(screen.getByText(/Replies needed.*2/)).toBeInTheDocument();
  });

  it('sets aria-expanded to match defaultExpanded when untouched', () => {
    wrap(
      <TodayStream name="replies-needed" items={[mkItem('a')]} defaultExpanded={true} />,
    );
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
  });

  it('flips expanded state on toggle (store callback fires toggleStream)', () => {
    wrap(
      <TodayStream name="replies-needed" items={[mkItem('a')]} defaultExpanded={true} />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(mockToggleStream).toHaveBeenCalledWith('replies-needed');
  });

  it('aria-expanded flips to OPPOSITE of defaultExpanded when store reports isToggled=true', () => {
    mockIsToggledReturn = true;
    wrap(
      <TodayStream name="fyi" items={[mkItem('a')]} defaultExpanded={false} />,
    );
    // FYI default is false; toggled flips it -> true.
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
  });

  it('WR-03 structural guard: role="list" exists and exactly one list wraps the row children', () => {
    wrap(
      <TodayStream
        name="replies-needed"
        items={[mkItem('a'), mkItem('b')]}
        defaultExpanded={true}
      />,
    );
    // role="list" must exist, own the row children, and be present exactly once.
    // In the v2 structure, <Collapse> wraps <Box role="list"> which then wraps
    // <AnimatePresence> — so role="list" is an ANCESTOR of motion children, not
    // a descendant. The framer-motion mock flattens AnimatePresence to a Fragment,
    // so our mocked TodayRow test IDs should be direct-ish descendants of the list.
    const listEl = screen.getByRole('list');
    expect(listEl).toBeInTheDocument();
    expect(document.querySelectorAll('[role="list"]').length).toBe(1);
    // The row children rendered via our mocked TodayRow should live inside the list.
    expect(listEl.querySelector('[data-testid="row-a"]')).toBeInTheDocument();
    expect(listEl.querySelector('[data-testid="row-b"]')).toBeInTheDocument();
  });

  it('renders one TodayRow per item (via mock)', () => {
    wrap(
      <TodayStream
        name="replies-needed"
        items={[mkItem('a'), mkItem('b'), mkItem('c')]}
        defaultExpanded={true}
      />,
    );
    expect(screen.getByTestId('row-a')).toBeInTheDocument();
    expect(screen.getByTestId('row-b')).toBeInTheDocument();
    expect(screen.getByTestId('row-c')).toBeInTheDocument();
  });

  it('supports keyboard activation (Enter toggles)', () => {
    wrap(
      <TodayStream name="replies-needed" items={[mkItem('a')]} defaultExpanded={true} />,
    );
    const header = screen.getByRole('button');
    fireEvent.keyDown(header, { key: 'Enter' });
    expect(mockToggleStream).toHaveBeenCalledWith('replies-needed');
  });

  it('renders loading skeletons when loading=true regardless of items', () => {
    wrap(<TodayStream name="replies-needed" items={[]} defaultExpanded={true} loading={true} />);
    expect(document.querySelectorAll('.MuiSkeleton-root').length).toBeGreaterThanOrEqual(3);
  });
});

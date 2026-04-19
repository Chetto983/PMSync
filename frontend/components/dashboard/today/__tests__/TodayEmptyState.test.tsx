/**
 * TodayEmptyState RTL spec.
 *
 * Verifies the translated empty state copy, decorative icon wrapper, and the
 * quick links that keep the page useful even when the feed is empty.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    dashboard: { today: { empty: { title: 'Inbox zero.', body: 'Take the afternoon off.' } } },
    nav: {
      mail: 'Mail',
      calendar: 'Calendar',
      tasks: 'Tasks',
    },
  }),
}));

import { TodayEmptyState } from '../TodayEmptyState';

const theme = createTheme();
const renderWithTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('TodayEmptyState', () => {
  it('renders title and body from translations', () => {
    renderWithTheme(<TodayEmptyState />);
    expect(screen.getByText('Inbox zero.')).toBeInTheDocument();
    expect(screen.getByText('Take the afternoon off.')).toBeInTheDocument();
  });

  it('contains the decorative icon container with aria-hidden', () => {
    renderWithTheme(<TodayEmptyState />);
    expect(screen.getByTestId('today-empty-icon')).toHaveAttribute('aria-hidden');
  });

  it('renders quick links into the main work pillars', () => {
    renderWithTheme(<TodayEmptyState />);
    expect(screen.getByRole('link', { name: 'Mail' })).toHaveAttribute('href', '/dashboard/email');
    expect(screen.getByRole('link', { name: 'Calendar' })).toHaveAttribute('href', '/dashboard/calendar');
    expect(screen.getByRole('link', { name: 'Tasks' })).toHaveAttribute('href', '/dashboard/tasks');
  });
});

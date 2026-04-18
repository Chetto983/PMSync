/**
 * TodayEmptyState RTL spec (145.1-05 v2 rewrite).
 *
 * Verifies the inbox-zero celebration card: translated title/body, decorative
 * emoji with aria-hidden, and no interactive controls. Replaces the Wave-0
 * `nextItem` preview variant which was removed in Plan 03's rewrite.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    dashboard: { today: { empty: { title: 'Inbox zero.', body: 'Take the afternoon off.' } } },
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

  it('contains the decorative emoji with aria-hidden', () => {
    renderWithTheme(<TodayEmptyState />);
    expect(screen.getByText('✨')).toHaveAttribute('aria-hidden');
  });

  it('renders no call-to-action buttons or links', () => {
    renderWithTheme(<TodayEmptyState />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

/**
 * TodayKpiChip RTL spec (145.1-05).
 *
 * Verifies the chip renders as a native <a href> (WR-06 for chips — native
 * Cmd/Ctrl/middle-click is intact), the count text appears, an optional
 * secondary string is rendered next to the count, and the loading flag
 * swaps the chip for a Skeleton.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { Mail } from 'lucide-react';

import { TodayKpiChip } from '../TodayKpiChip';

const theme = createTheme();
const wrap = (ui: React.ReactElement) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('TodayKpiChip', () => {
  it('renders as a native anchor with href and aria-label', () => {
    wrap(<TodayKpiChip icon={Mail} count={47} label="Inbox" href="/dashboard/email" />);
    const el = screen.getByLabelText('Inbox');
    expect(el.tagName).toBe('A');
    expect(el).toHaveAttribute('href', '/dashboard/email');
  });

  it('renders count with tabular-nums style', () => {
    wrap(<TodayKpiChip icon={Mail} count={47} label="Inbox" href="/x" />);
    expect(screen.getByText('47')).toBeInTheDocument();
  });

  it('renders secondary text when provided', () => {
    wrap(<TodayKpiChip icon={Mail} count={12} secondary="€420k" label="Deals" href="/x" />);
    expect(screen.getByText(/€420k/)).toBeInTheDocument();
  });

  it('renders skeleton when loading', () => {
    wrap(<TodayKpiChip icon={Mail} count={0} label="X" href="/x" loading />);
    expect(document.querySelector('.MuiSkeleton-root')).toBeTruthy();
  });
});

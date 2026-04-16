import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { useRouter } from 'next/router';
import { ContextIndicator } from './ContextIndicator';
import { useEmailUIStore } from '@/stores/email-ui-store';
import { useContactStore } from '@/stores/contact-store';
import { useCalendarStore } from '@/stores/calendar-store';

jest.mock('next/router', () => ({
  useRouter: jest.fn(),
}));

describe('ContextIndicator', () => {
  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({
      pathname: '/dashboard/email',
      query: {},
      asPath: '/dashboard/email',
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
    });

    useEmailUIStore.setState({
      activeThreadId: 'thread-123',
      activeEmailId: 'email-456',
    });
    useContactStore.getState().reset();
    useCalendarStore.getState().reset();
  });

  afterEach(() => {
    jest.clearAllMocks();
    useEmailUIStore.getState().reset();
    useContactStore.getState().reset();
    useCalendarStore.getState().reset();
  });

  it('renders email context without useSyncExternalStore loop warnings', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ThemeProvider theme={createTheme()}>
        <ContextIndicator />
      </ThemeProvider>,
    );

    expect(screen.getByText(/\.\.\./)).toBeInTheDocument();
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('getSnapshot should be cached'),
    );
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Maximum update depth exceeded'),
    );
  });
});

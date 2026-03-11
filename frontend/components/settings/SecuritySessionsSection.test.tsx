import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

jest.mock('@/lib/auth-client', () => ({
  authClient: {
    listSessions: jest.fn(),
    getSession: jest.fn(),
    revokeSession: jest.fn(),
    revokeOtherSessions: jest.fn(),
  },
}));

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    settings: { securityPanel: null },
  }),
}));

const { authClient } = jest.requireMock('@/lib/auth-client') as {
  authClient: jest.Mocked<{
    listSessions: jest.Mock;
    getSession: jest.Mock;
    revokeSession: jest.Mock;
    revokeOtherSessions: jest.Mock;
  }>;
};

import { SecuritySessionsSection } from './SecuritySessionsSection';

const SESSION_DATA = {
  id: 's1',
  token: 'tok-1',
  userAgent: 'Mozilla/5.0 Chrome/100',
  ipAddress: '10.0.0.1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('SecuritySessionsSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authClient.listSessions.mockResolvedValue({ data: [SESSION_DATA] });
    authClient.getSession.mockResolvedValue({ data: { session: { token: 'tok-current' } } });
    authClient.revokeSession.mockResolvedValue({});
    authClient.revokeOtherSessions.mockResolvedValue({});
  });

  it('loads and renders sessions on mount', async () => {
    render(<SecuritySessionsSection />);
    // IP address appears in the session list item secondary text
    await waitFor(() => {
      expect(screen.getByText(/10\.0\.0\.1/)).toBeInTheDocument();
    });
  });

  it('shows error when listSessions fails', async () => {
    authClient.listSessions.mockRejectedValue(new Error('Network'));
    render(<SecuritySessionsSection />);
    await waitFor(() => {
      expect(screen.getByText(/Failed to load sessions/i)).toBeInTheDocument();
    });
  });

  it('calls revokeSession with correct token when revoke button is clicked', async () => {
    render(<SecuritySessionsSection />);
    // Wait for session data to load
    await waitFor(() => {
      expect(authClient.listSessions).toHaveBeenCalled();
      expect(authClient.getSession).toHaveBeenCalled();
    });

    // The session token 'tok-1' differs from current 'tok-current'.
    // The revoke IconButton is a small button with a trash icon — find all buttons and click the icon-only one
    // (the only button shown when there are other sessions is the trash IconButton)
    await waitFor(() => {
      // After loading completes, the trash button should be visible
      const allButtons = screen.getAllByRole('button');
      // The revoke all button is visible ("Revoke all other sessions") and the trash icon button
      const iconButton = allButtons.find(
        (btn) => !btn.textContent || btn.textContent.trim() === ''
      );
      expect(iconButton).toBeDefined();
    });

    const allButtons = screen.getAllByRole('button');
    const iconButton = allButtons.find(
      (btn) => !btn.textContent || btn.textContent.trim() === ''
    );
    if (iconButton) fireEvent.click(iconButton);

    await waitFor(() => {
      expect(authClient.revokeSession).toHaveBeenCalledWith({ token: 'tok-1' });
    });
  });

  it('re-loads sessions after revoking', async () => {
    render(<SecuritySessionsSection />);
    await waitFor(() => {
      expect(authClient.listSessions).toHaveBeenCalled();
      expect(authClient.getSession).toHaveBeenCalled();
    });

    // Click the trash/revoke icon button
    await waitFor(() => {
      const allButtons = screen.getAllByRole('button');
      expect(allButtons.some((btn) => !btn.textContent || btn.textContent.trim() === '')).toBe(true);
    });

    const allButtons = screen.getAllByRole('button');
    const iconButton = allButtons.find(
      (btn) => !btn.textContent || btn.textContent.trim() === ''
    );
    if (iconButton) fireEvent.click(iconButton);

    await waitFor(() => {
      // listSessions called at least twice: initial load + reload after revoke
      expect(authClient.listSessions.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });
});

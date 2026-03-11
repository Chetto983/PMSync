import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

jest.mock('@/lib/auth-client', () => ({
  authClient: {
    listAccounts: jest.fn(),
    linkSocial: jest.fn(),
    unlinkAccount: jest.fn(),
  },
}));

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    settings: { securityPanel: null },
  }),
}));

const { authClient } = jest.requireMock('@/lib/auth-client') as {
  authClient: jest.Mocked<{
    listAccounts: jest.Mock;
    linkSocial: jest.Mock;
    unlinkAccount: jest.Mock;
  }>;
};

import { SecurityAccountsSection } from './SecurityAccountsSection';

describe('SecurityAccountsSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authClient.listAccounts.mockResolvedValue({
      data: [{ accountId: 'acc-google-1', providerId: 'google' }],
    });
    authClient.linkSocial.mockResolvedValue({});
    authClient.unlinkAccount.mockResolvedValue({});
  });

  it('loads and renders linked accounts on mount', async () => {
    render(<SecurityAccountsSection />);
    await waitFor(() => {
      expect(authClient.listAccounts).toHaveBeenCalled();
    });
    // Google is linked — Unlink button should appear
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /unlink/i }).length).toBeGreaterThan(0);
    });
  });

  it('shows link button for unlinked provider', async () => {
    authClient.listAccounts.mockResolvedValue({ data: [] });
    render(<SecurityAccountsSection />);
    await waitFor(() => {
      // Both google and microsoft are unlinked — Link buttons appear
      expect(screen.getAllByRole('button', { name: /^link$/i }).length).toBeGreaterThan(0);
    });
  });

  it('calls authClient.linkSocial when connect button is clicked', async () => {
    authClient.listAccounts.mockResolvedValue({ data: [] });
    render(<SecurityAccountsSection />);
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /^link$/i }).length).toBeGreaterThan(0);
    });

    // Click the first Link button (Google)
    const linkButtons = screen.getAllByRole('button', { name: /^link$/i });
    fireEvent.click(linkButtons[0]);

    await waitFor(() => {
      expect(authClient.linkSocial).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: expect.stringMatching(/google|microsoft/),
          callbackURL: expect.stringContaining('security'),
        })
      );
    });
  });

  it('shows error when listAccounts fails', async () => {
    authClient.listAccounts.mockRejectedValue(new Error('Network'));
    render(<SecurityAccountsSection />);
    await waitFor(() => {
      expect(screen.getByText(/Failed to load accounts/i)).toBeInTheDocument();
    });
  });

  it('shows unlink confirmation dialog when disconnect is clicked', async () => {
    // Google is linked; also add microsoft so canUnlink returns true (needs >0 other methods)
    authClient.listAccounts.mockResolvedValue({
      data: [
        { accountId: 'acc-google-1', providerId: 'google' },
        { accountId: 'acc-ms-1', providerId: 'microsoft' },
      ],
    });
    render(<SecurityAccountsSection />);
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /unlink/i }).length).toBeGreaterThan(0);
    });

    // Click the first Unlink button
    const unlinkButtons = screen.getAllByRole('button', { name: /unlink/i });
    fireEvent.click(unlinkButtons[0]);

    // Confirmation dialog should open
    await waitFor(() => {
      expect(screen.getByText(/unlink this account|are you sure/i)).toBeInTheDocument();
    });
  });
});

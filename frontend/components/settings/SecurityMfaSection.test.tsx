import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) =>
    React.createElement('img', { src, alt }),
}));

jest.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: jest.fn(),
    passkey: {
      listUserPasskeys: jest.fn(),
      addPasskey: jest.fn(),
      deletePasskey: jest.fn(),
    },
    twoFactor: {
      enable: jest.fn(),
      disable: jest.fn(),
      verifyTotp: jest.fn(),
      generateBackupCodes: jest.fn(),
    },
  },
}));

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    settings: { securityPanel: null },
  }),
}));

const { authClient } = jest.requireMock('@/lib/auth-client') as {
  authClient: jest.Mocked<{
    getSession: jest.Mock;
    passkey: {
      listUserPasskeys: jest.Mock;
      addPasskey: jest.Mock;
      deletePasskey: jest.Mock;
    };
    twoFactor: {
      enable: jest.Mock;
      disable: jest.Mock;
      verifyTotp: jest.Mock;
      generateBackupCodes: jest.Mock;
    };
  }>;
};

import { SecurityMfaSection } from './SecurityMfaSection';

describe('SecurityMfaSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authClient.getSession.mockResolvedValue({ data: { user: { twoFactorEnabled: false } } });
    authClient.passkey.listUserPasskeys.mockResolvedValue({ data: [] });
    authClient.passkey.addPasskey.mockResolvedValue({});
    authClient.passkey.deletePasskey.mockResolvedValue({});
    authClient.twoFactor.enable.mockResolvedValue({});
    authClient.twoFactor.disable.mockResolvedValue({});
    authClient.twoFactor.verifyTotp.mockResolvedValue({});
    authClient.twoFactor.generateBackupCodes.mockResolvedValue({});
  });

  it('renders loading skeleton initially then shows content', async () => {
    render(<SecurityMfaSection />);
    // Before data loads the MUI Typography heading is absent (Skeleton shown instead)
    expect(
      screen.queryByText('Two-Factor Authentication')
    ).not.toBeInTheDocument();
    // After load, content appears
    await waitFor(() => {
      expect(authClient.getSession).toHaveBeenCalled();
    });
  });

  it('loads session and passkeys on mount', async () => {
    render(<SecurityMfaSection />);
    await waitFor(() => {
      expect(authClient.getSession).toHaveBeenCalled();
      expect(authClient.passkey.listUserPasskeys).toHaveBeenCalled();
    });
  });

  it('shows passkey list when passkeys exist', async () => {
    authClient.passkey.listUserPasskeys.mockResolvedValue({
      data: [{ id: 'pk-1', name: 'Chrome on Windows', createdAt: '2026-01-01T00:00:00Z' }],
    });
    render(<SecurityMfaSection />);
    await waitFor(() => {
      expect(screen.getByText('Chrome on Windows')).toBeInTheDocument();
    });
  });

  it('calls deletePasskey with correct id after confirming removal', async () => {
    authClient.passkey.listUserPasskeys.mockResolvedValue({
      data: [{ id: 'pk-1', name: 'Chrome on Windows', createdAt: '2026-01-01T00:00:00Z' }],
    });
    authClient.passkey.deletePasskey.mockResolvedValue({});

    render(<SecurityMfaSection />);
    await waitFor(() => {
      expect(screen.getByText('Chrome on Windows')).toBeInTheDocument();
    });

    // Click the trash/remove icon button (tooltip title is "Remove")
    const trashButton = screen.getByRole('button', { name: /remove/i });
    fireEvent.click(trashButton);

    // Confirmation dialog should appear — find the confirm Remove button in the dialog
    const confirmButtons = await screen.findAllByRole('button', { name: /remove/i });
    // The last button is the confirm action in the dialog
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(authClient.passkey.deletePasskey).toHaveBeenCalledWith({ id: 'pk-1' });
    });
  });

  it('shows error when session load fails', async () => {
    authClient.getSession.mockRejectedValue(new Error('Network'));
    render(<SecurityMfaSection />);
    await waitFor(() => {
      expect(
        screen.getByText(/Failed to load security settings/i)
      ).toBeInTheDocument();
    });
  });

  it('opens enable TOTP dialog when Enable button is clicked', async () => {
    render(<SecurityMfaSection />);
    // Wait until data has loaded and Enable button appears
    const enableButton = await screen.findByRole('button', { name: /enable/i });
    fireEvent.click(enableButton);

    // Dialog opens with a password TextField (aria-label or label "Password")
    await waitFor(() => {
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    });
  });
});
